"use client";

import * as React from "react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatDate, formatNumber, formatVND, formatVNDCompact } from "@/lib/format";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export interface DailySalesChartPoint {
  sales_date: string;
  order_count: number;
  revenue: number;
  cogs: number;
  gross_profit: number;
}

interface DailySalesChartProps {
  data: DailySalesChartPoint[];
  title?: string;
  description?: string;
}

const SERIES_LABELS: Record<string, string> = {
  revenue: "Doanh thu",
  gross_profit: "Lợi nhuận gộp",
};

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: readonly { dataKey?: string | number; value?: number | string }[];
  label?: string | number;
}) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="rounded-md border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="mb-1 font-medium text-popover-foreground">{formatDate(String(label))}</p>
      {payload.map((entry) => (
        <p key={String(entry.dataKey)} className="flex items-center justify-between gap-4 text-muted-foreground">
          <span>{SERIES_LABELS[String(entry.dataKey)] ?? String(entry.dataKey)}</span>
          <span className="font-medium tabular-nums text-popover-foreground">{formatVND(Number(entry.value ?? 0))}</span>
        </p>
      ))}
    </div>
  );
}

export function DailySalesChart({
  data,
  title = "Doanh thu 30 ngày gần nhất",
  description = "Cột: doanh thu theo ngày · Đường: lợi nhuận gộp",
}: DailySalesChartProps) {
  const totals = React.useMemo(
    () =>
      data.reduce(
        (acc, point) => ({
          revenue: acc.revenue + point.revenue,
          grossProfit: acc.grossProfit + point.gross_profit,
          orders: acc.orders + point.order_count,
        }),
        { revenue: 0, grossProfit: 0, orders: 0 }
      ),
    [data]
  );

  const hasData = totals.orders > 0;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
        <p className="text-xs text-muted-foreground">
          Tổng: {formatVND(totals.revenue)} · Lợi nhuận gộp: {formatVND(totals.grossProfit)} ·{" "}
          {formatNumber(totals.orders, 0)} đơn
        </p>
      </CardHeader>
      <CardContent className="h-72">
        {!hasData ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Chưa có đơn hàng hoàn tất trong 30 ngày gần nhất.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" className="text-border" />
              <XAxis
                dataKey="sales_date"
                tickFormatter={(value: string) => formatDate(value, "dd/MM")}
                tick={{ fontSize: 11, fill: "currentColor" }}
                className="text-muted-foreground"
                stroke="currentColor"
                minTickGap={16}
              />
              <YAxis
                tickFormatter={(value: number) => formatVNDCompact(value)}
                tick={{ fontSize: 11, fill: "currentColor" }}
                className="text-muted-foreground"
                stroke="currentColor"
                width={70}
              />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: "var(--muted)", opacity: 0.4 }} />
              <Legend
                wrapperStyle={{ fontSize: 11 }}
                formatter={(value: string) => SERIES_LABELS[value] ?? value}
              />
              <Bar dataKey="revenue" name="revenue" fill="var(--chart-1)" radius={[3, 3, 0, 0]} maxBarSize={22} />
              <Line
                type="monotone"
                dataKey="gross_profit"
                name="gross_profit"
                stroke="var(--chart-3)"
                strokeWidth={2}
                dot={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
