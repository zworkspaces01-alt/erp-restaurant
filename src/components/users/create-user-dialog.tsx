"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, Plus, UserPlus } from "lucide-react";
import { toast } from "sonner";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createUserAction } from "@/server-actions/users.actions";
import { USER_ROLE_OPTIONS, type UserRole } from "@/types/restaurant";

const schema = z.object({
  email: z.string().trim().email("Email không hợp lệ"),
  password: z.string().min(6, "Mật khẩu tối thiểu 6 ký tự"),
  fullName: z.string().trim().min(1, "Vui lòng nhập họ tên"),
  role: z.enum(["owner", "manager", "staff"]),
});

type FormValues = z.infer<typeof schema>;

interface CreateUserDialogProps {
  onSuccess?: () => void;
}

export function CreateUserDialog({ onSuccess }: CreateUserDialogProps) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      email: "",
      password: "",
      fullName: "",
      role: "staff",
    },
  });

  const onSubmit = form.handleSubmit((values) => {
    setServerError(null);
    startTransition(async () => {
      const result = await createUserAction(values);
      if (!result.success) {
        setServerError(result.error);
        return;
      }

      toast.success("Tạo tài khoản người dùng thành công!");
      form.reset();
      setOpen(false);
      onSuccess?.();
    });
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1.5">
          <Plus className="size-4" />
          Thêm tài khoản
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[450px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="size-5 text-primary" />
            Tạo tài khoản người dùng
          </DialogTitle>
          <DialogDescription>
            Cấp tài khoản mới cho nhân sự và phân vai trò truy cập trong hệ thống ERP.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="flex flex-col gap-4 py-2" noValidate>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="create-fullName">Họ và tên</Label>
            <Input
              id="create-fullName"
              placeholder="Nguyễn Văn A"
              {...form.register("fullName")}
            />
            {form.formState.errors.fullName && (
              <p className="text-xs text-destructive">{form.formState.errors.fullName.message}</p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="create-email">Email đăng nhập</Label>
            <Input
              id="create-email"
              type="email"
              placeholder="nhanvien@restaurant.com"
              {...form.register("email")}
            />
            {form.formState.errors.email && (
              <p className="text-xs text-destructive">{form.formState.errors.email.message}</p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="create-password">Mật khẩu khởi tạo</Label>
            <Input
              id="create-password"
              type="text"
              placeholder="Tối thiểu 6 ký tự"
              {...form.register("password")}
            />
            {form.formState.errors.password && (
              <p className="text-xs text-destructive">{form.formState.errors.password.message}</p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="create-role">Vai trò phân quyền</Label>
            <Select
              defaultValue={form.getValues("role")}
              onValueChange={(val) => form.setValue("role", val as UserRole)}
            >
              <SelectTrigger id="create-role">
                <SelectValue placeholder="Chọn vai trò" />
              </SelectTrigger>
              <SelectContent>
                {USER_ROLE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">
              - <strong>Chủ nhà hàng</strong>: Toàn quyền quản trị, P&L, chi lương, tài khoản.<br />
              - <strong>Quản lý</strong>: Vận hành kho, menu, NCC, bán hàng, chấm công.<br />
              - <strong>Nhân viên</strong>: Bán hàng POS và chấm công cá nhân.
            </p>
          </div>

          {serverError && (
            <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-2.5 text-xs text-destructive">
              {serverError}
            </div>
          )}

          <DialogFooter className="mt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              Hủy
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="mr-2 size-4 animate-spin" />}
              Tạo tài khoản
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
