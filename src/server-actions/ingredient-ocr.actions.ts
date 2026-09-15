"use server";

import { createClient } from "@/lib/supabase/server";
import { fail, ok, type ActionResult } from "@/types/actions";
import {
  parseIngredientsFromImage,
  getMockIngredientResult,
  type IngredientOcrResult,
} from "@/lib/ai/ingredient-ocr";
import { normalizeVietnamese } from "@/lib/ai/invoice-matcher";
import { uploadImage } from "@/lib/storage";

/**
 * Server action: Trích xuất danh sách nguyên liệu và nhà cung cấp từ ảnh.
 */
export async function extractIngredientsFromImageAction(
  formData: FormData
): Promise<ActionResult<IngredientOcrResult>> {
  try {
    const file = formData.get("file") as File | null;
    const isDemo = formData.get("is_demo") === "true";
    const apiKeyOverride = (formData.get("api_key") as string | null) || undefined;

    const supabase = await createClient();

    let result: IngredientOcrResult;

    if (isDemo) {
      result = getMockIngredientResult();
    } else {
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

      result = await parseIngredientsFromImage({
        base64Data,
        mimeType,
        apiKeyOverride,
        isDemo: false,
      });

      result.image_url = imageUrl;
    }

    // Tự động kiểm tra / tạo Nhà cung cấp nếu nhận diện được trên ảnh
    if (result.supplier && result.supplier.name?.trim()) {
      const rawSupName = result.supplier.name.trim();
      const taxCode = result.supplier.tax_code?.trim() || null;
      const phone = result.supplier.phone?.trim() || null;
      const address = result.supplier.address?.trim() || null;
      const contactName = result.supplier.contact_name?.trim() || null;

      // 1. Tìm xem nhà cung cấp đã có trong DB chưa
      const { data: existingSuppliers } = await supabase
        .from("suppliers")
        .select("id, name, code, tax_code, phone, address")
        .eq("is_active", true);

      let matchedSup = (existingSuppliers ?? []).find((s) => {
        if (taxCode && s.tax_code && s.tax_code.replace(/\D/g, "") === taxCode.replace(/\D/g, "")) return true;
        if (phone && s.phone && s.phone.replace(/\D/g, "") === phone.replace(/\D/g, "")) return true;
        return normalizeVietnamese(s.name) === normalizeVietnamese(rawSupName);
      });

      // 2. Nếu chưa có -> Tự động thêm Nhà cung cấp mới
      if (!matchedSup) {
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
            tax_code: taxCode,
            phone: phone,
            address: address,
            contact_name: contactName,
            is_active: true,
            payment_terms_days: 0,
          })
          .select("id, name, code, tax_code, phone, address")
          .maybeSingle();

        if (newSup) {
          matchedSup = newSup;
        }
      } else {
        // Cập nhật bổ sung thông tin nếu NCC cũ chưa có
        const updates: { tax_code?: string; phone?: string; address?: string } = {};
        if (!matchedSup.tax_code && taxCode) updates.tax_code = taxCode;
        if (!matchedSup.phone && phone) updates.phone = phone;
        if (!matchedSup.address && address) updates.address = address;
        if (Object.keys(updates).length > 0) {
          await supabase.from("suppliers").update(updates).eq("id", matchedSup.id);
        }
      }

      if (matchedSup) {
        result.supplier_id = matchedSup.id;
        result.matched_supplier_name = matchedSup.name;
        // Gán nhà cung cấp mặc định vào toàn bộ nguyên liệu trích xuất
        result.items = result.items.map((it) => ({
          ...it,
          default_supplier_id: matchedSup.id,
        }));
      }
    }

    return ok(result);
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Đã xảy ra lỗi khi quét ảnh nguyên liệu.";
    return fail(msg);
  }
}
