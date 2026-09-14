import "server-only";

import { createClient } from "@/lib/supabase/server";
import type {
  ExpenseCategory,
  ExpenseRecord,
  ExpenseStatus,
  ExpenseType,
} from "@/types/restaurant";

export interface ExpenseRow extends ExpenseRecord {
  category_name: string;
  category_type: ExpenseType;
}

export interface ExpenseCategoryRow extends ExpenseCategory {
  /** Số hóa đơn chi phí đang tham chiếu danh mục này. */
  record_count: number;
}

export interface ExpenseTotals {
  pending_amount: number;
  pending_count: number;
  paid_amount: number;
  paid_count: number;
  total_amount: number;
  fixed_amount: number;
  variable_amount: number;
}

export interface ExpenseFilters {
  /** Tháng dạng YYYY-MM. */
  month?: string;
  categoryId?: string;
  status?: ExpenseStatus;
}

/** Đầu và cuối tháng (YYYY-MM-DD) cho một chuỗi YYYY-MM. */
export function monthRange(month: string): { from: string; to: string } {
  const [y, m] = month.split("-").map(Number);
  const year = Number.isFinite(y) ? y : new Date().getFullYear();
  const mon = Number.isFinite(m) && m >= 1 && m <= 12 ? m : new Date().getMonth() + 1;
  const last = new Date(Date.UTC(year, mon, 0)).getUTCDate();
  const mm = String(mon).padStart(2, "0");
  return { from: `${year}-${mm}-01`, to: `${year}-${mm}-${String(last).padStart(2, "0")}` };
}

/** Tháng hiện tại dạng YYYY-MM. */
export function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** Chuẩn hóa tham số tháng từ searchParams. */
export function normalizeMonth(value: string | string[] | undefined): string {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw && /^\d{4}-(0[1-9]|1[0-2])$/.test(raw) ? raw : currentMonth();
}

interface ExpenseJoinRow extends ExpenseRecord {
  expense_categories: { name: string; expense_type: ExpenseType } | null;
}

/** Danh sách chi phí trong tháng (kèm tên & loại danh mục). */
export async function getExpenses(filters: ExpenseFilters = {}): Promise<ExpenseRow[]> {
  const supabase = await createClient();
  const { from, to } = monthRange(filters.month ?? currentMonth());

  let query = supabase
    .from("expense_records")
    .select("*, expense_categories(name, expense_type)")
    .gte("expense_date", from)
    .lte("expense_date", to)
    .order("expense_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (filters.categoryId) query = query.eq("category_id", filters.categoryId);
  if (filters.status) query = query.eq("status", filters.status);

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => {
    const { expense_categories, ...rest } = row as ExpenseJoinRow;
    return {
      ...rest,
      category_name: expense_categories?.name ?? "Không xác định",
      category_type: expense_categories?.expense_type ?? "variable",
    };
  });
}

/** Tổng hợp chi phí của danh sách đã lọc. */
export function summarizeExpenses(rows: ExpenseRow[]): ExpenseTotals {
  return rows.reduce<ExpenseTotals>(
    (acc, row) => {
      const amount = Number(row.amount) || 0;
      acc.total_amount += amount;
      if (row.status === "paid") {
        acc.paid_amount += amount;
        acc.paid_count += 1;
      } else {
        acc.pending_amount += amount;
        acc.pending_count += 1;
      }
      if (row.category_type === "fixed") acc.fixed_amount += amount;
      else acc.variable_amount += amount;
      return acc;
    },
    {
      pending_amount: 0,
      pending_count: 0,
      paid_amount: 0,
      paid_count: 0,
      total_amount: 0,
      fixed_amount: 0,
      variable_amount: 0,
    }
  );
}

/** Danh mục chi phí (mặc định tất cả, kể cả đã tắt). */
export async function getExpenseCategories(activeOnly = false): Promise<ExpenseCategory[]> {
  const supabase = await createClient();
  let query = supabase
    .from("expense_categories")
    .select("*")
    .order("expense_type", { ascending: true })
    .order("name", { ascending: true });

  if (activeOnly) query = query.eq("is_active", true);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data ?? [];
}

/** Danh mục kèm số hóa đơn chi phí đang dùng (để chặn xóa nhầm). */
export async function getExpenseCategoriesWithUsage(): Promise<ExpenseCategoryRow[]> {
  const supabase = await createClient();
  const [categories, records] = await Promise.all([
    getExpenseCategories(),
    supabase.from("expense_records").select("category_id"),
  ]);

  if (records.error) throw new Error(records.error.message);

  const counts = new Map<string, number>();
  for (const row of records.data ?? []) {
    counts.set(row.category_id, (counts.get(row.category_id) ?? 0) + 1);
  }

  return categories.map((category) => ({
    ...category,
    record_count: counts.get(category.id) ?? 0,
  }));
}
