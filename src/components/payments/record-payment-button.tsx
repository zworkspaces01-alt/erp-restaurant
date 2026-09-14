"use client";

import { useState } from "react";
import { Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { PurchaseOrderRow, SupplierPickRow } from "@/lib/queries/purchases.queries";
import { RecordPaymentDialog } from "./record-payment-dialog";

interface RecordPaymentButtonProps {
  suppliers: SupplierPickRow[];
  outstandingOrders: PurchaseOrderRow[];
  presetSupplierId?: string;
  presetPurchaseOrderId?: string;
  label?: string;
  variant?: "default" | "outline" | "secondary";
  size?: "default" | "sm";
  disabled?: boolean;
}

export function RecordPaymentButton({
  suppliers,
  outstandingOrders,
  presetSupplierId,
  presetPurchaseOrderId,
  label = "Ghi nhận thanh toán",
  variant = "default",
  size = "sm",
  disabled = false,
}: RecordPaymentButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button size={size} variant={variant} disabled={disabled} onClick={() => setOpen(true)}>
        <Wallet className="mr-1.5 size-4" />
        {label}
      </Button>
      <RecordPaymentDialog
        open={open}
        onOpenChange={setOpen}
        suppliers={suppliers}
        outstandingOrders={outstandingOrders}
        presetSupplierId={presetSupplierId}
        presetPurchaseOrderId={presetPurchaseOrderId}
      />
    </>
  );
}
