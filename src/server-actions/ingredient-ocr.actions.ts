"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fail, ok, type ActionResult } from "@/types/actions";
import {
  parseIngredientsFromImage,
  getMockIngredientResult,
  type IngredientOcrResult,
  type IngredientParsedItem,
  type SupplierParsedInfo,
} from "@/lib/ai/ingredient-ocr";
import { normalizeVietnamese, computeSimilarity } from "@/lib/ai/invoice-matcher";
import { uploadImage } from "@/lib/storage";
import { optimizeImageForOcr } from "@/lib/image-optimizer";

export interface BatchIngredientImageResult {
  id: string;
  fileName: string;
  imageUrl: string;
  supplierName?: string | null;
  supplierId?: string;
  supplier?: SupplierParsedInfo | null;
  items: IngredientParsedItem[];
  modelUsed: string;
  status: "success" | "error";
  errorMessage?: string;
}

export interface ExtractBatchIngredientsResponse {
  results: BatchIngredientImageResult[];
  allItems: IngredientParsedItem[];
  totalImages: number;
  totalSuccess: number;
  totalFailed: number;
  uniqueSuppliersCount: number;
}

/**
 * Tự động kiểm tra hoặc tạo Nhà cung cấp vào cơ sở dữ liệu nếu phát hiện thông tin trên ảnh
 */
async function autoProvisionSupplier(
  db: Awaited<ReturnType<typeof createClient>>,
  supplier: SupplierParsedInfo | null | undefined
): Promise<{ id: string; name: string } | null> {
  if (!supplier?.name?.trim()) return null;

  try {
    const rawSupName = supplier.name.trim();
    const taxCode = supplier.tax_code?.trim() || null;
    const phone = supplier.phone?.trim() || null;
    const address = supplier.address?.trim() || null;
    const contactName = supplier.contact_name?.trim() || null;

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

    if (!matchedSup) {
      const supPrefix =
        normRawName
          .split(/\s+/)
          .map((w) => w[0])
          .join("")
          .toUpperCase()
          .slice(0, 4) || "NCC";
      let supCode = `NCC-${supPrefix}-${Math.floor(100 + Math.random() * 900)}`;
      const { data: newSupInitial, error: insErr } = await db
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

      let newSup = newSupInitial;

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
      }

      if (newSup) {
        matchedSup = newSup;
      }
    } else {
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
      try {
        revalidatePath("/suppliers");
        revalidatePath("/inventory");
        revalidatePath("/purchases");
      } catch (revErr) {
        console.warn("revalidatePath cảnh báo:", revErr);
      }
      return { id: matchedSup.id, name: matchedSup.name };
    }
  } catch (err) {
    console.warn("Lưu ý: Không thể tự động tạo/cập nhật NCC:", err);
  }

  return null;
}

/**
 * Server action: Trích xuất danh sách nguyên liệu và nhà cung cấp từ 1 ảnh.
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

    // Tự động kiểm tra / tạo Nhà cung cấp vào hệ thống nếu nhận diện được trên ảnh
    const provisionedSup = await autoProvisionSupplier(db, result.supplier);
    if (provisionedSup) {
      result.supplier_id = provisionedSup.id;
      result.matched_supplier_name = provisionedSup.name;
      if (result.supplier) {
        result.supplier.name = provisionedSup.name;
      }
      result.items = result.items.map((it) => ({
        ...it,
        default_supplier_id: provisionedSup.id,
      }));
    }

    return ok(result);
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Đã xảy ra lỗi khi quét ảnh nguyên liệu.";
    return fail(msg);
  }
}

/**
 * Server action: Quét hàng loạt nhiều ảnh nguyên liệu từ các Nhà cung cấp khác nhau cùng lúc.
 * Bóc tách danh mục nguyên liệu của từng ảnh, tự động nhận diện và liên kết Nhà Cung Cấp tương ứng.
 */
