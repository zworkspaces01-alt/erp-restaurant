"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fail, ok, type ActionResult } from "@/types/actions";
import { parseInvoiceImage, parseMultipleInvoiceImages, SAMPLE_DEMO_INVOICES } from "@/lib/ai/invoice-ocr";
import {
  matchInvoiceData,
  normalizeVietnamese,
  computeSimilarity,
  type IngredientMatchCandidate,
  type SupplierMatchCandidate,
} from "@/lib/ai/invoice-matcher";
import { uploadImage } from "@/lib/storage";
import { optimizeImageForOcr } from "@/lib/image-optimizer";
import type { InvoiceOcrReviewData, InvoiceParsedData } from "@/types/restaurant";

export interface ExtractInvoiceResponse {
  reviewData: InvoiceOcrReviewData;
  isMock: boolean;
  modelUsed: string;
}

export interface BatchInvoiceItemResult {
  id: string;
  fileName: string;
  imageUrl: string;
  reviewData: InvoiceOcrReviewData;
  modelUsed: string;
  isMock: boolean;
  status: "success" | "error";
  errorMessage?: string;
}

export interface ExtractBatchInvoicesResponse {
  invoices: BatchInvoiceItemResult[];
  totalSuccess: number;
  totalFailed: number;
}

/**
 * Tự động thêm Nhà cung cấp và các Nguyên liệu chưa có trong kho
 */
