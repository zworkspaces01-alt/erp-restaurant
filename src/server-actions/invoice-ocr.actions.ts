"use server";

import { createClient } from "@/lib/supabase/server";
import { fail, ok, type ActionResult } from "@/types/actions";
import { parseInvoiceImage, SAMPLE_DEMO_INVOICES } from "@/lib/ai/invoice-ocr";
import {
  matchInvoiceData,
  type IngredientMatchCandidate,
  type SupplierMatchCandidate,
} from "@/lib/ai/invoice-matcher";
import { uploadImage } from "@/lib/storage";
import type { InvoiceOcrReviewData } from "@/types/restaurant";

export interface ExtractInvoiceResponse {
  reviewData: InvoiceOcrReviewData;
  isMock: boolean;
  modelUsed: string;
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
