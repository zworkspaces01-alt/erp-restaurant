"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { createExpenseRecord, updateExpenseRecord } from "@/server-actions/expenses.actions";
import { useAction } from "@/hooks/use-action";
import { todayISO } from "@/lib/format";
import {
  EXPENSE_STATUS_OPTIONS,
  EXPENSE_TYPE_LABELS,
  PAYMENT_METHOD_OPTIONS,
  expenseRecordSchema,
  type ExpenseCategory,
  type ExpenseRecordInput,
} from "@/types/restaurant";
import type { ExpenseRow } from "@/lib/queries/expenses.queries";
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

type FormValues = z.input<typeof expenseRecordSchema>;

interface ExpenseFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: ExpenseCategory[];
  /** Bỏ trống để tạo mới. */
  expense?: ExpenseRow | null;
}

function toDefaults(expense: ExpenseRow | null | undefined): FormValues {
  if (!expense) {
    return {
      category_id: "",
      title: "",
      amount: 0,
      expense_date: todayISO(),
      status: "pending",
      payment_method: "",
      vendor: "",
      invoice_number: "",
      attachment_url: "",
      note: "",
    };
  }
  return {
    category_id: expense.category_id,
    title: expense.title,
    amount: Number(expense.amount),
    expense_date: expense.expense_date,
    status: expense.status,
    payment_method: expense.payment_method ?? "",
    vendor: expense.vendor ?? "",
    invoice_number: expense.invoice_number ?? "",
    attachment_url: expense.attachment_url ?? "",
    note: expense.note ?? "",
  };
}

export function ExpenseFormDialog({
  open,
  onOpenChange,
  categories,
  expense,
}: ExpenseFormDialogProps) {
  const router = useRouter();
  const isEdit = Boolean(expense);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    control,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm<FormValues, unknown, ExpenseRecordInput>({
    resolver: zodResolver(expenseRecordSchema),
    defaultValues: toDefaults(expense),
  });

  useEffect(() => {
    if (open) {
      setServerError(null);
      reset(toDefaults(expense));
    }
  }, [open, expense, reset]);

  const status = watch("status");

  const { execute, pending } = useAction<ExpenseRecordInput, { id: string }>(
    async (values) =>
      expense ? updateExpenseRecord(expense.id, values) : createExpenseRecord(values),
    {
      successMessage: isEdit ? "Đã cập nhật chi phí" : "Đã ghi nhận chi phí",
      onSuccess: () => {
        onOpenChange(false);
        router.refresh();
      },
      onError: (message) => setServerError(message),
    }
  );

  const activeCategories = categories.filter((c) => c.is_active || c.id === expense?.category_id);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Sửa khoản chi phí" : "Ghi nhận chi phí"}</DialogTitle>
          <DialogDescription>
            Chi phí vận hành được tính vào P&amp;L theo ngày chi (kể cả khi chưa thanh toán).
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-4"
          onSubmit={handleSubmit(async (values) => {
            await execute(values);
          })}
        >
          <FormServerError message={serverError} />

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="title">Nội dung chi phí</Label>
              <Input id="title" placeholder="Tiền thuê mặt bằng tháng 9" {...register("title")} />
              <FormError message={errors.title?.message} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="category_id">Nhóm chi phí</Label>
              <Controller
                control={control}
                name="category_id"
                render={({ field }) => (
                  <Select value={field.value || ""} onValueChange={field.onChange}>
                    <SelectTrigger id="category_id" className="w-full">
                      <SelectValue placeholder="Chọn nhóm chi phí" />
                    </SelectTrigger>
                    <SelectContent>
                      {activeCategories.map((category) => (
                        <SelectItem key={category.id} value={category.id}>
                          {category.name} · {EXPENSE_TYPE_LABELS[category.expense_type]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              <FormError message={errors.category_id?.message} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="expense_date">Ngày chi</Label>
              <Input id="expense_date" type="date" {...register("expense_date")} />
              <FormError message={errors.expense_date?.message} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="amount">Số tiền (VND)</Label>
              <Input id="amount" type="number" min={0} step={1000} {...register("amount")} />
              <FormError message={errors.amount?.message} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="vendor">Nhà cung cấp / đơn vị nhận</Label>
              <Input id="vendor" placeholder="Công ty TNHH ABC" {...register("vendor")} />
              <FormError message={errors.vendor?.message} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="status">Trạng thái</Label>
              <Controller
                control={control}
                name="status"
                render={({ field }) => (
                  <Select value={field.value ?? "pending"} onValueChange={field.onChange}>
                    <SelectTrigger id="status" className="w-full">
                      <SelectValue placeholder="Chọn trạng thái" />
                    </SelectTrigger>
                    <SelectContent>
                      {EXPENSE_STATUS_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              <FormError message={errors.status?.message} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="payment_method">
                Phương thức thanh toán{status === "paid" ? "" : " (tùy chọn)"}
              </Label>
              <Controller
                control={control}
                name="payment_method"
                render={({ field }) => (
                  <Select
                    value={field.value ?? ""}
                    onValueChange={(value) => field.onChange(value)}
                  >
                    <SelectTrigger id="payment_method" className="w-full">
                      <SelectValue placeholder="Chưa chọn" />
                    </SelectTrigger>
                    <SelectContent>
                      {PAYMENT_METHOD_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              <FormError message={errors.payment_method?.message} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="invoice_number">Số hóa đơn</Label>
              <Input id="invoice_number" placeholder="HD-000123" {...register("invoice_number")} />
              <FormError message={errors.invoice_number?.message} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="attachment_url">Link chứng từ</Label>
              <Input
                id="attachment_url"
                placeholder="https://..."
                {...register("attachment_url")}
              />
              <FormError message={errors.attachment_url?.message} />
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
            <SubmitButton pending={pending} pendingText="Đang lưu...">
              {isEdit ? "Lưu thay đổi" : "Ghi nhận"}
            </SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
