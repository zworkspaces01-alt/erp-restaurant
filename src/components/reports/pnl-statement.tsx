import { cn } from "@/lib/utils";
import { StatusBadge } from "@/components/shared";
import type { BadgeTone } from "@/components/shared";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatNumber, formatPercent, formatVND } from "@/lib/format";
import type { PnlReport } from "@/types/restaurant";

interface PnlStatementProps {
  report: PnlReport;
  periodLabel: string;
  /** Same report for the previous period — rendered as a comparison column. */
  previous?: PnlReport;
  previousLabel?: string;
  /**
   * Names of payroll periods still in `draft` that feed `report.labor_cost`
   * (DATABASE.md §5.9, BL-06) — the labour and net-profit lines are then only an estimate.
   */
  draftPayrollPeriods?: string[];
}

/** Tone for a margin %: green above `good`, amber above `warn`, red below (negative always red). */
export function marginTone(pct: number | null | undefined, good: number, warn: number): BadgeTone {
  if (pct === null || pct === undefined || !Number.isFinite(pct)) return "neutral";
  if (pct >= good) return "success";
  if (pct >= warn) return "warning";
  return "danger";
}

interface StatementRow {
  label: string;
  value: number;
  previous?: number;
  /** Visual weight: "total" = subtotal line, "result" = bold result line. */
  variant?: "item" | "total" | "result";
  /** Indent cost detail lines under their subtotal. */
  indent?: boolean;
  badge?: { tone: BadgeTone; text: string };
  negative?: boolean;
}

export function PnlStatement({
  report,
  periodLabel,
  previous,
  previousLabel,
  draftPayrollPeriods = [],
}: PnlStatementProps) {
  const laborProvisional = draftPayrollPeriods.length > 0;
  const revenue = report.revenue;
  const share = (value: number) => (revenue > 0 ? (value / revenue) * 100 : null);

  const rows: StatementRow[] = [
    { label: "Doanh thu thuần", value: report.revenue, previous: previous?.revenue, variant: "total" },
    { label: "Giá vốn hàng bán", value: report.cogs_sales, previous: previous?.cogs_sales, indent: true, negative: true },
    { label: "Hao hụt / hủy hàng", value: report.cogs_waste, previous: previous?.cogs_waste, indent: true, negative: true },
    { label: "Tổng giá vốn (COGS)", value: report.cogs_total, previous: previous?.cogs_total, variant: "total", negative: true },
    {
      label: "Lợi nhuận gộp",
      value: report.gross_profit,
      previous: previous?.gross_profit,
      variant: "result",
      badge: {
        tone: marginTone(report.gross_margin_pct, 60, 45),
        text: `Biên gộp ${formatPercent(report.gross_margin_pct)}`,
      },
    },
    {
      label: "Chi phí nhân sự",
      value: report.labor_cost,
      previous: previous?.labor_cost,
      indent: true,
      negative: true,
      badge: laborProvisional
        ? { tone: "warning", text: "Tạm tính (kỳ lương chưa chốt)" }
        : undefined,
    },
    { label: "Chi phí cố định", value: report.opex_fixed, previous: previous?.opex_fixed, indent: true, negative: true },
    { label: "Chi phí biến đổi", value: report.opex_variable, previous: previous?.opex_variable, indent: true, negative: true },
    { label: "Tổng chi phí vận hành", value: report.opex_total, previous: previous?.opex_total, variant: "total", negative: true },
    {
      label: "Lợi nhuận ròng",
      value: report.net_profit,
      previous: previous?.net_profit,
      variant: "result",
      badge: laborProvisional
        ? { tone: "warning", text: `Tạm tính · Biên ròng ${formatPercent(report.net_margin_pct)}` }
        : {
            tone: marginTone(report.net_margin_pct, 15, 5),
            text: `Biên ròng ${formatPercent(report.net_margin_pct)}`,
          },
    },
  ];

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold">Báo cáo kết quả kinh doanh — {periodLabel}</CardTitle>
        <CardDescription>
          {formatNumber(report.order_count, 0)} đơn hoàn tất · Giá trị đơn trung bình {formatVND(report.avg_order_value)}
        </CardDescription>
      </CardHeader>
      <CardContent className="px-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b text-xs text-muted-foreground">
                <th className="px-4 py-2 text-left font-medium">Chỉ tiêu</th>
                <th className="px-4 py-2 text-right font-medium">{periodLabel}</th>
                <th className="px-4 py-2 text-right font-medium">% doanh thu</th>
                {previous && (
                  <th className="px-4 py-2 text-right font-medium">{previousLabel ?? "Kỳ trước"}</th>
                )}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const pct = share(row.value);
                return (
                  <tr
                    key={row.label}
                    className={cn(
                      "border-b last:border-0",
                      row.variant === "total" && "bg-muted/40 font-medium",
                      row.variant === "result" && "bg-muted/60 font-semibold"
                    )}
                  >
                    <td className={cn("px-4 py-2", row.indent && "pl-8 text-muted-foreground")}>
                      <span className="flex flex-wrap items-center gap-2">
                        {row.label}
                        {row.badge && <StatusBadge tone={row.badge.tone}>{row.badge.text}</StatusBadge>}
                      </span>
                    </td>
                    <td
                      className={cn(
                        "px-4 py-2 text-right tabular-nums",
                        row.variant === "result" && row.value < 0 && "text-destructive"
                      )}
                    >
                      {row.negative && row.value > 0 ? `(${formatVND(row.value)})` : formatVND(row.value)}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">
                      {pct === null ? "—" : formatPercent(pct)}
                    </td>
                    {previous && (
                      <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">
                        {row.previous === undefined ? "—" : formatVND(row.previous)}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {laborProvisional && (
          <p className="px-4 pt-3 text-xs text-muted-foreground">
            Chi phí nhân sự bao gồm kỳ lương chưa chốt ({draftPayrollPeriods.join(", ")}) nên chỉ là
            số tạm tính đến thời điểm hiện tại; lợi nhuận ròng sẽ thay đổi khi kỳ lương được chốt.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
