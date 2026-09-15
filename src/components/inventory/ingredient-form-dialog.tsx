"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  AlertTriangle,
  ArrowLeft,
  Building2,
  Camera,
  CheckCircle2,
  Hash,
  Loader2,
  MapPin,
  PackagePlus,
  Phone,
  Plus,
  Sparkles,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import type { z } from "zod";
import { ingredientSchema, type IngredientInput, type InventoryStatusRow } from "@/types/restaurant";
import { createIngredient, importIngredients, updateIngredient } from "@/server-actions/inventory.actions";
import { extractIngredientsFromImageAction } from "@/server-actions/ingredient-ocr.actions";
import type { IngredientOcrResult, IngredientParsedItem } from "@/lib/ai/ingredient-ocr";
import { useAction } from "@/hooks/use-action";
import { FormError, FormServerError, SubmitButton } from "@/components/shared";
import { Badge } from "@/components/ui/badge";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export interface SupplierOption {
  id: string;
  name: string;
}

export interface IngredientFormDialogProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  trigger?: React.ReactNode;
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
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
  trigger,
  suppliers,
  ingredient,
  categoryOptions,
}: IngredientFormDialogProps) {
  const router = useRouter();
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;
  const setOpen = (v: boolean) => {
    if (!v) {
      setBatchResult(null);
      setBatchItems([]);
    }
    if (isControlled) {
      controlledOnOpenChange?.(v);
    } else {
      setInternalOpen(v);
    }
  };

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

  const [supplierOptions, setSupplierOptions] = useState<SupplierOption[]>(suppliers);
  useEffect(() => {
    setSupplierOptions(suppliers);
  }, [suppliers]);

  const [isScanningLabel, setIsScanningLabel] = useState(false);
  const [batchResult, setBatchResult] = useState<IngredientOcrResult | null>(null);
  const [batchItems, setBatchItems] = useState<IngredientParsedItem[]>([]);
  const [isSubmittingBatch, setIsSubmittingBatch] = useState(false);

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

      // Cập nhật danh mục NCC vào state chọn lựa nếu nhận diện được nhà cung cấp mới
      if (res.data.supplier_id && (res.data.matched_supplier_name || res.data.supplier?.name)) {
        const newSupId = res.data.supplier_id;
        const newSupName = res.data.matched_supplier_name || res.data.supplier?.name || "Nhà cung cấp mới";
        setSupplierOptions((prev) => {
          if (!prev.some((s) => s.id === newSupId)) {
            return [{ id: newSupId, name: newSupName }, ...prev];
          }
          return prev;
        });
      }

      const items = res.data.items || [];
      if (items.length === 0) {
        toast.warning("AI không tìm thấy thông tin nguyên liệu trong ảnh.");
        return;
      }

      if (items.length === 1) {
        // Đúng 1 nguyên liệu: Điền thẳng vào form thêm nguyên liệu đơn
        const item = items[0];
        setValue("name", item.name);
        if (item.code) setValue("code", item.code);
        if (item.category) setValue("category", item.category);
        if (item.base_unit) setValue("base_unit", item.base_unit);
        if (item.import_unit) setValue("import_unit", item.import_unit);
        if (item.conversion_factor) setValue("conversion_factor", item.conversion_factor);
        if (item.default_price) setValue("default_price", item.default_price);
        if (item.min_alert_stock) setValue("min_alert_stock", item.min_alert_stock);
        if (item.note) setValue("note", item.note);
        if (res.data.supplier_id) setValue("default_supplier_id", res.data.supplier_id);
        toast.success(`Đã tự động điền nguyên liệu: ${item.name}!`);
      } else {
        setBatchResult(res.data);
        setBatchItems(items);
        toast.success(`AI đã quét trọn vẹn ${items.length} nguyên liệu từ ảnh!`);
      }

      if (res.data.duplicates_removed && res.data.duplicates_removed.length > 0) {
        toast.warning(
          `Đã phát hiện và tự động loại bỏ ${res.data.duplicates_removed.length} nguyên liệu trùng lặp (nhập sau): ${res.data.duplicates_removed.join(", ")}`,
          { duration: 6000 }
        );
      }
    } catch {
      toast.error("Lỗi khi quét ảnh nguyên liệu.");
    } finally {
      setIsScanningLabel(false);
    }
  };

  const handleUpdateBatchItem = (index: number, patch: Partial<IngredientParsedItem>) => {
    setBatchItems((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], ...patch };
      return copy;
    });
  };

  const handleAddBatchItem = () => {
    setBatchItems((prev) => [
      ...prev,
      {
        code: `NL-${String(prev.length + 1).padStart(3, "0")}`,
        name: "Nguyên liệu mới",
        category: categoryOptions?.[0] || "Gia vị",
        base_unit: "kg",
        import_unit: "kg",
        conversion_factor: 1,
        min_alert_stock: 0,
        default_price: 0,
        default_supplier_id: batchResult?.supplier_id || null,
        is_active: true,
        note: null,
      },
    ]);
  };

  const handleDeleteBatchItem = (index: number) => {
    setBatchItems((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSaveBatch = async () => {
    if (batchItems.length === 0) {
      toast.error("Không có nguyên liệu nào để lưu.");
      return;
    }

    const invalid = batchItems.find((it) => !it.name.trim() || !it.base_unit.trim());
    if (invalid) {
      toast.error("Vui lòng điền đầy đủ Tên nguyên liệu và Đơn vị cơ sở.");
      return;
    }

    const seenNames = new Set<string>();
    const seenCodes = new Set<string>();
    const dedupedItems: typeof batchItems = [];
    const manualDups: string[] = [];

    for (const it of batchItems) {
      const norm = it.name.trim().toLowerCase();
      const c = it.code?.trim().toUpperCase();
      if (seenNames.has(norm) || (c && seenCodes.has(c))) {
        manualDups.push(it.name.trim());
        continue;
      }
      seenNames.add(norm);
      if (c) seenCodes.add(c);
      dedupedItems.push(it);
    }

    if (manualDups.length > 0) {
      toast.info(`Đã loại bỏ ${manualDups.length} dòng trùng lặp: ${manualDups.join(", ")}`);
    }

    setIsSubmittingBatch(true);
    try {
      const payload: IngredientInput[] = dedupedItems.map((it) => ({
        code: it.code || null,
        name: it.name.trim(),
        category: it.category || null,
        base_unit: it.base_unit.trim(),
        import_unit: it.import_unit?.trim() || it.base_unit.trim(),
        conversion_factor: Number(it.conversion_factor) || 1,
        min_alert_stock: Number(it.min_alert_stock) || 0,
        default_price: Number(it.default_price) || 0,
        default_supplier_id: it.default_supplier_id || batchResult?.supplier_id || null,
        is_active: true,
        note: it.note || null,
      }));

      const supplierInfo = (batchResult?.supplier || batchResult?.matched_supplier_name) ? {
        id: batchResult.supplier_id || null,
        name: batchResult.matched_supplier_name || batchResult.supplier?.name || null,
        tax_code: batchResult.supplier?.tax_code || null,
        phone: batchResult.supplier?.phone || null,
        address: batchResult.supplier?.address || null,
        contact_name: batchResult.supplier?.contact_name || null,
      } : null;

      const res = await importIngredients(payload, "update", supplierInfo);
      if (!res.success) {
        toast.error(res.error);
        return;
      }

      const linkedSupName = res.data.supplier_name || batchResult?.matched_supplier_name || batchResult?.supplier?.name;

      toast.success(
        `Đã lưu thành công ${res.data.inserted} nguyên liệu mới${
          res.data.updated ? `, cập nhật ${res.data.updated}` : ""
        }${res.data.skipped ? `, bỏ qua ${res.data.skipped} trùng mã` : ""}${
          linkedSupName ? ` và tự động liên kết vào danh mục NCC "${linkedSupName}"` : ""
        }!`
      );

      setBatchResult(null);
      setBatchItems([]);
      setOpen(false);
      router.refresh();
    } catch {
      toast.error("Lỗi khi lưu danh sách nguyên liệu.");
    } finally {
      setIsSubmittingBatch(false);
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
        setOpen(false);
        router.refresh();
      },
    }
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger !== undefined ? (
        trigger ? <DialogTrigger asChild>{trigger}</DialogTrigger> : null
      ) : !isControlled ? (
        <DialogTrigger asChild>
          <Button size="sm" className="gap-1.5 bg-primary text-primary-foreground shadow-sm">
            <PackagePlus className="size-4" />
            <span>Thêm nguyên liệu</span>
          </Button>
        </DialogTrigger>
      ) : null}
      <DialogContent
        className={
          batchResult
            ? "sm:max-w-[95vw] lg:max-w-[92vw] xl:max-w-[1240px] w-full max-h-[92vh] overflow-hidden flex flex-col p-6 rounded-2xl"
            : "sm:max-w-[700px] w-full max-h-[92vh] overflow-y-auto p-6 rounded-2xl"
        }
      >
        {batchResult ? (
          <div className="flex flex-col h-full max-h-[85vh] space-y-3.5 overflow-hidden">
            <DialogHeader className="p-0 pb-2 border-b">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <DialogTitle className="text-base font-bold flex items-center gap-2">
                      Đã Quét Được {batchItems.length} Nguyên Liệu Từ Ảnh
                    </DialogTitle>
                    <Badge
                      variant="secondary"
                      className="text-xs font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10"
                    >
                      {batchItems.length} mặt hàng
                    </Badge>
                  </div>
                  <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                    Hệ thống đã nhận diện toàn bộ các mặt hàng trên ảnh. Bạn có thể sửa trực tiếp tên, đơn vị, hệ số quy đổi hoặc thêm/xóa dòng.
                  </DialogDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (batchItems[0]) {
                        const it = batchItems[0];
                        setValue("name", it.name);
                        if (it.code) setValue("code", it.code);
                        if (it.category) setValue("category", it.category);
                        if (it.base_unit) setValue("base_unit", it.base_unit);
                        if (it.import_unit) setValue("import_unit", it.import_unit);
                        if (it.conversion_factor) setValue("conversion_factor", it.conversion_factor);
                        if (it.default_price) setValue("default_price", it.default_price);
                        if (it.min_alert_stock) setValue("min_alert_stock", it.min_alert_stock);
                        if (it.note) setValue("note", it.note);
                      }
                      setBatchResult(null);
                      setBatchItems([]);
                    }}
                    className="gap-1.5 text-xs h-8"
                  >
                    <ArrowLeft className="size-3.5" /> Chuyển về nhập 1 nguyên liệu
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleAddBatchItem}
                    className="gap-1.5 text-xs h-8"
                  >
                    <Plus className="size-3.5" /> Thêm dòng
                  </Button>
                </div>
              </div>
            </DialogHeader>

            {/* Khung thông tin Nhà cung cấp nếu AI phát hiện được */}
            {(batchResult.supplier?.name || batchResult.matched_supplier_name) && (
              <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 space-y-2 shrink-0">
                <div className="flex items-center gap-2">
                  <div className="size-7 rounded-md bg-emerald-500/10 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shrink-0">
                    <Building2 className="size-4" />
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-semibold text-foreground">
                      {batchResult.matched_supplier_name || batchResult.supplier?.name}
                    </span>
                    <Badge
                      variant="outline"
                      className="text-[10px] px-1.5 py-0 border-emerald-500/30 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 gap-1 font-medium"
                    >
                      <CheckCircle2 className="size-2.5" /> Tự động liên kết NCC
                    </Badge>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1 border-t border-emerald-500/10 text-xs">
                  {batchResult.supplier?.tax_code && (
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <Hash className="size-3.5 text-emerald-600 shrink-0" />
                      <span>MST: <strong className="text-foreground font-medium">{batchResult.supplier.tax_code}</strong></span>
                    </div>
                  )}
                  {batchResult.supplier?.phone && (
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <Phone className="size-3.5 text-emerald-600 shrink-0" />
                      <span>SĐT: <strong className="text-foreground font-medium">{batchResult.supplier.phone}</strong></span>
                    </div>
                  )}
                  {batchResult.supplier?.address && (
                    <div className="flex items-center gap-1.5 text-muted-foreground sm:col-span-3">
                      <MapPin className="size-3.5 text-emerald-600 shrink-0" />
                      <span className="truncate">Địa chỉ: <strong className="text-foreground font-medium">{batchResult.supplier.address}</strong></span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Cảnh báo nguyên liệu trùng lặp đã tự động loại bỏ */}
            {batchResult.duplicates_removed && batchResult.duplicates_removed.length > 0 && (
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 flex items-start gap-2.5 text-xs text-amber-900 dark:text-amber-200 shrink-0">
                <AlertTriangle className="size-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <div className="space-y-0.5">
                  <p className="font-semibold">
                    Đã tự động loại bỏ {batchResult.duplicates_removed.length} nguyên liệu trùng lặp (nhập sau):
                  </p>
                  <p className="text-[11px] opacity-90 leading-relaxed">
                    {batchResult.duplicates_removed.join(", ")}
                  </p>
                </div>
              </div>
            )}

            {/* Bảng chỉnh sửa danh sách nguyên liệu */}
            <div className="flex-1 overflow-y-auto border rounded-xl">
              <table className="w-full text-xs text-left">
                <thead className="bg-muted/50 border-b sticky top-0 z-10 backdrop-blur-sm">
                  <tr>
                    <th className="p-2 min-w-[150px]">Tên nguyên liệu</th>
                    <th className="p-2 min-w-[110px]">Mã gợi ý</th>
                    <th className="p-2 min-w-[120px]">Danh mục</th>
                    <th className="p-2 min-w-[70px]">ĐV cơ sở</th>
                    <th className="p-2 min-w-[70px]">ĐV nhập</th>
                    <th className="p-2 text-center min-w-[70px]" title="1 Đơn vị nhập = ? Đơn vị cơ sở">Hệ số</th>
                    <th className="p-2 text-right min-w-[95px]">Giá nhập (VNĐ)</th>
                    <th className="p-2 text-center min-w-[75px]" title="Cảnh báo tồn tối thiểu">Tồn min</th>
                    <th className="p-2 w-[40px]"></th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {batchItems.map((it, idx) => (
                    <tr key={idx} className="hover:bg-muted/30 transition-colors">
                      <td className="p-1.5">
                        <Input
                          value={it.name}
                          onChange={(e) => handleUpdateBatchItem(idx, { name: e.target.value })}
                          className="h-7 text-xs font-medium"
                          placeholder="Tên nguyên liệu"
                        />
                      </td>
                      <td className="p-1.5">
                        <Input
                          value={it.code || ""}
                          onChange={(e) => handleUpdateBatchItem(idx, { code: e.target.value })}
                          className="h-7 text-xs font-mono"
                          placeholder="NL-..."
                        />
                      </td>
                      <td className="p-1.5">
                        <Input
                          value={it.category || ""}
                          onChange={(e) => handleUpdateBatchItem(idx, { category: e.target.value })}
                          className="h-7 text-xs"
                          placeholder="Danh mục..."
                        />
                      </td>
                      <td className="p-1.5">
                        <Input
                          value={it.base_unit}
                          onChange={(e) => handleUpdateBatchItem(idx, { base_unit: e.target.value })}
                          className="h-7 text-xs text-center"
                          placeholder="kg, g..."
                        />
                      </td>
                      <td className="p-1.5">
                        <Input
                          value={it.import_unit || it.base_unit}
                          onChange={(e) => handleUpdateBatchItem(idx, { import_unit: e.target.value })}
                          className="h-7 text-xs text-center"
                          placeholder="bao, thùng..."
                        />
                      </td>
                      <td className="p-1.5">
                        <Input
                          type="number"
                          step="any"
                          min="0.001"
                          value={it.conversion_factor}
                          onChange={(e) =>
                            handleUpdateBatchItem(idx, { conversion_factor: parseFloat(e.target.value) || 1 })
                          }
                          className="h-7 text-xs text-center"
                        />
                      </td>
                      <td className="p-1.5">
                        <Input
                          type="number"
                          min="0"
                          value={it.default_price || ""}
                          onChange={(e) =>
                            handleUpdateBatchItem(idx, { default_price: parseInt(e.target.value, 10) || 0 })
                          }
                          className="h-7 text-xs text-right"
                          placeholder="0"
                        />
                      </td>
                      <td className="p-1.5">
                        <Input
                          type="number"
                          min="0"
                          value={it.min_alert_stock || ""}
                          onChange={(e) =>
                            handleUpdateBatchItem(idx, { min_alert_stock: parseFloat(e.target.value) || 0 })
                          }
                          className="h-7 text-xs text-center"
                          placeholder="0"
                        />
                      </td>
                      <td className="p-1.5 text-center">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDeleteBatchItem(idx)}
                          className="size-7 text-muted-foreground hover:text-destructive"
                          title="Xóa dòng"
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <DialogFooter className="pt-2 border-t flex items-center justify-between sm:justify-between w-full">
              <span className="text-xs text-muted-foreground">
                Tổng cộng <strong>{batchItems.length}</strong> nguyên liệu sẽ được lưu vào kho.
              </span>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setBatchResult(null);
                    setBatchItems([]);
                  }}
                >
                  Hủy & Quay lại
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={isSubmittingBatch || batchItems.length === 0}
                  onClick={handleSaveBatch}
                  className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm"
                >
                  {isSubmittingBatch ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <CheckCircle2 className="size-3.5" />
                  )}
                  <span>Lưu tất cả {batchItems.length} nguyên liệu</span>
                </Button>
              </div>
            </DialogFooter>
          </div>
        ) : (
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
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 rounded-lg cursor-pointer border border-emerald-500/20 transition-all shadow-sm"
                    title="Quét ảnh nhãn đơn hoặc danh sách nhiều nguyên liệu"
                  >
                    {isScanningLabel ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Camera className="size-3.5" />
                    )}
                    <span>{isScanningLabel ? "Đang quét toàn bộ..." : "Quét ảnh / bảng giá AI"}</span>
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

          {/* Quy cách & Đơn vị tính */}
          <div className="p-3.5 rounded-xl bg-muted/40 border space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-foreground uppercase tracking-wider">
                Quy cách & Đơn vị tính
              </span>
              {importUnit && baseUnit && (
                <span className="text-[11px] text-muted-foreground font-medium">
                  1 {importUnit} = {convFactor || 1} {baseUnit}
                </span>
              )}
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="import_unit">Đơn vị nhập *</Label>
                <Input id="import_unit" placeholder="kg, thùng, hộp..." {...register("import_unit")} />
                <FormError message={errors.import_unit?.message} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="base_unit">Đơn vị cơ sở *</Label>
                <Input id="base_unit" placeholder="g, ml, lon..." {...register("base_unit")} />
                <FormError message={errors.base_unit?.message} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="conversion_factor">Hệ số quy đổi *</Label>
                <Input id="conversion_factor" type="number" step="any" {...register("conversion_factor")} />
                <FormError message={errors.conversion_factor?.message} />
              </div>
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
                    {supplierOptions.map((s) => (
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
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Hủy
            </Button>
            <SubmitButton pending={pending} pendingText="Đang lưu...">
              {isEdit ? "Lưu thay đổi" : "Thêm nguyên liệu"}
            </SubmitButton>
          </DialogFooter>
        </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
