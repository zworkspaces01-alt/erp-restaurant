import { createClient } from "@/lib/supabase/server";

export async function getSuppliers() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("suppliers")
    .select("*")
    .order("name", { ascending: true });

  if (error) throw new Error(error.message);
  return data;
}

export async function getSupplierDetail(id: string) {
  const supabase = await createClient();
  const [supplierRes, poRes, paymentsRes] = await Promise.all([
    supabase.from("suppliers").select("*").eq("id", id).single(),
    supabase
      .from("purchase_orders")
      .select("*")
      .eq("supplier_id", id)
      .order("order_date", { ascending: false }),
    supabase
      .from("supplier_payments")
      .select("*")
      .eq("supplier_id", id)
      .order("payment_date", { ascending: false }),
  ]);

  if (supplierRes.error) return null;
  return {
    supplier: supplierRes.data,
    purchaseOrders: poRes.data ?? [],
    payments: paymentsRes.data ?? [],
  };
}

export async function getPurchaseOrders() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("purchase_orders")
    .select("*, suppliers(name, code, payment_terms)")
    .order("order_date", { ascending: false });

  if (error) throw new Error(error.message);
  return data;
}

export async function getPurchaseOrderDetail(id: string) {
  const supabase = await createClient();
  const [poRes, itemsRes, paymentsRes] = await Promise.all([
    supabase
      .from("purchase_orders")
      .select("*, suppliers(name, code, phone, address, payment_terms)")
      .eq("id", id)
      .single(),
    supabase
      .from("purchase_order_items")
      .select("*, ingredients(name, code, base_unit)")
      .eq("purchase_order_id", id),
    supabase
      .from("supplier_payments")
      .select("*")
      .eq("purchase_order_id", id),
  ]);

  if (poRes.error) return null;
  return {
    po: poRes.data,
    items: itemsRes.data ?? [],
    payments: paymentsRes.data ?? [],
  };
}

export async function getSupplierPayments() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("supplier_payments")
    .select("*, suppliers(name, code), purchase_orders(po_number)")
    .order("payment_date", { ascending: false });

  if (error) throw new Error(error.message);
  return data;
}
