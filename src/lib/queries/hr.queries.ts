import { createClient } from "@/lib/supabase/server";

export async function getEmployees() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("employees")
    .select("*")
    .order("status", { ascending: true })
    .order("full_name", { ascending: true });

  if (error) throw new Error(error.message);
  return data;
}

export async function getEmployeeDetail(id: string) {
  const supabase = await createClient();
  const [empRes, timeRes, payRes] = await Promise.all([
    supabase.from("employees").select("*").eq("id", id).single(),
    supabase
      .from("timekeeping")
      .select("*")
      .eq("employee_id", id)
      .order("work_date", { ascending: false })
      .limit(30),
    supabase
      .from("payroll_items")
      .select("*, payroll_periods(period_name, start_date, end_date)")
      .eq("employee_id", id)
      .order("created_at", { ascending: false })
      .limit(12),
  ]);

  if (empRes.error) return null;
  return {
    employee: empRes.data,
    timekeeping: timeRes.data ?? [],
    payrollHistory: payRes.data ?? [],
  };
}

export async function getTimekeeping(dateStr?: string) {
  const supabase = await createClient();
  const targetDate = dateStr ?? new Date().toISOString().split("T")[0];

  const [employeesRes, timekeepingRes] = await Promise.all([
    supabase.from("employees").select("*").eq("status", "active").order("full_name"),
    supabase.from("timekeeping").select("*").eq("work_date", targetDate),
  ]);

  return {
    targetDate,
    employees: employeesRes.data ?? [],
    timekeeping: timekeepingRes.data ?? [],
  };
}

export async function getPayrollPeriods() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("payroll_periods")
    .select("*")
    .order("start_date", { ascending: false });

  if (error) throw new Error(error.message);
  return data;
}

export async function getPayrollPeriodDetail(id: string) {
  const supabase = await createClient();
  const [periodRes, itemsRes] = await Promise.all([
    supabase.from("payroll_periods").select("*").eq("id", id).single(),
    supabase
      .from("payroll_items")
      .select("*, employees(full_name, code, role, employment_type, base_salary, allowance)")
      .eq("payroll_period_id", id),
  ]);

  if (periodRes.error) return null;
  return {
    period: periodRes.data,
    items: itemsRes.data ?? [],
  };
}
