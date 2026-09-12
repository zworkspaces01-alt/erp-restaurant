import Link from "next/link";
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  CircleDollarSign,
  Receipt,
  TrendingUp,
  Truck,
  Wallet,
} from "lucide-react";
import { getDashboardData } from "@/lib/queries/dashboard.queries";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatDate, formatVND } from "@/lib/format";

export const metadata = { title: "Bảng điều khiển | Restaurant ERP" };

export default async function DashboardPage() {
  const { stats, lowStock, recentOrders, overdueDebt } = await getDashboardData();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Bảng điều khiển quản trị"
        description="Tổng quan doanh thu, lợi nhuận, kho nguyên liệu và công nợ nhà cung cấp theo thời gian thực."
        actions={
          <div className="flex gap-2">
            <Button asChild size="sm">
              <Link href="/orders/new">
                <Receipt className="mr-1.5 size-4" />
                Tạo đơn bán
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href="/purchases/new">
                <Truck className="mr-1.5 size-4" />
                Nhập kho
              </Link>
            </Button>
          </div>
        }
      />

      {/* KPI Stats Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Doanh thu hôm nay"
          value={formatVND(stats?.today_revenue ?? 0)}
          hint={`${stats?.today_orders ?? 0} đơn hoàn tất`}
          icon={CircleDollarSign}
          tone="success"
        />
        <StatCard
          title="Lãi gộp hôm nay"
          value={formatVND(stats?.today_gross_profit ?? 0)}
          hint={`Giá vốn (COGS): ${formatVND(stats?.today_cogs ?? 0)}`}
          icon={TrendingUp}
          tone="info"
        />
        <StatCard
          title="Doanh thu tháng này"
          value={formatVND(stats?.month_revenue ?? 0)}
          hint={`Lợi nhuận ròng: ${formatVND(stats?.month_net_profit ?? 0)}`}
          icon={Wallet}
          tone="default"
        />
        <StatCard
          title="Cảnh báo tồn kho"
          value={`${stats?.low_stock_count ?? 0} mặt hàng`}
          hint={`Công nợ NCC: ${formatVND(stats?.total_supplier_debt ?? 0)}`}
          icon={AlertCircle}
          tone={(stats?.low_stock_count ?? 0) > 0 ? "danger" : "success"}
        />
      </div>

      {/* Main Grid: Orders & Alerts */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Đơn hàng gần nhất */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div>
              <CardTitle className="text-base font-semibold">Đơn bán hàng mới nhất</CardTitle>
              <CardDescription>Các giao dịch phục vụ bàn và mang về</CardDescription>
            </div>
            <Button asChild variant="ghost" size="sm">
              <Link href="/orders">
                Xem tất cả <ArrowRight className="ml-1 size-3.5" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {recentOrders.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Chưa có đơn hàng nào hôm nay</p>
            ) : (
              <div className="divide-y rounded-lg border">
                {recentOrders.map((order) => (
                  <div key={order.id} className="flex items-center justify-between p-3 text-sm">
                    <div>
                      <p className="font-medium">{order.order_number}</p>
                      <p className="text-xs text-muted-foreground">
                        {order.table_number || "Tại quầy"} · {formatDate(order.order_date, "HH:mm dd/MM")}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold">{formatVND(order.total_amount)}</p>
                      <p className="text-xs text-muted-foreground">COGS: {formatVND(order.total_cogs)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Cảnh báo kho & Công nợ */}
        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-1.5 text-base font-semibold text-destructive">
                  <AlertTriangle className="size-4" /> Tồn kho dưới mức an toàn
                </CardTitle>
                <Button asChild variant="ghost" size="sm">
                  <Link href="/inventory">Xem kho</Link>
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {lowStock.length === 0 ? (
                <p className="text-xs text-muted-foreground">Tất cả nguyên liệu đều ở mức an toàn.</p>
              ) : (
                <div className="space-y-2">
                  {lowStock.map((ing) => (
                    <div key={ing.id} className="flex items-center justify-between rounded-md border border-destructive/20 bg-destructive/5 p-2 text-xs">
                      <div>
                        <p className="font-medium text-foreground">{ing.name}</p>
                        <p className="text-muted-foreground">Mã: {ing.code}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold text-destructive">
                          {Number(ing.current_stock).toLocaleString("vi-VN")} {ing.base_unit}
                        </p>
                        <p className="text-muted-foreground">Min: {Number(ing.min_alert_stock).toLocaleString("vi-VN")}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-semibold">Công nợ PO đến hạn</CardTitle>
                <Button asChild variant="ghost" size="sm">
                  <Link href="/purchases">Xem PO</Link>
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {overdueDebt.length === 0 ? (
                <p className="text-xs text-muted-foreground">Không có phiếu nhập nào quá hạn nợ.</p>
              ) : (
                <div className="space-y-2">
                  {overdueDebt.map((po) => (
                    <div key={po.id} className="flex items-center justify-between rounded-md border p-2 text-xs">
                      <div>
                        <p className="font-medium">{po.po_number}</p>
                        <p className="text-muted-foreground">
                          {(po.suppliers as { name?: string })?.name ?? "NCC"} · Hạn: {formatDate(po.due_date)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold text-amber-600 dark:text-amber-400">
                          {formatVND(Number(po.total_amount) - Number(po.paid_amount))}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
