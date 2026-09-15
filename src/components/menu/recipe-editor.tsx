"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  ChevronsUpDown,
  Download,
  Plus,
  RotateCcw,
  SlidersHorizontal,
  Trash2,
  Utensils,
  Sparkles,
} from "lucide-react";
import type { IngredientOption, MenuItemCost, RecipeLineCost } from "@/lib/queries/menu.queries";
import { saveRecipeCosting } from "@/server-actions/menu.actions";
import { useAction } from "@/hooks/use-action";
import {
  calcCostingLineAmount,
  type RecipeCostingInput,
  type RecipeCostingLineInput,
} from "@/types/restaurant";
import { formatNumber, formatPercent, formatVND } from "@/lib/format";
import { exportDishCostingExcel } from "@/lib/excel";
import {
  ConfirmDialog,
  EmptyState,
  FormServerError,
  StatusBadge,
  SubmitButton,
  foodCostTone,
} from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

export interface EditorLine {
  id: string;
  ingredient_id: string | null;
  ingredient_code: string | null;
  ingredient_name: string;
  /** ĐVT dùng trong món (ví dụ: Gram, ml, Lá, Pack, pcs) */
  portion_unit: string;
  /** Định lượng dùng cho 1 phần ăn */
  portion_quantity: string;
  /** Quy cách mua / đóng gói gốc (ví dụ: 1000g, 100 lá) */
  package_quantity: string;
  /** ĐVT mua / đóng gói gốc (ví dụ: Gram, Lá, Gói, Hộp, kg) */
  package_unit: string;
  /** Đơn giá mua theo gói/quy cách mua (VND) */
  package_price: string;
  /** Hao hụt % sơ chế */
  waste_percent: string;
  note: string;
}

interface RecipeEditorProps {
  menuItem: MenuItemCost;
  initialLines: RecipeLineCost[];
  ingredients: IngredientOption[];
}

function toEditorLine(line: RecipeLineCost): EditorLine {
  const conv = line.conversion_factor && line.conversion_factor > 0 ? line.conversion_factor : 1;
  const pkgPrice = line.avg_cost_price > 0 ? Math.round(line.avg_cost_price * conv) : 0;
  return {
    id: line.ingredient_id,
    ingredient_id: line.ingredient_id,
    ingredient_code: line.ingredient_code,
    ingredient_name: line.ingredient_name,
    portion_unit: line.base_unit || "Gram",
    portion_quantity: String(line.quantity),
    package_quantity: String(conv),
    package_unit: line.import_unit || line.base_unit || "Gram",
    package_price: String(pkgPrice),
    waste_percent: String(line.waste_percent),
    note: line.note ?? "",
  };
}

