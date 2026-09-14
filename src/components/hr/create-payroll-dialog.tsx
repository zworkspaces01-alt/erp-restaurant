"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { payrollPeriodSchema, type PayrollPeriodInput } from "@/types/restaurant";
import { createPayrollPeriod } from "@/server-actions/hr.actions";
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
import { FormError, FormServerError, SubmitButton } from "@/components/shared";

type PayrollPeriodFormValues = z.input<typeof payrollPeriodSchema>;

interface CreatePayrollDialogProps {
  /** Ngày hôm nay (`yyyy-MM-dd`) tính sẵn ở server theo giờ Việt Nam. */
  today: string;
}

/** Kỳ lương mặc định = tháng chứa `today` (không gọi `new Date()` khi render). */
function currentMonthDefaults(today: string): PayrollPeriodFormValues {
  const [y, m] = today.split("-").map(Number);
  const pad = (n: number) => String(n).padStart(2, "0");
  const start = `${y}-${pad(m)}-01`;
  const end = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  return { name: `Lương tháng ${pad(m)}/${y}`, period_start: start, period_end: end, note: null };
}

export function CreatePayrollDialog({ today }: CreatePayrollDialogProps) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<PayrollPeriodFormValues, unknown, PayrollPeriodInput>({
    resolver: zodResolver(payrollPeriodSchema),
    defaultValues: currentMonthDefaults(today),
  });

  const { execute, pending, error } = useAction<PayrollPeriodInput, { id: string }>(
    createPayrollPeriod,
    {
      successMessage: "Đã tạo kỳ lương",
      onSuccess: (data) => {
        setOpen(false);
        reset(currentMonthDefaults(today));
        router.push(`/payroll/${data.id}`);
      },
    }
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) reset(currentMonthDefaults(today));
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="mr-1.5 size-4" />
          Tạo kỳ lương
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Tạo kỳ lương</DialogTitle>
          <DialogDescription>
            Mỗi kỳ lương phải có khoảng thời gian riêng, không trùng với kỳ đã có.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit((values) => void execute(values))} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="name">Tên kỳ lương *</Label>
            <Input id="name" placeholder="Lương tháng 09/2026" {...register("name")} />
            <FormError message={errors.name?.message} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="period_start">Từ ngày *</Label>
              <Input id="period_start" type="date" {...register("period_start")} />
              <FormError message={errors.period_start?.message} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="period_end">Đến ngày *</Label>
              <Input id="period_end" type="date" {...register("period_end")} />
              <FormError message={errors.period_end?.message} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="note">Ghi chú</Label>
            <Textarea id="note" rows={2} {...register("note")} />
            <FormError message={errors.note?.message} />
          </div>

          <FormServerError message={error} />

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Hủy
            </Button>
            <SubmitButton pending={pending} pendingText="Đang tạo...">
              Tạo kỳ lương
            </SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
