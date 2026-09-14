import Link from "next/link";
import { AlertTriangle, Banknote, FileText, Plus, Wallet } from "lucide-react";
import { PageHeader, StatCard } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { PurchaseOrdersTable } from "@/components/purchases/purchase-orders-table";
import {
  getIngredientPickList,
  getPurchaseOrders,
  getSupplierOptions,
} from "@/lib/queries/purchases.queries";
import { InvoiceOcrDialog } from "@/components/purchases/invoice-ocr-dialog";
import { formatVND } from "@/lib/format";

export const metadata = { title: "Phiếu nhập hàng" };

export default async function PurchasesPage() {
  const [orders, suppliers, ingredients] = await Promise.all([
    getPurchaseOrders(),
    getSupplierOptions(),
    getIngredientPickList(),
  ]);

  const totalAmount = orders.reduce((s, o) => s + o.total_amount, 0);
  const totalDebt = orders.reduce((s, o) => s + o.debt_amount, 0);
  const overdue = orders.filter((o) => o.is_overdue);
  const overdueDebt = overdue.reduce((s, o) => s + o.debt_amount, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Phiếu nhập hàng"
        description="Nhập kho từ nhà cung cấp: tổng tiền, số đã trả và hạn công nợ."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <InvoiceOcrDialog suppliers={suppliers} ingredients={ingredients} />
            <Button asChild size="sm">
              <Link href="/purchases/new">
                <Plus className="mr-1.5 size-4" />
                Tạo phiếu nhập
              </Link>
            </Button>
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard title="Số phiếu nhập" value={String(orders.length)} icon={FileText} />
        <StatCard title="Tổng giá trị nhập" value={formatVND(totalAmount)} icon={Banknote} />
        <StatCard
          title="Còn nợ nhà cung cấp"
          value={formatVND(totalDebt)}
          icon={Wallet}
          tone={totalDebt > 0 ? "info" : "success"}
        />
        <StatCard
          title="Quá hạn"
          value={formatVND(overdueDebt)}
          icon={AlertTriangle}
          tone={overdueDebt > 0 ? "danger" : "success"}
          hint={`${overdue.length} phiếu quá hạn`}
        />
      </div>

      <PurchaseOrdersTable orders={orders} />
    </div>
  );
}
