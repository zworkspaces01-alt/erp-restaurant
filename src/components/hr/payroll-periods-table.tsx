"use client";

import { useMemo } from "react";
import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { PAYROLL_STATUS_LABELS, PAYROLL_STATUS_OPTIONS, payrollStatusTone } from "@/types/restaurant";
import type { PayrollPeriodRow } from "@/lib/queries/hr.queries";
import { formatDate, formatNumber, formatVND } from "@/lib/format";
import { DataTable, DataTableColumnHeader, StatusBadge } from "@/components/shared";

export function PayrollPeriodsTable({ periods }: { periods: PayrollPeriodRow[] }) {
  const columns = useMemo<ColumnDef<PayrollPeriodRow>[]>(
    () => [
      {
        accessorKey: "name",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Kỳ lương" />,
        cell: ({ row }) => (
          <Link href={`/payroll/${row.original.id}`} className="font-medium hover:underline">
            {row.original.name}
          </Link>
        ),
      },
      {
        accessorKey: "period_start",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Từ ngày" />,
        cell: ({ row }) => (
          <span className="whitespace-nowrap text-muted-foreground">
            {formatDate(row.original.period_start)}
          </span>
        ),
      },
      {
        accessorKey: "period_end",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Đến ngày" />,
        cell: ({ row }) => (
          <span className="whitespace-nowrap text-muted-foreground">
            {formatDate(row.original.period_end)}
          </span>
        ),
      },
      {
        accessorKey: "status",
        filterFn: "equals",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Trạng thái" />,
        cell: ({ row }) => (
          <StatusBadge tone={payrollStatusTone(row.original.status)} dot>
            {PAYROLL_STATUS_LABELS[row.original.status]}
          </StatusBadge>
        ),
      },
      {
        id: "itemCount",
        accessorFn: (row) => row.itemCount,
        header: ({ column }) => <DataTableColumnHeader column={column} title="Số dòng lương" />,
        cell: ({ row }) => (
          <span className="tabular-nums">{formatNumber(row.original.itemCount)}</span>
        ),
      },
      {
        accessorKey: "total_net_pay",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Tổng thực chi" />,
        cell: ({ row }) => (
          <span className="font-semibold tabular-nums">{formatVND(row.original.total_net_pay)}</span>
        ),
      },
    ],
    []
  );

  return (
    <DataTable
      columns={columns}
      data={periods}
      searchable
      searchPlaceholder="Tìm kỳ lương..."
      filters={[
        {
          columnId: "status",
          title: "Trạng thái",
          options: PAYROLL_STATUS_OPTIONS.map((o) => ({ label: o.label, value: o.value })),
        },
      ]}
      emptyMessage="Chưa có kỳ lương nào."
      initialSorting={[{ id: "period_start", desc: true }]}
    />
  );
}
