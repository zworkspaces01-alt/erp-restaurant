import { createClient } from "@/lib/supabase/server";

export async function getOrders(limit = 100) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("orders")
    .select("*, order_items(count)")
    .order("order_date", { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);
  return data;
}

export async function getOrderDetail(id: string) {
  const supabase = await createClient();
  const [orderRes, itemsRes] = await Promise.all([
    supabase.from("orders").select("*").eq("id", id).single(),
    supabase
      .from("order_items")
      .select("*, menu_items(name, code, category)")
      .eq("order_id", id),
  ]);

  if (orderRes.error) return null;
  return {
    order: orderRes.data,
    items: itemsRes.data ?? [],
  };
}
