import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { Order, OrderItem, PaymentMethod, OrderStatus } from "@/types/restaurant";
import type { Views } from "@/types/restaurant";

const DEFAULT_TIMEZONE = "Asia/Ho_Chi_Minh";
const FALLBACK_OFFSET = "+07:00";

/** `app_settings.timezone` (jsonb string) — múi giờ ngày kinh doanh của nhà hàng. */
export async function getAppTimezone(): Promise<string> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", "timezone")
    .maybeSingle();
  if (error) return DEFAULT_TIMEZONE;
  const value = data?.value;
  return typeof value === "string" && value.length > 0 ? value : DEFAULT_TIMEZONE;
}

/** UTC offset ("+07:00") của timezone nhà hàng tại ngày `dateISO`. */
function offsetAt(timeZone: string, dateISO: string): string {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      timeZoneName: "longOffset",
    }).formatToParts(new Date(`${dateISO}T12:00:00Z`));
    const name = parts.find((p) => p.type === "timeZoneName")?.value ?? "";
    if (name === "GMT") return "+00:00";
    const m = /GMT([+-])(\d{1,2}):?(\d{2})?/.exec(name);
    if (!m) return FALLBACK_OFFSET;
    return `${m[1]}${m[2].padStart(2, "0")}:${m[3] ?? "00"}`;
  } catch {
    return FALLBACK_OFFSET;
  }
}

