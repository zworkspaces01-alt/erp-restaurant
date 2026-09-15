"use server";

import { createClient } from "@/lib/supabase/server";
import { fail, ok, type ActionResult } from "@/types/actions";
import { parseInvoiceImage, SAMPLE_DEMO_INVOICES } from "@/lib/ai/invoice-ocr";
import {
  matchInvoiceData,
  normalizeVietnamese,
  type IngredientMatchCandidate,
  type SupplierMatchCandidate,
} from "@/lib/ai/invoice-matcher";
import { uploadImage } from "@/lib/storage";
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
  // 1. Tự động thêm Nhà cung cấp nếu chưa có
  if (!reviewData.supplier_id && parsedData.supplier_name?.trim()) {
    const rawSupName = parsedData.supplier_name.trim();
    const supPrefix =
      normalizeVietnamese(rawSupName)
        .split(/\s+/)
        .map((w) => w[0])
        .join("")
        .toUpperCase()
        .slice(0, 4) || "NCC";
    const supCode = `NCC-${supPrefix}-${Math.floor(100 + Math.random() * 900)}`;

    const { data: newSup } = await supabase
      .from("suppliers")
      .insert({
        name: rawSupName,
        code: supCode,
        tax_code: parsedData.supplier_tax_code || null,
        phone: parsedData.supplier_phone || null,
        is_active: true,
        payment_terms_days: 0,
      })
      .select("id, name, code")
      .maybeSingle();

    if (newSup) {
      reviewData.supplier_id = newSup.id;
      reviewData.matched_supplier_name = newSup.name;
      reviewData.supplier_match_confidence = "exact";
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
      const autoCode = `NL-${prefix}-${Math.floor(1000 + Math.random() * 9000)}`;
      const unit = (item.unit && item.unit.trim()) || "kg";

      const { data: newIng } = await supabase
        .from("ingredients")
        .insert({
          name: rawName,
          code: autoCode,
          base_unit: unit,
          import_unit: unit,
          conversion_factor: 1,
          is_active: true,
          note: "Tự động tạo khi scan hóa đơn nhập kho",
        })
        .select("id, code, name, base_unit, import_unit, conversion_factor")
        .maybeSingle();

      if (newIng) {
        item.ingredient_id = newIng.id;
        item.matched_ingredient_name = newIng.name;
        item.match_confidence = "exact";
        item.unit = newIng.import_unit;
        item.conversion_factor = 1;
      }
    }
  }
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

    // Đọc buffer file
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    base64Data = buffer.toString("base64");
    mimeType = file.type || "image/jpeg";

    // 2. Lưu ảnh qua Cloudinary (hoặc Supabase Storage fallback)
    const uploadRes = await uploadImage(buffer, {
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
