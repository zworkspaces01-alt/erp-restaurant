import Link from "next/link";
import { BarChart3, Edit3 } from "lucide-react";
import { getMenuItemsWithCosts } from "@/lib/queries/menu.queries";
import { PageHeader } from "@/components/shared/page-header";
import { AddMenuItemDialog } from "@/components/menu/add-menu-item-dialog";
import { formatPercent, formatVND } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export const metadata = { title: "Thực đơn & Định lượng | Restaurant ERP" };

export default async function MenuPage() {
  const menuItems = await getMenuItemsWithCosts();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Thực đơn, Định lượng món (BOM) & Food Cost"
        description="Quản lý giá bán, giá vốn chuẩn (Ideal Cost) theo công thức định lượng và kiểm soát tỷ lệ Food Cost thời gian thực."
        actions={
          <div className="flex gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href="/menu/engineering">
                <BarChart3 className="mr-1.5 size-4" />
                Ma trận Menu Engineering
              </Link>
            </Button>
            <AddMenuItemDialog />
          </div>
        }
      />

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b bg-muted/40 text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Mã / Tên món</th>
                  <th className="px-4 py-3 font-medium">Danh mục</th>
                  <th className="px-4 py-3 font-medium text-right">Giá bán</th>
                  <th className="px-4 py-3 font-medium text-right">Giá vốn chuẩn (BOM)</th>
                  <th className="px-4 py-3 font-medium text-right">Lãi đóng góp (CM)</th>
                  <th className="px-4 py-3 font-medium text-center">Food Cost %</th>
                  <th className="px-4 py-3 font-medium text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {menuItems.map((item) => {
                  const fc = Number(item.food_cost_percent);
                  let badgeColor = "text-emerald-600 dark:text-emerald-400";
                  if (fc > 35) {
                    badgeColor = "bg-rose-500/15 text-rose-700 dark:text-rose-400 border-rose-500/20";
                  } else if (fc >= 30) {
                    badgeColor = "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/20";
                  }

                  return (
                    <tr key={item.menu_item_id} className="hover:bg-muted/30">
                      <td className="px-4 py-3">
                        <p className="font-medium text-foreground">{item.name}</p>
                        <p className="font-mono text-xs text-muted-foreground">{item.code}</p>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{item.category}</td>
                      <td className="px-4 py-3 text-right font-semibold">
                        {formatVND(item.selling_price)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {formatVND(item.ideal_cost)}
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-foreground">
                        {formatVND(item.contribution_margin)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-flex rounded-md border px-2 py-0.5 text-xs font-semibold ${badgeColor}`}>
                          {formatPercent(fc)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button asChild variant="ghost" size="sm">
                          <Link href={`/menu/${item.menu_item_id}`}>
                            <Edit3 className="mr-1 size-3.5" />
                            Định lượng BOM
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
