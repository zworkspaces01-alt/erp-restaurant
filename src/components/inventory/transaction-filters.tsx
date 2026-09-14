"use client";

import { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { X } from "lucide-react";
import { INVENTORY_TXN_TYPE_OPTIONS } from "@/types/restaurant";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export interface IngredientFilterOption {
  id: string;
  name: string;
  code: string | null;
}

const ALL = "__all__";

export function TransactionFilters({ ingredients }: { ingredients: IngredientFilterOption[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const setParam = useCallback(
    (key: string, value: string | null) => {
      const params = new URLSearchParams(searchParams.toString());
      if (!value || value === ALL) params.delete(key);
      else params.set(key, value);
      router.replace(params.size ? `${pathname}?${params.toString()}` : pathname);
    },
    [pathname, router, searchParams]
  );

  const type = searchParams.get("type") ?? ALL;
  const ingredientId = searchParams.get("ingredient") ?? ALL;
  const from = searchParams.get("from") ?? "";
  const to = searchParams.get("to") ?? "";
  const hasFilters = [type, ingredientId].some((v) => v !== ALL) || Boolean(from) || Boolean(to);

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-lg border bg-card p-3">
      <div className="space-y-1.5">
        <Label htmlFor="filter-type">Loại giao dịch</Label>
        <Select value={type} onValueChange={(v) => setParam("type", v)}>
          <SelectTrigger id="filter-type" className="w-48">
            <SelectValue placeholder="Tất cả" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Tất cả loại</SelectItem>
            {INVENTORY_TXN_TYPE_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="filter-ingredient">Nguyên liệu</Label>
        <Select value={ingredientId} onValueChange={(v) => setParam("ingredient", v)}>
          <SelectTrigger id="filter-ingredient" className="w-60">
            <SelectValue placeholder="Tất cả" />
          </SelectTrigger>
          <SelectContent className="max-h-72">
            <SelectItem value={ALL}>Tất cả nguyên liệu</SelectItem>
            {ingredients.map((ing) => (
              <SelectItem key={ing.id} value={ing.id}>
                {ing.name}
                {ing.code ? ` (${ing.code})` : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="filter-from">Từ ngày</Label>
        <Input
          id="filter-from"
          type="date"
          className="w-40"
          value={from}
          onChange={(e) => setParam("from", e.target.value || null)}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="filter-to">Đến ngày</Label>
        <Input
          id="filter-to"
          type="date"
          className="w-40"
          value={to}
          onChange={(e) => setParam("to", e.target.value || null)}
        />
      </div>

      {hasFilters && (
        <Button variant="ghost" size="sm" onClick={() => router.replace(pathname)}>
          <X className="size-3.5" />
          Xóa lọc
        </Button>
      )}
    </div>
  );
}
