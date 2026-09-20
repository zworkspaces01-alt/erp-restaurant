import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import {
  getOrderDetail,
  type OrderConsumptionRow,
} from "@/lib/queries/orders.queries";
import { CancelOrderButton } from "@/components/orders/cancel-order-button";
import { PageHeader, StatCard, StatusBadge } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { formatDateTime, formatNumber, formatPercent, formatVND } from "@/lib/format";
import { ORDER_STATUS_LABELS, PAYMENT_METHOD_LABELS } from "@/types/restaurant";

export const metadata = { title: "Chi tiết đơn bán | Restaurant ERP" };

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const detail = await getOrderDetail(id);
  if (!detail) notFound();

  const {
    order,
    items,
    gross_profit: grossProfit,
    gross_margin_pct: marginPct,
    tax_amount: taxAmount,
    total_with_tax: totalWithTax,
  } = detail;
  const cancelled = order.status === "cancelled";

  // Gom sổ kho theo món để kể đúng câu chuyện "bán món này — hết bao nhiêu nguyên liệu".
  const consumptionGroups = Array.from(
    detail.consumption.reduce((map, row) => {
      const key = row.order_item_id ?? row.menu_item_name;
      const group = map.get(key) ?? { menuItemName: row.menu_item_name, rows: [] };
      group.rows.push(row);
      map.set(key, group);
      return map;
    }, new Map<string, { menuItemName: string; rows: OrderConsumptionRow[] }>())
  ).map(([, group]) => group);

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Đơn ${order.order_number ?? ""}`.trim()}
        description={`${formatDateTime(order.order_date)} · ${
          order.table_number ? `Bàn ${order.table_number}` : "Tại quầy"
        } · ${PAYMENT_METHOD_LABELS[order.payment_method]}`}
        breadcrumbs={[{ label: "Đơn bán hàng", href: "/orders" }, { label: order.order_number ?? "Chi tiết" }]}
        actions={
          <div className="flex items-center gap-2">
            <StatusBadge tone={cancelled ? "danger" : "success"} dot>
              {ORDER_STATUS_LABELS[order.status]}
            </StatusBadge>
            <Button asChild variant="outline" size="sm">
              <Link href="/orders">
                <ArrowLeft className="size-4" />
                Danh sách đơn
              </Link>
            </Button>
            {!cancelled && (
              <CancelOrderButton orderId={order.id} orderNumber={order.order_number} />
            )}
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Tổng thực thu (gồm VAT)"
          value={formatVND(totalWithTax)}
          hint={taxAmount > 0 ? `Thuần: ${formatVND(order.total_amount)} · VAT: ${formatVND(taxAmount)}` : undefined}
          tone="success"
        />
        <StatCard title="Giá vốn thực tế" value={formatVND(order.total_cogs)} tone="warning" />
        <StatCard title="Lãi gộp" value={formatVND(grossProfit)} tone="info" />
        <StatCard
          title="Biên lãi gộp"
          value={marginPct === null ? "—" : formatPercent(marginPct)}
          hint={cancelled ? "Đơn đã hủy — số liệu chỉ để đối chiếu" : undefined}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Chi tiết món ({items.length} dòng)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Món</th>
                  <th className="px-3 py-2 text-right font-medium">SL</th>
                  <th className="px-3 py-2 text-right font-medium">Đơn giá</th>
                  <th className="px-3 py-2 text-right font-medium">Thành tiền</th>
                  <th className="px-3 py-2 text-right font-medium">Giá vốn</th>
                  <th className="px-3 py-2 text-right font-medium">Lãi gộp</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-muted-foreground">
                      Đơn hàng chưa có dòng món nào.
                    </td>
                  </tr>
                ) : (
                  items.map((item) => (
                    <tr key={item.id}>
                      <td className="px-3 py-2">
                        <span className="font-medium">{item.menu_item_name}</span>
                        {item.menu_item_code && (
                          <span className="ml-2 font-mono text-xs text-muted-foreground">
                            {item.menu_item_code}
                          </span>
                        )}
                        {item.menu_item_category && (
                          <p className="text-xs text-muted-foreground">{item.menu_item_category}</p>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {formatNumber(item.quantity)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {formatVND(item.unit_price)}
                      </td>
                      <td className="px-3 py-2 text-right font-medium tabular-nums">
                        {formatVND(item.line_total)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                        {formatVND(item.cogs_amount)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {formatVND(item.line_margin)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <Separator />

          <dl className="ml-auto w-full max-w-xs space-y-1.5 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Tạm tính</dt>
              <dd className="tabular-nums">{formatVND(order.subtotal)}</dd>
            </div>
            {order.discount > 0 && (
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Giảm giá</dt>
                <dd className="tabular-nums text-destructive">-{formatVND(order.discount)}</dd>
              </div>
            )}
            <div className="flex justify-between text-muted-foreground">
              <dt>Doanh thu thuần (trước thuế)</dt>
              <dd className="tabular-nums font-medium">{formatVND(order.total_amount)}</dd>
            </div>
            {taxAmount > 0 && (
              <div className="flex justify-between text-muted-foreground">
                <dt>Tiền thuế GTGT</dt>
                <dd className="tabular-nums text-emerald-600 dark:text-emerald-400">+{formatVND(taxAmount)}</dd>
              </div>
            )}
            <div className="flex justify-between text-base font-semibold border-t pt-1.5">
              <dt>Tổng thực thu (Khách trả)</dt>
              <dd className="tabular-nums text-primary">{formatVND(totalWithTax)}</dd>
            </div>
          </dl>

          {order.note && (
            <p className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">Ghi chú: </span>
              {order.note}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Nguyên liệu đã xuất kho</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {consumptionGroups.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {cancelled
                ? "Đơn đã hủy — nguyên liệu đã được hoàn lại kho."
                : "Chưa ghi nhận biến động kho cho đơn này (món chưa có định lượng)."}
            </p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b text-xs text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 font-medium">Món</th>
                      <th className="px-3 py-2 font-medium">Nguyên liệu</th>
                      <th className="px-3 py-2 text-right font-medium">Số lượng</th>
                      <th className="px-3 py-2 text-right font-medium">Đơn giá vốn</th>
                      <th className="px-3 py-2 text-right font-medium">Thành tiền</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {consumptionGroups.map((group) =>
                      group.rows.map((row, index) => (
                        <tr key={row.id}>
                          <td className="px-3 py-2">
                            {index === 0 ? (
                              <span className="font-medium">{group.menuItemName}</span>
                            ) : null}
                          </td>
                          <td className="px-3 py-2">
                            {row.ingredient_name}
                            {row.ingredient_code && (
                              <span className="ml-2 font-mono text-xs text-muted-foreground">
                                {row.ingredient_code}
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {formatNumber(row.quantity, 3)} {row.base_unit}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                            {formatVND(row.unit_cost)}
                          </td>
                          <td className="px-3 py-2 text-right font-medium tabular-nums">
                            {formatVND(row.total_cost)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              <p className="text-right text-sm">
                <span className="text-muted-foreground">Tổng giá trị nguyên liệu: </span>
                <span className="font-semibold tabular-nums">
                  {formatVND(detail.consumption_total_cost)}
                </span>
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
