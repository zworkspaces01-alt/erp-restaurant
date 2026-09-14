"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable, DataTableColumnHeader, Money, StatusBadge } from "@/components/shared";
import { formatDateTime, formatNumber, formatPercent } from "@/lib/format";
import {
  ORDER_STATUS_LABELS,
  ORDER_STATUS_OPTIONS,
  PAYMENT_METHOD_LABELS,
  PAYMENT_METHOD_OPTIONS,
} from "@/types/restaurant";
import { CancelOrderButton } from "@/components/orders/cancel-order-button";
import type { OrderListRow } from "@/lib/queries/orders.queries";

const columns: ColumnDef<OrderListRow>[] = [
  {
    accessorKey: "order_number",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Mã đơn" />,
    cell: ({ row }) => (
      <Link
        href={`/orders/${row.original.id}`}
        className="font-mono font-medium text-primary hover:underline"
        onClick={(e) => e.stopPropagation()}
      >
        {row.original.order_number ?? "—"}
      </Link>
    ),
  },
  {
    accessorKey: "order_date",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Thời gian" />,
    cell: ({ row }) => (
      <span className="whitespace-nowrap text-muted-foreground">
        {formatDateTime(row.original.order_date)}
      </span>
    ),
  },
  {
    accessorKey: "table_number",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Bàn" />,
    cell: ({ row }) => row.original.table_number ?? "Tại quầy",
  },
  {
    accessorKey: "item_count",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Số món" align="right" />,
    cell: ({ row }) => (
      <div className="text-right tabular-nums">{formatNumber(row.original.item_count, 0)}</div>
    ),
  },
  {
    accessorKey: "total_amount",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Doanh thu" align="right" />,
    cell: ({ row }) => (
      <div className="text-right font-medium">
        <Money value={row.original.total_amount} />
      </div>
    ),
  },
  {
    accessorKey: "total_cogs",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Giá vốn" align="right" />,
    cell: ({ row }) => (
      <div className="text-right text-muted-foreground">
        <Money value={row.original.total_cogs} />
      </div>
    ),
  },
  {
    accessorKey: "gross_margin_pct",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Lãi gộp %" align="right" />,
    cell: ({ row }) => {
      const pct = row.original.gross_margin_pct;
      return (
        <div className="text-right tabular-nums">
          {pct === null ? "—" : formatPercent(pct)}
        </div>
      );
    },
  },
];

const paymentColumn: ColumnDef<OrderListRow> = {
  accessorKey: "payment_method",
  header: ({ column }) => <DataTableColumnHeader column={column} title="Thanh toán" />,
  filterFn: "equals",
  cell: ({ row }) => (
    <span className="text-muted-foreground">
      {PAYMENT_METHOD_LABELS[row.original.payment_method]}
    </span>
  ),
};

const statusColumn: ColumnDef<OrderListRow> = {
  accessorKey: "status",
  header: ({ column }) => <DataTableColumnHeader column={column} title="Trạng thái" align="center" />,
  filterFn: "equals",
  cell: ({ row }) => (
    <div className="text-center">
      <StatusBadge tone={row.original.status === "completed" ? "success" : "danger"} dot>
        {ORDER_STATUS_LABELS[row.original.status]}
      </StatusBadge>
    </div>
  ),
};

const actionsColumn: ColumnDef<OrderListRow> = {
  id: "actions",
  header: () => <span className="sr-only">Thao tác</span>,
  enableSorting: false,
  enableHiding: false,
  cell: ({ row }) =>
    row.original.status === "completed" ? (
      <div className="flex justify-end" onClick={(e) => e.stopPropagation()}>
        <CancelOrderButton
          orderId={row.original.id}
          orderNumber={row.original.order_number}
          variant="icon"
        />
      </div>
    ) : null,
};

const allColumns: ColumnDef<OrderListRow>[] = [
  ...columns,
  paymentColumn,
  statusColumn,
  actionsColumn,
];

export function OrdersTable({ orders }: { orders: OrderListRow[] }) {
  const router = useRouter();

  return (
    <DataTable
      columns={allColumns}
      data={orders}
      searchable
      searchPlaceholder="Tìm theo mã đơn, bàn..."
      filters={[
        { columnId: "status", title: "Trạng thái", options: ORDER_STATUS_OPTIONS },
        { columnId: "payment_method", title: "Thanh toán", options: PAYMENT_METHOD_OPTIONS },
      ]}
      initialSorting={[{ id: "order_date", desc: true }]}
      emptyMessage="Chưa có đơn bán hàng nào."
      onRowClick={(row) => router.push(`/orders/${row.id}`)}
      rowClassName={(row) => (row.original.status === "cancelled" ? "opacity-60" : undefined)}
    />
  );
}
