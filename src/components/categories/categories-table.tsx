"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { Edit2, Trash2, FolderPlus, AlertCircle } from "lucide-react";
import type { CategoryListItem } from "@/lib/queries/categories.queries";
import {
  deleteCategory,
  toggleCategoryActive,
  type CategoryType,
} from "@/server-actions/categories.actions";
import { useAction } from "@/hooks/use-action";
import {
  DataTable,
  EmptyState,
  ConfirmDialog,
} from "@/components/shared";
import type { DataTableFilter } from "@/components/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CategoryDialog } from "./category-dialog";

interface CategoriesTableProps {
  categories: CategoryListItem[];
  type: CategoryType;
}

function ActiveToggle({
  category,
  type,
}: {
  category: CategoryListItem;
  type: CategoryType;
}) {
  const router = useRouter();
  const [checked, setChecked] = useState(category.is_active);

  const { execute, pending } = useAction<
    { id: string; is_active: boolean },
    null
  >(
    async ({ id, is_active }) => toggleCategoryActive(type, id, is_active),
    {
      successMessage: () =>
        checked ? "Đã tắt kích hoạt danh mục" : "Đã kích hoạt danh mục",
      onSuccess: () => router.refresh(),
      onError: () => setChecked(category.is_active),
    }
  );

  return (
    <div className="flex items-center gap-2">
      <Switch
        checked={checked}
        disabled={pending}
        onCheckedChange={(val) => {
          setChecked(val);
          void execute({ id: category.id, is_active: val });
        }}
        aria-label="Kích hoạt danh mục"
      />
      <span className="text-xs text-muted-foreground">
        {checked ? "Bật" : "Tắt"}
      </span>
    </div>
  );
}

