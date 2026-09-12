import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getMenuItemsWithCosts } from "@/lib/queries/menu.queries";
import { PageHeader } from "@/components/shared/page-header";
import { NewOrderForm } from "@/components/orders/new-order-form";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Tạo đơn bán hàng | Restaurant ERP" };

export default async function NewOrderPage() {
  const menuItems = await getMenuItemsWithCosts();
  const formattedItems = menuItems.map((m) => ({
    menu_item_id: m.menu_item_id ?? "",
    name: m.name ?? "",
    code: m.code ?? "",
    category: m.category ?? "",
    selling_price: Number(m.selling_price ?? 0),
    ideal_cost: Number(m.ideal_cost ?? 0),
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tạo đơn bán hàng (POS)"
        description="Ghi nhận đơn bán, chốt doanh thu và tự động tính trừ tồn kho nguyên liệu theo định lượng BOM."
        breadcrumbs={[
          { label: "Bán hàng", href: "/orders" },
          { label: "Tạo đơn mới" },
        ]}
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/orders">
              <ArrowLeft className="mr-1.5 size-4" />
              Danh sách đơn
            </Link>
          </Button>
        }
      />

      <NewOrderForm menuItems={formattedItems} />
    </div>
  );
}
