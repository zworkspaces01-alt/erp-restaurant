"use client";

import { useMemo, useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { Pencil, Plus, Trash2, Merge } from "lucide-react";
import { DataTable, DataTableColumnHeader, Money, StatusBadge } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatDate } from "@/lib/format";
import { paymentTermLabel } from "@/types/restaurant";
import type { SupplierDebtRow } from "@/lib/queries/purchases.queries";
import { SupplierFormDialog, type SupplierFormData } from "./supplier-form-dialog";
import { SupplierDeleteDialog, type SupplierDeleteData } from "./supplier-delete-dialog";
import { SupplierMergeDialog } from "./supplier-merge-dialog";
import { getDuplicateSupplierCandidates } from "@/server-actions/purchases.actions";

interface SuppliersTableProps {
  rows: SupplierDebtRow[];
  details: SupplierFormData[];
}

export function SuppliersTable({ rows, details }: SuppliersTableProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<SupplierFormData | null>(null);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletingSupplier, setDeletingSupplier] = useState<SupplierDeleteData | null>(null);

  const [mergeOpen, setMergeOpen] = useState(false);
  const [mergeSourceId, setMergeSourceId] = useState<string | undefined>(undefined);
  const [duplicateCount, setDuplicateCount] = useState<number>(0);

  const detailById = useMemo(
    () => new Map(details.map((d) => [d.id, d])),
    [details]
  );

  // Scan for duplicate candidates on mount
  useEffect(() => {
    getDuplicateSupplierCandidates()
      .then((pairs) => setDuplicateCount(pairs.length))
      .catch((err) => console.error("Error loading duplicates:", err));
  }, [rows]);

  const columns = useMemo<ColumnDef<SupplierDebtRow>[]>(
    () => [
      {
        accessorKey: "name",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Nhà cung cấp" />,
        cell: ({ row }) => (
          <div className="min-w-40">
            <Link
              href={`/suppliers/${row.original.id}`}
              className="font-medium text-primary hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              {row.original.name}
            </Link>
            {row.original.code ? (
              <div className="font-mono text-xs text-muted-foreground">{row.original.code}</div>
            ) : null}
          </div>
        ),
      },
      {
        accessorKey: "phone",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Liên hệ" />,
        cell: ({ row }) => {
          const contact = detailById.get(row.original.id)?.contact_name ?? null;
          return (
            <div className="min-w-32">
              <div>{contact ?? "—"}</div>
              <div className="text-xs text-muted-foreground">{row.original.phone ?? "—"}</div>
            </div>
          );
        },
      },
      {
        id: "terms",
        accessorFn: (row) => String(row.payment_terms_days),
        header: ({ column }) => <DataTableColumnHeader column={column} title="Điều khoản" />,
        filterFn: "equals",
        cell: ({ row }) => (
          <span className="whitespace-nowrap">
            {paymentTermLabel(row.original.payment_terms_days)}
          </span>
        ),
      },
      {
        accessorKey: "current_debt",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Công nợ hiện tại" align="right" />
        ),
        cell: ({ row }) => (
          <div className="text-right font-medium">
            <Money value={row.original.current_debt} />
          </div>
        ),
      },
      {
        accessorKey: "overdue_debt",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Nợ quá hạn" align="right" />
        ),
        cell: ({ row }) =>
          row.original.overdue_debt > 0 ? (
            <div className="flex justify-end">
              <StatusBadge tone="danger" dot>
                <Money value={row.original.overdue_debt} />
              </StatusBadge>
            </div>
          ) : (
            <div className="text-right text-muted-foreground">—</div>
          ),
      },
      {
        accessorKey: "next_due_date",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Hạn gần nhất" />,
        cell: ({ row }) => (
          <span className="whitespace-nowrap text-muted-foreground">
            {row.original.next_due_date ? formatDate(row.original.next_due_date) : "—"}
          </span>
        ),
      },
      {
        id: "actions",
        header: () => <div className="text-right">Thao tác</div>,
        cell: ({ row }) => (
          <div className="flex items-center justify-end gap-1">
            {/* Sửa NCC */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8 text-muted-foreground hover:text-foreground"
                  aria-label={`Sửa ${row.original.name}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditing(detailById.get(row.original.id) ?? null);
                    setOpen(true);
                  }}
                >
                  <Pencil className="size-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">Sửa thông tin</TooltipContent>
            </Tooltip>

            {/* Gộp NCC */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8 text-muted-foreground hover:text-primary"
                  aria-label={`Gộp ${row.original.name}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setMergeSourceId(row.original.id);
                    setMergeOpen(true);
                  }}
                >
                  <Merge className="size-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">Gộp vào NCC khác...</TooltipContent>
            </Tooltip>

            {/* Xóa NCC */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8 text-muted-foreground hover:text-destructive"
                  aria-label={`Xóa ${row.original.name}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setDeletingSupplier({
                      id: row.original.id,
                      name: row.original.name,
                      code: row.original.code,
                      current_debt: row.original.current_debt,
                      po_count: row.original.po_count,
                      is_active: row.original.is_active,
                    });
                    setDeleteOpen(true);
                  }}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">Xóa / Ngừng hợp tác</TooltipContent>
            </Tooltip>
          </div>
        ),
      },
    ],
    [detailById]
  );

  const termOptions = useMemo(() => {
    const values = [...new Set(rows.map((r) => r.payment_terms_days))].sort((a, b) => a - b);
    return values.map((v) => ({ value: String(v), label: paymentTermLabel(v) }));
  }, [rows]);

  return (
    <>
      <DataTable
        columns={columns}
        data={rows}
        searchable
        searchPlaceholder="Tìm theo tên, mã, số điện thoại..."
        filters={termOptions.length > 1 ? [{ columnId: "terms", title: "Điều khoản", options: termOptions }] : undefined}
        initialSorting={[{ id: "current_debt", desc: true }]}
        emptyMessage="Chưa có nhà cung cấp nào."
        onRowClick={(row) => router.push(`/suppliers/${row.id}`)}
        rowClassName={(row) => (row.original.is_active ? undefined : "opacity-60")}
        toolbar={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 border-primary/20 bg-primary/5 hover:bg-primary/10 text-primary"
              onClick={() => {
                setMergeSourceId(undefined);
                setMergeOpen(true);
              }}
            >
              <Merge className="size-3.5" />
              <span>Gộp NCC trùng lặp</span>
              {duplicateCount > 0 && (
                <Badge variant="secondary" className="px-1.5 py-0 h-4 text-[10px] bg-primary/20 text-primary font-semibold">
                  {duplicateCount}
                </Badge>
              )}
            </Button>

            <Button
              size="sm"
              onClick={() => {
                setEditing(null);
                setOpen(true);
              }}
            >
              <Plus className="mr-1.5 size-4" />
              Thêm nhà cung cấp
            </Button>
          </div>
        }
      />

      {/* Dialogs */}
      <SupplierFormDialog open={open} onOpenChange={setOpen} supplier={editing} />
      <SupplierDeleteDialog open={deleteOpen} onOpenChange={setDeleteOpen} supplier={deletingSupplier} />
      <SupplierMergeDialog
        open={mergeOpen}
        onOpenChange={setMergeOpen}
        suppliers={rows}
        preselectedSourceId={mergeSourceId}
      />
    </>
  );
}
