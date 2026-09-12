"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { expenseRecordSchema, type ExpenseRecordInput } from "@/types/restaurant";
import { createExpenseRecord } from "@/server-actions/expenses.actions";
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

interface CategoryOption {
  id: string;
  name: string;
  code: string;
}

export function AddExpenseDialog({ categories }: { categories: CategoryOption[] }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ExpenseRecordInput>({
    resolver: zodResolver(expenseRecordSchema),
    defaultValues: {
      expense_date: todayISO(),
      payment_method: "bank_transfer",
      status: "paid",
      amount: 2000000,
    },
  });

  const onSubmit = async (data: ExpenseRecordInput) => {
    const res = await createExpenseRecord(data);
    if (!res.success) {
      toast.error(res.error);
      return;
    }
    toast.success("Ghi nhận chi phí thành công!");
    reset();
    setOpen(false);
    router.refresh();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="mr-1.5 size-4" />
          Ghi nhận chi phí
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[480px]">
        <form onSubmit={handleSubmit(onSubmit)}>
          <DialogHeader>
            <DialogTitle>Ghi nhận hóa đơn chi phí vận hành (OPEX)</DialogTitle>
            <DialogDescription>
              Ghi nhận các khoản chi cố định hoặc phát sinh (mặt bằng, điện nước, marketing, sửa chữa...).
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div>
              <Label htmlFor="category_id">Danh mục chi phí</Label>
              <select
                id="category_id"
                {...register("category_id")}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm shadow-xs"
              >
                <option value="">-- Chọn danh mục chi phí --</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.code})
                  </option>
                ))}
              </select>
              {errors.category_id && <p className="mt-1 text-xs text-destructive">{errors.category_id.message}</p>}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="amount">Số tiền chi (VNĐ)</Label>
                <Input id="amount" type="number" step="1000" {...register("amount")} />
                {errors.amount && <p className="mt-1 text-xs text-destructive">{errors.amount.message}</p>}
              </div>
              <div>
                <Label htmlFor="expense_date">Ngày chi</Label>
                <Input id="expense_date" type="date" {...register("expense_date")} />
              </div>
            </div>

            <div>
              <Label htmlFor="description">Mô tả nội dung chi</Label>
              <Input id="description" placeholder="Thanh toán tiền điện 3 pha, thay van gas..." {...register("description")} />
              {errors.description && <p className="mt-1 text-xs text-destructive">{errors.description.message}</p>}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="payment_method">Hình thức thanh toán</Label>
                <select
                  id="payment_method"
                  {...register("payment_method")}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm shadow-xs"
                >
                  <option value="bank_transfer">Chuyển khoản ngân hàng</option>
                  <option value="cash">Tiền mặt thủ quỹ</option>
                </select>
              </div>
              <div>
                <Label htmlFor="status">Trạng thái</Label>
                <select
                  id="status"
                  {...register("status")}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm shadow-xs"
                >
                  <option value="paid">Đã thanh toán</option>
                  <option value="pending">Chờ thanh toán</option>
                </select>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Hủy
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Đang lưu..." : "Lưu chi phí"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
