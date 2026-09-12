"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { fail, ok, type ActionResult } from "@/types/actions";
import { supplierPaymentSchema, type SupplierPaymentInput } from "@/types/restaurant";

export async function recordSupplierPaymentAction(
  input: SupplierPaymentInput
): Promise<ActionResult<{ payment_id: string }>> {
  const parsed = supplierPaymentSchema.safeParse(input);
  if (!parsed.success) {
    return fail("Dữ liệu không hợp lệ", parsed.error.flatten().fieldErrors);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("record_supplier_payment", {
    p_supplier_id: parsed.data.supplier_id,
    p_amount: parsed.data.amount,
    p_purchase_order_id: parsed.data.purchase_order_id || undefined,
    p_payment_method: parsed.data.payment_method,
    p_notes: parsed.data.notes || undefined,
  });

  if (error) return fail(error.message);

  const res = data as { payment_id: string };

  revalidatePath("/payments");
  revalidatePath("/purchases");
  revalidatePath("/suppliers");
  revalidatePath("/dashboard");
  return ok({ payment_id: res.payment_id });
}
