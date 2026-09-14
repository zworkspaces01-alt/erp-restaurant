import { PageHeader } from "@/components/shared";
import { PurchaseOrderForm } from "@/components/purchases/purchase-order-form";
import { getIngredientPickList, getSupplierOptions } from "@/lib/queries/purchases.queries";
import { InvoiceOcrDialog } from "@/components/purchases/invoice-ocr-dialog";

export const metadata = { title: "Tạo phiếu nhập" };

export default async function NewPurchaseOrderPage() {
  const [suppliers, ingredients] = await Promise.all([
    getSupplierOptions(),
    getIngredientPickList(),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tạo phiếu nhập"
        description="Nhập hàng theo đơn vị mua; hệ thống tự quy đổi về đơn vị kho và cập nhật giá vốn bình quân."
        breadcrumbs={[
          { label: "Phiếu nhập hàng", href: "/purchases" },
          { label: "Tạo phiếu nhập" },
        ]}
        actions={
          <InvoiceOcrDialog suppliers={suppliers} ingredients={ingredients} />
        }
      />
      <PurchaseOrderForm suppliers={suppliers} ingredients={ingredients} />
    </div>
  );
}
