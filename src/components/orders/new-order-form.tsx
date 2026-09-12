"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Minus, Plus, Receipt, ShoppingCart, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { createOrderAction } from "@/server-actions/orders.actions";
import { formatVND } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface MenuItem {
  menu_item_id: string;
  name: string;
  code: string;
  category: string;
  selling_price: number;
  ideal_cost: number;
}

interface CartItem {
  menu_item_id: string;
  name: string;
  unit_price: number;
  quantity: number;
}

export function NewOrderForm({ menuItems }: { menuItems: MenuItem[] }) {
  const router = useRouter();
  const [tableNumber, setTableNumber] = useState("Bàn 01");
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "card" | "bank_transfer">("cash");
  const [notes, setNotes] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const addToCart = (item: MenuItem) => {
    setCart((prev) => {
      const existing = prev.find((i) => i.menu_item_id === item.menu_item_id);
      if (existing) {
        return prev.map((i) =>
          i.menu_item_id === item.menu_item_id ? { ...i, quantity: i.quantity + 1 } : i
        );
      }
      return [
        ...prev,
        {
          menu_item_id: item.menu_item_id,
          name: item.name,
          unit_price: Number(item.selling_price),
          quantity: 1,
        },
      ];
    });
  };

  const updateQuantity = (id: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((i) => (i.menu_item_id === id ? { ...i, quantity: i.quantity + delta } : i))
        .filter((i) => i.quantity > 0)
    );
  };

  const removeItem = (id: string) => {
    setCart((prev) => prev.filter((i) => i.menu_item_id !== id));
  };

  const totalAmount = cart.reduce((sum, item) => sum + item.quantity * item.unit_price, 0);

  const handleCheckout = async () => {
    if (cart.length === 0) {
      toast.error("Vui lòng chọn ít nhất một món ăn!");
      return;
    }
    if (!tableNumber.trim()) {
      toast.error("Vui lòng nhập số bàn hoặc mã đơn!");
      return;
    }

    setIsSubmitting(true);
    const res = await createOrderAction({
      table_number: tableNumber,
      payment_method: paymentMethod,
      notes: notes || undefined,
      items: cart.map((i) => ({
        menu_item_id: i.menu_item_id,
        quantity: i.quantity,
      })),
    });
    setIsSubmitting(false);

    if (!res.success) {
      toast.error(res.error);
      return;
    }

    toast.success("Tạo đơn thành công! Kho nguyên liệu đã được tự động khấu trừ theo định lượng BOM.");
    router.push("/orders");
  };

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      {/* Menu selection */}
      <div className="space-y-4 lg:col-span-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">Chọn món từ thực đơn</CardTitle>
            <CardDescription>Bấm vào món để thêm vào hóa đơn thanh toán</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {menuItems.map((item) => (
                <div
                  key={item.menu_item_id}
                  onClick={() => addToCart(item)}
                  className="flex cursor-pointer flex-col justify-between rounded-lg border p-3 transition hover:border-primary hover:bg-muted/40"
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-foreground">{item.name}</span>
                      <span className="rounded-md bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                        {item.category}
                      </span>
                    </div>
                    <p className="mt-1 font-mono text-xs text-muted-foreground">{item.code}</p>
                  </div>
                  <div className="mt-3 flex items-center justify-between border-t pt-2">
                    <span className="font-bold text-primary">{formatVND(item.selling_price)}</span>
                    <Button size="icon-xs" variant="secondary">
                      <Plus className="size-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Cart & Checkout */}
      <div className="space-y-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base font-semibold">
              <ShoppingCart className="size-4" /> Chi tiết đơn hàng
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label htmlFor="table">Số bàn / Vị trí</Label>
                <Input
                  id="table"
                  value={tableNumber}
                  onChange={(e) => setTableNumber(e.target.value)}
                  placeholder="Bàn 01, Mang về..."
                />
              </div>
              <div>
                <Label htmlFor="payment_method">Thanh toán</Label>
                <select
                  id="payment_method"
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value as "cash" | "card" | "bank_transfer")}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm shadow-xs"
                >
                  <option value="cash">Tiền mặt</option>
                  <option value="card">Thẻ POS</option>
                  <option value="bank_transfer">Chuyển khoản</option>
                </select>
              </div>
            </div>

            <div>
              <Label htmlFor="notes">Ghi chú bếp / phục vụ</Label>
              <Input
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Ít đá, tái vừa, không hành..."
              />
            </div>

            {/* Selected items list */}
            <div className="divide-y rounded-md border">
              {cart.length === 0 ? (
                <p className="py-8 text-center text-xs text-muted-foreground">Chưa có món nào được chọn</p>
              ) : (
                cart.map((item) => (
                  <div key={item.menu_item_id} className="flex items-center justify-between p-2.5 text-xs">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-foreground">{item.name}</p>
                      <p className="text-muted-foreground">{formatVND(item.unit_price)} / phần</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex items-center rounded-md border">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          onClick={() => updateQuantity(item.menu_item_id, -1)}
                        >
                          <Minus className="size-3" />
                        </Button>
                        <span className="w-6 text-center font-semibold">{item.quantity}</span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          onClick={() => updateQuantity(item.menu_item_id, 1)}
                        >
                          <Plus className="size-3" />
                        </Button>
                      </div>
                      <span className="w-16 text-right font-semibold">
                        {formatVND(item.quantity * item.unit_price)}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        className="text-destructive"
                        onClick={() => removeItem(item.menu_item_id)}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Total & Submit */}
            <div className="border-t pt-3 space-y-3">
              <div className="flex items-center justify-between text-base font-bold">
                <span>Tổng thanh toán:</span>
                <span className="text-lg text-primary">{formatVND(totalAmount)}</span>
              </div>

              <Button
                type="button"
                className="w-full"
                size="lg"
                disabled={cart.length === 0 || isSubmitting}
                onClick={handleCheckout}
              >
                <Receipt className="mr-2 size-4" />
                {isSubmitting ? "Đang xử lý trừ kho..." : "Hoàn tất đơn & Trừ kho"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
