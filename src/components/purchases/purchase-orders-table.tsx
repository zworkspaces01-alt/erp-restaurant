"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable, DataTableColumnHeader, Money, StatusBadge } from "@/components/shared";
import type { DataTableFilter } from "@/components/shared";
import { poStatusTone } from "@/components/purchases/po-status";
import { formatDate } from "@/lib/format";
import { History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PoAuditHistoryDialog } from "@/components/purchases/po-audit-history-dialog";
import {
  PO_PAYMENT_STATUS_LABELS,
  PO_PAYMENT_STATUS_OPTIONS,
} from "@/types/restaurant";
import type { PurchaseOrderRow } from "@/lib/queries/purchases.queries";

const baseColumns: ColumnDef<PurchaseOrderRow>[] = [
  {
    accessorKey: "po_number",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Số phiếu" />,
    cell: ({ row }) => (
      <div className="min-w-36 max-w-[280px]">
        <div className="flex items-center gap-2">
          <Link
            href={`/purchases/${row.original.id}`}
            className="font-mono font-medium text-primary hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            {row.original.po_number ?? "—"}
          </Link>
          {row.original.invoice_number ? (
            <span className="text-xs text-muted-foreground">HĐ {row.original.invoice_number}</span>
          ) : null}
        </div>
        {row.original.item_names && row.original.item_names.length > 0 ? (
          <div
            className="text-xs text-muted-foreground truncate mt-0.5"
            title={row.original.item_names.join(", ")}
          >
            <span className="text-foreground/80 font-normal">📦 {row.original.item_names.slice(0, 2).join(", ")}</span>
            {row.original.item_names.length > 2 ? (
              <span className="text-muted-foreground font-medium"> +{row.original.item_names.length - 2}</span>
            ) : null}
          </div>
        ) : null}
      </div>
    ),
  },
  {
    accessorKey: "supplier_name",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Nhà cung cấp" />,
    filterFn: "equals",
    cell: ({ row }) => (
      <Link
        href={`/suppliers/${row.original.supplier_id}`}
        className="hover:underline"
        onClick={(e) => e.stopPropagation()}
      >
        {row.original.supplier_name}
      </Link>
    ),
  },
  {
    accessorKey: "order_date",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Ngày nhập" />,
    cell: ({ row }) => (
      <span className="whitespace-nowrap text-muted-foreground">
        {formatDate(row.original.order_date)}
      </span>
    ),
  },
  {
    accessorKey: "due_date",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Hạn thanh toán" />,
    cell: ({ row }) => {
      const { due_date, is_overdue, days_overdue } = row.original;
      if (!due_date) return <span className="text-muted-foreground">—</span>;
      return (
        <div className="whitespace-nowrap">
          <span className={is_overdue ? "text-destructive font-medium" : "text-muted-foreground"}>
            {formatDate(due_date)}
          </span>
          {is_overdue ? (
            <div className="text-xs text-destructive">Quá hạn {days_overdue} ngày</div>
          ) : null}
        </div>
      );
    },
  },
  {
    accessorKey: "total_amount",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Tổng tiền" align="right" />,
    cell: ({ row }) => (
      <div className="text-right font-medium">
        <Money value={row.original.total_amount} />
      </div>
    ),
  },
  {
    accessorKey: "paid_amount",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Đã trả" align="right" />,
    cell: ({ row }) => (
      <div className="text-right text-muted-foreground">
        <Money value={row.original.paid_amount} />
      </div>
    ),
  },
  {
    accessorKey: "debt_amount",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Còn nợ" align="right" />,
    cell: ({ row }) => (
      <div className={`text-right ${row.original.debt_amount > 0 ? "font-medium text-destructive" : "text-muted-foreground"}`}>
        <Money value={row.original.debt_amount} />
      </div>
    ),
  },
  {
    accessorKey: "payment_status",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Trạng thái" align="center" />
    ),
    filterFn: "equals",
    cell: ({ row }) => (
      <div className="text-center">
        <StatusBadge tone={poStatusTone(row.original.payment_status)} dot>
          {PO_PAYMENT_STATUS_LABELS[row.original.payment_status]}
        </StatusBadge>
      </div>
    ),
  },
  {
    id: "history_action",
    header: () => <span className="sr-only">Lịch sử</span>,
    cell: ({ row }) => (
      <div className="flex items-center justify-end" onClick={(e) => e.stopPropagation()}>
        <PoAuditHistoryDialog
          purchaseOrderId={row.original.id}
          poNumber={row.original.po_number}
          trigger={
            <Button
              variant="ghost"
              size="icon"
              className="size-7 text-muted-foreground hover:text-foreground"
              title="Lịch sử thay đổi phiếu này"
            >
              <History className="size-3.5" />
            </Button>
          }
        />
      </div>
    ),
  },
];

interface PurchaseOrdersTableProps {
  orders: PurchaseOrderRow[];
  /** Ẩn cột NCC khi đã ở trong trang chi tiết nhà cung cấp. */
  hideSupplier?: boolean;
  toolbar?: React.ReactNode;
  emptyMessage?: string;
  hideToolbar?: boolean;
}

export function PurchaseOrdersTable({
  orders,
  hideSupplier = false,
  toolbar,
  emptyMessage = "Chưa có phiếu nhập nào.",
  hideToolbar = false,
}: PurchaseOrdersTableProps) {
  const router = useRouter();

  const columns = useMemo(
    () => (hideSupplier ? baseColumns.filter((c) => "accessorKey" in c && c.accessorKey !== "supplier_name") : baseColumns),
    [hideSupplier]
  );

  const supplierOptions = useMemo(() => {
    const names = [...new Set(orders.map((o) => o.supplier_name))].sort((a, b) =>
      a.localeCompare(b, "vi")
    );
    return names.map((n) => ({ value: n, label: n }));
  }, [orders]);

  const filters = useMemo(() => {
    const list: DataTableFilter[] = [
      {
        columnId: "payment_status",
        title: "Trạng thái",
        options: PO_PAYMENT_STATUS_OPTIONS.map((o) => ({ value: o.value, label: o.label })),
      },
    ];
    if (!hideSupplier && supplierOptions.length > 1) {
      list.push({ columnId: "supplier_name", title: "Nhà cung cấp", options: supplierOptions });
    }
    return list;
  }, [hideSupplier, supplierOptions]);

  return (
    <DataTable
      columns={columns}
      data={orders}
      searchable={!hideToolbar}
      searchPlaceholder="Tìm theo số phiếu, số hóa đơn, NCC, tên sản phẩm..."
      filters={hideToolbar ? [] : filters}
      hideToolbar={hideToolbar}
      initialSorting={[{ id: "order_date", desc: true }]}
      emptyMessage={emptyMessage}
      toolbar={toolbar}
      onRowClick={(row) => router.push(`/purchases/${row.id}`)}
      rowClassName={(row) => (row.original.is_overdue ? "bg-destructive/5" : undefined)}
    />
  );
}
