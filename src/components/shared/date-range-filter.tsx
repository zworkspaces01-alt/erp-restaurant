"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { Calendar, Filter, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { todayISO } from "@/lib/format";

interface DateRangeFilterProps {
  from?: string;
  to?: string;
  /** Tiền tố id cho các input (tránh trùng khi có nhiều bộ lọc trên một trang). */
  idPrefix?: string;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function shiftDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** "2026-09" -> ["2026-09-01", "2026-09-30"] */
function monthRange(month: string): [string, string] {
  const [y, m] = month.split("-").map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  return [`${month}-01`, `${month}-${pad(lastDay)}`];
}

function previousMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${pad(m - 1)}`;
}

/**
 * Lọc theo ngày / tháng / khoảng ngày — ghi vào searchParams `from`, `to`
 * của route hiện tại (giữ nguyên các param khác). Page đọc lại và lọc server-side.
 */
export function DateRangeFilter({ from, to, idPrefix = "range" }: DateRangeFilterProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  const [fromValue, setFromValue] = useState(from ?? "");
  const [toValue, setToValue] = useState(to ?? "");

  const today = todayISO();
  const yesterday = shiftDays(today, -1);
  const sevenDaysAgo = shiftDays(today, -6);
  const thisMonth = today.slice(0, 7);
  const thisMonthStart = `${thisMonth}-01`;
  const [lastMonthStart, lastMonthEnd] = monthRange(previousMonth(thisMonth));

  /** Khoảng ngày của một tháng; tháng hiện tại chỉ tính đến hôm nay. */
  function rangeOfMonth(month: string): [string, string] {
    const [start, end] = monthRange(month);
    return [start, month === thisMonth ? today : end];
  }

  // Ô "Chọn tháng" chỉ hiện giá trị khi khoảng đang lọc đúng trọn một tháng.
  const fromMonth = from?.slice(0, 7) ?? "";
  const selectedMonth =
    fromMonth && rangeOfMonth(fromMonth)[0] === from && rangeOfMonth(fromMonth)[1] === to ? fromMonth : "";

  function apply(nextFrom: string, nextTo: string) {
    // Người dùng nhập ngược thì tự đảo lại.
    const [f, t] = nextFrom && nextTo && nextFrom > nextTo ? [nextTo, nextFrom] : [nextFrom, nextTo];
    const params = new URLSearchParams(searchParams.toString());
    if (f) params.set("from", f);
    else params.delete("from");
    if (t) params.set("to", t);
    else params.delete("to");

    setFromValue(f);
    setToValue(t);

    const qs = params.toString();
    startTransition(() => router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  }

  const presets: { label: string; active: boolean; range: [string, string] }[] = [
    { label: "Tất cả", active: !from && !to, range: ["", ""] },
    { label: "Hôm nay", active: from === today && to === today, range: [today, today] },
    { label: "Hôm qua", active: from === yesterday && to === yesterday, range: [yesterday, yesterday] },
    { label: "7 ngày qua", active: from === sevenDaysAgo && to === today, range: [sevenDaysAgo, today] },
    { label: "Tháng này", active: from === thisMonthStart && to === today, range: [thisMonthStart, today] },
    {
      label: "Tháng trước",
      active: from === lastMonthStart && to === lastMonthEnd,
      range: [lastMonthStart, lastMonthEnd],
    },
  ];

  return (
    <div className="space-y-2.5 rounded-xl border bg-card/60 p-3 shadow-sm">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 flex items-center gap-1 text-xs font-medium text-muted-foreground">
          <Calendar className="size-3.5 text-primary" />
          Lọc nhanh:
        </span>
        {presets.map((p) => (
          <Button
            key={p.label}
            type="button"
            size="sm"
            variant={p.active ? "default" : "outline"}
            onClick={() => apply(p.range[0], p.range[1])}
            disabled={pending}
            className="h-7 px-2.5 text-xs"
          >
            {p.label}
          </Button>
        ))}
      </div>

      <div className="flex flex-wrap items-end gap-3 border-t pt-2">
        <div className="space-y-1">
          <Label htmlFor={`${idPrefix}-month`} className="text-xs font-medium text-muted-foreground">
            Chọn tháng
          </Label>
          <Input
            id={`${idPrefix}-month`}
            type="month"
            value={selectedMonth}
            max={thisMonth}
            onChange={(e) => {
              const month = e.target.value;
              if (!month) return apply("", "");
              const [start, end] = rangeOfMonth(month);
              apply(start, end);
            }}
            disabled={pending}
            className="h-8 w-40 text-xs"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${idPrefix}-from`} className="text-xs font-medium text-muted-foreground">
            Từ ngày
          </Label>
          <Input
            id={`${idPrefix}-from`}
            type="date"
            value={fromValue}
            onChange={(e) => setFromValue(e.target.value)}
            className="h-8 w-38 text-xs"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${idPrefix}-to`} className="text-xs font-medium text-muted-foreground">
            Đến ngày
          </Label>
          <Input
            id={`${idPrefix}-to`}
            type="date"
            value={toValue}
            onChange={(e) => setToValue(e.target.value)}
            className="h-8 w-38 text-xs"
          />
        </div>
        <Button
          type="button"
          size="sm"
          onClick={() => apply(fromValue, toValue)}
          disabled={pending}
          className="h-8 gap-1.5 text-xs font-medium"
        >
          <Filter className="size-3.5" />
          {pending ? "Đang lọc..." : "Áp dụng"}
        </Button>
        {from || to ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={pending}
            onClick={() => apply("", "")}
            className="h-8 gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <X className="size-3.5" />
            Xóa lọc
          </Button>
        ) : null}
      </div>
    </div>
  );
}
