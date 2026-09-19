import Link from "next/link";
import { Plus, Sparkles } from "lucide-react";
import { Forbidden, PageHeader } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { PurchasesExplorer } from "@/components/purchases/purchases-explorer";
import {
  getIngredientPickList,
  getPurchaseOrders,
  getSupplierOptionsWithDebt,
} from "@/lib/queries/purchases.queries";
import { InvoiceOcrDialog } from "@/components/purchases/invoice-ocr-dialog";
import { requireAuth } from "@/lib/auth";

export const metadata = { title: "Phiếu nhập hàng" };

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

interface PageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function PurchasesPage({ searchParams }: PageProps) {
  const { role, authorized } = await requireAuth(["owner", "manager"]);
  if (!authorized) {
    return <Forbidden requiredRoles={["owner", "manager"]} currentRole={role} />;
  }

  const params = await searchParams;
  const fromParam = first(params.from);
  const toParam = first(params.to);
  const supplierParam = first(params.supplier) || first(params.supplierId);
  const statusParam = first(params.status);
  const qParam = first(params.q);

  const [orders, suppliers, ingredients] = await Promise.all([
    getPurchaseOrders(),
    getSupplierOptionsWithDebt(),
    getIngredientPickList(),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Phiếu nhập hàng"
        description="Quản lý và thống kê nhập kho theo nhà cung cấp: tổng tiền nhập, số đã thanh toán, còn nợ và số lượng hóa đơn."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild size="sm" variant="outline" className="gap-1.5 border-primary/25 bg-primary/5 hover:bg-primary/10 text-primary">
              <Link href="/ai-assistant">
                <Sparkles className="size-4" />
                Hỏi Trợ lý AI
              </Link>
            </Button>
            <InvoiceOcrDialog suppliers={suppliers} ingredients={ingredients} />
            <Button asChild size="sm">
              <Link href="/purchases/new">
                <Plus className="mr-1.5 size-4" />
                Tạo phiếu nhập
              </Link>
            </Button>
          </div>
        }
      />

      <PurchasesExplorer
        orders={orders}
        suppliers={suppliers}
        initialFilters={{
          from: fromParam,
          to: toParam,
          supplierId: supplierParam,
          status: statusParam,
          q: qParam,
        }}
      />
    </div>
  );
}
