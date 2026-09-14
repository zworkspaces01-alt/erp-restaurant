"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import {
  createExpenseCategory,
  updateExpenseCategory,
} from "@/server-actions/expenses.actions";
import { useAction } from "@/hooks/use-action";
import {
  EXPENSE_TYPE_OPTIONS,
  expenseCategorySchema,
  type ExpenseCategory,
  type ExpenseCategoryInput,
} from "@/types/restaurant";
import { FormError, FormServerError, SubmitButton } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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

type FormValues = z.input<typeof expenseCategorySchema>;

interface ExpenseCategoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  category?: ExpenseCategory | null;
}

function toDefaults(category: ExpenseCategory | null | undefined): FormValues {
  return {
    name: category?.name ?? "",
    expense_type: category?.expense_type ?? "variable",
    description: category?.description ?? "",
    is_active: category?.is_active ?? true,
  };
}

export function ExpenseCategoryDialog({
  open,
  onOpenChange,
  category,
}: ExpenseCategoryDialogProps) {
  const router = useRouter();
  const isEdit = Boolean(category);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues, unknown, ExpenseCategoryInput>({
    resolver: zodResolver(expenseCategorySchema),
    defaultValues: toDefaults(category),
  });

  useEffect(() => {
    if (open) {
      setServerError(null);
      reset(toDefaults(category));
    }
  }, [open, category, reset]);

  const { execute, pending } = useAction<ExpenseCategoryInput, { id: string }>(
    async (values) =>
      category ? updateExpenseCategory(category.id, values) : createExpenseCategory(values),
    {
      successMessage: isEdit ? "Đã cập nhật nhóm chi phí" : "Đã thêm nhóm chi phí",
      onSuccess: () => {
        onOpenChange(false);
        router.refresh();
      },
      onError: (message) => setServerError(message),
    }
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Sửa nhóm chi phí" : "Thêm nhóm chi phí"}</DialogTitle>
          <DialogDescription>
            Loại chi phí quyết định cách tách chi phí cố định / biến đổi trong báo cáo P&amp;L.
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-4"
          onSubmit={handleSubmit(async (values) => {
            await execute(values);
          })}
        >
          <FormServerError message={serverError} />

          <div className="space-y-1.5">
            <Label htmlFor="name">Tên nhóm chi phí</Label>
            <Input id="name" placeholder="Tiền thuê mặt bằng" {...register("name")} />
            <FormError message={errors.name?.message} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="expense_type">Loại chi phí</Label>
            <Controller
              control={control}
              name="expense_type"
              render={({ field }) => (
                <Select value={field.value ?? "variable"} onValueChange={field.onChange}>
                  <SelectTrigger id="expense_type" className="w-full">
                    <SelectValue placeholder="Chọn loại chi phí" />
                  </SelectTrigger>
                  <SelectContent>
                    {EXPENSE_TYPE_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            <FormError message={errors.expense_type?.message} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="description">Mô tả</Label>
            <Textarea id="description" rows={2} {...register("description")} />
            <FormError message={errors.description?.message} />
          </div>

          <Controller
            control={control}
            name="is_active"
            render={({ field }) => (
              <div className="flex items-center gap-2">
                <Checkbox
                  id="is_active"
                  checked={field.value ?? true}
                  onCheckedChange={(checked) => field.onChange(checked === true)}
                />
                <Label htmlFor="is_active" className="text-sm font-normal">
                  Đang sử dụng
                </Label>
              </div>
            )}
          />

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Hủy
            </Button>
            <SubmitButton pending={pending} pendingText="Đang lưu...">
              {isEdit ? "Lưu thay đổi" : "Thêm nhóm"}
            </SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