async function autoProvisionMissingEntities(
  supabase: Awaited<ReturnType<typeof createClient>>,
  reviewData: InvoiceOcrReviewData,
  parsedData: InvoiceParsedData
) {
  try {
    let db = supabase;
    try {
      if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
        db = createAdminClient();
      }
    } catch {
      db = supabase;
    }

    // 1. Tự động kiểm tra / thêm Nhà cung cấp nếu chưa có
    if (!reviewData.supplier_id && parsedData.supplier_name?.trim()) {
      const rawSupName = parsedData.supplier_name.trim();
      const normRawName = normalizeVietnamese(rawSupName);
      const taxCode = parsedData.supplier_tax_code?.trim() || null;
      const phone = parsedData.supplier_phone?.trim() || null;
      const address = parsedData.supplier_address?.trim() || null;

      // Tra cứu lại xem NCC đã có trong DB chưa
      const { data: existingSuppliers } = await db
        .from("suppliers")
        .select("id, name, code, tax_code, phone, address")
        .eq("is_active", true);

      const cleanTax = taxCode ? taxCode.replace(/\D/g, "") : "";
      const cleanPhone = phone ? phone.replace(/\D/g, "") : "";

      let matchedSup = (existingSuppliers ?? []).find((s) => {
        if (cleanTax && s.tax_code && s.tax_code.replace(/\D/g, "") === cleanTax) return true;
        if (cleanPhone && s.phone && s.phone.replace(/\D/g, "") === cleanPhone) return true;
        if (normalizeVietnamese(s.name) === normRawName) return true;
        return computeSimilarity(s.name, rawSupName) >= 0.75;
      });

      if (!matchedSup) {
        const supPrefix =
          normRawName
            .split(/\s+/)
            .map((w) => w[0])
            .join("")
            .toUpperCase()
            .slice(0, 4) || "NCC";
        let supCode = `NCC-${supPrefix}-${Math.floor(100 + Math.random() * 900)}`;

        let { data: newSup, error: insErr } = await db
          .from("suppliers")
          .insert({
            name: rawSupName,
            code: supCode,
            tax_code: taxCode,
            phone: phone,
            address: address,
            is_active: true,
            payment_terms_days: 0,
          })
          .select("id, name, code, tax_code, phone, address")
          .maybeSingle();

        if (insErr && insErr.code === "23505") {
          supCode = `NCC-${supPrefix}-${Date.now().toString().slice(-4)}`;
          const retryRes = await db
            .from("suppliers")
            .insert({
              name: rawSupName,
              code: supCode,
              tax_code: taxCode,
              phone: phone,
              address: address,
              is_active: true,
              payment_terms_days: 0,
            })
            .select("id, name, code, tax_code, phone, address")
            .maybeSingle();
          newSup = retryRes.data;
          insErr = retryRes.error;
        }

        if (insErr) {
          console.error("Lỗi khi tự động thêm NCC từ hóa đơn:", insErr);
        }

        if (newSup) {
          matchedSup = newSup;
        }
      } else {
        const updates: { tax_code?: string; phone?: string; address?: string } = {};
        if (!matchedSup.tax_code && taxCode) updates.tax_code = taxCode;
        if (!matchedSup.phone && phone) updates.phone = phone;
        if (!matchedSup.address && address) updates.address = address;
        if (Object.keys(updates).length > 0) {
          await db.from("suppliers").update(updates).eq("id", matchedSup.id);
        }
      }

      if (matchedSup) {
        reviewData.supplier_id = matchedSup.id;
        reviewData.matched_supplier_name = matchedSup.name;
        reviewData.supplier_match_confidence = "exact";
        try {
          revalidatePath("/suppliers");
        } catch (revErr) {
          console.warn("revalidatePath cảnh báo:", revErr);
        }
      }
    } else if (reviewData.supplier_id) {
      // Nếu NCC đã có sẵn nhưng còn thiếu thông tin (MST/SĐT/Địa chỉ), cập nhật bổ sung
      const updates: { tax_code?: string; phone?: string; address?: string } = {};
      if (parsedData.supplier_tax_code) updates.tax_code = parsedData.supplier_tax_code;
      if (parsedData.supplier_phone) updates.phone = parsedData.supplier_phone;
      if (parsedData.supplier_address) updates.address = parsedData.supplier_address;
      if (Object.keys(updates).length > 0) {
        await db.from("suppliers").update(updates).eq("id", reviewData.supplier_id);
        try {
          revalidatePath("/suppliers");
        } catch (revErr) {
          console.warn("revalidatePath cảnh báo:", revErr);
        }
      }
    }

    // 2. Tự động thêm Nguyên liệu vào kho nếu chưa có
    for (const item of reviewData.items) {
      if (!item.ingredient_id && item.raw_name?.trim()) {
        const rawName = item.raw_name.trim();
        const normName = normalizeVietnamese(rawName);
        const prefix =
          normName
            .split(/\s+/)
            .map((w) => w[0])
            .join("")
            .toUpperCase()
            .slice(0, 4) || "NL";
        let autoCode = `NL-${prefix}-${Math.floor(1000 + Math.random() * 9000)}`;
        const unit = (item.unit && item.unit.trim()) || "kg";

        let { data: newIng, error: ingErr } = await db
          .from("ingredients")
          .insert({
            name: rawName,
            code: autoCode,
            base_unit: unit,
            import_unit: unit,
            conversion_factor: 1,
            default_supplier_id: reviewData.supplier_id || null,
            is_active: true,
            note: "Tự động tạo khi scan hóa đơn nhập kho",
          })
          .select("id, code, name, base_unit, import_unit, conversion_factor")
          .maybeSingle();

        if (ingErr && ingErr.code === "23505") {
          autoCode = `NL-${prefix}-${Date.now().toString().slice(-4)}`;
          const retryRes = await db
            .from("ingredients")
            .insert({
              name: rawName,
              code: autoCode,
              base_unit: unit,
              import_unit: unit,
              conversion_factor: 1,
              default_supplier_id: reviewData.supplier_id || null,
              is_active: true,
              note: "Tự động tạo khi scan hóa đơn nhập kho",
            })
            .select("id, code, name, base_unit, import_unit, conversion_factor")
            .maybeSingle();
          newIng = retryRes.data;
          ingErr = retryRes.error;
        }

        if (newIng) {
          item.ingredient_id = newIng.id;
          item.matched_ingredient_name = newIng.name;
          item.match_confidence = "exact";
          item.unit = newIng.import_unit;
          item.conversion_factor = 1;
        }
      }
    }

    try {
      revalidatePath("/inventory");
      revalidatePath("/purchases");
    } catch (revErr) {
      console.warn("revalidatePath cảnh báo:", revErr);
    }
  } catch (err) {
    console.warn("Lưu ý: Không thể tự động đồng bộ NCC/Nguyên liệu vào DB:", err);
  }
}

