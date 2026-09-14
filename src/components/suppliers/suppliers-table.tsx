"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { Pencil, Plus } from "lucide-react";
import { DataTable, DataTableColumnHeader, Money, StatusBadge } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/format";
import { paymentTermLabel } from "@/types/restaurant";
import type { SupplierDebtRow } from "@/lib/queries/purchases.queries";
import { SupplierFormDialog, type SupplierFormData } from "./supplier-form-dialog";

interface SuppliersTableProps {
  rows: SupplierDebtRow[];
  details: SupplierFormData[];
}

export function SuppliersTable({ rows, details }: SuppliersTableProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<SupplierFormData | null>(null);

  const detailById = useMemo(
    () => new Map(details.map((d) => [d.id, d])),
    [details]
  );

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
          <div className="text-right">
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Sửa ${row.original.name}`}
              onClick={(e) => {
                e.stopPropagation();
                setEditing(detailById.get(row.original.id) ?? null);
                setOpen(true);
              }}
            >
              <Pencil className="size-4" />
            </Button>
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
        }
      />
      <SupplierFormDialog open={open} onOpenChange={setOpen} supplier={editing} />
    </>
  );
}
