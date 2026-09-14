"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { formatMonth } from "@/lib/format";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";

/** Bộ lọc tháng (YYYY-MM) ghi vào searchParams `month`. */
export function MonthFilter({ month }: { month: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function onChange(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set("month", value);
    else params.delete("month");
    router.push(`/expenses?${params.toString()}`);
  }

  return (
    <div className="flex items-center gap-2">
      <Label htmlFor="expense-month" className="text-sm text-muted-foreground">
        Kỳ chi phí
      </Label>
      <Input
        id="expense-month"
        type="month"
        value={month}
        onChange={(e) => onChange(e.target.value)}
        className="w-40"
        aria-label={`Kỳ chi phí ${formatMonth(`${month}-01`)}`}
      />
    </div>
  );
}
