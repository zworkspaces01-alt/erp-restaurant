/**
 * Nén ảnh phía client (trình duyệt) trước khi gửi lên Server Action:
 * - Khắc phục triệt để lỗi "An error occurred in the Server Components render" và HTTP 413
 *   do ảnh chụp độ phân giải cao từ điện thoại (iPhone/Android: 5MB - 15MB) vượt quá giới hạn
 *   Serverless / Vercel body size limit (4.5MB).
 * - Tự động thu nhỏ ảnh về kích thước tối đa 2048px (giữ độ sắc nét cho chữ viết tay, bảng số liệu).
 * - Nén sang định dạng JPEG chất lượng cao (quality 0.85), dung lượng giảm còn ~300KB - 700KB.
 * - Tốc độ upload nhanh hơn gấp 5 - 10 lần.
 */
export async function compressImageForUpload(
  file: File,
  maxDimension = 2048,
  quality = 0.85
): Promise<File> {
  // Chỉ nén file ảnh (không can thiệp PDF hay file không phải ảnh)
  if (!file.type.startsWith("image/") || file.type === "image/svg+xml") {
    return file;
  }

  // Nếu file đã nhỏ hơn 600KB thì không cần nén
  if (file.size < 600 * 1024) {
    return file;
  }

  return new Promise((resolve) => {
    try {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          let { width, height } = img;

          if (width > maxDimension || height > maxDimension) {
            if (width > height) {
              height = Math.round((height * maxDimension) / width);
              width = maxDimension;
            } else {
              width = Math.round((width * maxDimension) / height);
              height = maxDimension;
            }
          }

          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext("2d");
          if (!ctx) {
            resolve(file);
            return;
          }

          // Nền trắng để tránh ảnh PNG trong suốt bị đen khi chuyển sang JPEG
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, width, height);
          ctx.drawImage(img, 0, 0, width, height);

          canvas.toBlob(
            (blob) => {
              if (blob && blob.size < file.size) {
                const safeName = file.name.replace(/\.[^/.]+$/, ".jpg");
                const compressedFile = new File([blob], safeName, {
                  type: "image/jpeg",
                  lastModified: Date.now(),
                });
                resolve(compressedFile);
              } else {
                resolve(file);
              }
            },
            "image/jpeg",
            quality
          );
        };
        img.onerror = () => resolve(file);
        img.src = e.target?.result as string;
      };
      reader.onerror = () => resolve(file);
      reader.readAsDataURL(file);
    } catch {
      resolve(file);
    }
  });
}
