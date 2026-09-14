"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { Plus, ScanLine, Trash2 } from "lucide-react";
import { createPurchaseOrder } from "@/server-actions/purchases.actions";
import { useAction } from "@/hooks/use-action";
import { formatNumber, formatVND, todayISO } from "@/lib/format";
import {
  PAYMENT_METHOD_OPTIONS,
  calcNewAvgCost,
  calcPoLine,
  paymentTermLabel,
  purchaseOrderSchema,
  type PurchaseOrderInput,
} from "@/types/restaurant";
import type { IngredientPickRow, SupplierPickRow } from "@/lib/queries/purchases.queries";
import { EmptyState, FormError, FormServerError, SubmitButton } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { IngredientPicker } from "./ingredient-picker";
import { InvoiceOcrDialog } from "./invoice-ocr-dialog";

type FormValues = z.input<typeof purchaseOrderSchema>;

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  d.setDate(d.getDate() + days);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

const emptyLine = {
  ingredient_id: "",
  quantity: 1,
  unit_price: 0,
  conversion_factor: 1,
  unit: "",
};

interface PurchaseOrderFormProps {
  suppliers: SupplierPickRow[];
  ingredients: IngredientPickRow[];
}

export function PurchaseOrderForm({ suppliers, ingredients }: PurchaseOrderFormProps) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const [dueTouched, setDueTouched] = useState(false);

  const {
    register,
    control,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<FormValues, unknown, PurchaseOrderInput>({
    resolver: zodResolver(purchaseOrderSchema),
    defaultValues: {
      supplier_id: "",
      order_date: todayISO(),
      due_date: todayISO(),
      invoice_number: "",
      note: "",
      items: [{ ...emptyLine }],
      paid_now: 0,
      paid_method: "cash",
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: "items" });

  const supplierId = watch("supplier_id");
  const orderDate = watch("order_date");
  const items = watch("items");
  const paidNow = Number(watch("paid_now") ?? 0);

  const supplier = useMemo(
    () => suppliers.find((s) => s.id === supplierId) ?? null,
    [suppliers, supplierId]
  );

  // Hạn thanh toán = ngày nhập + điều khoản NCC (vẫn cho phép sửa tay).
  useEffect(() => {
    if (dueTouched || !supplier || !orderDate) return;
    setValue("due_date", addDays(orderDate, supplier.payment_terms_days), {
      shouldValidate: false,
    });
  }, [supplier, orderDate, dueTouched, setValue]);

  const ingredientById = useMemo(
    () => new Map(ingredients.map((i) => [i.id, i])),
    [ingredients]
  );

  const lines = (items ?? []).map((raw, index) => {
    const ingredient = ingredientById.get(String(raw?.ingredient_id ?? "")) ?? null;
    const quantity = Number(raw?.quantity ?? 0);
    const unitPrice = Number(raw?.unit_price ?? 0);
    const factor = Number(raw?.conversion_factor ?? 0) || 1;
    const calc = calcPoLine(quantity, unitPrice, factor);
    const newAvg = ingredient
      ? calcNewAvgCost(ingredient.current_stock, ingredient.avg_cost_price, calc.baseQty, calc.costPerBase)
      : 0;
    return { index, ingredient, quantity, unitPrice, factor, ...calc, newAvg };
  });

  const total = lines.reduce((s, l) => s + l.lineTotal, 0);
  const debt = Math.max(total - paidNow, 0);
  const usedIngredientIds = lines.map((l) => l.ingredient?.id ?? "").filter(Boolean);

  const { execute, pending } = useAction<PurchaseOrderInput, { id: string }>(createPurchaseOrder, {
    successMessage: "Đã tạo phiếu nhập và cập nhật tồn kho",
    onSuccess: (data) => router.push(`/purchases/${data.id}`),
    onError: (message) => setServerError(message),
  });

  if (suppliers.length === 0 || ingredients.length === 0) {
    return (
      <EmptyState
        title="Chưa đủ dữ liệu để tạo phiếu nhập"
        description="Cần có ít nhất một nhà cung cấp đang hợp tác và một nguyên liệu đang hoạt động."
      />
    );
  }

  return (
    <form
      className="space-y-6"
      onSubmit={handleSubmit(async (values) => {
        await execute(values);
      })}
    >
      <FormServerError message={serverError} />

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl border border-emerald-500/30 bg-emerald-500/5 dark:bg-emerald-950/20">
        <div className="flex items-center gap-3">
          <div className="size-10 shrink-0 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
            <ScanLine className="size-5" />
          </div>
          <div>
            <h4 className="text-sm font-semibold">Tự động điền từ ảnh hóa đơn bằng AI OCR</h4>
            <p className="text-xs text-muted-foreground">
              Tải ảnh hóa đơn NCC để tự trích xuất thông tin, số lượng, giá và đối soát trước khi duyệt.
            </p>
          </div>
        </div>
        <InvoiceOcrDialog suppliers={suppliers} ingredients={ingredients} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Thông tin phiếu nhập</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5">
            <Label htmlFor="supplier_id">Nhà cung cấp</Label>
            <Controller
              control={control}
              name="supplier_id"
              render={({ field }) => (
                <Select value={field.value || ""} onValueChange={field.onChange}>
                  <SelectTrigger id="supplier_id" className="w-full">
                    <SelectValue placeholder="Chọn nhà cung cấp" />
                  </SelectTrigger>
                  <SelectContent>
                    {suppliers.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {supplier ? (
              <p className="text-xs text-muted-foreground">
                {paymentTermLabel(supplier.payment_terms_days)} · Đang nợ {formatVND(supplier.current_debt)}
              </p>
            ) : null}
            <FormError message={errors.supplier_id?.message} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="order_date">Ngày nhập</Label>
            <Input id="order_date" type="date" {...register("order_date")} />
            <FormError message={errors.order_date?.message} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="due_date">Hạn thanh toán</Label>
            <Input
              id="due_date"
              type="date"
              {...register("due_date", { onChange: () => setDueTouched(true) })}
            />
            <FormError message={errors.due_date?.message} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="invoice_number">Số hóa đơn</Label>
            <Input id="invoice_number" placeholder="HD-0012" {...register("invoice_number")} />
            <FormError message={errors.invoice_number?.message} />
          </div>

          <div className="space-y-1.5 sm:col-span-2 lg:col-span-4">
            <Label htmlFor="note">Ghi chú</Label>
            <Textarea id="note" rows={2} placeholder="Giao hàng buổi sáng..." {...register("note")} />
            <FormError message={errors.note?.message} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between gap-2">
          <CardTitle>Chi tiết hàng nhập</CardTitle>
          <Button type="button" variant="outline" size="sm" onClick={() => append({ ...emptyLine })}>
            <Plus className="mr-1.5 size-4" />
            Thêm dòng
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {typeof errors.items?.message === "string" ? (
            <FormError message={errors.items.message} />
          ) : null}

          {fields.map((field, index) => {
            const line = lines[index];
            const itemErrors = errors.items?.[index];
            return (
              <div key={field.id} className="rounded-lg border p-3">
                <div className="grid gap-3 lg:grid-cols-12">
                  <div className="space-y-1.5 lg:col-span-4">
                    <Label htmlFor={`items.${index}.ingredient_id`}>Nguyên liệu</Label>
                    <Controller
                      control={control}
                      name={`items.${index}.ingredient_id`}
                      render={({ field: f }) => (
                        <IngredientPicker
                          id={`items.${index}.ingredient_id`}
                          ingredients={ingredients}
                          value={String(f.value ?? "")}
                          disabledIds={usedIngredientIds}
                          onSelect={(ing) => {
                            f.onChange(ing.id);
                            setValue(`items.${index}.conversion_factor`, ing.conversion_factor);
                            setValue(`items.${index}.unit`, ing.import_unit ?? ing.base_unit);
                            if (!Number(watch(`items.${index}.unit_price`))) {
                              setValue(`items.${index}.unit_price`, ing.avg_cost_per_import_unit);
                            }
                          }}
                        />
                      )}
                    />
                    <FormError message={itemErrors?.ingredient_id?.message} />
                  </div>

                  <div className="space-y-1.5 lg:col-span-2">
                    <Label htmlFor={`items.${index}.quantity`}>
                      Số lượng{line?.ingredient ? ` (${line.ingredient.import_unit ?? line.ingredient.base_unit})` : ""}
                    </Label>
                    <Input
                      id={`items.${index}.quantity`}
                      type="number"
                      min={0}
                      step="0.001"
                      {...register(`items.${index}.quantity`, { valueAsNumber: true })}
                    />
                    <FormError message={itemErrors?.quantity?.message} />
                  </div>

                  <div className="space-y-1.5 lg:col-span-3">
                    <Label htmlFor={`items.${index}.unit_price`}>Đơn giá (VND / ĐV nhập)</Label>
                    <Input
                      id={`items.${index}.unit_price`}
                      type="number"
                      min={0}
                      step={1000}
                      {...register(`items.${index}.unit_price`, { valueAsNumber: true })}
                    />
                    <FormError message={itemErrors?.unit_price?.message} />
                  </div>

                  <div className="space-y-1.5 lg:col-span-2">
                    <Label htmlFor={`items.${index}.conversion_factor`}>
                      Quy đổi{line?.ingredient ? ` (→ ${line.ingredient.base_unit})` : ""}
                    </Label>
                    <Input
                      id={`items.${index}.conversion_factor`}
                      type="number"
                      min={0}
                      step="0.0001"
                      {...register(`items.${index}.conversion_factor`, { valueAsNumber: true })}
                    />
                    <FormError message={itemErrors?.conversion_factor?.message} />
                  </div>

                  <div className="flex items-end justify-end lg:col-span-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label="Xóa dòng"
                      disabled={fields.length === 1}
                      onClick={() => remove(index)}
                    >
                      <Trash2 className="size-4 text-destructive" />
                    </Button>
                  </div>
                </div>

                {line?.ingredient ? (
                  <div className="mt-3 grid gap-2 border-t pt-3 text-xs text-muted-foreground sm:grid-cols-2 lg:grid-cols-4">
                    <div>
                      <span className="block">Thành tiền</span>
                      <span className="font-medium text-foreground">{formatVND(line.lineTotal)}</span>
                    </div>
                    <div>
                      <span className="block">Quy ra kho</span>
                      <span className="font-medium text-foreground">
                        {formatNumber(line.baseQty, 3)} {line.ingredient.base_unit}
                      </span>
                    </div>
                    <div>
                      <span className="block">Giá vốn nhập / {line.ingredient.base_unit}</span>
                      <span className="font-medium text-foreground">{formatVND(line.costPerBase)}</span>
                    </div>
                    <div>
                      <span className="block">
                        Giá vốn BQ mới (hiện tại {formatVND(line.ingredient.avg_cost_price)})
                      </span>
                      <span className="font-medium text-foreground">{formatVND(line.newAvg)}</span>
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Thanh toán</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 lg:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="paid_now">Trả ngay (VND)</Label>
            <Input
              id="paid_now"
              type="number"
              min={0}
              max={total}
              step={1000}
              {...register("paid_now", { valueAsNumber: true })}
            />
            <FormError message={errors.paid_now?.message} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="paid_method">Hình thức thanh toán</Label>
            <Controller
              control={control}
              name="paid_method"
              render={({ field }) => (
                <Select value={field.value ?? "cash"} onValueChange={field.onChange}>
                  <SelectTrigger id="paid_method" className="w-full">
                    <SelectValue placeholder="Chọn hình thức" />
                  </SelectTrigger>
                  <SelectContent>
                    {PAYMENT_METHOD_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            <FormError message={errors.paid_method?.message} />
          </div>

          <div className="space-y-1 rounded-lg border bg-muted/40 p-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Tổng tiền hàng</span>
              <span className="font-semibold">{formatVND(total)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Trả ngay</span>
              <span>{formatVND(paidNow)}</span>
            </div>
            <div className="flex items-center justify-between border-t pt-1">
              <span className="text-muted-foreground">Còn nợ</span>
              <span className={debt > 0 ? "font-semibold text-destructive" : "font-semibold"}>
                {formatVND(debt)}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={() => router.push("/purchases")}>
          Hủy
        </Button>
        <SubmitButton pending={pending} pendingText="Đang tạo phiếu...">
          Tạo phiếu nhập
        </SubmitButton>
      </div>
    </form>
  );
}
