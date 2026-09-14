"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Filter, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { OrderStatus } from "@/types/restaurant";

interface OrdersDateFilterProps {
  from?: string;
  to?: string;
  status?: OrderStatus;
}

/** Lọc theo khoảng ngày (server-side qua query string). */
export function OrdersDateFilter({ from, to, status }: OrdersDateFilterProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [fromValue, setFromValue] = useState(from ?? "");
  const [toValue, setToValue] = useState(to ?? "");

  function apply(nextFrom: string, nextTo: string) {
    const params = new URLSearchParams();
    if (nextFrom) params.set("from", nextFrom);
    if (nextTo) params.set("to", nextTo);
    if (status) params.set("status", status);
    const qs = params.toString();
    startTransition(() => router.push(qs ? `/orders?${qs}` : "/orders"));
  }

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-lg border bg-card p-3">
      <div className="space-y-1.5">
        <Label htmlFor="orders-from" className="text-xs text-muted-foreground">
          Từ ngày
        </Label>
        <Input
          id="orders-from"
          type="date"
          value={fromValue}
          onChange={(e) => setFromValue(e.target.value)}
          className="w-40"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="orders-to" className="text-xs text-muted-foreground">
          Đến ngày
        </Label>
        <Input
          id="orders-to"
          type="date"
          value={toValue}
          onChange={(e) => setToValue(e.target.value)}
          className="w-40"
        />
      </div>
      <Button size="sm" onClick={() => apply(fromValue, toValue)} disabled={pending}>
        <Filter className="size-4" />
        Áp dụng
      </Button>
      {(from || to) && (
        <Button
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={() => {
            setFromValue("");
            setToValue("");
            apply("", "");
          }}
        >
          <X className="size-3.5" />
          Xóa lọc ngày
        </Button>
      )}
    </div>
  );
}
