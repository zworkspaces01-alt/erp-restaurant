import Link from "next/link";
import { ArrowLeft, History } from "lucide-react";
import {
  getIngredientOptions,
  getInventoryTransactions,
  type LedgerFilters,
} from "@/lib/queries/inventory.queries";
import { INVENTORY_TXN_TYPE_LABELS, type InventoryTxnType } from "@/types/restaurant";
import { EmptyState, PageHeader } from "@/components/shared";
import { LedgerTable } from "@/components/inventory/ledger-table";
import { TransactionFilters } from "@/components/inventory/transaction-filters";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Sổ kho | Restaurant ERP" };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function isTxnType(value: string | undefined): value is InventoryTxnType {
  return Boolean(value && value in INVENTORY_TXN_TYPE_LABELS);
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function InventoryTransactionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const type = first(sp.type);
  const ingredient = first(sp.ingredient);
  const from = first(sp.from);
  const to = first(sp.to);

  const filters: LedgerFilters = {
    txnType: isTxnType(type) ? type : undefined,
    ingredientId: ingredient,
    from: from && ISO_DATE.test(from) ? from : undefined,
    to: to && ISO_DATE.test(to) ? to : undefined,
    limit: 500,
  };

  const [rows, ingredients] = await Promise.all([
    getInventoryTransactions(filters),
    getIngredientOptions(),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Sổ kho"
        description="Toàn bộ biến động tồn kho: nhập hàng, xuất bán, hao hụt, điều chỉnh và kiểm kê. Sổ kho không thể sửa hoặc xóa."
        breadcrumbs={[{ label: "Kho nguyên liệu", href: "/inventory" }, { label: "Sổ kho" }]}
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/inventory">
              <ArrowLeft className="size-4" />
              Về danh sách kho
            </Link>
          </Button>
        }
      />

      <TransactionFilters
        ingredients={ingredients.map((i) => ({ id: i.id, name: i.name, code: i.code }))}
      />

      {rows.length === 0 ? (
        <EmptyState
          title="Không có giao dịch nào"
          description="Thử đổi bộ lọc loại giao dịch, nguyên liệu hoặc khoảng thời gian."
          icon={History}
        />
      ) : (
        <LedgerTable rows={rows} pageSize={25} />
      )}
    </div>
  );
}
