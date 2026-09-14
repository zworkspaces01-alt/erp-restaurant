"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Package, Plus, Trash2 } from "lucide-react";
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
  const [target, setTarget] = useState<PurchaseOrderItemRow | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [ingredientId, setIngredientId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unitPrice, setUnitPrice] = useState("");

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
                <TableHead>Nguyên liệu</TableHead>
                <TableHead className="text-right">Số lượng</TableHead>
                <TableHead className="text-right">Đơn giá</TableHead>
                <TableHead className="text-right">Thành tiền</TableHead>
                <TableHead className="text-right">Quy đổi kho</TableHead>
                <TableHead className="text-right">Giá vốn / ĐV kho</TableHead>
                <TableHead className="text-right">Thao tác</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow key={item.id}>
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
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Xóa dòng nhập"
                      onClick={() => setTarget(item)}
                    >
                      <Trash2 className="size-4 text-destructive" />
                    </Button>
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
                <TableCell colSpan={3} />
              </TableRow>
            </TableBody>
          </Table>
        </div>
      )}

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
              } tồn kho và giảm tổng phiếu nhập. Giá vốn bình quân không được tính lại — sửa dòng = xóa rồi nhập lại.`
            : undefined
        }
        confirmLabel="Xóa dòng"
        destructive
        onConfirm={async () => {
          if (target) await removeLine(target.id);
        }}
      />

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
    </div>
  );
}
