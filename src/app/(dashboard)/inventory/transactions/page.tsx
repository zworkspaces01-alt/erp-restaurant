import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getInventoryTransactions } from "@/lib/queries/inventory.queries";
import { PageHeader } from "@/components/shared/page-header";
import { formatDateTime, formatNumber, formatVND } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export const metadata = { title: "Sổ kho nguyên liệu | Restaurant ERP" };

const TYPE_LABELS: Record<string, { label: string; color: string }> = {
  purchase: { label: "Nhập kho PO", color: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" },
  sale: { label: "Xuất bán POS", color: "bg-blue-500/15 text-blue-700 dark:text-blue-400" },
  adjustment: { label: "Kiểm kê", color: "bg-amber-500/15 text-amber-700 dark:text-amber-400" },
  waste: { label: "Hủy / Hao hụt", color: "bg-rose-500/15 text-rose-700 dark:text-rose-400" },
  cancel_order: { label: "Hoàn hủy đơn", color: "bg-purple-500/15 text-purple-700 dark:text-purple-400" },
};

export default async function InventoryTransactionsPage() {
  const transactions = await getInventoryTransactions(100);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Sổ kho nguyên liệu"
        description="Lịch sử chi tiết mọi biến động nhập hàng, xuất bán theo định lượng món, hao hụt sơ chế và kiểm kê."
        breadcrumbs={[
          { label: "Kho nguyên liệu", href: "/inventory" },
          { label: "Sổ kho" },
        ]}
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/inventory">
              <ArrowLeft className="mr-1.5 size-4" />
              Quay lại kho
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
                  <th className="px-4 py-3 font-medium">Thời gian</th>
                  <th className="px-4 py-3 font-medium">Nguyên liệu</th>
                  <th className="px-4 py-3 font-medium">Loại phát sinh</th>
                  <th className="px-4 py-3 font-medium text-right">Biến động</th>
                  <th className="px-4 py-3 font-medium text-right">Tồn sau phát sinh</th>
                  <th className="px-4 py-3 font-medium text-right">Giá trị</th>
                  <th className="px-4 py-3 font-medium">Ghi chú</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {transactions.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-muted-foreground">
                      Chưa có giao dịch kho nào.
                    </td>
                  </tr>
                ) : (
                  transactions.map((tx) => {
                    const ing = tx.ingredients as { name?: string; code?: string; base_unit?: string } | null;
                    const isPositive = Number(tx.quantity_change) > 0;
                    const typeConfig = TYPE_LABELS[tx.transaction_type] ?? {
                      label: tx.transaction_type,
                      color: "bg-muted text-muted-foreground",
                    };

                    return (
                      <tr key={tx.id} className="hover:bg-muted/30">
                        <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">
                          {formatDateTime(tx.created_at)}
                        </td>
                        <td className="px-4 py-3">
                          <p className="font-medium">{ing?.name ?? "—"}</p>
                          <p className="font-mono text-xs text-muted-foreground">{ing?.code ?? ""}</p>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium ${typeConfig.color}`}>
                            {typeConfig.label}
                          </span>
                        </td>
                        <td className={`px-4 py-3 text-right font-medium ${isPositive ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"}`}>
                          {isPositive ? "+" : ""}
                          {formatNumber(tx.quantity_change)} {ing?.base_unit}
                        </td>
                        <td className="px-4 py-3 text-right text-muted-foreground">
                          {formatNumber(tx.stock_after)} {ing?.base_unit}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold">
                          {formatVND(tx.total_value)}
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">
                          {tx.notes || "—"}
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
