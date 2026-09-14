"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { recordSupplierPayment } from "@/server-actions/payments.actions";
import { useAction } from "@/hooks/use-action";
import { cn } from "@/lib/utils";
import { formatDate, formatVND, todayISO } from "@/lib/format";
import {
  PAYMENT_METHOD_OPTIONS,
  supplierPaymentSchema,
  type SupplierPaymentInput,
} from "@/types/restaurant";
import type { PurchaseOrderRow, SupplierPickRow } from "@/lib/queries/purchases.queries";
import { FormError, FormServerError, SubmitButton } from "@/components/shared";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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

type FormValues = z.input<typeof supplierPaymentSchema>;
type PaymentMode = "specific" | "fifo";

export interface RecordPaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  suppliers: SupplierPickRow[];
  /** Mọi phiếu nhập còn nợ (debt_amount > 0), đủ mọi NCC. */
  outstandingOrders: PurchaseOrderRow[];
  presetSupplierId?: string;
  presetPurchaseOrderId?: string;
}

export function RecordPaymentDialog({
  open,
  onOpenChange,
  suppliers,
  outstandingOrders,
  presetSupplierId,
  presetPurchaseOrderId,
}: RecordPaymentDialogProps) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const [mode, setMode] = useState<PaymentMode>(presetPurchaseOrderId ? "specific" : "fifo");

  const {
    register,
    control,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<FormValues, unknown, SupplierPaymentInput>({
    resolver: zodResolver(supplierPaymentSchema),
    defaultValues: {
      supplier_id: presetSupplierId ?? "",
      amount: 0,
      payment_date: todayISO(),
      method: "cash",
      purchase_order_id: presetPurchaseOrderId ?? "",
      reference: "",
      note: "",
    },
  });

  useEffect(() => {
    if (!open) return;
    setServerError(null);
    setMode(presetPurchaseOrderId ? "specific" : "fifo");
    reset({
      supplier_id: presetSupplierId ?? "",
      amount: 0,
      payment_date: todayISO(),
      method: "cash",
      purchase_order_id: presetPurchaseOrderId ?? "",
      reference: "",
      note: "",
    });
  }, [open, presetSupplierId, presetPurchaseOrderId, reset]);

  const supplierId = String(watch("supplier_id") ?? "");
  const poId = String(watch("purchase_order_id") ?? "");
  const amount = Number(watch("amount") ?? 0);

  const supplier = useMemo(
    () => suppliers.find((s) => s.id === supplierId) ?? null,
    [suppliers, supplierId]
  );

  const supplierOrders = useMemo(
    () => outstandingOrders.filter((o) => o.supplier_id === supplierId),
    [outstandingOrders, supplierId]
  );

  const selectedOrder = supplierOrders.find((o) => o.id === poId) ?? null;
  const supplierDebt =
    supplier?.current_debt ?? supplierOrders.reduce((s, o) => s + o.debt_amount, 0);
  const maxAmount = mode === "specific" ? (selectedOrder?.debt_amount ?? 0) : supplierDebt;
  const exceeds = amount > maxAmount + 0.009;

  const { execute, pending } = useAction<SupplierPaymentInput, { id: string }>(
    recordSupplierPayment,
    {
      successMessage: "Đã ghi nhận thanh toán",
      onSuccess: () => {
        onOpenChange(false);
        router.refresh();
      },
      onError: (message) => setServerError(message),
    }
  );

  function changeMode(next: PaymentMode) {
    setMode(next);
    if (next === "fifo") setValue("purchase_order_id", "");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>Ghi nhận thanh toán</DialogTitle>
          <DialogDescription>
            Trả đích danh một phiếu nhập, hoặc trừ dần công nợ theo thứ tự đến hạn (FIFO).
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-4"
          onSubmit={handleSubmit(async (values) => {
            await execute({
              ...values,
              purchase_order_id: mode === "specific" ? values.purchase_order_id : null,
            });
          })}
        >
          <FormServerError message={serverError} />

          <div className="space-y-1.5">
            <Label htmlFor="supplier_id">Nhà cung cấp</Label>
            <Controller
              control={control}
              name="supplier_id"
              render={({ field }) => (
                <Select
                  value={field.value || ""}
                  onValueChange={(v) => {
                    field.onChange(v);
                    setValue("purchase_order_id", "");
                  }}
                  disabled={Boolean(presetSupplierId)}
                >
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
            <FormError message={errors.supplier_id?.message} />
          </div>

          {supplierId ? (
            <div className="rounded-lg border bg-muted/40 p-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Công nợ hiện tại</span>
                <span className="font-semibold">{formatVND(supplierDebt)}</span>
              </div>
              <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
                <span>Phiếu nhập còn nợ</span>
                <span>{supplierOrders.length}</span>
              </div>
            </div>
          ) : null}

          <div className="space-y-2">
            <Label>Hình thức phân bổ</Label>
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant={mode === "specific" ? "default" : "outline"}
                onClick={() => changeMode("specific")}
                disabled={!supplierId || supplierOrders.length === 0}
              >
                Trả đích danh
              </Button>
              <Button
                type="button"
                variant={mode === "fifo" ? "default" : "outline"}
                onClick={() => changeMode("fifo")}
                disabled={Boolean(presetPurchaseOrderId)}
              >
                Trừ dần (FIFO)
              </Button>
            </div>
          </div>

          {mode === "specific" ? (
            <div className="space-y-1.5">
              <Label htmlFor="purchase_order_id">Phiếu nhập</Label>
              <Controller
                control={control}
                name="purchase_order_id"
                render={({ field }) => (
                  <Select
                    value={field.value || ""}
                    onValueChange={field.onChange}
                    disabled={!supplierId || Boolean(presetPurchaseOrderId)}
                  >
                    <SelectTrigger id="purchase_order_id" className="w-full">
                      <SelectValue placeholder="Chọn phiếu nhập còn nợ" />
                    </SelectTrigger>
                    <SelectContent>
                      {supplierOrders.map((o) => (
                        <SelectItem key={o.id} value={o.id}>
                          {o.po_number ?? "—"} · còn nợ {formatVND(o.debt_amount)}
                          {o.due_date ? ` · hạn ${formatDate(o.due_date)}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              <FormError message={errors.purchase_order_id?.message} />
            </div>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="amount">Số tiền (VND)</Label>
              <Input
                id="amount"
                type="number"
                min={0}
                max={maxAmount || undefined}
                step={1000}
                {...register("amount", { valueAsNumber: true })}
              />
              <p className="text-xs text-muted-foreground">Tối đa {formatVND(maxAmount)}</p>
              {exceeds ? (
                <FormError
                  message={
                    mode === "specific"
                      ? "Số tiền vượt quá công nợ còn lại của phiếu nhập"
                      : "Số tiền vượt quá tổng công nợ của nhà cung cấp"
                  }
                />
              ) : (
                <FormError message={errors.amount?.message} />
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="payment_date">Ngày thanh toán</Label>
              <Input id="payment_date" type="date" {...register("payment_date")} />
              <FormError message={errors.payment_date?.message} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="method">Hình thức</Label>
              <Controller
                control={control}
                name="method"
                render={({ field }) => (
                  <Select value={field.value ?? "cash"} onValueChange={field.onChange}>
                    <SelectTrigger id="method" className="w-full">
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
              <FormError message={errors.method?.message} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="reference">Số chứng từ</Label>
              <Input id="reference" placeholder="UNC 1234" {...register("reference")} />
              <FormError message={errors.reference?.message} />
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="note">Ghi chú</Label>
              <Textarea id="note" rows={2} {...register("note")} />
              <FormError message={errors.note?.message} />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Hủy
            </Button>
            <SubmitButton
              pending={pending}
              pendingText="Đang ghi nhận..."
              disabled={exceeds || amount <= 0 || (mode === "specific" && !poId)}
              className={cn(exceeds && "opacity-60")}
            >
              Ghi nhận thanh toán
            </SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
