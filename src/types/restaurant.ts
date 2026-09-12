import { z } from "zod";
import type { Database, Json } from "@/types/database";
import { FOOD_COST_DANGER, FOOD_COST_WARN } from "@/lib/format";
import type { BadgeTone } from "@/components/shared/status-badge";

// ============================================================================
// 1. Helper aliases typed off the generated Database type
// ============================================================================

type PublicSchema = Database["public"];

export type Tables<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Row"];
export type TablesInsert<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Insert"];
export type TablesUpdate<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Update"];
export type Views<V extends keyof PublicSchema["Views"]> = PublicSchema["Views"][V]["Row"];
export type Enums<E extends keyof PublicSchema["Enums"]> = PublicSchema["Enums"][E];
export type FunctionArgs<F extends keyof PublicSchema["Functions"]> = PublicSchema["Functions"][F]["Args"];
export type FunctionReturns<F extends keyof PublicSchema["Functions"]> = PublicSchema["Functions"][F]["Returns"];

export type { Json };

// ============================================================================
// 2. Row aliases — tables
// ============================================================================

export type Ingredient = Tables<"ingredients">;
export type InventoryTransaction = Tables<"inventory_transactions">;
export type MenuItem = Tables<"menu_items">;
export type Recipe = Tables<"recipes">;
export type Supplier = Tables<"suppliers">;
export type PurchaseOrder = Tables<"purchase_orders">;
export type PurchaseOrderItem = Tables<"purchase_order_items">;
export type SupplierPayment = Tables<"supplier_payments">;
export type SupplierPaymentAllocation = Tables<"supplier_payment_allocations">;
export type Employee = Tables<"employees">;
export type Timekeeping = Tables<"timekeeping">;
export type PayrollPeriod = Tables<"payroll_periods">;
export type PayrollItem = Tables<"payroll_items">;
export type ExpenseCategory = Tables<"expense_categories">;
export type ExpenseRecord = Tables<"expense_records">;
export type Order = Tables<"orders">;
export type OrderItem = Tables<"order_items">;
export type Profile = Tables<"profiles">;
export type AppSetting = Tables<"app_settings">;

// Row aliases — views
export type RecipeCostRow = Views<"v_recipe_costs">;
export type MenuItemCostRow = Views<"v_menu_item_costs">;
export type MenuEngineeringRow = Views<"v_menu_engineering">;
export type InventoryStatusRow = Views<"v_inventory_status">;
export type SupplierDebtSummaryRow = Views<"v_supplier_debt_summary">;
export type PurchaseOrderSummaryRow = Views<"v_purchase_orders_summary">;
export type DailySalesRow = Views<"v_daily_sales">;

// RPC result types (DATABASE.md §5.9 – §5.11)

/** One row of `get_pnl_report(p_start, p_end)` — supabase returns an array with a single row. */
export interface PnlReport {
  revenue: number;
  cogs_sales: number;
  cogs_waste: number;
  cogs_total: number;
  gross_profit: number;
  gross_margin_pct: number;
  labor_cost: number;
  opex_fixed: number;
  opex_variable: number;
  opex_total: number;
  net_profit: number;
  net_margin_pct: number;
  order_count: number;
  avg_order_value: number;
}

/** One row of `get_pnl_monthly(p_year)` — 12 rows, one per month. */
export interface PnlMonthlyRow {
  month: number;
  month_start: string;
  revenue: number;
  cogs_total: number;
  gross_profit: number;
  labor_cost: number;
  opex_total: number;
  net_profit: number;
}

/** Result of `get_dashboard_stats()` (jsonb → plain object, all numbers are JSON numbers). */
export interface DashboardStats {
  as_of: string;
  today: string;
  month_start: string;
  today_revenue: number;
  today_cogs: number;
  today_orders: number;
  month_revenue: number;
  month_cogs: number;
  month_gross_profit: number;
  month_labor_cost: number;
  month_opex: number;
  month_net_profit: number;
  month_order_count: number;
  low_stock_count: number;
  total_supplier_debt: number;
  overdue_debt: number;
  pending_expenses_amount: number;
  pending_expenses_count: number;
}

