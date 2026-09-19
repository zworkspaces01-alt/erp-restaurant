import Link from "next/link";
import { ArrowLeft, ClipboardList } from "lucide-react";
import {
  getIngredientOptions,
  getInventoryStatus,
  getRecentAdjustments,
} from "@/lib/queries/inventory.queries";
import { EmptyState, PageHeader } from "@/components/shared";
import { AdjustmentForm } from "@/components/inventory/adjustment-form";
import { LedgerTable } from "@/components/inventory/ledger-table";
import { StocktakeSheet } from "@/components/inventory/stocktake-sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = { title: "Kiểm kê & hao hụt | Restaurant ERP" };

export default async function InventoryAdjustmentsPage() {
  const [ingredients, status, recent] = await Promise.all([
    getIngredientOptions(),
    getInventoryStatus(),
    getRecentAdjustments(30),
  ]);

  const sheetRows = status.map((r) => ({
    id: r.id ?? "",
    code: r.code,
    name: r.name ?? "",
    category: r.category,
    base_unit: r.base_unit ?? "",
    current_stock: Number(r.current_stock ?? 0),
    avg_cost_price: Number(r.avg_cost_price ?? 0),
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Kiểm kê & hao hụt"
        description="Ghi nhận hao hụt, điều chỉnh thủ công và kết quả kiểm kê. Mỗi thao tác tạo một dòng trong sổ kho."
        breadcrumbs={[{ label: "Kho nguyên liệu", href: "/inventory" }, { label: "Kiểm kê & hao hụt" }]}
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/inventory">
              <ArrowLeft className="size-4" />
              Về danh sách kho
            </Link>
          </Button>
        }
      />

      <Tabs defaultValue="sheet" className="space-y-4">
        <TabsList>
          <TabsTrigger value="sheet">Kiểm kê hàng loạt & Excel</TabsTrigger>
          <TabsTrigger value="single">Ghi nhận lẻ từng món</TabsTrigger>
        </TabsList>

        <TabsContent value="sheet">
          <StocktakeSheet rows={sheetRows} />
        </TabsContent>

        <TabsContent value="single" className="grid gap-6 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
        <AdjustmentForm
          ingredients={ingredients.map((i) => ({
            id: i.id,
            code: i.code,
            name: i.name,
            base_unit: i.base_unit,
            current_stock: Number(i.current_stock),
            category: i.category,
          }))}
        />

        <Card>
          <CardHeader>
            <CardTitle>Giao dịch điều chỉnh gần đây</CardTitle>
            <CardDescription>30 giao dịch hao hụt / điều chỉnh / kiểm kê mới nhất.</CardDescription>
          </CardHeader>
          <CardContent>
            {recent.length === 0 ? (
              <EmptyState
                title="Chưa có giao dịch điều chỉnh"
                description="Các giao dịch hao hụt, điều chỉnh và kiểm kê sẽ hiển thị tại đây."
                icon={ClipboardList}
              />
            ) : (
              <LedgerTable rows={recent} pageSize={10} hideToolbar />
            )}
          </CardContent>
        </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