export function CategoriesTable({ categories, type }: CategoriesTableProps) {
  const router = useRouter();
  const typeLabel = type === "menu" ? "món ăn" : "nguyên liệu";
  const itemUnit = type === "menu" ? "món" : "nguyên liệu";

  const [editingCategory, setEditingCategory] = useState<CategoryListItem | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [deletingCategory, setDeletingCategory] = useState<CategoryListItem | null>(null);
  const [blockedDeleteCategory, setBlockedDeleteCategory] = useState<CategoryListItem | null>(null);

  const { execute: executeDelete, pending: isDeleting } = useAction<
    string,
    null
  >(
    async (id) => deleteCategory(type, id),
    {
      successMessage: `Đã xóa danh mục ${typeLabel}`,
      onSuccess: () => {
        setDeletingCategory(null);
        router.refresh();
      },
    }
  );

  const columns = useMemo<ColumnDef<CategoryListItem>[]>(
    () => [
      {
        accessorKey: "display_order",
        header: "Thứ tự",
        size: 80,
        cell: ({ row }) => (
          <span className="font-mono text-xs text-muted-foreground">
            {row.original.display_order}
          </span>
        ),
      },
      {
        accessorKey: "name",
        header: "Tên danh mục",
        cell: ({ row }) => (
          <div className="space-y-0.5">
            <div className="font-medium text-foreground">{row.original.name}</div>
            {row.original.description && (
              <p className="text-xs text-muted-foreground line-clamp-1">
                {row.original.description}
              </p>
            )}
          </div>
        ),
      },
      {
        accessorKey: "item_count",
        header: `Số lượng ${itemUnit}`,
        cell: ({ row }) => {
          const count = row.original.item_count;
          return (
            <Badge variant={count > 0 ? "secondary" : "outline"} className="font-normal">
              {count} {itemUnit}
            </Badge>
          );
        },
      },
      {
        accessorKey: "is_active",
        header: "Trạng thái",
        cell: ({ row }) => (
          <ActiveToggle category={row.original} type={type} />
        ),
      },
      {
        id: "actions",
        header: "Thao tác",
        size: 110,
        cell: ({ row }) => {
          const cat = row.original;
          return (
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="size-8"
                onClick={() => setEditingCategory(cat)}
                title="Sửa danh mục"
              >
                <Edit2 className="size-4" />
                <span className="sr-only">Sửa</span>
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="size-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                onClick={() => {
                  if (cat.item_count > 0) {
                    setBlockedDeleteCategory(cat);
                  } else {
                    setDeletingCategory(cat);
                  }
                }}
                title="Xóa danh mục"
              >
                <Trash2 className="size-4" />
                <span className="sr-only">Xóa</span>
              </Button>
            </div>
          );
        },
      },
    ],
    [type, itemUnit]
  );

  const filters = useMemo<DataTableFilter[]>(() => {
    return [
      {
        columnId: "is_active",
        title: "Trạng thái",
        options: [
          { label: "Đang hoạt động", value: "true" },
          { label: "Ngừng hoạt động", value: "false" },
        ],
      },
    ];
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Tổng số <span className="font-medium text-foreground">{categories.length}</span> danh mục {typeLabel}.
        </p>
        <Button onClick={() => setIsCreateOpen(true)} className="gap-2">
          <FolderPlus className="size-4" />
          Thêm danh mục mới
        </Button>
      </div>

      {categories.length === 0 ? (
        <EmptyState
          title={`Chưa có danh mục ${typeLabel} nào`}
          description={`Tạo danh mục đầu tiên để phân loại và quản lý ${itemUnit} dễ dàng hơn.`}
          action={
            <Button onClick={() => setIsCreateOpen(true)} className="gap-2">
              <FolderPlus className="size-4" />
              Tạo danh mục ngay
            </Button>
          }
        />
      ) : (
        <DataTable
          columns={columns}
          data={categories}
          filters={filters}
          searchPlaceholder={`Tìm theo tên danh mục...`}
          emptyMessage="Không tìm thấy danh mục phù hợp."
          initialSorting={[{ id: "display_order", desc: false }]}
        />
      )}

      {/* Dialog Thêm mới */}
      <CategoryDialog
        open={isCreateOpen}
        onOpenChange={setIsCreateOpen}
        type={type}
        category={null}
      />

      {/* Dialog Sửa */}
      <CategoryDialog
        open={Boolean(editingCategory)}
        onOpenChange={(open) => !open && setEditingCategory(null)}
        type={type}
        category={editingCategory}
      />

      {/* Confirm Xóa an toàn khi item_count === 0 */}
      <ConfirmDialog
        open={Boolean(deletingCategory)}
        onOpenChange={(open) => !open && setDeletingCategory(null)}
        title={`Xóa danh mục "${deletingCategory?.name}"?`}
        description="Bạn có chắc chắn muốn xóa danh mục này không? Hành động này không thể hoàn tác."
        confirmLabel={isDeleting ? "Đang xóa..." : "Xóa vĩnh viễn"}
        cancelLabel="Hủy"
        destructive
        onConfirm={async () => {
          if (deletingCategory) {
            await executeDelete(deletingCategory.id);
          }
        }}
      />

      {/* Dialog cảnh báo không thể xóa vì đang có items */}
      <Dialog
        open={Boolean(blockedDeleteCategory)}
        onOpenChange={(open) => !open && setBlockedDeleteCategory(null)}
      >
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <div className="flex items-center gap-2 text-destructive">
              <AlertCircle className="size-5" />
              <DialogTitle>Không thể xóa danh mục</DialogTitle>
            </div>
            <DialogDescription className="pt-2 text-foreground">
              Danh mục <strong>&ldquo;{blockedDeleteCategory?.name}&rdquo;</strong> hiện đang có{" "}
              <strong>{blockedDeleteCategory?.item_count}</strong> {itemUnit}.
            </DialogDescription>
          </DialogHeader>
          <div className="text-sm text-muted-foreground bg-muted/50 p-3 rounded-md">
            Hệ thống không cho phép xóa danh mục đang có dữ liệu liên kết. Bạn vui lòng chuyển hoặc xóa các {itemUnit} này sang danh mục khác trước khi xóa danh mục này.
          </div>
          <DialogFooter>
            <Button onClick={() => setBlockedDeleteCategory(null)}>
              Đã hiểu
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
