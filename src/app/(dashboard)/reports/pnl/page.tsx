import { getPnLReport } from "@/lib/queries/reports.queries";
import { getDailyIngredientUsage } from "@/lib/queries/inventory.queries";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { PnLCharts } from "@/components/reports/pnl-charts";
import { formatDate, formatNumber, formatPercent, formatVND } from "@/lib/format";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CircleDollarSign, TrendingUp, Wallet } from "lucide-react";

export const metadata = { title: "Báo cáo P&L & Tiêu hao nguyên liệu | Restaurant ERP" };

export default async function PnLReportPage({
  searchParams,
}: {
  searchParams: Promise<{ start?: string; end?: string }>;
}) {
  const { start, end } = await searchParams;
  const startDate = start ?? "2026-09-01";
  const endDate = end ?? "2026-09-30";

  const [{ summary, categoryBreakdown }, dailyUsage] = await Promise.all([
    getPnLReport(startDate, endDate),
    getDailyIngredientUsage(),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Báo cáo Lãi / Lỗ (P&L) & Kiểm soát nguyên liệu"
        description={`Kỳ tài chính từ ${formatDate(startDate)} đến ${formatDate(endDate)}. Tổng hợp Doanh thu - COGS = Lãi gộp - Nhân sự - OPEX = Lợi nhuận ròng.`}
      />

      {/* High-level P&L Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Tổng doanh thu (Revenue)"
          value={formatVND(summary.revenue)}
          icon={CircleDollarSign}
          tone="success"
        />
        <StatCard
          title="Lợi nhuận gộp (Gross Profit)"
          value={formatVND(summary.gross_profit)}
          hint={`Biên lãi gộp: ${formatPercent(summary.gross_margin_pct)}`}
          icon={TrendingUp}
          tone="info"
        />
        <StatCard
          title="Tổng chi phí (COGS + Lương + OPEX)"
          value={formatVND(Number(summary.cogs) + Number(summary.labor_cost) + Number(summary.opex))}
          icon={Wallet}
          tone="warning"
        />
        <StatCard
          title="Lợi nhuận ròng (Net Profit)"
          value={formatVND(summary.net_profit)}
          hint={`Biên ròng: ${formatPercent(summary.net_margin_pct)}`}
          icon={Wallet}
          tone={Number(summary.net_profit) >= 0 ? "success" : "danger"}
        />
      </div>

      {/* P&L Statement Details Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold">Báo cáo kết quả hoạt động kinh doanh</CardTitle>
          <CardDescription>Bảng phân tích dòng tiền theo chuẩn kế toán quản trị F&B</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b bg-muted/40 text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Chỉ tiêu tài chính</th>
                  <th className="px-4 py-3 font-medium text-right">Số tiền (VNĐ)</th>
                  <th className="px-4 py-3 font-medium text-right">Tỷ trọng / Doanh thu (%)</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                <tr className="font-semibold text-foreground">
                  <td className="px-4 py-2.5">1. Doanh thu bán hàng (Revenue)</td>
                  <td className="px-4 py-2.5 text-right">{formatVND(summary.revenue)}</td>
                  <td className="px-4 py-2.5 text-right">100%</td>
                </tr>
                <tr className="text-muted-foreground">
                  <td className="px-4 py-2.5 pl-8">2. Giá vốn hàng bán (COGS xuất bán + Hao hụt)</td>
                  <td className="px-4 py-2.5 text-right text-amber-600 dark:text-amber-400">
                    -{formatVND(summary.cogs)}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {summary.revenue > 0 ? formatPercent((summary.cogs / summary.revenue) * 100) : "0%"}
                  </td>
                </tr>
                <tr className="bg-muted/20 font-bold text-foreground">
                  <td className="px-4 py-2.5">3. Lợi nhuận gộp (Gross Profit = 1 - 2)</td>
                  <td className="px-4 py-2.5 text-right text-primary">{formatVND(summary.gross_profit)}</td>
                  <td className="px-4 py-2.5 text-right">{formatPercent(summary.gross_margin_pct)}</td>
                </tr>
                <tr className="text-muted-foreground">
                  <td className="px-4 py-2.5 pl-8">4. Chi phí nhân sự (Labor Cost)</td>
                  <td className="px-4 py-2.5 text-right text-destructive">
                    -{formatVND(summary.labor_cost)}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {summary.revenue > 0 ? formatPercent((summary.labor_cost / summary.revenue) * 100) : "0%"}
                  </td>
                </tr>
                <tr className="text-muted-foreground">
                  <td className="px-4 py-2.5 pl-8">5. Chi phí vận hành cố định & phát sinh (OPEX)</td>
                  <td className="px-4 py-2.5 text-right text-destructive">
                    -{formatVND(summary.opex)}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {summary.revenue > 0 ? formatPercent((summary.opex / summary.revenue) * 100) : "0%"}
                  </td>
                </tr>
                <tr className="bg-muted/40 font-bold text-foreground">
                  <td className="px-4 py-3 text-base">6. Lợi nhuận ròng thực tế (Net Profit = 3 - 4 - 5)</td>
                  <td className={`px-4 py-3 text-right text-base ${Number(summary.net_profit) >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"}`}>
                    {formatVND(summary.net_profit)}
                  </td>
                  <td className="px-4 py-3 text-right text-base">{formatPercent(summary.net_margin_pct)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Visual Charts */}
      <PnLCharts summary={summary} categoryBreakdown={categoryBreakdown} />

      {/* Daily Raw Material Usage & Cost Control Report (Dòng 6 trong spec) */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold">
            Báo cáo kiểm soát tiêu hao nguyên liệu hàng ngày (Daily Raw Material Control)
          </CardTitle>
          <CardDescription>
            Bán từng này món ăn → Tiêu hao bao nhiêu nguyên liệu theo định lượng BOM (kèm % hao hụt) → Quy ra tiền vốn giá xuất kho trong ngày.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b bg-muted/40 text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Ngày bán</th>
                  <th className="px-4 py-3 font-medium">Mã nguyên liệu</th>
                  <th className="px-4 py-3 font-medium">Tên nguyên liệu</th>
                  <th className="px-4 py-3 font-medium text-right">Khối lượng tiêu hao theo món</th>
                  <th className="px-4 py-3 font-medium text-right">Đơn vị</th>
                  <th className="px-4 py-3 font-medium text-right">Đơn giá vốn BQ</th>
                  <th className="px-4 py-3 font-medium text-right">Quy ra tiền vốn tiêu hao</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {dailyUsage.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-muted-foreground">
                      Chưa có dữ liệu tiêu hao nguyên liệu trong ngày.
                    </td>
                  </tr>
                ) : (
                  dailyUsage.map((row, idx) => (
                    <tr key={idx} className="hover:bg-muted/30">
                      <td className="whitespace-nowrap px-4 py-2.5 text-xs text-muted-foreground">
                        {formatDate(row.usage_date)}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">
                        {row.ingredient_code}
                      </td>
                      <td className="px-4 py-2.5 font-medium text-foreground">
                        {row.ingredient_name}
                      </td>
                      <td className="px-4 py-2.5 text-right font-semibold text-foreground">
                        {formatNumber(row.theoretical_quantity)}
                      </td>
                      <td className="px-4 py-2.5 text-right text-xs text-muted-foreground">
                        {row.base_unit}
                      </td>
                      <td className="px-4 py-2.5 text-right text-xs text-muted-foreground">
                        {formatVND(row.avg_cost_price)}/{row.base_unit}
                      </td>
                      <td className="px-4 py-2.5 text-right font-bold text-amber-600 dark:text-amber-400">
                        {formatVND(row.theoretical_cost)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
