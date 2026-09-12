"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { fail, ok, type ActionResult } from "@/types/actions";
import { expenseRecordSchema, type ExpenseRecordInput } from "@/types/restaurant";

export async function createExpenseRecord(
  input: ExpenseRecordInput
): Promise<ActionResult<{ id: string }>> {
  const parsed = expenseRecordSchema.safeParse(input);
  if (!parsed.success) {
    return fail("Dữ liệu không hợp lệ", parsed.error.flatten().fieldErrors);
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("expense_records")
    .insert(parsed.data)
    .select("id")
    .single();

  if (error) return fail(error.message);

  revalidatePath("/expenses");
  revalidatePath("/dashboard");
  revalidatePath("/reports/pnl");
  return ok({ id: data.id });
}

export async function createExpenseCategory(
  code: string,
  name: string,
  description?: string
): Promise<ActionResult<{ id: string }>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("expense_categories")
    .insert({ code, name, description: description ?? null })
    .select("id")
    .single();

  if (error) {
    return fail(error.code === "23505" ? "Mã danh mục đã tồn tại" : error.message);
  }

  revalidatePath("/expenses/categories");
  return ok({ id: data.id });
}
