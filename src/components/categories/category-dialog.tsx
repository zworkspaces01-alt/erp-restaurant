"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { categorySchema, type CategoryInput } from "@/types/restaurant";
import {
  createCategory,
  updateCategory,
  type CategoryType,
} from "@/server-actions/categories.actions";
import type { CategoryListItem } from "@/lib/queries/categories.queries";
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
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";

interface CategoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  type: CategoryType;
  category?: CategoryListItem | null;
}

type FormValues = z.input<typeof categorySchema>;

function toDefaults(cat?: CategoryListItem | null): FormValues {
  return {
    name: cat?.name ?? "",
    description: cat?.description ?? "",
    display_order: cat?.display_order ?? 0,
    is_active: cat?.is_active ?? true,
  };
}

export function CategoryDialog({
  open,
  onOpenChange,
  type,
  category,
}: CategoryDialogProps) {
  const router = useRouter();
  const isEdit = Boolean(category?.id);
  const typeLabel = type === "menu" ? "món ăn" : "nguyên liệu";

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors },
  } = useForm<FormValues, unknown, CategoryInput>({
    resolver: zodResolver(categorySchema),
    defaultValues: toDefaults(category),
  });

  useEffect(() => {
    if (open) {
      reset(toDefaults(category));
    }
  }, [open, category, reset]);

  const { execute, pending, error } = useAction<CategoryInput, { id?: string } | null>(
    async (values) =>
      category?.id
        ? updateCategory(type, category.id, values)
        : createCategory(type, values),
    {
      successMessage: isEdit
        ? `Đã cập nhật danh mục ${typeLabel}`
        : `Đã tạo danh mục ${typeLabel} mới`,
      onSuccess: () => {
        onOpenChange(false);
        router.refresh();
      },
    }
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <form onSubmit={handleSubmit((values) => void execute(values))} className="space-y-4">
          <DialogHeader>
            <DialogTitle>
              {isEdit ? `Sửa danh mục ${typeLabel}` : `Thêm danh mục ${typeLabel}`}
            </DialogTitle>
            <DialogDescription>
              {isEdit
                ? `Nếu đổi tên danh mục, toàn bộ ${typeLabel} thuộc danh mục cũ sẽ tự động được cập nhật sang tên mới.`
                : `Thêm nhóm danh mục mới để phân loại ${typeLabel}.`}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-1.5">
            <Label htmlFor="cat-name">Tên danh mục *</Label>
            <Input
              id="cat-name"
              placeholder={type === "menu" ? "VD: Khai vị, Món chính, Đồ uống" : "VD: Thịt / Hải sản, Rau củ, Gia vị"}
              {...register("name")}
            />
            <FormError message={errors.name?.message} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cat-order">Thứ tự hiển thị</Label>
            <Input
              id="cat-order"
              type="number"
              placeholder="0"
              {...register("display_order", { valueAsNumber: true })}
            />
            <p className="text-xs text-muted-foreground">
              Số nhỏ hơn sẽ hiển thị trước trong danh sách chọn.
            </p>
            <FormError message={errors.display_order?.message} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cat-desc">Mô tả (tùy chọn)</Label>
            <Textarea
              id="cat-desc"
              rows={2}
              placeholder="Ghi chú thêm về danh mục này..."
              {...register("description")}
            />
            <FormError message={errors.description?.message} />
          </div>

          <div className="flex items-center space-x-2 pt-1">
            <Controller
              control={control}
              name="is_active"
              render={({ field }) => (
                <Checkbox
                  id="cat-active"
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
              )}
            />
            <Label htmlFor="cat-active" className="cursor-pointer font-normal">
              Đang hoạt động (cho phép chọn khi tạo / sửa {typeLabel})
            </Label>
          </div>

          {error && <FormServerError message={error} />}

          <DialogFooter className="gap-2 pt-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={pending}
            >
              Hủy
            </Button>
            <SubmitButton pending={pending}>
              {isEdit ? "Lưu thay đổi" : "Tạo danh mục"}
            </SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
