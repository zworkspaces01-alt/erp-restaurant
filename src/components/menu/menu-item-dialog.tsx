"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Layers, Plus, Utensils } from "lucide-react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { menuItemSchema, type MenuItemInput } from "@/types/restaurant";
import { createMenuItem, updateMenuItem } from "@/server-actions/menu.actions";
import { useAction } from "@/hooks/use-action";
import { FormError, FormServerError, SubmitButton } from "@/components/shared";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export interface MenuItemDialogValues {
  id: string;
  code: string | null;
  name: string;
  category: string | null;
  item_group?: string | null;
  selling_price: number;
  tax_percent?: number;
  is_active: boolean;
  is_combo?: boolean;
  description: string | null;
  image_url: string | null;
}

interface MenuItemDialogProps {
  /** Bỏ trống = tạo món mới. */
  item?: MenuItemDialogValues;
  trigger?: React.ReactNode;
  /** Mở trang định lượng ngay sau khi tạo món mới. */
  gotoRecipeOnCreate?: boolean;
  categoryOptions?: string[];
}

const NO_CATEGORY = "__none__";

type MenuItemFormValues = z.input<typeof menuItemSchema>;

function toFormValues(item?: MenuItemDialogValues): MenuItemFormValues {
  return {
    code: item?.code ?? "",
    name: item?.name ?? "",
    category: item?.category ?? "",
    item_group: item?.item_group ?? "",
    selling_price: item?.selling_price ?? 0,
    tax_percent: item?.tax_percent ?? 0,
    is_active: item?.is_active ?? true,
    is_combo: item?.is_combo ?? false,
    description: item?.description ?? "",
    image_url: item?.image_url ?? "",
  };
}

