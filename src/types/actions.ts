import type { ZodError } from "zod";

/** Uniform return type for every Server Action. */
export type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string; fieldErrors?: Record<string, string[]> };

export function ok<T>(data: T): ActionResult<T> {
  return { success: true, data };
}

export function fail<T = never>(
  error: string,
  fieldErrors?: Record<string, string[]>
): ActionResult<T> {
  return { success: false, error, fieldErrors };
}

const FIELD_LABELS: Record<string, string> = {
  supplier_id: "Nhà cung cấp",
  order_date: "Ngày nhập",
  due_date: "Hạn thanh toán",
  invoice_number: "Mã hóa đơn",
  invoice_image_url: "Ảnh hóa đơn",
  paid_now: "Số tiền thanh toán",
  paid_method: "Hình thức thanh toán",
  items: "Danh sách mặt hàng",
  quantity: "Số lượng",
  unit_price: "Đơn giá",
  ingredient_id: "Nguyên liệu",
  conversion_factor: "Hệ số quy đổi",
  name: "Tên",
  code: "Mã",
  phone: "Số điện thoại",
  email: "Email",
  address: "Địa chỉ",
  tax_code: "Mã số thuế",
  payment_terms_days: "Điều khoản thanh toán",
  selling_price: "Giá bán",
  category: "Danh mục",
  category_id: "Danh mục",
  base_unit: "Đơn vị cơ bản",
  import_unit: "Đơn vị nhập",
  note: "Ghi chú",
  reason: "Lý do",
  unit: "Đơn vị tính",
};

/** Chuyển ZodError thành thông báo tiếng Việt cụ thể chỉ rõ lỗi ở trường nào */
export function formatZodError(error: ZodError): string {
  const issues = error.issues.map((iss) => {
    const path = iss.path;
    let fieldDesc = "";
    if (path.length > 0) {
      if (path[0] === "items" && typeof path[1] === "number") {
        const itemIdx = path[1] + 1;
        const subField = String(path[2] || "");
        const subLabel = FIELD_LABELS[subField] || subField;
        fieldDesc = `Dòng #${itemIdx}${subLabel ? ` [${subLabel}]` : ""}`;
      } else {
        const lastField = String(path[path.length - 1]);
        fieldDesc = FIELD_LABELS[lastField] || path.join(".");
      }
    }
    return fieldDesc ? `${fieldDesc}: ${iss.message}` : iss.message;
  });

  return issues.length > 0
    ? `Dữ liệu không hợp lệ: ${issues.join("; ")}`
    : "Dữ liệu không hợp lệ";
}

export function failZod<T = never>(error: ZodError): ActionResult<T> {
  return fail(formatZodError(error), error.flatten().fieldErrors as Record<string, string[]>);
}