/** Payload shapes for the jsonb arguments of the RPCs (DATABASE.md §5.1, §5.3). */
export interface CreatePurchaseOrderItemPayload {
  ingredient_id: string;
  quantity: number;
  unit_price: number;
  conversion_factor?: number;
  unit?: string;
}
export interface CreateOrderItemPayload {
  menu_item_id: string;
  quantity: number;
}

// ============================================================================
// 3. Enum unions, Vietnamese label maps, select options
// ============================================================================

export type EmploymentType = Enums<"employment_type">;
export type PaymentMethod = Enums<"payment_method">;
export type PoPaymentStatus = Enums<"po_payment_status">;
export type InventoryTxnType = Enums<"inventory_txn_type">;
export type OrderStatus = Enums<"order_status">;
export type PayrollStatus = Enums<"payroll_status">;
export type ExpenseStatus = Enums<"expense_status">;
export type ExpenseType = Enums<"expense_type">;
export type UserRole = Enums<"user_role">;
export type MenuClass = Enums<"menu_class">;

/** Manual stock movements accepted by `record_stock_adjustment`. */
export type StockAdjustmentType = Extract<InventoryTxnType, "waste" | "adjustment" | "stocktake">;

export interface SelectOption<V extends string | number = string> {
  value: V;
  label: string;
}

function toOptions<K extends string>(labels: Record<K, string>): SelectOption<K>[] {
  return (Object.keys(labels) as K[]).map((value) => ({ value, label: labels[value] }));
}

export const EMPLOYMENT_TYPE_LABELS: Record<EmploymentType, string> = {
  full_time: "Toàn thời gian",
  part_time: "Bán thời gian",
};
export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: "Tiền mặt",
  bank_transfer: "Chuyển khoản",
};
export const PO_PAYMENT_STATUS_LABELS: Record<PoPaymentStatus, string> = {
  unpaid: "Chưa thanh toán",
  partial: "Thanh toán một phần",
  paid: "Đã thanh toán",
};
export const INVENTORY_TXN_TYPE_LABELS: Record<InventoryTxnType, string> = {
  purchase: "Nhập hàng",
  sale: "Bán hàng",
  sale_reversal: "Hủy đơn (hoàn kho)",
  waste: "Hao hụt / hủy bỏ",
  adjustment: "Điều chỉnh",
  stocktake: "Kiểm kê",
};
export const STOCK_ADJUSTMENT_TYPE_LABELS: Record<StockAdjustmentType, string> = {
  waste: INVENTORY_TXN_TYPE_LABELS.waste,
  adjustment: INVENTORY_TXN_TYPE_LABELS.adjustment,
  stocktake: INVENTORY_TXN_TYPE_LABELS.stocktake,
};
export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  completed: "Hoàn thành",
  cancelled: "Đã hủy",
};
export const PAYROLL_STATUS_LABELS: Record<PayrollStatus, string> = {
  draft: "Nháp",
  finalized: "Đã chốt",
  paid: "Đã chi trả",
};
export const EXPENSE_STATUS_LABELS: Record<ExpenseStatus, string> = {
  pending: "Chờ thanh toán",
  paid: "Đã thanh toán",
};
export const EXPENSE_TYPE_LABELS: Record<ExpenseType, string> = {
  fixed: "Chi phí cố định",
  variable: "Chi phí vận hành",
};
export const USER_ROLE_LABELS: Record<UserRole, string> = {
  owner: "Chủ",
  manager: "Quản lý",
  staff: "Nhân viên",
};
export const MENU_CLASS_LABELS: Record<MenuClass, string> = {
  star: "STAR (bán chạy, lãi cao)",
  plowhorse: "PLOWHORSE (bán chạy, lãi thấp)",
  puzzle: "PUZZLE (bán chậm, lãi cao)",
  dog: "DOG (bán chậm, lãi thấp)",
};
/** Short action hint per menu class (Kasavana-Smith). */
export const MENU_CLASS_HINTS: Record<MenuClass, string> = {
  star: "Duy trì chất lượng, đẩy mạnh quảng bá.",
  plowhorse: "Tối ưu định lượng, giảm hao hụt hoặc tăng nhẹ giá.",
  puzzle: "Tăng cường quảng bá, đặt ở vị trí nổi bật trên thực đơn.",
  dog: "Cân nhắc điều chỉnh công thức hoặc loại khỏi thực đơn.",
};

