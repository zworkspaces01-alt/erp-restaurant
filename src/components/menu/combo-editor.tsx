"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronsUpDown, Plus, RotateCcw, Trash2, Layers } from "lucide-react";
import type { ComboLineCost, MenuItemCost, SingleMenuItemOption } from "@/lib/queries/menu.queries";
import { saveCombo } from "@/server-actions/menu.actions";
import { useAction } from "@/hooks/use-action";
import { calcComboTotals, type ComboInput } from "@/types/restaurant";
import { formatPercent, formatVND } from "@/lib/format";
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

interface EditorComboLine {
  menu_item_id: string;
  item_name: string;
  category_name: string | null;
  child_selling_price: number;
  child_ideal_cost: number;
  /** Giữ dạng chuỗi để nhập liệu mượt; parse khi tính. */
  quantity: string;
  note: string;
}

interface ComboEditorProps {
  menuItem: MenuItemCost;
  initialLines: ComboLineCost[];
  singleMenuItems: SingleMenuItemOption[];
}

function toEditorLine(line: ComboLineCost): EditorComboLine {
  return {
    menu_item_id: line.menu_item_id,
    item_name: line.item_name,
    category_name: line.item_category,
    child_selling_price: line.item_selling_price,
    child_ideal_cost: line.item_ideal_cost,
    quantity: String(line.quantity),
    note: line.note ?? "",
  };
}

