"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Package, Pencil, Plus, Trash2 } from "lucide-react";
import { ConfirmDialog, EmptyState, Money } from "@/components/shared";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { FormError, FormServerError, SubmitButton } from "@/components/shared";
import { IngredientPicker } from "@/components/purchases/ingredient-picker";
import { useAction } from "@/hooks/use-action";
import { calcPoLine, type PurchaseOrderLineInput } from "@/types/restaurant";
import { formatNumber, formatVND } from "@/lib/format";
import {
  addPurchaseOrderLine,
  deletePurchaseOrderLine,
  updatePurchaseOrderLine,
} from "@/server-actions/purchases.actions";
import type {
  IngredientPickRow,
  PurchaseOrderItemRow,
} from "@/lib/queries/purchases.queries";

interface PurchaseOrderLinesProps {
  purchaseOrderId: string;
  items: PurchaseOrderItemRow[];
  totalAmount: number;
  ingredients: IngredientPickRow[];
}

export function PurchaseOrderLines({
  purchaseOrderId,
  items,
  totalAmount,
  ingredients,
}: PurchaseOrderLinesProps) {
  const router = useRouter();

  // Delete line state
  const [target, setTarget] = useState<PurchaseOrderItemRow | null>(null);

  // Add line state
  const [addOpen, setAddOpen] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [ingredientId, setIngredientId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unitPrice, setUnitPrice] = useState("");

  // Edit line state
  const [editTarget, setEditTarget] = useState<PurchaseOrderItemRow | null>(null);
  const [editIngredientId, setEditIngredientId] = useState("");
  const [editQuantity, setEditQuantity] = useState("");
  const [editUnitPrice, setEditUnitPrice] = useState("");
  const [editServerError, setEditServerError] = useState<string | null>(null);

  // Add preview
  const picked = useMemo(
    () => ingredients.find((i) => i.id === ingredientId) ?? null,
    [ingredients, ingredientId]
  );
  const qty = Number(quantity);
  const price = Number(unitPrice);
  const preview =
    picked && qty > 0 && price >= 0
      ? calcPoLine(qty, price, picked.conversion_factor || 1)
      : null;

  // Edit preview
  const editPicked = useMemo(
    () => ingredients.find((i) => i.id === editIngredientId) ?? null,
    [ingredients, editIngredientId]
  );
  const editQty = Number(editQuantity);
  const editPrice = Number(editUnitPrice);
  const editPreview =
    editPicked && editQty > 0 && editPrice >= 0
      ? calcPoLine(editQty, editPrice, editPicked.conversion_factor || 1)
      : null;

  const openEditModal = (item: PurchaseOrderItemRow) => {
    setEditTarget(item);
    setEditIngredientId(item.ingredient_id);
    setEditQuantity(String(item.quantity));
    setEditUnitPrice(String(item.unit_price));
    setEditServerError(null);
  };

  const { execute: removeLine } = useAction<string, { id: string }>(deletePurchaseOrderLine, {
    successMessage: "Đã xóa dòng nhập, tồn kho được trừ lại",
    onSuccess: () => {
      setTarget(null);
      router.refresh();
    },
  });

  const { execute: addLine, pending } = useAction<PurchaseOrderLineInput, { id: string }>(
    (values) => addPurchaseOrderLine(purchaseOrderId, values),
    {
      successMessage: "Đã thêm dòng nhập",
      onSuccess: () => {
        setAddOpen(false);
        setIngredientId("");
        setQuantity("");
        setUnitPrice("");
        router.refresh();
      },
      onError: (message) => setServerError(message),
    }
  );

  const { execute: updateLine, pending: updatePending } = useAction<
    { lineId: string; input: PurchaseOrderLineInput },
    { id: string }
  >(({ lineId, input }) => updatePurchaseOrderLine(lineId, input), {
    successMessage: "Đã cập nhật dòng nhập, tồn kho và công nợ đã được tính lại",
    onSuccess: () => {
      setEditTarget(null);
      router.refresh();
    },
    onError: (message) => setEditServerError(message),
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-end">
        <Button variant="outline" size="sm" onClick={() => setAddOpen(true)}>
          <Plus className="size-4" />
          Thêm dòng
        </Button>
      </div>

      {items.length === 0 ? (
        <EmptyState title="Phiếu nhập chưa có dòng hàng nào." icon={Package} />
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12 text-center">STT</TableHead>
                <TableHead>Nguyên liệu</TableHead>
                <TableHead className="text-right">Số lượng</TableHead>
                <TableHead className="text-right">Đơn giá</TableHead>
                <TableHead className="text-right">Thành tiền</TableHead>
                <TableHead className="text-right">Quy đổi kho</TableHead>
                <TableHead className="text-right">Giá vốn / ĐV kho</TableHead>
                <TableHead className="text-right w-24">Thao tác</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item, idx) => (
                <TableRow key={item.id}>
                  <TableCell className="text-center font-mono text-xs text-muted-foreground">
                    {idx + 1}
                  </TableCell>
                  <TableCell>
                    <Link
                      href={`/inventory/${item.ingredient_id}`}
                      className="font-medium hover:underline"
                    >
                      {item.ingredient_name}
                    </Link>
                    {item.ingredient_code ? (
                      <div className="font-mono text-xs text-muted-foreground">
                        {item.ingredient_code}
                      </div>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    {formatNumber(item.quantity, 3)} {item.unit ?? ""}
                  </TableCell>
                  <TableCell className="text-right">
                    <Money value={item.unit_price} />
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    <Money value={item.line_total} />
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap text-muted-foreground">
                    {formatNumber(item.base_quantity, 3)} {item.base_unit}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {formatVND(
                      item.conversion_factor > 0 ? item.unit_price / item.conversion_factor : 0
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Sửa dòng nhập"
                        title="Sửa dòng nhập này"
                        onClick={() => openEditModal(item)}
                        className="size-8 text-muted-foreground hover:text-primary"
                      >
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Xóa dòng nhập"
                        title="Xóa dòng nhập này"
                        onClick={() => setTarget(item)}
                        className="size-8 text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              <TableRow>
                <TableCell colSpan={3} className="font-medium">
                  Tổng cộng
                </TableCell>
                <TableCell className="text-right font-semibold">
                  <Money value={totalAmount} />
                </TableCell>
                <TableCell colSpan={4} />
              </TableRow>
            </TableBody>
          </Table>
        </div>
      )}

      {/* Confirm Delete Line Dialog */}
      <ConfirmDialog
        open={Boolean(target)}
        onOpenChange={(o) => !o && setTarget(null)}
        title="Xóa dòng nhập?"
        description={
          target
            ? `Xóa ${target.ingredient_name} (${formatNumber(target.quantity, 3)} ${
                target.unit ?? ""
              }) sẽ trừ lại ${formatNumber(target.base_quantity, 3)} ${
                target.base_unit
              } tồn kho và giảm tổng phiếu nhập. Thao tác này sẽ được ghi vào nhật ký.`
            : undefined
        }
        confirmLabel="Xóa dòng"
        destructive
        onConfirm={async () => {
          if (target) await removeLine(target.id);
        }}
      />

      {/* Add Line Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>Thêm dòng nhập</DialogTitle>
            <DialogDescription>
              Số lượng và đơn giá theo đơn vị nhập. Dòng mới cộng thẳng vào tồn kho và giá vốn bình
              quân.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <FormServerError message={serverError} />

            <div className="space-y-1.5">
              <Label htmlFor="po-line-ingredient">Nguyên liệu</Label>
              <IngredientPicker
                id="po-line-ingredient"
                ingredients={ingredients}
                value={ingredientId}
                onSelect={(ing) => {
                  setIngredientId(ing.id);
                  if (!unitPrice && ing.avg_cost_per_import_unit > 0) {
                    setUnitPrice(String(ing.avg_cost_per_import_unit));
                  }
                }}
              />
              {!ingredientId ? <FormError message="Chưa chọn nguyên liệu" /> : null}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="po-line-quantity">
                  Số lượng {picked?.import_unit ? `(${picked.import_unit})` : ""}
                </Label>
                <Input
                  id="po-line-quantity"
                  type="number"
                  min="0"
                  step="0.001"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="po-line-price">Đơn giá (VND)</Label>
                <Input
                  id="po-line-price"
                  type="number"
                  min="0"
                  step="1"
                  value={unitPrice}
                  onChange={(e) => setUnitPrice(e.target.value)}
                />
              </div>
            </div>

            {preview ? (
              <p className="text-sm text-muted-foreground">
                Thành tiền {formatVND(preview.lineTotal)} · Quy đổi{" "}
                {formatNumber(preview.baseQty, 3)} {picked?.base_unit}
              </p>
            ) : null}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setAddOpen(false)}>
              Hủy
            </Button>
            <SubmitButton
              type="button"
              pending={pending}
              disabled={!ingredientId || !(qty > 0) || !(price >= 0)}
              onClick={async () => {
                if (!picked || !(qty > 0)) return;
                setServerError(null);
                await addLine({
                  ingredient_id: picked.id,
                  quantity: qty,
                  unit_price: price,
                  unit: picked.import_unit ?? picked.base_unit,
                });
              }}
            >
              Thêm dòng
            </SubmitButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Line Dialog */}
      <Dialog open={Boolean(editTarget)} onOpenChange={(o) => !o && setEditTarget(null)}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="size-4 text-primary" />
              Sửa dòng nhập: {editTarget?.ingredient_name}
            </DialogTitle>
            <DialogDescription>
              Điều chỉnh nguyên liệu, số lượng hoặc đơn giá. Hệ thống sẽ tự động cập nhật lại tồn kho,
              giá vốn bình quân và công nợ nhà cung cấp.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <FormServerError message={editServerError} />

            <div className="space-y-1.5">
              <Label htmlFor="po-edit-line-ingredient">Nguyên liệu</Label>
              <IngredientPicker
                id="po-edit-line-ingredient"
                ingredients={ingredients}
                value={editIngredientId}
                onSelect={(ing) => {
                  setEditIngredientId(ing.id);
                }}
              />
              {!editIngredientId ? <FormError message="Chưa chọn nguyên liệu" /> : null}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="po-edit-line-quantity">
                  Số lượng {editPicked?.import_unit ? `(${editPicked.import_unit})` : ""}
                </Label>
                <Input
                  id="po-edit-line-quantity"
                  type="number"
                  min="0"
                  step="0.001"
                  value={editQuantity}
                  onChange={(e) => setEditQuantity(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="po-edit-line-price">Đơn giá (VND)</Label>
                <Input
                  id="po-edit-line-price"
                  type="number"
                  min="0"
                  step="1"
                  value={editUnitPrice}
                  onChange={(e) => setEditUnitPrice(e.target.value)}
                />
              </div>
            </div>

            {/* Comparison summary */}
            {editTarget && editPreview && (
              <div className="rounded-lg bg-muted/40 p-3 border text-xs space-y-1.5">
                <div className="flex justify-between text-muted-foreground">
                  <span>Trước sửa:</span>
                  <span>
                    {formatNumber(editTarget.quantity, 3)} {editTarget.unit ?? ""} × {formatVND(editTarget.unit_price)} ={" "}
                    <strong>{formatVND(editTarget.line_total)}</strong>
                  </span>
                </div>
                <div className="flex justify-between text-foreground font-medium">
                  <span>Sau sửa:</span>
                  <span>
                    {formatNumber(editQty, 3)} {editPicked?.import_unit ?? editPicked?.base_unit} × {formatVND(editPrice)} ={" "}
                    <strong className="text-primary">{formatVND(editPreview.lineTotal)}</strong>
                  </span>
                </div>
                <div className="flex justify-between pt-1 border-t border-dashed text-[11px]">
                  <span className="text-muted-foreground">Chênh lệch thành tiền:</span>
                  <span
                    className={
                      editPreview.lineTotal - editTarget.line_total > 0
                        ? "text-emerald-600 dark:text-emerald-400 font-semibold"
                        : editPreview.lineTotal - editTarget.line_total < 0
                        ? "text-rose-600 dark:text-rose-400 font-semibold"
                        : "text-muted-foreground"
                    }
                  >
                    {editPreview.lineTotal - editTarget.line_total > 0 ? "+" : ""}
                    {formatVND(editPreview.lineTotal - editTarget.line_total)}
                  </span>
                </div>
                <div className="text-[11px] text-muted-foreground">
                  Quy đổi kho mới: {formatNumber(editPreview.baseQty, 3)} {editPicked?.base_unit}
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setEditTarget(null)}>
              Hủy
            </Button>
            <SubmitButton
              type="button"
              pending={updatePending}
              disabled={!editIngredientId || !(editQty > 0) || !(editPrice >= 0)}
              onClick={async () => {
                if (!editTarget || !editPicked || !(editQty > 0)) return;
                setEditServerError(null);
                await updateLine({
                  lineId: editTarget.id,
                  input: {
                    ingredient_id: editPicked.id,
                    quantity: editQty,
                    unit_price: editPrice,
                    unit: editPicked.import_unit ?? editPicked.base_unit,
                  },
                });
              }}
            >
              Lưu thay đổi
            </SubmitButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
