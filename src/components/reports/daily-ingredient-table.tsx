"use client";

import { useMemo, useState } from "react";
import { AlertCircle, Filter, Package, Search } from "lucide-react";
import { formatNumber, formatPercent, formatVND } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { DailyIngredientUsageRow } from "@/lib/queries/reports.queries";

interface DailyIngredientTableProps {
  ingredients: DailyIngredientUsageRow[];
  totalCogs: number;
  totalRevenue: number;
  date: string;
}

export function DailyIngredientTable({
  ingredients,
  totalCogs,
  totalRevenue,
  date,
}: DailyIngredientTableProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("ALL");

  const categories = useMemo(() => {
    const set = new Set(ingredients.map((it) => it.category).filter(Boolean));
    return Array.from(set).sort((a, b) => a.localeCompare(b, "vi"));
  }, [ingredients]);

  const filtered = useMemo(() => {
    return ingredients.filter((it) => {
      const matchSearch =
        searchTerm === "" ||
        it.ingredient_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (it.ingredient_code && it.ingredient_code.toLowerCase().includes(searchTerm.toLowerCase()));

      const matchCategory =
        selectedCategory === "ALL" || it.category === selectedCategory;

      return matchSearch && matchCategory;
    });
  }, [ingredients, searchTerm, selectedCategory]);

  const filteredTotalCost = useMemo(() => {
    return filtered.reduce((sum, it) => sum + it.total_cost, 0);
  }, [filtered]);

  return (
    <Card className="shadow-sm">
      <CardHeader className="p-4 sm:p-6 pb-3 sm:pb-4 border-b">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Package className="size-4 text-emerald-600" />
              Chi Tiết Sử Dụng Nguyên Liệu Trong Ngày ({filtered.length}/{ingredients.length} mặt hàng)
            </CardTitle>
            <CardDescription className="text-xs">
              Thống kê lượng nguyên liệu xuất bán từ các món ăn và lượng hao hụt trong ngày {date}.
            </CardDescription>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="size-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Tìm tên hoặc mã nguyên liệu..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="h-8 pl-8 text-xs w-[180px] sm:w-[220px]"
              />
            </div>

            {categories.length > 0 && (
              <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                <SelectTrigger className="h-8 text-xs w-[140px] gap-1">
                  <Filter className="size-3 text-muted-foreground" />
                  <SelectValue placeholder="Danh mục" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Tất cả danh mục</SelectItem>
                  {categories.map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      {cat}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        {filtered.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground flex flex-col items-center justify-center space-y-2">
            <AlertCircle className="size-8 text-muted-foreground/50" />
            <p className="text-sm font-medium">Không có dữ liệu tiêu hao nguyên liệu trong ngày này.</p>
            <p className="text-xs">Chưa có đơn hàng nào được bán hoặc phiếu hao hụt được ghi nhận vào ngày {date}.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-muted/50 border-b text-muted-foreground font-semibold">
                <tr>
                  <th className="p-3 min-w-[180px]">Nguyên liệu</th>
                  <th className="p-3 min-w-[110px]">Danh mục</th>
                  <th className="p-3 text-center min-w-[60px]">ĐVT</th>
                  <th className="p-3 text-right min-w-[90px]">Lượng bán</th>
                  <th className="p-3 text-right min-w-[90px]">Lượng hao hụt</th>
                  <th className="p-3 text-right min-w-[100px]">Tổng tiêu hao</th>
                  <th className="p-3 text-right min-w-[110px]">Giá vốn BQ</th>
                  <th className="p-3 text-right min-w-[120px]">Thành tiền (VNĐ)</th>
                  <th className="p-3 min-w-[140px]">% Chi phí NL</th>
                  <th className="p-3 text-right min-w-[100px]">% Doanh thu</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((it) => (
                  <tr key={it.ingredient_id} className="hover:bg-muted/30 transition-colors">
                    <td className="p-3 font-medium">
                      <div className="space-y-0.5">
                        <div className="text-foreground">{it.ingredient_name}</div>
                        {it.ingredient_code && (
                          <span className="text-[10px] text-muted-foreground font-mono">
                            {it.ingredient_code}
                          </span>
                        )}
                      </div>
                    </td>

                    <td className="p-3">
                      <Badge variant="outline" className="text-[10px] font-normal">
                        {it.category}
                      </Badge>
                    </td>

                    <td className="p-3 text-center text-muted-foreground">
                      {it.base_unit}
                    </td>

                    <td className="p-3 text-right tabular-nums text-foreground">
                      {it.sale_qty > 0 ? formatNumber(it.sale_qty, 2) : "—"}
                    </td>

                    <td className="p-3 text-right tabular-nums text-amber-600 dark:text-amber-400">
                      {it.waste_qty > 0 ? formatNumber(it.waste_qty, 2) : "—"}
                    </td>

                    <td className="p-3 text-right tabular-nums font-semibold text-foreground">
                      {formatNumber(it.total_qty, 2)}
                    </td>

                    <td className="p-3 text-right tabular-nums text-muted-foreground">
                      {formatVND(it.avg_unit_cost)}
                    </td>

                    <td className="p-3 text-right tabular-nums font-bold text-foreground">
                      {formatVND(it.total_cost)}
                    </td>

                    <td className="p-3">
                      <div className="space-y-1">
                        <div className="flex justify-between text-[10px] tabular-nums">
                          <span>{it.pct_of_total_cogs.toFixed(1)}%</span>
                        </div>
                        <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full bg-emerald-500 rounded-full"
                            style={{ width: `${Math.min(it.pct_of_total_cogs, 100)}%` }}
                          />
                        </div>
                      </div>
                    </td>

                    <td className="p-3 text-right tabular-nums font-semibold text-primary">
                      {totalRevenue > 0 ? formatPercent(it.pct_of_revenue) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-muted/40 font-semibold border-t">
                <tr>
                  <td colSpan={7} className="p-3 text-right">
                    Tổng chi phí tiêu hao ({filtered.length} mặt hàng):
                  </td>
                  <td className="p-3 text-right tabular-nums font-bold text-emerald-700 dark:text-emerald-400 text-sm">
                    {formatVND(filteredTotalCost)}
                  </td>
                  <td className="p-3 tabular-nums text-xs">
                    {totalCogs > 0
                      ? `${((filteredTotalCost / totalCogs) * 100).toFixed(1)}% tổng NL`
                      : "100%"}
                  </td>
                  <td className="p-3 text-right tabular-nums text-xs text-primary font-bold">
                    {totalRevenue > 0
                      ? formatPercent((filteredTotalCost / totalRevenue) * 100)
                      : "—"}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
