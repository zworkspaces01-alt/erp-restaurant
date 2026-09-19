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
// 2. Row aliases — tables & views
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

export type RecipeCostRow = Views<"v_recipe_costs">;
export type MenuItemCostRow = Views<"v_menu_item_costs">;
export type MenuEngineeringRow = Views<"v_menu_engineering">;
export type InventoryStatusRow = Views<"v_inventory_status">;
export type SupplierDebtSummaryRow = Views<"v_supplier_debt_summary">;
export type PurchaseOrderSummaryRow = Views<"v_purchase_orders_summary">;
export type DailySalesRow = Views<"v_daily_sales">;
export type MenuCategoryRow = Views<"v_menu_categories">;
export type IngredientCategoryRow = Views<"v_ingredient_categories">;
export type MenuCategory = Tables<"menu_categories">;
export type IngredientCategory = Tables<"ingredient_categories">;

// --- RPC result types (DATABASE.md §5.9 – §5.11) ------------------------------

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

/** Ledger types the app may create directly via `record_stock_adjustment`. */
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
  purchase: "Nhập kho",
  sale: "Xuất bán",
  sale_reversal: "Hoàn kho (hủy đơn)",
  waste: "Hao hụt",
  adjustment: "Điều chỉnh",
  stocktake: "Kiểm kê",
};

export const STOCK_ADJUSTMENT_TYPE_LABELS: Record<StockAdjustmentType, string> = {
  waste: "Hao hụt",
  adjustment: "Điều chỉnh",
  stocktake: "Kiểm kê",
};

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  completed: "Hoàn tất",
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
  variable: "Chi phí biến đổi",
};

export const USER_ROLE_LABELS: Record<UserRole, string> = {
  owner: "Chủ nhà hàng",
  manager: "Quản lý",
  staff: "Nhân viên",
};

export const MENU_CLASS_LABELS: Record<MenuClass, string> = {
  star: "Ngôi sao",
  plowhorse: "Bò kéo cày",
  puzzle: "Câu đố",
  dog: "Món ế",
};

/** Short Vietnamese hint for each Kasavana-Smith class (menu engineering). */
export const MENU_CLASS_HINTS: Record<MenuClass, string> = {
  star: "Bán chạy & lãi cao — giữ nguyên, đưa lên đầu menu.",
  plowhorse: "Bán chạy nhưng lãi thấp — giảm giá vốn hoặc tăng giá nhẹ.",
  puzzle: "Lãi cao nhưng bán ít — đẩy marketing, gợi ý cho khách.",
  dog: "Bán ít & lãi thấp — cân nhắc bỏ khỏi menu.",
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

// --- Supplier payment terms ---------------------------------------------------

export const PAYMENT_TERM_DAYS = [0, 7, 15, 30] as const;
export type PaymentTermDays = (typeof PAYMENT_TERM_DAYS)[number];

export function paymentTermLabel(days: number | null | undefined): string {
  const d = days ?? 0;
  return d <= 0 ? "Thanh toán ngay (COD)" : `Gối đầu ${d} ngày`;
}

export const PAYMENT_TERM_OPTIONS: SelectOption<number>[] = PAYMENT_TERM_DAYS.map((value) => ({
  value,
  label: paymentTermLabel(value),
}));

// --- Domain vocabularies (values seen in supabase/seed.sql) -------------------

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
  "Gạo & mì",
  "Gia vị",
  "Sữa & bơ",
  "Đồ uống",
  "Bao bì",
] as const;
export const MENU_CATEGORIES = ["Khai vị", "Món chính", "Cơm & Bún", "Đồ uống", "Tráng miệng"] as const;
export const SHIFT_OPTIONS = ["Sáng", "Chiều", "Tối", "Full"] as const;

export type BaseUnit = (typeof BASE_UNITS)[number];
export type ImportUnit = (typeof IMPORT_UNITS)[number];
export type LegacyIngredientCategory = (typeof INGREDIENT_CATEGORIES)[number];
export type LegacyMenuCategory = (typeof MENU_CATEGORIES)[number];
export type Shift = (typeof SHIFT_OPTIONS)[number];

// ============================================================================
// 4. zod schemas (zod 3) + input types
// ============================================================================

