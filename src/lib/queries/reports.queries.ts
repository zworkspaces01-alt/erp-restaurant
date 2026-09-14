import "server-only";

import { createClient } from "@/lib/supabase/server";
import { parseDbError } from "@/types/restaurant";
import type { PnlMonthlyRow, PnlReport } from "@/types/restaurant";

/** A resolved P&L period: inclusive local-date range + Vietnamese label. */
export interface PnlPeriod {
  kind: "month" | "quarter";
  year: number;
  /** 1–12 for a month period, 1–4 for a quarter period. */
  index: number;
  start: string;
  end: string;
  label: string;
}

const EMPTY_PNL: PnlReport = {
  revenue: 0,
  cogs_sales: 0,
  cogs_waste: 0,
  cogs_total: 0,
  gross_profit: 0,
  gross_margin_pct: 0,
  labor_cost: 0,
  opex_fixed: 0,
  opex_variable: 0,
  opex_total: 0,
  net_profit: 0,
  net_margin_pct: 0,
  order_count: 0,
  avg_order_value: 0,
};

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function lastDayOfMonth(year: number, month: number): string {
  const d = new Date(year, month, 0);
  return `${year}-${pad(month)}-${pad(d.getDate())}`;
}

/** Build the inclusive range of a month (1–12) or quarter (1–4) period. */
export function buildPeriod(kind: "month" | "quarter", year: number, index: number): PnlPeriod {
  if (kind === "quarter") {
    const q = Math.min(4, Math.max(1, index));
    const firstMonth = (q - 1) * 3 + 1;
    return {
      kind,
      year,
      index: q,
      start: `${year}-${pad(firstMonth)}-01`,
      end: lastDayOfMonth(year, firstMonth + 2),
      label: `Quý ${q}/${year}`,
    };
  }
  const m = Math.min(12, Math.max(1, index));
  return {
    kind,
    year,
    index: m,
    start: `${year}-${pad(m)}-01`,
    end: lastDayOfMonth(year, m),
    label: `Tháng ${m}/${year}`,
  };
}

/** The period immediately before `period` (previous month / previous quarter). */
export function previousPeriod(period: PnlPeriod): PnlPeriod {
  const size = period.kind === "quarter" ? 4 : 12;
  const prevIndex = period.index === 1 ? size : period.index - 1;
  const prevYear = period.index === 1 ? period.year - 1 : period.year;
  return buildPeriod(period.kind, prevYear, prevIndex);
}

/** `get_pnl_report(start, end)` — table-returning RPC, one row (zeros when the period is empty). */
export async function getPnlReport(start: string, end: string): Promise<PnlReport> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_pnl_report", { p_start: start, p_end: end });
  if (error) throw new Error(parseDbError(error));
  return data?.[0] ?? EMPTY_PNL;
}

/** `get_pnl_monthly(year)` — 12 rows, one per month (zeros when empty). */
export async function getPnlMonthly(year: number): Promise<PnlMonthlyRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_pnl_monthly", { p_year: year });
  if (error) throw new Error(parseDbError(error));
  return data ?? [];
}

/**
 * Payroll periods ending inside `[start, end]` that are still `draft`.
 * `get_pnl_report.labor_cost` counts them as a month-to-date estimate (DATABASE.md §5.9, BL-06),
 * so the UI must badge the labour line as provisional while any exists.
 */
export async function getDraftPayrollPeriodNames(start: string, end: string): Promise<string[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("payroll_periods")
    .select("name")
    .eq("status", "draft")
    .gte("period_end", start)
    .lte("period_end", end)
    .order("period_end", { ascending: true });
  if (error) throw new Error(parseDbError(error));
  return (data ?? []).map((row) => row.name);
}

export interface PnlPageData {
  period: PnlPeriod;
  current: PnlReport;
  previous: PnlReport;
  previousPeriodLabel: string;
  monthly: PnlMonthlyRow[];
  /** Names of draft payroll periods contributing to `current.labor_cost` (empty = final). */
  draftPayrollPeriods: string[];
}

/** Everything `/reports/pnl` needs: current period, comparison period and the yearly chart. */
export async function getPnlPageData(period: PnlPeriod): Promise<PnlPageData> {
  const prev = previousPeriod(period);
  const [current, previous, monthly, draftPayrollPeriods] = await Promise.all([
    getPnlReport(period.start, period.end),
    getPnlReport(prev.start, prev.end),
    getPnlMonthly(period.year),
    getDraftPayrollPeriodNames(period.start, period.end),
  ]);
  return {
    period,
    current,
    previous,
    previousPeriodLabel: prev.label,
    monthly,
    draftPayrollPeriods,
  };
}

