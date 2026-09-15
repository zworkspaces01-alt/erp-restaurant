"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { assertRole } from "@/lib/auth";
import { fail, ok, type ActionResult } from "@/types/actions";
import {
  employeeSchema,
  parseDbError,
  payrollItemAdjustSchema,
  payrollPaySchema,
  payrollPeriodSchema,
  timekeepingSchema,
  type EmployeeInput,
  type PayrollItemAdjustInput,
  type PayrollPayInput,
  type PayrollPeriodInput,
  type TablesInsert,
  type TimekeepingInput,
} from "@/types/restaurant";

const INVALID = "Dữ liệu không hợp lệ";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

/**
 * Chấm công đổi -> `generate_payroll` của các kỳ lương nháp phủ ngày đó cũng đổi.
 * DATABASE.md §7.6 yêu cầu revalidate `/payroll/[id]` cho kỳ nháp liên quan.
 */
async function revalidateDraftPayrollPeriods(
  supabase: SupabaseServerClient,
  workDate: string
): Promise<void> {
  const { data } = await supabase
    .from("payroll_periods")
    .select("id")
    .eq("status", "draft")
    .lte("period_start", workDate)
    .gte("period_end", workDate);

  for (const period of data ?? []) revalidatePath(`/payroll/${period.id}`);
}

function revalidateHr(periodId?: string, employeeId?: string) {
  revalidatePath("/payroll");
  if (periodId) revalidatePath(`/payroll/${periodId}`);
  if (employeeId) revalidatePath(`/employees/${employeeId}`);
  revalidatePath("/reports/pnl");
  revalidatePath("/dashboard");
}

// --- Employees ----------------------------------------------------------------

export async function createEmployee(input: EmployeeInput): Promise<ActionResult<{ id: string }>> {
  try {
    await assertRole(["owner", "manager"]);
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Bạn không có quyền thực hiện thao tác này");
  }

  const parsed = employeeSchema.safeParse(input);
  if (!parsed.success) return fail(INVALID, parsed.error.flatten().fieldErrors);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("employees")
    .insert(parsed.data)
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") return fail("Mã nhân viên đã tồn tại");
    return fail(parseDbError(error));
  }

  revalidatePath("/employees");
  return ok({ id: data.id });
}

export async function updateEmployee(
  id: string,
  input: EmployeeInput
): Promise<ActionResult<{ id: string }>> {
  const parsed = employeeSchema.safeParse(input);
  if (!parsed.success) return fail(INVALID, parsed.error.flatten().fieldErrors);

  const supabase = await createClient();
  const { error } = await supabase.from("employees").update(parsed.data).eq("id", id);

  if (error) {
    if (error.code === "23505") return fail("Mã nhân viên đã tồn tại");
    return fail(parseDbError(error));
  }

  revalidatePath("/employees");
  revalidatePath(`/employees/${id}`);
  return ok({ id });
}

/** Nghỉ việc / kích hoạt lại — không xóa để giữ lịch sử chấm công & lương. */
export async function setEmployeeActive(
  id: string,
  isActive: boolean
): Promise<ActionResult<{ id: string }>> {
  const supabase = await createClient();
  const { error } = await supabase.from("employees").update({ is_active: isActive }).eq("id", id);

  if (error) return fail(parseDbError(error));

  revalidatePath("/employees");
  revalidatePath(`/employees/${id}`);
  return ok({ id });
}

// --- Timekeeping --------------------------------------------------------------

/** Upsert trên `(employee_id, work_date, shift)`; bỏ trống `hours_worked` để DB tự tính. */
export async function saveTimekeeping(input: TimekeepingInput): Promise<ActionResult<{ id: string }>> {
  const parsed = timekeepingSchema.safeParse(input);
  if (!parsed.success) return fail(INVALID, parsed.error.flatten().fieldErrors);

  const { employee_id, work_date, shift, check_in, check_out, hours_worked, note } = parsed.data;

  const payload: TablesInsert<"timekeeping"> = {
    employee_id,
    work_date,
    shift,
    check_in,
    check_out,
    note,
    // NOT NULL trong schema nhưng `trg_timekeeping_before` tự tính từ giờ vào/ra khi bỏ trống.
    hours_worked: hours_worked as number,
  };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("timekeeping")
    .upsert(payload, { onConflict: "employee_id,work_date,shift" })
    .select("id")
    .single();

  if (error) return fail(parseDbError(error));

  revalidatePath("/timekeeping");
  revalidatePath(`/employees/${employee_id}`);
  revalidatePath("/payroll");
  await revalidateDraftPayrollPeriods(supabase, work_date);
  return ok({ id: data.id });
}

