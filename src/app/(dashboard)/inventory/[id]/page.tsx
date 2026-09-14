import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, ArrowLeft, Boxes, History, SlidersHorizontal, Wallet } from "lucide-react";
import {
  getIngredientStatus,
  getInventoryTransactions,
} from "@/lib/queries/inventory.queries";
import { EmptyState, PageHeader, StatCard, StatusBadge } from "@/components/shared";
import { LedgerTable } from "@/components/inventory/ledger-table";
import { formatDate, formatNumber, formatVND } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = { title: "Chi tiết nguyên liệu | Restaurant ERP" };

export default async function IngredientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ingredient = await getIngredientStatus(id);
  if (!ingredient) notFound();

  const ledger = await getInventoryTransactions({ ingredientId: id, limit: 300 });

  const stock = Number(ingredient.current_stock ?? 0);
  const minStock = Number(ingredient.min_alert_stock ?? 0);
  const baseUnit = ingredient.base_unit ?? "";
  const importUnit = ingredient.import_unit ?? "";

  return (
    <div className="space-y-6">
      <PageHeader
        title={ingredient.name ?? "Nguyên liệu"}
        description={[ingredient.code, ingredient.category].filter(Boolean).join(" · ") || undefined}
        breadcrumbs={[
          { label: "Kho nguyên liệu", href: "/inventory" },
          { label: ingredient.name ?? "Chi tiết" },
        ]}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href="/inventory">
                <ArrowLeft className="size-4" />
                Về danh sách
              </Link>
            </Button>
            <Button asChild size="sm">
              <Link href="/inventory/adjustments">
                <SlidersHorizontal className="size-4" />
                Kiểm kê / hao hụt
              </Link>
            </Button>
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Tồn kho hiện tại"
          value={`${formatNumber(stock, 3)} ${baseUnit}`}
          hint={`≈ ${formatNumber(Number(ingredient.stock_in_import_units ?? 0), 2)} ${importUnit}`}
          icon={Boxes}
          tone={ingredient.is_below_min ? "danger" : "default"}
        />
        <StatCard
          title="Giá vốn bình quân"
          value={`${formatVND(Number(ingredient.avg_cost_price ?? 0))}/${baseUnit}`}
          hint={`${formatVND(Number(ingredient.avg_cost_per_import_unit ?? 0))}/${importUnit}`}
          icon={Wallet}
        />
        <StatCard
          title="Giá trị tồn kho"
          value={formatVND(Number(ingredient.stock_value ?? 0))}
          icon={Wallet}
          tone="info"
        />
        <StatCard
          title="Tồn tối thiểu"
          value={`${formatNumber(minStock, 3)} ${baseUnit}`}
          icon={AlertTriangle}
          tone={ingredient.is_below_min ? "danger" : "success"}
          hint={ingredient.is_below_min ? "Đang dưới định mức" : "Tồn kho an toàn"}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Thông tin nguyên liệu</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <div className="text-xs text-muted-foreground">Quy đổi đơn vị</div>
            <div className="font-medium">
              1 {importUnit} = {formatNumber(Number(ingredient.conversion_factor ?? 1), 2)} {baseUnit}
            </div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Nhà cung cấp mặc định</div>
            <div className="font-medium">{ingredient.default_supplier_name ?? "—"}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Trạng thái</div>
            <div className="mt-0.5 flex gap-1.5">
              {ingredient.is_below_min ? (
                <StatusBadge tone="danger" dot>
                  Dưới định mức
                </StatusBadge>
              ) : (
                <StatusBadge tone="success">Đủ tồn</StatusBadge>
              )}
              {!ingredient.is_active && <StatusBadge tone="neutral">Ngừng sử dụng</StatusBadge>}
            </div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Cập nhật lần cuối</div>
            <div className="font-medium">{formatDate(ingredient.updated_at)}</div>
          </div>
          {ingredient.note ? (
            <div className="sm:col-span-2 lg:col-span-4">
              <div className="text-xs text-muted-foreground">Ghi chú</div>
              <div>{ingredient.note}</div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Sổ kho nguyên liệu</CardTitle>
        </CardHeader>
        <CardContent>
          {ledger.length === 0 ? (
            <EmptyState
              title="Chưa có giao dịch kho"
              description="Nguyên liệu này chưa phát sinh nhập, xuất hay điều chỉnh nào."
              icon={History}
            />
          ) : (
            <LedgerTable rows={ledger} showIngredient={false} pageSize={20} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
