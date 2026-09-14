"use client";

import Link from "next/link";
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
import { TrendingUp, Calendar, ArrowRight } from "lucide-react";
import { formatDate, formatNumber, formatPercent, formatVND, formatVNDCompact } from "@/lib/format";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { DailyTrendRow } from "@/lib/queries/reports.queries";

interface DailyTrendSectionProps {
  trend: DailyTrendRow[];
  currentDate: string;
}

export function DailyTrendSection({ trend, currentDate }: DailyTrendSectionProps) {
  // Chuẩn bị dữ liệu hiển thị biểu đồ từ cũ tới mới
  const chartData = [...trend].reverse().map((row) => ({
    date: row.report_date,
    displayDate: row.report_date.slice(5), // MM-DD
    revenue: row.revenue,
    cogs: row.cogs_total,
    netProfit: row.net_profit,
    foodCostPct: row.food_cost_pct,
  }));

  return (
    <div className="space-y-6">
      {/* 1. Biểu đồ xu hướng Doanh thu vs Chi phí nguyên liệu vs Lợi nhuận */}
      <Card className="shadow-sm">
        <CardHeader className="p-4 sm:p-6 pb-2 border-b">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <TrendingUp className="size-4 text-primary" />
                Xu Hướng Doanh Thu, Chi Phí Nguyên Liệu &amp; Lãi Ròng (14 ngày qua)
              </CardTitle>
              <CardDescription className="text-xs">
                So sánh sự biến thiên của doanh thu, chi phí nguyên liệu và lợi nhuận ròng theo từng ngày.
              </CardDescription>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-4 sm:p-6 pt-4">
          <div className="h-[320px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                <XAxis
                  dataKey="displayDate"
                  tickLine={false}
                  axisLine={{ stroke: "hsl(var(--border))" }}
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                  tickFormatter={(v) => formatVNDCompact(v)}
                />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (!active || !payload || payload.length === 0) return null;
                    const item = chartData.find((d) => d.displayDate === label);
                    return (
                      <div className="rounded-lg border bg-popover p-3 text-xs shadow-md space-y-1">
                        <div className="font-semibold text-foreground border-b pb-1">
                          Ngày {item?.date ? formatDate(item.date) : String(label)}
                        </div>
                        <div className="flex justify-between gap-4 text-sky-600 dark:text-sky-400">
                          <span>Doanh thu:</span>
                          <span className="font-bold">{formatVND(Number(payload[0]?.value ?? 0))}</span>
                        </div>
                        <div className="flex justify-between gap-4 text-amber-600 dark:text-amber-400">
                          <span>Chi phí nguyên liệu:</span>
                          <span className="font-bold">{formatVND(Number(payload[1]?.value ?? 0))}</span>
                        </div>
                        <div className="flex justify-between gap-4 text-emerald-600 dark:text-emerald-400">
                          <span>Lợi nhuận ròng:</span>
                          <span className="font-bold">{formatVND(Number(payload[2]?.value ?? 0))}</span>
                        </div>
                        {item && item.revenue > 0 && (
                          <div className="flex justify-between gap-4 text-red-500 border-t pt-1">
                            <span>% Food Cost:</span>
                            <span className="font-bold">{formatPercent(item.foodCostPct)}</span>
                          </div>
                        )}
                      </div>
                    );
                  }}
                />
                <Legend
                  verticalAlign="top"
                  align="right"
                  wrapperStyle={{ fontSize: 12, paddingBottom: 12 }}
                />
                <Bar
                  dataKey="revenue"
                  name="Doanh thu"
                  fill="#0ea5e9"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={32}
                />
                <Bar
                  dataKey="cogs"
                  name="Chi phí nguyên liệu"
                  fill="#f59e0b"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={32}
                />
                <Line
                  type="monotone"
                  dataKey="netProfit"
                  name="Lợi nhuận ròng"
                  stroke="#10b981"
                  strokeWidth={2.5}
                  dot={{ r: 3, fill: "#10b981" }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* 2. Bảng tổng hợp các ngày trong chuỗi */}
      <Card className="shadow-sm">
        <CardHeader className="p-4 sm:p-6 pb-3 border-b">
          <CardTitle className="text-base flex items-center gap-2">
            <Calendar className="size-4 text-primary" />
            Bảng Theo Dõi Lỗ Lãi &amp; Tỷ Lệ Nguyên Liệu Theo Ngày
          </CardTitle>
          <CardDescription className="text-xs">
            Bấm vào từng ngày để chuyển xem chi tiết danh mục nguyên liệu tiêu hao của ngày đó.
          </CardDescription>
        </CardHeader>

        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-muted/50 border-b text-muted-foreground font-semibold">
                <tr>
                  <th className="p-3 min-w-[110px]">Ngày</th>
                  <th className="p-3 text-center min-w-[70px]">Số đơn</th>
                  <th className="p-3 text-right min-w-[120px]">Doanh thu</th>
                  <th className="p-3 text-right min-w-[120px]">Chi phí nguyên liệu</th>
                  <th className="p-3 text-center min-w-[110px]">% Food Cost / DT</th>
                  <th className="p-3 text-right min-w-[120px]">Lợi nhuận gộp</th>
                  <th className="p-3 text-right min-w-[110px]">Chi phí vận hành</th>
                  <th className="p-3 text-right min-w-[120px]">Lợi nhuận ròng</th>
                  <th className="p-3 text-right min-w-[90px]">Biên ròng</th>
                  <th className="p-3 text-center w-[50px]"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {trend.map((row) => {
                  const isCurrent = row.report_date === currentDate;
                  const fcPct = row.food_cost_pct;

                  return (
                    <tr
                      key={row.report_date}
                      className={
                        isCurrent
                          ? "bg-primary/5 font-medium border-l-2 border-l-primary"
                          : "hover:bg-muted/30 transition-colors"
                      }
                    >
                      <td className="p-3 font-semibold">
                        <div className="flex items-center gap-1.5">
                          <span>{formatDate(row.report_date)}</span>
                          {isCurrent && (
                            <Badge variant="secondary" className="text-[9px] py-0 px-1 bg-primary/10 text-primary">
                              Đang xem
                            </Badge>
                          )}
                        </div>
                      </td>

                      <td className="p-3 text-center tabular-nums text-muted-foreground">
                        {row.order_count > 0 ? formatNumber(row.order_count, 0) : "—"}
                      </td>

                      <td className="p-3 text-right tabular-nums font-semibold text-foreground">
                        {formatVND(row.revenue)}
                      </td>

                      <td className="p-3 text-right tabular-nums text-amber-700 dark:text-amber-400 font-medium">
                        {formatVND(row.cogs_total)}
                      </td>

                      <td className="p-3 text-center tabular-nums">
                        {row.revenue > 0 ? (
                          <Badge
                            variant="outline"
                            className={
                              fcPct <= 35
                                ? "text-emerald-700 dark:text-emerald-400 border-emerald-500/30 bg-emerald-500/10"
                                : fcPct <= 40
                                ? "text-amber-700 dark:text-amber-400 border-amber-500/30 bg-amber-500/10"
                                : "text-destructive border-destructive/30 bg-destructive/10"
                            }
                          >
                            {formatPercent(fcPct)}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>

                      <td className="p-3 text-right tabular-nums text-foreground">
                        {formatVND(row.gross_profit)}
                      </td>

                      <td className="p-3 text-right tabular-nums text-muted-foreground">
                        {row.opex_total > 0 ? formatVND(row.opex_total) : "—"}
                      </td>

                      <td
                        className={`p-3 text-right tabular-nums font-bold ${
                          row.net_profit >= 0
                            ? "text-emerald-700 dark:text-emerald-400"
                            : "text-destructive"
                        }`}
                      >
                        {formatVND(row.net_profit)}
                      </td>

                      <td className="p-3 text-right tabular-nums font-medium">
                        {row.revenue > 0 ? formatPercent(row.net_margin_pct) : "—"}
                      </td>

                      <td className="p-3 text-center">
                        <Button asChild variant="ghost" size="icon" className="size-7" title="Xem chi tiết ngày này">
                          <Link href={`/reports/daily?date=${row.report_date}`}>
                            <ArrowRight className="size-3.5" />
                          </Link>
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
