"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Minus, Plus, Search, ShoppingCart, Trash2, UtensilsCrossed } from "lucide-react";
import { createOrderAction } from "@/server-actions/orders.actions";
import { useAction } from "@/hooks/use-action";
import { formatPercent, formatVND } from "@/lib/format";
import {
  PAYMENT_METHOD_OPTIONS,
  type OrderInput,
  type PaymentMethod,
} from "@/types/restaurant";
import type { PosMenuItem } from "@/lib/queries/orders.queries";
import { EmptyState, FormServerError, SubmitButton } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";

interface CartLine {
  id: string;
  name: string;
  unit_price: number;
  ideal_cost: number;
  quantity: number;
}

const UNCATEGORIZED = "Khác";

export function NewOrderForm({ menuItems }: { menuItems: PosMenuItem[] }) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [tableNumber, setTableNumber] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [discount, setDiscount] = useState("0");
  const [note, setNote] = useState("");

  const { execute, pending, error } = useAction(createOrderAction, {
    successMessage: "Đã tạo đơn bán hàng",
    onSuccess: ({ id }) => router.push(`/orders/${id}`),
  });

  const grouped = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const map = new Map<string, PosMenuItem[]>();
    for (const item of menuItems) {
      if (
        needle &&
        !item.name.toLowerCase().includes(needle) &&
        !(item.code ?? "").toLowerCase().includes(needle)
      ) {
        continue;
      }
      const key = item.category ?? UNCATEGORIZED;
      const list = map.get(key);
      if (list) list.push(item);
      else map.set(key, [item]);
    }
    return Array.from(map.entries());
  }, [menuItems, search]);

  const subtotal = cart.reduce((sum, l) => sum + l.unit_price * l.quantity, 0);
  const estimatedCogs = cart.reduce((sum, l) => sum + l.ideal_cost * l.quantity, 0);
  const discountValue = Math.max(0, Number(discount.replace(/[^\d.-]/g, "")) || 0);
  const total = Math.max(0, subtotal - discountValue);
  const marginPct = total > 0 ? ((total - estimatedCogs) / total) * 100 : null;
  const discountTooBig = discountValue > subtotal;

  function addItem(item: PosMenuItem) {
    setCart((prev) => {
      const found = prev.find((l) => l.id === item.id);
      if (found) {
        return prev.map((l) => (l.id === item.id ? { ...l, quantity: l.quantity + 1 } : l));
      }
      return [
        ...prev,
        {
          id: item.id,
          name: item.name,
          unit_price: item.selling_price,
          ideal_cost: item.ideal_cost,
          quantity: 1,
        },
      ];
    });
  }

  function changeQuantity(id: string, delta: number) {
    setCart((prev) =>
      prev
        .map((l) => (l.id === id ? { ...l, quantity: l.quantity + delta } : l))
        .filter((l) => l.quantity > 0)
    );
  }

  function removeItem(id: string) {
    setCart((prev) => prev.filter((l) => l.id !== id));
  }

  async function handleSubmit() {
    if (cart.length === 0 || discountTooBig) return;
    const payload: OrderInput = {
      items: cart.map((l) => ({ menu_item_id: l.id, quantity: l.quantity })),
      discount: discountValue,
      table_number: tableNumber.trim() ? tableNumber.trim() : null,
      payment_method: paymentMethod,
      note: note.trim() ? note.trim() : null,
      order_date: null,
    };
    await execute(payload);
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
      <Card>
        <CardHeader className="gap-3">
          <CardTitle className="text-base">Thực đơn</CardTitle>
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tìm món theo tên hoặc mã..."
              className="pl-8"
              aria-label="Tìm món"
            />
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {grouped.length === 0 ? (
            <EmptyState
              icon={UtensilsCrossed}
              title="Không có món phù hợp"
              description="Thử từ khóa khác, hoặc thêm món mới trong mục Thực đơn."
            />
          ) : (
            grouped.map(([category, items]) => (
              <div key={category} className="space-y-2">
                <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  {category}
                </p>
                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                  {items.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => addItem(item)}
                      className="flex flex-col items-start gap-1 rounded-lg border p-3 text-left transition-colors hover:border-primary hover:bg-accent"
                    >
                      <span className="line-clamp-2 text-sm font-medium">{item.name}</span>
                      <span className="text-sm text-primary">{formatVND(item.selling_price)}</span>
                      <span className="text-xs text-muted-foreground">
                        {item.missing_recipe
                          ? "Chưa có định lượng (giá vốn = 0)"
                          : `Giá vốn ĐM: ${formatVND(item.ideal_cost)}`}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card className="h-fit lg:sticky lg:top-20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShoppingCart className="size-4" />
            Giỏ hàng ({cart.length} món)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {cart.length === 0 ? (
            <p className="rounded-md border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
              Chọn món từ thực đơn để thêm vào đơn.
            </p>
          ) : (
            <ul className="space-y-3">
              {cart.map((line) => (
                <li key={line.id} className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{line.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatVND(line.unit_price)} × {line.quantity} ={" "}
                      {formatVND(line.unit_price * line.quantity)}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="size-7"
                      aria-label={`Giảm số lượng ${line.name}`}
                      onClick={() => changeQuantity(line.id, -1)}
                    >
                      <Minus className="size-3.5" />
                    </Button>
                    <span className="w-6 text-center text-sm tabular-nums">{line.quantity}</span>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="size-7"
                      aria-label={`Tăng số lượng ${line.name}`}
                      onClick={() => changeQuantity(line.id, 1)}
                    >
                      <Plus className="size-3.5" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-7 text-destructive"
                      aria-label={`Xóa ${line.name}`}
                      onClick={() => removeItem(line.id)}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <Separator />

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="table-number">Số bàn</Label>
              <Input
                id="table-number"
                value={tableNumber}
                onChange={(e) => setTableNumber(e.target.value)}
                placeholder="VD: B3 (để trống = tại quầy)"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="payment-method">Hình thức thanh toán</Label>
              <Select
                value={paymentMethod}
                onValueChange={(v) => setPaymentMethod(v as PaymentMethod)}
              >
                <SelectTrigger id="payment-method">
                  <SelectValue placeholder="Chọn hình thức" />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHOD_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="discount">Giảm giá (₫)</Label>
              <Input
                id="discount"
                inputMode="numeric"
                value={discount}
                onChange={(e) => setDiscount(e.target.value)}
              />
              {discountTooBig && (
                <p className="text-sm text-destructive">Giảm giá vượt quá tổng tiền hàng.</p>
              )}
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="note">Ghi chú</Label>
              <Textarea
                id="note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                placeholder="Ghi chú cho đơn (tùy chọn)"
              />
            </div>
          </div>

          <Separator />

          <dl className="space-y-1.5 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Tạm tính</dt>
              <dd className="tabular-nums">{formatVND(subtotal)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Giảm giá</dt>
              <dd className="tabular-nums text-destructive">-{formatVND(discountValue)}</dd>
            </div>
            <div className="flex justify-between text-base font-semibold">
              <dt>Tổng thanh toán</dt>
              <dd className="tabular-nums">{formatVND(total)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Giá vốn ước tính</dt>
              <dd className="tabular-nums text-muted-foreground">{formatVND(estimatedCogs)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Lãi gộp ước tính</dt>
              <dd className="tabular-nums">
                {formatVND(total - estimatedCogs)}
                {marginPct !== null && ` (${formatPercent(marginPct)})`}
              </dd>
            </div>
          </dl>

          <FormServerError message={error} />

          <SubmitButton
            type="button"
            className="w-full"
            pending={pending}
            pendingText="Đang tạo đơn..."
            disabled={cart.length === 0 || discountTooBig}
            onClick={handleSubmit}
          >
            Hoàn tất đơn hàng
          </SubmitButton>
          <p className="text-xs text-muted-foreground">
            Đơn hoàn tất sẽ tự động trừ tồn kho theo định lượng và ghi nhận giá vốn thực tế.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
