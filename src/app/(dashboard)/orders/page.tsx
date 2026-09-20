import Link from "next/link";
import { Plus, Receipt } from "lucide-react";
import {
  getAppTimezone,
  getOrders,
  getOrdersSummary,
  localTodayISO,
  type OrdersFilter,
} from "@/lib/queries/orders.queries";
import { OrdersTable } from "@/components/orders/orders-table";
import { OrdersDateFilter } from "@/components/orders/orders-date-filter";
import { MisaImportDialog } from "@/components/orders/misa-import-dialog";
import { EmptyState, PageHeader, StatCard } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { formatDate, formatNumber, formatPercent, formatVND } from "@/lib/format";
import type { OrderStatus } from "@/types/restaurant";

export const metadata = { title: "Đơn bán hàng | Restaurant ERP" };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const statusParam = first(params.status);
  const fromParam = first(params.from);
  const toParam = first(params.to);

  const timeZone = await getAppTimezone();
  const today = localTodayISO(timeZone);
  const monthStart = `${today.slice(0, 7)}-01`;

  const filter: OrdersFilter = {
    status:
      statusParam === "completed" || statusParam === "cancelled"
        ? (statusParam as OrderStatus)
        : undefined,
    from: fromParam && DATE_RE.test(fromParam) ? fromParam : monthStart,
    to: toParam && DATE_RE.test(toParam) ? toParam : today,
  };
  const from = filter.from as string;
  const to = filter.to as string;

  const [{ rows: orders, total, limit }, summary] = await Promise.all([
    getOrders(filter),
    getOrdersSummary(from, to),
  ]);
  const periodLabel = `${formatDate(from)} – ${formatDate(to)}`;
  const truncated = total > orders.length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Đơn bán hàng"
        description="Lịch sử hóa đơn, bàn, hình thức thanh toán và giá vốn (COGS) thực tế tại thời điểm bán."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <MisaImportDialog />
            <Button asChild size="sm">
              <Link href="/orders/new">
                <Plus className="size-4" />
                Tạo đơn bán
              </Link>
            </Button>
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Số đơn hoàn tất"
          value={formatNumber(summary.order_count, 0)}
          hint={periodLabel}
          tone="info"
        />
        <StatCard
          title="Tổng thực thu (gồm VAT)"
          value={formatVND(summary.gross_revenue)}
          hint={
            summary.tax_amount > 0
              ? `Thuần: ${formatVND(summary.revenue)} · VAT: ${formatVND(summary.tax_amount)}`
              : periodLabel
          }
          tone="success"
        />
        <StatCard
          title="Giá vốn (COGS)"
          value={formatVND(summary.cogs)}
          hint={periodLabel}
          tone="warning"
        />
        <StatCard
          title="Lãi gộp"
          value={formatVND(summary.gross_profit)}
          hint={
            summary.gross_margin_pct === null
              ? periodLabel
              : `Biên lãi gộp ${formatPercent(summary.gross_margin_pct)} · ${periodLabel}`
          }
          tone="default"
        />
      </div>

      <OrdersDateFilter from={filter.from} to={filter.to} status={filter.status} />

      {orders.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title="Không có đơn bán trong kỳ"
          description={`Không có đơn nào từ ${periodLabel}. Đổi khoảng ngày hoặc tạo đơn bán mới.`}
          action={
            <Button asChild size="sm">
              <Link href="/orders/new">Tạo đơn bán</Link>
            </Button>
          }
        />
      ) : (
        <div className="space-y-2">
          {truncated && (
            <p className="text-xs text-muted-foreground">
              Đang hiển thị {formatNumber(orders.length, 0)} đơn mới nhất trên tổng{" "}
              {formatNumber(total, 0)} đơn của kỳ (giới hạn {formatNumber(limit, 0)} dòng). Thu hẹp
              khoảng ngày để xem đầy đủ; các chỉ số phía trên vẫn tính trên toàn kỳ.
            </p>
          )}
          <OrdersTable orders={orders} />
        </div>
      )}
    </div>
  );
}
