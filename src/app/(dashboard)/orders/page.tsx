import Link from "next/link";
import { Plus } from "lucide-react";
import { getOrders } from "@/lib/queries/orders.queries";
import { PageHeader } from "@/components/shared/page-header";
import { ORDER_STATUS_LABELS, type OrderStatus } from "@/types/restaurant";
import { formatDateTime, formatVND } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export const metadata = { title: "Đơn bán hàng | Restaurant ERP" };

export default async function OrdersPage() {
  const orders = await getOrders(100);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Quản lý đơn bán hàng & Doanh thu"
        description="Lịch sử hóa đơn, bàn ăn, hình thức thanh toán và giá vốn COGS thực tế tại thời điểm bán."
        actions={
          <Button asChild size="sm">
            <Link href="/orders/new">
              <Plus className="mr-1.5 size-4" />
              Tạo đơn bán hàng
            </Link>
          </Button>
        }
      />

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b bg-muted/40 text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Mã đơn</th>
                  <th className="px-4 py-3 font-medium">Thời gian</th>
                  <th className="px-4 py-3 font-medium">Bàn / Vị trí</th>
                  <th className="px-4 py-3 font-medium">Thanh toán</th>
                  <th className="px-4 py-3 font-medium text-right">Doanh thu</th>
                  <th className="px-4 py-3 font-medium text-right">Giá vốn (COGS)</th>
                  <th className="px-4 py-3 font-medium text-right">Lãi gộp</th>
                  <th className="px-4 py-3 font-medium text-center">Trạng thái</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {orders.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-muted-foreground">
                      Chưa có đơn hàng nào được ghi nhận.
                    </td>
                  </tr>
                ) : (
                  orders.map((order) => {
                    const grossProfit = Number(order.total_amount) - Number(order.total_cogs);
                    const statusKey = (order.status as OrderStatus) || "completed";

                    return (
                      <tr key={order.id} className="hover:bg-muted/30">
                        <td className="px-4 py-3 font-mono font-medium">{order.order_number}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">
                          {formatDateTime(order.order_date)}
                        </td>
                        <td className="px-4 py-3 font-medium">{order.table_number || "Tại quầy"}</td>
                        <td className="px-4 py-3 capitalize text-muted-foreground">
                          {order.payment_method === "cash"
                            ? "Tiền mặt"
                            : order.payment_method === "card"
                            ? "Thẻ POS"
                            : "Chuyển khoản"}
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-foreground">
                          {formatVND(order.total_amount)}
                        </td>
                        <td className="px-4 py-3 text-right text-muted-foreground">
                          {formatVND(order.total_cogs)}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-emerald-600 dark:text-emerald-400">
                          {formatVND(grossProfit)}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <Badge
                            variant={statusKey === "completed" ? "outline" : "destructive"}
                            className={
                              statusKey === "completed"
                                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                                : ""
                            }
                          >
                            {ORDER_STATUS_LABELS[statusKey]}
                          </Badge>
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
