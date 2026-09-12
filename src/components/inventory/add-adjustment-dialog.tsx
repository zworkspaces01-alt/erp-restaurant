"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { adjustmentSchema, type AdjustmentInput } from "@/types/restaurant";
import { createAdjustment } from "@/server-actions/inventory.actions";
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

interface AddAdjustmentDialogProps {
  ingredients: Array<{ id: string; name: string; code: string; current_stock: number; base_unit: string }>;
}

export function AddAdjustmentDialog({ ingredients }: AddAdjustmentDialogProps) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<AdjustmentInput>({
    resolver: zodResolver(adjustmentSchema),
    defaultValues: {
      adjustment_type: "stocktake",
      new_stock: 0,
      reason: "",
    },
  });

  const selectedIngId = watch("ingredient_id");
  const selectedIng = ingredients.find((i) => i.id === selectedIngId);

  const onSubmit = async (data: AdjustmentInput) => {
    const res = await createAdjustment(data);
    if (!res.success) {
      toast.error(res.error);
      return;
    }
    toast.success("Đã ghi nhận điều chỉnh kho!");
    reset();
    setOpen(false);
    router.refresh();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="mr-1.5 size-4" />
          Tạo phiếu kiểm kê / hao hụt
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[480px]">
        <form onSubmit={handleSubmit(onSubmit)}>
          <DialogHeader>
            <DialogTitle>Kiểm kê & Điều chỉnh kho</DialogTitle>
            <DialogDescription>
              Ghi nhận chênh lệch kiểm kê thực tế hoặc hao hụt hư hỏng để cân bằng sổ kho.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div>
              <Label htmlFor="ingredient_id">Chọn nguyên liệu</Label>
              <select
                id="ingredient_id"
                {...register("ingredient_id")}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm shadow-xs focus:outline-hidden focus:ring-1 focus:ring-ring"
              >
                <option value="">-- Chọn nguyên liệu --</option>
                {ingredients.map((ing) => (
                  <option key={ing.id} value={ing.id}>
                    {ing.name} ({ing.code}) — Hiện tại: {Number(ing.current_stock).toLocaleString("vi-VN")} {ing.base_unit}
                  </option>
                ))}
              </select>
              {errors.ingredient_id && <p className="mt-1 text-xs text-destructive">{errors.ingredient_id.message}</p>}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="adjustment_type">Loại điều chỉnh</Label>
                <select
                  id="adjustment_type"
                  {...register("adjustment_type")}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm shadow-xs focus:outline-hidden focus:ring-1 focus:ring-ring"
                >
                  <option value="stocktake">Kiểm kê thực tế</option>
                  <option value="waste">Hao hụt sơ chế / rơi vãi</option>
                  <option value="spoilage">Hết hạn / Hư hỏng bỏ</option>
                  <option value="return">Trả hàng NCC</option>
                </select>
              </div>

              <div>
                <Label htmlFor="new_stock">
                  Số lượng tồn mới ({selectedIng?.base_unit || "ĐV"})
                </Label>
                <Input id="new_stock" type="number" step="any" {...register("new_stock")} />
                {errors.new_stock && <p className="mt-1 text-xs text-destructive">{errors.new_stock.message}</p>}
              </div>
            </div>

            <div>
              <Label htmlFor="reason">Lý do điều chỉnh</Label>
              <Input id="reason" placeholder="Kiểm kê ca sáng, hỏng do tủ mát mất điện..." {...register("reason")} />
              {errors.reason && <p className="mt-1 text-xs text-destructive">{errors.reason.message}</p>}
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Hủy
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Đang xử lý..." : "Cập nhật tồn kho"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
