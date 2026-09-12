"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { menuItemSchema, type MenuItemInput } from "@/types/restaurant";
import { createMenuItem } from "@/server-actions/menu.actions";
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

export function AddMenuItemDialog() {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<MenuItemInput>({
    resolver: zodResolver(menuItemSchema),
    defaultValues: {
      category: "Món chính",
      selling_price: 150000,
      is_active: true,
    },
  });

  const onSubmit = async (data: MenuItemInput) => {
    const res = await createMenuItem(data);
    if (!res.success) {
      toast.error(res.error);
      return;
    }
    toast.success("Thêm món ăn thành công!");
    reset();
    setOpen(false);
    router.push(`/menu/${res.data.id}`);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="mr-1.5 size-4" />
          Thêm món ăn
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[480px]">
        <form onSubmit={handleSubmit(onSubmit)}>
          <DialogHeader>
            <DialogTitle>Thêm món ăn vào thực đơn</DialogTitle>
            <DialogDescription>
              Tạo món ăn mới và chuyển sang giao diện thiết lập định lượng nguyên liệu (BOM).
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="code">Mã món</Label>
                <Input id="code" placeholder="MN-STEAK-01" {...register("code")} />
                {errors.code && <p className="mt-1 text-xs text-destructive">{errors.code.message}</p>}
              </div>
              <div>
                <Label htmlFor="category">Danh mục</Label>
                <Input id="category" placeholder="Món chính, Khai vị..." {...register("category")} />
                {errors.category && <p className="mt-1 text-xs text-destructive">{errors.category.message}</p>}
              </div>
            </div>

            <div>
              <Label htmlFor="name">Tên món ăn</Label>
              <Input id="name" placeholder="Bò bít tết sốt tiêu" {...register("name")} />
              {errors.name && <p className="mt-1 text-xs text-destructive">{errors.name.message}</p>}
            </div>

            <div>
              <Label htmlFor="selling_price">Giá bán (VNĐ)</Label>
              <Input id="selling_price" type="number" step="1000" {...register("selling_price")} />
              {errors.selling_price && <p className="mt-1 text-xs text-destructive">{errors.selling_price.message}</p>}
            </div>

            <div>
              <Label htmlFor="description">Mô tả món ăn</Label>
              <Input id="description" placeholder="Khẩu phần 1 người, phục vụ kèm bánh mì..." {...register("description")} />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Hủy
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Đang tạo..." : "Tạo & Cài đặt BOM"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
