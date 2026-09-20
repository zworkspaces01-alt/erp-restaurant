import "server-only";

import { createClient } from "@/lib/supabase/server";
import { parseDbError } from "@/types/restaurant";
import type {
  DailySalesRow,
  DashboardStats,
  InventoryStatusRow,
  MenuEngineeringRow,
  PurchaseOrderSummaryRow,
} from "@/types/restaurant";

export type DashboardLowStockRow = Pick<
  InventoryStatusRow,
  | "id"
  | "code"
  | "name"
  | "category"
  | "base_unit"
  | "current_stock"
  | "min_alert_stock"
  | "stock_value"
  | "is_below_min"
  | "default_supplier_name"
>;

export type DashboardOverduePoRow = Pick<
  PurchaseOrderSummaryRow,
  | "id"
  | "po_number"
  | "supplier_name"
  | "order_date"
  | "due_date"
  | "total_amount"
  | "debt_amount"
  | "payment_status"
  | "days_overdue"
>;

export type DashboardTopItemRow = Pick<
  MenuEngineeringRow,
  "id" | "code" | "name" | "category" | "qty_sold" | "revenue" | "avg_cm" | "menu_class"
>;

/** One point of the daily sales chart (zero-filled for days without orders). */
export interface DailySalesPoint {
  sales_date: string;
  order_count: number;
  revenue: number;
  cogs: number;
  gross_profit: number;
}

export interface DashboardData {
  stats: DashboardStats | null;
  dailySales: DailySalesPoint[];
  lowStock: DashboardLowStockRow[];
  overduePos: DashboardOverduePoRow[];
  topItems: DashboardTopItemRow[];
}

function num(value: number | string | null | undefined): number {
  const n = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function isoDate(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function shiftDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return isoDate(d);
}

/** Fill the missing calendar days of `rows` with zeros so the chart has a continuous axis. */
export function fillDailySales(
  rows: Pick<DailySalesRow, "sales_date" | "order_count" | "revenue" | "cogs" | "gross_profit">[],
  startDate: string,
  endDate: string
): DailySalesPoint[] {
  const byDate = new Map<string, DailySalesPoint>();
  for (const row of rows) {
    if (!row.sales_date) continue;
    byDate.set(row.sales_date, {
      sales_date: row.sales_date,
      order_count: num(row.order_count),
      revenue: num(row.revenue),
      cogs: num(row.cogs),
      gross_profit: num(row.gross_profit),
    });
  }

  const points: DailySalesPoint[] = [];
  for (let cursor = startDate; cursor <= endDate; cursor = shiftDays(cursor, 1)) {
    points.push(
      byDate.get(cursor) ?? {
        sales_date: cursor,
        order_count: 0,
        revenue: 0,
        cogs: 0,
        gross_profit: 0,
      }
    );
  }
  return points;
}

const LOW_STOCK_COLUMNS =
  "id, code, name, category, base_unit, current_stock, min_alert_stock, stock_value, is_below_min, default_supplier_name";
const OVERDUE_PO_COLUMNS =
  "id, po_number, supplier_name, order_date, due_date, total_amount, debt_amount, payment_status, days_overdue";
const TOP_ITEM_COLUMNS = "id, code, name, category, qty_sold, revenue, avg_cm, menu_class";

/** Everything `/dashboard` needs, fetched in parallel. */
export async function getDashboardData(days = 30): Promise<DashboardData> {
  const supabase = await createClient();

  const today = isoDate(new Date());
  const startDate = shiftDays(today, -(days - 1));

  const [statsRes, dailyRes, lowStockRes, overdueRes, topItemsRes, ordersTaxRes] = await Promise.all([
    supabase.rpc("get_dashboard_stats"),
    supabase
      .from("v_daily_sales")
      .select("sales_date, order_count, revenue, cogs, gross_profit")
      .gte("sales_date", startDate)
      .order("sales_date", { ascending: true }),
    supabase
      .from("v_inventory_status")
      .select(LOW_STOCK_COLUMNS)
      .eq("is_active", true)
      .eq("is_below_min", true)
      .order("name", { ascending: true })
      .limit(10),
    supabase
      .from("v_purchase_orders_summary")
      .select(OVERDUE_PO_COLUMNS)
      .eq("is_overdue", true)
      .order("due_date", { ascending: true })
      .limit(10),
    supabase
      .from("v_menu_engineering")
      .select(TOP_ITEM_COLUMNS)
      .gt("qty_sold", 0)
      .order("qty_sold", { ascending: false })
      .limit(5),
    supabase
      .from("orders")
      .select("total_amount, note, order_date")
      .eq("status", "completed")
      .gte("order_date", `${startDate}T00:00:00+07:00`),
  ]);

  for (const res of [statsRes, dailyRes, lowStockRes, overdueRes, topItemsRes]) {
    if (res.error) throw new Error(parseDbError(res.error));
  }

  const stats = (statsRes.data as DashboardStats | null) ?? null;
  const endDate = stats?.today ?? today;
  const monthStart = stats?.month_start ?? `${today.slice(0, 7)}-01`;

  if (stats) {
    let monthTax = 0;
    let todayTax = 0;
    for (const o of ordersTaxRes.data ?? []) {
      const match = /VAT:\s*(\d+(?:\.\d+)?)/i.exec(o.note || "");
      const tax = match ? Number(match[1]) : 0;
      if (tax > 0) {
        if (o.order_date && o.order_date >= `${monthStart}T00:00:00`) {
          monthTax += tax;
        }
        if (o.order_date && o.order_date.startsWith(endDate)) {
          todayTax += tax;
        }
      }
    }
    stats.month_tax_amount = monthTax;
    stats.month_gross_revenue = stats.month_revenue + monthTax;
    stats.today_tax_amount = todayTax;
    stats.today_gross_revenue = stats.today_revenue + todayTax;
  }

  return {
    stats,
    dailySales: fillDailySales(dailyRes.data ?? [], startDate, endDate),
    lowStock: lowStockRes.data ?? [],
    overduePos: overdueRes.data ?? [],
    topItems: topItemsRes.data ?? [],
  };
}
