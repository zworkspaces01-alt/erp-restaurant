"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Banknote, Calculator, Lock, RotateCcw, Trash2 } from "lucide-react";
import {
  PAYMENT_METHOD_OPTIONS,
  type PaymentMethod,
  type PayrollStatus,
} from "@/types/restaurant";
import {
  deletePayrollPeriod,
  finalizePayroll,
  generatePayroll,
  payPayroll,
  reopenPayroll,
} from "@/server-actions/hr.actions";
import { useAction } from "@/hooks/use-action";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ConfirmDialog, FormServerError, SubmitButton } from "@/components/shared";

interface PayrollActionsProps {
  periodId: string;
  status: PayrollStatus;
  itemCount: number;
}

export function PayrollActions({ periodId, status, itemCount }: PayrollActionsProps) {
  const router = useRouter();
  const [payOpen, setPayOpen] = useState(false);
  const [method, setMethod] = useState<PaymentMethod>("bank_transfer");
  const [confirm, setConfirm] = useState<"finalize" | "reopen" | "delete" | null>(null);

  const refresh = () => router.refresh();

  const generate = useAction<string, { count: number }>(generatePayroll, {
    successMessage: (data) => `Đã tính lương cho ${data.count} nhân viên`,
    onSuccess: refresh,
  });
  const finalize = useAction<string, { id: string }>(finalizePayroll, {
    successMessage: "Đã chốt bảng lương",
    onSuccess: () => {
      setConfirm(null);
      refresh();
    },
  });
  const reopen = useAction<string, { id: string }>(reopenPayroll, {
    successMessage: "Đã mở lại kỳ lương",
    onSuccess: () => {
      setConfirm(null);
      refresh();
    },
  });
  const remove = useAction<string, { id: string }>(deletePayrollPeriod, {
    successMessage: "Đã xóa kỳ lương",
    onSuccess: () => {
      setConfirm(null);
      router.push("/payroll");
    },
  });
  const pay = useAction<{ method: PaymentMethod }, { id: string }>(
    async (values) => payPayroll(periodId, { method: values.method, paid_at: null }),
    {
      successMessage: "Đã chi trả lương",
      onSuccess: () => {
        setPayOpen(false);
        refresh();
      },
    }
  );

  const isDraft = status === "draft";
  const isFinalized = status === "finalized";

  return (
    <div className="flex flex-wrap items-center gap-2">
      {isDraft && (
        <Button
          size="sm"
          variant="outline"
          disabled={generate.pending}
          onClick={() => void generate.execute(periodId)}
        >
          <Calculator className="mr-1.5 size-4" />
          {generate.pending ? "Đang tính..." : "Tính lương"}
        </Button>
      )}

      {isDraft && (
        <Button size="sm" disabled={itemCount === 0} onClick={() => setConfirm("finalize")}>
          <Lock className="mr-1.5 size-4" />
          Chốt
        </Button>
      )}

      {isFinalized && (
        <>
          <Button size="sm" variant="outline" onClick={() => setConfirm("reopen")}>
            <RotateCcw className="mr-1.5 size-4" />
            Mở lại
          </Button>
          <Button size="sm" onClick={() => setPayOpen(true)}>
            <Banknote className="mr-1.5 size-4" />
            Chi trả
          </Button>
        </>
      )}

      {isDraft && (
        <Button size="sm" variant="ghost" onClick={() => setConfirm("delete")}>
          <Trash2 className="mr-1.5 size-4 text-destructive" />
          Xóa kỳ
        </Button>
      )}

      <ConfirmDialog
        open={confirm === "finalize"}
        onOpenChange={(open) => !open && setConfirm(null)}
        title="Chốt bảng lương?"
        description="Sau khi chốt, các dòng lương không thể chỉnh sửa. Kỳ lương sẽ được tính vào chi phí nhân sự trong báo cáo P&L."
        confirmLabel="Chốt bảng lương"
        onConfirm={async () => {
          await finalize.execute(periodId);
        }}
      />

      <ConfirmDialog
        open={confirm === "reopen"}
        onOpenChange={(open) => !open && setConfirm(null)}
        title="Mở lại kỳ lương?"
        description="Kỳ lương quay về trạng thái nháp để tính lại hoặc chỉnh sửa. Chỉ Chủ/Quản lý mới thực hiện được."
        confirmLabel="Mở lại"
        onConfirm={async () => {
          await reopen.execute(periodId);
        }}
      />

      <ConfirmDialog
        open={confirm === "delete"}
        onOpenChange={(open) => !open && setConfirm(null)}
        title="Xóa kỳ lương?"
        description="Toàn bộ dòng lương của kỳ này sẽ bị xóa. Chỉ xóa được kỳ đang ở trạng thái nháp."
        confirmLabel="Xóa kỳ lương"
        destructive
        onConfirm={async () => {
          await remove.execute(periodId);
        }}
      />

      <Dialog open={payOpen} onOpenChange={setPayOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Chi trả lương</DialogTitle>
            <DialogDescription>
              Sau khi chi trả, kỳ lương sẽ bị khóa vĩnh viễn và không thể thay đổi.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-1.5">
            <Label htmlFor="pay_method">Hình thức chi trả</Label>
            <Select value={method} onValueChange={(v) => setMethod(v as PaymentMethod)}>
              <SelectTrigger id="pay_method" className="w-full">
                <SelectValue />
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

          <FormServerError message={pay.error} />

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setPayOpen(false)}>
              Hủy
            </Button>
            <SubmitButton
              type="button"
              pending={pay.pending}
              pendingText="Đang chi trả..."
              onClick={() => void pay.execute({ method })}
            >
              Xác nhận chi trả
            </SubmitButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
