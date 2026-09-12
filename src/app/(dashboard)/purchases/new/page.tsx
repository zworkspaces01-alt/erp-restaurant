import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getSuppliers } from "@/lib/queries/purchases.queries";
import { getIngredients } from "@/lib/queries/inventory.queries";
import { PageHeader } from "@/components/shared/page-header";
import { NewPurchaseOrderForm } from "@/components/purchases/new-purchase-order-form";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Tạo phiếu nhập kho | Restaurant ERP" };

export default async function NewPurchaseOrderPage() {
  const [suppliers, ingredients] = await Promise.all([
    getSuppliers(),
    getIngredients(),
  ]);

  const formattedSuppliers = suppliers.map((s) => ({
    id: s.id,
    name: s.name,
    code: s.code,
    payment_terms: s.payment_terms,
  }));

  const formattedIngredients = ingredients.map((i) => ({
    id: i.id,
    name: i.name,
    code: i.code,
    import_unit: i.import_unit,
    base_unit: i.base_unit,
    conversion_factor: Number(i.conversion_factor),
    avg_cost_price: Number(i.avg_cost_price),
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tạo phiếu nhập kho (PO)"
        description="Nhập nguyên liệu từ NCC, tự động quy đổi đơn vị, cập nhật tồn kho, tính giá vốn bình quân gia quyền và ghi nhận công nợ gối đầu."
        breadcrumbs={[
          { label: "Mua hàng", href: "/purchases" },
          { label: "Tạo phiếu nhập" },
        ]}
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/purchases">
              <ArrowLeft className="mr-1.5 size-4" />
              Danh sách phiếu nhập
            </Link>
          </Button>
        }
      />

      <NewPurchaseOrderForm suppliers={formattedSuppliers} ingredients={formattedIngredients} />
    </div>
  );
}
