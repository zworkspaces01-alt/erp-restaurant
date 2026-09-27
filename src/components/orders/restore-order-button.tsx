"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RotateCcw } from "lucide-react";
import { restoreCancelledOrderAction } from "@/server-actions/orders.actions";
import { useAction } from "@/hooks/use-action";
import { ConfirmDialog } from "@/components/shared";
import { Button } from "@/components/ui/button";

export function RestoreOrderButton({
  orderId,
  orderNumber,
  variant = "default",
}: {
  orderId: string;
  orderNumber: string | null;
  /** `icon` = nút gọn trong bảng /orders. */
  variant?: "default" | "icon";
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const { execute, pending } = useAction(restoreCancelledOrderAction, {
    successMessage: "Đã khôi phục đơn bán thành công! Nguyên liệu đã được trừ lại kho.",
    onSuccess: (data) => {
      if (data?.id) {
        router.push(`/orders/${data.id}`);
      }
      router.refresh();
    },
  });

  return (
    <>
      {variant === "icon" ? (
        <Button
          variant="ghost"
          size="icon"
          disabled={pending}
          aria-label={`Khôi phục đơn ${orderNumber ?? ""}`.trim()}
          title="Khôi phục đơn"
          className="text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
          onClick={() => setOpen(true)}
        >
          <RotateCcw className={`size-4 ${pending ? "animate-spin" : ""}`} />
        </Button>
      ) : (
        <Button
          variant="outline"
          size="sm"
          disabled={pending}
          onClick={() => setOpen(true)}
          className="border-emerald-500/40 text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700 dark:border-emerald-500/30 dark:hover:bg-emerald-950/30"
        >
          <RotateCcw className={`mr-1.5 size-4 ${pending ? "animate-spin" : ""}`} />
          Khôi phục đơn
        </Button>
      )}
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Khôi phục đơn hàng?"
        description={
          <>
            Đơn <span className="font-semibold text-foreground">{orderNumber ?? "này"}</span> sẽ
            chuyển lại trạng thái &quot;Hoàn tất&quot;. Nguyên liệu theo định lượng món sẽ được trừ lại
            kho tự động.
          </>
        }
        confirmLabel="Khôi phục"
        cancelLabel="Hủy bỏ"
        onConfirm={async () => {
          await execute(orderId);
        }}
      />
    </>
  );
}
