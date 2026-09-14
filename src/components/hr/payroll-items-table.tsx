"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { toast } from "sonner";
import {
  EMPLOYMENT_TYPE_LABELS,
  EMPLOYMENT_TYPE_OPTIONS,
  type PayrollItemAdjustInput,
  type PayrollStatus,
} from "@/types/restaurant";
import type { PayrollItemRow } from "@/lib/queries/hr.queries";
import { adjustPayrollItem } from "@/server-actions/hr.actions";
import { formatNumber, formatVND } from "@/lib/format";
import { DataTable, DataTableColumnHeader, StatusBadge } from "@/components/shared";
import { Input } from "@/components/ui/input";

type AdjustField = "bonus" | "tips" | "advance_deduction" | "penalty";

const ADJUST_FIELDS: AdjustField[] = ["bonus", "tips", "advance_deduction", "penalty"];

interface Draftable {
  bonus: number;
  tips: number;
  advance_deduction: number;
  penalty: number;
}

function toDraft(item: PayrollItemRow): Draftable {
  return {
    bonus: Number(item.bonus),
    tips: Number(item.tips),
    advance_deduction: Number(item.advance_deduction),
    penalty: Number(item.penalty),
  };
}

interface PayrollItemsTableProps {
  items: PayrollItemRow[];
  status: PayrollStatus;
}

