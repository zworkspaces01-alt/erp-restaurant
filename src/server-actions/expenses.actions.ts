"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { fail, ok, type ActionResult } from "@/types/actions";
import {
  expenseCategorySchema,
  expenseRecordSchema,
  markExpensePaidSchema,
  parseDbError,
  type ExpenseCategoryInput,
  type ExpenseRecordInput,
  type MarkExpensePaidInput,
} from "@/types/restaurant";

const INVALID = "Dữ liệu không hợp lệ";

/** `paid_at` do trigger `trg_expense_records_before` quản lý — không ghi từ app. */
function toRecordValues(data: ExpenseRecordInput) {
  return {
    category_id: data.category_id,
    title: data.title,
    amount: data.amount,
    expense_date: data.expense_date,
    status: data.status,
    payment_method: data.payment_method || null,
    vendor: data.vendor,
    invoice_number: data.invoice_number,
    attachment_url: data.attachment_url,
    note: data.note,
  };
}

function revalidateExpenses() {
  revalidatePath("/expenses");
  revalidatePath("/reports/pnl");
  revalidatePath("/dashboard");
}

/** Ghi nhận một hóa đơn chi phí mới. `paid_at` do trigger tự set. */
export async function createExpenseRecord(
  input: ExpenseRecordInput
): Promise<ActionResult<{ id: string }>> {
  const parsed = expenseRecordSchema.safeParse(input);
  if (!parsed.success) return fail(INVALID, parsed.error.flatten().fieldErrors);

  const values = toRecordValues(parsed.data);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("expense_records")
    .insert(values)
    .select("id")
    .single();

  if (error) return fail(parseDbError(error));

  revalidateExpenses();
  return ok({ id: data.id });
}

/** Cập nhật hóa đơn chi phí. */
export async function updateExpenseRecord(
  id: string,
  input: ExpenseRecordInput
): Promise<ActionResult<{ id: string }>> {
  const parsed = expenseRecordSchema.safeParse(input);
  if (!parsed.success) return fail(INVALID, parsed.error.flatten().fieldErrors);

  const values = toRecordValues(parsed.data);
  const supabase = await createClient();
  const { error } = await supabase.from("expense_records").update(values).eq("id", id);

  if (error) return fail(parseDbError(error));

  revalidateExpenses();
  return ok({ id });
}

/** Đánh dấu đã chi: status = paid + phương thức thanh toán (paid_at do trigger stamp). */
export async function markExpensePaid(
  input: MarkExpensePaidInput
): Promise<ActionResult<{ id: string }>> {
  const parsed = markExpensePaidSchema.safeParse(input);
  if (!parsed.success) return fail(INVALID, parsed.error.flatten().fieldErrors);

  const { id, payment_method } = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase
    .from("expense_records")
    .update({
      status: "paid",
      payment_method,
    })
    .eq("id", id);

  if (error) return fail(parseDbError(error));

  revalidateExpenses();
  return ok({ id });
}

/** Xóa hóa đơn chi phí. */
export async function deleteExpenseRecord(id: string): Promise<ActionResult<{ id: string }>> {
  const supabase = await createClient();
  const { error } = await supabase.from("expense_records").delete().eq("id", id);

  if (error) return fail(parseDbError(error));

  revalidateExpenses();
  return ok({ id });
}

/** Tạo danh mục chi phí. */
export async function createExpenseCategory(
  input: ExpenseCategoryInput
): Promise<ActionResult<{ id: string }>> {
  const parsed = expenseCategorySchema.safeParse(input);
  if (!parsed.success) return fail(INVALID, parsed.error.flatten().fieldErrors);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("expense_categories")
    .insert(parsed.data)
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") return fail("Tên nhóm chi phí đã tồn tại");
    return fail(parseDbError(error));
  }

  revalidatePath("/expenses/categories");
  revalidateExpenses();
  return ok({ id: data.id });
}

/** Cập nhật danh mục chi phí. */
export async function updateExpenseCategory(
  id: string,
  input: ExpenseCategoryInput
): Promise<ActionResult<{ id: string }>> {
  const parsed = expenseCategorySchema.safeParse(input);
  if (!parsed.success) return fail(INVALID, parsed.error.flatten().fieldErrors);

  const supabase = await createClient();
  const { error } = await supabase.from("expense_categories").update(parsed.data).eq("id", id);

  if (error) {
    if (error.code === "23505") return fail("Tên nhóm chi phí đã tồn tại");
    return fail(parseDbError(error));
  }

  revalidatePath("/expenses/categories");
  revalidateExpenses();
  return ok({ id });
}

/** Xóa danh mục chi phí (chỉ khi chưa phát sinh hóa đơn). */
export async function deleteExpenseCategory(id: string): Promise<ActionResult<{ id: string }>> {
  const supabase = await createClient();
  const { error } = await supabase.from("expense_categories").delete().eq("id", id);

  if (error) {
    if (error.code === "23503") {
      return fail("Danh mục đang có hóa đơn chi phí, hãy tắt hoạt động thay vì xóa");
    }
    return fail(parseDbError(error));
  }

  revalidatePath("/expenses/categories");
  revalidateExpenses();
  return ok({ id });
}
