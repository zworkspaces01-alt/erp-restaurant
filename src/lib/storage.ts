import { v2 as cloudinary, type UploadApiResponse } from "cloudinary";
import { createClient } from "@/lib/supabase/server";

// Cấu hình Cloudinary nếu có biến môi trường
const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
const apiKey = process.env.CLOUDINARY_API_KEY;
const apiSecret = process.env.CLOUDINARY_API_SECRET;

if (cloudName && apiKey && apiSecret) {
  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
    secure: true,
  });
}

export interface UploadFileOptions {
  folder?: string;
  filename?: string;
  contentType?: string;
}

export interface UploadResult {
  url: string;
  provider: "cloudinary" | "supabase" | "data_url";
  publicId?: string;
  bytes?: number;
}

/**
 * Tải file/ảnh lên dịch vụ lưu trữ đám mây.
 * Ưu tiên:
 * 1. Cloudinary (25GB miễn phí, nén tự động tối ưu)
 * 2. Supabase Storage (1GB miễn phí, bucket 'invoices')
 * 3. Base64 Data URL (dự phòng nội bộ)
 */
export async function uploadImage(
  buffer: Buffer,
  options: UploadFileOptions = {}
): Promise<UploadResult> {
  const folder = options.folder || "restaurant-erp/invoices";
  const contentType = options.contentType || "image/jpeg";
  const timestamp = Date.now();
  const safeName = (options.filename || `img_${timestamp}`).replace(/[^a-zA-Z0-9.-]/g, "_");

  // 1. Thử Cloudinary nếu đã cấu hình
  if (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET) {
    try {
      const base64Str = `data:${contentType};base64,${buffer.toString("base64")}`;
      const res: UploadApiResponse = await cloudinary.uploader.upload(base64Str, {
        folder,
        public_id: `${timestamp}_${safeName.split(".")[0]}`,
        resource_type: "image",
        transformation: [
          { quality: "auto", fetch_format: "auto" }, // Tự động tối ưu định dạng WebP/AVIF và dung lượng
        ],
      });

      if (res.secure_url) {
        return {
          url: res.secure_url,
          provider: "cloudinary",
          publicId: res.public_id,
          bytes: res.bytes,
        };
      }
    } catch (cloudErr) {
      console.warn("Cloudinary upload failed, falling back to Supabase Storage:", cloudErr);
    }
  }

  // 2. Thử Supabase Storage (bucket 'invoices')
  try {
    const supabase = await createClient();
    const filePath = `${folder.replace(/^restaurant-erp\//, "")}/${timestamp}_${safeName}`;

    const { error: uploadError } = await supabase.storage
      .from("invoices")
      .upload(filePath, buffer, {
        contentType,
        upsert: true,
      });

    if (!uploadError) {
      const { data: publicUrlData } = supabase.storage
        .from("invoices")
        .getPublicUrl(filePath);

      if (publicUrlData.publicUrl) {
        return {
          url: publicUrlData.publicUrl,
          provider: "supabase",
          bytes: buffer.length,
        };
      }
    }
  } catch (supabaseErr) {
    console.warn("Supabase Storage upload failed, falling back to Data URL:", supabaseErr);
  }

  // 3. Fallback cuối cùng: Data URL
  return {
    url: `data:${contentType};base64,${buffer.toString("base64")}`,
    provider: "data_url",
    bytes: buffer.length,
  };
}
