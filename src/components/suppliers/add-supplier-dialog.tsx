"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { supplierSchema, PAYMENT_TERMS, PAYMENT_TERM_LABELS, type SupplierInput } from "@/types/restaurant";
import { createSupplier } from "@/server-actions/purchases.actions";
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

export function AddSupplierDialog() {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<SupplierInput>({
    resolver: zodResolver(supplierSchema),
    defaultValues: {
      payment_terms: "net_15",
    },
  });

  const onSubmit = async (data: SupplierInput) => {
    const res = await createSupplier(data);
    if (!res.success) {
      toast.error(res.error);
      return;
    }
    toast.success("Thêm nhà cung cấp thành công!");
    reset();
    setOpen(false);
    router.refresh();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="mr-1.5 size-4" />
          Thêm nhà cung cấp
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[480px]">
        <form onSubmit={handleSubmit(onSubmit)}>
          <DialogHeader>
            <DialogTitle>Thêm nhà cung cấp mới</DialogTitle>
            <DialogDescription>
              Khai báo thông tin NCC và điều khoản công nợ gối đầu để theo dõi thanh toán.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="code">Mã NCC</Label>
                <Input id="code" placeholder="NCC-HAISAN-01" {...register("code")} />
                {errors.code && <p className="mt-1 text-xs text-destructive">{errors.code.message}</p>}
              </div>
              <div>
                <Label htmlFor="payment_terms">Điều khoản nợ</Label>
                <select
                  id="payment_terms"
                  {...register("payment_terms")}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm shadow-xs"
                >
                  {PAYMENT_TERMS.map((term) => (
                    <option key={term} value={term}>
                      {PAYMENT_TERM_LABELS[term]}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <Label htmlFor="name">Tên nhà cung cấp</Label>
              <Input id="name" placeholder="Công ty Thực phẩm Sông Hương" {...register("name")} />
              {errors.name && <p className="mt-1 text-xs text-destructive">{errors.name.message}</p>}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="phone">Số điện thoại</Label>
                <Input id="phone" placeholder="0901234567" {...register("phone")} />
              </div>
              <div>
                <Label htmlFor="email">Email</Label>
                <Input id="email" placeholder="ncc@email.com" {...register("email")} />
              </div>
            </div>

            <div>
              <Label htmlFor="address">Địa chỉ kho hàng / văn phòng</Label>
              <Input id="address" placeholder="123 Bạch Đằng, Bình Thạnh, TP.HCM" {...register("address")} />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Hủy
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Đang lưu..." : "Lưu NCC"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
