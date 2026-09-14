"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type TimekeepingView = "day" | "month";

interface TimekeepingFiltersProps {
  view: TimekeepingView;
  /** `yyyy-MM-dd` khi xem theo ngày, `yyyy-MM` khi xem theo tháng. */
  value: string;
}

export function TimekeepingFilters({ view, value }: TimekeepingFiltersProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  function push(nextView: TimekeepingView, nextValue: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("view", nextView);
    params.set("date", nextValue);
    startTransition(() => router.push(`/timekeeping?${params.toString()}`));
  }

  return (
    <div className="flex flex-wrap items-center gap-2" data-pending={pending ? "" : undefined}>
      <Select
        value={view}
        onValueChange={(v) =>
          push(
            v as TimekeepingView,
            v === "month" ? value.slice(0, 7) : `${value.slice(0, 7)}-01`
          )
        }
      >
        <SelectTrigger className="w-[140px]" aria-label="Kiểu xem">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="day">Theo ngày</SelectItem>
          <SelectItem value="month">Theo tháng</SelectItem>
        </SelectContent>
      </Select>
      <Input
        type={view === "month" ? "month" : "date"}
        value={value}
        aria-label={view === "month" ? "Chọn tháng" : "Chọn ngày"}
        className="w-[170px]"
        onChange={(e) => {
          if (e.target.value) push(view, e.target.value);
        }}
      />
    </div>
  );
}