export const EMPLOYMENT_TYPE_OPTIONS = toOptions(EMPLOYMENT_TYPE_LABELS);
export const PAYMENT_METHOD_OPTIONS = toOptions(PAYMENT_METHOD_LABELS);
export const PO_PAYMENT_STATUS_OPTIONS = toOptions(PO_PAYMENT_STATUS_LABELS);
export const INVENTORY_TXN_TYPE_OPTIONS = toOptions(INVENTORY_TXN_TYPE_LABELS);
export const STOCK_ADJUSTMENT_TYPE_OPTIONS = toOptions(STOCK_ADJUSTMENT_TYPE_LABELS);
export const ORDER_STATUS_OPTIONS = toOptions(ORDER_STATUS_LABELS);
export const PAYROLL_STATUS_OPTIONS = toOptions(PAYROLL_STATUS_LABELS);
export const EXPENSE_STATUS_OPTIONS = toOptions(EXPENSE_STATUS_LABELS);
export const EXPENSE_TYPE_OPTIONS = toOptions(EXPENSE_TYPE_LABELS);
export const USER_ROLE_OPTIONS = toOptions(USER_ROLE_LABELS);
export const MENU_CLASS_OPTIONS = toOptions(MENU_CLASS_LABELS);

// Payment terms (suppliers.payment_terms_days): 0 = COD, else gối đầu N ngày
export const PAYMENT_TERM_DAYS = [0, 7, 15, 30] as const;
export type PaymentTermDays = (typeof PAYMENT_TERM_DAYS)[number];

export function paymentTermLabel(days: number | null | undefined): string {
  const n = Number(days ?? 0);
  return n > 0 ? `Gối đầu ${n} ngày` : "Thanh toán ngay (COD)";
}

export const PAYMENT_TERM_OPTIONS: SelectOption<number>[] = PAYMENT_TERM_DAYS.map((value) => ({
  value,
  label: paymentTermLabel(value),
}));

// Reference lists (values taken from supabase/seed.sql)
export const BASE_UNITS = ["g", "ml", "pcs", "quả", "chai", "lon"] as const;
export const IMPORT_UNITS = [
  "kg",
  "lít",
  "chai 500ml",
  "chai 1L",
  "can 5L",
  "hộp 5L",
  "hũ 200g",
  "lon 380g",
  "bao 5kg",
  "bao 10kg",
  "thùng 24",
  "vỉ 10 quả",
  "túi 10 ổ",
  "túi 100",
  "cây 50 hộp",
] as const;
export const INGREDIENT_CATEGORIES = [
  "Thịt",
  "Hải sản",
  "Rau củ",
  "Trái cây",
  "Gia vị",
  "Gạo & mì",
  "Sữa & bơ",
  "Đồ uống",
  "Bao bì",
] as const;
export const MENU_CATEGORIES = ["Khai vị", "Món chính", "Cơm & Bún", "Tráng miệng", "Đồ uống"] as const;
export const SHIFT_OPTIONS = ["Sáng", "Chiều", "Tối", "Full", "Tăng ca"] as const;

export type BaseUnit = (typeof BASE_UNITS)[number];
export type ImportUnit = (typeof IMPORT_UNITS)[number];
export type IngredientCategory = (typeof INGREDIENT_CATEGORIES)[number];
export type MenuCategory = (typeof MENU_CATEGORIES)[number];
export type Shift = (typeof SHIFT_OPTIONS)[number];

// ============================================================================
// 4. zod schemas (zod 3) + input types
// ============================================================================

const MSG = {
  required: "Trường này là bắt buộc",
  uuid: "Giá trị không hợp lệ",
  date: "Ngày không hợp lệ (YYYY-MM-DD)",
  time: "Giờ không hợp lệ (HH:mm)",
  nonneg: "Giá trị phải lớn hơn hoặc bằng 0",
  positive: "Giá trị phải lớn hơn 0",
} as const;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;

/** Optional trimmed string → `null` when empty (for nullable text columns). */
const optionalText = z
  .string()
  .trim()
  .optional()
  .nullable()
  .transform((v) => (v ? v : null));

/** Required trimmed string with a Vietnamese message. */
const requiredText = (msg: string, min = 1) => z.string({ required_error: msg }).trim().min(min, msg);

