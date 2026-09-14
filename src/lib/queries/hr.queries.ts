import "server-only";

import { createClient } from "@/lib/supabase/server";
import type {
  Employee,
  EmploymentType,
  PayrollItem,
  PayrollPeriod,
  PayrollStatus,
  Timekeeping,
} from "@/types/restaurant";

/** Lightweight employee reference used by pickers / joined rows. */
export interface EmployeeRef {
  id: string;
  code: string | null;
  full_name: string;
  position: string | null;
  employment_type: EmploymentType;
}

/** `Date` -> `yyyy-MM-dd` (dùng cho bộ lọc ngày của PostgREST). */
function toISODate(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

const EMPLOYEE_REF_COLUMNS = "id, code, full_name, position, employment_type";

export async function getEmployees(): Promise<Employee[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("employees")
    .select("*")
    .order("is_active", { ascending: false })
    .order("full_name", { ascending: true });

  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getActiveEmployees(): Promise<EmployeeRef[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("employees")
    .select(EMPLOYEE_REF_COLUMNS)
    .eq("is_active", true)
    .order("full_name", { ascending: true });

  if (error) throw new Error(error.message);
  return data ?? [];
}

/** A `payroll_items` row with its period header (employee profile history). */
export interface PayrollHistoryRow extends PayrollItem {
  payroll_periods: Pick<PayrollPeriod, "id" | "name" | "period_start" | "period_end" | "status"> | null;
}

export interface EmployeeDetail {
  employee: Employee;
  timekeeping: Timekeeping[];
  payrollHistory: PayrollHistoryRow[];
  totalHours30d: number;
}

export async function getEmployeeDetail(id: string): Promise<EmployeeDetail | null> {
  const supabase = await createClient();
  // Mốc 30 ngày gần nhất (tính theo ngày, không theo số dòng chấm công).
  const since = new Date();
  since.setDate(since.getDate() - 29);
  const since30d = toISODate(since);

  const [empRes, timeRes, payRes, hoursRes] = await Promise.all([
    supabase.from("employees").select("*").eq("id", id).maybeSingle(),
    supabase
      .from("timekeeping")
      .select("*")
      .eq("employee_id", id)
      .order("work_date", { ascending: false })
      .limit(30),
    supabase
      .from("payroll_items")
      .select("*, payroll_periods(id, name, period_start, period_end, status)")
      .eq("employee_id", id)
      .order("created_at", { ascending: false })
      .limit(12),
    supabase
      .from("timekeeping")
      .select("hours_worked")
      .eq("employee_id", id)
      .gte("work_date", since30d),
  ]);

  if (empRes.error) throw new Error(empRes.error.message);
  if (!empRes.data) return null;
  if (timeRes.error) throw new Error(timeRes.error.message);
  if (payRes.error) throw new Error(payRes.error.message);
  if (hoursRes.error) throw new Error(hoursRes.error.message);

  const timekeeping = timeRes.data ?? [];
  const payrollHistory = (payRes.data ?? []) as PayrollHistoryRow[];
  payrollHistory.sort((a, b) =>
    (b.payroll_periods?.period_start ?? "").localeCompare(a.payroll_periods?.period_start ?? "")
  );

  return {
    employee: empRes.data,
    timekeeping,
    payrollHistory,
    totalHours30d: (hoursRes.data ?? []).reduce((sum, t) => sum + Number(t.hours_worked), 0),
  };
}

// --- Timekeeping --------------------------------------------------------------

/** A timekeeping row joined with its employee. */
export interface TimekeepingRow extends Timekeeping {
  employees: EmployeeRef | null;
}

export interface TimekeepingPage {
  rows: TimekeepingRow[];
  employees: EmployeeRef[];
  from: string;
  to: string;
  totalHours: number;
}

/** `from`/`to` are inclusive ISO dates (`yyyy-MM-dd`). */
export async function getTimekeeping(from: string, to: string): Promise<TimekeepingPage> {
  const supabase = await createClient();
  const [rowsRes, employees] = await Promise.all([
    supabase
      .from("timekeeping")
      .select(`*, employees(${EMPLOYEE_REF_COLUMNS})`)
      .gte("work_date", from)
      .lte("work_date", to)
      .order("work_date", { ascending: false })
      .order("check_in", { ascending: true, nullsFirst: false }),
    getActiveEmployees(),
  ]);

  if (rowsRes.error) throw new Error(rowsRes.error.message);
  const rows = (rowsRes.data ?? []) as TimekeepingRow[];

  return {
    rows,
    employees,
    from,
    to,
    totalHours: rows.reduce((sum, r) => sum + Number(r.hours_worked), 0),
  };
}

// --- Payroll ------------------------------------------------------------------

export interface PayrollPeriodRow extends PayrollPeriod {
  itemCount: number;
}

export async function getPayrollPeriods(): Promise<PayrollPeriodRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("payroll_periods")
    .select("*, payroll_items(id)")
    .order("period_start", { ascending: false });

  if (error) throw new Error(error.message);

  return (data ?? []).map(({ payroll_items, ...period }) => ({
    ...period,
    itemCount: Array.isArray(payroll_items) ? payroll_items.length : 0,
  }));
}

/** A `payroll_items` row with its employee (period detail table). */
export interface PayrollItemRow extends PayrollItem {
  employees: EmployeeRef | null;
}

export interface PayrollPeriodDetail {
  period: PayrollPeriod;
  items: PayrollItemRow[];
  status: PayrollStatus;
}

export async function getPayrollPeriodDetail(id: string): Promise<PayrollPeriodDetail | null> {
  const supabase = await createClient();
  const [periodRes, itemsRes] = await Promise.all([
    supabase.from("payroll_periods").select("*").eq("id", id).maybeSingle(),
    supabase
      .from("payroll_items")
      .select(`*, employees(${EMPLOYEE_REF_COLUMNS})`)
      .eq("payroll_period_id", id),
  ]);

  if (periodRes.error) throw new Error(periodRes.error.message);
  if (!periodRes.data) return null;
  if (itemsRes.error) throw new Error(itemsRes.error.message);

  const items = (itemsRes.data ?? []) as PayrollItemRow[];
  items.sort((a, b) => (a.employees?.full_name ?? "").localeCompare(b.employees?.full_name ?? "", "vi"));

  return { period: periodRes.data, items, status: periodRes.data.status };
}