/**
 * Xử lý file ảnh hóa đơn (hỗ trợ 1 hoặc nhiều ảnh): đọc AI OCR và so khớp với kho / nhà cung cấp hiện tại
 */
export async function extractAndMatchInvoice(
  formData: FormData
): Promise<ActionResult<ExtractInvoiceResponse>> {
  try {
    const rawFiles = formData.getAll("files") as File[];
    const singleFile = formData.get("file") as File | null;
    const allFiles: File[] = (rawFiles.length > 0 ? rawFiles : (singleFile ? [singleFile] : []))
      .filter((f) => f && f.size > 0);

    const demoId = (formData.get("demo_id") as string | null) || null;
    const apiKeyOverride = (formData.get("api_key") as string | null) || undefined;

    const supabase = await createClient();

    // 1. Kiểm tra nếu là chế độ Hóa đơn mẫu (Demo)
    if (demoId) {
      const sample = SAMPLE_DEMO_INVOICES.find((s) => s.id === demoId) || SAMPLE_DEMO_INVOICES[0];
      const parsedData = sample.data;

      // Lấy danh sách NCC & Nguyên liệu để so khớp
      const [{ data: suppliersData }, { data: ingredientsData }] = await Promise.all([
        supabase
          .from("suppliers")
          .select("id, code, name, tax_code, phone")
          .eq("is_active", true),
        supabase
          .from("ingredients")
          .select("id, code, name, base_unit, import_unit, conversion_factor, avg_cost_price")
          .eq("is_active", true),
      ]);

      const reviewData = matchInvoiceData(
        parsedData,
        (suppliersData ?? []) as SupplierMatchCandidate[],
        (ingredientsData ?? []) as IngredientMatchCandidate[],
        "/sample-invoice.png"
      );

      // Tự động tạo nguyên liệu & NCC nếu chưa có
      await autoProvisionMissingEntities(supabase, reviewData, parsedData);

      return ok({
        reviewData,
        isMock: true,
        modelUsed: `Hóa đơn mẫu: ${sample.name}`,
      });
    }

    if (allFiles.length === 0) {
      return fail("Vui lòng chọn hoặc tải lên ít nhất 1 file ảnh hóa đơn.");
    }

    // 2. Tối ưu ảnh và upload lưu trữ tất cả các file ảnh
    const optimizedImages: Array<{ base64Data: string; mimeType: string }> = [];
    const imageUrls: string[] = [];

    for (const file of allFiles) {
      const arrayBuffer = await file.arrayBuffer();
      const rawBuffer = Buffer.from(arrayBuffer);
      const optimized = await optimizeImageForOcr(rawBuffer, file.type || "image/jpeg");
      optimizedImages.push({
        base64Data: optimized.base64,
        mimeType: optimized.mimeType,
      });

      const uploadRes = await uploadImage(optimized.buffer, {
        filename: file.name,
        contentType: optimized.mimeType,
        folder: "restaurant-erp/invoices",
      });
      imageUrls.push(uploadRes.url);
    }

    // 3. Gọi AI OCR Engine cho 1 hoặc nhiều ảnh
    const { data: parsedData, isMock, modelUsed } = await parseMultipleInvoiceImages({
      images: optimizedImages,
      apiKeyOverride,
    });

    // 4. Lấy danh sách NCC & Nguyên liệu đang hoạt động
    const [{ data: suppliersData }, { data: ingredientsData }] = await Promise.all([
      supabase
        .from("suppliers")
        .select("id, code, name, tax_code, phone")
        .eq("is_active", true),
      supabase
        .from("ingredients")
        .select("id, code, name, base_unit, import_unit, conversion_factor, avg_cost_price")
        .eq("is_active", true),
    ]);

    // 5. So khớp thông minh (truyền mảng toàn bộ imageUrls)
    const reviewData = matchInvoiceData(
      parsedData,
      (suppliersData ?? []) as SupplierMatchCandidate[],
      (ingredientsData ?? []) as IngredientMatchCandidate[],
      imageUrls
    );

    // 6. Tự động tạo nguyên liệu & NCC vào kho nếu chưa có
    await autoProvisionMissingEntities(supabase, reviewData, parsedData);

    return ok({
      reviewData,
      isMock,
      modelUsed,
    });
  } catch (err) {
    console.error("Lỗi khi xử lý hóa đơn OCR:", err);
    return fail(
      err instanceof Error
        ? err.message
        : "Đã xảy ra lỗi trong quá trình quét và đọc hóa đơn."
    );
  }
}

