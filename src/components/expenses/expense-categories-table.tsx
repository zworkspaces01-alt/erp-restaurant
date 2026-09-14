"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { FolderTree, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deleteExpenseCategory } from "@/server-actions/expenses.actions";
import type { ExpenseCategoryRow } from "@/lib/queries/expenses.queries";
import { EXPENSE_TYPE_LABELS, EXPENSE_TYPE_OPTIONS } from "@/types/restaurant";
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
import { ExpenseCategoryDialog } from "@/components/expenses/expense-category-dialog";

export function ExpenseCategoriesTable({ rows }: { rows: ExpenseCategoryRow[] }) {
  const router = useRouter();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ExpenseCategoryRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ExpenseCategoryRow | null>(null);

  async function handleDelete() {
    if (!deleteTarget) return;
    const result = await deleteExpenseCategory(deleteTarget.id);
    if (result.success) {
      toast.success("Đã xóa nhóm chi phí");
      setDeleteTarget(null);
      router.refresh();
    } else {
      toast.error(result.error);
    }
  }

  const columns = useMemo<ColumnDef<ExpenseCategoryRow>[]>(
    () => [
      {
        accessorKey: "name",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Tên nhóm" />,
        cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
      },
      {
        accessorKey: "expense_type",
        filterFn: "equalsString",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Loại chi phí" />,
        cell: ({ row }) => (
          <StatusBadge tone={row.original.expense_type === "fixed" ? "info" : "neutral"}>
            {EXPENSE_TYPE_LABELS[row.original.expense_type]}
          </StatusBadge>
        ),
      },
      {
        accessorKey: "description",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Mô tả" />,
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">{row.original.description ?? "—"}</span>
        ),
      },
      {
        accessorKey: "record_count",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Số khoản chi" />,
        cell: ({ row }) => (
          <span className="tabular-nums">{row.original.record_count}</span>
        ),
      },
      {
        accessorKey: "is_active",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Trạng thái" />,
        cell: ({ row }) => (
          <StatusBadge tone={row.original.is_active ? "success" : "neutral"} dot>
            {row.original.is_active ? "Đang dùng" : "Ngừng dùng"}
          </StatusBadge>
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
                <DropdownMenuItem
                  variant="destructive"
                  disabled={row.original.record_count > 0}
                  onSelect={() => setDeleteTarget(row.original)}
                >
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
      columnId: "expense_type",
      title: "Loại chi phí",
      options: EXPENSE_TYPE_OPTIONS.map((o) => ({ label: o.label, value: o.value })),
    },
  ];

  return (
    <>
      {rows.length === 0 ? (
        <EmptyState
          icon={FolderTree}
          title="Chưa có nhóm chi phí"
          description="Tạo các nhóm như mặt bằng, điện nước, marketing để phân loại chi phí trong P&L."
          action={
            <Button
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              <Plus className="size-4" />
              Thêm nhóm chi phí
            </Button>
          }
        />
      ) : (
        <DataTable
          columns={columns}
          data={rows}
          searchable
          searchPlaceholder="Tìm nhóm chi phí..."
          filters={filters}
          hidePagination={rows.length <= 20}
          emptyMessage="Không có nhóm chi phí phù hợp."
          toolbar={
            <Button
              size="sm"
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              <Plus className="size-4" />
              Thêm nhóm chi phí
            </Button>
          }
        />
      )}

      <ExpenseCategoryDialog
        open={formOpen}
        onOpenChange={(open) => {
          setFormOpen(open);
          if (!open) setEditing(null);
        }}
        category={editing}
      />

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Xóa nhóm chi phí?"
        description={deleteTarget ? `Nhóm "${deleteTarget.name}" sẽ bị xóa vĩnh viễn.` : undefined}
        confirmLabel="Xóa"
        destructive
        onConfirm={handleDelete}
      />
    </>
  );
}
