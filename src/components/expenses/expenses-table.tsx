"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { CheckCircle2, MoreHorizontal, Pencil, Plus, Receipt, Trash2 } from "lucide-react";
import { deleteExpenseRecord } from "@/server-actions/expenses.actions";
import { formatDate, formatDateTime, formatVND } from "@/lib/format";
import type { ExpenseRow } from "@/lib/queries/expenses.queries";
import {
  EXPENSE_STATUS_LABELS,
  EXPENSE_STATUS_OPTIONS,
  EXPENSE_TYPE_LABELS,
  PAYMENT_METHOD_LABELS,
  type ExpenseCategory,
} from "@/types/restaurant";
import {
  ConfirmDialog,
  DataTable,
  DataTableColumnHeader,
  EmptyState,
  StatusBadge,
  type DataTableFilter,
} from "@/components/shared";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ExpenseFormDialog } from "@/components/expenses/expense-form-dialog";
import { MarkPaidDialog } from "@/components/expenses/mark-paid-dialog";
import { toast } from "sonner";

interface ExpensesTableProps {
  rows: ExpenseRow[];
  categories: ExpenseCategory[];
}

export function ExpensesTable({ rows, categories }: ExpensesTableProps) {
  const router = useRouter();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ExpenseRow | null>(null);
  const [payTarget, setPayTarget] = useState<ExpenseRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ExpenseRow | null>(null);

  async function handleDelete() {
    if (!deleteTarget) return;
    const result = await deleteExpenseRecord(deleteTarget.id);
    if (result.success) {
      toast.success("Đã xóa khoản chi phí");
      setDeleteTarget(null);
      router.refresh();
    } else {
      toast.error(result.error);
    }
  }

  const columns = useMemo<ColumnDef<ExpenseRow>[]>(
    () => [
      {
        accessorKey: "expense_date",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Ngày chi" />,
        cell: ({ row }) => (
          <span className="whitespace-nowrap text-sm">{formatDate(row.original.expense_date)}</span>
        ),
      },
      {
        accessorKey: "title",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Nội dung" />,
        cell: ({ row }) => (
          <div className="min-w-40">
            <p className="font-medium">{row.original.title}</p>
            {row.original.invoice_number && (
              <p className="text-xs text-muted-foreground">HĐ: {row.original.invoice_number}</p>
            )}
          </div>
        ),
      },
      {
        accessorKey: "category_name",
        filterFn: "equalsString",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Nhóm chi phí" />,
        cell: ({ row }) => (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-sm">{row.original.category_name}</span>
            <StatusBadge tone={row.original.category_type === "fixed" ? "info" : "neutral"}>
              {EXPENSE_TYPE_LABELS[row.original.category_type]}
            </StatusBadge>
          </div>
        ),
      },
      {
        accessorKey: "vendor",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Nhà cung cấp" />,
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">{row.original.vendor ?? "—"}</span>
        ),
      },
      {
        accessorKey: "amount",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Số tiền" className="justify-end" />
        ),
        cell: ({ row }) => (
          <div className="text-right font-semibold tabular-nums">
            {formatVND(row.original.amount)}
          </div>
        ),
      },
      {
        accessorKey: "status",
        filterFn: "equalsString",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Trạng thái" />,
        cell: ({ row }) => (
          <StatusBadge tone={row.original.status === "paid" ? "success" : "warning"} dot>
            {EXPENSE_STATUS_LABELS[row.original.status]}
          </StatusBadge>
        ),
      },
      {
        accessorKey: "payment_method",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Hình thức" />,
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">
            {row.original.payment_method ? PAYMENT_METHOD_LABELS[row.original.payment_method] : "—"}
          </span>
        ),
      },
      {
        accessorKey: "paid_at",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Thời điểm chi" />,
        cell: ({ row }) => (
          <span className="whitespace-nowrap text-xs text-muted-foreground">
            {row.original.paid_at ? formatDateTime(row.original.paid_at) : "—"}
          </span>
        ),
      },
      {
        id: "actions",
        enableHiding: false,
        header: () => <span className="sr-only">Thao tác</span>,
        cell: ({ row }) => (
          <div className="text-right">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Thao tác">
                  <MoreHorizontal className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {row.original.status === "pending" && (
                  <DropdownMenuItem onSelect={() => setPayTarget(row.original)}>
                    <CheckCircle2 className="size-4" />
                    Đánh dấu đã chi
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem
                  onSelect={() => {
                    setEditing(row.original);
                    setFormOpen(true);
                  }}
                >
                  <Pencil className="size-4" />
                  Sửa
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onSelect={() => setDeleteTarget(row.original)}>
                  <Trash2 className="size-4" />
                  Xóa
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ),
      },
    ],
    []
  );

  const filters: DataTableFilter[] = [
    {
      columnId: "status",
      title: "Trạng thái",
      options: EXPENSE_STATUS_OPTIONS.map((o) => ({ label: o.label, value: o.value })),
    },
    {
      columnId: "category_name",
      title: "Nhóm chi phí",
      options: categories.map((c) => ({ label: c.name, value: c.name })),
    },
  ];

  return (
    <>
      {rows.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title="Chưa có chi phí nào trong kỳ này"
          description="Ghi nhận hóa đơn tiền thuê, điện nước, marketing... để P&L phản ánh đúng chi phí vận hành."
          action={
            <Button
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              <Plus className="size-4" />
              Ghi nhận chi phí
            </Button>
          }
        />
      ) : (
        <DataTable
          columns={columns}
          data={rows}
          searchable
          searchPlaceholder="Tìm theo nội dung, nhà cung cấp..."
          filters={filters}
          initialSorting={[{ id: "expense_date", desc: true }]}
          emptyMessage="Không có chi phí phù hợp bộ lọc."
          toolbar={
            <Button
              size="sm"
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              <Plus className="size-4" />
              Ghi nhận chi phí
            </Button>
          }
        />
      )}

      <ExpenseFormDialog
        open={formOpen}
        onOpenChange={(open) => {
          setFormOpen(open);
          if (!open) setEditing(null);
        }}
        categories={categories}
        expense={editing}
      />

      <MarkPaidDialog
        open={Boolean(payTarget)}
        onOpenChange={(open) => !open && setPayTarget(null)}
        expense={payTarget}
      />

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Xóa khoản chi phí?"
        description={
          deleteTarget
            ? `"${deleteTarget.title}" (${formatVND(deleteTarget.amount)}) sẽ bị xóa vĩnh viễn.`
            : undefined
        }
        confirmLabel="Xóa"
        destructive
        onConfirm={handleDelete}
      />
    </>
  );
}
