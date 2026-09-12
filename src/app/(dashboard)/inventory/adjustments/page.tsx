import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getIngredients, getInventoryAdjustments } from "@/lib/queries/inventory.queries";
import { PageHeader } from "@/components/shared/page-header";
import { AddAdjustmentDialog } from "@/components/inventory/add-adjustment-dialog";
import { formatDateTime, formatNumber } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export const metadata = { title: "Kiểm kê & Hao hụt | Restaurant ERP" };

export default async function InventoryAdjustmentsPage() {
  const [adjustments, ingredients] = await Promise.all([
    getInventoryAdjustments(100),
    getIngredients(),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Kiểm kê kho & Xử lý hao hụt"
        description="Ghi nhận sai lệch giữa tồn kho sổ sách và kiểm kê thực tế, xử lý hao hụt và ghi nhận vào chi phí giá vốn."
        breadcrumbs={[
          { label: "Kho nguyên liệu", href: "/inventory" },
          { label: "Kiểm kê & hao hụt" },
        ]}
        actions={
          <div className="flex gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href="/inventory">
                <ArrowLeft className="mr-1.5 size-4" />
                Quay lại kho
              </Link>
            </Button>
            <AddAdjustmentDialog ingredients={ingredients} />
          </div>
        }
      />

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b bg-muted/40 text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Thời gian</th>
                  <th className="px-4 py-3 font-medium">Nguyên liệu</th>
                  <th className="px-4 py-3 font-medium">Hình thức</th>
                  <th className="px-4 py-3 font-medium text-right">Tồn cũ</th>
                  <th className="px-4 py-3 font-medium text-right">Tồn mới</th>
                  <th className="px-4 py-3 font-medium text-right">Chênh lệch</th>
                  <th className="px-4 py-3 font-medium">Lý do</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {adjustments.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-muted-foreground">
                      Chưa có phiếu kiểm kê hay hao hụt nào.
                    </td>
                  </tr>
                ) : (
                  adjustments.map((adj) => {
                    const ing = adj.ingredients as { name?: string; code?: string; base_unit?: string } | null;
                    const diff = Number(adj.difference);
                    const isDiffPositive = diff > 0;

                    return (
                      <tr key={adj.id} className="hover:bg-muted/30">
                        <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">
                          {formatDateTime(adj.created_at)}
                        </td>
                        <td className="px-4 py-3">
                          <p className="font-medium">{ing?.name ?? "—"}</p>
                          <p className="font-mono text-xs text-muted-foreground">{ing?.code ?? ""}</p>
                        </td>
                        <td className="px-4 py-3 capitalize text-muted-foreground">
                          {adj.adjustment_type}
                        </td>
                        <td className="px-4 py-3 text-right text-muted-foreground">
                          {formatNumber(adj.old_stock)} {ing?.base_unit}
                        </td>
                        <td className="px-4 py-3 text-right font-medium">
                          {formatNumber(adj.new_stock)} {ing?.base_unit}
                        </td>
                        <td className={`px-4 py-3 text-right font-semibold ${isDiffPositive ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"}`}>
                          {isDiffPositive ? "+" : ""}
                          {formatNumber(diff)} {ing?.base_unit}
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">
                          {adj.reason}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
