"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Camera, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import type { z } from "zod";
import { ingredientSchema, type IngredientInput, type InventoryStatusRow } from "@/types/restaurant";
import { createIngredient, updateIngredient } from "@/server-actions/inventory.actions";
import { extractIngredientsFromImageAction } from "@/server-actions/ingredient-ocr.actions";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export interface SupplierOption {
  id: string;
  name: string;
}

interface IngredientFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  suppliers: SupplierOption[];
  /** Undefined = tạo mới. */
  ingredient?: InventoryStatusRow | null;
  categoryOptions?: string[];
}

type FormValues = z.input<typeof ingredientSchema>;

const NO_SUPPLIER = "__none__";
const NO_CATEGORY = "__none__";

function toDefaults(row?: InventoryStatusRow | null): FormValues {
  const factor = Number(row?.conversion_factor ?? 1);
  const avgCostPerImport = Number(row?.avg_cost_per_import_unit ?? 0);
  const calculatedPrice = avgCostPerImport > 0 ? avgCostPerImport : Math.round(Number(row?.avg_cost_price ?? 0) * factor);

  return {
    code: row?.code ?? "",
    name: row?.name ?? "",
    category: row?.category ?? "",
    base_unit: row?.base_unit ?? "",
    import_unit: row?.import_unit ?? "",
    conversion_factor: factor,
    min_alert_stock: Number(row?.min_alert_stock ?? 0),
    default_price: calculatedPrice > 0 ? calculatedPrice : 0,
    default_supplier_id: row?.default_supplier_id ?? null,
    is_active: row?.is_active ?? true,
    note: row?.note ?? "",
  };
}

