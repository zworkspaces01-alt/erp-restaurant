"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  RotateCcw,
  Trash2,
  AlertCircle,
  Eye,
  Calendar,
  Building2,
  Package,
  Search,
  Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/shared";
import {
  getDeletedPurchaseOrdersAction,
  restorePurchaseOrderAction,
} from "@/server-actions/purchases.actions";
import type { PurchaseOrderAuditLog, PoAuditSnapshot } from "@/lib/purchases/po-audit-service";
import { formatDate, formatVND } from "@/lib/format";
import { toast } from "sonner";

export function PurchasesTrashView() {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [logs, setLogs] = useState<PurchaseOrderAuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  // Detail modal state
  const [viewSnapshot, setViewSnapshot] = useState<PoAuditSnapshot | null>(null);

  // Restore confirmation state
  const [restoreTarget, setRestoreTarget] = useState<PurchaseOrderAuditLog | null>(null);
  const [restoring, setRestoring] = useState(false);

  const fetchDeleted = async () => {
    setLoading(true);
    try {
      const res = await getDeletedPurchaseOrdersAction();
      setLogs(res);
    } catch (err) {
      console.error("Could not load trash logs:", err);
      toast.error("Không thể tải danh sách phiếu đã xóa.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDeleted();
  }, []);

  const handleRestore = async () => {
    if (!restoreTarget) return;
    setRestoring(true);
    try {
      const res = await restorePurchaseOrderAction(restoreTarget.id);
      if (res.success) {
        toast.success(
          `Khôi phục thành công phiếu ${res.data.poNumber}! Tồn kho và công nợ đã được cộng lại.`
        );
        setRestoreTarget(null);
        startTransition(() => {
          fetchDeleted();
          router.refresh();
        });
      } else {
        toast.error(res.error || "Không thể khôi phục phiếu nhập.");
      }
    } catch {
      toast.error("Đã xảy ra lỗi khi khôi phục phiếu nhập.");
    } finally {
      setRestoring(false);
    }
  };

  const filteredLogs = logs.filter((log) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      log.po_number.toLowerCase().includes(q) ||
      (log.supplier_name && log.supplier_name.toLowerCase().includes(q)) ||
      (log.details.reason && log.details.reason.toLowerCase().includes(q)) ||
      (log.performed_by_name && log.performed_by_name.toLowerCase().includes(q))
    );
  });

  return (
    <div className="space-y-4">
      {/* Top filter toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-muted/40 p-3 rounded-xl border">
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            placeholder="Tìm theo mã phiếu, NCC, lý do xóa, người xóa..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-background h-9 text-xs"
          />
        </div>

        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs bg-background">
            Thùng rác: <strong className="ml-1 text-foreground">{logs.length}</strong> phiếu đã xóa
          </Badge>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={fetchDeleted}
            disabled={loading}
            className="h-8 text-xs gap-1 text-muted-foreground"
          >
            <RotateCcw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
            Làm mới
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
          <Clock className="size-6 animate-spin text-primary" />
          <p className="text-sm">Đang tải danh sách phiếu đã xóa...</p>
        </div>
      ) : filteredLogs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center border rounded-xl border-dashed bg-muted/20">
          <div className="size-12 rounded-full bg-muted flex items-center justify-center mb-3 text-muted-foreground">
            <Trash2 className="size-6 stroke-1" />
          </div>
          <p className="font-semibold text-foreground">Thùng rác rỗng</p>
          <p className="text-xs text-muted-foreground mt-1 max-w-sm">
            {search
              ? "Không tìm thấy phiếu nào khớp với từ khóa tìm kiếm."
              : "Hiện không có phiếu nhập nào bị xóa hoặc tất cả phiếu xóa đã được khôi phục."}
          </p>
        </div>
      ) : (
        <div className="grid gap-3.5">
          {filteredLogs.map((log) => {
            const snap = log.snapshot;
            const delDate = new Date(log.created_at);
            const delDateStr = delDate.toLocaleString("vi-VN", {
              day: "2-digit",
              month: "2-digit",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            });

            return (
              <Card key={log.id} className="overflow-hidden border-border/80 hover:border-border transition-colors">
                <CardContent className="p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
                  {/* Left: Info */}
                  <div className="space-y-2 min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-base text-foreground font-mono tracking-tight">
                        {log.po_number}
                      </span>
                      <Badge variant="outline" className="border-destructive/30 text-destructive bg-destructive/10 text-xs">
                        Đã xóa
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        Xóa lúc: <strong className="text-foreground">{delDateStr}</strong>
                      </span>
                      <span className="text-xs text-muted-foreground">
                        bởi <strong className="text-foreground">{log.performed_by_name || "Nhân viên"}</strong>
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <div className="flex items-center gap-1.5 text-foreground font-medium">
                        <Building2 className="size-3.5 text-primary" />
                        {log.supplier_name || snap?.supplier_name || "Nhà cung cấp"}
                      </div>
                      {snap?.order_date && (
                        <div className="flex items-center gap-1">
                          <Calendar className="size-3.5" />
                          Ngày nhập cũ: {formatDate(snap.order_date)}
                        </div>
                      )}
                      {snap?.items && (
                        <div className="flex items-center gap-1">
                          <Package className="size-3.5" />
                          {snap.items.length} mặt hàng
                        </div>
                      )}
                      {snap?.total_amount !== undefined && (
                        <div className="font-semibold text-foreground">
                          Tổng tiền: {formatVND(snap.total_amount)}
                        </div>
                      )}
                    </div>

                    {/* Lý do xóa */}
                    {log.details.reason && (
                      <div className="text-xs bg-muted/60 rounded-md px-2.5 py-1.5 inline-flex items-center gap-1.5 text-muted-foreground">
                        <AlertCircle className="size-3.5 text-amber-500 shrink-0" />
                        <span>
                          <strong>Lý do xóa:</strong> {log.details.reason}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Right: Actions */}
                  <div className="flex items-center gap-2 self-end md:self-center shrink-0">
                    {snap && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setViewSnapshot(snap)}
                        className="h-8 text-xs gap-1.5"
                      >
                        <Eye className="size-3.5" />
                        Xem chi tiết
                      </Button>
                    )}

                    <Button
                      type="button"
                      size="sm"
                      onClick={() => setRestoreTarget(log)}
                      className="h-8 text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-medium"
                    >
                      <RotateCcw className="size-3.5" />
                      Khôi phục phiếu
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Snapshot View Details Dialog */}
      <Dialog open={!!viewSnapshot} onOpenChange={(o) => !o && setViewSnapshot(null)}>
        <DialogContent className="sm:max-w-[650px] max-h-[85vh] flex flex-col p-6">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package className="size-5 text-primary" />
              Chi tiết phiếu đã xóa: {viewSnapshot?.po_number}
            </DialogTitle>
            <DialogDescription>
              Bản sao lưu (snapshot) các dòng hàng, đơn giá và số lượng trước thời điểm xóa.
            </DialogDescription>
          </DialogHeader>

          {viewSnapshot && (
            <div className="flex-1 overflow-y-auto space-y-4 pt-2">
              <div className="grid grid-cols-2 gap-3 text-xs p-3 bg-muted/30 rounded-lg border">
                <div>
                  <span className="text-muted-foreground">Nhà cung cấp:</span>
                  <div className="font-semibold text-foreground mt-0.5">{viewSnapshot.supplier_name}</div>
                </div>
                <div>
                  <span className="text-muted-foreground">Ngày nhập hàng:</span>
                  <div className="font-semibold text-foreground mt-0.5">{formatDate(viewSnapshot.order_date)}</div>
                </div>
                <div>
                  <span className="text-muted-foreground">Số hóa đơn:</span>
                  <div className="font-medium text-foreground mt-0.5">{viewSnapshot.invoice_number || "—"}</div>
                </div>
                <div>
                  <span className="text-muted-foreground">Tổng giá trị:</span>
                  <div className="font-bold text-foreground mt-0.5 text-sm">{formatVND(viewSnapshot.total_amount)}</div>
                </div>
                {viewSnapshot.delete_reason && (
                  <div className="col-span-2 text-amber-600 dark:text-amber-400 bg-amber-500/10 p-2 rounded">
                    <strong>Lý do xóa:</strong> {viewSnapshot.delete_reason}
                  </div>
                )}
              </div>

              <div>
                <h4 className="text-xs font-semibold text-muted-foreground mb-2">
                  Danh sách mặt hàng ({viewSnapshot.items.length}):
                </h4>
                <div className="border rounded-lg overflow-hidden text-xs">
                  <table className="w-full text-left">
                    <thead className="bg-muted/60 text-muted-foreground border-b font-medium">
                      <tr>
                        <th className="py-2 px-3">Tên nguyên liệu</th>
                        <th className="py-2 px-3 text-right">Số lượng</th>
                        <th className="py-2 px-3 text-right">Đơn giá</th>
                        <th className="py-2 px-3 text-right">Thành tiền</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {viewSnapshot.items.map((it, idx) => (
                        <tr key={idx} className="hover:bg-muted/20">
                          <td className="py-2 px-3 font-medium text-foreground">{it.ingredient_name}</td>
                          <td className="py-2 px-3 text-right font-mono">
                            {it.quantity} {it.unit}
                          </td>
                          <td className="py-2 px-3 text-right font-mono text-muted-foreground">
                            {formatVND(it.unit_price)}
                          </td>
                          <td className="py-2 px-3 text-right font-mono font-medium">
                            {formatVND(it.line_total)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={() => setViewSnapshot(null)}>
              Đóng
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm Restore Dialog */}
      {restoreTarget && (
        <ConfirmDialog
          open={!!restoreTarget}
          onOpenChange={(open) => !open && setRestoreTarget(null)}
          title="Khôi phục phiếu nhập này?"
          description={`Hệ thống sẽ tái tạo lại phiếu nhập ${restoreTarget.po_number} cho nhà cung cấp "${restoreTarget.supplier_name}". Đồng thời, toàn bộ tồn kho của ${restoreTarget.snapshot?.items.length ?? 0} mặt hàng và công nợ sẽ được cộng trở lại sổ sách kế toán.`}
          confirmLabel={restoring ? "Đang khôi phục..." : "Xác nhận khôi phục"}
          onConfirm={handleRestore}
        />
      )}
    </div>
  );
}
