"use client";

import * as React from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  ComposedChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatPercent, formatVND, formatVNDCompact } from "@/lib/format";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { PnlMonthlyRow, PnlReport } from "@/types/restaurant";

interface PnlChartsProps {
  monthly: PnlMonthlyRow[];
  report: PnlReport;
  year: number;
  periodLabel: string;
  /** Labour cost still includes a draft payroll period (DATABASE.md §5.9, BL-06). */
  laborProvisional?: boolean;
}

const MONTHLY_LABELS: Record<string, string> = {
  revenue: "Doanh thu",
  cogs_total: "Giá vốn",
  net_profit: "Lợi nhuận ròng",
};

function num(value: number | string | null | undefined): number {
  const n = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function MoneyTooltip({
  active,
  payload,
  label,
  labels,
  total,
}: {
  active?: boolean;
  payload?: readonly { dataKey?: string | number; name?: string; value?: number | string }[];
  label?: string | number;
  labels?: Record<string, string>;
  total?: number;
}) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="rounded-md border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="mb-1 font-medium text-popover-foreground">{String(label)}</p>
      {payload.map((entry) => {
        const key = String(entry.dataKey ?? entry.name ?? "");
        const value = num(entry.value);
        return (
          <p key={key} className="flex items-center justify-between gap-4 text-muted-foreground">
            <span>{labels?.[key] ?? key}</span>
            <span className="font-medium tabular-nums text-popover-foreground">
              {formatVND(value)}
              {total && total > 0 ? ` · ${formatPercent((value / total) * 100)}` : ""}
            </span>
          </p>
        );
      })}
    </div>
  );
}

export function PnlCharts({
  monthly,
  report,
  year,
  periodLabel,
  laborProvisional = false,
}: PnlChartsProps) {
  const monthlyData = React.useMemo(
    () =>
      monthly.map((row) => ({
        label: `T${row.month}`,
        revenue: num(row.revenue),
        cogs_total: num(row.cogs_total),
        net_profit: num(row.net_profit),
      })),
    [monthly]
  );

  const hasMonthly = monthlyData.some((d) => d.revenue !== 0 || d.cogs_total !== 0 || d.net_profit !== 0);

  const costStructure = React.useMemo(
    () =>
      [
        { key: "cogs_sales", label: "Giá vốn bán hàng", value: num(report.cogs_sales), color: "var(--chart-1)" },
        { key: "cogs_waste", label: "Hao hụt / hủy", value: num(report.cogs_waste), color: "var(--chart-2)" },
        {
          key: "labor_cost",
          label: laborProvisional ? "Chi phí nhân sự (tạm tính)" : "Chi phí nhân sự",
          value: num(report.labor_cost),
          color: "var(--chart-3)",
        },
        { key: "opex_fixed", label: "Chi phí cố định", value: num(report.opex_fixed), color: "var(--chart-4)" },
        { key: "opex_variable", label: "Chi phí biến đổi", value: num(report.opex_variable), color: "var(--chart-5)" },
      ].filter((d) => d.value > 0),
    [report, laborProvisional]
  );

  const costTotal = costStructure.reduce((sum, d) => sum + d.value, 0);
  const costLabels = Object.fromEntries(costStructure.map((d) => [d.key, d.label]));

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold">Diễn biến theo tháng — {year}</CardTitle>
          <CardDescription>Cột: doanh thu &amp; giá vốn · Đường: lợi nhuận ròng</CardDescription>
        </CardHeader>
        <CardContent className="h-80">
          {!hasMonthly ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              Chưa có dữ liệu cho năm {year}.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={monthlyData} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" className="text-border" />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: "currentColor" }}
                  className="text-muted-foreground"
                  stroke="currentColor"
                />
                <YAxis
                  tickFormatter={(value: number) => formatVNDCompact(value)}
                  tick={{ fontSize: 11, fill: "currentColor" }}
                  className="text-muted-foreground"
                  stroke="currentColor"
                  width={70}
                />
                <Tooltip
                  content={<MoneyTooltip labels={MONTHLY_LABELS} />}
                  cursor={{ fill: "var(--muted)", opacity: 0.4 }}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} formatter={(value: string) => MONTHLY_LABELS[value] ?? value} />
                <Bar dataKey="revenue" name="revenue" fill="var(--chart-1)" radius={[3, 3, 0, 0]} maxBarSize={24} />
                <Bar dataKey="cogs_total" name="cogs_total" fill="var(--chart-3)" radius={[3, 3, 0, 0]} maxBarSize={24} />
                <Line
                  type="monotone"
                  dataKey="net_profit"
                  name="net_profit"
                  stroke="var(--chart-5)"
                  strokeWidth={2}
                  dot={{ r: 2 }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold">Cơ cấu chi phí — {periodLabel}</CardTitle>
          <CardDescription>Tỷ trọng từng nhóm chi phí trên tổng {formatVND(costTotal)}</CardDescription>
        </CardHeader>
        <CardContent className="h-80">
          {costStructure.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              Chưa ghi nhận chi phí nào trong kỳ này.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={costStructure}
                layout="vertical"
                margin={{ top: 8, right: 16, left: 8, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="currentColor" className="text-border" />
                <XAxis
                  type="number"
                  tickFormatter={(value: number) => formatVNDCompact(value)}
                  tick={{ fontSize: 11, fill: "currentColor" }}
                  className="text-muted-foreground"
                  stroke="currentColor"
                />
                <YAxis
                  type="category"
                  dataKey="label"
                  width={130}
                  tick={{ fontSize: 11, fill: "currentColor" }}
                  className="text-muted-foreground"
                  stroke="currentColor"
                />
                <Tooltip
                  content={<MoneyTooltip labels={{ value: "Số tiền", ...costLabels }} total={costTotal} />}
                  cursor={{ fill: "var(--muted)", opacity: 0.4 }}
                />
                <Bar dataKey="value" name="value" radius={[0, 3, 3, 0]} maxBarSize={28}>
                  {costStructure.map((entry) => (
                    <Cell key={entry.key} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