export async function deleteTimekeeping(id: string): Promise<ActionResult<{ id: string }>> {
  const supabase = await createClient();
  const { data: row } = await supabase
    .from("timekeeping")
    .select("employee_id, work_date")
    .eq("id", id)
    .maybeSingle();

  const { error } = await supabase.from("timekeeping").delete().eq("id", id);
  if (error) return fail(parseDbError(error));

  revalidatePath("/timekeeping");
  if (row?.employee_id) revalidatePath(`/employees/${row.employee_id}`);
  revalidatePath("/payroll");
  if (row?.work_date) await revalidateDraftPayrollPeriods(supabase, row.work_date);
  return ok({ id });
}

// --- Payroll periods ----------------------------------------------------------

export async function createPayrollPeriod(
  input: PayrollPeriodInput
): Promise<ActionResult<{ id: string }>> {
  try {
    await assertRole(["owner", "manager"]);
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Bạn không có quyền thực hiện thao tác này");
  }

  const parsed = payrollPeriodSchema.safeParse(input);
  if (!parsed.success) return fail(INVALID, parsed.error.flatten().fieldErrors);

  const supabase = await createClient();
  const { data: overlap, error: overlapError } = await supabase
    .from("payroll_periods")
    .select("id, name")
    .lte("period_start", parsed.data.period_end)
    .gte("period_end", parsed.data.period_start)
    .limit(1);

  if (overlapError) return fail(parseDbError(overlapError));
  if (overlap && overlap.length > 0) {
    return fail(`Kỳ lương bị trùng khoảng thời gian với “${overlap[0].name}”`, {
      period_start: ["Khoảng thời gian đã có kỳ lương khác"],
    });
  }

  const { data, error } = await supabase
    .from("payroll_periods")
    .insert(parsed.data)
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") return fail("Kỳ lương đã tồn tại");
    return fail(parseDbError(error));
  }

  revalidatePath("/payroll");
  return ok({ id: data.id });
}

export async function deletePayrollPeriod(id: string): Promise<ActionResult<{ id: string }>> {
  const supabase = await createClient();
  const { error } = await supabase.from("payroll_periods").delete().eq("id", id);
  if (error) return fail(parseDbError(error));

  revalidateHr(id);
  return ok({ id });
}

/** RPC `generate_payroll` — (tái) tạo bảng lương từ nhân sự + chấm công (chỉ khi nháp). */
export async function generatePayroll(periodId: string): Promise<ActionResult<{ count: number }>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("generate_payroll", { p_period_id: periodId });
  if (error) return fail(parseDbError(error));

  revalidateHr(periodId);
  return ok({ count: data?.length ?? 0 });
}

export async function finalizePayroll(periodId: string): Promise<ActionResult<{ id: string }>> {
  try {
    await assertRole(["owner", "manager"]);
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Bạn không có quyền thực hiện thao tác này");
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("finalize_payroll", { p_period_id: periodId });
  if (error) return fail(parseDbError(error));

  revalidateHr(periodId);
  return ok({ id: periodId });
}

/** `finalized → draft` (chỉ Chủ/Quản lý). */
export async function reopenPayroll(periodId: string): Promise<ActionResult<{ id: string }>> {
  try {
    await assertRole(["owner", "manager"]);
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Bạn không có quyền thực hiện thao tác này");
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("reopen_payroll", { p_period_id: periodId });
  if (error) return fail(parseDbError(error));

  revalidateHr(periodId);
  return ok({ id: periodId });
}

export async function payPayroll(
  periodId: string,
  input: PayrollPayInput
): Promise<ActionResult<{ id: string }>> {
  try {
    await assertRole(["owner"]);
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Chỉ Chủ nhà hàng mới có quyền chi trả lương");
  }

  const parsed = payrollPaySchema.safeParse(input);
  if (!parsed.success) return fail(INVALID, parsed.error.flatten().fieldErrors);

  const supabase = await createClient();
  const { error } = await supabase.rpc("pay_payroll", {
    p_period_id: periodId,
    p_method: parsed.data.method,
    ...(parsed.data.paid_at ? { p_paid_at: parsed.data.paid_at } : {}),
  });
  if (error) return fail(parseDbError(error));

  revalidateHr(periodId);
  revalidatePath("/employees");
  return ok({ id: periodId });
}

/** Chỉnh thưởng/tip/tạm ứng/khấu trừ của một dòng lương (chỉ khi kỳ còn nháp). */
export async function adjustPayrollItem(
  itemId: string,
  input: PayrollItemAdjustInput
): Promise<ActionResult<{ id: string }>> {
  const parsed = payrollItemAdjustSchema.safeParse(input);
  if (!parsed.success) return fail(INVALID, parsed.error.flatten().fieldErrors);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("payroll_items")
    .update(parsed.data)
    .eq("id", itemId)
    .select("payroll_period_id, employee_id")
    .single();

  if (error) return fail(parseDbError(error));

  revalidateHr(data.payroll_period_id, data.employee_id);
  return ok({ id: itemId });
}
