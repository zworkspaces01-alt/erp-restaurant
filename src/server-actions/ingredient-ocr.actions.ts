"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fail, ok, type ActionResult } from "@/types/actions";
import {
  parseIngredientsFromImage,
  getMockIngredientResult,
  type IngredientOcrResult,
} from "@/lib/ai/ingredient-ocr";
import { normalizeVietnamese, computeSimilarity } from "@/lib/ai/invoice-matcher";
import { uploadImage } from "@/lib/storage";
import { optimizeImageForOcr } from "@/lib/image-optimizer";

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
    let db = supabase;
    try {
      if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
        db = createAdminClient();
      }
    } catch {
      db = supabase;
    }

    let result: IngredientOcrResult;

    if (isDemo) {
      result = getMockIngredientResult();
    } else {
      if (!file || file.size === 0) {
        return fail("Vui lòng chọn hoặc tải lên file ảnh nguyên liệu.");
      }

      const arrayBuffer = await file.arrayBuffer();
      const rawBuffer = Buffer.from(arrayBuffer);

      // Tối ưu ảnh với sharp: xoay đúng chiều EXIF, chuẩn hóa kích thước và nén nhẹ
      const optimized = await optimizeImageForOcr(rawBuffer, file.type || "image/jpeg");
      const base64Data = optimized.base64;
      const mimeType = optimized.mimeType;

      const uploadRes = await uploadImage(optimized.buffer, {
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

    // Tự động kiểm tra / tạo Nhà cung cấp vào hệ thống nếu nhận diện được trên ảnh (non-blocking)
    if (result.supplier && result.supplier.name?.trim()) {
      try {
        const rawSupName = result.supplier.name.trim();
        const taxCode = result.supplier.tax_code?.trim() || null;
        const phone = result.supplier.phone?.trim() || null;
        const address = result.supplier.address?.trim() || null;
        const contactName = result.supplier.contact_name?.trim() || null;

        // 1. Tìm xem nhà cung cấp đã có trong DB chưa
        const { data: existingSuppliers, error: supQueryErr } = await db
          .from("suppliers")
          .select("id, name, code, tax_code, phone, address")
          .eq("is_active", true);

        if (supQueryErr) {
          console.error("Lỗi khi truy vấn danh sách NCC:", supQueryErr);
        }

        const cleanTax = taxCode ? taxCode.replace(/\D/g, "") : "";
        const cleanPhone = phone ? phone.replace(/\D/g, "") : "";
        const normRawName = normalizeVietnamese(rawSupName);

        let matchedSup = (existingSuppliers ?? []).find((s) => {
          if (cleanTax && s.tax_code && s.tax_code.replace(/\D/g, "") === cleanTax) return true;
          if (cleanPhone && s.phone && s.phone.replace(/\D/g, "") === cleanPhone) return true;
          if (normalizeVietnamese(s.name) === normRawName) return true;
          return computeSimilarity(s.name, rawSupName) >= 0.75;
        });

        // 2. Nếu chưa có trong hệ thống -> Tự động thêm Nhà cung cấp mới
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
              contact_name: contactName,
              is_active: true,
              payment_terms_days: 0,
            })
            .select("id, name, code, tax_code, phone, address")
            .maybeSingle();

          // Xử lý trùng mã NCC (unique constraint 23505) nếu xảy ra
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
                contact_name: contactName,
                is_active: true,
                payment_terms_days: 0,
              })
              .select("id, name, code, tax_code, phone, address")
              .maybeSingle();
            newSup = retryRes.data;
            insErr = retryRes.error;
          }

          if (insErr) {
            console.error("Lỗi khi tự động thêm NCC từ ảnh hóa đơn:", insErr);
          }

          if (newSup) {
            matchedSup = newSup;
          }
        } else {
          // Cập nhật bổ sung thông tin nếu NCC cũ trong hệ thống còn thiếu
          const updates: { tax_code?: string; phone?: string; address?: string; contact_name?: string } = {};
          if (!matchedSup.tax_code && taxCode) updates.tax_code = taxCode;
          if (!matchedSup.phone && phone) updates.phone = phone;
          if (!matchedSup.address && address) updates.address = address;
          if (contactName) updates.contact_name = contactName;
          if (Object.keys(updates).length > 0) {
            await db.from("suppliers").update(updates).eq("id", matchedSup.id);
          }
        }

        if (matchedSup) {
          result.supplier_id = matchedSup.id;
          result.matched_supplier_name = matchedSup.name;
          if (result.supplier) {
            result.supplier.name = matchedSup.name;
          }
          // Gán nhà cung cấp mặc định vào toàn bộ nguyên liệu trích xuất
          result.items = result.items.map((it) => ({
            ...it,
            default_supplier_id: matchedSup.id,
          }));

          // Làm mới cache các trang liên quan (bọc try/catch để không làm đứt mạch Action nếu render trang gặp lỗi)
          try {
            revalidatePath("/suppliers");
            revalidatePath("/inventory");
            revalidatePath("/purchases");
            revalidatePath("/purchases/new");
          } catch (revErr) {
            console.warn("revalidatePath cảnh báo:", revErr);
          }
        }
      } catch (supErr) {
        console.warn("Lưu ý: Không thể tự động tạo/cập nhật NCC vào cơ sở dữ liệu:", supErr);
      }
    }

    return ok(result);
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Đã xảy ra lỗi khi quét ảnh nguyên liệu.";
    return fail(msg);
  }
}
