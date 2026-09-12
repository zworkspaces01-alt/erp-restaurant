"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { createPurchaseOrderAction } from "@/server-actions/purchases.actions";
import { formatNumber, formatVND, todayISO } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface SupplierOption {
  id: string;
  name: string;
  code: string;
  payment_terms: string;
}

interface IngredientOption {
  id: string;
  name: string;
  code: string;
  import_unit: string;
  base_unit: string;
  conversion_factor: number;
  avg_cost_price: number;
}

interface POItemRow {
  ingredient_id: string;
  import_quantity: number;
  import_unit: string;
  conversion_factor: number;
  import_unit_price: number;
}

interface NewPurchaseOrderFormProps {
  suppliers: SupplierOption[];
  ingredients: IngredientOption[];
}

export function NewPurchaseOrderForm({ suppliers, ingredients }: NewPurchaseOrderFormProps) {
  const router = useRouter();
  const [supplierId, setSupplierId] = useState(suppliers[0]?.id ?? "");
  const [orderDate, setOrderDate] = useState(todayISO());
  const [paidAmount, setPaidAmount] = useState(0);
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [rows, setRows] = useState<POItemRow[]>([
    {
      ingredient_id: ingredients[0]?.id ?? "",
      import_quantity: 10,
      import_unit: ingredients[0]?.import_unit ?? "kg",
      conversion_factor: Number(ingredients[0]?.conversion_factor ?? 1000),
      import_unit_price: Number(ingredients[0]?.avg_cost_price ?? 100) * Number(ingredients[0]?.conversion_factor ?? 1000),
    },
  ]);

  const addRow = () => {
    if (ingredients.length === 0) return;
    const first = ingredients[0];
    setRows([
      ...rows,
      {
        ingredient_id: first.id,
        import_quantity: 5,
        import_unit: first.import_unit,
        conversion_factor: Number(first.conversion_factor),
        import_unit_price: Number(first.avg_cost_price) * Number(first.conversion_factor),
      },
    ]);
  };

  const removeRow = (index: number) => {
    setRows(rows.filter((_, i) => i !== index));
  };

  const handleIngredientChange = (index: number, ingId: string) => {
    const ing = ingredients.find((i) => i.id === ingId);
    if (!ing) return;
    const newRows = [...rows];
    newRows[index] = {
      ingredient_id: ingId,
      import_quantity: 5,
      import_unit: ing.import_unit,
      conversion_factor: Number(ing.conversion_factor),
      import_unit_price: Number(ing.avg_cost_price) * Number(ing.conversion_factor),
    };
    setRows(newRows);
  };

  const updateRow = <K extends keyof POItemRow>(index: number, field: K, value: POItemRow[K]) => {
    const newRows = [...rows];
    newRows[index] = { ...newRows[index], [field]: value };
    setRows(newRows);
  };

  const totalAmount = rows.reduce(
    (sum, r) => sum + Number(r.import_quantity) * Number(r.import_unit_price),
    0
  );
  const remainingDebt = Math.max(0, totalAmount - paidAmount);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supplierId) {
      toast.error("Vui lòng chọn nhà cung cấp!");
      return;
    }
    if (rows.length === 0) {
      toast.error("Vui lòng thêm ít nhất 1 nguyên liệu nhập kho!");
      return;
    }

    setIsSubmitting(true);
    const res = await createPurchaseOrderAction({
      supplier_id: supplierId,
      order_date: orderDate,
      paid_amount: paidAmount,
      notes: notes || undefined,
      items: rows.map((r) => ({
        ingredient_id: r.ingredient_id,
        import_quantity: Number(r.import_quantity),
        import_unit: r.import_unit,
        conversion_factor: Number(r.conversion_factor),
        import_unit_price: Number(r.import_unit_price),
      })),
    });
    setIsSubmitting(false);

    if (!res.success) {
      toast.error(res.error);
      return;
    }

    toast.success("Tạo phiếu nhập kho thành công! Tồn kho và giá vốn BQ đã được cập nhật.");
    router.push("/purchases");
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Header Info */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">Thông tin phiếu nhập</CardTitle>
          <CardDescription>Chọn NCC, ngày nhập và số tiền thanh toán ngay (nếu có)</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-4">
          <div>
            <Label htmlFor="supplier_id">Nhà cung cấp</Label>
            <select
              id="supplier_id"
              value={supplierId}
              onChange={(e) => setSupplierId(e.target.value)}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm shadow-xs"
            >
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.code}) — {s.payment_terms}
                </option>
              ))}
            </select>
          </div>

          <div>
            <Label htmlFor="order_date">Ngày nhập kho</Label>
            <Input
              id="order_date"
              type="date"
              value={orderDate}
              onChange={(e) => setOrderDate(e.target.value)}
            />
          </div>

          <div>
            <Label htmlFor="paid_amount">Số tiền trả ngay (VNĐ)</Label>
            <Input
              id="paid_amount"
              type="number"
              step="1000"
              value={paidAmount}
              onChange={(e) => setPaidAmount(Number(e.target.value))}
            />
          </div>

          <div>
            <Label htmlFor="notes">Ghi chú</Label>
            <Input
              id="notes"
              placeholder="Hàng tươi sáng sớm..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Items Table */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <div>
            <CardTitle className="text-base font-semibold">Danh sách nguyên liệu nhập</CardTitle>
            <CardDescription>
              Tự động quy đổi đơn vị nhập sang đơn vị cơ sở và tính giá vốn BQ gia quyền mới
            </CardDescription>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={addRow}>
            <Plus className="mr-1.5 size-4" /> Thêm dòng
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b bg-muted/40 text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Nguyên liệu</th>
                  <th className="px-4 py-3 font-medium text-right">Số lượng nhập</th>
                  <th className="px-4 py-3 font-medium">Đơn vị nhập</th>
                  <th className="px-4 py-3 font-medium text-right">Quy đổi cơ sở</th>
                  <th className="px-4 py-3 font-medium text-right">Đơn giá nhập (VNĐ)</th>
                  <th className="px-4 py-3 font-medium text-right">Đơn giá cơ sở</th>
                  <th className="px-4 py-3 font-medium text-right">Thành tiền</th>
                  <th className="px-4 py-3 text-center">Xóa</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((row, idx) => {
                  const ing = ingredients.find((i) => i.id === row.ingredient_id);
                  const baseQty = Number(row.import_quantity) * Number(row.conversion_factor);
                  const baseUnitPrice = row.conversion_factor > 0 ? Number(row.import_unit_price) / row.conversion_factor : 0;
                  const rowTotal = Number(row.import_quantity) * Number(row.import_unit_price);

                  return (
                    <tr key={idx} className="hover:bg-muted/30">
                      <td className="px-4 py-2">
                        <select
                          value={row.ingredient_id}
                          onChange={(e) => handleIngredientChange(idx, e.target.value)}
                          className="w-full rounded-md border bg-background px-2.5 py-1.5 text-xs shadow-xs"
                        >
                          {ingredients.map((i) => (
                            <option key={i.id} value={i.id}>
                              {i.name} ({i.code})
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-2 text-right">
                        <Input
                          type="number"
                          step="any"
                          value={row.import_quantity}
                          onChange={(e) => updateRow(idx, "import_quantity", Number(e.target.value))}
                          className="h-8 w-24 text-right text-xs"
                        />
                      </td>
                      <td className="px-4 py-2 text-xs text-muted-foreground">
                        {row.import_unit}
                      </td>
                      <td className="px-4 py-2 text-right text-xs text-muted-foreground font-mono">
                        {formatNumber(baseQty)} {ing?.base_unit}
                      </td>
                      <td className="px-4 py-2 text-right">
                        <Input
                          type="number"
                          step="any"
                          value={row.import_unit_price}
                          onChange={(e) => updateRow(idx, "import_unit_price", Number(e.target.value))}
                          className="h-8 w-28 text-right text-xs"
                        />
                      </td>
                      <td className="px-4 py-2 text-right text-xs text-muted-foreground">
                        {formatVND(baseUnitPrice)}/{ing?.base_unit}
                      </td>
                      <td className="px-4 py-2 text-right font-semibold">
                        {formatVND(rowTotal)}
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
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Summary Footer */}
      <div className="flex flex-col items-end gap-3 rounded-lg border bg-card p-4">
        <div className="flex gap-8 text-sm">
          <span>
            Tổng tiền hàng: <strong>{formatVND(totalAmount)}</strong>
          </span>
          <span>
            Trả ngay: <strong>{formatVND(paidAmount)}</strong>
          </span>
          <span className="text-amber-600 dark:text-amber-400">
            Công nợ phát sinh: <strong>{formatVND(remainingDebt)}</strong>
          </span>
        </div>

        <Button type="submit" size="lg" disabled={isSubmitting}>
          <Save className="mr-2 size-4" />
          {isSubmitting ? "Đang xử lý nhập kho..." : "Lưu phiếu nhập & Tăng tồn kho"}
        </Button>
      </div>
    </form>
  );
}
