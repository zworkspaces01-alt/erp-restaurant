"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { timekeepingSchema, type TimekeepingInput } from "@/types/restaurant";
import type { EmployeeRef } from "@/lib/queries/hr.queries";
import { saveTimekeeping } from "@/server-actions/hr.actions";
import { useAction } from "@/hooks/use-action";
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
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FormError, FormServerError, SubmitButton } from "@/components/shared";

type TimekeepingFormValues = z.input<typeof timekeepingSchema>;

const SHIFT_OPTIONS = ["Sáng", "Chiều", "Tối", "Gãy"] as const;

interface TimekeepingDialogProps {
  employees: EmployeeRef[];
  defaultDate: string;
}

export function TimekeepingDialog({ employees, defaultDate }: TimekeepingDialogProps) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  const defaults: TimekeepingFormValues = {
    employee_id: "",
    work_date: defaultDate,
    shift: null,
    check_in: null,
    check_out: null,
    hours_worked: null,
    note: null,
  };

  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<TimekeepingFormValues, unknown, TimekeepingInput>({
    resolver: zodResolver(timekeepingSchema),
    defaultValues: defaults,
  });

  const { execute, pending, error } = useAction<TimekeepingInput, { id: string }>(saveTimekeeping, {
    successMessage: "Đã lưu chấm công",
    onSuccess: () => {
      setOpen(false);
      reset(defaults);
      router.refresh();
    },
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) reset(defaults);
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" disabled={employees.length === 0}>
          <Plus className="mr-1.5 size-4" />
          Chấm công
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Thêm chấm công</DialogTitle>
          <DialogDescription>
            Bỏ trống số giờ làm để hệ thống tự tính từ giờ vào và giờ ra (hỗ trợ ca qua đêm).
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit((values) => void execute(values))} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="employee_id">Nhân viên *</Label>
            <Controller
              control={control}
              name="employee_id"
              render={({ field }) => (
                <Select value={field.value || undefined} onValueChange={field.onChange}>
                  <SelectTrigger id="employee_id" className="w-full">
                    <SelectValue placeholder="Chọn nhân viên" />
                  </SelectTrigger>
                  <SelectContent>
                    {employees.map((e) => (
                      <SelectItem key={e.id} value={e.id}>
                        {e.full_name}
                        {e.position ? ` · ${e.position}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            <FormError message={errors.employee_id?.message} />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="work_date">Ngày làm việc *</Label>
              <Input id="work_date" type="date" {...register("work_date")} />
              <FormError message={errors.work_date?.message} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="shift">Ca làm</Label>
              <Controller
                control={control}
                name="shift"
                render={({ field }) => (
                  <Select
                    value={field.value ?? "none"}
                    onValueChange={(v) => field.onChange(v === "none" ? null : v)}
                  >
                    <SelectTrigger id="shift" className="w-full">
                      <SelectValue placeholder="Không chia ca" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Không chia ca</SelectItem>
                      {SHIFT_OPTIONS.map((s) => (
                        <SelectItem key={s} value={s}>
                          Ca {s.toLowerCase()}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              <FormError message={errors.shift?.message} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="check_in">Giờ vào</Label>
              <Input id="check_in" type="time" {...register("check_in")} />
              <FormError message={errors.check_in?.message} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="check_out">Giờ ra</Label>
              <Input id="check_out" type="time" {...register("check_out")} />
              <FormError message={errors.check_out?.message} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="hours_worked">Số giờ làm (tự tính nếu bỏ trống)</Label>
              <Input
                id="hours_worked"
                type="number"
                min={0}
                max={24}
                step={0.25}
                placeholder="VD: 8"
                {...register("hours_worked")}
              />
              <FormError message={errors.hours_worked?.message} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="note">Ghi chú</Label>
              <Textarea id="note" rows={2} {...register("note")} />
              <FormError message={errors.note?.message} />
            </div>
          </div>

          <FormServerError message={error} />

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Hủy
            </Button>
            <SubmitButton pending={pending} pendingText="Đang lưu...">
              Lưu chấm công
            </SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
