"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Ban } from "lucide-react";
import { cancelOrderAction } from "@/server-actions/orders.actions";
import { useAction } from "@/hooks/use-action";
import { ConfirmDialog } from "@/components/shared";
import { Button } from "@/components/ui/button";

export function CancelOrderButton({
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
  const { execute, pending } = useAction(cancelOrderAction, {
    successMessage: "Đã hủy đơn và hoàn kho nguyên liệu",
    onSuccess: () => router.refresh(),
  });

  return (
    <>
      {variant === "icon" ? (
        <Button
          variant="ghost"
          size="icon"
          disabled={pending}
          aria-label={`Hủy đơn ${orderNumber ?? ""}`.trim()}
          title="Hủy đơn"
          className="text-destructive hover:text-destructive"
          onClick={() => setOpen(true)}
        >
          <Ban className="size-4" />
        </Button>
      ) : (
        <Button variant="destructive" size="sm" disabled={pending} onClick={() => setOpen(true)}>
          <Ban className="size-4" />
          Hủy đơn
        </Button>
      )}
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        destructive
        title="Hủy đơn hàng?"
        description={
          <>
            Đơn <span className="font-medium">{orderNumber ?? "này"}</span> sẽ chuyển sang trạng thái
            &quot;Đã hủy&quot;. Nguyên liệu đã trừ sẽ được hoàn lại kho. Thao tác không thể khôi phục.
          </>
        }
        confirmLabel="Hủy đơn"
        cancelLabel="Đóng"
        onConfirm={async () => {
          await execute(orderId);
        }}
      />
    </>
  );
}