const MSG = {
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

/** Chuẩn hóa các định dạng ngày phổ biến (DD/MM/YYYY, DD-MM-YYYY, YYYY/MM/DD) về chuẩn YYYY-MM-DD */
export function normalizeDateToISO(val: unknown): unknown {
  if (typeof val !== "string") return val;
  const trimmed = val.trim();
  if (!trimmed) return trimmed;
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  // Format DD/MM/YYYY hoặc DD-MM-YYYY
  const m = trimmed.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (m) {
    const day = m[1].padStart(2, "0");
    const month = m[2].padStart(2, "0");
    const year = m[3];
    return `${year}-${month}-${day}`;
  }
  // Format YYYY/MM/DD
  const m2 = trimmed.match(/^(\d{4})[/.-](\d{1,2})[/.-](\d{1,2})$/);
  if (m2) {
    const year = m2[1];
    const month = m2[2].padStart(2, "0");
    const day = m2[3].padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
  return trimmed;
}

const uuid = (msg: string = MSG.uuid) => z.string({ required_error: msg }).uuid(msg);
const dateString = (msg: string = MSG.date) =>
  z
    .string({ required_error: msg })
    .trim()
    .transform((val) => normalizeDateToISO(val) as string)
    .refine((val) => DATE_RE.test(val), msg);

const optionalUuid = (msg: string) =>
  z
    .string()
    .trim()
    .optional()
    .nullable()
    .transform((v) => (v ? v : null))
    .refine((v) => v === null || z.string().uuid().safeParse(v).success, msg);

const optionalDate = z
  .string()
  .trim()
  .optional()
  .nullable()
  .transform((v) => (v ? (normalizeDateToISO(v) as string) : null))
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

/** URL or empty → null. */
const optionalUrl = z
  .string()
  .trim()
  .optional()
  .nullable()
  .transform((v) => (v ? v : null))
  .refine((v) => v === null || z.string().url().safeParse(v).success, "Đường dẫn không hợp lệ");

const optionalTimestamp = z
  .string()
  .trim()
  .optional()
  .nullable()
  .transform((v) => (v ? v : null))
  .refine((v) => v === null || !Number.isNaN(Date.parse(v)), "Thời điểm không hợp lệ");

const money = (msg: string = MSG.nonneg) =>
  z.coerce.number({ invalid_type_error: "Số tiền không hợp lệ" }).min(0, msg);
const positiveNumber = (msg: string = MSG.positive) =>
  z.coerce.number({ invalid_type_error: "Số không hợp lệ" }).positive(msg);

const employmentTypeEnum = z.enum(["full_time", "part_time"], {
  errorMap: () => ({ message: "Loại hợp đồng không hợp lệ" }),
});
const paymentMethodEnum = z.enum(["cash", "bank_transfer"], {
  errorMap: () => ({ message: "Phương thức thanh toán không hợp lệ" }),
});
const expenseStatusEnum = z.enum(["pending", "paid"], { errorMap: () => ({ message: "Trạng thái không hợp lệ" }) });
const expenseTypeEnum = z.enum(["fixed", "variable"], { errorMap: () => ({ message: "Loại chi phí không hợp lệ" }) });
const stockAdjustmentTypeEnum = z.enum(["waste", "adjustment", "stocktake"], {
  errorMap: () => ({ message: "Loại giao dịch kho không hợp lệ" }),
});

/** Nullable `payment_method` column (empty select → null). */
const optionalPaymentMethod = z
  .union([paymentMethodEnum, z.literal(""), z.null(), z.undefined()])
  .transform((v) => (v === "" || v === null || v === undefined ? null : v));

// --- Categories ---------------------------------------------------------------

export const categorySchema = z.object({
  name: requiredText("Vui lòng nhập tên danh mục", 2).max(100, "Tên danh mục tối đa 100 ký tự"),
  description: optionalText,
  display_order: z.coerce.number().int("Thứ tự hiển thị phải là số nguyên").default(0),
  is_active: z.boolean().default(true),
});
export type CategoryInput = z.infer<typeof categorySchema>;

// --- Master data --------------------------------------------------------------

export const ingredientSchema = z.object({
  code: optionalText,
  name: requiredText("Tên nguyên liệu là bắt buộc", 2),
  category: optionalText,
  base_unit: requiredText("Đơn vị cơ sở là bắt buộc (vd: g, ml, pcs)"),
  import_unit: requiredText("Đơn vị nhập là bắt buộc (vd: kg, thùng, lít)"),
  conversion_factor: positiveNumber("Hệ số quy đổi phải lớn hơn 0"),
  min_alert_stock: money("Mức cảnh báo tồn kho phải lớn hơn hoặc bằng 0").default(0),
  default_price: money("Đơn giá nhập ngầm định phải lớn hơn hoặc bằng 0").optional().default(0),
  default_supplier_id: optionalUuid("Nhà cung cấp không hợp lệ"),
  is_active: z.boolean().default(true),
  note: optionalText,
});
export type IngredientInput = z.infer<typeof ingredientSchema>;

export const menuItemSchema = z.object({
  code: optionalText,
  name: requiredText("Tên món là bắt buộc", 2),
  category: optionalText,
  item_group: optionalText,
  selling_price: money("Giá bán phải lớn hơn hoặc bằng 0"),
  tax_percent: z.coerce
    .number({ invalid_type_error: "Thuế suất không hợp lệ" })
    .min(0, "Thuế suất phải từ 0% đến 100%")
    .max(100, "Thuế suất không được vượt quá 100%")
    .default(0),
  is_active: z.boolean().default(true),
  is_combo: z.boolean().default(false),
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

export const recipeImportRowSchema = z.object({
  menu_item_code: optionalText,
  menu_item_name: optionalText,
  ingredient_code: optionalText,
  ingredient_name: optionalText,
  quantity: positiveNumber("Định lượng phải lớn hơn 0"),
  waste_percent: z.coerce
    .number({ invalid_type_error: "Tỷ lệ hao hụt không hợp lệ" })
    .min(0, "Tỷ lệ hao hụt phải từ 0 đến 100")
    .max(100, "Tỷ lệ hao hụt phải từ 0 đến 100")
    .default(0),
  unit: optionalText,
  note: optionalText,
});
export type RecipeImportRowInput = z.infer<typeof recipeImportRowSchema>;

/** Full BOM of one menu item (`/menu/[id]`): replaces `recipes` rows + updates the price. */
export const recipeCostingLineSchema = z.object({
  ingredient_id: optionalUuid("Nguyên liệu không hợp lệ"),
  ingredient_name: requiredText("Tên nguyên liệu là bắt buộc", 1),
  ingredient_code: optionalText,
  portion_quantity: positiveNumber("Định lượng dùng phải lớn hơn 0"),
  portion_unit: requiredText("ĐVT dùng là bắt buộc", 1),
  package_quantity: positiveNumber("Quy cách mua phải lớn hơn 0").default(1),
  package_unit: requiredText("ĐVT mua là bắt buộc", 1),
  package_price: money("Đơn giá mua phải lớn hơn hoặc bằng 0").default(0),
  waste_percent: z.coerce
    .number({ invalid_type_error: "Tỷ lệ hao hụt không hợp lệ" })
    .min(0, "Tỷ lệ hao hụt phải từ 0 đến 100")
    .max(100, "Tỷ lệ hao hụt phải từ 0 đến 100")
    .default(0),
  note: optionalText,
});
export type RecipeCostingLineInput = z.infer<typeof recipeCostingLineSchema>;

export const recipeCostingSchema = z.object({
  menu_item_id: uuid("Món ăn không hợp lệ"),
  selling_price: money("Giá bán phải lớn hơn hoặc bằng 0"),
  lines: z.array(recipeCostingLineSchema),
});
export type RecipeCostingInput = z.infer<typeof recipeCostingSchema>;

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
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["lines", i, "ingredient_id"],
          message: "Nguyên liệu bị trùng trong định lượng",
        });
      }
      seen.add(line.ingredient_id);
    });
  });
