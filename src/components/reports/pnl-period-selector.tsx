"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface PnlPeriodSelectorProps {
  kind: "month" | "quarter";
  year: number;
  index: number;
  /** Years offered in the year select (descending). */
  years: number[];
}

const MONTH_OPTIONS = Array.from({ length: 12 }, (_, i) => ({
  value: String(i + 1),
  label: `Tháng ${i + 1}`,
}));

const QUARTER_OPTIONS = Array.from({ length: 4 }, (_, i) => ({
  value: String(i + 1),
  label: `Quý ${i + 1}`,
}));

export function PnlPeriodSelector({ kind, year, index, years }: PnlPeriodSelectorProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = React.useTransition();

  const push = React.useCallback(
    (next: { kind?: string; year?: string; period?: string }) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("kind", next.kind ?? kind);
      params.set("year", next.year ?? String(year));
      params.set("period", next.period ?? String(index));
      if (next.kind && next.kind !== kind) params.set("period", "1");
      startTransition(() => router.push(`/reports/pnl?${params.toString()}`));
    },
    [index, kind, router, searchParams, year]
  );

  const periodOptions = kind === "quarter" ? QUARTER_OPTIONS : MONTH_OPTIONS;

  return (
    <div className="flex flex-wrap items-end gap-3" data-pending={isPending ? "" : undefined}>
      <div className="grid gap-1.5">
        <Label htmlFor="pnl-kind" className="text-xs text-muted-foreground">
          Kỳ báo cáo
        </Label>
        <Select value={kind} onValueChange={(value) => push({ kind: value })}>
          <SelectTrigger id="pnl-kind" size="sm" className="w-[130px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="month">Theo tháng</SelectItem>
            <SelectItem value="quarter">Theo quý</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="pnl-period" className="text-xs text-muted-foreground">
          {kind === "quarter" ? "Quý" : "Tháng"}
        </Label>
        <Select value={String(index)} onValueChange={(value) => push({ period: value })}>
          <SelectTrigger id="pnl-period" size="sm" className="w-[120px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {periodOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="pnl-year" className="text-xs text-muted-foreground">
          Năm
        </Label>
        <Select value={String(year)} onValueChange={(value) => push({ year: value })}>
          <SelectTrigger id="pnl-year" size="sm" className="w-[110px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {years.map((y) => (
              <SelectItem key={y} value={String(y)}>
                {y}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
