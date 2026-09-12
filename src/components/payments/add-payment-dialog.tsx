"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { supplierPaymentSchema, type SupplierPaymentInput } from "@/types/restaurant";
import { recordSupplierPaymentAction } from "@/server-actions/payments.actions";
import { formatVND, todayISO } from "@/lib/format";
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

interface SupplierOption {
  id: string;
  name: string;
  code: string;
  current_debt: number;
}

export function AddPaymentDialog({ suppliers }: { suppliers: SupplierOption[] }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<SupplierPaymentInput>({
    resolver: zodResolver(supplierPaymentSchema),
    defaultValues: {
      payment_date: todayISO(),
      payment_method: "bank_transfer",
      amount: 5000000,
    },
  });

  const onSubmit = async (data: SupplierPaymentInput) => {
    const res = await recordSupplierPaymentAction(data);
    if (!res.success) {
      toast.error(res.error);
      return;
    }
    toast.success("Thanh toán thành công! Công nợ NCC và PO đã được tự động cấn trừ.");
    reset();
    setOpen(false);
    router.refresh();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="mr-1.5 size-4" />
          Lập phiếu chi trả nợ NCC
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[480px]">
        <form onSubmit={handleSubmit(onSubmit)}>
          <DialogHeader>
            <DialogTitle>Thanh toán công nợ nhà cung cấp</DialogTitle>
            <DialogDescription>
              Số tiền chi trả sẽ được tự động cấn trừ vào các phiếu nhập kho cũ nhất (FIFO) và giảm dư nợ của NCC.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div>
              <Label htmlFor="supplier_id">Nhà cung cấp cần thanh toán</Label>
              <select
                id="supplier_id"
                {...register("supplier_id")}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm shadow-xs"
              >
                <option value="">-- Chọn nhà cung cấp --</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.code}) — Đang nợ: {formatVND(s.current_debt)}
                  </option>
                ))}
              </select>
              {errors.supplier_id && <p className="mt-1 text-xs text-destructive">{errors.supplier_id.message}</p>}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="amount">Số tiền chi trả (VNĐ)</Label>
                <Input id="amount" type="number" step="1000" {...register("amount")} />
                {errors.amount && <p className="mt-1 text-xs text-destructive">{errors.amount.message}</p>}
              </div>
              <div>
                <Label htmlFor="payment_date">Ngày chi tiền</Label>
                <Input id="payment_date" type="date" {...register("payment_date")} />
              </div>
            </div>

            <div>
              <Label htmlFor="payment_method">Hình thức chi trả</Label>
              <select
                id="payment_method"
                {...register("payment_method")}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm shadow-xs"
              >
                <option value="bank_transfer">Ủy nhiệm chi / Chuyển khoản ngân hàng</option>
                <option value="cash">Tiền mặt thủ quỹ</option>
              </select>
            </div>

            <div>
              <Label htmlFor="notes">Ghi chú chi tiền</Label>
              <Input id="notes" placeholder="UNC số 9283 qua Techcombank..." {...register("notes")} />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Hủy
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Đang xử lý..." : "Xác nhận chi trả"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
