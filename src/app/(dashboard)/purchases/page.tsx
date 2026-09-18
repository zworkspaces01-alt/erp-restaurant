import Link from "next/link";
import { AlertTriangle, Banknote, FileText, Plus, Wallet } from "lucide-react";
import { Forbidden, PageHeader, StatCard } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { PurchaseOrdersTable } from "@/components/purchases/purchase-orders-table";
import { PurchasesDateFilter } from "@/components/purchases/purchases-date-filter";
import {
  getIngredientPickList,
  getPurchaseOrders,
  getSupplierOptions,
  type PurchaseOrdersFilter,
} from "@/lib/queries/purchases.queries";
import { InvoiceOcrDialog } from "@/components/purchases/invoice-ocr-dialog";
import { formatDate, formatVND } from "@/lib/format";
import { requireAuth } from "@/lib/auth";

export const metadata = { title: "Phiếu nhập hàng" };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

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

  const filter: PurchaseOrdersFilter = {
    from: fromParam && DATE_RE.test(fromParam) ? fromParam : undefined,
    to: toParam && DATE_RE.test(toParam) ? toParam : undefined,
  };

  const [orders, suppliers, ingredients] = await Promise.all([
    getPurchaseOrders(filter),
    getSupplierOptions(),
    getIngredientPickList(),
  ]);

  const totalAmount = orders.reduce((s, o) => s + o.total_amount, 0);
  const totalDebt = orders.reduce((s, o) => s + o.debt_amount, 0);
  const overdue = orders.filter((o) => o.is_overdue);
  const overdueDebt = overdue.reduce((s, o) => s + o.debt_amount, 0);

  let periodHint: string | undefined;
  if (filter.from && filter.to) {
    periodHint =
      filter.from === filter.to
        ? `Ngày ${formatDate(filter.from)}`
        : `${formatDate(filter.from)} – ${formatDate(filter.to)}`;
  } else if (filter.from) {
    periodHint = `Từ ${formatDate(filter.from)}`;
  } else if (filter.to) {
    periodHint = `Đến ${formatDate(filter.to)}`;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Phiếu nhập hàng"
        description="Nhập kho từ nhà cung cấp: tổng tiền, số đã trả và hạn công nợ."
        actions={
          <div className="flex flex-wrap items-center gap-2">
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

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Số phiếu nhập"
          value={String(orders.length)}
          icon={FileText}
          hint={periodHint}
        />
        <StatCard
          title="Tổng giá trị nhập"
          value={formatVND(totalAmount)}
          icon={Banknote}
          hint={periodHint}
        />
        <StatCard
          title="Còn nợ nhà cung cấp"
          value={formatVND(totalDebt)}
          icon={Wallet}
          tone={totalDebt > 0 ? "info" : "success"}
          hint={periodHint}
        />
        <StatCard
          title="Quá hạn"
          value={formatVND(overdueDebt)}
          icon={AlertTriangle}
          tone={overdueDebt > 0 ? "danger" : "success"}
          hint={
            overdue.length > 0
              ? `${overdue.length} phiếu quá hạn`
              : (periodHint ?? "Không có nợ quá hạn")
          }
        />
      </div>

      <PurchasesDateFilter from={filter.from} to={filter.to} />

      <PurchaseOrdersTable orders={orders} />
    </div>
  );
}
