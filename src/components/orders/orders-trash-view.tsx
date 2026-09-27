"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  RotateCcw,
  Trash2,
  Eye,
  Calendar,
  Search,
  Clock,
  Receipt,
  User,
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
  getOrderTrashLogsAction,
  restoreDeletedOrderAction,
  permanentDeleteOrderTrashAction,
} from "@/server-actions/orders.actions";
import type { OrderTrashLog, OrderTrashSnapshot } from "@/lib/orders/order-trash-service";
import { formatDateTime, formatNumber, formatVND } from "@/lib/format";
import { PAYMENT_METHOD_LABELS } from "@/types/restaurant";
import { toast } from "sonner";

export function OrdersTrashView({ onCountChange }: { onCountChange?: (count: number) => void }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [logs, setLogs] = useState<OrderTrashLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  // Detail modal state
  const [viewSnapshot, setViewSnapshot] = useState<OrderTrashSnapshot | null>(null);

  // Restore confirmation state
  const [restoreTarget, setRestoreTarget] = useState<OrderTrashLog | null>(null);
  const [restoring, setRestoring] = useState(false);

  // Permanent delete confirmation state
  const [deleteTarget, setDeleteTarget] = useState<OrderTrashLog | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchDeleted = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getOrderTrashLogsAction();
      setLogs(res);
      const activeCount = res.filter((l) => !l.is_restored).length;
      onCountChange?.(activeCount);
    } catch (err) {
      console.error("Could not load order trash logs:", err);
      toast.error("Không thể tải danh sách hóa đơn trong Thùng rác.");
    } finally {
      setLoading(false);
    }
  }, [onCountChange]);

  useEffect(() => {
    fetchDeleted();
  }, [fetchDeleted]);

  const handleRestore = async () => {
    if (!restoreTarget) return;
    setRestoring(true);
    try {
      const res = await restoreDeletedOrderAction(restoreTarget.id);
      if (res.success) {
        toast.success(
          `Khôi phục thành công hóa đơn ${res.data.orderNumber}! Nguyên liệu đã được trừ lại kho.`
        );
        setRestoreTarget(null);
        startTransition(() => {
          fetchDeleted();
          router.refresh();
        });
      } else {
        toast.error(res.error || "Không thể khôi phục hóa đơn.");
      }
    } catch {
      toast.error("Đã xảy ra lỗi khi khôi phục hóa đơn.");
    } finally {
      setRestoring(false);
    }
  };

  const handlePermanentDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await permanentDeleteOrderTrashAction(deleteTarget.id);
      if (res.success) {
        toast.success("Đã xóa vĩnh viễn bản ghi khỏi Thùng rác.");
        setDeleteTarget(null);
        startTransition(() => {
          fetchDeleted();
        });
      } else {
        toast.error(res.error || "Không thể xóa vĩnh viễn.");
      }
    } catch {
      toast.error("Đã xảy ra lỗi khi xóa vĩnh viễn.");
    } finally {
      setDeleting(false);
    }
  };

  const filteredLogs = logs.filter((log) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    const snap = log.snapshot;
    return (
      (log.order_number && log.order_number.toLowerCase().includes(q)) ||
      (snap?.table_number && snap.table_number.toLowerCase().includes(q)) ||
      (snap?.delete_reason && snap.delete_reason.toLowerCase().includes(q)) ||
      (snap?.deleted_by_name && snap.deleted_by_name.toLowerCase().includes(q))
    );
  });

  const activeCount = logs.filter((l) => !l.is_restored).length;

  return (
    <div className="space-y-4">
      {/* Top filter toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-muted/40 p-3 rounded-xl border">
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            placeholder="Tìm theo mã đơn, bàn, lý do xóa, người xóa..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-background h-9 text-xs"
          />
        </div>

        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs bg-background">
            Thùng rác: <strong className="ml-1 text-foreground">{activeCount}</strong> hóa đơn đã xóa
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
          <p className="text-sm">Đang tải danh sách hóa đơn đã xóa...</p>
        </div>
      ) : filteredLogs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center border rounded-xl border-dashed bg-muted/20">
          <div className="size-12 rounded-full bg-muted flex items-center justify-center mb-3 text-muted-foreground">
            <Trash2 className="size-6 stroke-1" />
          </div>
          <p className="font-semibold text-foreground">Thùng rác rỗng</p>
          <p className="text-xs text-muted-foreground mt-1 max-w-sm">
            {search
              ? "Không tìm thấy hóa đơn nào khớp với từ khóa tìm kiếm."
              : "Hiện không có hóa đơn bán hàng nào bị xóa hoặc tất cả hóa đơn đã được khôi phục."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredLogs.map((log) => {
            const snap = log.snapshot;
            const isRestored = log.is_restored;
            const gross = snap?.total_with_tax || snap?.total_amount || log.details.total_amount || 0;

            return (
              <Card
                key={log.id}
                className={`transition-colors overflow-hidden ${
                  isRestored ? "opacity-60 bg-muted/30" : "hover:border-primary/40"
                }`}
              >
                <CardContent className="p-4 sm:p-5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    {/* Thông tin hóa đơn */}
                    <div className="space-y-1.5 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono font-bold text-base text-foreground">
                          {log.order_number}
                        </span>
                        {snap?.table_number && (
                          <Badge variant="secondary" className="text-xs font-normal">
                            Bàn: {snap.table_number}
                          </Badge>
                        )}
                        {snap?.payment_method && (
                          <span className="text-xs text-muted-foreground">
                            ({PAYMENT_METHOD_LABELS[snap.payment_method]})
                          </span>
                        )}
                        {isRestored ? (
                          <Badge variant="outline" className="text-xs bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border-emerald-300">
                            ✓ Đã khôi phục
                          </Badge>
                        ) : (
                          <Badge variant="destructive" className="text-xs">
                            Đã xóa
                          </Badge>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-y-1 gap-x-4 text-xs text-muted-foreground">
                        {snap?.order_date && (
                          <span className="flex items-center gap-1">
                            <Calendar className="size-3.5" />
                            Bán lúc: {formatDateTime(snap.order_date)}
                          </span>
                        )}
                        {snap?.deleted_at && (
                          <span className="flex items-center gap-1">
                            <Clock className="size-3.5 text-destructive" />
                            Xóa lúc: {formatDateTime(snap.deleted_at)}
                          </span>
                        )}
                        {snap?.deleted_by_name && (
                          <span className="flex items-center gap-1">
                            <User className="size-3.5" />
                            Bởi: <strong className="text-foreground">{snap.deleted_by_name}</strong>
                          </span>
                        )}
                      </div>

                      {snap?.delete_reason && (
                        <p className="text-xs text-amber-700 dark:text-amber-400 bg-amber-500/10 px-2.5 py-1 rounded-md inline-block">
                          <strong>Lý do xóa:</strong> {snap.delete_reason}
                        </p>
                      )}
                    </div>

                    {/* Số tiền & Thao tác */}
                    <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-center gap-3 shrink-0 pt-2 sm:pt-0 border-t sm:border-0">
                      <div className="text-left sm:text-right">
                        <div className="text-sm sm:text-base font-bold text-foreground tabular-nums">
                          {formatVND(gross)}
                        </div>
                        <div className="text-[11px] text-muted-foreground">
                          {snap?.items?.length ?? log.details.item_count ?? 0} dòng món
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5">
                        {snap && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-8 text-xs gap-1"
                            onClick={() => setViewSnapshot(snap)}
                          >
                            <Eye className="size-3.5" />
                            Xem món
                          </Button>
                        )}

                        {!isRestored && (
                          <Button
                            type="button"
                            size="sm"
                            className="h-8 text-xs gap-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                            onClick={() => setRestoreTarget(log)}
                          >
                            <RotateCcw className="size-3.5" />
                            Khôi phục
                          </Button>
                        )}

                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          title="Xóa vĩnh viễn"
                          className="h-8 w-8 text-muted-foreground hover:text-destructive"
                          onClick={() => setDeleteTarget(log)}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Snapshot Detail Dialog */}
      <Dialog open={!!viewSnapshot} onOpenChange={(open) => !open && setViewSnapshot(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Receipt className="size-5 text-primary" />
              Chi tiết hóa đơn đã xóa: {viewSnapshot?.order_number}
            </DialogTitle>
            <DialogDescription className="text-xs">
              Bản sao lưu tại thời điểm xóa ({viewSnapshot?.deleted_at ? formatDateTime(viewSnapshot.deleted_at) : "—"}).
            </DialogDescription>
          </DialogHeader>

          {viewSnapshot && (
            <div className="space-y-4 overflow-y-auto flex-1 pr-1 text-sm">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-muted/40 p-3 rounded-lg text-xs">
                <div>
                  <span className="text-muted-foreground block">Bàn:</span>
                  <strong className="text-foreground">{viewSnapshot.table_number || "Tại quầy"}</strong>
                </div>
                <div>
                  <span className="text-muted-foreground block">Thanh toán:</span>
                  <strong className="text-foreground">{PAYMENT_METHOD_LABELS[viewSnapshot.payment_method]}</strong>
                </div>
                <div>
                  <span className="text-muted-foreground block">Thời gian bán:</span>
                  <strong className="text-foreground">{formatDateTime(viewSnapshot.order_date)}</strong>
                </div>
                <div>
                  <span className="text-muted-foreground block">Người xóa:</span>
                  <strong className="text-foreground">{viewSnapshot.deleted_by_name || "Nhân viên"}</strong>
                </div>
              </div>

              {viewSnapshot.delete_reason && (
                <div className="bg-amber-500/10 border border-amber-500/20 p-2.5 rounded-lg text-xs text-amber-800 dark:text-amber-300">
                  <strong>Lý do xóa: </strong>
                  {viewSnapshot.delete_reason}
                </div>
              )}

              <div>
                <h4 className="font-semibold text-xs text-muted-foreground uppercase tracking-wider mb-2">
                  Danh sách món ({viewSnapshot.items.length})
                </h4>
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-muted border-b text-muted-foreground">
                      <tr>
                        <th className="p-2 font-medium">Tên món</th>
                        <th className="p-2 text-right font-medium">SL</th>
                        <th className="p-2 text-right font-medium">Đơn giá</th>
                        <th className="p-2 text-right font-medium">Thành tiền</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {viewSnapshot.items.map((it, idx) => (
                        <tr key={idx}>
                          <td className="p-2 font-medium">
                            {it.menu_item_name}
                            {it.menu_item_code && (
                              <span className="ml-1.5 font-mono text-[11px] text-muted-foreground">
                                ({it.menu_item_code})
                              </span>
                            )}
                          </td>
                          <td className="p-2 text-right tabular-nums">{formatNumber(it.quantity)}</td>
                          <td className="p-2 text-right tabular-nums">{formatVND(it.unit_price)}</td>
                          <td className="p-2 text-right font-semibold tabular-nums">{formatVND(it.line_total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="space-y-1 text-right text-xs pt-1 border-t">
                <div className="text-muted-foreground">
                  Tạm tính: <span className="tabular-nums font-medium text-foreground">{formatVND(viewSnapshot.subtotal)}</span>
                </div>
                {viewSnapshot.discount > 0 && (
                  <div className="text-muted-foreground">
                    Giảm giá: <span className="tabular-nums font-medium text-destructive">-{formatVND(viewSnapshot.discount)}</span>
                  </div>
                )}
                {viewSnapshot.tax_amount > 0 && (
                  <div className="text-muted-foreground">
                    Thuế GTGT: <span className="tabular-nums font-medium text-emerald-600">+{formatVND(viewSnapshot.tax_amount)}</span>
                  </div>
                )}
                <div className="text-sm font-bold text-primary pt-1">
                  Tổng thực thu: {formatVND(viewSnapshot.total_with_tax || viewSnapshot.total_amount)}
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" size="sm" onClick={() => setViewSnapshot(null)}>
              Đóng
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Restore Confirm Dialog */}
      <ConfirmDialog
        open={!!restoreTarget}
        onOpenChange={(open) => !open && setRestoreTarget(null)}
        title="Khôi phục hóa đơn bán hàng?"
        description={
          <>
            Hóa đơn <strong className="text-foreground">{restoreTarget?.order_number}</strong> sẽ
            được tạo lại trong danh sách đơn bán hàng chính. Định lượng nguyên liệu sẽ được{" "}
            <strong>trừ lại kho tự động</strong>.
          </>
        }
        confirmLabel={restoring ? "Đang khôi phục..." : "Xác nhận khôi phục"}
        cancelLabel="Hủy bỏ"
        onConfirm={handleRestore}
      />

      {/* Permanent Delete Confirm Dialog */}
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        destructive
        title="Xóa vĩnh viễn hóa đơn khỏi Thùng rác?"
        description={
          <>
            Thao tác này sẽ xóa hoàn toàn bản sao lưu của đơn{" "}
            <strong className="text-destructive">{deleteTarget?.order_number}</strong> khỏi Thùng rác
            và <strong>không thể hoàn tác</strong>.
          </>
        }
        confirmLabel={deleting ? "Đang xóa..." : "Xóa vĩnh viễn"}
        cancelLabel="Đóng"
        onConfirm={handlePermanentDelete}
      />
    </div>
  );
}
