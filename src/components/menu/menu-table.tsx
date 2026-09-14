"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { AlertTriangle, Layers, Pencil, SlidersHorizontal } from "lucide-react";
import type { MenuItemCost } from "@/lib/queries/menu.queries";
import { setMenuItemActive } from "@/server-actions/menu.actions";
import { useAction } from "@/hooks/use-action";
import { formatPercent, formatVND } from "@/lib/format";
import {
  DataTable,
  DataTableColumnHeader,
  EmptyState,
  Money,
  StatusBadge,
  foodCostTone,
} from "@/components/shared";
import type { DataTableFilter } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { MenuItemDialog, type MenuItemDialogValues } from "@/components/menu/menu-item-dialog";

interface MenuTableProps {
  items: MenuItemCost[];
  /** Bản ghi gốc menu_items để đổ vào form sửa, khóa theo id. */
  editValues: Record<string, MenuItemDialogValues>;
  categoryOptions?: string[];
}

function ActiveToggle({ item }: { item: MenuItemCost }) {
  const router = useRouter();
  const [checked, setChecked] = useState(item.is_active);
  const { execute, pending } = useAction<{ id: string; is_active: boolean }, { id: string; is_active: boolean }>(
    setMenuItemActive,
    {
      successMessage: (data) => (data.is_active ? "Đã mở bán món" : "Đã ngừng bán món"),
      onSuccess: () => router.refresh(),
      onError: () => setChecked(item.is_active),
    }
  );

  return (
    <Switch
      checked={checked}
      disabled={pending}
      aria-label={checked ? "Đang bán" : "Ngừng bán"}
      onCheckedChange={(value) => {
        setChecked(value);
        void execute({ id: item.id, is_active: value });
      }}
    />
  );
}