export function IngredientFormDialog({
  open,
  onOpenChange,
  suppliers,
  ingredient,
  categoryOptions,
}: IngredientFormDialogProps) {
  const router = useRouter();
  const isEdit = Boolean(ingredient?.id);

  const categories = useMemo(() => {
    if (!categoryOptions || categoryOptions.length === 0) return [];
    if (ingredient?.category && !categoryOptions.includes(ingredient.category)) {
      return [ingredient.category, ...categoryOptions];
    }
    return categoryOptions;
  }, [categoryOptions, ingredient?.category]);

  const {
    register,
    handleSubmit,
    control,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<FormValues, unknown, IngredientInput>({
    resolver: zodResolver(ingredientSchema),
    defaultValues: toDefaults(ingredient),
  });

  const [isScanningLabel, setIsScanningLabel] = useState(false);

  const handleScanLabel = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("Vui lòng chọn file hình ảnh (PNG, JPG, WEBP).");
      return;
    }

    setIsScanningLabel(true);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await extractIngredientsFromImageAction(formData);
      if (!res.success) {
        toast.error(res.error);
        return;
      }

      const item = res.data.items[0];
      if (item) {
        setValue("name", item.name);
        if (item.code) setValue("code", item.code);
        if (item.category) setValue("category", item.category);
        if (item.base_unit) setValue("base_unit", item.base_unit);
        if (item.import_unit) setValue("import_unit", item.import_unit);
        if (item.conversion_factor) setValue("conversion_factor", item.conversion_factor);
        if (item.default_price) setValue("default_price", item.default_price);
        if (item.min_alert_stock) setValue("min_alert_stock", item.min_alert_stock);
        if (item.note) setValue("note", item.note);
        toast.success(`Đã tự động điền: ${item.name}!`);
      } else {
        toast.warning("AI không tìm thấy thông tin nguyên liệu trong ảnh.");
      }
    } catch {
      toast.error("Lỗi khi quét ảnh nhãn nguyên liệu.");
    } finally {
      setIsScanningLabel(false);
    }
  };

  const importUnit = watch("import_unit");
  const baseUnit = watch("base_unit");
  const convFactor = watch("conversion_factor");
  const defaultPrice = watch("default_price");

  useEffect(() => {
    if (open) reset(toDefaults(ingredient));
  }, [open, ingredient, reset]);

  const { execute, pending, error } = useAction<IngredientInput, { id: string }>(
    async (values) =>
      ingredient?.id ? updateIngredient(ingredient.id, values) : createIngredient(values),
    {
      successMessage: isEdit ? "Đã cập nhật nguyên liệu" : "Đã thêm nguyên liệu",
      onSuccess: () => {
        onOpenChange(false);
        router.refresh();
      },
    }
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px]">
        <form onSubmit={handleSubmit((values) => void execute(values))} className="space-y-4">
          <DialogHeader>
            <div className="flex items-center justify-between pr-6">
              <div>
                <DialogTitle>{isEdit ? "Sửa nguyên liệu" : "Thêm nguyên liệu"}</DialogTitle>
                <DialogDescription>
                  Tồn kho và giá vốn bình quân do hệ thống tự tính từ phiếu nhập và sổ kho.
                </DialogDescription>
              </div>
              {!isEdit && (
                <div>
                  <label
                    htmlFor="scan_single_label"
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 rounded-md cursor-pointer border border-emerald-500/20 transition-colors"
                  >
                    {isScanningLabel ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Camera className="size-3.5" />
                    )}
                    <span>{isScanningLabel ? "Đang quét..." : "Quét ảnh bao bì"}</span>
                    <Sparkles className="size-3 text-amber-500" />
                  </label>
                  <input
                    id="scan_single_label"
                    type="file"
                    accept="image/*"
                    disabled={isScanningLabel}
                    className="sr-only"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void handleScanLabel(f);
                    }}
                  />
                </div>
              )}
            </div>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="code">Mã nguyên liệu</Label>
              <Input id="code" placeholder="NL-BEEF-01" {...register("code")} />
              <FormError message={errors.code?.message} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="category">Danh mục</Label>
              {categories.length > 0 ? (
                <Controller
                  control={control}
                  name="category"
                  render={({ field }) => (
                    <Select
                      value={field.value ? field.value : NO_CATEGORY}
                      onValueChange={(v) => field.onChange(v === NO_CATEGORY ? "" : v)}
                    >
                      <SelectTrigger id="category">
                        <SelectValue placeholder="Chọn danh mục" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NO_CATEGORY}>Chưa phân loại</SelectItem>
                        {categories.map((c) => (
                          <SelectItem key={c} value={c}>
                            {c}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              ) : (
                <Input id="category" placeholder="Thịt / Hải sản" {...register("category")} />
              )}
              <FormError message={errors.category?.message} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="name">Tên nguyên liệu *</Label>
            <Input id="name" placeholder="Thăn bò Úc" {...register("name")} />
            <FormError message={errors.name?.message} />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="import_unit">Đơn vị nhập *</Label>
              <Input id="import_unit" placeholder="kg" {...register("import_unit")} />
              <FormError message={errors.import_unit?.message} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="base_unit">Đơn vị cơ sở *</Label>
              <Input id="base_unit" placeholder="g" {...register("base_unit")} />
              <FormError message={errors.base_unit?.message} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="conversion_factor">Hệ số quy đổi *</Label>
              <Input id="conversion_factor" type="number" step="any" {...register("conversion_factor")} />
              <FormError message={errors.conversion_factor?.message} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="default_price">
                Đơn giá nhập ngầm định (VND{importUnit ? ` / ${importUnit}` : ""})
              </Label>
              <Input
                id="default_price"
                type="number"
                min={0}
                step={1000}
                placeholder="0"
                {...register("default_price", { valueAsNumber: true })}
              />
              {Number(defaultPrice) > 0 && Number(convFactor) > 0 && (
                <p className="text-[11px] text-muted-foreground">
                  ≈ {Math.round(Number(defaultPrice) / Number(convFactor)).toLocaleString("vi-VN")} đ / {baseUnit || "ĐV cơ sở"}
                </p>
              )}
              <FormError message={errors.default_price?.message} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="min_alert_stock">
                Tồn tối thiểu {baseUnit ? `(${baseUnit})` : "(ĐV cơ sở)"}
              </Label>
              <Input id="min_alert_stock" type="number" step="any" {...register("min_alert_stock")} />
              <FormError message={errors.min_alert_stock?.message} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="default_supplier_id">Nhà cung cấp mặc định</Label>
            <Controller
              control={control}
              name="default_supplier_id"
              render={({ field }) => (
                <Select
                  value={field.value ?? NO_SUPPLIER}
                  onValueChange={(v) => field.onChange(v === NO_SUPPLIER ? null : v)}
                >
                  <SelectTrigger id="default_supplier_id" className="w-full">
                    <SelectValue placeholder="Chọn nhà cung cấp" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_SUPPLIER}>Không chọn</SelectItem>
                    {suppliers.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            <FormError message={errors.default_supplier_id?.message} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="note">Ghi chú</Label>
            <Textarea id="note" rows={2} {...register("note")} />
            <FormError message={errors.note?.message} />
          </div>

          <Controller
            control={control}
            name="is_active"
            render={({ field }) => (
              <div className="flex items-center gap-2">
                <Checkbox
                  id="is_active"
                  checked={field.value}
                  onCheckedChange={(v) => field.onChange(v === true)}
                />
                <Label htmlFor="is_active" className="font-normal">
                  Đang sử dụng
                </Label>
              </div>
            )}
          />

          <FormServerError message={error} />

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Hủy
            </Button>
            <SubmitButton pending={pending} pendingText="Đang lưu...">
              {isEdit ? "Lưu thay đổi" : "Thêm nguyên liệu"}
            </SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