export function ComboEditor({ menuItem, initialLines, singleMenuItems }: ComboEditorProps) {
  const router = useRouter();
  const [lines, setLines] = useState<EditorComboLine[]>(() => initialLines.map(toEditorLine));
  const [sellingPrice, setSellingPrice] = useState(String(menuItem.selling_price));
  const [pickerOpen, setPickerOpen] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  const usedIds = useMemo(() => new Set(lines.map((l) => l.menu_item_id)), [lines]);
  const available = useMemo(
    () => singleMenuItems.filter((i) => !usedIds.has(i.id) && i.id !== menuItem.id),
    [singleMenuItems, usedIds, menuItem.id]
  );

  const totals = useMemo(
    () =>
      calcComboTotals(
        lines.map((l) => ({
          quantity: l.quantity,
          item_selling_price: l.child_selling_price,
          item_ideal_cost: l.child_ideal_cost,
        })),
        sellingPrice
      ),
    [lines, sellingPrice]
  );

  const dirty = useMemo(() => {
    const saved = initialLines.map(toEditorLine);
    if (saved.length !== lines.length) return true;
    if (Number(sellingPrice) !== menuItem.selling_price) return true;
    const byId = new Map(saved.map((l) => [l.menu_item_id, l]));
    return lines.some((l) => {
      const s = byId.get(l.menu_item_id);
      if (!s) return true;
      return Number(s.quantity) !== Number(l.quantity) || s.note !== l.note;
    });
  }, [initialLines, lines, sellingPrice, menuItem.selling_price]);

  const invalid = lines.some((l) => !(Number(l.quantity) > 0));

  const { execute, pending, error } = useAction<ComboInput, { id: string }>(saveCombo, {
    successMessage: "Đã lưu cấu hình combo",
    onSuccess: () => router.refresh(),
  });

  function addItem(item: SingleMenuItemOption) {
    setLines((prev) => [
      ...prev,
      {
        menu_item_id: item.id,
        item_name: item.name,
        category_name: item.category,
        child_selling_price: item.selling_price,
        child_ideal_cost: item.ideal_cost,
        quantity: "1",
        note: "",
      },
    ]);
    setPickerOpen(false);
  }

  function updateLine(id: string, patch: Partial<EditorComboLine>) {
    setLines((prev) => prev.map((l) => (l.menu_item_id === id ? { ...l, ...patch } : l)));
  }

  function removeLine(id: string) {
    setLines((prev) => prev.filter((l) => l.menu_item_id !== id));
  }

  function handleSave() {
    void execute({
      combo_id: menuItem.id,
      selling_price: Number(sellingPrice),
      lines: lines.map((l) => ({
        menu_item_id: l.menu_item_id,
        quantity: Number(l.quantity),
        note: l.note.trim() ? l.note.trim() : null,
      })),
    });
  }

  return (
    <div className="space-y-6">
      {/* 5 KPI Metric Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <Card>
          <CardContent className="space-y-1.5 pt-6">
            <Label htmlFor="combo-selling-price" className="text-xs text-muted-foreground">
              Giá bán Combo (VND)
            </Label>
            <Input
              id="combo-selling-price"
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
          title="Tổng giá mua lẻ"
          value={formatVND(totals.retailTotal)}
          hint={
            totals.savings > 0
              ? `Tiết kiệm ${formatVND(totals.savings)}`
              : "Bằng giá mua lẻ"
          }
        />

        <StatCard
          title="Giá vốn Combo (BOM)"
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

      {/* Main Table Card */}
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Layers className="size-5 text-primary" />
              <CardTitle>Danh sách món thành phần trong Combo</CardTitle>
            </div>
            <CardDescription className="mt-1">
              Khi khách đặt combo này, kho sẽ tự động trừ nguyên liệu theo định lượng của từng món
              thành phần.
            </CardDescription>
          </div>
          <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" disabled={available.length === 0}>
                <Plus className="size-4" />
                Thêm món vào combo
                <ChevronsUpDown className="size-3.5 opacity-60" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-80 p-0">
              <Command>
                <CommandInput placeholder="Tìm món đơn lẻ..." />
                <CommandList>
                  <CommandEmpty>Không tìm thấy món đơn lẻ nào.</CommandEmpty>
                  <CommandGroup>
                    {available.map((item) => (
                      <CommandItem
                        key={item.id}
                        value={`${item.name} ${item.category ?? ""}`}
                        onSelect={() => addItem(item)}
                      >
                        <Check className="size-4 opacity-0" />
                        <div className="flex min-w-0 flex-1 flex-col">
                          <span className="truncate font-medium">{item.name}</span>
                          <span className="text-xs text-muted-foreground">
                            {item.category ?? "Chưa phân loại"} · Bán lẻ: {formatVND(item.selling_price)} · Vốn: {formatVND(item.ideal_cost)}
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
              title="Chưa có món nào trong Combo"
              description="Thêm các món đơn lẻ cấu thành combo này để tính giá vốn và trừ kho tự động."
            />
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-48">Món thành phần</TableHead>
                    <TableHead className="w-32 text-right">Giá bán lẻ</TableHead>
                    <TableHead className="w-32 text-right">Giá vốn lẻ</TableHead>
                    <TableHead className="w-28 text-right">Số lượng</TableHead>
                    <TableHead className="w-32 text-right">Tổng giá bán</TableHead>
                    <TableHead className="w-32 text-right">Tổng giá vốn</TableHead>
                    <TableHead className="min-w-36">Ghi chú</TableHead>
                    <TableHead className="w-12" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lines.map((line) => {
                    const qty = Number(line.quantity);
                    const retailSubtotal = (Number.isFinite(qty) ? qty : 0) * line.child_selling_price;
                    const costSubtotal = (Number.isFinite(qty) ? qty : 0) * line.child_ideal_cost;
                    const badQty = !(qty > 0);

                    return (
                      <TableRow key={line.menu_item_id}>
                        <TableCell>
                          <p className="font-medium">{line.item_name}</p>
                          <p className="text-xs text-muted-foreground">
                            {line.category_name ?? "—"}
                          </p>
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          {formatVND(line.child_selling_price)}
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          {formatVND(line.child_ideal_cost)}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center justify-end gap-1.5">
                            <Input
                              type="number"
                              min={1}
                              step={1}
                              value={line.quantity}
                              aria-label={`Số lượng ${line.item_name}`}
                              onChange={(e) =>
                                updateLine(line.menu_item_id, { quantity: e.target.value })
                              }
                              className={cn("w-20 text-right", badQty && "border-destructive")}
                            />
                            <span className="text-xs text-muted-foreground">phần</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {formatVND(retailSubtotal)}
                        </TableCell>
                        <TableCell className="text-right font-medium text-emerald-600 dark:text-emerald-400">
                          {formatVND(costSubtotal)}
                        </TableCell>
                        <TableCell>
                          <Input
                            placeholder="Ghi chú (tùy chọn)..."
                            value={line.note}
                            aria-label={`Ghi chú ${line.item_name}`}
                            onChange={(e) =>
                              updateLine(line.menu_item_id, { note: e.target.value })
                            }
                            className="h-8 text-xs"
                          />
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Xóa ${line.item_name}`}
                            onClick={() => removeLine(line.menu_item_id)}
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
              Mỗi món trong combo phải có số lượng lớn hơn 0 trước khi lưu.
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
              Lưu cấu hình Combo
            </SubmitButton>
          </div>
        </CardContent>
      </Card>

      <ConfirmDialog
        open={confirmClear}
        onOpenChange={setConfirmClear}
        title="Xóa toàn bộ món khỏi combo?"
        description="Tất cả các món thành phần sẽ bị gỡ. Thay đổi chỉ có hiệu lực sau khi bạn bấm Lưu cấu hình Combo."
        confirmLabel="Xóa hết"
        destructive
        onConfirm={() => setLines([])}
      />
    </div>
  );
}
