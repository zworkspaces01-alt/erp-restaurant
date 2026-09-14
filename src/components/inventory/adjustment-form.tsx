"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronsUpDown, Save } from "lucide-react";
import { Controller, useForm, useWatch } from "react-hook-form";
import type { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { STOCK_ADJUSTMENT_TYPE_OPTIONS } from "@/types/restaurant";
import {
  stockAdjustmentWithDateSchema,
  type StockAdjustmentWithDateInput,
} from "@/components/inventory/adjustment-schema";
import { recordStockAdjustment } from "@/server-actions/inventory.actions";
import { useAction } from "@/hooks/use-action";
import { FormError, FormServerError, SubmitButton } from "@/components/shared";
import { formatNumber, todayISO } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export interface AdjustmentIngredient {
  id: string;
  code: string | null;
  name: string;
  base_unit: string;
  current_stock: number;
  category: string | null;
}

type FormValues = z.input<typeof stockAdjustmentWithDateSchema>;

const HINTS: Record<string, string> = {
  waste: "Nhập số lượng bị hao hụt (> 0). Giá trị hao hụt được tính vào giá vốn.",
  adjustment: "Nhập chênh lệch có dấu: số dương là tăng kho, số âm là giảm kho.",
  stocktake: "Nhập số lượng ĐẾM ĐƯỢC thực tế. Hệ thống tự ghi nhận chênh lệch so với sổ.",
};

export function AdjustmentForm({ ingredients }: { ingredients: AdjustmentIngredient[] }) {
  const router = useRouter();
  const [pickerOpen, setPickerOpen] = useState(false);

  const {
    control,
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues, unknown, StockAdjustmentWithDateInput>({
    resolver: zodResolver(stockAdjustmentWithDateSchema),
    defaultValues: { ingredient_id: "", txn_type: "waste", quantity: 0, note: "", txn_at: todayISO() },
  });

  const ingredientId = useWatch({ control, name: "ingredient_id" });
  const txnType = useWatch({ control, name: "txn_type" });
  const quantity = useWatch({ control, name: "quantity" });
  const txnAt = useWatch({ control, name: "txn_at" });

  const selected = useMemo(
    () => ingredients.find((i) => i.id === ingredientId) ?? null,
    [ingredients, ingredientId]
  );

  const counted = Number(quantity);
  const delta =
    selected && txnType === "stocktake" && Number.isFinite(counted)
      ? counted - Number(selected.current_stock)
      : null;

  const { execute, pending, error } = useAction<StockAdjustmentWithDateInput, { id: string | null }>(
    recordStockAdjustment,
    {
      // §5.5: kiểm kê khớp sổ không tạo dòng nào — đừng báo "đã ghi nhận".
      successMessage: (data) =>
        data.id ? "Đã ghi nhận giao dịch kho" : "Số đếm khớp sổ, không phát sinh giao dịch",
      onSuccess: () => {
        reset({ ingredient_id: "", txn_type: txnType, quantity: 0, note: "", txn_at: txnAt });
        router.refresh();
      },
    }
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Kiểm kê & hao hụt</CardTitle>
        <CardDescription>
          Ghi nhận hao hụt, điều chỉnh thủ công hoặc kết quả kiểm kê theo đơn vị cơ sở.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit((values) => void execute(values))} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="ingredient-picker">Nguyên liệu *</Label>
            <Controller
              control={control}
              name="ingredient_id"
              render={({ field }) => (
                <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      id="ingredient-picker"
                      type="button"
                      variant="outline"
                      role="combobox"
                      aria-expanded={pickerOpen}
                      className="w-full justify-between font-normal"
                    >
                      {selected ? selected.name : "Chọn nguyên liệu..."}
                      <ChevronsUpDown className="size-4 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                    <Command>
                      <CommandInput placeholder="Tìm nguyên liệu..." />
                      <CommandList>
                        <CommandEmpty>Không tìm thấy nguyên liệu.</CommandEmpty>
                        <CommandGroup>
                          {ingredients.map((ing) => (
                            <CommandItem
                              key={ing.id}
                              value={`${ing.name} ${ing.code ?? ""} ${ing.category ?? ""}`}
                              onSelect={() => {
                                field.onChange(ing.id);
                                setPickerOpen(false);
                              }}
                            >
                              <Check
                                className={cn(
                                  "size-4",
                                  ing.id === field.value ? "opacity-100" : "opacity-0"
                                )}
                              />
                              <span className="flex-1">{ing.name}</span>
                              <span className="text-xs text-muted-foreground tabular-nums">
                                {formatNumber(Number(ing.current_stock), 3)} {ing.base_unit}
                              </span>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              )}
            />
            <FormError message={errors.ingredient_id?.message} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="txn_at">Ngày ghi nhận *</Label>
            <Input id="txn_at" type="date" max={todayISO()} {...register("txn_at")} />
            <p className="text-xs text-muted-foreground">
              Ngày nghiệp vụ của giao dịch — hao hụt phát hiện cuối tháng vẫn thuộc tháng đó.
            </p>
            <FormError message={errors.txn_at?.message} />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="txn_type">Loại giao dịch *</Label>
              <Controller
                control={control}
                name="txn_type"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="txn_type" className="w-full">
                      <SelectValue placeholder="Chọn loại" />
                    </SelectTrigger>
                    <SelectContent>
                      {STOCK_ADJUSTMENT_TYPE_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              <FormError message={errors.txn_type?.message} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="quantity">
                {txnType === "stocktake" ? "Số lượng đếm được *" : "Số lượng *"}
                {selected ? ` (${selected.base_unit})` : ""}
              </Label>
              <Input id="quantity" type="number" step="any" {...register("quantity")} />
              <FormError message={errors.quantity?.message} />
            </div>
          </div>

          <p className="text-xs text-muted-foreground">{HINTS[txnType] ?? ""}</p>

          {selected && (
            <div className="rounded-lg border bg-muted/40 p-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Tồn trên sổ</span>
                <span className="font-medium tabular-nums">
                  {formatNumber(Number(selected.current_stock), 3)} {selected.base_unit}
                </span>
              </div>
              {delta !== null && (
                <div className="mt-1.5 flex items-center justify-between border-t pt-1.5">
                  <span className="text-muted-foreground">Chênh lệch kiểm kê</span>
                  <span
                    className={cn(
                      "font-semibold tabular-nums",
                      delta < 0
                        ? "text-destructive"
                        : delta > 0
                          ? "text-emerald-600 dark:text-emerald-400"
                          : "text-muted-foreground"
                    )}
                  >
                    {delta > 0 ? "+" : ""}
                    {formatNumber(delta, 3)} {selected.base_unit}
                  </span>
                </div>
              )}
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="note">Ghi chú / lý do</Label>
            <Textarea id="note" rows={2} placeholder="Vd: hỏng do bảo quản" {...register("note")} />
            <FormError message={errors.note?.message} />
          </div>

          <FormServerError message={error} />

          <SubmitButton pending={pending} pendingText="Đang ghi nhận..." className="w-full sm:w-auto">
            <Save className="size-4" />
            Ghi nhận giao dịch
          </SubmitButton>
        </form>
      </CardContent>
    </Card>
  );
}
