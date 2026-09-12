"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { fail, ok, type ActionResult } from "@/types/actions";
import {
  purchaseOrderSchema,
  supplierSchema,
  type PurchaseOrderInput,
  type SupplierInput,
} from "@/types/restaurant";

export async function createSupplier(
  input: SupplierInput
): Promise<ActionResult<{ id: string }>> {
  const parsed = supplierSchema.safeParse(input);
  if (!parsed.success) {
    return fail("Dữ liệu không hợp lệ", parsed.error.flatten().fieldErrors);
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("suppliers")
    .insert(parsed.data)
    .select("id")
    .single();

  if (error) {
    return fail(error.code === "23505" ? "Mã nhà cung cấp đã tồn tại" : error.message);
  }

  revalidatePath("/suppliers");
  return ok({ id: data.id });
}

export async function updateSupplier(
  id: string,
  input: SupplierInput
): Promise<ActionResult<void>> {
  const parsed = supplierSchema.safeParse(input);
  if (!parsed.success) {
    return fail("Dữ liệu không hợp lệ", parsed.error.flatten().fieldErrors);
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("suppliers")
    .update(parsed.data)
    .eq("id", id);

  if (error) return fail(error.message);

  revalidatePath("/suppliers");
  revalidatePath(`/suppliers/${id}`);
  return ok(undefined);
}

export async function createPurchaseOrderAction(
  input: PurchaseOrderInput
): Promise<ActionResult<{ id: string }>> {
  const parsed = purchaseOrderSchema.safeParse(input);
  if (!parsed.success) {
    return fail("Dữ liệu không hợp lệ", parsed.error.flatten().fieldErrors);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_purchase_order", {
    p_supplier_id: parsed.data.supplier_id,
    p_order_date: parsed.data.order_date,
    p_items: parsed.data.items,
    p_paid_amount: parsed.data.paid_amount,
    p_notes: parsed.data.notes || undefined,
  });

  if (error) return fail(error.message);

  const res = data as { purchase_order_id: string };

  revalidatePath("/purchases");
  revalidatePath("/suppliers");
  revalidatePath("/inventory");
  revalidatePath("/dashboard");
  return ok({ id: res.purchase_order_id });
}
