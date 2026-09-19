"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Trash2, Ban } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { formatVND } from "@/lib/format";
import { deleteSupplier, deactivateSupplier } from "@/server-actions/purchases.actions";
import { toast } from "sonner";

export interface SupplierDeleteData {
  id: string;
  name: string;
  code: string | null;
  current_debt: number;
  po_count: number;
  is_active: boolean;
}

interface SupplierDeleteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  supplier: SupplierDeleteData | null;
  onSuccess?: () => void;
}

export function SupplierDeleteDialog({
  open,
  onOpenChange,
  supplier,
  onSuccess,
}: SupplierDeleteDialogProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  if (!supplier) return null;

  const hasTransactions = supplier.po_count > 0 || supplier.current_debt > 0;

  const handleDelete = async () => {
    setLoading(true);
    try {
      const res = await deleteSupplier(supplier.id);
      if (res.success) {
        toast.success(`Đã xóa nhà cung cấp "${supplier.name}" thành công.`);
        onOpenChange(false);
        router.refresh();
        onSuccess?.();
      } else {
        toast.error(res.error || "Không thể xóa nhà cung cấp.");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Đã có lỗi xảy ra khi xóa.");
    } finally {
      setLoading(false);
    }
  };

  const handleDeactivate = async () => {
    setLoading(true);
    try {
      const res = await deactivateSupplier(supplier.id);
      if (res.success) {
        toast.success(`Đã chuyển nhà cung cấp "${supplier.name}" sang trạng thái ngừng hợp tác.`);
        onOpenChange(false);
        router.refresh();
        onSuccess?.();
      } else {
        toast.error(res.error || "Không thể cập nhật trạng thái.");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Đã có lỗi xảy ra.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="size-5" />
            <DialogTitle>
              {hasTransactions ? "Quản lý ngừng hợp tác / Xóa NCC" : "Xác nhận xóa nhà cung cấp"}
            </DialogTitle>
          </div>
          <DialogDescription className="pt-2 text-sm text-foreground/80 leading-relaxed">
            Bạn đang thao tác với nhà cung cấp:{" "}
            <strong className="text-foreground">{supplier.name}</strong>
            {supplier.code ? ` (${supplier.code})` : ""}.
          </DialogDescription>
        </DialogHeader>

        <div className="py-2 space-y-3">
          {hasTransactions ? (
            <div className="rounded-lg border border-warning/30 bg-warning/10 p-3.5 space-y-2 text-xs text-warning-foreground">
              <div className="font-semibold flex items-center gap-1.5 text-amber-700 dark:text-amber-400">
                <AlertTriangle className="size-4 shrink-0" />
                <span>Nhà cung cấp đã phát sinh dữ liệu giao dịch:</span>
              </div>
              <ul className="list-disc ml-5 space-y-1 text-muted-foreground">
                <li>
                  Số lượng phiếu nhập: <strong className="text-foreground">{supplier.po_count} phiếu</strong>
                </li>
                <li>
                  Công nợ hiện tại:{" "}
                  <strong className="text-foreground">{formatVND(supplier.current_debt)}</strong>
                </li>
              </ul>
              <p className="text-[11px] text-muted-foreground pt-1 border-t border-warning/20">
                Để bảo toàn sổ sách tài chính và hóa đơn nhập kho, hệ thống không thể xóa vĩnh viễn NCC này. Bạn có thể chọn <strong>Ngừng hợp tác</strong> (vô hiệu hóa) hoặc sử dụng tính năng <strong>Gộp NCC</strong> để chuyển dữ liệu sang NCC khác.
              </p>
            </div>
          ) : (
            <div className="rounded-lg border bg-muted/40 p-3.5 text-xs text-muted-foreground space-y-1">
              <p>
                Nhà cung cấp này <strong>chưa phát sinh phiếu nhập hay công nợ nào</strong>.
              </p>
              <p className="text-destructive font-medium">
                Thao tác xóa vĩnh viễn sẽ xóa hoàn toàn bản ghi khỏi cơ sở dữ liệu và không thể hoàn tác.
              </p>
            </div>
          )}
        </div>

        <DialogFooter className="flex flex-col-reverse sm:flex-row gap-2 pt-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            Hủy bỏ
          </Button>

          {hasTransactions ? (
            <Button
              type="button"
              variant="default"
              className="bg-amber-600 hover:bg-amber-700 text-white"
              onClick={handleDeactivate}
              disabled={loading || !supplier.is_active}
            >
              <Ban className="size-4 mr-1.5" />
              {supplier.is_active ? "Ngừng hợp tác (Ẩn NCC)" : "Đã ngừng hợp tác"}
            </Button>
          ) : (
            <Button
              type="button"
              variant="destructive"
              onClick={handleDelete}
              disabled={loading}
            >
              <Trash2 className="size-4 mr-1.5" />
              {loading ? "Đang xóa..." : "Xóa vĩnh viễn"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