export type RecipeInput = z.infer<typeof recipeSchema>;

export const comboLineSchema = z.object({
  menu_item_id: uuid("Chưa chọn món ăn"),
  quantity: positiveNumber("Số lượng phải lớn hơn 0"),
  note: optionalText,
});
export type ComboLineInput = z.infer<typeof comboLineSchema>;

/** Full child items list of one combo (`/menu/[id]`): replaces `combo_items` rows + updates the price. */
export const comboSchema = z
  .object({
    combo_id: uuid("Combo không hợp lệ"),
    selling_price: money("Giá bán phải lớn hơn hoặc bằng 0"),
    lines: z.array(comboLineSchema),
  })
  .superRefine((val, ctx) => {
    const seen = new Set<string>();
    val.lines.forEach((line, i) => {
      if (line.menu_item_id === val.combo_id) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["lines", i, "menu_item_id"],
          message: "Combo không thể chứa chính nó",
        });
      }
      if (seen.has(line.menu_item_id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["lines", i, "menu_item_id"],
          message: "Món ăn bị trùng trong combo",
        });
      }
      seen.add(line.menu_item_id);
    });
  });
export type ComboInput = z.infer<typeof comboSchema>;

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
  /** Defaults to the ingredient's `conversion_factor` on the DB side. */
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
    invoice_image_url: optionalText,
    note: optionalText,
    items: z.array(purchaseOrderItemSchema).min(1, "Phiếu nhập phải có ít nhất một dòng"),
    paid_now: money("Số tiền trả ngay phải lớn hơn hoặc bằng 0").default(0),
    paid_method: paymentMethodEnum.default("cash"),
  })
  .refine(
    (v) =>
      v.paid_now <=
      v.items.reduce((sum, it) => sum + calcPoLine(it.quantity, it.unit_price, it.conversion_factor ?? 1).lineTotal, 0),
    { path: ["paid_now"], message: "Số tiền trả ngay không được vượt quá tổng phiếu nhập" }
  );
export type PurchaseOrderInput = z.infer<typeof purchaseOrderSchema>;

/** Sửa phần "mềm" của phiếu nhập (DATABASE.md §1.3/§4.2) — chỉ gửi các trường thực sự đổi. */
export const purchaseOrderMetaSchema = z
  .object({
    order_date: dateString("Ngày nhập không hợp lệ").optional(),
    invoice_number: optionalText.optional(),
    invoice_image_url: optionalText.optional(),
    note: optionalText.optional(),
    due_date: optionalDate.optional(),
  })
  .refine(
    (v) => {
      if (v.due_date && v.order_date) {
        return v.due_date >= v.order_date;
      }
      return true;
    },
    { path: ["due_date"], message: "Hạn thanh toán phải sau hoặc cùng ngày nhập" }
  );
export type PurchaseOrderMetaInput = z.infer<typeof purchaseOrderMetaSchema>;

// --- Invoice OCR & Review Types -----------------------------------------------

export interface InvoiceParsedItem {
  raw_name: string;
  quantity: number;
  unit?: string | null;
  unit_price: number;
  line_total?: number;
  note?: string | null;
  /** Thuế suất % của mặt hàng (0 nếu không chịu thuế / KCT, 5, 8, 10 nếu chịu thuế). */
  tax_rate?: number | null;
  /** Đánh dấu mặt hàng có chịu thuế GTGT hay không theo hóa đơn. */
  is_taxable?: boolean | null;
}

