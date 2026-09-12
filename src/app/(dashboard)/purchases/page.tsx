import Link from "next/link";
import { Plus, Wallet } from "lucide-react";
import { getPurchaseOrders } from "@/lib/queries/purchases.queries";
import { PageHeader } from "@/components/shared/page-header";
import { PO_PAYMENT_STATUS_LABELS, type POPaymentStatus } from "@/types/restaurant";
import { formatDate, formatVND } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export const metadata = { title: "Phiếu nhập kho | Restaurant ERP" };

export default async function PurchasesPage() {
  const purchaseOrders = await getPurchaseOrders();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Phiếu nhập kho & Mua hàng"
        description="Quản lý các phiếu nhập nguyên liệu từ nhà cung cấp, trạng thái thanh toán và theo dõi hạn công nợ gối đầu."
        actions={
          <div className="flex gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href="/payments">
                <Wallet className="mr-1.5 size-4" />
                Sổ quỹ trả nợ
              </Link>
            </Button>
            <Button asChild size="sm">
              <Link href="/purchases/new">
                <Plus className="mr-1.5 size-4" />
                Tạo phiếu nhập mới
              </Link>
            </Button>
          </div>
        }
      />

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b bg-muted/40 text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Số phiếu (PO)</th>
                  <th className="px-4 py-3 font-medium">Nhà cung cấp</th>
                  <th className="px-4 py-3 font-medium">Ngày nhập</th>
                  <th className="px-4 py-3 font-medium">Hạn thanh toán</th>
                  <th className="px-4 py-3 font-medium text-right">Tổng tiền</th>
                  <th className="px-4 py-3 font-medium text-right">Đã trả</th>
                  <th className="px-4 py-3 font-medium text-right">Còn nợ</th>
                  <th className="px-4 py-3 font-medium text-center">Trạng thái nợ</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {purchaseOrders.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-muted-foreground">
                      Chưa có phiếu nhập nào.
                    </td>
                  </tr>
                ) : (
                  purchaseOrders.map((po) => {
                    const sup = po.suppliers as { name?: string; code?: string } | null;
                    const statusKey = (po.payment_status as POPaymentStatus) || "unpaid";
                    const isOverdue =
                      statusKey !== "paid" && new Date(po.due_date) < new Date();

                    return (
                      <tr key={po.id} className="hover:bg-muted/30">
                        <td className="px-4 py-3 font-mono font-medium">{po.po_number}</td>
                        <td className="px-4 py-3">
                          <p className="font-medium text-foreground">{sup?.name ?? "—"}</p>
                          <p className="font-mono text-xs text-muted-foreground">{sup?.code ?? ""}</p>
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">
                          {formatDate(po.order_date)}
                        </td>
                        <td className="px-4 py-3 text-xs">
                          <span className={isOverdue ? "font-semibold text-destructive" : "text-muted-foreground"}>
                            {formatDate(po.due_date)} {isOverdue ? "(Quá hạn)" : ""}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-foreground">
                          {formatVND(po.total_amount)}
                        </td>
                        <td className="px-4 py-3 text-right text-muted-foreground">
                          {formatVND(po.paid_amount)}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-amber-600 dark:text-amber-400">
                          {formatVND(Number(po.total_amount) - Number(po.paid_amount))}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <Badge
                            variant={statusKey === "paid" ? "outline" : statusKey === "partial" ? "secondary" : "destructive"}
                            className={
                              statusKey === "paid"
                                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                                : statusKey === "partial"
                                ? "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400"
                                : ""
                            }
                          >
                            {PO_PAYMENT_STATUS_LABELS[statusKey]}
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
