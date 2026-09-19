import { notFound } from "next/navigation";
import { Banknote, CalendarClock, FileText, Wallet } from "lucide-react";
import { PageHeader, StatCard, StatusBadge } from "@/components/shared";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { poStatusTone } from "@/components/purchases/po-status";
import { PurchaseOrderActions } from "@/components/purchases/purchase-order-actions";
import { PurchaseOrderLines } from "@/components/purchases/purchase-order-lines";
import { PaymentsTable } from "@/components/payments/payments-table";
import { RecordPaymentButton } from "@/components/payments/record-payment-button";
import {
  getOutstandingPurchaseOrders,
  getPaymentsForPurchaseOrder,
  getPurchaseOrder,
  getPurchaseOrderItems,
  getIngredientPickList,
  getSupplierOptions,
} from "@/lib/queries/purchases.queries";
import { formatDate, formatVND } from "@/lib/format";
import { PO_PAYMENT_STATUS_LABELS } from "@/types/restaurant";

export const metadata = { title: "Chi tiết phiếu nhập" };

export default async function PurchaseOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const po = await getPurchaseOrder(id);
  if (!po) notFound();

  const [items, payments, suppliers, outstandingOrders, ingredients] = await Promise.all([
    getPurchaseOrderItems(id),
    getPaymentsForPurchaseOrder(id),
    getSupplierOptions(),
    getOutstandingPurchaseOrders(po.supplier_id),
    getIngredientPickList(),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title={po.po_number ?? "Phiếu nhập"}
        description={`${po.supplier_name} · Ngày nhập ${formatDate(po.order_date)}${
          po.invoice_number ? ` · Hóa đơn ${po.invoice_number}` : ""
        }`}
        breadcrumbs={[
          { label: "Phiếu nhập hàng", href: "/purchases" },
          { label: po.po_number ?? "Chi tiết" },
        ]}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {po.debt_amount > 0 ? (
              <RecordPaymentButton
                suppliers={suppliers}
                outstandingOrders={outstandingOrders}
                presetSupplierId={po.supplier_id}
                presetPurchaseOrderId={po.id}
                label="Thanh toán phiếu này"
              />
            ) : (
              <StatusBadge tone="success" dot>
                Đã thanh toán đủ
              </StatusBadge>
            )}
            <PurchaseOrderActions
              purchaseOrderId={po.id}
              poNumber={po.po_number}
              orderDate={po.order_date}
              invoiceNumber={po.invoice_number}
              dueDate={po.due_date}
              note={po.note}
              paidAmount={po.paid_amount}
            />
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard title="Tổng tiền hàng" value={formatVND(po.total_amount)} icon={Banknote} />
        <StatCard title="Đã thanh toán" value={formatVND(po.paid_amount)} icon={Wallet} tone="success" />
        <StatCard
          title="Còn nợ"
          value={formatVND(po.debt_amount)}
          icon={Wallet}
          tone={po.debt_amount > 0 ? "danger" : "success"}
          hint={PO_PAYMENT_STATUS_LABELS[po.payment_status]}
        />
        <StatCard
          title="Hạn thanh toán"
          value={po.due_date ? formatDate(po.due_date) : "—"}
          icon={CalendarClock}
          tone={po.is_overdue ? "danger" : "default"}
          hint={po.is_overdue ? `Quá hạn ${po.days_overdue} ngày` : undefined}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Hàng nhập ({items.length} dòng)</CardTitle>
        </CardHeader>
        <CardContent>
          <PurchaseOrderLines
            purchaseOrderId={po.id}
            items={items}
            totalAmount={po.total_amount}
            ingredients={ingredients}
          />
        </CardContent>
      </Card>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Lịch sử thanh toán</h2>
          <StatusBadge tone={poStatusTone(po.payment_status)} dot>
            {PO_PAYMENT_STATUS_LABELS[po.payment_status]}
          </StatusBadge>
        </div>
        <PaymentsTable
          payments={payments}
          scopePurchaseOrderId={po.id}
          hideSupplier
          emptyMessage="Phiếu nhập này chưa có thanh toán nào."
        />
      </div>

      {(() => {
        const invoiceImages = (() => {
          if (!po.invoice_image_url) return [];
          try {
            const parsed = JSON.parse(po.invoice_image_url);
            if (Array.isArray(parsed)) {
              return parsed.filter((s): s is string => typeof s === "string" && Boolean(s));
            }
          } catch {}
          return po.invoice_image_url.split(",").map((s) => s.trim()).filter(Boolean);
        })();

        if (invoiceImages.length === 0) return null;

        return (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="size-4 text-emerald-600 dark:text-emerald-400" />
                Hóa đơn gốc đính kèm {invoiceImages.length > 1 ? `(${invoiceImages.length} trang ảnh)` : ""}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                {invoiceImages.map((imgUrl, idx) => (
                  <div key={idx} className="space-y-1.5">
                    <div className="relative rounded-lg border overflow-hidden bg-muted/20 aspect-3/4 flex items-center justify-center">
                      <a
                        href={imgUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block w-full h-full group relative"
                        title={`Bấm để mở ảnh trang ${idx + 1} trong tab mới`}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={imgUrl}
                          alt={`Hóa đơn trang ${idx + 1}`}
                          className="w-full h-full object-contain group-hover:opacity-90 transition-opacity"
                        />
                        {invoiceImages.length > 1 && (
                          <span className="absolute top-2 left-2 px-2 py-0.5 rounded text-[11px] font-bold bg-background/90 backdrop-blur-xs shadow-xs">
                            Trang {idx + 1}
                          </span>
                        )}
                      </a>
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Nhấp vào từng ảnh để phóng to và xem chi tiết trong tab mới.
              </p>
            </CardContent>
          </Card>
        );
      })()}

      {po.note ? (
        <Card>
          <CardHeader>
            <CardTitle>Ghi chú</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground whitespace-pre-line">
            {po.note}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
