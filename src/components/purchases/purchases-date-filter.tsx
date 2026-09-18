"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { Calendar, Filter, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { todayISO } from "@/lib/format";

interface PurchasesDateFilterProps {
  from?: string;
  to?: string;
}

function shiftDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + days);
  const ry = date.getFullYear();
  const rm = String(date.getMonth() + 1).padStart(2, "0");
  const rd = String(date.getDate()).padStart(2, "0");
  return `${ry}-${rm}-${rd}`;
}

export function PurchasesDateFilter({ from, to }: PurchasesDateFilterProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  const [fromValue, setFromValue] = useState(from ?? "");
  const [toValue, setToValue] = useState(to ?? "");

  const today = todayISO();
  const yesterday = shiftDays(today, -1);
  const sevenDaysAgo = shiftDays(today, -6);
  const currentMonthStart = `${today.slice(0, 7)}-01`;

  // Tính toán tháng trước
  const [currentYear, currentMonth] = today.split("-").map(Number);
  const lastMonthYear = currentMonth === 1 ? currentYear - 1 : currentYear;
  const lastMonthNum = currentMonth === 1 ? 12 : currentMonth - 1;
  const lastMonthStr = String(lastMonthNum).padStart(2, "0");
  const lastMonthStart = `${lastMonthYear}-${lastMonthStr}-01`;
  const lastMonthEndDay = new Date(lastMonthYear, lastMonthNum, 0).getDate();
  const lastMonthEnd = `${lastMonthYear}-${lastMonthStr}-${String(lastMonthEndDay).padStart(2, "0")}`;

  function apply(nextFrom: string, nextTo: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (nextFrom) {
      params.set("from", nextFrom);
    } else {
      params.delete("from");
    }

    if (nextTo) {
      params.set("to", nextTo);
    } else {
      params.delete("to");
    }

    setFromValue(nextFrom);
    setToValue(nextTo);

    const qs = params.toString();
    startTransition(() => {
      router.push(qs ? `/purchases?${qs}` : "/purchases");
    });
  }

  // Xác định preset hiện tại
  const isAll = !from && !to;
  const isToday = from === today && to === today;
  const isYesterday = from === yesterday && to === yesterday;
  const is7Days = from === sevenDaysAgo && to === today;
  const isThisMonth = from === currentMonthStart && (to === today || !to);
  const isLastMonth = from === lastMonthStart && to === lastMonthEnd;

  return (
    <div className="space-y-2.5 p-3 rounded-xl border bg-card/60 backdrop-blur-sm shadow-sm">
      {/* Quick Preset Buttons */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs font-medium text-muted-foreground mr-1 flex items-center gap-1">
          <Calendar className="size-3.5 text-primary" />
          Lọc nhanh:
        </span>
        <Button
          type="button"
          size="sm"
          variant={isAll ? "default" : "outline"}
          onClick={() => apply("", "")}
          disabled={pending}
          className="h-7 text-xs px-2.5"
        >
          Tất cả
        </Button>
        <Button
          type="button"
          size="sm"
          variant={isToday ? "default" : "outline"}
          onClick={() => apply(today, today)}
          disabled={pending}
          className="h-7 text-xs px-2.5"
        >
          Hôm nay
        </Button>
        <Button
          type="button"
          size="sm"
          variant={isYesterday ? "default" : "outline"}
          onClick={() => apply(yesterday, yesterday)}
          disabled={pending}
          className="h-7 text-xs px-2.5"
        >
          Hôm qua
        </Button>
        <Button
          type="button"
          size="sm"
          variant={is7Days ? "default" : "outline"}
          onClick={() => apply(sevenDaysAgo, today)}
          disabled={pending}
          className="h-7 text-xs px-2.5"
        >
          7 ngày qua
        </Button>
        <Button
          type="button"
          size="sm"
          variant={isThisMonth ? "default" : "outline"}
          onClick={() => apply(currentMonthStart, today)}
          disabled={pending}
          className="h-7 text-xs px-2.5"
        >
          Tháng này
        </Button>
        <Button
          type="button"
          size="sm"
          variant={isLastMonth ? "default" : "outline"}
          onClick={() => apply(lastMonthStart, lastMonthEnd)}
          disabled={pending}
          className="h-7 text-xs px-2.5"
        >
          Tháng trước
        </Button>
      </div>

      {/* Date Range Inputs */}
      <div className="flex flex-wrap items-end gap-3 pt-1 border-t">
        <div className="space-y-1">
          <Label htmlFor="purchases-from" className="text-xs text-muted-foreground font-medium">
            Từ ngày
          </Label>
          <Input
            id="purchases-from"
            type="date"
            value={fromValue}
            onChange={(e) => setFromValue(e.target.value)}
            className="h-8 w-38 text-xs"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="purchases-to" className="text-xs text-muted-foreground font-medium">
            Đến ngày
          </Label>
          <Input
            id="purchases-to"
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
          className="h-8 text-xs gap-1.5 font-medium"
        >
          <Filter className="size-3.5" />
          {pending ? "Đang lọc..." : "Áp dụng"}
        </Button>

        {(from || to) && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={pending}
            onClick={() => {
              setFromValue("");
              setToValue("");
              apply("", "");
            }}
            className="h-8 text-xs text-muted-foreground hover:text-foreground gap-1"
          >
            <X className="size-3.5" />
            Xóa lọc
          </Button>
        )}
      </div>
    </div>
  );
}