export function PayrollItemsTable({ items, status }: PayrollItemsTableProps) {
  const router = useRouter();
  const editable = status === "draft";
  const [drafts, setDrafts] = useState<Record<string, Draftable>>(() =>
    Object.fromEntries(items.map((i) => [i.id, toDraft(i)]))
  );
  const [saving, setSaving] = useState<string | null>(null);

  // Sau khi "Tính lương" chạy lại `generate_payroll` (router.refresh), server trả
  // dòng lương mới -> đồng bộ lại bản nháp để input không giữ số cũ.
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const itemsKey = useMemo(
    () =>
      items
        .map((i) => `${i.id}:${i.bonus}:${i.tips}:${i.advance_deduction}:${i.penalty}`)
        .join("|"),
    [items]
  );
  useEffect(() => {
    setDrafts(Object.fromEntries(itemsRef.current.map((i) => [i.id, toDraft(i)])));
  }, [itemsKey]);

  const valueOf = useCallback(
    (item: PayrollItemRow, field: AdjustField): number => drafts[item.id]?.[field] ?? Number(item[field]),
    [drafts]
  );

  const netOf = useCallback(
    (item: PayrollItemRow): number => {
      const d = drafts[item.id] ?? toDraft(item);
      return (
        Number(item.base_pay) + Number(item.allowance) + d.bonus + d.tips - d.advance_deduction - d.penalty
      );
    },
    [drafts]
  );

  const commit = useCallback(
    async (item: PayrollItemRow) => {
      const draft = drafts[item.id] ?? toDraft(item);
      const original = toDraft(item);
      const unchanged = ADJUST_FIELDS.every((f) => draft[f] === original[f]);
      if (unchanged) return;

      const payload: PayrollItemAdjustInput = { ...draft, note: item.note };
      setSaving(item.id);
      const result = await adjustPayrollItem(item.id, payload);
      setSaving(null);

      if (!result.success) {
        toast.error(result.error);
        setDrafts((prev) => ({ ...prev, [item.id]: original }));
        return;
      }
      toast.success("Đã cập nhật dòng lương");
      router.refresh();
    },
    [drafts, router]
  );

  const adjustColumn = useCallback(
    (field: AdjustField, title: string, tone?: "destructive"): ColumnDef<PayrollItemRow> => ({
      id: field,
      accessorFn: (row) => Number(row[field]),
      header: ({ column }) => <DataTableColumnHeader column={column} title={title} />,
      cell: ({ row }) => {
        const item = row.original;
        if (!editable) {
          return (
            <span className={`tabular-nums ${tone === "destructive" ? "text-destructive" : ""}`}>
              {formatVND(item[field])}
            </span>
          );
        }
        return (
          <Input
            type="number"
            min={0}
            step={1000}
            aria-label={`${title} — ${item.employees?.full_name ?? ""}`}
            className="h-8 w-28 text-right tabular-nums"
            disabled={saving === item.id}
            value={valueOf(item, field)}
            onChange={(e) =>
              setDrafts((prev) => ({
                ...prev,
                [item.id]: { ...(prev[item.id] ?? toDraft(item)), [field]: Number(e.target.value) || 0 },
              }))
            }
            onBlur={() => void commit(item)}
          />
        );
      },
    }),
    [commit, editable, saving, valueOf]
  );

  const columns = useMemo<ColumnDef<PayrollItemRow>[]>(
    () => [
      {
        id: "employee",
        accessorFn: (row) => row.employees?.full_name ?? "",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Nhân viên" />,
        cell: ({ row }) => {
          const emp = row.original.employees;
          if (!emp) return <span className="text-muted-foreground">—</span>;
          return (
            <div className="min-w-[9rem]">
              <Link href={`/employees/${emp.id}`} className="font-medium hover:underline">
                {emp.full_name}
              </Link>
              <p className="text-xs text-muted-foreground">{emp.position ?? "—"}</p>
            </div>
          );
        },
      },
      {
        accessorKey: "employment_type",
        filterFn: "equals",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Loại HĐ" />,
        cell: ({ row }) => (
          <StatusBadge tone={row.original.employment_type === "full_time" ? "info" : "neutral"}>
            {EMPLOYMENT_TYPE_LABELS[row.original.employment_type]}
          </StatusBadge>
        ),
      },
      {
        id: "worked",
        accessorFn: (row) =>
          row.employment_type === "full_time" ? Number(row.total_days) : Number(row.total_hours),
        header: ({ column }) => <DataTableColumnHeader column={column} title="Công / Giờ" />,
        cell: ({ row }) => (
          <span className="tabular-nums">
            {row.original.employment_type === "full_time"
              ? `${formatNumber(row.original.total_days, 1)} công`
              : `${formatNumber(row.original.total_hours, 1)} giờ`}
          </span>
        ),
      },
      {
        accessorKey: "base_pay",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Lương cơ bản" />,
        cell: ({ row }) => <span className="tabular-nums">{formatVND(row.original.base_pay)}</span>,
      },
      {
        accessorKey: "allowance",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Phụ cấp" />,
        cell: ({ row }) => <span className="tabular-nums">{formatVND(row.original.allowance)}</span>,
      },
      adjustColumn("bonus", "Thưởng"),
      adjustColumn("tips", "Tip"),
      adjustColumn("advance_deduction", "Tạm ứng", "destructive"),
      adjustColumn("penalty", "Khấu trừ", "destructive"),
      {
        id: "net_pay",
        accessorFn: (row) => Number(row.net_pay),
        header: ({ column }) => <DataTableColumnHeader column={column} title="Thực nhận" />,
        cell: ({ row }) => (
          <span className="font-semibold tabular-nums">{formatVND(netOf(row.original))}</span>
        ),
      },
      {
        id: "is_paid",
        accessorFn: (row) => (row.is_paid ? "paid" : "unpaid"),
        filterFn: "equals",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Chi trả" />,
        cell: ({ row }) =>
          row.original.is_paid ? (
            <StatusBadge tone="success" dot>
              Đã chi
            </StatusBadge>
          ) : (
            <StatusBadge tone="neutral" dot>
              Chưa chi
            </StatusBadge>
          ),
      },
    ],
    [adjustColumn, netOf]
  );

  return (
    <DataTable
      columns={columns}
      data={items}
      searchable
      searchPlaceholder="Tìm nhân viên trong bảng lương..."
      filters={[
        {
          columnId: "employment_type",
          title: "Loại hợp đồng",
          options: EMPLOYMENT_TYPE_OPTIONS.map((o) => ({ label: o.label, value: o.value })),
        },
        {
          columnId: "is_paid",
          title: "Chi trả",
          options: [
            { label: "Đã chi", value: "paid" },
            { label: "Chưa chi", value: "unpaid" },
          ],
        },
      ]}
      emptyMessage='Chưa có dòng lương nào. Bấm "Tính lương" để tạo từ chấm công.'
      initialSorting={[{ id: "employee", desc: false }]}
      pageSize={50}
    />
  );
}
