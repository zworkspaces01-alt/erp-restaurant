"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { deleteOrderAction } from "@/server-actions/orders.actions";
import { useAction } from "@/hooks/use-action";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function DeleteOrderButton({
  orderId,
  orderNumber,
  status = "completed",
  variant = "default",
  redirectToList = false,
}: {
  orderId: string;
  orderNumber: string | null;
  status?: "completed" | "cancelled";
  /** `icon` = nút gọn trong bảng /orders. */
  variant?: "default" | "icon";
  redirectToList?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");

  const { execute, pending } = useAction(
    async (id: string) => deleteOrderAction(id, reason.trim() || undefined),
    {
      successMessage: "Đã xóa hóa đơn bán hàng và chuyển vào Thùng rác.",
      onSuccess: () => {
        setOpen(false);
        setReason("");
        if (redirectToList) {
          router.push("/orders");
        }
        router.refresh();
      },
    }
  );

  return (
    <>
      {variant === "icon" ? (
        <Button
          variant="ghost"
          size="icon"
          disabled={pending}
          aria-label={`Xóa hóa đơn ${orderNumber ?? ""}`.trim()}
          title="Xóa hóa đơn"
          className="text-muted-foreground hover:text-destructive hover:bg-destructive/10"
          onClick={(e) => {
            e.stopPropagation();
            setOpen(true);
          }}
        >
          <Trash2 className="size-4" />
        </Button>
      ) : (
        <Button
          variant="outline"
          size="sm"
          disabled={pending}
          onClick={() => setOpen(true)}
          className="border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
        >
          <Trash2 className="mr-1.5 size-4" />
          Xóa hóa đơn
        </Button>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent onClick={(e) => e.stopPropagation()} className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="size-5" />
              Xóa hóa đơn bán hàng?
            </DialogTitle>
            <DialogDescription className="text-left space-y-2 pt-1 text-sm text-foreground/80">
              <p>
                Bạn có chắc chắn muốn xóa hóa đơn{" "}
                <span className="font-semibold text-foreground">{orderNumber ?? "này"}</span>?
              </p>
              {status === "completed" ? (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5 text-xs text-amber-800 dark:text-amber-300">
                  ⚠️ Hóa đơn này đang ở trạng thái <strong>Hoàn tất</strong>. Khi xóa, toàn bộ nguyên liệu đã xuất kho sẽ được <strong>hoàn trả lại kho</strong> tự động và hóa đơn được chuyển vào Thùng rác.
                </div>
              ) : (
                <div className="rounded-lg border bg-muted/60 p-2.5 text-xs text-muted-foreground">
                  Hóa đơn đã hủy này sẽ được chuyển vào <strong>Thùng rác</strong>. Bạn vẫn có thể xem lại hoặc khôi phục từ Thùng rác bất cứ lúc nào.
                </div>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-1.5 py-2">
            <label htmlFor="delete-reason" className="text-xs font-medium text-muted-foreground">
              Lý do xóa (tùy chọn)
            </label>
            <Input
              id="delete-reason"
              placeholder="VD: Nhập nhầm, hủy bàn, trùng hóa đơn..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="text-sm h-9"
            />
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={() => setOpen(false)}
            >
              Hủy bỏ
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={pending}
              onClick={() => execute(orderId)}
            >
              {pending ? "Đang xóa..." : "Xác nhận xóa"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
