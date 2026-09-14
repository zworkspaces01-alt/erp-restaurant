"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ClipboardCheck, Eraser } from "lucide-react";
import { recordStocktakeSheet } from "@/server-actions/inventory.actions";
import { toTxnTimestamp } from "@/components/inventory/adjustment-schema";
import type { StocktakeSheetInput } from "@/components/inventory/adjustment-schema";
import { useAction } from "@/hooks/use-action";
import { FormServerError, SubmitButton } from "@/components/shared";
import { formatNumber, formatVND, todayISO } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export interface StocktakeRow {
  id: string;
  code: string | null;
  name: string;
  category: string | null;
  base_unit: string;
  current_stock: number;
  avg_cost_price: number;
}

interface Variance {
  row: StocktakeRow;
  counted: number;
  delta: number;
  value: number;
}

export function StocktakeSheet({ rows }: { rows: StocktakeRow[] }) {
  const router = useRouter();
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [txnAt, setTxnAt] = useState(todayISO());
  const [note, setNote] = useState("");
  const [search, setSearch] = useState("");

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      `${r.name} ${r.code ?? ""} ${r.category ?? ""}`.toLowerCase().includes(q)
    );
  }, [rows, search]);

  const variances = useMemo<Variance[]>(() => {
    const out: Variance[] = [];
    for (const row of rows) {
      const raw = counts[row.id];
      if (raw === undefined || raw.trim() === "") continue;
      const counted = Number(raw);
      if (!Number.isFinite(counted) || counted < 0) continue;
      const delta = Number((counted - row.current_stock).toFixed(3));
      if (delta === 0) continue;
      out.push({ row, counted, delta, value: delta * row.avg_cost_price });
    }
    return out;
  }, [rows, counts]);

  const totalValue = variances.reduce((s, v) => s + v.value, 0);

  const { execute, pending, error } = useAction<StocktakeSheetInput, { recorded: number; skipped: number }>(
    recordStocktakeSheet,
    {
      successMessage: (data) =>
        data.recorded > 0
          ? `Đã ghi ${data.recorded} dòng chênh lệch`
          : "Số đếm khớp sổ, không phát sinh giao dịch",
      onSuccess: () => {
        setCounts({});
        setNote("");
        router.refresh();
      },
    }
  );

  const submit = () => {
    if (variances.length === 0) return;
    void execute({
      txn_at: toTxnTimestamp(txnAt, todayISO()) ?? txnAt,
      note: note.trim() === "" ? undefined : note.trim(),
      lines: variances.map((v) => ({ ingredient_id: v.row.id, counted: v.counted })),
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Kiểm kê hàng loạt</CardTitle>
        <CardDescription>
          Nhập số đếm thực tế cho từng nguyên liệu. Chỉ những dòng lệch với tồn sổ được ghi nhận.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="sheet-date">Ngày kiểm kê *</Label>
            <Input
              id="sheet-date"
              type="date"
              max={todayISO()}
              value={txnAt}
              onChange={(e) => setTxnAt(e.target.value)}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="sheet-search">Tìm nguyên liệu</Label>
            <Input
              id="sheet-search"
              placeholder="Tên, mã hoặc nhóm..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        <div className="max-h-[28rem] overflow-auto rounded-lg border">
          <Table>
            <TableHeader className="sticky top-0 bg-card">
              <TableRow>
                <TableHead>Nguyên liệu</TableHead>
                <TableHead className="text-right">Tồn sổ</TableHead>
                <TableHead className="w-32 text-right">Số đếm</TableHead>
                <TableHead className="text-right">Chênh lệch</TableHead>
                <TableHead className="text-right">Giá trị lệch</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((row) => {
                const raw = counts[row.id] ?? "";
                const counted = Number(raw);
                const hasCount = raw.trim() !== "" && Number.isFinite(counted);
                const delta = hasCount ? Number((counted - row.current_stock).toFixed(3)) : null;
                return (
                  <TableRow key={row.id}>
                    <TableCell>
                      <div className="font-medium">{row.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {row.code ?? "—"} · {row.base_unit}
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatNumber(row.current_stock, 3)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Input
                        type="number"
                        step="any"
                        min={0}
                        inputMode="decimal"
                        aria-label={`Số đếm ${row.name}`}
                        className="h-8 text-right tabular-nums"
                        value={raw}
                        onChange={(e) =>
                          setCounts((c) => ({ ...c, [row.id]: e.target.value }))
                        }
                      />
                    </TableCell>
                    <TableCell
                      className={cn(
                        "text-right tabular-nums",
                        delta === null || delta === 0
                          ? "text-muted-foreground"
                          : delta < 0
                            ? "text-destructive"
                            : "text-emerald-600 dark:text-emerald-400"
                      )}
                    >
                      {delta === null ? "—" : `${delta > 0 ? "+" : ""}${formatNumber(delta, 3)}`}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {delta === null || delta === 0
                        ? "—"
                        : formatVND(delta * row.avg_cost_price)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="sheet-note">Ghi chú chung</Label>
          <Textarea
            id="sheet-note"
            rows={2}
            placeholder="Vd: kiểm kê cuối tháng"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>

        <FormServerError message={error} />

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/40 p-3">
          <div className="text-sm">
            <span className="text-muted-foreground">Số dòng chênh lệch: </span>
            <span className="font-semibold tabular-nums">{variances.length}</span>
            <span className="mx-2 text-muted-foreground">·</span>
            <span className="text-muted-foreground">Giá trị chênh lệch: </span>
            <span
              className={cn(
                "font-semibold tabular-nums",
                totalValue < 0 ? "text-destructive" : "text-emerald-600 dark:text-emerald-400"
              )}
            >
              {formatVND(totalValue)}
            </span>
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setCounts({})}
              disabled={pending || Object.keys(counts).length === 0}
            >
              <Eraser className="size-4" />
              Xóa số đếm
            </Button>
            <SubmitButton
              type="button"
              pending={pending}
              pendingText="Đang ghi nhận..."
              disabled={variances.length === 0}
              onClick={submit}
            >
              <ClipboardCheck className="size-4" />
              Ghi nhận kiểm kê
            </SubmitButton>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
