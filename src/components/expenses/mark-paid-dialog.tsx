"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { markExpensePaid } from "@/server-actions/expenses.actions";
import { useAction } from "@/hooks/use-action";
import { formatVND } from "@/lib/format";
import { PAYMENT_METHOD_OPTIONS, type PaymentMethod } from "@/types/restaurant";
import type { ExpenseRow } from "@/lib/queries/expenses.queries";
import { FormServerError, SubmitButton } from "@/components/shared";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface MarkPaidDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  expense: ExpenseRow | null;
}

export function MarkPaidDialog({ open, onOpenChange, expense }: MarkPaidDialogProps) {
  const router = useRouter();
  const [method, setMethod] = useState<PaymentMethod>("bank_transfer");
  const [serverError, setServerError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setServerError(null);
      setMethod((expense?.payment_method as PaymentMethod | null) ?? "bank_transfer");
    }
  }, [open, expense]);

  const { execute, pending } = useAction(markExpensePaid, {
    successMessage: "Đã đánh dấu chi phí đã chi",
    onSuccess: () => {
      onOpenChange(false);
      router.refresh();
    },
    onError: (message) => setServerError(message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>Đánh dấu đã chi</DialogTitle>
          <DialogDescription>
            {expense
              ? `${expense.title} — ${formatVND(expense.amount)}`
              : "Chọn phương thức thanh toán."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <FormServerError message={serverError} />
          <div className="space-y-1.5">
            <Label htmlFor="paid-method">Phương thức thanh toán</Label>
            <Select value={method} onValueChange={(value) => setMethod(value as PaymentMethod)}>
              <SelectTrigger id="paid-method" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAYMENT_METHOD_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <p className="text-xs text-muted-foreground">
            Thời điểm chi được hệ thống ghi nhận tự động.
          </p>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Hủy
          </Button>
          <SubmitButton
            type="button"
            pending={pending}
            pendingText="Đang lưu..."
            onClick={() => {
              if (expense) void execute({ id: expense.id, payment_method: method, paid_at: null });
            }}
          >
            Xác nhận đã chi
          </SubmitButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
