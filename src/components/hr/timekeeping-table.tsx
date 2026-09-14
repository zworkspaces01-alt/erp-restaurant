"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Trash2 } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";
import type { TimekeepingRow } from "@/lib/queries/hr.queries";
import { deleteTimekeeping } from "@/server-actions/hr.actions";
import { useAction } from "@/hooks/use-action";
import { formatDate, formatNumber } from "@/lib/format";
import { ConfirmDialog, DataTable, DataTableColumnHeader } from "@/components/shared";
import { Button } from "@/components/ui/button";

interface TimekeepingTableProps {
  rows: TimekeepingRow[];
  shiftOptions: string[];
}

export function TimekeepingTable({ rows, shiftOptions }: TimekeepingTableProps) {
  const router = useRouter();
  const [target, setTarget] = useState<TimekeepingRow | null>(null);

  const { execute } = useAction<string, { id: string }>(deleteTimekeeping, {
    successMessage: "Đã xóa dòng chấm công",
    onSuccess: () => {
      setTarget(null);
      router.refresh();
    },
  });

  const columns = useMemo<ColumnDef<TimekeepingRow>[]>(
    () => [
      {
        accessorKey: "work_date",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Ngày" />,
        cell: ({ row }) => (
          <span className="whitespace-nowrap font-medium">{formatDate(row.original.work_date)}</span>
        ),
      },
      {
        id: "employee",
        accessorFn: (row) => row.employees?.full_name ?? "",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Nhân viên" />,
        cell: ({ row }) => {
          const emp = row.original.employees;
          if (!emp) return <span className="text-muted-foreground">—</span>;
          return (
            <Link href={`/employees/${emp.id}`} className="font-medium hover:underline">
              {emp.full_name}
            </Link>
          );
        },
      },
      {
        id: "position",
        accessorFn: (row) => row.employees?.position ?? "",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Vị trí" />,
        cell: ({ row }) => (
          <span className="text-muted-foreground">{row.original.employees?.position ?? "—"}</span>
        ),
      },
      {
        id: "shift",
        accessorFn: (row) => row.shift ?? "Không chia ca",
        filterFn: "equals",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Ca" />,
        cell: ({ row }) => (
          <span className="text-muted-foreground">{row.original.shift ?? "—"}</span>
        ),
      },
      {
        accessorKey: "check_in",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Giờ vào" />,
        cell: ({ row }) => (
          <span className="tabular-nums">{row.original.check_in?.slice(0, 5) ?? "—"}</span>
        ),
      },
      {
        accessorKey: "check_out",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Giờ ra" />,
        cell: ({ row }) => (
          <span className="tabular-nums">{row.original.check_out?.slice(0, 5) ?? "—"}</span>
        ),
      },
      {
        accessorKey: "hours_worked",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Số giờ" />,
        cell: ({ row }) => (
          <span className="font-semibold tabular-nums">
            {formatNumber(row.original.hours_worked, 1)}
          </span>
        ),
      },
      {
        accessorKey: "note",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Ghi chú" />,
        cell: ({ row }) => (
          <span className="text-muted-foreground">{row.original.note ?? "—"}</span>
        ),
      },
      {
        id: "actions",
        header: "",
        enableSorting: false,
        cell: ({ row }) => (
          <div className="flex justify-end">
            <Button
              variant="ghost"
              size="sm"
              aria-label="Xóa dòng chấm công"
              onClick={() => setTarget(row.original)}
            >
              <Trash2 className="size-4 text-destructive" />
            </Button>
          </div>
        ),
      },
    ],
    []
  );

  return (
    <>
      <DataTable
        columns={columns}
        data={rows}
        searchable
        searchPlaceholder="Tìm theo nhân viên, ca..."
        filters={
          shiftOptions.length > 0
            ? [
                {
                  columnId: "shift",
                  title: "Ca làm",
                  options: shiftOptions.map((s) => ({ label: s, value: s })),
                },
              ]
            : undefined
        }
        emptyMessage="Chưa có dữ liệu chấm công trong khoảng thời gian này."
        initialSorting={[{ id: "work_date", desc: true }]}
      />

      <ConfirmDialog
        open={target !== null}
        onOpenChange={(open) => !open && setTarget(null)}
        title="Xóa dòng chấm công?"
        description={
          target
            ? `${target.employees?.full_name ?? "Nhân viên"} · ${formatDate(target.work_date)}${target.shift ? ` · ${target.shift}` : ""}`
            : undefined
        }
        confirmLabel="Xóa"
        destructive
        onConfirm={async () => {
          if (target) await execute(target.id);
        }}
      />
    </>
  );
}
