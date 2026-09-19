"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { AlertTriangle, Pencil, Trash2 } from "lucide-react";
import { FormError, FormServerError, SubmitButton } from "@/components/shared";
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
import { Textarea } from "@/components/ui/textarea";
import { useAction } from "@/hooks/use-action";
import {
  purchaseOrderMetaSchema,
  type PurchaseOrderMetaInput,
} from "@/types/restaurant";
import {
  deletePurchaseOrder,
  updatePurchaseOrderMeta,
} from "@/server-actions/purchases.actions";
import { PoAuditHistoryDialog } from "./po-audit-history-dialog";

type FormValues = z.input<typeof purchaseOrderMetaSchema>;

interface PurchaseOrderActionsProps {
  purchaseOrderId: string;
  poNumber: string | null;
  orderDate?: string | null;
  invoiceNumber: string | null;
  dueDate: string | null;
  note: string | null;
  /** `paid_amount` của phiếu — chỉ cho xóa khi chưa thanh toán đồng nào. */
  paidAmount: number;
}

export function PurchaseOrderActions({
  purchaseOrderId,
  poNumber,
  orderDate,
  invoiceNumber,
  dueDate,
  note,
  paidAmount,
}: PurchaseOrderActionsProps) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteReason, setDeleteReason] = useState("");
  const [serverError, setServerError] = useState<string | null>(null);

  const defaults: FormValues = {
    order_date: orderDate ? orderDate.slice(0, 10) : "",
    invoice_number: invoiceNumber ?? "",
    due_date: dueDate ? dueDate.slice(0, 10) : "",
    note: note ?? "",
  };

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues, unknown, PurchaseOrderMetaInput>({
    resolver: zodResolver(purchaseOrderMetaSchema),
    defaultValues: defaults,
  });

  useEffect(() => {
    if (editOpen) {
      setServerError(null);
      reset({
        order_date: orderDate ? orderDate.slice(0, 10) : "",
        invoice_number: invoiceNumber ?? "",
        due_date: dueDate ? dueDate.slice(0, 10) : "",
        note: note ?? "",
      });
    }
  }, [editOpen, orderDate, invoiceNumber, dueDate, note, reset]);

  const { execute: save, pending } = useAction<PurchaseOrderMetaInput, { id: string }>(
    (values) => updatePurchaseOrderMeta(purchaseOrderId, values),
    {
      successMessage: "Đã cập nhật phiếu nhập",
      onSuccess: () => {
        setEditOpen(false);
        router.refresh();
      },
      onError: (message) => setServerError(message),
    }
  );

  const { execute: remove, pending: deleting } = useAction<
    { id: string; reason?: string },
    { id: string }
  >(({ id, reason }) => deletePurchaseOrder(id, reason), {
    successMessage: "Đã xóa phiếu nhập và đưa vào Thùng rác",
    onSuccess: () => {
      setDeleteOpen(false);
      router.push("/purchases");
      router.refresh();
    },
    onError: (message) => setServerError(message),
  });

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Nút xem lịch sử thay đổi */}
      <PoAuditHistoryDialog purchaseOrderId={purchaseOrderId} poNumber={poNumber} />

      {/* Nút sửa thông tin */}
      <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
        <Pencil className="size-4" />
        Sửa thông tin
      </Button>

      {/* Nút xóa phiếu nhập */}
      {paidAmount === 0 ? (
        <Button variant="outline" size="sm" onClick={() => setDeleteOpen(true)}>
          <Trash2 className="size-4 text-destructive" />
          Xóa phiếu nhập
        </Button>
      ) : null}

      {/* Modal sửa thông tin */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>Sửa thông tin phiếu {poNumber ?? ""}</DialogTitle>
            <DialogDescription>
              Chỉnh sửa ngày nhập hàng, số hóa đơn, hạn thanh toán và ghi chú. Thao tác này sẽ được ghi vào nhật ký.
            </DialogDescription>
          </DialogHeader>

          <form
            className="space-y-4"
            onSubmit={handleSubmit(async (values) => {
              await save(values);
            })}
          >
            <FormServerError message={serverError} />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="order_date">Ngày nhập hàng</Label>
                <Input id="order_date" type="date" {...register("order_date")} />
                <FormError message={errors.order_date?.message} />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="due_date">Hạn thanh toán</Label>
                <Input id="due_date" type="date" {...register("due_date")} />
                <FormError message={errors.due_date?.message} />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="invoice_number">Số hóa đơn</Label>
              <Input id="invoice_number" placeholder="HD-0001" {...register("invoice_number")} />
              <FormError message={errors.invoice_number?.message} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="note">Ghi chú</Label>
              <Textarea id="note" rows={3} {...register("note")} />
              <FormError message={errors.note?.message} />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditOpen(false)}>
                Hủy
              </Button>
              <SubmitButton pending={pending}>Lưu thay đổi</SubmitButton>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Modal xác nhận xóa có nhập lý do & thông báo Thùng rác */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="size-5" />
              Xác nhận xóa phiếu nhập {poNumber ?? ""}?
            </DialogTitle>
            <DialogDescription>
              Khi xóa phiếu, hệ thống sẽ tự động trừ lại tồn kho các mặt hàng và giảm trừ công nợ nhà cung cấp tương ứng.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div className="text-xs bg-muted/60 p-3 rounded-lg border border-muted-foreground/15 space-y-1">
              <p className="font-semibold text-foreground">💡 An tâm dữ liệu:</p>
              <p className="text-muted-foreground">
                Toàn bộ dữ liệu phiếu và các mặt hàng sẽ được lưu vào <strong>Thùng rác</strong>. Bạn có thể xem lại hoặc bấm <strong>Khôi phục</strong> bất cứ khi nào.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="delete_reason" className="text-xs font-medium">
                Lý do xóa (tùy chọn)
              </Label>
              <Input
                id="delete_reason"
                placeholder="VD: Nhập nhầm nhà cung cấp, hóa đơn bị hủy..."
                value={deleteReason}
                onChange={(e) => setDeleteReason(e.target.value)}
                className="text-xs"
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setDeleteOpen(false);
                setDeleteReason("");
              }}
              disabled={deleting}
            >
              Hủy
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={deleting}
              onClick={async () => {
                await remove({ id: purchaseOrderId, reason: deleteReason.trim() || undefined });
              }}
              className="gap-1.5"
            >
              <Trash2 className="size-4" />
              {deleting ? "Đang xóa..." : "Xác nhận xóa vào Thùng rác"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
