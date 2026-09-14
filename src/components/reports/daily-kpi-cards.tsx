import { CircleDollarSign, Package, Percent, Wallet } from "lucide-react";
import { formatNumber, formatPercent, formatVND } from "@/lib/format";
import { StatCard } from "@/components/shared";
import type { DailyReportSummary } from "@/lib/queries/reports.queries";

interface DailyKpiCardsProps {
  summary: DailyReportSummary;
}

export function DailyKpiCards({ summary }: DailyKpiCardsProps) {
  // Đánh giá tỷ lệ Food Cost theo tiêu chuẩn F&B
  const getFoodCostEvaluation = (pct: number, revenue: number) => {
    if (revenue <= 0) return { tone: "default" as const, hint: "Chưa phát sinh doanh thu" };
    if (pct < 30) return { tone: "success" as const, hint: "Rất tốt · Dưới 30% (Lợi nhuận cao)" };
    if (pct <= 35) return { tone: "success" as const, hint: "Lý tưởng · Mức chuẩn F&B (30% - 35%)" };
    if (pct <= 40) return { tone: "warning" as const, hint: "Hơi cao · Nên kiểm tra lại định lượng" };
    return { tone: "danger" as const, hint: "Nguy hiểm · Chi phí NL vượt 40% doanh thu" };
  };

  const evalStatus = getFoodCostEvaluation(summary.food_cost_pct, summary.revenue);

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {/* 1. Doanh thu bán hàng */}
      <StatCard
        title="Doanh thu ngày"
        value={formatVND(summary.revenue)}
        hint={`${formatNumber(summary.order_count, 0)} đơn hoàn thành · TB ${formatVND(summary.avg_order_value)}/đơn`}
        icon={CircleDollarSign}
        tone="info"
      />

      {/* 2. Chi phí nguyên liệu tiêu hao */}
      <StatCard
        title="Chi phí nguyên liệu (COGS)"
        value={formatVND(summary.cogs_total)}
        hint={`Xuất bán ${formatVND(summary.cogs_sales)} · Hao hụt ${formatVND(summary.cogs_waste)}`}
        icon={Package}
        tone={summary.cogs_total > 0 ? "warning" : "default"}
      />

      {/* 3. Tỷ lệ % Chi phí nguyên liệu / Doanh thu */}
      <StatCard
        title="% Nguyên liệu / Doanh thu"
        value={summary.revenue > 0 ? formatPercent(summary.food_cost_pct) : "—"}
        hint={evalStatus.hint}
        icon={Percent}
        tone={evalStatus.tone}
      />

      {/* 4. Lợi nhuận ròng trong ngày */}
      <StatCard
        title="Lợi nhuận ròng ngày"
        value={formatVND(summary.net_profit)}
        hint={`Biên ròng ${formatPercent(summary.net_margin_pct)} · Lãi gộp ${formatVND(summary.gross_profit)}`}
        icon={Wallet}
        tone={summary.net_profit >= 0 ? "success" : "danger"}
      />
    </div>
  );
}
