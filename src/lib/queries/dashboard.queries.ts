import { createClient } from "@/lib/supabase/server";

export async function getDashboardData() {
  const supabase = await createClient();

  const [statsRes, lowStockRes, recentOrdersRes, overdueDebtRes] = await Promise.all([
    supabase.rpc("get_dashboard_stats"),
    supabase
      .from("ingredients")
      .select("id, code, name, category, current_stock, min_alert_stock, base_unit, avg_cost_price")
      .filter("current_stock", "lte", "min_alert_stock")
      .order("current_stock", { ascending: true })
      .limit(6),
    supabase
      .from("orders")
      .select("id, order_number, table_number, total_amount, total_cogs, payment_method, status, order_date")
      .order("order_date", { ascending: false })
      .limit(6),
    supabase
      .from("purchase_orders")
      .select("id, po_number, total_amount, paid_amount, due_date, suppliers(name)")
      .in("payment_status", ["unpaid", "partial"])
      .order("due_date", { ascending: true })
      .limit(6),
  ]);

  return {
    stats: statsRes.data as {
      today_revenue: number;
      today_orders: number;
      today_cogs: number;
      today_gross_profit: number;
      month_revenue: number;
      month_cogs: number;
      month_gross_profit: number;
      month_net_profit: number;
      low_stock_count: number;
      total_supplier_debt: number;
      overdue_po_count: number;
    } | null,
    lowStock: lowStockRes.data ?? [],
    recentOrders: recentOrdersRes.data ?? [],
    overdueDebt: overdueDebtRes.data ?? [],
  };
}