export interface InvoiceParsedData {
  supplier_name?: string | null;
  supplier_tax_code?: string | null;
  supplier_phone?: string | null;
  supplier_address?: string | null;
  invoice_number?: string | null;
  order_date?: string | null;
  items: InvoiceParsedItem[];
  excluded_items?: string[];
  subtotal?: number;
  tax_percent?: number;
  tax_amount?: number;
  total_amount?: number;
  confidence_score?: number;
}

export interface MatchedInvoiceItem {
  raw_name: string;
  quantity: number;
  unit: string;
  unit_price: number;
  line_total: number;
  ingredient_id: string | null;
  matched_ingredient_name: string | null;
  conversion_factor: number;
  match_confidence: "exact" | "high" | "partial" | "unmatched";
  /** Thuế suất % của mặt hàng (0 = Không chịu thuế / KCT, 5%, 8%, 10%). */
  tax_rate?: number;
  /** Đánh dấu mặt hàng chịu thuế. */
  is_taxable?: boolean;
  /** Ghi chú bổ sung hoặc cảnh báo nét gạch. */
  note?: string | null;
}

export interface InvoiceOcrReviewData {
  image_url: string;
  image_urls?: string[];
  supplier_id: string | null;
  supplier_name_raw: string | null;
  matched_supplier_name?: string | null;
  supplier_match_confidence: "exact" | "partial" | "unmatched";
  invoice_number: string;
  order_date: string;
  items: MatchedInvoiceItem[];
  excluded_items?: string[];
  subtotal: number;
  tax_amount: number;
  total_amount: number;
  raw_extracted: InvoiceParsedData;
}

/** Thêm một dòng vào phiếu nhập đã tồn tại (sửa dòng = xóa + nhập lại, §7.1). */
export const purchaseOrderLineSchema = purchaseOrderItemSchema;
export type PurchaseOrderLineInput = z.infer<typeof purchaseOrderLineSchema>;

export const supplierPaymentSchema = z.object({
  supplier_id: uuid("Chưa chọn nhà cung cấp"),
  amount: positiveNumber("Số tiền thanh toán phải lớn hơn 0"),
  payment_date: dateString("Ngày thanh toán không hợp lệ"),
  method: paymentMethodEnum.default("cash"),
  /** `null` → trừ dần theo FIFO toàn bộ công nợ NCC. */
  purchase_order_id: optionalUuid("Phiếu nhập không hợp lệ"),
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
  /** ISO timestamp; `null` → `now()` on the DB side. */
  order_date: optionalTimestamp,
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
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["base_salary"],
        message: "Nhân viên toàn thời gian cần lương cơ bản lớn hơn 0",
      });
    }
    if (v.employment_type === "part_time" && v.hourly_rate <= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["hourly_rate"],
        message: "Nhân viên bán thời gian cần lương theo giờ lớn hơn 0",
      });
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
    /** Bỏ trống → DB tự tính từ giờ vào/ra (`trg_timekeeping_before`). */
    hours_worked: z
      .union([z.coerce.number({ invalid_type_error: "Số giờ không hợp lệ" }), z.literal(""), z.null(), z.undefined()])
      .transform((v) => (v === "" || v === null || v === undefined ? null : v))
      .refine((v) => v === null || (v >= 0 && v <= 24), "Số giờ làm phải từ 0 đến 24"),
    note: optionalText,
  })
  .superRefine((v, ctx) => {
    const hasTimes = Boolean(v.check_in && v.check_out);
    if (v.hours_worked === null && !hasTimes) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["hours_worked"],
        message: "Cần nhập số giờ làm hoặc cả giờ vào và giờ ra",
      });
    }
    if ((v.check_in && !v.check_out) || (!v.check_in && v.check_out)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [v.check_in ? "check_out" : "check_in"],
        message: "Cần nhập cả giờ vào và giờ ra",
      });
    }
  });
export type TimekeepingInput = z.infer<typeof timekeepingSchema>;

export const payrollPeriodSchema = z
  .object({
    name: requiredText("Tên kỳ lương là bắt buộc", 2),
    period_start: dateString("Ngày bắt đầu không hợp lệ"),
    period_end: dateString("Ngày kết thúc không hợp lệ"),
    note: optionalText,
  })
  .refine((v) => v.period_start <= v.period_end, {
    path: ["period_end"],
    message: "Ngày kết thúc phải sau hoặc bằng ngày bắt đầu",
  });
export type PayrollPeriodInput = z.infer<typeof payrollPeriodSchema>;

/** Editable columns of a `payroll_items` row while the period is `draft`. */
export const payrollItemAdjustSchema = z.object({
  bonus: money("Thưởng phải lớn hơn hoặc bằng 0").default(0),
  tips: money("Tip phải lớn hơn hoặc bằng 0").default(0),
  advance_deduction: money("Tạm ứng phải lớn hơn hoặc bằng 0").default(0),
  penalty: money("Khấu trừ phải lớn hơn hoặc bằng 0").default(0),
  note: optionalText,
});
export type PayrollItemAdjustInput = z.infer<typeof payrollItemAdjustSchema>;