/** Percentage change vs the previous period; null when the base is 0 (no meaningful trend). */
export function trendPct(current: number, previous: number): number | null {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

// ============================================================================
// BÁO CÁO TIÊU HAO NGUYÊN LIỆU & LÃI LỖ THEO NGÀY (DAILY P&L & FOOD COST)
// ============================================================================

export interface DailyIngredientUsageRow {
  ingredient_id: string;
  ingredient_code: string | null;
  ingredient_name: string;
  category: string;
  base_unit: string;
  import_unit: string;
  conversion_factor: number;
  sale_qty: number;
  waste_qty: number;
  total_qty: number;
  avg_unit_cost: number;
  sale_cost: number;
  waste_cost: number;
  total_cost: number;
  pct_of_total_cogs: number;
  pct_of_revenue: number;
}

export interface DailyTrendRow {
  report_date: string;
  order_count: number;
  revenue: number;
  cogs_sales: number;
  cogs_waste: number;
  cogs_total: number;
  food_cost_pct: number;
  gross_profit: number;
  gross_margin_pct: number;
  opex_total: number;
  net_profit: number;
  net_margin_pct: number;
}

export interface DailyReportSummary {
  report_date: string;
  revenue: number;
  order_count: number;
  avg_order_value: number;
  cogs_sales: number;
  cogs_waste: number;
  cogs_total: number;
  food_cost_pct: number;
  gross_profit: number;
  gross_margin_pct: number;
  labor_cost: number;
  opex_fixed: number;
  opex_variable: number;
  opex_total: number;
  net_profit: number;
  net_margin_pct: number;
}

export interface DailyReportPageData {
  date: string;
  summary: DailyReportSummary;
  ingredients: DailyIngredientUsageRow[];
  trend: DailyTrendRow[];
}

/** Lấy toàn bộ dữ liệu báo cáo tiêu hao nguyên liệu và lỗ lãi theo ngày. */
export async function getDailyReportPageData(targetDate: string): Promise<DailyReportPageData> {
  const supabase = await createClient();

  // Chuỗi ngày xu hướng: 14 ngày trước targetDate đến targetDate
  const d = new Date(targetDate);
  const startTrend = new Date(d);
  startTrend.setDate(d.getDate() - 13);
  const startTrendStr = startTrend.toISOString().slice(0, 10);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = supabase as any;
  const [pnlRes, ingRes, trendRes] = await Promise.all([
    supabase.rpc("get_pnl_report", { p_start: targetDate, p_end: targetDate }),
    client.rpc("get_daily_ingredient_usage", { p_date: targetDate }),
    client.rpc("get_daily_pnl_trend", { p_start: startTrendStr, p_end: targetDate }),
  ]);

  const pnl = pnlRes.data?.[0] ?? EMPTY_PNL;
  const revenue = Number(pnl.revenue ?? 0);
  const cogsTotal = Number(pnl.cogs_total ?? 0);
  const foodCostPct = revenue > 0 ? (cogsTotal / revenue) * 100 : 0;

  const summary: DailyReportSummary = {
    report_date: targetDate,
    revenue,
    order_count: Number(pnl.order_count ?? 0),
    avg_order_value: Number(pnl.avg_order_value ?? 0),
    cogs_sales: Number(pnl.cogs_sales ?? 0),
    cogs_waste: Number(pnl.cogs_waste ?? 0),
    cogs_total: cogsTotal,
    food_cost_pct: foodCostPct,
    gross_profit: Number(pnl.gross_profit ?? 0),
    gross_margin_pct: Number(pnl.gross_margin_pct ?? 0),
    labor_cost: Number(pnl.labor_cost ?? 0),
    opex_fixed: Number(pnl.opex_fixed ?? 0),
    opex_variable: Number(pnl.opex_variable ?? 0),
    opex_total: Number(pnl.opex_total ?? 0),
    net_profit: Number(pnl.net_profit ?? 0),
    net_margin_pct: Number(pnl.net_margin_pct ?? 0),
  };

  const rawIngredients: Record<string, unknown>[] = Array.isArray(ingRes.data)
    ? (ingRes.data as Record<string, unknown>[])
    : [];
  const ingredients: DailyIngredientUsageRow[] = rawIngredients.map((r: Record<string, unknown>) => {
    const totalCost = Number(r.total_cost ?? 0);
    return {
      ingredient_id: String(r.ingredient_id),
      ingredient_code: r.ingredient_code ? String(r.ingredient_code) : null,
      ingredient_name: String(r.ingredient_name),
      category: String(r.category || "Chưa phân loại"),
      base_unit: String(r.base_unit),
      import_unit: String(r.import_unit || r.base_unit),
      conversion_factor: Number(r.conversion_factor || 1),
      sale_qty: Number(r.sale_qty ?? 0),
      waste_qty: Number(r.waste_qty ?? 0),
      total_qty: Number(r.total_qty ?? 0),
      avg_unit_cost: Number(r.avg_unit_cost ?? 0),
      sale_cost: Number(r.sale_cost ?? 0),
      waste_cost: Number(r.waste_cost ?? 0),
      total_cost: totalCost,
      pct_of_total_cogs: cogsTotal > 0 ? (totalCost / cogsTotal) * 100 : 0,
      pct_of_revenue: revenue > 0 ? (totalCost / revenue) * 100 : 0,
    };
  });

  const rawTrend: Record<string, unknown>[] = Array.isArray(trendRes.data)
    ? (trendRes.data as Record<string, unknown>[])
    : [];
  const trend: DailyTrendRow[] = rawTrend.map((r: Record<string, unknown>) => ({
    report_date: String(r.report_date),
    order_count: Number(r.order_count ?? 0),
    revenue: Number(r.revenue ?? 0),
    cogs_sales: Number(r.cogs_sales ?? 0),
    cogs_waste: Number(r.cogs_waste ?? 0),
    cogs_total: Number(r.cogs_total ?? 0),
    food_cost_pct: Number(r.food_cost_pct ?? 0),
    gross_profit: Number(r.gross_profit ?? 0),
    gross_margin_pct: Number(r.gross_margin_pct ?? 0),
    opex_total: Number(r.opex_total ?? 0),
    net_profit: Number(r.net_profit ?? 0),
    net_margin_pct: Number(r.net_margin_pct ?? 0),
  }));

  return {
    date: targetDate,
    summary,
    ingredients,
    trend,
  };
}

