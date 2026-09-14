import Link from "next/link";
import { ArrowLeft, UtensilsCrossed } from "lucide-react";
import { getPosMenuItems } from "@/lib/queries/orders.queries";
import { NewOrderForm } from "@/components/orders/new-order-form";
import { EmptyState, PageHeader } from "@/components/shared";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Tạo đơn bán hàng | Restaurant ERP" };

export default async function NewOrderPage() {
  const menuItems = await getPosMenuItems();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tạo đơn bán hàng"
        description="Chọn món, nhập số bàn và hình thức thanh toán. Đơn hoàn tất sẽ tự động trừ kho theo định lượng."
        breadcrumbs={[{ label: "Đơn bán hàng", href: "/orders" }, { label: "Tạo đơn mới" }]}
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/orders">
              <ArrowLeft className="size-4" />
              Danh sách đơn
            </Link>
          </Button>
        }
      />

      {menuItems.length === 0 ? (
        <EmptyState
          icon={UtensilsCrossed}
          title="Chưa có món nào để bán"
          description="Hãy thêm món và định lượng (BOM) trong mục Thực đơn trước khi tạo đơn bán."
          action={
            <Button asChild size="sm">
              <Link href="/menu">Đi tới Thực đơn</Link>
            </Button>
          }
        />
      ) : (
        <NewOrderForm menuItems={menuItems} />
      )}
    </div>
  );
}
