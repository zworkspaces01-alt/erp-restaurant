"use client";

import * as React from "react";
import {
  type ColumnDef,
  type ColumnFiltersState,
  type Row,
  type SortingState,
  type VisibilityState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { Search, SlidersHorizontal, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { normalizeVietnamese } from "@/lib/ai/invoice-matcher";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DataTablePagination } from "@/components/shared/data-table-pagination";

export interface DataTableFilterOption {
  label: string;
  value: string;
}

export interface DataTableFilter {
  /** Column id (accessorKey) to filter. The column must have `filterFn: "equals"` or rely on the default. */
  columnId: string;
  title: string;
  options: DataTableFilterOption[];
}

export interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  /** Show a global search box (searches every visible cell as text). */
  searchable?: boolean;
  searchPlaceholder?: string;
  /** Select-based exact-match filters rendered in the toolbar. */
  filters?: DataTableFilter[];
  /** Extra toolbar content (buttons, date pickers...). Rendered on the right. */
  toolbar?: React.ReactNode;
  /** Column visibility toggle menu. */
  columnToggle?: boolean;
  /** Vietnamese labels for the column toggle menu, keyed by column id. */
  columnLabels?: Record<string, string>;
  pageSize?: number;
  pageSizeOptions?: number[];
  initialSorting?: SortingState;
  initialColumnFilters?: ColumnFiltersState;
  emptyMessage?: string;
  onRowClick?: (row: TData) => void;
  rowClassName?: (row: Row<TData>) => string | undefined;
  className?: string;
  /** Hide the toolbar entirely (when there is nothing to show). */
  hideToolbar?: boolean;
  /** Hide pagination (small fixed lists). */
  hidePagination?: boolean;
}

function globalTextFilter<TData>(row: Row<TData>, _columnId: string, filterValue: string): boolean {
  const needle = filterValue.trim().toLowerCase();
  if (!needle) return true;
  const normNeedle = normalizeVietnamese(needle);

  const matchedCell = row.getAllCells().some((cell) => {
    const value = cell.getValue();
    if (value === null || value === undefined) return false;
    const s = String(value).toLowerCase();
    return s.includes(needle) || (normNeedle ? normalizeVietnamese(s).includes(normNeedle) : false);
  });
  if (matchedCell) return true;

  const original = row.original as Record<string, unknown> | undefined;
  if (original && Array.isArray(original.item_names)) {
    return original.item_names.some((name) => {
      if (typeof name !== "string") return false;
      const s = name.toLowerCase();
      return s.includes(needle) || (normNeedle ? normalizeVietnamese(s).includes(normNeedle) : false);
    });
  }

  return false;
}

export function DataTable<TData, TValue>({
  columns,
  data,
  searchable = true,
  searchPlaceholder = "Tìm kiếm...",
  filters,
  toolbar,
  columnToggle = false,
  columnLabels,
  pageSize = 20,
  pageSizeOptions = [10, 20, 50, 100],
  initialSorting = [],
  initialColumnFilters = [],
  emptyMessage = "Không có dữ liệu.",
  onRowClick,
  rowClassName,
  className,
  hideToolbar = false,
  hidePagination = false,
}: DataTableProps<TData, TValue>) {
  const [sorting, setSorting] = React.useState<SortingState>(initialSorting);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>(initialColumnFilters);
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({});
  const [globalFilter, setGlobalFilter] = React.useState("");

  const table = useReactTable({
    data,
    columns,
    state: { sorting, columnFilters, columnVisibility, globalFilter },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onGlobalFilterChange: setGlobalFilter,
    globalFilterFn: globalTextFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize } },
  });

  const hasActiveFilters = columnFilters.length > 0 || globalFilter.length > 0;
  const showToolbar = !hideToolbar && (searchable || (filters && filters.length > 0) || toolbar || columnToggle);

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {showToolbar && (
        <div className="flex flex-wrap items-center gap-2">
          {searchable && (
            <div className="relative w-full sm:w-64">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={globalFilter}
                onChange={(e) => table.setGlobalFilter(e.target.value)}
                placeholder={searchPlaceholder}
                className="pl-8"
                aria-label="Tìm kiếm trong bảng"
              />
            </div>
          )}
          {filters?.map((filter) => {
            const column = table.getColumn(filter.columnId);
            if (!column) return null;
            const current = column.getFilterValue();
            const value = typeof current === "string" ? current : "__all__";
            return (
              <Select
                key={filter.columnId}
                value={value}
                onValueChange={(v) => column.setFilterValue(v === "__all__" ? undefined : v)}
              >
                <SelectTrigger className="w-full sm:w-44" aria-label={filter.title}>
                  <SelectValue placeholder={filter.title} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">{filter.title}: Tất cả</SelectItem>
                  {filter.options.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            );
          })}
          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                table.resetColumnFilters();
                table.setGlobalFilter("");
              }}
            >
              Xóa lọc
              <X className="size-3.5" />
            </Button>
          )}
          <div className="ml-auto flex items-center gap-2">
            {toolbar}
            {columnToggle && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm">
                    <SlidersHorizontal className="size-3.5" />
                    Cột
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuLabel>Hiển thị cột</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {table
                    .getAllColumns()
                    .filter((c) => c.getCanHide())
                    .map((c) => (
                      <DropdownMenuCheckboxItem
                        key={c.id}
                        checked={c.getIsVisible()}
                        onCheckedChange={(v) => c.toggleVisibility(Boolean(v))}
                      >
                        {columnLabels?.[c.id] ?? c.id}
                      </DropdownMenuCheckboxItem>
                    ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>
      )}

      <div className="relative rounded-lg border bg-card shadow-2xs">
        <div className="overflow-x-auto overscroll-x-contain">
          <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id} style={{ width: header.getSize() !== 150 ? header.getSize() : undefined }}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() ? "selected" : undefined}
                  onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                  className={cn(onRowClick && "cursor-pointer", rowClassName?.(row))}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center text-muted-foreground">
                  {emptyMessage}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        </div>
      </div>

      {!hidePagination && <DataTablePagination table={table} pageSizeOptions={pageSizeOptions} />}
    </div>
  );
}
