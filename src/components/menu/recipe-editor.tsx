"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronsUpDown, Plus, RotateCcw, Trash2 } from "lucide-react";
import type { IngredientOption, MenuItemCost, RecipeLineCost } from "@/lib/queries/menu.queries";
import { saveRecipe } from "@/server-actions/menu.actions";
import { useAction } from "@/hooks/use-action";
import { calcComponentCost, calcRecipeTotals, type RecipeInput } from "@/types/restaurant";
import { formatNumber, formatPercent, formatVND } from "@/lib/format";
import {
  ConfirmDialog,
  EmptyState,
  FormServerError,
  StatCard,
  StatusBadge,
  SubmitButton,
  foodCostTone,
} from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

interface EditorLine {
  ingredient_id: string;
  ingredient_code: string | null;
  ingredient_name: string;
  base_unit: string;
  avg_cost_price: number;
  /** Giữ dạng chuỗi để nhập liệu mượt; parse khi tính. */
  quantity: string;
  waste_percent: string;
  note: string;
}

interface RecipeEditorProps {
  menuItem: MenuItemCost;
  initialLines: RecipeLineCost[];
  ingredients: IngredientOption[];
}

function toEditorLine(line: RecipeLineCost): EditorLine {
  return {
    ingredient_id: line.ingredient_id,
    ingredient_code: line.ingredient_code,
    ingredient_name: line.ingredient_name,
    base_unit: line.base_unit,
    avg_cost_price: line.avg_cost_price,
    quantity: String(line.quantity),
    waste_percent: String(line.waste_percent),
    note: line.note ?? "",
  };
}