/** Arguments of `pay_payroll(p_period_id, p_method, p_paid_at)`. */
export const payrollPaySchema = z.object({
  method: paymentMethodEnum.default("bank_transfer"),
  paid_at: optionalTimestamp,
});
export type PayrollPayInput = z.infer<typeof payrollPaySchema>;

// --- Expenses -----------------------------------------------------------------

export const expenseCategorySchema = z.object({
  name: requiredText("Tên nhóm chi phí là bắt buộc", 2),
  expense_type: expenseTypeEnum.default("variable"),
  description: optionalText,
  is_active: z.boolean().default(true),
});
export type ExpenseCategoryInput = z.infer<typeof expenseCategorySchema>;

export const expenseRecordSchema = z
  .object({
    category_id: uuid("Chưa chọn nhóm chi phí"),
    title: requiredText("Nội dung chi phí là bắt buộc", 2),
    amount: money("Số tiền phải lớn hơn hoặc bằng 0"),
    expense_date: dateString("Ngày chi không hợp lệ"),
    status: expenseStatusEnum.default("pending"),
    payment_method: optionalPaymentMethod,
    paid_at: optionalTimestamp,
    vendor: optionalText,
    invoice_number: optionalText,
    attachment_url: optionalUrl,
    note: optionalText,
  })
  .superRefine((v, ctx) => {
    if (v.status === "paid" && !v.payment_method) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["payment_method"],
        message: "Chi phí đã thanh toán cần phương thức thanh toán",
      });
    }
    if (v.status === "paid" && v.amount <= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["amount"],
        message: "Chi phí đã thanh toán phải có số tiền lớn hơn 0",
      });
    }
  });
export type ExpenseRecordInput = z.infer<typeof expenseRecordSchema>;

export const markExpensePaidSchema = z.object({
  id: uuid("Chi phí không hợp lệ"),
  payment_method: paymentMethodEnum.default("cash"),
  paid_at: optionalTimestamp,
});
export type MarkExpensePaidInput = z.infer<typeof markExpensePaidSchema>;

// --- Auth ---------------------------------------------------------------------

export const loginSchema = z.object({
  email: z
    .string({ required_error: "Email là bắt buộc" })
    .trim()
    .min(1, "Email là bắt buộc")
    .email("Email không hợp lệ"),
  password: z.string({ required_error: "Mật khẩu là bắt buộc" }).min(6, "Mật khẩu tối thiểu 6 ký tự"),
  /** Đường dẫn nội bộ để quay lại sau khi đăng nhập (middleware gắn `?next=`). */
  next: optionalText,
});
export type LoginInput = z.infer<typeof loginSchema>;

/**
 * Chỉ chấp nhận đường dẫn nội bộ dạng `/abc`: chặn URL tuyệt đối và
 * protocol-relative (`//evil.example`) để tránh open redirect sau khi đăng nhập.
 */
export function safeNextPath(next: string | null | undefined, fallback = "/dashboard"): string {
  const value = (next ?? "").trim();
  if (!value) return fallback;
  if (!value.startsWith("/")) return fallback;
  if (value.startsWith("//")) return fallback;
  if (value.includes("\\") || /[\u0000-\u001f]/.test(value)) return fallback;
  return value;
}

// ============================================================================
// 5. Pure helpers mirroring the SQL (views & triggers)
// ============================================================================

/** Round half-up to `digits` decimals, like Postgres `round(numeric, n)`. */
function roundTo(value: number, digits: number): number {
  if (!Number.isFinite(value)) return 0;
  const f = 10 ** digits;
  return Math.round((value + Number.EPSILON * Math.sign(value)) * f) / f;
}

