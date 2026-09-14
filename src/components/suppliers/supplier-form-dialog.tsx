"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { createSupplier, updateSupplier } from "@/server-actions/purchases.actions";
import { useAction } from "@/hooks/use-action";
import {
  PAYMENT_TERM_OPTIONS,
  supplierSchema,
  type SupplierInput,
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

type FormValues = z.input<typeof supplierSchema>;

export interface SupplierFormData {
  id: string;
  code: string | null;
  name: string;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  tax_code: string | null;
  payment_terms_days: number;
  is_active: boolean;
  note: string | null;
}

interface SupplierFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Bỏ trống để thêm mới. */
  supplier?: SupplierFormData | null;
}

function toDefaults(s: SupplierFormData | null | undefined): FormValues {
  return {
    code: s?.code ?? "",
    name: s?.name ?? "",
    contact_name: s?.contact_name ?? "",
    phone: s?.phone ?? "",
    email: s?.email ?? "",
    address: s?.address ?? "",
    tax_code: s?.tax_code ?? "",
    payment_terms_days: s?.payment_terms_days ?? 0,
    is_active: s?.is_active ?? true,
    note: s?.note ?? "",
  };
}

export function SupplierFormDialog({ open, onOpenChange, supplier }: SupplierFormDialogProps) {
  const router = useRouter();
  const isEdit = Boolean(supplier);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues, unknown, SupplierInput>({
    resolver: zodResolver(supplierSchema),
    defaultValues: toDefaults(supplier),
  });

  useEffect(() => {
    if (open) {
      setServerError(null);
      reset(toDefaults(supplier));
    }
  }, [open, supplier, reset]);

  const { execute, pending } = useAction<SupplierInput, { id: string }>(
    async (values) => (supplier ? updateSupplier(supplier.id, values) : createSupplier(values)),
    {
      successMessage: isEdit ? "Đã cập nhật nhà cung cấp" : "Đã thêm nhà cung cấp",
      onSuccess: () => {
        onOpenChange(false);
        router.refresh();
      },
      onError: (message) => setServerError(message),
    }
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Sửa nhà cung cấp" : "Thêm nhà cung cấp"}</DialogTitle>
          <DialogDescription>
            Điều khoản thanh toán quyết định hạn nợ mặc định của phiếu nhập (0 ngày = trả ngay).
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
              <Label htmlFor="name">Tên nhà cung cấp</Label>
              <Input id="name" placeholder="Công ty TNHH Thực phẩm ABC" {...register("name")} />
              <FormError message={errors.name?.message} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="code">Mã NCC</Label>
              <Input id="code" placeholder="NCC-001" {...register("code")} />
              <FormError message={errors.code?.message} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="payment_terms_days">Điều khoản thanh toán</Label>
              <Controller
                control={control}
                name="payment_terms_days"
                render={({ field }) => (
                  <Select
                    value={String(field.value ?? 0)}
                    onValueChange={(v) => field.onChange(Number(v))}
                  >
                    <SelectTrigger id="payment_terms_days" className="w-full">
                      <SelectValue placeholder="Chọn điều khoản" />
                    </SelectTrigger>
                    <SelectContent>
                      {PAYMENT_TERM_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={String(opt.value)}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              <FormError message={errors.payment_terms_days?.message} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="contact_name">Người liên hệ</Label>
              <Input id="contact_name" placeholder="Anh Nam" {...register("contact_name")} />
              <FormError message={errors.contact_name?.message} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="phone">Điện thoại</Label>
              <Input id="phone" placeholder="0901234567" {...register("phone")} />
              <FormError message={errors.phone?.message} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" placeholder="ncc@example.com" {...register("email")} />
              <FormError message={errors.email?.message} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="tax_code">Mã số thuế</Label>
              <Input id="tax_code" placeholder="0101234567" {...register("tax_code")} />
              <FormError message={errors.tax_code?.message} />
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="address">Địa chỉ</Label>
              <Input id="address" placeholder="12 Lê Lợi, Quận 1, TP.HCM" {...register("address")} />
              <FormError message={errors.address?.message} />
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="note">Ghi chú</Label>
              <Textarea id="note" rows={2} placeholder="Giao hàng buổi sáng..." {...register("note")} />
              <FormError message={errors.note?.message} />
            </div>

            <div className="sm:col-span-2">
              <Controller
                control={control}
                name="is_active"
                render={({ field }) => (
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="is_active"
                      checked={field.value ?? true}
                      onCheckedChange={(v) => field.onChange(v === true)}
                    />
                    <Label htmlFor="is_active" className="font-normal">
                      Đang hợp tác
                    </Label>
                  </div>
                )}
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Hủy
            </Button>
            <SubmitButton pending={pending} pendingText="Đang lưu...">
              {isEdit ? "Lưu thay đổi" : "Thêm nhà cung cấp"}
            </SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
