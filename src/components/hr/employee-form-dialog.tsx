"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Controller, useForm } from "react-hook-form";
import type { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  EMPLOYMENT_TYPE_OPTIONS,
  employeeSchema,
  type Employee,
  type EmployeeInput,
} from "@/types/restaurant";
import { createEmployee, updateEmployee } from "@/server-actions/hr.actions";
import { useAction } from "@/hooks/use-action";
import { todayISO } from "@/lib/format";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FormError, FormServerError, SubmitButton } from "@/components/shared";

type EmployeeFormValues = z.input<typeof employeeSchema>;

interface EmployeeFormDialogProps {
  /** Bỏ trống = tạo mới. */
  employee?: Employee;
  trigger?: React.ReactNode;
  /** Ngày hôm nay (`yyyy-MM-dd`) tính sẵn ở server; fallback về giờ trình duyệt. */
  today?: string;
}

function toDefaults(employee?: Employee, today?: string): EmployeeFormValues {
  return {
    code: employee?.code ?? null,
    full_name: employee?.full_name ?? "",
    phone: employee?.phone ?? null,
    email: employee?.email ?? null,
    position: employee?.position ?? null,
    employment_type: employee?.employment_type ?? "full_time",
    base_salary: Number(employee?.base_salary ?? 0),
    hourly_rate: Number(employee?.hourly_rate ?? 0),
    allowance: Number(employee?.allowance ?? 0),
    standard_days_per_month: employee?.standard_days_per_month ?? 26,
    start_date: employee?.start_date ?? today ?? todayISO(),
    end_date: employee?.end_date ?? null,
    bank_account: employee?.bank_account ?? null,
    is_active: employee?.is_active ?? true,
    note: employee?.note ?? null,
  };
}

export function EmployeeFormDialog({ employee, trigger, today }: EmployeeFormDialogProps) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const isEdit = Boolean(employee);

  const {
    register,
    control,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm<EmployeeFormValues, unknown, EmployeeInput>({
    resolver: zodResolver(employeeSchema),
    defaultValues: toDefaults(employee, today),
  });

  const { execute, pending, error } = useAction<EmployeeInput, { id: string }>(
    async (values) => (employee ? updateEmployee(employee.id, values) : createEmployee(values)),
    {
      successMessage: isEdit ? "Đã cập nhật nhân viên" : "Đã thêm nhân viên",
      onSuccess: () => {
        setOpen(false);
        reset(isEdit ? undefined : toDefaults());
        router.refresh();
      },
    }
  );

  const employmentType = watch("employment_type");

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) reset(toDefaults(employee, today));
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm">
            <Plus className="mr-1.5 size-4" />
            Thêm nhân viên
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Sửa hồ sơ nhân viên" : "Thêm nhân viên"}</DialogTitle>
          <DialogDescription>
            Nhân viên toàn thời gian tính lương tháng theo số công; bán thời gian tính theo giờ làm.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit((values) => void execute(values))} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="full_name">Họ và tên *</Label>
              <Input id="full_name" placeholder="Nguyễn Văn A" {...register("full_name")} />
              <FormError message={errors.full_name?.message} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="code">Mã nhân viên</Label>
              <Input id="code" placeholder="NV001" {...register("code")} />
              <FormError message={errors.code?.message} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="position">Vị trí</Label>
              <Input id="position" placeholder="Phục vụ / Bếp chính" {...register("position")} />
              <FormError message={errors.position?.message} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="employment_type">Loại hợp đồng *</Label>
              <Controller
                control={control}
                name="employment_type"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="employment_type" className="w-full">
                      <SelectValue placeholder="Chọn loại hợp đồng" />
                    </SelectTrigger>
                    <SelectContent>
                      {EMPLOYMENT_TYPE_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              <FormError message={errors.employment_type?.message} />
            </div>
          </div>

          <div className="grid gap-4 rounded-lg border bg-muted/30 p-4 sm:grid-cols-2">
            {employmentType === "full_time" ? (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="base_salary">Lương cơ bản / tháng (đ) *</Label>
                  <Input id="base_salary" type="number" min={0} step={1000} {...register("base_salary")} />
                  <FormError message={errors.base_salary?.message} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="standard_days_per_month">Số công chuẩn / tháng *</Label>
                  <Input
                    id="standard_days_per_month"
                    type="number"
                    min={1}
                    step={1}
                    {...register("standard_days_per_month")}
                  />
                  <FormError message={errors.standard_days_per_month?.message} />
                </div>
              </>
            ) : (
              <div className="space-y-1.5">
                <Label htmlFor="hourly_rate">Lương theo giờ (đ) *</Label>
                <Input id="hourly_rate" type="number" min={0} step={1000} {...register("hourly_rate")} />
                <FormError message={errors.hourly_rate?.message} />
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="allowance">Phụ cấp / tháng (đ)</Label>
              <Input id="allowance" type="number" min={0} step={1000} {...register("allowance")} />
              <FormError message={errors.allowance?.message} />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="phone">Số điện thoại</Label>
              <Input id="phone" {...register("phone")} />
              <FormError message={errors.phone?.message} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" {...register("email")} />
              <FormError message={errors.email?.message} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="start_date">Ngày vào làm</Label>
              <Input id="start_date" type="date" {...register("start_date")} />
              <FormError message={errors.start_date?.message} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="end_date">Ngày nghỉ việc</Label>
              <Input id="end_date" type="date" {...register("end_date")} />
              <FormError message={errors.end_date?.message} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="bank_account">Tài khoản ngân hàng</Label>
              <Input id="bank_account" placeholder="Vietcombank - 001234567" {...register("bank_account")} />
              <FormError message={errors.bank_account?.message} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="note">Ghi chú</Label>
              <Textarea id="note" rows={2} {...register("note")} />
              <FormError message={errors.note?.message} />
            </div>
          </div>

          <Controller
            control={control}
            name="is_active"
            render={({ field }) => (
              <div className="flex items-center gap-2">
                <Checkbox
                  id="is_active"
                  checked={field.value}
                  onCheckedChange={(checked) => field.onChange(checked === true)}
                />
                <Label htmlFor="is_active" className="font-normal">
                  Đang làm việc
                </Label>
              </div>
            )}
          />

          <FormServerError message={error} />

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Hủy
            </Button>
            <SubmitButton pending={pending} pendingText="Đang lưu...">
              {isEdit ? "Lưu thay đổi" : "Thêm nhân viên"}
            </SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
