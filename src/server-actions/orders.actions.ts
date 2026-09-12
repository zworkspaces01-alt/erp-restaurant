"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { fail, ok, type ActionResult } from "@/types/actions";
import { orderCreateSchema, type OrderCreateInput } from "@/types/restaurant";

export async function createOrderAction(
  input: OrderCreateInput
): Promise<ActionResult<{ order_id: string }>> {
  const parsed = orderCreateSchema.safeParse(input);
  if (!parsed.success) {
    return fail("Dữ liệu không hợp lệ", parsed.error.flatten().fieldErrors);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_order", {
    p_table_number: parsed.data.table_number,
    p_items: parsed.data.items,
    p_payment_method: parsed.data.payment_method,
    p_notes: parsed.data.notes || undefined,
  });

  if (error) return fail(error.message);

  const res = data as { order_id: string };

  revalidatePath("/orders");
  revalidatePath("/inventory");
  revalidatePath("/dashboard");
  revalidatePath("/menu/engineering");
  return ok({ order_id: res.order_id });
}

export async function cancelOrderAction(
  orderId: string
): Promise<ActionResult<void>> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_order", {
    p_order_id: orderId,
  });

  if (error) return fail(error.message);

  revalidatePath("/orders");
  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/inventory");
  revalidatePath("/dashboard");
  return ok(undefined);
}
