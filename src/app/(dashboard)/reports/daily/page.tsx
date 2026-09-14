import Link from "next/link";
import { BarChart3, FileText } from "lucide-react";
import { getDailyReportPageData } from "@/lib/queries/reports.queries";
import { formatDate } from "@/lib/format";
import { PageHeader } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { DailyReportHeader } from "@/components/reports/daily-report-header";
import { DailyKpiCards } from "@/components/reports/daily-kpi-cards";
import { DailyIngredientTable } from "@/components/reports/daily-ingredient-table";
import { DailyTrendSection } from "@/components/reports/daily-trend-section";

export const metadata = { title: "Báo cáo tiêu hao nguyên liệu & Lỗ lãi ngày | Restaurant ERP" };
export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function DailyReportPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const todayStr = new Date().toISOString().slice(0, 10);
  const targetDate = firstValue(params.date) || todayStr;

  const data = await getDailyReportPageData(targetDate);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Báo cáo tiêu hao nguyên liệu & Lỗ lãi theo ngày"
        description={`Chi tiết lượng và chi phí nguyên liệu sử dụng, tỷ lệ % trên doanh thu, kết quả kinh doanh ngày ${formatDate(targetDate)}.`}
        breadcrumbs={[
          { label: "Báo cáo", href: "/reports/pnl" },
          { label: "Tiêu hao & Lỗ lãi theo ngày" },
        ]}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild variant="outline" size="sm" className="gap-1.5 text-xs">
              <Link href="/reports/pnl">
                <BarChart3 className="size-3.5 text-sky-600" />
                <span>Báo cáo P&amp;L (Tháng / Quý)</span>
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm" className="gap-1.5 text-xs">
              <Link href="/inventory">
                <FileText className="size-3.5 text-emerald-600" />
                <span>Kho nguyên liệu</span>
              </Link>
            </Button>
          </div>
        }
      />

      {/* Date picker & Actions bar */}
      <DailyReportHeader
        date={data.date}
        summary={data.summary}
        ingredients={data.ingredients}
        trend={data.trend}
      />

      {/* 4 Executive KPI Cards */}
      <DailyKpiCards summary={data.summary} />

      {/* Detailed Ingredient Usage Table */}
      <DailyIngredientTable
        ingredients={data.ingredients}
        totalCogs={data.summary.cogs_total}
        totalRevenue={data.summary.revenue}
        date={data.date}
      />

      {/* Multi-Day Trend & Comparative P&L Table */}
      <DailyTrendSection trend={data.trend} currentDate={data.date} />
    </div>
  );
}
