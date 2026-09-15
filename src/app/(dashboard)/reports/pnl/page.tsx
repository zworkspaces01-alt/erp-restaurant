import Link from "next/link";
import { Calendar, CircleDollarSign, Percent, Receipt, Wallet } from "lucide-react";
import { buildPeriod, getPnlPageData, trendPct } from "@/lib/queries/reports.queries";
import { PnlCharts } from "@/components/reports/pnl-charts";
import { PnlPeriodSelector } from "@/components/reports/pnl-period-selector";
import { PnlStatement } from "@/components/reports/pnl-statement";
import { Forbidden, PageHeader, StatCard } from "@/components/shared";
import { formatDate, formatNumber, formatPercent, formatVND } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { requireAuth } from "@/lib/auth";

export const metadata = { title: "Báo cáo P&L | Restaurant ERP" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function parseInteger(value: string | undefined, fallback: number, min: number, max: number): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) return fallback;
  return n;
}

export default async function PnlReportPage({ searchParams }: { searchParams: SearchParams }) {
  const { role, authorized } = await requireAuth(["owner"]);
  if (!authorized) {
    return <Forbidden requiredRoles={["owner"]} currentRole={role} />;
  }

  const params = await searchParams;
  const now = new Date();

  const kind = firstValue(params.kind) === "quarter" ? "quarter" : "month";
  const year = parseInteger(firstValue(params.year), now.getFullYear(), 2000, 2100);
  const defaultIndex =
    kind === "quarter" ? Math.floor(now.getMonth() / 3) + 1 : now.getMonth() + 1;
  const index = parseInteger(
    firstValue(params.period),
    defaultIndex,
    1,
    kind === "quarter" ? 4 : 12
  );

  const period = buildPeriod(kind, year, index);
  const { current, previous, previousPeriodLabel, monthly, draftPayrollPeriods } =
    await getPnlPageData(period);

  const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - i);
  const hasPrevious = previous.revenue > 0 || previous.order_count > 0;
  const laborProvisional = draftPayrollPeriods.length > 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Báo cáo lãi lỗ (P&amp;L)"
        description={`${period.label} · từ ${formatDate(period.start)} đến ${formatDate(period.end)}. So sánh với ${previousPeriodLabel}.`}
        breadcrumbs={[{ label: "Báo cáo" }, { label: "Lãi lỗ (P&L)" }]}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild variant="outline" size="sm" className="gap-1.5 text-xs">
              <Link href="/reports/daily">
                <Calendar className="size-3.5 text-emerald-600" />
                <span>Tiêu hao &amp; Lỗ lãi ngày</span>
              </Link>
            </Button>
            <PnlPeriodSelector kind={period.kind} year={period.year} index={period.index} years={years} />
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Doanh thu"
          value={formatVND(current.revenue)}
          hint={`${formatNumber(current.order_count, 0)} đơn · TB ${formatVND(current.avg_order_value)}/đơn`}
          icon={CircleDollarSign}
          tone="info"
          trend={hasPrevious ? trendPct(current.revenue, previous.revenue) : null}
          trendLabel={`so với ${previousPeriodLabel}`}
        />
        <StatCard
          title="Lợi nhuận gộp"
          value={formatVND(current.gross_profit)}
          hint={`Biên gộp ${formatPercent(current.gross_margin_pct)} · COGS ${formatVND(current.cogs_total)}`}
          icon={Receipt}
          tone={current.gross_profit >= 0 ? "success" : "danger"}
          trend={hasPrevious ? trendPct(current.gross_profit, previous.gross_profit) : null}
          trendLabel={`so với ${previousPeriodLabel}`}
        />
        <StatCard
          title="Lợi nhuận ròng"
          value={formatVND(current.net_profit)}
          hint={
            laborProvisional
              ? `Biên ròng ${formatPercent(current.net_margin_pct)} · Tạm tính (kỳ lương chưa chốt)`
              : `Biên ròng ${formatPercent(current.net_margin_pct)}`
          }
          icon={Wallet}
          tone={current.net_profit >= 0 ? "success" : "danger"}
          trend={hasPrevious ? trendPct(current.net_profit, previous.net_profit) : null}
          trendLabel={`so với ${previousPeriodLabel}`}
        />
        <StatCard
          title="Tổng chi phí"
          value={formatVND(current.labor_cost + current.opex_total)}
          hint={`Nhân sự ${formatVND(current.labor_cost)}${laborProvisional ? " (tạm tính)" : ""} · Vận hành ${formatVND(current.opex_total)}`}
          icon={Percent}
          tone="warning"
          invertTrend
          trend={
            hasPrevious
              ? trendPct(
                  current.labor_cost + current.opex_total,
                  previous.labor_cost + previous.opex_total
                )
              : null
          }
          trendLabel={`so với ${previousPeriodLabel}`}
        />
      </div>

      <PnlStatement
        report={current}
        periodLabel={period.label}
        previous={hasPrevious ? previous : undefined}
        previousLabel={previousPeriodLabel}
        draftPayrollPeriods={draftPayrollPeriods}
      />

      <PnlCharts
        monthly={monthly}
        report={current}
        year={period.year}
        periodLabel={period.label}
        laborProvisional={laborProvisional}
      />
    </div>
  );
}
