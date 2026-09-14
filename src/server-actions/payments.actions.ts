"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { fail, ok, type ActionResult } from "@/types/actions";
import {
  parseDbError,
  supplierPaymentSchema,
  type FunctionArgs,
  type SupplierPaymentInput,
} from "@/types/restaurant";

function revalidatePaymentScope(supplierId?: string, poIds: (string | null | undefined)[] = []) {
  revalidatePath("/payments");
  revalidatePath("/purchases");
  for (const poId of new Set(poIds.filter((v): v is string => Boolean(v)))) {
    revalidatePath(`/purchases/${poId}`);
  }
  revalidatePath("/suppliers");
  if (supplierId) revalidatePath(`/suppliers/${supplierId}`);
  revalidatePath("/dashboard");
}

/** Các phiếu nhập bị một phiếu chi chạm tới (đích danh hoặc trừ dần FIFO). */
async function allocatedPurchaseOrderIds(
  supabase: SupabaseClient<Database>,
  paymentId: string
): Promise<string[]> {
  const { data } = await supabase
    .from("supplier_payment_allocations")
    .select("purchase_order_id")
    .eq("payment_id", paymentId);
  return (data ?? []).map((r) => r.purchase_order_id);
}

/** Ghi nhận thanh toán NCC — đích danh (có `purchase_order_id`) hoặc trừ dần FIFO. */
export async function recordSupplierPayment(
  input: SupplierPaymentInput
): Promise<ActionResult<{ id: string }>> {
  const parsed = supplierPaymentSchema.safeParse(input);
  if (!parsed.success) {
    return fail("Dữ liệu không hợp lệ", parsed.error.flatten().fieldErrors);
  }

  const supabase = await createClient();
  // Các tham số optional của RPC nhận null (generated types khai báo `string | undefined`).
  const args = {
    p_supplier_id: parsed.data.supplier_id,
    p_amount: parsed.data.amount,
    p_payment_date: parsed.data.payment_date,
    p_method: parsed.data.method,
    p_purchase_order_id: parsed.data.purchase_order_id ?? null,
    p_reference: parsed.data.reference ?? null,
    p_note: parsed.data.note ?? null,
  } as unknown as FunctionArgs<"record_supplier_payment">;

  const { data, error } = await supabase.rpc("record_supplier_payment", args);

  if (error || !data) return fail(parseDbError(error));

  const touched = await allocatedPurchaseOrderIds(supabase, data);
  revalidatePaymentScope(parsed.data.supplier_id, [
    parsed.data.purchase_order_id ?? null,
    ...touched,
  ]);
  return ok({ id: data });
}

/** Hoàn tác phiếu chi: xóa payment → allocations cascade → công nợ khôi phục. */
export async function deleteSupplierPayment(
  id: string
): Promise<ActionResult<{ id: string }>> {
  const supabase = await createClient();
  const { data: payment, error: lookupError } = await supabase
    .from("supplier_payments")
    .select("supplier_id, purchase_order_id")
    .eq("id", id)
    .maybeSingle();

  if (lookupError) return fail(parseDbError(lookupError));
  if (!payment) return fail("Không tìm thấy phiếu chi.");

  // Đọc trước danh sách PO bị ảnh hưởng — allocations bị xóa cascade cùng phiếu chi.
  const touched = await allocatedPurchaseOrderIds(supabase, id);

  const { data: deleted, error } = await supabase
    .from("supplier_payments")
    .delete()
    .eq("id", id)
    .select("id")
    .maybeSingle();
  if (error) return fail(parseDbError(error));
  if (!deleted) return fail("Không tìm thấy phiếu chi.");

  revalidatePaymentScope(payment.supplier_id, [payment.purchase_order_id, ...touched]);
  return ok({ id });
}