export function RecipeEditor({ menuItem, initialLines, ingredients }: RecipeEditorProps) {
  const router = useRouter();
  const [lines, setLines] = useState<EditorLine[]>(() => initialLines.map(toEditorLine));
  const [sellingPrice, setSellingPrice] = useState(String(menuItem.selling_price));
  const [pickerOpen, setPickerOpen] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  const usedIds = useMemo(() => new Set(lines.map((l) => l.ingredient_id)), [lines]);
  const available = useMemo(
    () => ingredients.filter((i) => !usedIds.has(i.id)),
    [ingredients, usedIds]
  );

  const totals = useMemo(
    () =>
      calcRecipeTotals(
        lines.map((l) => ({
          quantity: l.quantity,
          waste_percent: l.waste_percent,
          avg_cost_price: l.avg_cost_price,
        })),
        sellingPrice
      ),
    [lines, sellingPrice]
  );

  const dirty = useMemo(() => {
    const saved = initialLines.map(toEditorLine);
    if (saved.length !== lines.length) return true;
    if (Number(sellingPrice) !== menuItem.selling_price) return true;
    const byId = new Map(saved.map((l) => [l.ingredient_id, l]));
    return lines.some((l) => {
      const s = byId.get(l.ingredient_id);
      if (!s) return true;
      return (
        Number(s.quantity) !== Number(l.quantity) ||
        Number(s.waste_percent) !== Number(l.waste_percent) ||
        s.note !== l.note
      );
    });
  }, [initialLines, lines, sellingPrice, menuItem.selling_price]);

  const invalid = lines.some((l) => !(Number(l.quantity) > 0));

  const { execute, pending, error } = useAction<RecipeInput, { id: string }>(saveRecipe, {
    successMessage: "Đã lưu định lượng",
    onSuccess: () => router.refresh(),
  });

  function addIngredient(ing: IngredientOption) {
    setLines((prev) => [
      ...prev,
      {
        ingredient_id: ing.id,
        ingredient_code: ing.code,
        ingredient_name: ing.name,
        base_unit: ing.base_unit,
        avg_cost_price: ing.avg_cost_price,
        quantity: "0",
        waste_percent: "0",
        note: "",
      },
    ]);
    setPickerOpen(false);
  }

  function updateLine(id: string, patch: Partial<EditorLine>) {
    setLines((prev) => prev.map((l) => (l.ingredient_id === id ? { ...l, ...patch } : l)));
  }

  function removeLine(id: string) {
    setLines((prev) => prev.filter((l) => l.ingredient_id !== id));
  }

  function handleSave() {
    void execute({
      menu_item_id: menuItem.id,
      selling_price: Number(sellingPrice),
      lines: lines.map((l) => ({
        ingredient_id: l.ingredient_id,
        quantity: Number(l.quantity),
        waste_percent: Number(l.waste_percent),
        note: l.note.trim() ? l.note.trim() : null,
      })),
    });
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardContent className="space-y-1.5 pt-6">
            <Label htmlFor="selling-price" className="text-xs text-muted-foreground">
              Giá bán (VND)
            </Label>
            <Input
              id="selling-price"
              type="number"
              min={0}
              step={1000}
              value={sellingPrice}
              onChange={(e) => setSellingPrice(e.target.value)}
              className="text-lg font-semibold"
            />
            <p className="text-xs text-muted-foreground">
              Đã lưu: {formatVND(menuItem.selling_price)}
            </p>
          </CardContent>
        </Card>
        <StatCard
          title="Giá vốn chuẩn (BOM)"
          value={formatVND(totals.idealCost)}
          hint={`Đã lưu: ${formatVND(menuItem.ideal_cost)}`}
        />
        <StatCard
          title="Lãi gộp (CM)"
          value={formatVND(totals.contributionMargin)}
          tone={totals.contributionMargin >= 0 ? "success" : "danger"}
          hint={`Đã lưu: ${formatVND(menuItem.contribution_margin)}`}
        />
        <Card>
          <CardContent className="space-y-1.5 pt-6">
            <p className="text-xs text-muted-foreground">Food Cost %</p>
            <div>
              {totals.foodCostPct === null ? (
                <StatusBadge tone="neutral">— (giá bán = 0)</StatusBadge>
              ) : (
                <StatusBadge tone={foodCostTone(totals.foodCostPct)} className="text-base">
                  {formatPercent(totals.foodCostPct)}
                </StatusBadge>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Đã lưu:{" "}
              {menuItem.food_cost_pct === null ? "—" : formatPercent(menuItem.food_cost_pct)} · Mục
              tiêu dưới 30%
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>Định lượng (BOM) cho 1 phần</CardTitle>
            <CardDescription>
              Số lượng nhập theo đơn vị cơ sở của nguyên liệu. Chi phí thành phần = Số lượng × (1 +
              Hao hụt%) × Giá vốn bình quân.
            </CardDescription>
          </div>
          <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" disabled={available.length === 0}>
                <Plus className="size-4" />
                Thêm nguyên liệu
                <ChevronsUpDown className="size-3.5 opacity-60" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-80 p-0">
              <Command>
                <CommandInput placeholder="Tìm nguyên liệu..." />
                <CommandList>
                  <CommandEmpty>Không tìm thấy nguyên liệu.</CommandEmpty>
                  <CommandGroup>
                    {available.map((ing) => (
                      <CommandItem
                        key={ing.id}
                        value={`${ing.name} ${ing.code ?? ""} ${ing.category ?? ""}`}
                        onSelect={() => addIngredient(ing)}
                      >
                        <Check className="size-4 opacity-0" />
                        <div className="flex min-w-0 flex-1 flex-col">
                          <span className="truncate">{ing.name}</span>
                          <span className="text-xs text-muted-foreground">
                            {ing.code ?? "—"} · {formatVND(ing.avg_cost_price)}/{ing.base_unit}
                          </span>
                        </div>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </CardHeader>
        <CardContent className="space-y-4">
          {lines.length === 0 ? (
            <EmptyState
              title="Chưa có nguyên liệu nào"
              description="Thêm nguyên liệu để tính giá vốn chuẩn và Food Cost % cho món này."
            />
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-52">Nguyên liệu</TableHead>
                    <TableHead className="w-36 text-right">Định lượng</TableHead>
                    <TableHead className="w-28 text-right">Hao hụt %</TableHead>
                    <TableHead className="w-32 text-right">SL thực tế</TableHead>
                    <TableHead className="w-36 text-right">Giá vốn BQ</TableHead>
                    <TableHead className="w-36 text-right">Chi phí</TableHead>
                    <TableHead className="w-12" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lines.map((line) => {
                    const qty = Number(line.quantity);
                    const waste = Number(line.waste_percent);
                    const effective = Number.isFinite(qty) ? qty * (1 + (Number.isFinite(waste) ? waste : 0) / 100) : 0;
                    const cost = calcComponentCost(line.quantity, line.waste_percent, line.avg_cost_price);
                    const badQty = !(qty > 0);
                    return (
                      <TableRow key={line.ingredient_id}>
                        <TableCell>
                          <p className="font-medium">{line.ingredient_name}</p>
                          <p className="font-mono text-xs text-muted-foreground">
                            {line.ingredient_code ?? "—"} · {line.base_unit}
                          </p>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center justify-end gap-1.5">
                            <Input
                              type="number"
                              min={0}
                              step="0.001"
                              value={line.quantity}
                              aria-label={`Định lượng ${line.ingredient_name}`}
                              onChange={(e) =>
                                updateLine(line.ingredient_id, { quantity: e.target.value })
                              }
                              className={cn("w-24 text-right", badQty && "border-destructive")}
                            />
                            <span className="text-xs text-muted-foreground">{line.base_unit}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            min={0}
                            max={100}
                            step="0.1"
                            value={line.waste_percent}
                            aria-label={`Hao hụt ${line.ingredient_name}`}
                            onChange={(e) =>
                              updateLine(line.ingredient_id, { waste_percent: e.target.value })
                            }
                            className="w-20 text-right"
                          />
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          {formatNumber(effective, 3)} {line.base_unit}
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          {formatVND(line.avg_cost_price)}
                        </TableCell>
                        <TableCell className="text-right font-medium">{formatVND(cost)}</TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Xóa ${line.ingredient_name}`}
                            onClick={() => removeLine(line.ingredient_id)}
                          >
                            <Trash2 className="size-4 text-destructive" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}

          {invalid && (
            <p className="text-sm text-destructive">
              Mỗi dòng phải có định lượng lớn hơn 0 trước khi lưu.
            </p>
          )}
          <FormServerError message={error} />

          <div className="flex flex-wrap items-center justify-end gap-2">
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
                setSellingPrice(String(menuItem.selling_price));
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
            >
              Lưu định lượng
            </SubmitButton>
          </div>
        </CardContent>
      </Card>

      <ConfirmDialog
        open={confirmClear}
        onOpenChange={setConfirmClear}
        title="Xóa toàn bộ định lượng?"
        description="Tất cả nguyên liệu sẽ bị gỡ khỏi công thức. Thay đổi chỉ có hiệu lực sau khi bạn bấm Lưu định lượng."
        confirmLabel="Xóa hết"
        destructive
        onConfirm={() => setLines([])}
      />
    </div>
  );
}