const uuid = (msg: string = MSG.uuid) => z.string({ required_error: msg }).uuid(msg);
const dateString = (msg: string = MSG.date) => z.string({ required_error: msg }).trim().regex(DATE_RE, msg);
const optionalDate = z
  .string()
  .trim()
  .optional()
  .nullable()
  .transform((v) => (v ? v : null))
  .refine((v) => v === null || DATE_RE.test(v), MSG.date);
const optionalTime = z
  .string()
  .trim()
  .optional()
  .nullable()
  .transform((v) => (v ? v : null))
  .refine((v) => v === null || TIME_RE.test(v), MSG.time);
const optionalEmail = z
  .string()
  .trim()
  .optional()
  .nullable()
  .transform((v) => (v ? v : null))
  .refine((v) => v === null || z.string().email().safeParse(v).success, "Email không hợp lệ");
const optionalUrl = z
  .string()
  .trim()
  .optional()
  .nullable()
  .transform((v) => (v ? v : null))
  .refine((v) => v === null || z.string().url().safeParse(v).success, "Đường dẫn không hợp lệ");

const money = (msg: string = MSG.nonneg) => z.coerce.number({ invalid_type_error: "Số tiền không hợp lệ" }).min(0, msg);
const positiveNumber = (msg: string = MSG.positive) =>
  z.coerce.number({ invalid_type_error: "Số không hợp lệ" }).positive(msg);

const employmentTypeEnum = z.enum(["full_time", "part_time"], { errorMap: () => ({ message: "Loại hợp đồng không hợp lệ" }) });
const paymentMethodEnum = z.enum(["cash", "bank_transfer"], { errorMap: () => ({ message: "Phương thức thanh toán không hợp lệ" }) });
const expenseStatusEnum = z.enum(["pending", "paid"], { errorMap: () => ({ message: "Trạng thái không hợp lệ" }) });
const expenseTypeEnum = z.enum(["fixed", "variable"], { errorMap: () => ({ message: "Loại chi phí không hợp lệ" }) });
const stockAdjustmentTypeEnum = z.enum(["waste", "adjustment", "stocktake"], {
  errorMap: () => ({ message: "Loại giao dịch kho không hợp lệ" }),
});

// --- Master data --------------------------------------------------------------

export const ingredientSchema = z.object({
  code: optionalText,
  name: requiredText("Tên nguyên liệu là bắt buộc", 2),
  category: optionalText,
  base_unit: requiredText("Đơn vị cơ sở là bắt buộc (vd: g, ml, pcs)"),
  import_unit: requiredText("Đơn vị nhập là bắt buộc (vd: kg, thùng, lít)"),
  conversion_factor: positiveNumber("Hệ số quy đổi phải lớn hơn 0"),
  min_alert_stock: money("Mức cảnh báo tồn kho phải lớn hơn hoặc bằng 0"),
  default_supplier_id: z
    .string()
    .trim()
    .optional()
    .nullable()
    .transform((v) => (v ? v : null))
    .refine((v) => v === null || z.string().uuid().safeParse(v).success, "Nhà cung cấp không hợp lệ"),
  is_active: z.boolean().default(true),
  note: optionalText,
});
export type IngredientInput = z.infer<typeof ingredientSchema>;

export const menuItemSchema = z.object({
  code: optionalText,
  name: requiredText("Tên món là bắt buộc", 2),
  category: optionalText,
  selling_price: money("Giá bán phải lớn hơn hoặc bằng 0"),
  is_active: z.boolean().default(true),
  description: optionalText,
  image_url: optionalUrl,
});
export type MenuItemInput = z.infer<typeof menuItemSchema>;

export const recipeLineSchema = z.object({
  ingredient_id: uuid("Chưa chọn nguyên liệu"),
  quantity: positiveNumber("Định lượng phải lớn hơn 0"),
  waste_percent: z.coerce
    .number({ invalid_type_error: "Tỷ lệ hao hụt không hợp lệ" })
    .min(0, "Tỷ lệ hao hụt phải từ 0 đến 100")
    .max(100, "Tỷ lệ hao hụt phải từ 0 đến 100")
    .default(0),
  note: optionalText,
});
export type RecipeLineInput = z.infer<typeof recipeLineSchema>;

