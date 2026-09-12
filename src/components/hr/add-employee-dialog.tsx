"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import {
  employeeSchema,
  EMPLOYMENT_TYPES,
  EMPLOYMENT_TYPE_LABELS,
  type EmployeeInput,
} from "@/types/restaurant";
import { createEmployee } from "@/server-actions/hr.actions";
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

export function AddEmployeeDialog() {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<EmployeeInput>({
    resolver: zodResolver(employeeSchema),
    defaultValues: {
      employment_type: "full_time",
      role: "Phục vụ bàn",
      base_salary: 8000000,
      allowance: 1000000,
      status: "active",
      hire_date: todayISO(),
    },
  });

  const empType = watch("employment_type");

  const onSubmit = async (data: EmployeeInput) => {
    const res = await createEmployee(data);
    if (!res.success) {
      toast.error(res.error);
      return;
    }
    toast.success("Thêm nhân viên thành công!");
    reset();
    setOpen(false);
    router.refresh();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="mr-1.5 size-4" />
          Thêm nhân viên
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[480px]">
        <form onSubmit={handleSubmit(onSubmit)}>
          <DialogHeader>
            <DialogTitle>Thêm nhân viên mới</DialogTitle>
            <DialogDescription>
              Khai báo hồ sơ nhân sự, hình thức làm việc và mức lương chuẩn (theo tháng hoặc theo giờ).
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="code">Mã nhân viên</Label>
                <Input id="code" placeholder="NV-012" {...register("code")} />
                {errors.code && <p className="mt-1 text-xs text-destructive">{errors.code.message}</p>}
              </div>
              <div>
                <Label htmlFor="employment_type">Hình thức làm việc</Label>
                <select
                  id="employment_type"
                  {...register("employment_type")}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm shadow-xs"
                >
                  {EMPLOYMENT_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {EMPLOYMENT_TYPE_LABELS[type]}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <Label htmlFor="full_name">Họ và tên</Label>
              <Input id="full_name" placeholder="Nguyễn Văn A" {...register("full_name")} />
              {errors.full_name && <p className="mt-1 text-xs text-destructive">{errors.full_name.message}</p>}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="role">Vị trí / Chức danh</Label>
                <Input id="role" placeholder="Bếp chính, Thu ngân..." {...register("role")} />
                {errors.role && <p className="mt-1 text-xs text-destructive">{errors.role.message}</p>}
              </div>
              <div>
                <Label htmlFor="phone">Số điện thoại</Label>
                <Input id="phone" placeholder="0988123456" {...register("phone")} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="base_salary">
                  {empType === "full_time" ? "Lương cứng / Tháng (VNĐ)" : "Lương theo Giờ (VNĐ/h)"}
                </Label>
                <Input id="base_salary" type="number" step="1000" {...register("base_salary")} />
                {errors.base_salary && <p className="mt-1 text-xs text-destructive">{errors.base_salary.message}</p>}
              </div>
              <div>
                <Label htmlFor="allowance">Phụ cấp (VNĐ)</Label>
                <Input id="allowance" type="number" step="1000" {...register("allowance")} />
              </div>
            </div>

            <div>
              <Label htmlFor="hire_date">Ngày vào làm</Label>
              <Input id="hire_date" type="date" {...register("hire_date")} />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Hủy
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Đang lưu..." : "Lưu nhân viên"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