export function MenuItemDialog({
  item,
  trigger,
  gotoRecipeOnCreate = false,
  categoryOptions,
}: MenuItemDialogProps) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const isEdit = Boolean(item);

  const categories = useMemo(() => {
    const baseList = categoryOptions ?? [];
    if (item?.category && !baseList.includes(item.category)) {
      return [item.category, ...baseList];
    }
    return baseList;
  }, [categoryOptions, item?.category]);

  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<MenuItemFormValues, unknown, MenuItemInput>({
    resolver: zodResolver(menuItemSchema),
    defaultValues: toFormValues(item),
  });

  useEffect(() => {
    if (open) reset(toFormValues(item));
  }, [open, item, reset]);

  const { execute, pending, error } = useAction<MenuItemInput, { id: string }>(
    async (values) => (isEdit && item ? updateMenuItem(item.id, values) : createMenuItem(values)),
    {
      successMessage: isEdit ? "Đã cập nhật món ăn" : "Đã thêm món ăn",
      onSuccess: (data) => {
        setOpen(false);
        if (!isEdit && gotoRecipeOnCreate) router.push(`/menu/${data.id}`);
        else router.refresh();
      },
    }
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm">
            <Plus className="size-4" />
            Thêm món
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {isEdit
              ? item?.is_combo
                ? "Sửa thông tin Combo"
                : "Sửa món ăn"
              : "Thêm món mới"}
          </DialogTitle>
          <DialogDescription>
            {item?.is_combo
              ? "Combo gồm nhiều món đơn lẻ. Giá vốn tính tự động từ tổng các món con."
              : "Giá vốn chuẩn và Food Cost % được tính tự động từ định lượng (BOM) của món."}
          </DialogDescription>
        </DialogHeader>

        <form
          id="menu-item-form"
          onSubmit={handleSubmit((values) => {
            void execute(values);
          })}
          className="grid gap-4"
        >
          {/* Loại món: Món đơn lẻ vs Combo */}
          <div className="grid gap-1.5">
            <Label className="text-xs text-muted-foreground">Loại món</Label>
            <Controller
              control={control}
              name="is_combo"
              render={({ field }) => (
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={isEdit}
                    onClick={() => field.onChange(false)}
                    className={cn(
                      "flex items-start gap-2.5 rounded-lg border p-2.5 text-left transition-colors",
                      !field.value
                        ? "border-primary bg-primary/5 text-primary"
                        : "border-border text-muted-foreground hover:border-foreground/20",
                      isEdit && "cursor-not-allowed opacity-75"
                    )}
                  >
                    <Utensils className="mt-0.5 size-4 shrink-0" />
                    <div>
                      <p className="text-sm font-semibold leading-none">Món đơn lẻ</p>
                      <p className="mt-1 text-[11px] font-normal text-muted-foreground leading-snug">
                        Định lượng từ nguyên liệu kho (BOM)
                      </p>
                    </div>
                  </button>

                  <button
                    type="button"
                    disabled={isEdit}
                    onClick={() => field.onChange(true)}
                    className={cn(
                      "flex items-start gap-2.5 rounded-lg border p-2.5 text-left transition-colors",
                      field.value
                        ? "border-primary bg-primary/5 text-primary"
                        : "border-border text-muted-foreground hover:border-foreground/20",
                      isEdit && "cursor-not-allowed opacity-75"
                    )}
                  >
                    <Layers className="mt-0.5 size-4 shrink-0" />
                    <div>
                      <p className="text-sm font-semibold leading-none">Combo / Set menu</p>
                      <p className="mt-1 text-[11px] font-normal text-muted-foreground leading-snug">
                        Tập hợp từ các món đơn lẻ
                      </p>
                    </div>
                  </button>
                </div>
              )}
            />
            {isEdit && (
              <p className="text-[11px] text-muted-foreground">
                Không thể đổi loại món sau khi tạo để bảo toàn dữ liệu định lượng.
              </p>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="grid gap-1.5">
              <Label htmlFor="mi-code">Mã món</Label>
              <Input id="mi-code" placeholder="MON-001" {...register("code")} />
              <FormError message={errors.code?.message} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="mi-price">Giá bán (VND)</Label>
              <Input id="mi-price" type="number" min={0} step={1000} {...register("selling_price")} />
              <FormError message={errors.selling_price?.message} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="mi-tax">Thuế (%)</Label>
              <Input id="mi-tax" type="number" min={0} max={100} step={1} placeholder="0" {...register("tax_percent")} />
              <FormError message={errors.tax_percent?.message} />
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="mi-name">Tên món</Label>
            <Input id="mi-name" placeholder="Phở bò tái" {...register("name")} />
            <FormError message={errors.name?.message} />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="mi-category">Danh mục</Label>
              {categories.length > 0 ? (
                <Controller
                  control={control}
                  name="category"
                  render={({ field }) => (
                    <Select
                      value={field.value ? field.value : NO_CATEGORY}
                      onValueChange={(v) => field.onChange(v === NO_CATEGORY ? "" : v)}
                    >
                      <SelectTrigger id="mi-category">
                        <SelectValue placeholder="Chọn danh mục" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NO_CATEGORY}>Chưa phân loại</SelectItem>
                        {categories.map((c: string) => (
                          <SelectItem key={c} value={c}>
                            {c}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              ) : (
                <Input
                  id="mi-category"
                  placeholder="Khai vị, Đồ uống, Món chính..."
                  {...register("category")}
                />
              )}
              <FormError message={errors.category?.message} />
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="mi-item-group">Nhóm món</Label>
              <Input
                id="mi-item-group"
                placeholder="VD: Trà trái cây, Cà phê, Món nướng..."
                {...register("item_group")}
              />
              <FormError message={errors.item_group?.message} />
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="mi-description">Mô tả</Label>
            <Textarea id="mi-description" rows={2} {...register("description")} />
            <FormError message={errors.description?.message} />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="mi-image">Ảnh (URL)</Label>
            <Input id="mi-image" placeholder="https://..." {...register("image_url")} />
            <FormError message={errors.image_url?.message} />
          </div>

          <Controller
            control={control}
            name="is_active"
            render={({ field }) => (
              <div className="flex items-center gap-2">
                <Checkbox
                  id="mi-active"
                  checked={field.value}
                  onCheckedChange={(v) => field.onChange(v === true)}
                />
                <Label htmlFor="mi-active" className="font-normal">
                  Đang bán
                </Label>
              </div>
            )}
          />

          <FormServerError message={error} />
        </form>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            Hủy
          </Button>
          <SubmitButton form="menu-item-form" pending={pending} pendingText="Đang lưu...">
            {isEdit ? "Lưu thay đổi" : "Thêm món"}
          </SubmitButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