export const recipeSchema = z
  .object({
    menu_item_id: uuid("Món ăn không hợp lệ"),
    selling_price: money("Giá bán phải lớn hơn hoặc bằng 0"),
    lines: z.array(recipeLineSchema),
  })
  .superRefine((val, ctx) => {
    const seen = new Set<string>();
    val.lines.forEach((line, i) => {
      if (seen.has(line.ingredient_id)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["lines", i, "ingredient_id"], message: "Nguyên liệu bị trùng" });
      }
      seen.add(line.ingredient_id);
    });
  });
export type RecipeInput = z.infer<typeof recipeSchema>;

export const supplierSchema = z.object({
  code: optionalText,
  name: requiredText("Tên nhà cung cấp là bắt buộc", 2),
  contact_name: optionalText,
  phone: optionalText,
  email: optionalEmail,
  address: optionalText,
  tax_code: optionalText,
  payment_terms_days: z.coerce
    .number({ invalid_type_error: "Điều khoản thanh toán không hợp lệ" })
    .int("Số ngày phải là số nguyên")
    .min(0, "Số ngày gối đầu phải lớn hơn hoặc bằng 0")
    .default(0),
  is_active: z.boolean().default(true),
  note: optionalText,
});
export type SupplierInput = z.infer<typeof supplierSchema>;

// --- Purchasing ---------------------------------------------------------------

export const purchaseOrderItemSchema = z.object({
  ingredient_id: uuid("Chưa chọn nguyên liệu"),
  quantity: positiveNumber("Số lượng nhập phải lớn hơn 0"),
  unit_price: money("Đơn giá phải lớn hơn hoặc bằng 0"),
  conversion_factor: z.coerce.number().positive("Hệ số quy đổi phải lớn hơn 0").optional(),
  unit: optionalText,
});
export type PurchaseOrderItemInput = z.infer<typeof purchaseOrderItemSchema>;

export const purchaseOrderSchema = z
  .object({
    supplier_id: uuid("Chưa chọn nhà cung cấp"),
    order_date: dateString("Ngày nhập không hợp lệ"),
    due_date: optionalDate,
    invoice_number: optionalText,
    note: optionalText,
    items: z.array(purchaseOrderItemSchema).min(1, "Phiếu nhập phải có ít nhất một dòng"),
    paid_now: money("Số tiền trả ngay phải lớn hơn hoặc bằng 0").default(0),
    paid_method: paymentMethodEnum.default("cash"),
  })
  .refine(
    (v) => v.paid_now <= v.items.reduce((sum, it) => sum + calcPoLine(it.quantity, it.unit_price, it.conversion_factor ?? 1).lineTotal, 0),
    { path: ["paid_now"], message: "Số tiền trả ngay không được vượt quá tổng phiếu nhập" }
  );
export type PurchaseOrderInput = z.infer<typeof purchaseOrderSchema>;

export const supplierPaymentSchema = z.object({
  supplier_id: uuid("Chưa chọn nhà cung cấp"),
  amount: positiveNumber("Số tiền thanh toán phải lớn hơn 0"),
  payment_date: dateString("Ngày thanh toán không hợp lệ"),
  method: paymentMethodEnum.default("cash"),
  purchase_order_id: z
    .string()
    .trim()
    .optional()
    .nullable()
    .transform((v) => (v ? v : null))
    .refine((v) => v === null || z.string().uuid().safeParse(v).success, "Phiếu nhập không hợp lệ"),
  reference: optionalText,
  note: optionalText,
});
export type SupplierPaymentInput = z.infer<typeof supplierPaymentSchema>;

// --- Inventory ----------------------------------------------------------------

export const stockAdjustmentSchema = z
  .object({
    ingredient_id: uuid("Chưa chọn nguyên liệu"),
    txn_type: stockAdjustmentTypeEnum,
    quantity: z.coerce.number({ invalid_type_error: "Số lượng không hợp lệ" }),
    note: optionalText,
  })
  .superRefine((v, ctx) => {
    const add = (message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["quantity"], message });
    if (v.txn_type === "waste" && v.quantity <= 0) add("Số lượng hao hụt phải lớn hơn 0");
    if (v.txn_type === "adjustment" && v.quantity === 0) add("Số lượng điều chỉnh phải khác 0");
    if (v.txn_type === "stocktake" && v.quantity < 0) add("Số lượng kiểm kê phải lớn hơn hoặc bằng 0");
  });
