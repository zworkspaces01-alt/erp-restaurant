"use client";

import { useMemo } from "react";
import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import type { LedgerRow } from "@/lib/queries/inventory.queries";
import { INVENTORY_TXN_TYPE_LABELS, type InventoryTxnType } from "@/types/restaurant";
import { DataTable, DataTableColumnHeader, StatusBadge, type BadgeTone } from "@/components/shared";
import { formatDateTime, formatNumber, formatVND } from "@/lib/format";
import { cn } from "@/lib/utils";

const TXN_TONE: Record<InventoryTxnType, BadgeTone> = {
  purchase: "success",
  sale: "info",
  sale_reversal: "warning",
  waste: "danger",
  adjustment: "neutral",
  stocktake: "primary",
};

const REFERENCE_LABELS: Record<string, string> = {
  purchase_order_item: "Phiếu nhập",
  order_item: "Đơn bán",
  manual: "Thủ công",
};

interface LedgerTableProps {
  rows: LedgerRow[];
  /** Ẩn cột nguyên liệu khi bảng đã nằm trong trang chi tiết nguyên liệu. */
  showIngredient?: boolean;
  pageSize?: number;
  emptyMessage?: string;
  hideToolbar?: boolean;
}

export function LedgerTable({
  rows,
  showIngredient = true,
  pageSize = 20,
  emptyMessage = "Chưa có giao dịch kho nào.",
  hideToolbar = false,
}: LedgerTableProps) {
  const columns = useMemo<ColumnDef<LedgerRow, unknown>[]>(() => {
    const base: ColumnDef<LedgerRow, unknown>[] = [
      {
        accessorKey: "created_at",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Thời gian" />,
        cell: ({ row }) => (
          <span className="whitespace-nowrap text-muted-foreground tabular-nums">
            {formatDateTime(row.original.created_at)}
          </span>
        ),
      },
      {
        id: "txn_type",
        accessorFn: (r) => INVENTORY_TXN_TYPE_LABELS[r.txn_type],
        filterFn: "equalsString",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Loại" />,
        cell: ({ row }) => (
          <StatusBadge tone={TXN_TONE[row.original.txn_type]}>
            {INVENTORY_TXN_TYPE_LABELS[row.original.txn_type]}
          </StatusBadge>
        ),
      },
    ];

    if (showIngredient) {
      base.push({
        id: "ingredient",
        accessorFn: (r) => `${r.ingredient?.name ?? ""} ${r.ingredient?.code ?? ""}`,
        header: ({ column }) => <DataTableColumnHeader column={column} title="Nguyên liệu" />,
        cell: ({ row }) => {
          const ing = row.original.ingredient;
          if (!ing) return <span className="text-muted-foreground">—</span>;
          return (
            <Link href={`/inventory/${ing.id}`} className="font-medium hover:underline">
              {ing.name}
            </Link>
          );
        },
      });
    }

    base.push(
      {
        id: "quantity",
        accessorFn: (r) => Number(r.quantity),
        header: ({ column }) => <DataTableColumnHeader column={column} title="Số lượng" align="right" />,
        cell: ({ row }) => {
          const qty = Number(row.original.quantity);
          return (
            <div
              className={cn(
                "text-right font-medium tabular-nums",
                qty < 0 ? "text-destructive" : "text-emerald-600 dark:text-emerald-400"
              )}
            >
              {qty > 0 ? "+" : ""}
              {formatNumber(qty, 3)} {row.original.ingredient?.base_unit ?? ""}
            </div>
          );
        },
      },
      {
        id: "unit_cost",
        accessorFn: (r) => Number(r.unit_cost ?? 0),
        header: ({ column }) => <DataTableColumnHeader column={column} title="Đơn giá vốn" align="right" />,
        cell: ({ row }) => (
          <div className="text-right tabular-nums">
            {row.original.unit_cost === null ? "—" : formatVND(Number(row.original.unit_cost))}
          </div>
        ),
      },
      {
        id: "total_cost",
        accessorFn: (r) => Number(r.total_cost ?? 0),
        header: ({ column }) => <DataTableColumnHeader column={column} title="Giá trị" align="right" />,
        cell: ({ row }) => (
          <div className="text-right tabular-nums">
            {row.original.total_cost === null ? "—" : formatVND(Number(row.original.total_cost))}
          </div>
        ),
      },
      {
        id: "stock_after",
        accessorFn: (r) => Number(r.stock_after ?? 0),
        header: ({ column }) => <DataTableColumnHeader column={column} title="Tồn sau GD" align="right" />,
        cell: ({ row }) => (
          <div className="text-right tabular-nums text-muted-foreground">
            {row.original.stock_after === null ? "—" : formatNumber(Number(row.original.stock_after), 3)}
          </div>
        ),
      },
      {
        id: "reference",
        accessorFn: (r) => r.reference_type ?? "",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Chứng từ" />,
        cell: ({ row }) => {
          const r = row.original;
          const label = r.reference_type ? (REFERENCE_LABELS[r.reference_type] ?? r.reference_type) : "—";
          return (
            <div className="max-w-[220px]">
              <div className="text-xs text-muted-foreground">{label}</div>
              {r.note ? <div className="truncate text-xs" title={r.note}>{r.note}</div> : null}
            </div>
          );
        },
      }
    );

    return base;
  }, [showIngredient]);

  return (
    <DataTable
      columns={columns}
      data={rows}
      pageSize={pageSize}
      searchable={!hideToolbar}
      hideToolbar={hideToolbar}
      searchPlaceholder="Tìm theo nguyên liệu, ghi chú..."
      emptyMessage={emptyMessage}
      columnLabels={{
        created_at: "Thời gian",
        txn_type: "Loại",
        ingredient: "Nguyên liệu",
        quantity: "Số lượng",
        unit_cost: "Đơn giá vốn",
        total_cost: "Giá trị",
        stock_after: "Tồn sau GD",
        reference: "Chứng từ",
      }}
    />
  );
}
