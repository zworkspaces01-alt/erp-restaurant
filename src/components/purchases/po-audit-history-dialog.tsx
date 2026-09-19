"use client";

import { useEffect, useState } from "react";
import {
  Clock,
  History,
  Pencil,
  PlusCircle,
  Trash2,
  RotateCcw,
  User,
  AlertCircle,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { getPurchaseOrderAuditLogsAction } from "@/server-actions/purchases.actions";
import type { PurchaseOrderAuditLog } from "@/lib/purchases/po-audit-service";
import { formatVND } from "@/lib/format";

interface PoAuditHistoryDialogProps {
  purchaseOrderId: string;
  poNumber?: string | null;
  trigger?: React.ReactNode;
}

export function PoAuditHistoryDialog({
  purchaseOrderId,
  poNumber,
  trigger,
}: PoAuditHistoryDialogProps) {
  const [open, setOpen] = useState(false);
  const [logs, setLogs] = useState<PurchaseOrderAuditLog[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      setLoading(true);
      getPurchaseOrderAuditLogsAction(purchaseOrderId, poNumber || undefined)
        .then((res) => setLogs(res))
        .catch((err) => console.error("Could not load PO audit logs:", err))
        .finally(() => setLoading(false));
    }
  }, [open, purchaseOrderId, poNumber]);

  const getActionBadge = (action: PurchaseOrderAuditLog["action"]) => {
    switch (action) {
      case "created":
        return (
          <Badge variant="outline" className="border-emerald-500/30 text-emerald-600 bg-emerald-500/10 gap-1">
            <PlusCircle className="size-3" /> Tạo phiếu
          </Badge>
        );
      case "updated":
        return (
          <Badge variant="outline" className="border-blue-500/30 text-blue-600 bg-blue-500/10 gap-1">
            <Pencil className="size-3" /> Sửa thông tin
          </Badge>
        );
      case "line_added":
        return (
          <Badge variant="outline" className="border-teal-500/30 text-teal-600 bg-teal-500/10 gap-1">
            <PlusCircle className="size-3" /> Thêm mặt hàng
          </Badge>
        );
      case "line_deleted":
        return (
          <Badge variant="outline" className="border-amber-500/30 text-amber-600 bg-amber-500/10 gap-1">
            <Trash2 className="size-3" /> Xóa mặt hàng
          </Badge>
        );
      case "line_updated":
        return (
          <Badge variant="outline" className="border-indigo-500/30 text-indigo-600 bg-indigo-500/10 gap-1">
            <Pencil className="size-3" /> Sửa mặt hàng
          </Badge>
        );
      case "deleted":
        return (
          <Badge variant="outline" className="border-destructive/30 text-destructive bg-destructive/10 gap-1">
            <Trash2 className="size-3" /> Xóa phiếu
          </Badge>
        );
      case "restored":
        return (
          <Badge variant="outline" className="border-violet-500/30 text-violet-600 bg-violet-500/10 gap-1">
            <RotateCcw className="size-3" /> Khôi phục
          </Badge>
        );
      default:
        return <Badge variant="secondary">{action}</Badge>;
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" size="sm" className="gap-1.5">
            <History className="size-4" />
            Lịch sử thay đổi
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[620px] max-h-[85vh] flex flex-col p-6">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="size-5 text-primary" />
            Lịch sử sửa xóa phiếu {poNumber || ""}
          </DialogTitle>
          <DialogDescription>
            Theo dõi chi tiết các lần tạo mới, chỉnh sửa thông tin, thêm/xóa dòng hàng và khôi phục phiếu.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-hidden pt-2">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 text-sm text-muted-foreground gap-2">
              <Clock className="size-6 animate-spin text-primary" />
              Đang tải nhật ký lịch sử...
            </div>
          ) : logs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
              <Clock className="size-10 stroke-1 mb-2 text-muted-foreground/60" />
              <p className="font-medium">Chưa có bản ghi lịch sử nào</p>
              <p className="text-xs text-muted-foreground/80 mt-1 max-w-xs">
                Mọi hành động sửa thông tin, thêm dòng hoặc xóa dòng sẽ được tự động lưu vết tại đây.
              </p>
            </div>
          ) : (
            <ScrollArea className="h-[480px] pr-4">
              <div className="relative pl-6 space-y-6 before:absolute before:left-2 before:top-3 before:bottom-3 before:w-0.5 before:bg-muted-foreground/20">
                {logs.map((log) => {
                  const dateObj = new Date(log.created_at);
                  const formattedTime = dateObj.toLocaleTimeString("vi-VN", {
                    hour: "2-digit",
                    minute: "2-digit",
                  });
                  const formattedDate = dateObj.toLocaleDateString("vi-VN", {
                    day: "2-digit",
                    month: "2-digit",
                    year: "numeric",
                  });

                  return (
                    <div key={log.id} className="relative group">
                      {/* Timeline Dot */}
                      <div className="absolute -left-6 top-1 size-4 rounded-full bg-background border-2 border-primary group-hover:scale-125 transition-transform" />

                      <div className="rounded-xl border bg-card p-4 space-y-2.5 shadow-xs">
                        {/* Header: Action + Time */}
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            {getActionBadge(log.action)}
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <User className="size-3" />
                              {log.performed_by_name || "Nhân viên"}
                            </span>
                          </div>
                          <span className="text-xs text-muted-foreground font-mono">
                            {formattedTime} · {formattedDate}
                          </span>
                        </div>

                        {/* Summary */}
                        {log.details.summary && (
                          <p className="text-sm font-medium text-foreground">{log.details.summary}</p>
                        )}

                        {/* Lý do xóa nếu có */}
                        {log.details.reason && (
                          <div className="text-xs bg-muted/60 rounded-md p-2 flex items-start gap-1.5 text-muted-foreground">
                            <AlertCircle className="size-3.5 mt-0.5 text-amber-500 shrink-0" />
                            <span>
                              <strong>Lý do:</strong> {log.details.reason}
                            </span>
                          </div>
                        )}

                        {/* Chi tiết thay đổi các trường (Diff) */}
                        {log.details.changes && Object.keys(log.details.changes).length > 0 && (
                          <div className="mt-2 space-y-1 text-xs border rounded-lg p-2.5 bg-muted/20">
                            <div className="font-semibold text-muted-foreground mb-1.5">
                              Chi tiết các trường thay đổi:
                            </div>
                            {Object.entries(log.details.changes).map(([field, diff]) => (
                              <div key={field} className="grid grid-cols-3 gap-2 py-0.5 border-b border-dashed last:border-0">
                                <span className="font-medium text-foreground">{field}:</span>
                                <span className="text-muted-foreground line-through truncate">
                                  {diff.from ? String(diff.from) : "(trống)"}
                                </span>
                                <span className="text-primary font-medium truncate">
                                  {diff.to ? String(diff.to) : "(xóa)"}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Chi tiết mặt hàng (nếu là line_added hoặc line_deleted) */}
                        {log.details.item && (
                          <div className="mt-1.5 text-xs rounded-lg border border-dashed p-2.5 bg-muted/30 flex items-center justify-between">
                            <div>
                              <span className="font-medium">{log.details.item.name}</span>
                              <span className="text-muted-foreground ml-2">
                                Số lượng: {log.details.item.quantity} {log.details.item.unit}
                              </span>
                            </div>
                            <div className="font-mono text-right">
                              <div>{formatVND(log.details.item.line_total)}</div>
                              <div className="text-[10px] text-muted-foreground">
                                {formatVND(log.details.item.unit_price)} / {log.details.item.unit}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