export async function extractMultipleIngredientsFromImagesAction(
  formData: FormData
): Promise<ActionResult<ExtractBatchIngredientsResponse>> {
  try {
    const isDemo =
      formData.get("is_demo") === "true" ||
      formData.get("demo_id") === "batch-ingredients-demo";
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

    // 1. Chế độ Hàng Loạt Mẫu (Batch Demo Mode) với 3 Nhà Cung Cấp khác nhau
    if (isDemo) {
      const demoSuppliers: Array<{
        supplierInfo: SupplierParsedInfo;
        fileName: string;
        items: IngredientParsedItem[];
      }> = [
        {
          supplierInfo: {
            name: "Đại lý Gia vị & Thực phẩm Khô Toàn Thắng",
            tax_code: "0314892110",
            phone: "0908 123 456",
            address: "Số 45 Đường số 7, P. Linh Trung, TP. Thủ Đức, TP.HCM",
            contact_name: "Anh Thắng",
          },
          fileName: "Bang_Gia_Gia_Vi_Toan_Thang.png",
          items: [
            {
              code: "NL-BOTMI-MEIZAN",
              name: "Bột mì đa dụng Meizan",
              category: "Bột - Ngũ cốc",
              base_unit: "kg",
              import_unit: "bao",
              conversion_factor: 25,
              default_price: 450000,
              min_alert_stock: 2,
              default_supplier_id: null,
              is_active: true,
              note: "Bao 25kg",
            },
            {
              code: "NL-DAUAN-SIMPLY",
              name: "Dầu đậu nành Simply 5L",
              category: "Gia vị - Dầu ăn",
              base_unit: "chai",
              import_unit: "thùng",
              conversion_factor: 4,
              default_price: 680000,
              min_alert_stock: 3,
              default_supplier_id: null,
              is_active: true,
              note: "Thùng 4 can x 5L",
            },
            {
              code: "NL-NUOCMAM-NAMNGU",
              name: "Nước mắm Nam Ngư Đệ Nhị 900ml",
              category: "Gia vị - Nước sốt",
              base_unit: "chai",
              import_unit: "thùng",
              conversion_factor: 15,
              default_price: 360000,
              min_alert_stock: 2,
              default_supplier_id: null,
              is_active: true,
              note: null,
            },
            {
              code: "NL-DUONG-BIENHOA",
              name: "Đường tinh luyện Biên Hòa Pure 1kg",
              category: "Gia vị - Đường",
              base_unit: "kg",
              import_unit: "bao",
              conversion_factor: 50,
              default_price: 1100000,
              min_alert_stock: 1,
              default_supplier_id: null,
              is_active: true,
              note: null,
            },
          ],
        },
        {
          supplierInfo: {
            name: "Công ty TNHH Rau Sạch Đà Lạt Mart",
            tax_code: "0314892341",
            phone: "0908 123 456",
            address: "128 Đinh Tiên Hoàng, P.1, TP. Đà Lạt, Lâm Đồng",
            contact_name: "Chị Thảo",
          },
          fileName: "Phieu_Nong_San_Da_Lat_Mart.png",
          items: [
            {
              code: "NL-ROMAINE-DL",
              name: "Xà lách Romaine tươi Đà Lạt",
              category: "Rau - Củ - Quả",
              base_unit: "kg",
              import_unit: "kg",
              conversion_factor: 1,
              default_price: 32000,
              min_alert_stock: 5,
              default_supplier_id: null,
              is_active: true,
              note: "Hàng loại 1 chuẩn hữu cơ",
            },
            {
              code: "NL-CHANHVANG",
              name: "Chanh vàng không hạt",
              category: "Rau - Củ - Quả",
              base_unit: "kg",
              import_unit: "kg",
              conversion_factor: 1,
              default_price: 45000,
              min_alert_stock: 3,
              default_supplier_id: null,
              is_active: true,
              note: null,
            },
            {
              code: "NL-CACHUA-CHERRY",
              name: "Cà chua bi Cherry đỏ",
              category: "Rau - Củ - Quả",
              base_unit: "kg",
              import_unit: "kg",
              conversion_factor: 1,
              default_price: 38000,
              min_alert_stock: 3,
              default_supplier_id: null,
              is_active: true,
              note: null,
            },
            {
              code: "NL-DAU-OLIU",
              name: "Dầu Oliu Extra Virgin nguyên chất",
              category: "Gia vị - Dầu ăn",
              base_unit: "chai",
              import_unit: "chai",
              conversion_factor: 1,
              default_price: 185000,
              min_alert_stock: 2,
              default_supplier_id: null,
              is_active: true,
              note: "Chai 1 lít",
            },
          ],
        },
        {
          supplierInfo: {
            name: "Công ty Cổ phần Thương mại SIM BA",
            tax_code: "0303123890",
            phone: "0354 010 285",
            address: "968 Ba Tháng Hai, P. Phú Thọ, TP. Hồ Chí Minh",
            contact_name: "Bộ phận phân phối SIM BA",
          },
          fileName: "Bang_Gia_Hai_San_Simba.png",
          items: [
            {
              code: "NL-TRUNG-GA",
              name: "Trứng gà tươi loại 1",
              category: "Bơ - Sữa - Trứng",
              base_unit: "quả",
              import_unit: "khay",
              conversion_factor: 30,
              default_price: 84000,
              min_alert_stock: 2,
              default_supplier_id: null,
              is_active: true,
              note: "Khay 30 quả",
            },
            {
              code: "NL-RONG-BIEN-YAKI",
              name: "Rong biển nướng Yaki Sushi Nori",
              category: "Gia vị - Đồ khô",
              base_unit: "gói",
              import_unit: "gói",
              conversion_factor: 1,
              default_price: 165000,
              min_alert_stock: 3,
              default_supplier_id: null,
              is_active: true,
              note: "Gói 50 lá tiêu chuẩn Nhật",
            },
            {
              code: "NL-WASABI-TUOI",
              name: "Mù tạt tươi Wasabi paste",
              category: "Gia vị - Nước sốt",
              base_unit: "tuýp",
              import_unit: "hộp",
              conversion_factor: 10,
              default_price: 420000,
              min_alert_stock: 2,
              default_supplier_id: null,
              is_active: true,
              note: "Hộp 10 tuýp x 43g",
            },
            {
              code: "NL-SOT-MERANG",
              name: "Nước sốt mè rang Kewpie 1L",
              category: "Gia vị - Nước sốt",
              base_unit: "chai",
              import_unit: "thùng",
              conversion_factor: 6,
              default_price: 810000,
              min_alert_stock: 2,
              default_supplier_id: null,
              is_active: true,
              note: "Thùng 6 chai x 1L",
            },
          ],
        },
      ];

      const results: BatchIngredientImageResult[] = [];
      const allItems: IngredientParsedItem[] = [];

      for (let i = 0; i < demoSuppliers.length; i++) {
        const itemSet = demoSuppliers[i];
        const provisioned = await autoProvisionSupplier(db, itemSet.supplierInfo);
        const supId = provisioned?.id;
        const supName = provisioned?.name || itemSet.supplierInfo.name;

        const preparedItems = itemSet.items.map((it) => ({
          ...it,
          default_supplier_id: supId || null,
        }));

        allItems.push(...preparedItems);

        results.push({
          id: `demo-batch-ing-${i + 1}`,
          fileName: itemSet.fileName,
          imageUrl: "/sample-invoice.png",
          supplierName: supName,
          supplierId: supId,
          supplier: itemSet.supplierInfo,
          items: preparedItems,
          modelUsed: "Groq Vision (Hóa đơn mẫu)",
          status: "success",
        });
      }

      const uniqueSuppliersCount = new Set(
        results.map((r) => r.supplierName).filter(Boolean)
      ).size;

      return ok({
        results,
        allItems,
        totalImages: results.length,
        totalSuccess: results.length,
        totalFailed: 0,
        uniqueSuppliersCount,
      });
    }

    // 2. Chế độ Tải File Thực Tế (nhiều file ảnh cùng lúc)
    const rawFiles = formData.getAll("files") as File[];
    const singleFile = formData.get("file") as File | null;
    const allFiles: File[] = (rawFiles.length > 0 ? rawFiles : singleFile ? [singleFile] : []).filter(
      (f) => f && f.size > 0
    );

    if (allFiles.length === 0) {
      return fail("Vui lòng chọn hoặc tải lên ít nhất 1 file ảnh nguyên liệu.");
    }

    // Xử lý song song từng cụm 2 ảnh để giữ tốc độ nhanh và không bị rate limit
    const chunkSize = 2;
    const results: BatchIngredientImageResult[] = [];
    const allItems: IngredientParsedItem[] = [];

    for (let i = 0; i < allFiles.length; i += chunkSize) {
      const chunk = allFiles.slice(i, i + chunkSize);
      const chunkPromises = chunk.map(async (file, chunkIndex) => {
        const fileIndex = i + chunkIndex;
        const imgId = `batch-ing-${fileIndex + 1}-${Date.now()}`;

        try {
          const arrayBuffer = await file.arrayBuffer();
          const rawBuffer = Buffer.from(arrayBuffer);
          const optimized = await optimizeImageForOcr(rawBuffer, file.type || "image/jpeg");

          const uploadRes = await uploadImage(optimized.buffer, {
            filename: file.name,
            contentType: optimized.mimeType,
            folder: "restaurant-erp/ingredients_ocr",
          });

          const ocrResult = await parseIngredientsFromImage({
            base64Data: optimized.base64,
            mimeType: optimized.mimeType,
            apiKeyOverride,
            isDemo: false,
          });

          // Tự động tìm hoặc tạo Nhà cung cấp tương ứng với ảnh này
          const provisionedSup = await autoProvisionSupplier(db, ocrResult.supplier);
          const supId = provisionedSup?.id;
          const supName = provisionedSup?.name || ocrResult.supplier?.name;

          const imageItems = (ocrResult.items || []).map((it) => ({
            ...it,
            default_supplier_id: supId || null,
          }));

          return {
            id: imgId,
            fileName: file.name,
            imageUrl: uploadRes.url,
            supplierName: supName,
            supplierId: supId,
            supplier: ocrResult.supplier || null,
            items: imageItems,
            modelUsed: ocrResult.model_used || "Groq Vision",
            status: "success" as const,
          };
        } catch (fileErr) {
          console.error(`Lỗi khi quét ảnh nguyên liệu [${file.name}]:`, fileErr);
          return {
            id: imgId,
            fileName: file.name,
            imageUrl: "",
            items: [],
            modelUsed: "Error",
            status: "error" as const,
            errorMessage: fileErr instanceof Error ? fileErr.message : "Không thể phân tích ảnh",
          };
        }
      });

      const chunkResults = await Promise.all(chunkPromises);
      for (const res of chunkResults) {
        results.push(res);
        if (res.status === "success" && res.items.length > 0) {
          allItems.push(...res.items);
        }
      }
    }

    const totalSuccess = results.filter((r) => r.status === "success").length;
    const totalFailed = results.filter((r) => r.status === "error").length;
    const uniqueSuppliersCount = new Set(
      results.map((r) => r.supplierName).filter(Boolean)
    ).size;

    return ok({
      results,
      allItems,
      totalImages: results.length,
      totalSuccess,
      totalFailed,
      uniqueSuppliersCount,
    });
  } catch (error) {
    const msg =
      error instanceof Error
        ? error.message
        : "Đã xảy ra lỗi trong quá trình quét hàng loạt ảnh nguyên liệu.";
    return fail(msg);
  }
}