/**
 * Xử lý hàng loạt ảnh hóa đơn từ nhiều Nhà cung cấp khác nhau.
 * Mỗi ảnh đại diện cho một hóa đơn riêng biệt, được quét độc lập và khớp với NCC & Nguyên liệu tương ứng.
 */
export async function extractAndMatchMultipleInvoices(
  formData: FormData
): Promise<ActionResult<ExtractBatchInvoicesResponse>> {
  try {
    const demoId = (formData.get("demo_id") as string | null) || null;
    const apiKeyOverride = (formData.get("api_key") as string | null) || undefined;
    const supabase = await createClient();

    // 1. Chế độ Hóa đơn mẫu hàng loạt (Batch Demo) với 3 Nhà cung cấp khác nhau
    if (demoId === "batch-multi-suppliers") {
      const sampleIds = ["rau-cu-qua-da-lat", "simba-food", "thit-hai-san"];
      const demoSamples = sampleIds
        .map((id) => SAMPLE_DEMO_INVOICES.find((s) => s.id === id))
        .filter(Boolean) as typeof SAMPLE_DEMO_INVOICES;

      const [{ data: suppliersData }, { data: ingredientsData }] = await Promise.all([
        supabase
          .from("suppliers")
          .select("id, code, name, tax_code, phone")
          .eq("is_active", true),
        supabase
          .from("ingredients")
          .select("id, code, name, base_unit, import_unit, conversion_factor, avg_cost_price")
          .eq("is_active", true),
      ]);

      const batchResults: BatchInvoiceItemResult[] = [];
      for (let i = 0; i < demoSamples.length; i++) {
        const sample = demoSamples[i];
        const reviewData = matchInvoiceData(
          sample.data,
          (suppliersData ?? []) as SupplierMatchCandidate[],
          (ingredientsData ?? []) as IngredientMatchCandidate[],
          "/sample-invoice.png"
        );

        await autoProvisionMissingEntities(supabase, reviewData, sample.data);

        batchResults.push({
          id: `demo-batch-${i + 1}`,
          fileName: `${sample.supplierName}.png`,
          imageUrl: "/sample-invoice.png",
          reviewData,
          modelUsed: `Hóa đơn mẫu: ${sample.name}`,
          isMock: true,
          status: "success",
        });
      }

      return ok({
        invoices: batchResults,
        totalSuccess: batchResults.length,
        totalFailed: 0,
      });
    }

    // 2. Chế độ tải file thực tế
    const rawFiles = formData.getAll("files") as File[];
    const singleFile = formData.get("file") as File | null;
    const allFiles: File[] = (rawFiles.length > 0 ? rawFiles : singleFile ? [singleFile] : []).filter(
      (f) => f && f.size > 0
    );

    if (allFiles.length === 0) {
      return fail("Vui lòng chọn hoặc tải lên ít nhất 1 file ảnh hóa đơn.");
    }

    // Lấy trước danh sách NCC & Nguyên liệu để so khớp
    const [{ data: suppliersData }, { data: ingredientsData }] = await Promise.all([
      supabase
        .from("suppliers")
        .select("id, code, name, tax_code, phone")
        .eq("is_active", true),
      supabase
        .from("ingredients")
        .select("id, code, name, base_unit, import_unit, conversion_factor, avg_cost_price")
        .eq("is_active", true),
    ]);

    // Xử lý song song từng cụm 2 ảnh để tối ưu tốc độ và không bị rate limit
    const chunkSize = 2;
    const batchResults: BatchInvoiceItemResult[] = [];

    for (let i = 0; i < allFiles.length; i += chunkSize) {
      const chunk = allFiles.slice(i, i + chunkSize);
      const chunkPromises = chunk.map(async (file, chunkIndex) => {
        const fileIndex = i + chunkIndex;
        const invId = `batch-inv-${fileIndex + 1}-${Date.now()}`;
        try {
          const arrayBuffer = await file.arrayBuffer();
          const rawBuffer = Buffer.from(arrayBuffer);
          const optimized = await optimizeImageForOcr(rawBuffer, file.type || "image/jpeg");

          // Lưu ảnh lên storage
          const uploadRes = await uploadImage(optimized.buffer, {
            filename: file.name,
            contentType: optimized.mimeType,
            folder: "restaurant-erp/invoices",
          });

          // Quét dữ liệu bằng AI OCR độc lập cho từng hóa đơn
          const { data: parsedData, isMock, modelUsed } = await parseInvoiceImage({
            base64Data: optimized.base64,
            mimeType: optimized.mimeType,
            apiKeyOverride,
          });

          // So khớp với NCC và Nguyên liệu
          const reviewData = matchInvoiceData(
            parsedData,
            (suppliersData ?? []) as SupplierMatchCandidate[],
            (ingredientsData ?? []) as IngredientMatchCandidate[],
            uploadRes.url
          );

          // Tự động thêm NCC / Nguyên liệu mới nếu chưa có
          await autoProvisionMissingEntities(supabase, reviewData, parsedData);

          return {
            id: invId,
            fileName: file.name,
            imageUrl: uploadRes.url,
            reviewData,
            modelUsed,
            isMock,
            status: "success" as const,
          };
        } catch (itemErr) {
          console.error(`Lỗi xử lý ảnh hóa đơn [${file.name}]:`, itemErr);
          const fallbackReviewData: InvoiceOcrReviewData = {
            image_url: "",
            supplier_id: null,
            supplier_name_raw: null,
            matched_supplier_name: null,
            supplier_match_confidence: "unmatched",
            order_date: new Date().toISOString().slice(0, 10),
            invoice_number: "",
            items: [],
            subtotal: 0,
            tax_amount: 0,
            total_amount: 0,
            raw_extracted: {
              supplier_name: null,
              supplier_tax_code: null,
              supplier_phone: null,
              supplier_address: null,
              invoice_number: null,
              order_date: new Date().toISOString().slice(0, 10),
              items: [],
              subtotal: 0,
              tax_percent: 0,
              tax_amount: 0,
              total_amount: 0,
            },
          };

          return {
            id: invId,
            fileName: file.name,
            imageUrl: "",
            reviewData: fallbackReviewData,
            modelUsed: "Error",
            isMock: false,
            status: "error" as const,
            errorMessage: itemErr instanceof Error ? itemErr.message : "Không thể nhận diện hình ảnh",
          };
        }
      });

      const chunkResults = await Promise.all(chunkPromises);
      batchResults.push(...chunkResults);
    }

    const totalSuccess = batchResults.filter((r) => r.status === "success").length;
    const totalFailed = batchResults.filter((r) => r.status === "error").length;

    return ok({
      invoices: batchResults,
      totalSuccess,
      totalFailed,
    });
  } catch (err) {
    console.error("Lỗi khi xử lý hàng loạt hóa đơn:", err);
    return fail(
      err instanceof Error
        ? err.message
        : "Đã xảy ra lỗi trong quá trình quét hàng loạt hóa đơn."
    );
  }
}