/** `YYYY-MM-DD` + n ngày (lịch, không phụ thuộc timezone của server). */
export function addDaysISO(dateISO: string, days: number): string {
  const d = new Date(`${dateISO}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Hôm nay (`YYYY-MM-DD`) theo timezone nhà hàng. */
export function localTodayISO(timeZone: string = DEFAULT_TIMEZONE): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date());
}

/** Mốc đầu ngày kinh doanh dạng instant: "2026-09-12T00:00:00+07:00". */
export function localDayStart(dateISO: string, timeZone: string): string {
  return `${dateISO}T00:00:00${offsetAt(timeZone, dateISO)}`;
}

/** One row of the /orders table (order header + số dòng món). */
export interface OrderListRow {
  id: string;
  order_number: string | null;
  order_date: string;
  status: OrderStatus;
  table_number: string | null;
  subtotal: number;
  discount: number;
  total_amount: number;
  total_cogs: number;
  gross_profit: number;
  gross_margin_pct: number | null;
  payment_method: PaymentMethod;
  item_count: number;
  note: string | null;
}

export interface OrdersFilter {
  /** `completed` | `cancelled`; bỏ trống = tất cả. */
  status?: OrderStatus;
  /** Local date `YYYY-MM-DD` (inclusive). */
  from?: string;
  to?: string;
  limit?: number;
}

function marginPct(total: number, cogs: number): number | null {
  if (!total) return null;
  return ((total - cogs) / total) * 100;
}

export interface OrdersPage {
  rows: OrderListRow[];
  /** Tổng số đơn khớp bộ lọc (trước khi cắt `limit`). */
  total: number;
  limit: number;
}

export async function getOrders(filter: OrdersFilter = {}): Promise<OrdersPage> {
  const supabase = await createClient();
  const timeZone = await getAppTimezone();
  const limit = filter.limit ?? 200;

  let query = supabase
    .from("orders")
    .select("*, order_items(count)", { count: "exact" })
    .order("order_date", { ascending: false })
    .limit(limit);

  if (filter.status) query = query.eq("status", filter.status);
  // `order_date` là timestamptz; ngày kinh doanh được chốt theo app_settings.timezone
  // (DATABASE.md §1.2, §5.12) nên phải gửi mốc có offset, không dùng chuỗi naive (server = UTC).
  if (filter.from) query = query.gte("order_date", localDayStart(filter.from, timeZone));
  if (filter.to) query = query.lt("order_date", localDayStart(addDaysISO(filter.to, 1), timeZone));

  const { data, error, count } = await query;
  if (error) throw new Error(error.message);

  const rows = (data ?? []).map((row) => {
    const counts = row.order_items as unknown as { count: number }[] | null;
    const total = Number(row.total_amount ?? 0);
    const cogs = Number(row.total_cogs ?? 0);
    return {
      id: row.id,
      order_number: row.order_number,
      order_date: row.order_date,
      status: row.status,
      table_number: row.table_number,
      subtotal: Number(row.subtotal ?? 0),
      discount: Number(row.discount ?? 0),
      total_amount: total,
      total_cogs: cogs,
      gross_profit: total - cogs,
      gross_margin_pct: marginPct(total, cogs),
      payment_method: row.payment_method,
      item_count: counts?.[0]?.count ?? 0,
      note: row.note,
    };
  });

  return { rows, total: count ?? rows.length, limit };
}

export interface OrdersSummary {
  order_count: number;
  revenue: number;
  cogs: number;
  gross_profit: number;
  gross_margin_pct: number | null;
}

/**
 * Tổng hợp doanh thu/giá vốn của cả khoảng ngày (đơn hoàn tất) từ `v_daily_sales`
 * — không phụ thuộc `limit` của danh sách đơn.
 */
export async function getOrdersSummary(from: string, to: string): Promise<OrdersSummary> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("v_daily_sales")
    .select("order_count, revenue, cogs")
    .gte("sales_date", from)
    .lte("sales_date", to);

  if (error) throw new Error(error.message);

  const seed = { order_count: 0, revenue: 0, cogs: 0 };
  const summary = (data ?? []).reduce(
    (acc: typeof seed, row) => ({
      order_count: acc.order_count + Number(row.order_count ?? 0),
      revenue: acc.revenue + Number(row.revenue ?? 0),
      cogs: acc.cogs + Number(row.cogs ?? 0),
    }),
    seed
  );

  return {
    ...summary,
    gross_profit: summary.revenue - summary.cogs,
    gross_margin_pct: marginPct(summary.revenue, summary.cogs),
  };
}

export interface OrderDetailItem extends OrderItem {
  line_margin: number;
  menu_item_code: string | null;
  menu_item_category: string | null;
}

/** Một dòng sổ kho sinh ra bởi đơn bán (reference_type = 'order_item'). */
export interface OrderConsumptionRow {
  id: string;
  order_item_id: string | null;
  menu_item_name: string;
  ingredient_name: string;
  ingredient_code: string | null;
  base_unit: string;
  /** Số lượng đã xuất kho (dương, đơn vị cơ bản). */
  quantity: number;
  unit_cost: number;
  total_cost: number;
  note: string | null;
}

export interface OrderDetail {
  order: Order;
  items: OrderDetailItem[];
  /** Nguyên liệu đã trừ kho cho đơn này (§7.3 bước 4). */
  consumption: OrderConsumptionRow[];
  consumption_total_cost: number;
  gross_profit: number;
  gross_margin_pct: number | null;
}

export async function getOrderDetail(id: string): Promise<OrderDetail | null> {
  const supabase = await createClient();
  const [orderRes, itemsRes] = await Promise.all([
    supabase.from("orders").select("*").eq("id", id).maybeSingle(),
    supabase
      .from("order_items")
      .select("*, menu_items(code, category)")
      .eq("order_id", id)
      .order("created_at", { ascending: true }),
  ]);

  if (orderRes.error) throw new Error(orderRes.error.message);
  if (!orderRes.data) return null;
  if (itemsRes.error) throw new Error(itemsRes.error.message);

  const items: OrderDetailItem[] = (itemsRes.data ?? []).map((row) => {
    const { menu_items: menuItem, ...item } = row as (typeof itemsRes.data)[number] & {
      menu_items: { code: string | null; category: string | null } | null;
    };
    return {
      ...item,
      line_margin: Number(item.line_total ?? 0) - Number(item.cogs_amount ?? 0),
      menu_item_code: menuItem?.code ?? null,
      menu_item_category: menuItem?.category ?? null,
    };
  });

  const itemIds = items.map((item) => item.id);
  const itemNameById = new Map(items.map((item) => [item.id, item.menu_item_name]));
  let consumption: OrderConsumptionRow[] = [];

  if (itemIds.length > 0) {
    const { data: txns, error: txnError } = await supabase
      .from("inventory_transactions")
      .select("*, ingredients(code, name, base_unit)")
      .eq("reference_type", "order_item")
      .in("reference_id", itemIds)
      .order("created_at", { ascending: true });

    if (txnError) throw new Error(txnError.message);

    consumption = (txns ?? []).map((row) => {
      const ingredient = (row as typeof row & {
        ingredients: { code: string | null; name: string; base_unit: string } | null;
      }).ingredients;
      return {
        id: row.id,
        order_item_id: row.reference_id,
        menu_item_name:
          (row.reference_id ? itemNameById.get(row.reference_id) : undefined) ?? "—",
        ingredient_name: ingredient?.name ?? "—",
        ingredient_code: ingredient?.code ?? null,
        base_unit: ingredient?.base_unit ?? "",
        quantity: Math.abs(Number(row.quantity ?? 0)),
        unit_cost: Number(row.unit_cost ?? 0),
        total_cost: Number(row.total_cost ?? 0),
        note: row.note,
      };
    });
  }

  const total = Number(orderRes.data.total_amount ?? 0);
  const cogs = Number(orderRes.data.total_cogs ?? 0);
  return {
    order: orderRes.data,
    items,
    consumption,
    consumption_total_cost: consumption.reduce((sum, row) => sum + row.total_cost, 0),
    gross_profit: total - cogs,
    gross_margin_pct: marginPct(total, cogs),
  };
}

/** Món đang bán (active) kèm ideal cost — dùng cho màn POS `/orders/new`. */
export interface PosMenuItem {
  id: string;
  code: string | null;
  name: string;
  category: string | null;
  selling_price: number;
  ideal_cost: number;
  missing_recipe: boolean;
}

export async function getPosMenuItems(): Promise<PosMenuItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("v_menu_item_costs")
    .select("*")
    .eq("is_active", true)
    .order("category", { ascending: true })
    .order("name", { ascending: true });

  if (error) throw new Error(error.message);

  return (data ?? [])
    .filter((row: Views<"v_menu_item_costs">) => row.id !== null && row.name !== null)
    .map((row: Views<"v_menu_item_costs">) => ({
      id: row.id as string,
      code: row.code,
      name: row.name as string,
      category: row.category,
      selling_price: Number(row.selling_price ?? 0),
      ideal_cost: Number(row.ideal_cost ?? 0),
      missing_recipe: row.missing_recipe ?? true,
    }));
}

/** Danh sách mã hóa đơn MISA đã từng import vào hệ thống (lọc từ trường `orders.note`). */
export async function getExistingMisaOrderCodes(): Promise<string[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("orders")
    .select("note")
    .ilike("note", "%[MISA:%");

  if (error) throw new Error(error.message);

  const codes: string[] = [];
  const regex = /\[MISA:\s*([^\]]+)\]/i;
  for (const row of data ?? []) {
    if (row.note) {
      const match = regex.exec(row.note);
      if (match && match[1]) {
        codes.push(match[1].trim());
      }
    }
  }
  return Array.from(new Set(codes));
}