export type StockAdjustmentInput = z.infer<typeof stockAdjustmentSchema>;

// --- Sales --------------------------------------------------------------------

export const orderItemSchema = z.object({
  menu_item_id: uuid("Chưa chọn món"),
  quantity: positiveNumber("Số lượng phải lớn hơn 0"),
});
export type OrderItemInput = z.infer<typeof orderItemSchema>;

export const orderSchema = z.object({
  items: z.array(orderItemSchema).min(1, "Đơn hàng phải có ít nhất một món"),
  discount: money("Giảm giá phải lớn hơn hoặc bằng 0").default(0),
  table_number: optionalText,
  payment_method: paymentMethodEnum.default("cash"),
  note: optionalText,
  /** ISO timestamp; omitted → now() on the DB side. */
  order_date: z
    .string()
    .trim()
    .optional()
    .nullable()
    .transform((v) => (v ? v : null))
    .refine((v) => v === null || !Number.isNaN(Date.parse(v)), "Thời gian đơn hàng không hợp lệ"),
});
export type OrderInput = z.infer<typeof orderSchema>;

// --- HR & payroll -------------------------------------------------------------

export const employeeSchema = z
  .object({
    code: optionalText,
    full_name: requiredText("Họ tên là bắt buộc", 2),
    phone: optionalText,
    email: optionalEmail,
    position: optionalText,
    employment_type: employmentTypeEnum,
    base_salary: money("Lương cơ bản phải lớn hơn hoặc bằng 0").default(0),
    hourly_rate: money("Lương theo giờ phải lớn hơn hoặc bằng 0").default(0),
    allowance: money("Phụ cấp phải lớn hơn hoặc bằng 0").default(0),
    standard_days_per_month: z.coerce
      .number({ invalid_type_error: "Số công chuẩn không hợp lệ" })
      .int("Số công chuẩn phải là số nguyên")
      .positive("Số công chuẩn phải lớn hơn 0")
      .default(26),
    start_date: optionalDate,
    end_date: optionalDate,
    bank_account: optionalText,
    is_active: z.boolean().default(true),
    note: optionalText,
  })
  .superRefine((v, ctx) => {
    if (v.employment_type === "full_time" && v.base_salary <= 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["base_salary"], message: "Nhân viên toàn thời gian cần lương cơ bản lớn hơn 0" });
    }
    if (v.employment_type === "part_time" && v.hourly_rate <= 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["hourly_rate"], message: "Nhân viên bán thời gian cần lương theo giờ lớn hơn 0" });
    }
    if (v.start_date && v.end_date && v.end_date < v.start_date) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["end_date"], message: "Ngày nghỉ việc phải sau ngày vào làm" });
    }
  });
export type EmployeeInput = z.infer<typeof employeeSchema>;

export const timekeepingSchema = z
  .object({
    employee_id: uuid("Chưa chọn nhân viên"),
    work_date: dateString("Ngày làm việc không hợp lệ"),
    shift: optionalText,
    check_in: optionalTime,
    check_out: optionalTime,
    hours_worked: z
      .union([z.coerce.number({ invalid_type_error: "Số giờ không hợp lệ" }), z.literal(""), z.null(), z.undefined()])
      .transform((v) => (v === "" || v === null || v === undefined ? null : v))
      .refine((v) => v === null || (v >= 0 && v <= 24), "Số giờ làm phải từ 0 đến 24"),
    note: optionalText,
  })
  .superRefine((v, ctx) => {
    const hasTimes = Boolean(v.check_in && v.check_out);
    if (v.hours_worked === null && !hasTimes) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["hours_worked"], message: "Cần nhập số giờ làm hoặc cả giờ vào và giờ ra" });
    }
    if ((v.check_in && !v.check_out) || (!v.check_in && v.check_out)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: [v.check_in ? "check_out" : "check_in"], message: "Cần nhập cả giờ vào và giờ ra" });
    }
  });
export type TimekeepingInput = z.infer<typeof timekeepingSchema>;
