"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { saveRecipeBatch } from "@/server-actions/menu.actions";
import { formatPercent, formatVND } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

interface IngredientOption {
  id: string;
  name: string;
  code: string;
  base_unit: string;
  avg_cost_price: number;
}

interface RecipeRow {
  ingredient_id: string;
  quantity: number;
  waste_percent: number;
  notes?: string;
}

interface RecipeEditorProps {
  menuItem: {
    id: string;
    name: string;
    code: string;
    category: string;
    selling_price: number;
    description: string | null;
  };
  initialRecipes: Array<{
    id: string;
    ingredient_id: string;
    quantity: number;
    waste_percent: number;
    notes: string | null;
  }>;
  availableIngredients: IngredientOption[];
}

export function RecipeEditor({
  menuItem,
  initialRecipes,
  availableIngredients,
}: RecipeEditorProps) {
  const router = useRouter();
  const [rows, setRows] = useState<RecipeRow[]>(
    initialRecipes.map((r) => ({
      ingredient_id: r.ingredient_id,
      quantity: Number(r.quantity),
      waste_percent: Number(r.waste_percent),
      notes: r.notes ?? "",
    }))
  );
  const [isSaving, setIsSaving] = useState(false);

  // Tính Ideal Cost thời gian thực
  const idealCost = rows.reduce((sum, row) => {
    const ing = availableIngredients.find((i) => i.id === row.ingredient_id);
    if (!ing) return sum;
    const cost = row.quantity * (1 + row.waste_percent / 100) * Number(ing.avg_cost_price);
    return sum + cost;
  }, 0);

  const cm = Number(menuItem.selling_price) - idealCost;
  const foodCostPct = menuItem.selling_price > 0 ? (idealCost / Number(menuItem.selling_price)) * 100 : 0;

  const addRow = () => {
    if (availableIngredients.length === 0) return;
    setRows([
      ...rows,
      {
        ingredient_id: availableIngredients[0].id,
        quantity: 100,
        waste_percent: 0,
        notes: "",
      },
    ]);
  };

  const removeRow = (index: number) => {
    setRows(rows.filter((_, i) => i !== index));
  };

  const updateRow = <K extends keyof RecipeRow>(index: number, field: K, value: RecipeRow[K]) => {
    const newRows = [...rows];
    newRows[index] = { ...newRows[index], [field]: value };
    setRows(newRows);
  };

  const handleSave = async () => {
    setIsSaving(true);
    const res = await saveRecipeBatch({
      menu_item_id: menuItem.id,
      items: rows,
    });
    setIsSaving(false);

    if (!res.success) {
      toast.error(res.error);
      return;
    }

    toast.success("Đã cập nhật công thức định lượng món!");
    router.refresh();
  };

  return (
    <div className="space-y-6">
      {/* Top Bar with Realtime Metrics */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">Giá bán niêm yết</p>
          <p className="mt-1 text-xl font-bold">{formatVND(menuItem.selling_price)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">Giá vốn định lượng (Ideal Cost)</p>
          <p className="mt-1 text-xl font-bold text-amber-600 dark:text-amber-400">
            {formatVND(idealCost)}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">Biên lãi gộp (CM)</p>
          <p className="mt-1 text-xl font-bold text-emerald-600 dark:text-emerald-400">
            {formatVND(cm)}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">Tỷ lệ Food Cost %</p>
          <p
            className={`mt-1 text-xl font-bold ${
              foodCostPct > 35
                ? "text-destructive"
                : foodCostPct >= 30
                ? "text-amber-600"
                : "text-emerald-600 dark:text-emerald-400"
            }`}
          >
            {formatPercent(foodCostPct)}
          </p>
        </Card>
      </div>

      {/* Recipe Table */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <div>
            <CardTitle className="text-base font-semibold">Bảng thành phần nguyên liệu (BOM)</CardTitle>
            <CardDescription>
              Định lượng theo đơn vị cơ sở + tỷ lệ hao hụt sơ chế (Waste %) để tính giá thành chính xác.
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" onClick={addRow}>
              <Plus className="mr-1.5 size-4" />
              Thêm nguyên liệu
            </Button>
            <Button type="button" size="sm" onClick={handleSave} disabled={isSaving}>
              <Save className="mr-1.5 size-4" />
              {isSaving ? "Đang lưu..." : "Lưu định lượng"}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b bg-muted/40 text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Nguyên liệu</th>
                  <th className="px-4 py-3 font-medium text-right">Định lượng</th>
                  <th className="px-4 py-3 font-medium">Đơn vị cơ sở</th>
                  <th className="px-4 py-3 font-medium text-right">Hao hụt sơ chế (%)</th>
                  <th className="px-4 py-3 font-medium text-right">Giá vốn BQ</th>
                  <th className="px-4 py-3 font-medium text-right">Thành tiền</th>
                  <th className="px-4 py-3 font-medium">Ghi chú</th>
                  <th className="px-4 py-3 text-center">Xóa</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-muted-foreground">
                      Món ăn chưa có định lượng nguyên liệu. Bấm &quot;Thêm nguyên liệu&quot; để bắt đầu.
                    </td>
                  </tr>
                ) : (
                  rows.map((row, idx) => {
                    const ing = availableIngredients.find((i) => i.id === row.ingredient_id);
                    const itemCost =
                      row.quantity *
                      (1 + (row.waste_percent || 0) / 100) *
                      (ing ? Number(ing.avg_cost_price) : 0);

                    return (
                      <tr key={idx} className="hover:bg-muted/30">
                        <td className="px-4 py-2">
                          <select
                            value={row.ingredient_id}
                            onChange={(e) => updateRow(idx, "ingredient_id", e.target.value)}
                            className="w-full rounded-md border bg-background px-2.5 py-1.5 text-xs shadow-xs"
                          >
                            {availableIngredients.map((i) => (
                              <option key={i.id} value={i.id}>
                                {i.name} ({i.code}) — {formatVND(i.avg_cost_price)}/{i.base_unit}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-4 py-2 text-right">
                          <Input
                            type="number"
                            step="any"
                            value={row.quantity}
                            onChange={(e) => updateRow(idx, "quantity", Number(e.target.value))}
                            className="h-8 w-24 text-right text-xs"
                          />
                        </td>
                        <td className="px-4 py-2 text-xs text-muted-foreground">
                          {ing?.base_unit || "—"}
                        </td>
                        <td className="px-4 py-2 text-right">
                          <Input
                            type="number"
                            step="any"
                            min="0"
                            max="99"
                            value={row.waste_percent}
                            onChange={(e) => updateRow(idx, "waste_percent", Number(e.target.value))}
                            className="h-8 w-20 text-right text-xs"
                          />
                        </td>
                        <td className="px-4 py-2 text-right text-xs text-muted-foreground">
                          {ing ? formatVND(ing.avg_cost_price) : "0 ₫"}
                        </td>
                        <td className="px-4 py-2 text-right font-medium text-amber-600 dark:text-amber-400">
                          {formatVND(itemCost)}
                        </td>
                        <td className="px-4 py-2">
                          <Input
                            placeholder="Ghi chú..."
                            value={row.notes || ""}
                            onChange={(e) => updateRow(idx, "notes", e.target.value)}
                            className="h-8 text-xs"
                          />
                        </td>
                        <td className="px-4 py-2 text-center">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            className="text-destructive hover:bg-destructive/10"
                            onClick={() => removeRow(idx)}
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
