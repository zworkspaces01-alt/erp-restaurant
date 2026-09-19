"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { Pencil, Trash2 } from "lucide-react";
import { ConfirmDialog, FormError, FormServerError, SubmitButton } from "@/components/shared";
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

  const { execute: remove } = useAction<string, { id: string }>(deletePurchaseOrder, {
    successMessage: "Đã xóa phiếu nhập",
    onSuccess: () => {
      setDeleteOpen(false);
      router.push("/purchases");
      router.refresh();
    },
  });

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
        <Pencil className="size-4" />
        Sửa thông tin
      </Button>
      {paidAmount === 0 ? (
        <Button variant="outline" size="sm" onClick={() => setDeleteOpen(true)}>
          <Trash2 className="size-4 text-destructive" />
          Xóa phiếu nhập
        </Button>
      ) : null}

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>Sửa thông tin phiếu {poNumber ?? ""}</DialogTitle>
            <DialogDescription>
              Chỉnh sửa ngày nhập hàng, số hóa đơn, hạn thanh toán và ghi chú. Sửa dòng hàng: xóa dòng rồi nhập
              lại.
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

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Xóa phiếu nhập?"
        description={`Xóa phiếu ${poNumber ?? ""} sẽ trừ lại tồn kho của toàn bộ dòng hàng và giảm công nợ nhà cung cấp. Giá vốn bình quân không được tính lại.`}
        confirmLabel="Xóa phiếu nhập"
        destructive
        onConfirm={async () => {
          await remove(purchaseOrderId);
        }}
      />
    </>
  );
}
