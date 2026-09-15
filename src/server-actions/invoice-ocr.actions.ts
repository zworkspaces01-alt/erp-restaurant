"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fail, ok, type ActionResult } from "@/types/actions";
import { parseInvoiceImage, SAMPLE_DEMO_INVOICES } from "@/lib/ai/invoice-ocr";
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

/**
 * Tự động thêm Nhà cung cấp và các Nguyên liệu chưa có trong kho
 */
async function autoProvisionMissingEntities(
  supabase: Awaited<ReturnType<typeof createClient>>,
  reviewData: InvoiceOcrReviewData,
  parsedData: InvoiceParsedData
) {
  const db = process.env.SUPABASE_SERVICE_ROLE_KEY ? createAdminClient() : supabase;

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
      revalidatePath("/suppliers");
    }
  } else if (reviewData.supplier_id) {
    // Nếu NCC đã có sẵn nhưng còn thiếu thông tin (MST/SĐT/Địa chỉ), cập nhật bổ sung
    const updates: { tax_code?: string; phone?: string; address?: string } = {};
    if (parsedData.supplier_tax_code) updates.tax_code = parsedData.supplier_tax_code;
    if (parsedData.supplier_phone) updates.phone = parsedData.supplier_phone;
    if (parsedData.supplier_address) updates.address = parsedData.supplier_address;
    if (Object.keys(updates).length > 0) {
      await db.from("suppliers").update(updates).eq("id", reviewData.supplier_id);
      revalidatePath("/suppliers");
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

  revalidatePath("/inventory");
  revalidatePath("/purchases");
}

/**
 * Xử lý file ảnh hóa đơn: đọc AI OCR và so khớp với kho / nhà cung cấp hiện tại
 */
export async function extractAndMatchInvoice(
  formData: FormData
): Promise<ActionResult<ExtractInvoiceResponse>> {
  try {
    const file = formData.get("file") as File | null;
    const demoId = (formData.get("demo_id") as string | null) || null;
    const apiKeyOverride = (formData.get("api_key") as string | null) || undefined;

    let base64Data = "";
    let mimeType = "image/jpeg";
    let imageUrl = "";

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

    if (!file || file.size === 0) {
      return fail("Vui lòng chọn hoặc tải lên file ảnh hóa đơn.");
    }

    // Đọc và tối ưu buffer file (auto-rotate EXIF, resize, nén nhẹ)
    const arrayBuffer = await file.arrayBuffer();
    const rawBuffer = Buffer.from(arrayBuffer);
    const optimized = await optimizeImageForOcr(rawBuffer, file.type || "image/jpeg");
    base64Data = optimized.base64;
    mimeType = optimized.mimeType;

    // 2. Lưu ảnh qua Cloudinary (hoặc Supabase Storage fallback) bằng buffer đã tối ưu
    const uploadRes = await uploadImage(optimized.buffer, {
      filename: file.name,
      contentType: mimeType,
      folder: "restaurant-erp/invoices",
    });
    imageUrl = uploadRes.url;

    // 3. Gọi AI OCR Engine
    const { data: parsedData, isMock, modelUsed } = await parseInvoiceImage({
      base64Data,
      mimeType,
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

    // 5. So khớp thông minh
    const reviewData = matchInvoiceData(
      parsedData,
      (suppliersData ?? []) as SupplierMatchCandidate[],
      (ingredientsData ?? []) as IngredientMatchCandidate[],
      imageUrl
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