export function MenuTable({ items, editValues, categoryOptions }: MenuTableProps) {
  const columns = useMemo<ColumnDef<MenuItemCost>[]>(
    () => [
      {
        accessorKey: "code",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Mã" />,
        cell: ({ row }) => (
          <span className="font-mono text-xs text-muted-foreground">{row.original.code ?? "—"}</span>
        ),
      },
      {
        accessorKey: "name",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Tên món" />,
        cell: ({ row }) => (
          <div className="flex min-w-0 flex-col gap-1">
            <div className="flex items-center gap-2">
              <Link href={`/menu/${row.original.id}`} className="font-medium hover:underline">
                {row.original.name}
              </Link>
              {row.original.is_combo && (
                <StatusBadge tone="info" className="gap-1 text-[11px] py-0 px-1.5 h-5">
                  <Layers className="size-3" />
                  Combo
                </StatusBadge>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {row.original.missing_recipe && (
                <StatusBadge tone="warning">
                  <AlertTriangle className="size-3" />
                  {row.original.is_combo ? "Chưa chọn món thành phần" : "Chưa có định lượng"}
                </StatusBadge>
              )}
              {!row.original.is_active && <StatusBadge tone="neutral">Ngừng bán</StatusBadge>}
            </div>
          </div>
        ),
      },
      {
        accessorKey: "category",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Danh mục / Nhóm" />,
        cell: ({ row }) => (
          <div className="space-y-0.5">
            <div className="font-medium text-foreground">{row.original.category ?? "—"}</div>
            {row.original.item_group && (
              <span className="inline-flex items-center text-[11px] text-muted-foreground bg-muted/80 px-1.5 py-0.5 rounded">
                {row.original.item_group}
              </span>
            )}
          </div>
        ),
        filterFn: "equals",
      },
      {
        id: "item_group",
        accessorKey: "item_group",
        header: () => null,
        cell: () => null,
        filterFn: "equals",
      },
      {
        accessorKey: "is_combo",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Loại" />,
        cell: ({ row }) => (
          row.original.is_combo ? (
            <span className="text-xs font-medium text-sky-600 dark:text-sky-400">Combo</span>
          ) : (
            <span className="text-xs text-muted-foreground">Món lẻ</span>
          )
        ),
        filterFn: (row, _id, filterValue) => {
          if (filterValue === "combo") return row.original.is_combo === true;
          if (filterValue === "single") return row.original.is_combo === false;
          return true;
        },
      },
      {
        accessorKey: "selling_price",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Giá bán" className="justify-end" />,
        cell: ({ row }) => <div className="text-right font-medium">{formatVND(row.original.selling_price)}</div>,
      },
      {
        accessorKey: "ideal_cost",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Giá vốn chuẩn" className="justify-end" />
        ),
        cell: ({ row }) => <div className="text-right">{formatVND(row.original.ideal_cost)}</div>,
      },
      {
        accessorKey: "contribution_margin",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Lãi gộp (CM)" className="justify-end" />
        ),
        cell: ({ row }) => (
          <div className="text-right">
            <Money value={row.original.contribution_margin} />
          </div>
        ),
      },
      {
        accessorKey: "food_cost_pct",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Food Cost %" className="justify-center" />
        ),
        cell: ({ row }) => {
          const pct = row.original.food_cost_pct;
          return (
            <div className="text-center">
              {pct === null || row.original.missing_recipe ? (
                <StatusBadge tone="neutral">—</StatusBadge>
              ) : (
                <StatusBadge tone={foodCostTone(pct)}>{formatPercent(pct)}</StatusBadge>
              )}
            </div>
          );
        },
      },
      {
        id: "is_active",
        header: () => <div className="text-center">Đang bán</div>,
        cell: ({ row }) => (
          <div className="flex justify-center">
            <ActiveToggle item={row.original} />
          </div>
        ),
      },
      {
        id: "actions",
        header: () => <div className="text-right">Thao tác</div>,
        cell: ({ row }) => {
          const values = editValues[row.original.id];
          return (
            <div className="flex justify-end gap-1">
              {values && (
                <MenuItemDialog
                  item={values}
                  categoryOptions={categoryOptions}
                  trigger={
                    <Button variant="ghost" size="icon" aria-label="Sửa món">
                      <Pencil className="size-4" />
                    </Button>
                  }
                />
              )}
              <Button asChild variant="ghost" size="sm">
                <Link href={`/menu/${row.original.id}`}>
                  {row.original.is_combo ? (
                    <>
                      <Layers className="size-3.5" />
                      Cấu hình Combo
                    </>
                  ) : (
                    <>
                      <SlidersHorizontal className="size-3.5" />
                      Định lượng
                    </>
                  )}
                </Link>
              </Button>
            </div>
          );
        },
      },
    ],
    [editValues, categoryOptions]
  );

  const filters = useMemo<DataTableFilter[]>(() => {
    const categories = Array.from(
      new Set(items.map((i) => i.category).filter((c): c is string => Boolean(c)))
    ).sort((a, b) => a.localeCompare(b, "vi"));

    const itemGroups = Array.from(
      new Set(items.map((i) => i.item_group).filter((g): g is string => Boolean(g)))
    ).sort((a, b) => a.localeCompare(b, "vi"));

    const filterList: DataTableFilter[] = [
      {
        columnId: "is_combo",
        title: "Loại món",
        options: [
          { label: "Món đơn lẻ", value: "single" },
          { label: "Combo / Set menu", value: "combo" },
        ],
      },
      {
        columnId: "category",
        title: "Danh mục",
        options: categories.map((c) => ({ label: c, value: c })),
      },
    ];

    if (itemGroups.length > 0) {
      filterList.push({
        columnId: "item_group",
        title: "Nhóm món",
        options: itemGroups.map((g) => ({ label: g, value: g })),
      });
    }

    return filterList;
  }, [items]);

  if (items.length === 0) {
    return (
      <EmptyState
        title="Chưa có món ăn nào"
        description="Thêm món đầu tiên để bắt đầu xây dựng định lượng và theo dõi Food Cost."
      />
    );
  }

  return (
    <DataTable
      columns={columns}
      data={items}
      filters={filters}
      searchPlaceholder="Tìm theo tên hoặc mã món..."
      emptyMessage="Không tìm thấy món ăn phù hợp."
      initialSorting={[{ id: "name", desc: false }]}
    />
  );
}
