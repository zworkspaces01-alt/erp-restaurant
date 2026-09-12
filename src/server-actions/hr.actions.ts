"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { fail, ok, type ActionResult } from "@/types/actions";
import {
  employeeSchema,
  timekeepingSchema,
  type EmployeeInput,
  type TimekeepingInput,
} from "@/types/restaurant";

export async function createEmployee(
  input: EmployeeInput
): Promise<ActionResult<{ id: string }>> {
  const parsed = employeeSchema.safeParse(input);
  if (!parsed.success) {
    return fail("Dữ liệu không hợp lệ", parsed.error.flatten().fieldErrors);
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("employees")
    .insert(parsed.data)
    .select("id")
    .single();

  if (error) {
    return fail(error.code === "23505" ? "Mã nhân viên đã tồn tại" : error.message);
  }

  revalidatePath("/employees");
  return ok({ id: data.id });
}

export async function updateEmployee(
  id: string,
  input: EmployeeInput
): Promise<ActionResult<void>> {
  const parsed = employeeSchema.safeParse(input);
  if (!parsed.success) {
    return fail("Dữ liệu không hợp lệ", parsed.error.flatten().fieldErrors);
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("employees")
    .update(parsed.data)
    .eq("id", id);

  if (error) return fail(error.message);

  revalidatePath("/employees");
  revalidatePath(`/employees/${id}`);
  return ok(undefined);
}

export async function recordTimekeeping(
  input: TimekeepingInput
): Promise<ActionResult<void>> {
  const parsed = timekeepingSchema.safeParse(input);
  if (!parsed.success) {
    return fail("Dữ liệu không hợp lệ", parsed.error.flatten().fieldErrors);
  }

  const supabase = await createClient();
  const { error } = await supabase.from("timekeeping").upsert(
    {
      employee_id: parsed.data.employee_id,
      work_date: parsed.data.work_date,
      shift: parsed.data.shift,
      hours_worked: parsed.data.hours_worked,
      status: parsed.data.status,
      notes: parsed.data.notes ?? null,
    },
    { onConflict: "employee_id, work_date" }
  );

  if (error) return fail(error.message);

  revalidatePath("/timekeeping");
  return ok(undefined);
}

export async function createPayrollPeriod(
  periodName: string,
  startDate: string,
  endDate: string
): Promise<ActionResult<{ id: string }>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("payroll_periods")
    .insert({
      period_name: periodName,
      start_date: startDate,
      end_date: endDate,
      status: "draft",
    })
    .select("id")
    .single();

  if (error) return fail(error.message);

  revalidatePath("/payroll");
  return ok({ id: data.id });
}

export async function generatePayrollAction(
  periodId: string
): Promise<ActionResult<void>> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("generate_payroll", {
    p_period_id: periodId,
  });

  if (error) return fail(error.message);

  revalidatePath("/payroll");
  revalidatePath(`/payroll/${periodId}`);
  return ok(undefined);
}

export async function finalizePayrollAction(
  periodId: string
): Promise<ActionResult<void>> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("finalize_payroll", {
    p_period_id: periodId,
  });

  if (error) return fail(error.message);

  revalidatePath("/payroll");
  revalidatePath(`/payroll/${periodId}`);
  return ok(undefined);
}

export async function payPayrollAction(
  periodId: string
): Promise<ActionResult<void>> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("pay_payroll", {
    p_period_id: periodId,
  });

  if (error) return fail(error.message);

  revalidatePath("/payroll");
  revalidatePath(`/payroll/${periodId}`);
  return ok(undefined);
}
