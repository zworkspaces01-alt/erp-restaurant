import Link from "next/link";
import { AlertCircle, History, SlidersHorizontal } from "lucide-react";
import { getIngredients } from "@/lib/queries/inventory.queries";
import { PageHeader } from "@/components/shared/page-header";
import { AddIngredientDialog } from "@/components/inventory/add-ingredient-dialog";
import { formatNumber, formatVND } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export const metadata = { title: "Kho nguyên liệu | Restaurant ERP" };

export default async function InventoryPage() {
  const ingredients = await getIngredients();

  const totalInventoryValue = ingredients.reduce(
    (sum, item) => sum + Number(item.current_stock) * Number(item.avg_cost_price),
    0
  );
  const lowStockCount = ingredients.filter(
    (item) => Number(item.current_stock) <= Number(item.min_alert_stock)
  ).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Kho nguyên liệu & Giá vốn bình quân"
        description="Quản lý tồn kho theo đơn vị cơ sở, hệ số quy đổi nhập hàng và cập nhật giá vốn bình quân gia quyền tự động."
        actions={
          <div className="flex gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href="/inventory/adjustments">
                <SlidersHorizontal className="mr-1.5 size-4" />
                Kiểm kê & Hao hụt
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href="/inventory/transactions">
                <History className="mr-1.5 size-4" />
                Sổ kho
              </Link>
            </Button>
            <AddIngredientDialog />
          </div>
        }
      />

      {/* Summary Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="p-4">
          <p className="text-xs font-medium text-muted-foreground">Tổng số mặt hàng</p>
          <p className="mt-1 text-2xl font-semibold">{ingredients.length} nguyên liệu</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-medium text-muted-foreground">Tổng giá trị vốn trong kho</p>
          <p className="mt-1 text-2xl font-semibold text-emerald-600 dark:text-emerald-400">
            {formatVND(totalInventoryValue)}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-medium text-muted-foreground">Mặt hàng dưới mức an toàn</p>
          <p className={`mt-1 text-2xl font-semibold ${lowStockCount > 0 ? "text-destructive" : "text-emerald-600"}`}>
            {lowStockCount} mặt hàng
          </p>
        </Card>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b bg-muted/40 text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Mã / Tên</th>
                  <th className="px-4 py-3 font-medium">Danh mục</th>
                  <th className="px-4 py-3 font-medium">Quy cách quy đổi</th>
                  <th className="px-4 py-3 font-medium text-right">Tồn kho hiện tại</th>
                  <th className="px-4 py-3 font-medium text-right">Mức an toàn</th>
                  <th className="px-4 py-3 font-medium text-right">Giá vốn BQ / ĐV</th>
                  <th className="px-4 py-3 font-medium text-right">Tổng giá trị</th>
                  <th className="px-4 py-3 font-medium text-center">Trạng thái</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {ingredients.map((item) => {
                  const isLow = Number(item.current_stock) <= Number(item.min_alert_stock);
                  const totalVal = Number(item.current_stock) * Number(item.avg_cost_price);

                  return (
                    <tr key={item.id} className="hover:bg-muted/30">
                      <td className="px-4 py-3">
                        <p className="font-medium text-foreground">{item.name}</p>
                        <p className="font-mono text-xs text-muted-foreground">{item.code}</p>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{item.category}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        1 {item.import_unit} = {formatNumber(item.conversion_factor)} {item.base_unit}
                      </td>
                      <td className="px-4 py-3 text-right font-medium">
                        {formatNumber(item.current_stock)} {item.base_unit}
                      </td>
                      <td className="px-4 py-3 text-right text-muted-foreground">
                        {formatNumber(item.min_alert_stock)} {item.base_unit}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {formatVND(item.avg_cost_price)}/{item.base_unit}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold">
                        {formatVND(totalVal)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {isLow ? (
                          <Badge variant="destructive" className="gap-1">
                            <AlertCircle className="size-3" /> Thiếu hàng
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-emerald-600 dark:text-emerald-400">
                            Đủ tồn
                          </Badge>
                        )}
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