function num(value: number | string | null | undefined): number {
  if (value === null || value === undefined || value === "") return 0;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

/** `v_recipe_costs.component_cost` = round(quantity × (1 + waste%/100) × avg_cost_price, 2). */
export function calcComponentCost(
  qty: number | string | null | undefined,
  wastePct: number | string | null | undefined,
  avgCost: number | string | null | undefined
): number {
  return roundTo(num(qty) * (1 + num(wastePct) / 100) * num(avgCost), 2);
}

/**
 * Tính chi phí từ Đơn giá mua gói và Quy cách mua:
 * Đơn giá cơ sở = Đơn giá mua / Quy cách mua
 * Thành tiền = Định lượng dùng × (1 + Hao hụt% / 100) × Đơn giá cơ sở
 */
export function calcCostingLineAmount(
  portionQty: number | string | null | undefined,
  pkgQty: number | string | null | undefined,
  pkgPrice: number | string | null | undefined,
  wastePct: number | string | null | undefined = 0
): { unitCost: number; lineTotal: number } {
  const pQty = num(portionQty);
  const kQty = num(pkgQty) > 0 ? num(pkgQty) : 1;
  const kPrice = num(pkgPrice);
  const wPct = num(wastePct);
  const unitCost = kPrice / kQty;
  const lineTotal = roundTo(pQty * (1 + wPct / 100) * unitCost, 2);
  return { unitCost, lineTotal };
}

export interface RecipeTotals {
  /** Σ component cost (VND). */
  idealCost: number;
  /** selling price − ideal cost (VND). */
  contributionMargin: number;
  /** ideal cost / selling price × 100, or `null` when the price is 0. */
  foodCostPct: number | null;
}

/** `v_menu_item_costs` maths for a draft BOM (before it is saved). */
export function calcRecipeTotals(
  lines: { quantity: number | string; waste_percent: number | string; avg_cost_price: number | string }[],
  sellingPrice: number | string | null | undefined
): RecipeTotals {
  const price = num(sellingPrice);
  const idealCost = roundTo(
    lines.reduce((sum, l) => sum + calcComponentCost(l.quantity, l.waste_percent, l.avg_cost_price), 0),
    2
  );
  return {
    idealCost,
    contributionMargin: roundTo(price - idealCost, 2),
    foodCostPct: price > 0 ? roundTo((idealCost / price) * 100, 2) : null,
  };
}

export interface ComboTotals {
  /** Tổng giá trị nếu mua lẻ từng món (VND). */
  retailTotal: number;
  /** Tiết kiệm được khi mua combo (VND). */
  savings: number;
  /** Tổng giá vốn của các món trong combo (VND). */
  idealCost: number;
  /** selling price − ideal cost (VND). */
  contributionMargin: number;
  /** ideal cost / selling price × 100, or `null` when the price is 0. */
  foodCostPct: number | null;
}

export function calcComboTotals(
  lines: Array<{
    quantity: number | string;
    item_selling_price: number;
    item_ideal_cost: number;
  }>,
  sellingPrice: number | string | null | undefined
): ComboTotals {
  const price = num(sellingPrice);
  let retailTotal = 0;
  let idealCost = 0;

  for (const l of lines) {
    const q = num(l.quantity);
    retailTotal += q * (l.item_selling_price || 0);
    idealCost += q * (l.item_ideal_cost || 0);
  }

  const cm = price - idealCost;
  const foodCostPct = price > 0 ? (idealCost / price) * 100 : null;
  const savings = Math.max(0, retailTotal - price);

  return {
    retailTotal: roundTo(retailTotal, 2),
    savings: roundTo(savings, 2),
    idealCost: roundTo(idealCost, 2),
    contributionMargin: roundTo(cm, 2),
    foodCostPct: foodCostPct != null ? roundTo(foodCostPct, 2) : null,
  };
}

export interface PoLineTotals {
  /** `purchase_order_items.line_total` = round(quantity × unit_price, 2). */
  lineTotal: number;
  /** `purchase_order_items.base_quantity` = round(quantity × conversion_factor, 3). */
  baseQty: number;
  /** Giá vốn / đơn vị cơ sở = round(unit_price / conversion_factor, 4). */
  costPerBase: number;
}

export function calcPoLine(
  qty: number | string | null | undefined,
  unitPrice: number | string | null | undefined,
  conversionFactor: number | string | null | undefined
): PoLineTotals {
  const q = num(qty);
  const price = num(unitPrice);
  const factor = num(conversionFactor);
  return {
    lineTotal: roundTo(q * price, 2),
    baseQty: factor > 0 ? roundTo(q * factor, 3) : 0,
    costPerBase: factor > 0 ? roundTo(price / factor, 4) : 0,
  };
}

/**
 * Weighted-average cost after an import (mirrors `trg_po_items_after_insert`):
 * with no positive stock the new average is simply the import cost per base unit.
 */
export function calcNewAvgCost(
  oldStock: number | string | null | undefined,
  oldAvg: number | string | null | undefined,
  importQtyBase: number | string | null | undefined,
  importCostPerBase: number | string | null | undefined
): number {
  const stock = num(oldStock);
  const avg = num(oldAvg);
  const qty = num(importQtyBase);
  const cost = num(importCostPerBase);
  if (stock <= 0 || stock + qty <= 0) return roundTo(cost, 4);
  return roundTo((stock * avg + qty * cost) / (stock + qty), 4);
}

/** Food cost % → traffic light (DATABASE.md §7.10): danger > 35, warn 30–35. */
export function classifyFoodCost(
  pct: number | null | undefined
): "unknown" | "ok" | "warn" | "danger" {
  if (pct === null || pct === undefined || !Number.isFinite(pct)) return "unknown";
  if (pct > FOOD_COST_DANGER) return "danger";
  if (pct >= FOOD_COST_WARN) return "warn";
  return "ok";
}

/** Trạng thái kỳ lương → badge tone (nháp = vàng, đã chốt = xanh dương, đã chi trả = xanh lá). */
export function payrollStatusTone(status: PayrollStatus | null | undefined): BadgeTone {
  switch (status) {
    case "draft":
      return "warning";
    case "finalized":
      return "info";
    case "paid":
      return "success";
    default:
      return "neutral";
  }
}

/** Loại hợp đồng nhân viên → badge tone. */
export function employmentTypeTone(type: EmploymentType | null | undefined): BadgeTone {
  return type === "full_time" ? "info" : "neutral";
}

/** Kasavana-Smith class → badge tone. */
export function menuClassTone(cls: MenuClass | null | undefined): BadgeTone {
  switch (cls) {
    case "star":
      return "success";
    case "plowhorse":
      return "info";
    case "puzzle":
      return "warning";
    case "dog":
      return "danger";
    default:
      return "neutral";
  }
}

// --- DB error mapping (DATABASE.md §8) ----------------------------------------

const DB_ERROR_CODE_RE = /^([A-Z_]+):\s*([\s\S]*)$/;

/** `error.message` = `'CODE: detail'` → Vietnamese message for the user. */
export const DB_ERROR_MESSAGES: Record<string, string> = {
  ALLOCATION_UPDATE_NOT_ALLOWED: "Không thể sửa phân bổ thanh toán. Hãy xóa và ghi lại phiếu chi.",
  ALLOCATION_DELETE_NOT_ALLOWED: "Không thể xóa dòng phân bổ. Hãy xóa phiếu chi để hoàn tác.",
  ALLOCATION_EXCEEDS_PAYMENT: "Tổng phân bổ vượt quá số tiền của phiếu chi.",
  DISCOUNT_EXCEEDS_SUBTOTAL: "Giảm giá vượt quá tổng tiền hàng.",
  EXPENSE_INVALID: "Chi phí đã thanh toán phải có hình thức thanh toán và số tiền lớn hơn 0.",
  HOURS_REQUIRED: "Cần nhập số giờ làm hoặc cả giờ vào và giờ ra.",
  INGREDIENT_NOT_FOUND: "Không tìm thấy nguyên liệu.",
  INSUFFICIENT_STOCK: "Không đủ tồn kho.",
  INVALID_AMOUNT: "Số tiền không hợp lệ.",
  INVALID_CONVERSION: "Hệ số quy đổi phải lớn hơn 0.",
  INVALID_QUANTITY: "Số lượng không hợp lệ.",
  INVALID_RANGE: "Khoảng thời gian không hợp lệ.",
  INVALID_SETTING: "Giá trị cấu hình không hợp lệ.",
  INVALID_TXN_DATE: "Ngày ghi nhận không được ở tương lai.",
  INVALID_TXN_TYPE: "Loại giao dịch kho không hợp lệ.",
  LEDGER_IMMUTABLE: "Sổ kho không thể sửa hoặc xóa. Hãy tạo giao dịch điều chỉnh.",
  LEDGER_MANUAL_FORBIDDEN:
    "Không thể ghi tay dòng sổ kho này. Hãy dùng phiếu nhập, đơn hàng hoặc điều chỉnh kho.",
  MENU_ITEM_INACTIVE: "Món ăn đã ngừng bán.",
  MENU_ITEM_NOT_FOUND: "Không tìm thấy món ăn.",
  ORDER_ALREADY_CANCELLED: "Đơn hàng đã bị hủy trước đó.",
  ORDER_CANCEL_IRREVERSIBLE: "Đơn đã hủy không thể khôi phục. Hãy tạo đơn mới.",
  ORDER_CANCELLED: "Đơn hàng đã hủy, không thể thêm món.",
  ORDER_DATE_LOCKED: "Chỉ Chủ/Quản lý mới được đổi ngày của đơn đã tạo.",
  ORDER_ITEMS_IMMUTABLE: "Không thể sửa dòng đơn hàng. Hãy hủy đơn và tạo lại.",
  ORDER_ITEMS_REQUIRED: "Đơn hàng phải có ít nhất một món.",
  ORDER_NOT_FOUND: "Không tìm thấy đơn hàng.",
  PAYMENT_NOT_FOUND: "Không tìm thấy phiếu chi.",
  PAYMENT_EXCEEDS_DEBT: "Số tiền thanh toán vượt quá tổng công nợ của nhà cung cấp.",
  PAYMENT_EXCEEDS_PO_DEBT: "Số tiền thanh toán vượt quá công nợ còn lại của phiếu nhập.",
  PAYMENT_UPDATE_NOT_ALLOWED: "Không thể sửa phiếu chi. Hãy xóa và ghi lại.",
  PAYROLL_NOT_FINALIZED: "Cần chốt bảng lương trước khi chi trả.",
  PAYROLL_NO_ITEMS: "Chưa tính lương cho kỳ này. Hãy tính lương trước.",
  PAYROLL_PAYMENT_METHOD_REQUIRED: "Chọn hình thức chi lương trước khi đánh dấu đã trả.",
  PAYROLL_PERIOD_LOCKED: "Kỳ lương đã chốt, không thể chỉnh sửa hoặc xóa.",
  PAYROLL_PERIOD_NOT_FOUND: "Không tìm thấy kỳ lương.",
  PAYROLL_PERIOD_PAID: "Kỳ lương đã chi trả, không thể thay đổi.",
  PAYROLL_PERIOD_OVERLAP: "Kỳ lương bị trùng ngày với kỳ lương đã có. Hãy chọn khoảng ngày khác.",
  NET_PAY_NEGATIVE: "Thực lĩnh âm: tạm ứng hoặc phạt lớn hơn thu nhập. Hãy giảm tạm ứng hoặc phạt.",
  PERMISSION_DENIED: "Bạn không có quyền thực hiện thao tác này (cần Chủ/Quản lý).",
  PO_ITEM_DELETE_FORBIDDEN: "Chỉ Chủ/Quản lý mới được xóa dòng phiếu nhập.",
  PO_ITEM_UPDATE_NOT_ALLOWED: "Không thể sửa dòng nhập. Hãy xóa dòng và nhập lại.",
  PO_ITEMS_REQUIRED: "Phiếu nhập phải có ít nhất một dòng.",
  PO_NOT_FOUND: "Không tìm thấy phiếu nhập.",
  PO_SUPPLIER_LOCKED: "Phiếu nhập đã có thanh toán, không thể đổi nhà cung cấp.",
  PO_SUPPLIER_MISMATCH: "Phiếu nhập không thuộc nhà cung cấp đã chọn.",
  PO_TOTAL_BELOW_PAID: "Tổng phiếu nhập không thể nhỏ hơn số tiền đã thanh toán.",
  SEED_BLOCKED: "Không thể chạy dữ liệu mẫu trên cơ sở dữ liệu đang có người dùng thật.",
  SUPPLIER_NOT_FOUND: "Không tìm thấy nhà cung cấp.",
};

/** Codes whose `detail` is meaningful to the user (appended to the message). */
const DB_ERROR_WITH_DETAIL = new Set(["INSUFFICIENT_STOCK", "MENU_ITEM_INACTIVE"]);

/** Native Postgres SQLSTATE → Vietnamese message (DATABASE.md §8, cuối mục). */
export const PG_ERROR_MESSAGES: Record<string, string> = {
  "23505": "Dữ liệu đã tồn tại (mã hoặc số phiếu bị trùng).",
  "23503": "Không thể xóa: dữ liệu đang được sử dụng.",
  "23514": "Giá trị không hợp lệ.",
  "42501": "Không thể ghi trực tiếp giá trị này; hãy dùng chức năng nghiệp vụ tương ứng.",
  "23P01": "Kỳ lương bị chồng lấn với một kỳ đã có.",
  PGRST301: "Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.",
  PGRST116: "Không tìm thấy dữ liệu.",
};

/** Extract the `CODE` prefix of a DB error message, or `null` when unknown. */
export function dbErrorCode(message: string | null | undefined): string | null {
  const m = DB_ERROR_CODE_RE.exec((message ?? "").trim());
  return m ? m[1] : null;
}

export function isDbErrorCode(message: string | null | undefined, code: string): boolean {
  return dbErrorCode(message) === code;
}

/** Shape of a Supabase/PostgREST error as far as error mapping is concerned. */
export type DbErrorLike = { message?: string | null; code?: string | null };

/** Patterns of raw (English) Postgres messages that arrive without a SQLSTATE. */
const PG_MESSAGE_PATTERNS: ReadonlyArray<readonly [RegExp, string]> = [
  [/duplicate key value violates unique constraint/i, PG_ERROR_MESSAGES["23505"]],
  [/violates foreign key constraint/i, PG_ERROR_MESSAGES["23503"]],
  [/violates check constraint/i, PG_ERROR_MESSAGES["23514"]],
  [/permission denied|row-level security/i, PG_ERROR_MESSAGES["42501"]],
  [/conflicting key value violates exclusion constraint/i, "Kỳ lương bị chồng lấn với một kỳ đã có."],
  [/JWT expired|invalid claim/i, "Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại."],
  [/JWT issued at future/i, "Phiên đăng nhập đang đồng bộ thời gian. Vui lòng tải lại trang."],
];

/**
 * `'CODE: detail'` → câu tiếng Việt (docs/DATABASE.md §8).
 * Nhận cả chuỗi `message` lẫn đối tượng lỗi `{ message, code }` của Supabase,
 * để còn ánh xạ được SQLSTATE (23505, 23503...) khi trigger không ném mã nghiệp vụ.
 */
export function parseDbError(input: string | DbErrorLike | null | undefined): string {
  const raw = (typeof input === "string" ? input : (input?.message ?? "")).trim();
  const pgCode = typeof input === "string" ? null : (input?.code ?? null);

  const m = DB_ERROR_CODE_RE.exec(raw);
  if (m) {
    const code = m[1];
    const detail = m[2].trim();
    const mapped = DB_ERROR_MESSAGES[code];
    if (mapped) {
      return DB_ERROR_WITH_DETAIL.has(code) && detail ? `${mapped.replace(/\.$/, "")}: ${detail}` : mapped;
    }
    // Mã nghiệp vụ chưa được ánh xạ: không bao giờ hiện chuỗi thô cho người dùng.
    return "Đã xảy ra lỗi. Vui lòng thử lại hoặc liên hệ quản trị viên.";
  }

  if (pgCode && PG_ERROR_MESSAGES[pgCode]) return PG_ERROR_MESSAGES[pgCode];
  if (PG_ERROR_MESSAGES[raw]) return PG_ERROR_MESSAGES[raw];
  for (const [re, text] of PG_MESSAGE_PATTERNS) {
    if (re.test(raw)) return text;
  }

  if (!raw) return "Đã xảy ra lỗi. Vui lòng thử lại.";
  return raw;
}
