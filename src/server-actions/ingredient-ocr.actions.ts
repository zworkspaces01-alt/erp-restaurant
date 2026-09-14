"use server";

import { fail, ok, type ActionResult } from "@/types/actions";
import {
  parseIngredientsFromImage,
  getMockIngredientResult,
  type IngredientOcrResult,
} from "@/lib/ai/ingredient-ocr";

import { uploadImage } from "@/lib/storage";

/**
 * Server action: Trích xuất danh sách nguyên liệu từ ảnh (bảng báo giá, hóa đơn, bao bì).
 */
export async function extractIngredientsFromImageAction(
  formData: FormData
): Promise<ActionResult<IngredientOcrResult>> {
  try {
    const file = formData.get("file") as File | null;
    const isDemo = formData.get("is_demo") === "true";
    const apiKeyOverride = (formData.get("api_key") as string | null) || undefined;

    if (isDemo) {
      return ok(getMockIngredientResult());
    }

    if (!file || file.size === 0) {
      return fail("Vui lòng chọn hoặc tải lên file ảnh nguyên liệu.");
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const base64Data = buffer.toString("base64");
    const mimeType = file.type || "image/jpeg";

    const uploadRes = await uploadImage(buffer, {
      filename: file.name,
      contentType: mimeType,
      folder: "restaurant-erp/ingredients_ocr",
    });
    const imageUrl = uploadRes.url;

    const result = await parseIngredientsFromImage({
      base64Data,
      mimeType,
      apiKeyOverride,
      isDemo: false,
    });

    result.image_url = imageUrl;
    return ok(result);
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Đã xảy ra lỗi khi quét ảnh nguyên liệu.";
    return fail(msg);
  }
}
