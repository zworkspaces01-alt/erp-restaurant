"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { MoreHorizontal, Pencil, PackagePlus, Power, PowerOff } from "lucide-react";
import type { InventoryStatusRow } from "@/types/restaurant";
import { setIngredientActive } from "@/server-actions/inventory.actions";
import { useAction } from "@/hooks/use-action";
import {
  ConfirmDialog,
  DataTable,
  DataTableColumnHeader,
  StatusBadge,
  type DataTableFilter,
  type DataTableFilterOption,
} from "@/components/shared";
import { formatNumber, formatVND } from "@/lib/format";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { IngredientFormDialog, type SupplierOption } from "./ingredient-form-dialog";
import { IngredientImportDialog } from "./ingredient-import-dialog";
import { IngredientOcrDialog } from "./ingredient-ocr-dialog";

interface InventoryTableProps {
  rows: InventoryStatusRow[];
  suppliers: SupplierOption[];
  categoryOptions?: string[];
}

export function InventoryTable({ rows, suppliers, categoryOptions }: InventoryTableProps) {
  const router = useRouter();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<InventoryStatusRow | null>(null);
  const [deactivating, setDeactivating] = useState<InventoryStatusRow | null>(null);

  const { execute: toggleActive } = useAction<
    { id: string; isActive: boolean },
    { id: string }
  >(({ id, isActive }) => setIngredientActive(id, isActive), {
    successMessage: "Đã ngừng sử dụng nguyên liệu",
    onSuccess: () => {
      setDeactivating(null);
      router.refresh();
    },
  });

  const searchParams = useSearchParams();
  const supplierQuery = searchParams.get("supplier");

  const initialColumnFilters = useMemo(() => {
    if (!supplierQuery) return [];
    return [{ id: "default_supplier_name", value: supplierQuery }];
  }, [supplierQuery]);

  const filters = useMemo<DataTableFilter[]>(() => {
    const categories = Array.from(
      new Set(rows.map((r) => r.category).filter((c): c is string => Boolean(c)))
    ).sort((a, b) => a.localeCompare(b, "vi"));

    // Thu thập danh sách NCC từ cả danh mục suppliers và dữ liệu rows
    const supplierSet = new Set<string>();
    for (const s of suppliers) {
      if (s.name?.trim()) supplierSet.add(s.name.trim());
    }
    for (const r of rows) {
      if (r.default_supplier_name?.trim()) supplierSet.add(r.default_supplier_name.trim());
    }

    const supplierOptions: DataTableFilterOption[] = Array.from(supplierSet)
      .sort((a, b) => a.localeCompare(b, "vi"))
      .map((name) => ({ label: name, value: name }));

    const hasUnassigned = rows.some((r) => !r.default_supplier_name);
    if (hasUnassigned) {
      supplierOptions.push({ label: "Chưa gán NCC", value: "__none__" });
    }

    return [
      {
        columnId: "category",
        title: "Danh mục",
        options: categories.map((c) => ({ label: c, value: c })),
      },
      {
        columnId: "default_supplier_name",
        title: "Nhà cung cấp",
        options: supplierOptions,
      },
      {
        columnId: "is_below_min",
        title: "Cảnh báo tồn",
        options: [
          { label: "Dưới định mức", value: "true" },
          { label: "Đủ tồn", value: "false" },
        ],
      },
    ];
  }, [rows, suppliers]);

  const columns = useMemo<ColumnDef<InventoryStatusRow, unknown>[]>(
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
        header: ({ column }) => <DataTableColumnHeader column={column} title="Nguyên liệu" />,
        cell: ({ row }) => (
          <Link href={`/inventory/${row.original.id}`} className="font-medium hover:underline">
            {row.original.name}
          </Link>
        ),
      },
      {
        id: "category",
        accessorFn: (r) => r.category ?? "",
        filterFn: "equalsString",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Danh mục" />,
        cell: ({ row }) => row.original.category ?? "—",
      },
      {
        id: "current_stock",
        accessorFn: (r) => Number(r.current_stock ?? 0),
        header: ({ column }) => <DataTableColumnHeader column={column} title="Tồn kho" align="right" />,
        cell: ({ row }) => {
          const r = row.original;
          return (
            <div className="text-right">
              <div className="font-medium tabular-nums">
                {formatNumber(Number(r.current_stock ?? 0), 3)} {r.base_unit}
              </div>
              <div className="text-xs text-muted-foreground tabular-nums">
                ≈ {formatNumber(Number(r.stock_in_import_units ?? 0), 2)} {r.import_unit}
              </div>
            </div>
          );
        },
      },
      {
        id: "min_alert_stock",
        accessorFn: (r) => Number(r.min_alert_stock ?? 0),
        header: ({ column }) => <DataTableColumnHeader column={column} title="Tồn tối thiểu" align="right" />,
        cell: ({ row }) => (
          <div className="text-right tabular-nums">
            {formatNumber(Number(row.original.min_alert_stock ?? 0), 3)} {row.original.base_unit}
          </div>
        ),
      },
      {
        id: "avg_cost_price",
        accessorFn: (r) => Number(r.avg_cost_price ?? 0),
        header: ({ column }) => <DataTableColumnHeader column={column} title="Giá vốn BQ" align="right" />,
        cell: ({ row }) => {
          const r = row.original;
          return (
            <div className="text-right">
              <div className="tabular-nums">
                {formatVND(Number(r.avg_cost_price ?? 0))}/{r.base_unit}
              </div>
              <div className="text-xs text-muted-foreground tabular-nums">
                {formatVND(Number(r.avg_cost_per_import_unit ?? 0))}/{r.import_unit}
              </div>
            </div>
          );
        },
      },
      {
        id: "stock_value",
        accessorFn: (r) => Number(r.stock_value ?? 0),
        header: ({ column }) => <DataTableColumnHeader column={column} title="Giá trị tồn" align="right" />,
        cell: ({ row }) => (
          <div className="text-right font-medium tabular-nums">
            {formatVND(Number(row.original.stock_value ?? 0))}
          </div>
        ),
      },
      {
        id: "default_supplier_name",
        accessorFn: (r) => r.default_supplier_name?.trim() || "__none__",
        filterFn: "equalsString",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Nhà cung cấp" />,
        cell: ({ row }) => {
          const supName = row.original.default_supplier_name;
          const supId = row.original.default_supplier_id;
          if (!supName) return <span className="text-muted-foreground text-xs">—</span>;
          return supId ? (
            <Link
              href={`/suppliers/${supId}`}
              className="text-xs font-medium text-foreground hover:text-emerald-600 dark:hover:text-emerald-400 hover:underline transition-colors"
              title={`Xem chi tiết nhà cung cấp ${supName}`}
            >
              {supName}
            </Link>
          ) : (
            <span className="text-xs">{supName}</span>
          );
        },
      },
      {
        id: "is_below_min",
        accessorFn: (r) => (r.is_below_min ? "true" : "false"),
        filterFn: "equalsString",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Trạng thái" />,
        cell: ({ row }) =>
          row.original.is_below_min ? (
            <StatusBadge tone="danger" dot>
              Dưới định mức
            </StatusBadge>
          ) : (
            <StatusBadge tone="success">Đủ tồn</StatusBadge>
          ),
      },
      {
        id: "actions",
        enableSorting: false,
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
                  Sửa thông tin
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href={`/inventory/${row.original.id}`}>
                    <Power className="size-4" />
                    Xem sổ kho
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem
                  variant="destructive"
                  onSelect={() => setDeactivating(row.original)}
                >
                  <PowerOff className="size-4" />
                  Ngừng sử dụng
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
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
        filters={filters}
        initialColumnFilters={initialColumnFilters}
        searchPlaceholder="Tìm theo tên, mã hoặc nhà cung cấp..."
        initialSorting={[{ id: "is_below_min", desc: true }]}
        emptyMessage="Chưa có nguyên liệu nào."
        columnLabels={{
          code: "Mã",
          name: "Nguyên liệu",
          category: "Danh mục",
          current_stock: "Tồn kho",
          min_alert_stock: "Tồn tối thiểu",
          avg_cost_price: "Giá vốn BQ",
          stock_value: "Giá trị tồn",
          default_supplier_name: "Nhà cung cấp",
          is_below_min: "Trạng thái",
        }}
        toolbar={
          <div className="flex flex-wrap items-center gap-2">
            <IngredientOcrDialog categoryOptions={categoryOptions} />
            <IngredientImportDialog />
            <Button
              size="sm"
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              <PackagePlus className="size-4" />
              Thêm nguyên liệu
            </Button>
          </div>
        }
      />

      <IngredientFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        suppliers={suppliers}
        ingredient={editing}
        categoryOptions={categoryOptions}
      />

      <ConfirmDialog
        open={Boolean(deactivating)}
        onOpenChange={(o) => !o && setDeactivating(null)}
        title="Ngừng sử dụng nguyên liệu?"
        description={
          deactivating
            ? `"${deactivating.name}" sẽ bị ẩn khỏi danh sách và các form chọn nguyên liệu. Lịch sử sổ kho vẫn được giữ nguyên.`
            : undefined
        }
        confirmLabel="Ngừng sử dụng"
        destructive
        onConfirm={async () => {
          if (deactivating) await toggleActive({ id: deactivating.id as string, isActive: false });
        }}
      />
    </>
  );
}
