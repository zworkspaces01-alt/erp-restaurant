"use client";

import { useMemo } from "react";
import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import {
  EMPLOYMENT_TYPE_LABELS,
  type Employee,
  type EmploymentType,
} from "@/types/restaurant";
import { formatDate, formatVND } from "@/lib/format";
import { DataTable, DataTableColumnHeader, StatusBadge } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { EmployeeFormDialog } from "@/components/hr/employee-form-dialog";

const SHORT_TYPE_LABELS: Record<EmploymentType, string> = {
  full_time: "FT",
  part_time: "PT",
};

export function EmployeesTable({ employees }: { employees: Employee[] }) {
  const columns = useMemo<ColumnDef<Employee>[]>(
    () => [
      {
        accessorKey: "code",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Mã" />,
        cell: ({ row }) => (
          <span className="font-mono text-xs text-muted-foreground">{row.original.code ?? "—"}</span>
        ),
      },
      {
        accessorKey: "full_name",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Họ tên" />,
        cell: ({ row }) => (
          <Link
            href={`/employees/${row.original.id}`}
            className="font-medium text-foreground hover:underline"
          >
            {row.original.full_name}
          </Link>
        ),
      },
      {
        accessorKey: "position",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Vị trí" />,
        cell: ({ row }) => row.original.position ?? "—",
      },
      {
        accessorKey: "employment_type",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Loại HĐ" />,
        cell: ({ row }) => {
          const type = row.original.employment_type;
          return (
            <StatusBadge tone={type === "full_time" ? "info" : "neutral"}>
              {SHORT_TYPE_LABELS[type]} · {EMPLOYMENT_TYPE_LABELS[type]}
            </StatusBadge>
          );
        },
      },
      {
        id: "pay_rate",
        accessorFn: (row) =>
          row.employment_type === "full_time" ? Number(row.base_salary) : Number(row.hourly_rate),
        header: ({ column }) => <DataTableColumnHeader column={column} title="Lương" />,
        cell: ({ row }) => {
          const emp = row.original;
          return emp.employment_type === "full_time" ? (
            <span className="font-medium tabular-nums">{formatVND(emp.base_salary)}/tháng</span>
          ) : (
            <span className="font-medium tabular-nums">{formatVND(emp.hourly_rate)}/giờ</span>
          );
        },
      },
      {
        accessorKey: "allowance",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Phụ cấp" />,
        cell: ({ row }) => <span className="tabular-nums">{formatVND(row.original.allowance)}</span>,
      },
      {
        accessorKey: "start_date",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Ngày vào làm" />,
        cell: ({ row }) => (
          <span className="text-muted-foreground">{formatDate(row.original.start_date)}</span>
        ),
      },
      {
        id: "is_active",
        accessorFn: (row) => (row.is_active ? "active" : "inactive"),
        filterFn: "equals",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Trạng thái" />,
        cell: ({ row }) =>
          row.original.is_active ? (
            <StatusBadge tone="success" dot>
              Đang làm
            </StatusBadge>
          ) : (
            <StatusBadge tone="neutral" dot>
              Đã nghỉ
            </StatusBadge>
          ),
      },
      {
        id: "actions",
        header: "",
        enableSorting: false,
        cell: ({ row }) => (
          <div className="flex justify-end gap-1">
            <EmployeeFormDialog
              employee={row.original}
              trigger={
                <Button variant="ghost" size="sm">
                  Sửa
                </Button>
              }
            />
          </div>
        ),
      },
    ],
    []
  );

  return (
    <DataTable
      columns={columns}
      data={employees}
      searchable
      searchPlaceholder="Tìm theo tên, mã, vị trí..."
      filters={[
        {
          columnId: "employment_type",
          title: "Loại hợp đồng",
          options: [
            { label: "Toàn thời gian", value: "full_time" },
            { label: "Bán thời gian", value: "part_time" },
          ],
        },
        {
          columnId: "is_active",
          title: "Trạng thái",
          options: [
            { label: "Đang làm", value: "active" },
            { label: "Đã nghỉ", value: "inactive" },
          ],
        },
      ]}
      emptyMessage="Chưa có nhân viên nào."
      initialSorting={[{ id: "full_name", desc: false }]}
    />
  );
}
