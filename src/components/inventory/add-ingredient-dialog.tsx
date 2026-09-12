"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { ingredientSchema, type IngredientInput } from "@/types/restaurant";
import { createIngredient } from "@/server-actions/inventory.actions";
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

export function AddIngredientDialog() {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<IngredientInput>({
    resolver: zodResolver(ingredientSchema),
    defaultValues: {
      category: "Thịt & Hải sản",
      conversion_factor: 1000,
      min_alert_stock: 1000,
    },
  });

  const onSubmit = async (data: IngredientInput) => {
    const res = await createIngredient(data);
    if (!res.success) {
      toast.error(res.error);
      return;
    }
    toast.success("Thêm nguyên liệu thành công!");
    reset();
    setOpen(false);
    router.refresh();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="mr-1.5 size-4" />
          Thêm nguyên liệu
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[480px]">
        <form onSubmit={handleSubmit(onSubmit)}>
          <DialogHeader>
            <DialogTitle>Thêm nguyên liệu mới</DialogTitle>
            <DialogDescription>
              Khai báo nguyên liệu, quy cách quy đổi đơn vị nhập và đơn vị cơ sở cho công thức món.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="code">Mã nguyên liệu</Label>
                <Input id="code" placeholder="NL-BEEF-01" {...register("code")} />
                {errors.code && <p className="mt-1 text-xs text-destructive">{errors.code.message}</p>}
              </div>
              <div>
                <Label htmlFor="category">Danh mục</Label>
                <Input id="category" placeholder="Thịt & Hải sản" {...register("category")} />
                {errors.category && <p className="mt-1 text-xs text-destructive">{errors.category.message}</p>}
              </div>
            </div>

            <div>
              <Label htmlFor="name">Tên nguyên liệu</Label>
              <Input id="name" placeholder="Thịt thăn bò Úc" {...register("name")} />
              {errors.name && <p className="mt-1 text-xs text-destructive">{errors.name.message}</p>}
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label htmlFor="import_unit">Đơn vị nhập</Label>
                <Input id="import_unit" placeholder="kg" {...register("import_unit")} />
                {errors.import_unit && <p className="mt-1 text-xs text-destructive">{errors.import_unit.message}</p>}
              </div>
              <div>
                <Label htmlFor="base_unit">Đơn vị cơ sở</Label>
                <Input id="base_unit" placeholder="g" {...register("base_unit")} />
                {errors.base_unit && <p className="mt-1 text-xs text-destructive">{errors.base_unit.message}</p>}
              </div>
              <div>
                <Label htmlFor="conversion_factor">Hệ số quy đổi</Label>
                <Input id="conversion_factor" type="number" step="any" {...register("conversion_factor")} />
                {errors.conversion_factor && <p className="mt-1 text-xs text-destructive">{errors.conversion_factor.message}</p>}
              </div>
            </div>

            <div>
              <Label htmlFor="min_alert_stock">Mức tồn cảnh báo tối thiểu (theo ĐV cơ sở)</Label>
              <Input id="min_alert_stock" type="number" step="any" {...register("min_alert_stock")} />
              {errors.min_alert_stock && <p className="mt-1 text-xs text-destructive">{errors.min_alert_stock.message}</p>}
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Hủy
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Đang lưu..." : "Lưu nguyên liệu"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
