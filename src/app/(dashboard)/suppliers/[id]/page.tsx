import { notFound } from "next/navigation";
import Link from "next/link";
import { AlertTriangle, Banknote, CalendarClock, FileText, Package, Plus, Wallet } from "lucide-react";
import { PageHeader, StatCard, StatusBadge } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PurchaseOrdersTable } from "@/components/purchases/purchase-orders-table";
import { PaymentsTable } from "@/components/payments/payments-table";
import { RecordPaymentButton } from "@/components/payments/record-payment-button";
import { SupplierEditButton } from "@/components/suppliers/supplier-edit-button";
import {
  getOutstandingPurchaseOrders,
  getPurchaseOrdersBySupplier,
  getSupplier,
  getSupplierDebtRow,
  getSupplierOptions,
  getSupplierPaymentsBySupplier,
} from "@/lib/queries/purchases.queries";
import { formatDate, formatVND } from "@/lib/format";
import { paymentTermLabel } from "@/types/restaurant";

export const metadata = { title: "Chi tiết nhà cung cấp" };

export default async function SupplierDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supplier = await getSupplier(id);
  if (!supplier) notFound();

  const [debt, orders, payments, suppliers, outstandingOrders] = await Promise.all([
    getSupplierDebtRow(id),
    getPurchaseOrdersBySupplier(id),
    getSupplierPaymentsBySupplier(id),
    getSupplierOptions(),
    getOutstandingPurchaseOrders(id),
  ]);

  const currentDebt = debt?.current_debt ?? 0;
  const overdueDebt = debt?.overdue_debt ?? 0;
  const totalPurchased = debt?.total_purchased ?? 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title={supplier.name}
        description={`${paymentTermLabel(supplier.payment_terms_days)}${
          supplier.code ? ` · Mã ${supplier.code}` : ""
        }`}
        breadcrumbs={[{ label: "Nhà cung cấp", href: "/suppliers" }, { label: supplier.name }]}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <SupplierEditButton
              supplier={{
                id: supplier.id,
                code: supplier.code,
                name: supplier.name,
                contact_name: supplier.contact_name,
                phone: supplier.phone,
                email: supplier.email,
                address: supplier.address,
                tax_code: supplier.tax_code,
                payment_terms_days: supplier.payment_terms_days,
                is_active: supplier.is_active,
                note: supplier.note,
              }}
            />
            <RecordPaymentButton
              suppliers={suppliers}
              outstandingOrders={outstandingOrders}
              presetSupplierId={supplier.id}
              disabled={currentDebt <= 0}
            />
            <Button asChild size="sm" variant="outline" className="gap-1.5">
              <Link href={`/inventory?supplier=${encodeURIComponent(supplier.name)}`}>
                <Package className="size-4 text-emerald-600 dark:text-emerald-400" />
                <span>Kho nguyên liệu</span>
              </Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href="/purchases/new">
                <Plus className="mr-1.5 size-4" />
                Tạo phiếu nhập
              </Link>
            </Button>
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Công nợ hiện tại"
          value={formatVND(currentDebt)}
          icon={Wallet}
          tone={currentDebt > 0 ? "info" : "success"}
          hint={`${debt?.unpaid_po_count ?? 0} phiếu chưa tất toán`}
        />
        <StatCard
          title="Nợ quá hạn"
          value={formatVND(overdueDebt)}
          icon={AlertTriangle}
          tone={overdueDebt > 0 ? "danger" : "success"}
          hint={`${debt?.overdue_po_count ?? 0} phiếu quá hạn`}
        />
        <StatCard
          title="Tổng đã mua"
          value={formatVND(totalPurchased)}
          icon={Banknote}
          hint={`${debt?.po_count ?? 0} phiếu nhập`}
        />
        <StatCard
          title="Hạn thanh toán gần nhất"
          value={debt?.next_due_date ? formatDate(debt.next_due_date) : "—"}
          icon={CalendarClock}
        />
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between gap-2">
          <CardTitle>Thông tin liên hệ</CardTitle>
          <StatusBadge tone={supplier.is_active ? "success" : "neutral"} dot>
            {supplier.is_active ? "Đang hợp tác" : "Ngừng hợp tác"}
          </StatusBadge>
        </CardHeader>
        <CardContent className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <div className="text-muted-foreground">Người liên hệ</div>
            <div className="font-medium">{supplier.contact_name ?? "—"}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Điện thoại</div>
            <div className="font-medium">{supplier.phone ?? "—"}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Email</div>
            <div className="font-medium break-all">{supplier.email ?? "—"}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Mã số thuế</div>
            <div className="font-medium">{supplier.tax_code ?? "—"}</div>
          </div>
          <div className="sm:col-span-2 lg:col-span-4">
            <div className="text-muted-foreground">Địa chỉ</div>
            <div className="font-medium">{supplier.address ?? "—"}</div>
          </div>
          {supplier.note ? (
            <div className="sm:col-span-2 lg:col-span-4">
              <div className="text-muted-foreground">Ghi chú</div>
              <div className="whitespace-pre-line">{supplier.note}</div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <div className="space-y-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <FileText className="size-4" />
          Phiếu nhập ({orders.length})
        </h2>
        <PurchaseOrdersTable
          orders={orders}
          hideSupplier
          emptyMessage="Nhà cung cấp này chưa có phiếu nhập nào."
        />
      </div>

      <div className="space-y-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Wallet className="size-4" />
          Lịch sử thanh toán ({payments.length})
        </h2>
        <PaymentsTable
          payments={payments}
          hideSupplier
          emptyMessage="Chưa có phiếu chi nào cho nhà cung cấp này."
        />
      </div>
    </div>
  );
}
