"use client";

import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, PieChart, Pie, Cell, Legend } from "recharts";
import { formatVNDCompact, formatVND } from "@/lib/format";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const COLORS = ["#10b981", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899"];

interface PnLChartsProps {
  summary: {
    revenue: number;
    cogs: number;
    gross_profit: number;
    labor_cost: number;
    opex: number;
    net_profit: number;
  };
  categoryBreakdown: Array<{ name: string; value: number }>;
}

export function PnLCharts({ summary, categoryBreakdown }: PnLChartsProps) {
  const barData = [
    { name: "Doanh thu", amount: Number(summary.revenue), fill: "#10b981" },
    { name: "Giá vốn (COGS)", amount: Number(summary.cogs), fill: "#f59e0b" },
    { name: "Lãi gộp", amount: Number(summary.gross_profit), fill: "#3b82f6" },
    { name: "Nhân sự", amount: Number(summary.labor_cost), fill: "#8b5cf6" },
    { name: "Vận hành (OPEX)", amount: Number(summary.opex), fill: "#ec4899" },
    { name: "Lợi nhuận ròng", amount: Number(summary.net_profit), fill: Number(summary.net_profit) >= 0 ? "#10b981" : "#ef4444" },
  ];

  const pieData = [
    { name: "Giá vốn (COGS)", value: Number(summary.cogs) },
    { name: "Chi phí nhân sự", value: Number(summary.labor_cost) },
    ...categoryBreakdown.map((c) => ({ name: c.name, value: Number(c.value) })),
  ].filter((d) => d.value > 0);

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      {/* Cấu trúc tài chính */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold">Cấu trúc Doanh thu & Chi phí (P&L)</CardTitle>
          <CardDescription>So sánh các chỉ tiêu tài chính chính trong kỳ</CardDescription>
        </CardHeader>
        <CardContent className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={barData} margin={{ top: 10, right: 10, left: 10, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-15} textAnchor="end" />
              <YAxis tickFormatter={(v) => formatVNDCompact(v)} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(value) => [formatVND(Number(value)), "Số tiền"]} />
              <Bar dataKey="amount" radius={[4, 4, 0, 0]}>
                {barData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Cơ cấu chi phí */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold">Tỷ trọng cơ cấu chi phí</CardTitle>
          <CardDescription>Phân bổ ngân sách vào COGS, Lương và OPEX</CardDescription>
        </CardHeader>
        <CardContent className="h-72">
          {pieData.length === 0 ? (
            <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
              Chưa có dữ liệu chi phí trong kỳ
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={3}
                  dataKey="value"
                >
                  {pieData.map((_, index) => (
                    <Cell key={`slice-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => [formatVND(Number(value)), "Chi phí"]} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
