"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { Trash2 } from "lucide-react";
import {
  ConfirmDialog,
  DataTable,
  DataTableColumnHeader,
  Money,
  StatusBadge,
} from "@/components/shared";
import { Button } from "@/components/ui/button";
import type { DataTableFilter } from "@/components/shared";
import { formatDate, formatVND } from "@/lib/format";
import { PAYMENT_METHOD_LABELS, PAYMENT_METHOD_OPTIONS } from "@/types/restaurant";
import { deleteSupplierPayment } from "@/server-actions/payments.actions";
import { useAction } from "@/hooks/use-action";
import type { SupplierPaymentRow } from "@/lib/queries/purchases.queries";

interface PaymentsTableProps {
  payments: SupplierPaymentRow[];
  hideSupplier?: boolean;
  toolbar?: React.ReactNode;
  emptyMessage?: string;
  /** Khi bảng nằm trong một phiếu nhập: cột số tiền hiển thị phần phân bổ cho phiếu đó. */
  scopePurchaseOrderId?: string;
}

export function PaymentsTable({
  payments,
  hideSupplier = false,
  toolbar,
  emptyMessage = "Chưa có phiếu chi nào.",
  scopePurchaseOrderId,
}: PaymentsTableProps) {
  const router = useRouter();
  const [target, setTarget] = useState<SupplierPaymentRow | null>(null);

  const { execute } = useAction<string, { id: string }>(deleteSupplierPayment, {
    successMessage: "Đã hoàn tác phiếu chi, công nợ được khôi phục",
    onSuccess: () => {
      setTarget(null);
      router.refresh();
    },
  });

  const columns = useMemo<ColumnDef<SupplierPaymentRow>[]>(() => {
    const cols: ColumnDef<SupplierPaymentRow>[] = [
      {
        accessorKey: "payment_date",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Ngày chi" />,
        cell: ({ row }) => (
          <span className="whitespace-nowrap">{formatDate(row.original.payment_date)}</span>
        ),
      },
      {
        accessorKey: "supplier_name",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Nhà cung cấp" />,
        filterFn: "equals",
        cell: ({ row }) => (
          <Link href={`/suppliers/${row.original.supplier_id}`} className="hover:underline">
            {row.original.supplier_name}
          </Link>
        ),
      },
      {
        accessorKey: "amount",
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={scopePurchaseOrderId ? "Phân bổ cho phiếu này" : "Số tiền"}
            align="right"
          />
        ),
        cell: ({ row }) => {
          if (!scopePurchaseOrderId) {
            return (
              <div className="text-right font-medium">
                <Money value={row.original.amount} />
              </div>
            );
          }
          const allocated = row.original.allocations
            .filter((a) => a.purchase_order_id === scopePurchaseOrderId)
            .reduce((sum, a) => sum + a.amount, 0);
          return (
            <div className="text-right">
              <div className="font-medium">
                <Money value={allocated} />
              </div>
              {allocated !== row.original.amount ? (
                <div className="text-xs text-muted-foreground">
                  Tổng phiếu chi {formatVND(row.original.amount)}
                </div>
              ) : null}
            </div>
          );
        },
      },
      {
        id: "allocations",
        header: () => <div>Phân bổ</div>,
        cell: ({ row }) => {
          const allocs = row.original.allocations;
          if (allocs.length === 0) {
            return <span className="text-xs text-muted-foreground">Chưa phân bổ</span>;
          }
          return (
            <div className="flex flex-wrap gap-1">
              {allocs.map((a) => (
                <Link key={`${a.purchase_order_id}-${a.amount}`} href={`/purchases/${a.purchase_order_id}`}>
                  <StatusBadge tone="info">
                    {a.po_number ?? "—"} · <Money value={a.amount} />
                  </StatusBadge>
                </Link>
              ))}
            </div>
          );
        },
      },
      {
        id: "mode",
        accessorFn: (row) => (row.purchase_order_id ? "specific" : "fifo"),
        header: ({ column }) => <DataTableColumnHeader column={column} title="Kiểu" align="center" />,
        filterFn: "equals",
        cell: ({ row }) => (
          <div className="text-center">
            <StatusBadge tone={row.original.purchase_order_id ? "primary" : "neutral"}>
              {row.original.purchase_order_id ? "Đích danh" : "Trừ dần"}
            </StatusBadge>
          </div>
        ),
      },
      {
        accessorKey: "method",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Hình thức" />,
        filterFn: "equals",
        cell: ({ row }) => (
          <span className="text-muted-foreground">{PAYMENT_METHOD_LABELS[row.original.method]}</span>
        ),
      },
      {
        accessorKey: "reference",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Chứng từ" />,
        cell: ({ row }) => (
          <span className="text-muted-foreground">{row.original.reference ?? "—"}</span>
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
              aria-label="Hoàn tác phiếu chi"
              onClick={(e) => {
                e.stopPropagation();
                setTarget(row.original);
              }}
            >
              <Trash2 className="size-4 text-destructive" />
            </Button>
          </div>
        ),
      },
    ];
    return hideSupplier ? cols.filter((c) => c.id !== "supplier_name" && !("accessorKey" in c && c.accessorKey === "supplier_name")) : cols;
  }, [hideSupplier, scopePurchaseOrderId]);

  const supplierOptions = useMemo(() => {
    const names = [...new Set(payments.map((p) => p.supplier_name))].sort((a, b) =>
      a.localeCompare(b, "vi")
    );
    return names.map((n) => ({ value: n, label: n }));
  }, [payments]);

  const filters = useMemo(() => {
    const list: DataTableFilter[] = [
      {
        columnId: "method",
        title: "Hình thức",
        options: PAYMENT_METHOD_OPTIONS.map((o) => ({ value: o.value, label: o.label })),
      },
      {
        columnId: "mode",
        title: "Kiểu phân bổ",
        options: [
          { value: "specific", label: "Đích danh" },
          { value: "fifo", label: "Trừ dần (FIFO)" },
        ],
      },
    ];
    if (!hideSupplier && supplierOptions.length > 1) {
      list.push({ columnId: "supplier_name", title: "Nhà cung cấp", options: supplierOptions });
    }
    return list;
  }, [hideSupplier, supplierOptions]);

  return (
    <>
      <DataTable
        columns={columns}
        data={payments}
        searchable
        searchPlaceholder="Tìm theo NCC, số chứng từ..."
        filters={filters}
        initialSorting={[{ id: "payment_date", desc: true }]}
        emptyMessage={emptyMessage}
        toolbar={toolbar}
      />
      <ConfirmDialog
        open={Boolean(target)}
        onOpenChange={(o) => !o && setTarget(null)}
        title="Hoàn tác phiếu chi?"
        description={
          target
            ? `Xóa phiếu chi ${formatVND(target.amount)} cho ${target.supplier_name}. Công nợ và trạng thái phiếu nhập sẽ được khôi phục.`
            : undefined
        }
        confirmLabel="Hoàn tác"
        destructive
        onConfirm={async () => {
          if (target) await execute(target.id);
        }}
      />
    </>
  );
}