export function RecipeEditor({ menuItem, initialLines, ingredients }: RecipeEditorProps) {
  const router = useRouter();
  const [lines, setLines] = useState<EditorLine[]>(() => initialLines.map(toEditorLine));
  const [sellingPrice, setSellingPrice] = useState(String(menuItem.selling_price || ""));
  const [pickerOpen, setPickerOpen] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [showWasteCol, setShowWasteCol] = useState(false);

  // Danh sách ID nguyên liệu đã chọn
  const usedIds = useMemo(
    () => new Set(lines.map((l) => l.ingredient_id).filter(Boolean)),
    [lines]
  );
  const available = useMemo(
    () => ingredients.filter((i) => !usedIds.has(i.id)),
    [ingredients, usedIds]
  );

  // Tính toán chi phí real-time từng dòng và tổng món
  const calculatedLines = useMemo(() => {
    return lines.map((line) => {
      const { unitCost, lineTotal } = calcCostingLineAmount(
        line.portion_quantity,
        line.package_quantity,
        line.package_price,
        line.waste_percent
      );
      return {
        ...line,
        unitCost,
        lineTotal,
      };
    });
  }, [lines]);

  const totalCost = useMemo(() => {
    return calculatedLines.reduce((sum, l) => sum + l.lineTotal, 0);
  }, [calculatedLines]);

  const saleNum = useMemo(() => {
    const p = Number(sellingPrice);
    return Number.isFinite(p) && p > 0 ? p : 0;
  }, [sellingPrice]);

  const foodCostPct = useMemo(() => {
    if (saleNum <= 0) return null;
    return (totalCost / saleNum) * 100;
  }, [totalCost, saleNum]);

  const contributionMargin = useMemo(() => {
    return saleNum - totalCost;
  }, [saleNum, totalCost]);

  // Kiểm tra có thay đổi dữ liệu chưa lưu
  const dirty = useMemo(() => {
    const saved = initialLines.map(toEditorLine);
    if (saved.length !== lines.length) return true;
    if (Number(sellingPrice) !== menuItem.selling_price) return true;
    const byId = new Map(saved.map((l) => [l.ingredient_id, l]));
    return lines.some((l) => {
      if (!l.ingredient_id) return true;
      const s = byId.get(l.ingredient_id);
      if (!s) return true;
      return (
        Number(s.portion_quantity) !== Number(l.portion_quantity) ||
        Number(s.package_quantity) !== Number(l.package_quantity) ||
        Number(s.package_price) !== Number(l.package_price) ||
        Number(s.waste_percent) !== Number(l.waste_percent) ||
        s.portion_unit !== l.portion_unit ||
        s.package_unit !== l.package_unit ||
        s.note !== l.note
      );
    });
  }, [initialLines, lines, sellingPrice, menuItem.selling_price]);

  const invalid = useMemo(() => {
    return lines.some((l) => {
      const name = l.ingredient_name.trim();
      const qty = Number(l.portion_quantity);
      return !name || !(qty > 0);
    });
  }, [lines]);

  const { execute, pending, error } = useAction<RecipeCostingInput, { id: string }>(
    saveRecipeCosting,
    {
      successMessage: "Đã lưu bảng tính Cost & định lượng món ăn",
      onSuccess: () => router.refresh(),
    }
  );

  function addFromCatalog(ing: IngredientOption) {
    const conv = ing.conversion_factor && ing.conversion_factor > 0 ? ing.conversion_factor : 1;
    const pkgPrice = ing.avg_cost_price > 0 ? Math.round(ing.avg_cost_price * conv) : 0;
    setLines((prev) => [
      ...prev,
      {
        id: ing.id,
        ingredient_id: ing.id,
        ingredient_code: ing.code,
        ingredient_name: ing.name,
        portion_unit: ing.base_unit || "Gram",
        portion_quantity: "1",
        package_quantity: String(conv),
        package_unit: ing.import_unit || ing.base_unit || "Gram",
        package_price: String(pkgPrice),
        waste_percent: "0",
        note: "",
      },
    ]);
    setPickerOpen(false);
  }

  function addNewBlankRow() {
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setLines((prev) => [
      ...prev,
      {
        id: tempId,
        ingredient_id: null,
        ingredient_code: null,
        ingredient_name: "",
        portion_unit: "Gram",
        portion_quantity: "0",
        package_quantity: "1000",
        package_unit: "Gram",
        package_price: "0",
        waste_percent: "0",
        note: "",
      },
    ]);
  }

  function updateLine(id: string, patch: Partial<EditorLine>) {
    setLines((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  }

  function removeLine(id: string) {
    setLines((prev) => prev.filter((l) => l.id !== id));
  }

  function handleSave() {
    const payloadLines: RecipeCostingLineInput[] = lines.map((l) => ({
      ingredient_id: l.ingredient_id ?? null,
      ingredient_name: l.ingredient_name.trim(),
      ingredient_code: l.ingredient_code ?? null,
      portion_quantity: Number(l.portion_quantity) || 0,
      portion_unit: l.portion_unit.trim() || "Gram",
      package_quantity: Number(l.package_quantity) || 1,
      package_unit: l.package_unit.trim() || l.portion_unit.trim() || "Gram",
      package_price: Number(l.package_price) || 0,
      waste_percent: Number(l.waste_percent) || 0,
      note: l.note.trim() ? l.note.trim() : null,
    }));

    void execute({
      menu_item_id: menuItem.id,
      selling_price: Number(sellingPrice) || 0,
      lines: payloadLines,
    });
  }

  function handleExportExcel() {
    exportDishCostingExcel(
      menuItem.name,
      calculatedLines.map((l) => ({
        ingredient_name: l.ingredient_name,
        portion_quantity: Number(l.portion_quantity),
        portion_unit: l.portion_unit,
        package_quantity: Number(l.package_quantity),
        package_unit: l.package_unit,
        package_price: Number(l.package_price),
        line_total: l.lineTotal,
      })),
      {
        idealCost: totalCost,
        sellingPrice: saleNum,
        foodCostPct,
      }
    );
  }

  return (
    <div className="space-y-6">
      {/* Khối Bảng Tính Cost Món Ăn Phong Cách Spreadsheet */}
      <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
        {/* Banner Tiêu Đề Món Ăn Giống Ảnh Mẫu */}
        <div className="bg-sky-500 dark:bg-sky-600 text-white px-4 py-3 flex flex-wrap items-center justify-between gap-3 shadow-inner">
          <div className="flex items-center gap-2">
            <Utensils className="size-5" />
            <h2 className="text-lg font-bold tracking-wide uppercase">
              {menuItem.name}
            </h2>
            <span className="text-xs font-normal opacity-85 px-2 py-0.5 rounded bg-white/20">
              Bảng tính Cost & Định lượng món
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setShowWasteCol(!showWasteCol)}
              className="h-8 text-xs gap-1.5 bg-white/15 hover:bg-white/25 text-white border-0"
            >
              <SlidersHorizontal className="size-3.5" />
              {showWasteCol ? "Ẩn cột Hao hụt %" : "Hiện cột Hao hụt %"}
            </Button>

            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={handleExportExcel}
              className="h-8 text-xs gap-1.5 bg-white/15 hover:bg-white/25 text-white border-0"
            >
              <Download className="size-3.5" />
              Xuất Excel
            </Button>

            <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="h-8 text-xs gap-1.5 bg-white text-sky-900 hover:bg-white/90 font-medium"
                >
                  <Plus className="size-3.5" />
                  Thêm từ kho
                  <ChevronsUpDown className="size-3 opacity-60" />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-80 p-0">
                <Command>
                  <CommandInput placeholder="Tìm nguyên liệu trong kho..." />
                  <CommandList>
                    <CommandEmpty>Không tìm thấy nguyên liệu nào.</CommandEmpty>
                    <CommandGroup heading="Kho nguyên liệu">
                      {available.map((ing) => (
                        <CommandItem
                          key={ing.id}
                          value={`${ing.name} ${ing.code ?? ""} ${ing.category ?? ""}`}
                          onSelect={() => addFromCatalog(ing)}
                        >
                          <Check className="size-4 opacity-0" />
                          <div className="flex min-w-0 flex-1 flex-col">
                            <span className="truncate font-medium">{ing.name}</span>
                            <span className="text-xs text-muted-foreground">
                              {ing.code ?? "—"} · Giá vốn: {formatVND(ing.avg_cost_price)}/
                              {ing.base_unit}
                            </span>
                          </div>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>

            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={addNewBlankRow}
              className="h-8 text-xs gap-1.5 bg-emerald-500 hover:bg-emerald-600 text-white border-0 font-medium"
            >
              <Plus className="size-3.5" />
              Thêm dòng mới
            </Button>
          </div>
        </div>

        {/* Bảng Dữ Liệu Các Cột Nguyên Liệu Chuẩn F&B */}
        <div className="overflow-x-auto">
          <Table className="border-collapse">
            <TableHeader className="bg-muted/60 text-xs">
              <TableRow className="border-b">
                <TableHead className="min-w-44 font-semibold text-foreground">
                  Tên nguyên liệu
                </TableHead>
                <TableHead className="w-32 text-right font-semibold text-foreground">
                  Định lượng dùng
                </TableHead>
                <TableHead className="w-24 text-left font-semibold text-foreground">
                  ĐVT dùng
                </TableHead>
                <TableHead className="w-32 text-right font-semibold text-foreground">
                  Quy cách mua
                </TableHead>
                <TableHead className="w-24 text-left font-semibold text-foreground">
                  ĐVT mua
                </TableHead>
                <TableHead className="w-36 text-right font-semibold text-rose-600 dark:text-rose-400">
                  Đơn giá mua (VND)
                </TableHead>
                {showWasteCol && (
                  <TableHead className="w-28 text-right font-semibold text-foreground">
                    Hao hụt %
                  </TableHead>
                )}
                <TableHead className="w-36 text-right font-semibold text-foreground">
                  Thành tiền
                </TableHead>
                <TableHead className="w-12 text-center" />
              </TableRow>
            </TableHeader>
            <TableBody className="text-sm">
              {calculatedLines.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={showWasteCol ? 9 : 8} className="py-12 text-center">
                    <EmptyState
                      title="Chưa có nguyên liệu nào trong định lượng"
                      description="Bấm 'Thêm từ kho' hoặc 'Thêm dòng mới' để bắt đầu tính giá vốn cho món ăn này."
                    />
                  </TableCell>
                </TableRow>
              ) : (
                calculatedLines.map((line) => {
                  const qtyNum = Number(line.portion_quantity);
                  const badQty = !(qtyNum > 0);
                  const badName = !line.ingredient_name.trim();

                  return (
                    <TableRow
                      key={line.id}
                      className="hover:bg-muted/30 transition-colors border-b"
                    >
                      {/* Tên nguyên liệu */}
                      <TableCell className="p-2">
                        <Input
                          value={line.ingredient_name}
                          placeholder="Nhập tên nguyên liệu..."
                          onChange={(e) =>
                            updateLine(line.id, { ingredient_name: e.target.value })
                          }
                          className={cn(
                            "h-9 text-sm font-medium bg-transparent",
                            badName && "border-destructive"
                          )}
                        />
                      </TableCell>

                      {/* Định lượng dùng */}
                      <TableCell className="p-2 text-right">
                        <Input
                          type="number"
                          min={0}
                          step="any"
                          value={line.portion_quantity}
                          onChange={(e) =>
                            updateLine(line.id, { portion_quantity: e.target.value })
                          }
                          className={cn(
                            "h-9 text-right font-mono font-medium",
                            badQty && "border-destructive"
                          )}
                        />
                      </TableCell>

                      {/* ĐVT dùng */}
                      <TableCell className="p-2">
                        <Input
                          value={line.portion_unit}
                          placeholder="Gram"
                          onChange={(e) =>
                            updateLine(line.id, { portion_unit: e.target.value })
                          }
                          className="h-9 w-20 text-xs"
                        />
                      </TableCell>

                      {/* Quy cách mua */}
                      <TableCell className="p-2 text-right">
                        <Input
                          type="number"
                          min={0.001}
                          step="any"
                          value={line.package_quantity}
                          placeholder="1000"
                          onChange={(e) =>
                            updateLine(line.id, { package_quantity: e.target.value })
                          }
                          className="h-9 text-right font-mono text-xs"
                        />
                      </TableCell>

                      {/* ĐVT mua */}
                      <TableCell className="p-2">
                        <Input
                          value={line.package_unit}
                          placeholder="Gram"
                          onChange={(e) =>
                            updateLine(line.id, { package_unit: e.target.value })
                          }
                          className="h-9 w-20 text-xs"
                        />
                      </TableCell>

                      {/* Đơn giá mua (màu đỏ như trong Excel) */}
                      <TableCell className="p-2 text-right">
                        <Input
                          type="number"
                          min={0}
                          step={1000}
                          value={line.package_price}
                          placeholder="0"
                          onChange={(e) =>
                            updateLine(line.id, { package_price: e.target.value })
                          }
                          className="h-9 text-right font-mono font-semibold text-rose-600 dark:text-rose-400"
                        />
                      </TableCell>

                      {/* Hao hụt % nếu bật */}
                      {showWasteCol && (
                        <TableCell className="p-2 text-right">
                          <Input
                            type="number"
                            min={0}
                            max={100}
                            step="0.1"
                            value={line.waste_percent}
                            onChange={(e) =>
                              updateLine(line.id, { waste_percent: e.target.value })
                            }
                            className="h-9 text-right font-mono text-xs"
                          />
                        </TableCell>
                      )}

                      {/* Thành tiền */}
                      <TableCell className="p-2 text-right font-semibold tabular-nums text-foreground">
                        {formatVND(line.lineTotal)}
                      </TableCell>

                      {/* Nút xóa */}
                      <TableCell className="p-2 text-center">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-destructive"
                          onClick={() => removeLine(line.id)}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>

        {/* Khối Footer Tổng Kết Cost / Sale / F% Y Hệt Ảnh Excel */}
        <div className="p-4 bg-muted/20 border-t flex flex-wrap items-end justify-between gap-6">
          <div className="space-y-1 text-xs text-muted-foreground">
            <p className="flex items-center gap-1 font-medium text-foreground">
              <Sparkles className="size-3.5 text-primary" />
              Công thức F&B chuẩn:
            </p>
            <p>
              • Đơn giá cơ sở = Đơn giá mua ÷ Quy cách mua
            </p>
            <p>
              • Thành tiền = Định lượng dùng × Đơn giá cơ sở {showWasteCol && "× (1 + Hao hụt%)"}
            </p>
            <p>
              • Food Cost % (F%) = Tổng Cost ÷ Giá bán × 100%
            </p>
          </div>

          {/* 3 Ô Màu Đặc Trưng: Cost (Vàng) - Sale (Xanh) - F% (Hồng) */}
          <div className="flex flex-col items-end gap-1.5 min-w-72">
            {/* Cost Row (Màu Vàng) */}
            <div className="flex items-center w-full rounded-md border overflow-hidden shadow-xs">
              <span className="w-24 px-3 py-2 bg-yellow-400 dark:bg-yellow-500 text-yellow-950 font-bold text-sm tracking-wide">
                Cost
              </span>
              <div className="flex-1 px-3 py-2 bg-yellow-100 dark:bg-yellow-950/40 text-yellow-950 dark:text-yellow-200 font-extrabold text-right text-base tabular-nums">
                {formatVND(totalCost)}
              </div>
            </div>

            {/* Sale Row (Màu Xanh Lá - Cho phép sửa trực tiếp) */}
            <div className="flex items-center w-full rounded-md border overflow-hidden shadow-xs">
              <span className="w-24 px-3 py-2 bg-emerald-500 text-white font-bold text-sm tracking-wide">
                Sale
              </span>
              <div className="flex-1 bg-emerald-100 dark:bg-emerald-950/40 px-2 py-1 flex items-center justify-end">
                <Input
                  type="number"
                  min={0}
                  step={1000}
                  value={sellingPrice}
                  placeholder="0"
                  onChange={(e) => setSellingPrice(e.target.value)}
                  className="h-8 w-36 text-right font-extrabold text-emerald-950 dark:text-emerald-200 border-emerald-300 dark:border-emerald-700 bg-white/80 dark:bg-background/80"
                />
              </div>
            </div>

            {/* F% Row (Màu Hồng / Cảnh báo theo chuẩn Food Cost) */}
            <div className="flex items-center w-full rounded-md border overflow-hidden shadow-xs">
              <span
                className={cn(
                  "w-24 px-3 py-2 font-bold text-sm tracking-wide text-white",
                  foodCostPct === null
                    ? "bg-muted-foreground"
                    : foodCostPct <= 30
                    ? "bg-emerald-600"
                    : foodCostPct <= 35
                    ? "bg-amber-500"
                    : "bg-rose-500"
                )}
              >
                F%
              </span>
              <div
                className={cn(
                  "flex-1 px-3 py-2 font-extrabold text-right text-base tabular-nums",
                  foodCostPct === null
                    ? "bg-muted text-muted-foreground"
                    : foodCostPct <= 30
                    ? "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-300"
                    : foodCostPct <= 35
                    ? "bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300"
                    : "bg-rose-100 dark:bg-rose-950/40 text-rose-950 dark:text-rose-200"
                )}
              >
                {foodCostPct !== null ? formatPercent(foodCostPct) : "—"}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Lỗi xác thực & Nút lưu */}
      {invalid && (
        <p className="text-sm text-destructive">
          Vui lòng nhập tên nguyên liệu và định lượng lớn hơn 0 cho tất cả các dòng.
        </p>
      )}
      <FormServerError message={error} />

      <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
        <div className="text-xs text-muted-foreground">
          Lãi gộp dự kiến:{" "}
          <strong
            className={cn(
              "font-semibold text-sm",
              contributionMargin >= 0 ? "text-emerald-600" : "text-destructive"
            )}
          >
            {formatVND(contributionMargin)}
          </strong>{" "}
          · {menuItem.category ?? "Chưa phân loại"}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={lines.length === 0 || pending}
            onClick={() => setConfirmClear(true)}
          >
            <Trash2 className="size-4" />
            Xóa hết
          </Button>

          <Button
            type="button"
            variant="outline"
            disabled={!dirty || pending}
            onClick={() => {
              setLines(initialLines.map(toEditorLine));
              setSellingPrice(String(menuItem.selling_price || ""));
            }}
          >
            <RotateCcw className="size-4" />
            Hoàn tác
          </Button>

          <SubmitButton
            type="button"
            pending={pending}
            pendingText="Đang lưu..."
            disabled={invalid || !dirty}
            onClick={handleSave}
            className="gap-2"
          >
            <Check className="size-4" />
            Lưu định lượng & Giá vốn
          </SubmitButton>
        </div>
      </div>

      <ConfirmDialog
        open={confirmClear}
        onOpenChange={setConfirmClear}
        title="Xóa toàn bộ định lượng?"
        description="Tất cả nguyên liệu sẽ bị gỡ khỏi bảng tính cost. Thay đổi chỉ có hiệu lực sau khi bấm Lưu định lượng & Giá vốn."
        confirmLabel="Xóa hết"
        destructive
        onConfirm={() => setLines([])}
      />
    </div>
  );
}
