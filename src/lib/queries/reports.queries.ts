import { createClient } from "@/lib/supabase/server";

export async function getPnLReport(startDate: string, endDate: string) {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("get_pnl_report", {
    p_start_date: startDate,
    p_end_date: endDate,
  });

  if (error) throw new Error(error.message);

  // Lấy thêm danh sách chi phí theo danh mục để vẽ biểu đồ cơ cấu chi phí
  const { data: categoryExpenses } = await supabase
    .from("expense_records")
    .select("amount, expense_categories(name)")
    .gte("expense_date", startDate)
    .lte("expense_date", endDate)
    .eq("status", "paid");

  const categoryTotals: Record<string, number> = {};
  for (const item of categoryExpenses ?? []) {
    const name = (item.expense_categories as { name?: string })?.name ?? "Khác";
    categoryTotals[name] = (categoryTotals[name] ?? 0) + Number(item.amount);
  }

  return {
    summary: data as {
      start_date: string;
      end_date: string;
      revenue: number;
      cogs: number;
      waste_cost: number;
      gross_profit: number;
      gross_margin_pct: number;
      labor_cost: number;
      opex: number;
      net_profit: number;
      net_margin_pct: number;
    },
    categoryBreakdown: Object.entries(categoryTotals).map(([name, value]) => ({
      name,
      value,
    })),
  };
}
