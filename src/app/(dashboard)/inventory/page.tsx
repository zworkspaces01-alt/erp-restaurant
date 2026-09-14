import Link from "next/link";
import { AlertTriangle, FolderTree, History, Package, SlidersHorizontal, Wallet } from "lucide-react";
import { getInventoryStatus, getSupplierOptions } from "@/lib/queries/inventory.queries";
import { getIngredientCategoryOptions } from "@/lib/queries/categories.queries";
import { PageHeader, StatCard, EmptyState } from "@/components/shared";
import { InventoryTable } from "@/components/inventory/inventory-table";
import { formatNumber, formatVND } from "@/lib/format";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Kho nguyên liệu | Restaurant ERP" };
export const dynamic = "force-dynamic";

export default async function InventoryPage() {
  const [rows, suppliers, categoryOptions] = await Promise.all([
    getInventoryStatus(),
    getSupplierOptions(),
    getIngredientCategoryOptions(),
  ]);

  const totalValue = rows.reduce((sum, r) => sum + Number(r.stock_value ?? 0), 0);
  const lowStock = rows.filter((r) => r.is_below_min);
  const lowStockValue = lowStock.reduce((sum, r) => sum + Number(r.stock_value ?? 0), 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Kho nguyên liệu"
        description="Tồn kho theo đơn vị cơ sở và đơn vị nhập, giá vốn bình quân gia quyền được cập nhật tự động."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href="/inventory/categories">
                <FolderTree className="size-4" />
                Danh mục nguyên liệu
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href="/inventory/adjustments">
                <SlidersHorizontal className="size-4" />
                Kiểm kê & hao hụt
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href="/inventory/transactions">
                <History className="size-4" />
                Sổ kho
              </Link>
            </Button>
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard title="Số mặt hàng" value={String(rows.length)} icon={Package} hint="Nguyên liệu đang sử dụng" />
        <StatCard title="Giá trị tồn kho" value={formatVND(totalValue)} icon={Wallet} tone="info" />
        <StatCard
          title="Dưới định mức"
          value={String(lowStock.length)}
          icon={AlertTriangle}
          tone={lowStock.length > 0 ? "danger" : "success"}
          hint={lowStock.length > 0 ? `Giá trị còn lại ${formatVND(lowStockValue)}` : "Tồn kho an toàn"}
        />
      </div>

      {lowStock.length > 0 && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-destructive">
            <AlertTriangle className="size-4" />
            Nguyên liệu cần nhập thêm ({lowStock.length})
          </div>
          <div className="flex flex-wrap gap-2">
            {lowStock.slice(0, 12).map((r) => (
              <Link
                key={r.id}
                href={`/inventory/${r.id}`}
                className="rounded-md border bg-background px-2.5 py-1 text-xs hover:bg-accent"
              >
                {r.name}
                <span className="ml-1.5 text-muted-foreground tabular-nums">
                  {formatNumber(r.current_stock)}/{formatNumber(r.min_alert_stock)} {r.base_unit}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {rows.length === 0 ? (
        <EmptyState
          title="Chưa có nguyên liệu"
          description="Thêm nguyên liệu để bắt đầu quản lý tồn kho và giá vốn."
          icon={Package}
        />
      ) : (
        <InventoryTable rows={rows} suppliers={suppliers} categoryOptions={categoryOptions} />
      )}
    </div>
  );
}
