import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  CircleDollarSign,
  PackageSearch,
  Receipt,
  TrendingUp,
  Truck,
  Utensils,
  Wallet,
} from "lucide-react";
import { getDashboardData } from "@/lib/queries/dashboard.queries";
import { DailySalesChart } from "@/components/reports/daily-sales-chart";
import { DashboardActionCenter } from "@/components/dashboard/dashboard-action-center";
import { EmptyState, PageHeader, StatCard, StatusBadge } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate, formatNumber, formatPercent, formatVND } from "@/lib/format";
import { MENU_CLASS_LABELS, menuClassTone } from "@/types/restaurant";

export const metadata = { title: "Tổng quan | Restaurant ERP" };

export default async function DashboardPage() {
  const { stats, dailySales, lowStock, overduePos, topItems } = await getDashboardData(30);

  const monthMargin =
    stats && stats.month_revenue > 0 ? (stats.month_net_profit / stats.month_revenue) * 100 : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tổng quan"
        description={
          stats
            ? `Số liệu tính đến ${formatDate(stats.today)} · Kỳ tháng từ ${formatDate(stats.month_start)}`
            : "Tổng quan doanh thu, lợi nhuận, tồn kho và công nợ."
        }
        actions={
          <>
            <Button asChild size="sm">
              <Link href="/orders/new">
                <Receipt className="size-4" />
                Tạo đơn bán
              </Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href="/purchases/new">
                <Truck className="size-4" />
                Nhập hàng
              </Link>
            </Button>
          </>
        }
      />

      <DashboardActionCenter
        stats={stats}
        lowStock={lowStock}
        overduePos={overduePos}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard
          title="Doanh thu hôm nay"
          value={formatVND(stats?.today_gross_revenue ?? stats?.today_revenue ?? 0)}
          hint={
            (stats?.today_tax_amount ?? 0) > 0
              ? `Trước thuế: ${formatVND(stats?.today_revenue ?? 0)} · VAT: ${formatVND(stats?.today_tax_amount ?? 0)}`
              : `${formatNumber(stats?.today_orders ?? 0, 0)} đơn hoàn tất · Giá vốn ${formatVND(stats?.today_cogs ?? 0)}`
          }
          icon={CircleDollarSign}
          tone="success"
        />
        <StatCard
          title="Doanh thu tháng này"
          value={formatVND(stats?.month_gross_revenue ?? stats?.month_revenue ?? 0)}
          hint={
            (stats?.month_tax_amount ?? 0) > 0
              ? `Trước thuế: ${formatVND(stats?.month_revenue ?? 0)} · VAT: ${formatVND(stats?.month_tax_amount ?? 0)} · Lãi gộp ${formatVND(stats?.month_gross_profit ?? 0)}`
              : `${formatNumber(stats?.month_order_count ?? 0, 0)} đơn · Lợi nhuận gộp ${formatVND(stats?.month_gross_profit ?? 0)}`
          }
          icon={TrendingUp}
          tone="info"
        />
        <StatCard
          title="Lợi nhuận ròng tháng này"
          value={formatVND(stats?.month_net_profit ?? 0)}
          hint={
            monthMargin === null
              ? "Chưa có doanh thu trong tháng"
              : `Biên lợi nhuận ${formatPercent(monthMargin)} · Chi phí NV ${formatVND(stats?.month_labor_cost ?? 0)}`
          }
          icon={Wallet}
          tone={(stats?.month_net_profit ?? 0) >= 0 ? "success" : "danger"}
        />
        <Link href="/inventory" className="rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <StatCard
            title="Nguyên liệu dưới định mức"
            value={formatNumber(stats?.low_stock_count ?? 0, 0)}
            hint="Xem danh sách tồn kho"
            icon={PackageSearch}
            tone={(stats?.low_stock_count ?? 0) > 0 ? "danger" : "success"}
            className="h-full transition-colors hover:border-primary/40"
          />
        </Link>
        <Link href="/payments" className="rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <StatCard
            title="Công nợ nhà cung cấp"
            value={formatVND(stats?.total_supplier_debt ?? 0)}
            hint={`Quá hạn: ${formatVND(stats?.overdue_debt ?? 0)}`}
            icon={Truck}
            tone={(stats?.overdue_debt ?? 0) > 0 ? "danger" : "default"}
            className="h-full transition-colors hover:border-primary/40"
          />
        </Link>
        <Link href="/expenses" className="rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <StatCard
            title="Chi phí chờ duyệt"
            value={formatVND(stats?.pending_expenses_amount ?? 0)}
            hint={`${formatNumber(stats?.pending_expenses_count ?? 0, 0)} khoản chờ thanh toán`}
            icon={CalendarClock}
            tone={(stats?.pending_expenses_count ?? 0) > 0 ? "warning" : "default"}
            className="h-full transition-colors hover:border-primary/40"
          />
        </Link>
      </div>

      <DailySalesChart data={dailySales} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-start justify-between gap-2">
              <div>
                <CardTitle className="text-base font-semibold">Cảnh báo tồn kho</CardTitle>
                <CardDescription>Nguyên liệu có tồn thấp hơn định mức tối thiểu</CardDescription>
              </div>
              <Button asChild size="sm" variant="ghost">
                <Link href="/inventory">
                  Tất cả
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {lowStock.length === 0 ? (
              <EmptyState
                icon={PackageSearch}
                title="Tồn kho an toàn"
                description="Không có nguyên liệu nào dưới định mức tối thiểu."
              />
            ) : (
              <ul className="divide-y">
                {lowStock.map((row) => (
                  <li key={row.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <Link href={`/inventory/${row.id}`} className="truncate text-sm font-medium hover:underline">
                        {row.name}
                      </Link>
                      <p className="text-xs text-muted-foreground">
                        {row.code} · {row.category ?? "Khác"}
                        {row.default_supplier_name ? ` · ${row.default_supplier_name}` : ""}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <StatusBadge tone="danger" dot>
                        {formatNumber(row.current_stock ?? 0)} / {formatNumber(row.min_alert_stock ?? 0)} {row.base_unit}
                      </StatusBadge>
                      <p className="mt-1 text-xs text-muted-foreground">{formatVND(row.stock_value ?? 0)}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-start justify-between gap-2">
              <div>
                <CardTitle className="text-base font-semibold">Top 5 món bán chạy</CardTitle>
                <CardDescription>Theo số lượng bán trong 30 ngày gần nhất</CardDescription>
              </div>
              <Button asChild size="sm" variant="ghost">
                <Link href="/menu/engineering">
                  Menu Engineering
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {topItems.length === 0 ? (
              <EmptyState
                icon={Utensils}
                title="Chưa có dữ liệu bán hàng"
                description="Chưa có đơn hoàn tất nào trong 30 ngày gần nhất."
              />
            ) : (
              <ul className="divide-y">
                {topItems.map((item, index) => (
                  <li key={item.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground">
                        {index + 1}
                      </span>
                      <div className="min-w-0">
                        <Link href={`/menu/${item.id}`} className="truncate text-sm font-medium hover:underline">
                          {item.name}
                        </Link>
                        <p className="text-xs text-muted-foreground">
                          {formatNumber(item.qty_sold ?? 0)} phần · CM {formatVND(item.avg_cm ?? 0)}/phần
                        </p>
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-sm font-medium tabular-nums">{formatVND(item.revenue ?? 0)}</p>
                      {item.menu_class && (
                        <StatusBadge tone={menuClassTone(item.menu_class)} className="mt-1">
                          {MENU_CLASS_LABELS[item.menu_class]}
                        </StatusBadge>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-2">
            <div>
              <CardTitle className="text-base font-semibold">Phiếu nhập quá hạn thanh toán</CardTitle>
              <CardDescription>Công nợ đã qua ngày đến hạn — cần ưu tiên chi trả</CardDescription>
            </div>
            <Button asChild size="sm" variant="ghost">
              <Link href="/payments">
                Thanh toán
                <ArrowRight className="size-4" />
              </Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {overduePos.length === 0 ? (
            <EmptyState
              icon={AlertTriangle}
              title="Không có phiếu nhập quá hạn"
              description="Toàn bộ công nợ nhà cung cấp đang trong hạn thanh toán."
            />
          ) : (
            <ul className="divide-y">
              {overduePos.map((po) => (
                <li key={po.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <Link href={`/purchases/${po.id}`} className="truncate text-sm font-medium hover:underline">
                      {po.po_number}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      {po.supplier_name ?? "—"} · Đến hạn {formatDate(po.due_date)}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-medium tabular-nums text-destructive">{formatVND(po.debt_amount ?? 0)}</p>
                    <StatusBadge tone="danger" className="mt-1">
                      Quá hạn {formatNumber(po.days_overdue ?? 0, 0)} ngày
                    </StatusBadge>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
