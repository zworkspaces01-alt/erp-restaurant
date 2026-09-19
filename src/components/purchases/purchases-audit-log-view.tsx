"use client";

import { useEffect, useState } from "react";
import {
  Clock,
  History,
  Pencil,
  PlusCircle,
  Trash2,
  RotateCcw,
  Search,
  User,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getPurchaseOrderAuditLogsAction } from "@/server-actions/purchases.actions";
import type { PurchaseOrderAuditLog, PoAuditAction } from "@/lib/purchases/po-audit-service";
import { formatVND } from "@/lib/format";

export function PurchasesAuditLogView() {
  const [logs, setLogs] = useState<PurchaseOrderAuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState<string>("all");

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const res = await getPurchaseOrderAuditLogsAction();
      setLogs(res);
    } catch (err) {
      console.error("Could not fetch audit logs:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  const getActionBadge = (action: PoAuditAction) => {
    switch (action) {
      case "created":
        return (
          <Badge variant="outline" className="border-emerald-500/30 text-emerald-600 bg-emerald-500/10 gap-1 text-[11px]">
            <PlusCircle className="size-3" /> Tạo mới
          </Badge>
        );
      case "updated":
        return (
          <Badge variant="outline" className="border-blue-500/30 text-blue-600 bg-blue-500/10 gap-1 text-[11px]">
            <Pencil className="size-3" /> Sửa thông tin
          </Badge>
        );
      case "line_added":
        return (
          <Badge variant="outline" className="border-teal-500/30 text-teal-600 bg-teal-500/10 gap-1 text-[11px]">
            <PlusCircle className="size-3" /> Thêm món
          </Badge>
        );
      case "line_deleted":
        return (
          <Badge variant="outline" className="border-amber-500/30 text-amber-600 bg-amber-500/10 gap-1 text-[11px]">
            <Trash2 className="size-3" /> Xóa món
          </Badge>
        );
      case "deleted":
        return (
          <Badge variant="outline" className="border-destructive/30 text-destructive bg-destructive/10 gap-1 text-[11px]">
            <Trash2 className="size-3" /> Xóa phiếu
          </Badge>
        );
      case "restored":
        return (
          <Badge variant="outline" className="border-violet-500/30 text-violet-600 bg-violet-500/10 gap-1 text-[11px]">
            <RotateCcw className="size-3" /> Khôi phục
          </Badge>
        );
      default:
        return <Badge variant="secondary">{action}</Badge>;
    }
  };

  const filteredLogs = logs.filter((log) => {
    if (actionFilter !== "all" && log.action !== actionFilter) {
      return false;
    }
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      log.po_number.toLowerCase().includes(q) ||
      (log.supplier_name && log.supplier_name.toLowerCase().includes(q)) ||
      (log.performed_by_name && log.performed_by_name.toLowerCase().includes(q)) ||
      (log.details.summary && log.details.summary.toLowerCase().includes(q)) ||
      (log.details.reason && log.details.reason.toLowerCase().includes(q))
    );
  });

  return (
    <div className="space-y-4">
      {/* Filters Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-muted/40 p-3 rounded-xl border">
        <div className="flex flex-wrap items-center gap-2.5 flex-1 min-w-[240px]">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              placeholder="Tìm theo mã phiếu, NCC, nhân viên..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 bg-background h-9 text-xs"
            />
          </div>

          <div className="w-[180px]">
            <Select value={actionFilter} onValueChange={setActionFilter}>
              <SelectTrigger className="h-9 text-xs bg-background">
                <SelectValue placeholder="Loại thao tác" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả thao tác</SelectItem>
                <SelectItem value="created">Tạo phiếu</SelectItem>
                <SelectItem value="updated">Sửa thông tin</SelectItem>
                <SelectItem value="line_added">Thêm món</SelectItem>
                <SelectItem value="line_deleted">Xóa món</SelectItem>
                <SelectItem value="deleted">Xóa phiếu</SelectItem>
                <SelectItem value="restored">Khôi phục</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs bg-background">
            Tìm thấy: <strong className="ml-1 text-foreground">{filteredLogs.length}</strong> nhật ký
          </Badge>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={fetchLogs}
            disabled={loading}
            className="h-8 text-xs gap-1 text-muted-foreground"
          >
            <RotateCcw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
            Làm mới
          </Button>
        </div>
      </div>

      {/* Table view */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
          <Clock className="size-6 animate-spin text-primary" />
          <p className="text-sm">Đang tải nhật ký kiểm toán...</p>
        </div>
      ) : filteredLogs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center border rounded-xl border-dashed bg-muted/20">
          <History className="size-10 stroke-1 mb-2 text-muted-foreground/60" />
          <p className="font-semibold text-foreground">Không có nhật ký nào</p>
          <p className="text-xs text-muted-foreground mt-1 max-w-sm">
            Chưa có thao tác nào phù hợp với bộ lọc hiện tại.
          </p>
        </div>
      ) : (
        <div className="border rounded-xl overflow-hidden bg-card shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-muted/70 text-muted-foreground border-b font-medium">
                <tr>
                  <th className="py-2.5 px-3.5 w-36">Thời gian</th>
                  <th className="py-2.5 px-3 w-28">Thao tác</th>
                  <th className="py-2.5 px-3 w-32">Mã phiếu</th>
                  <th className="py-2.5 px-3">Nhà cung cấp</th>
                  <th className="py-2.5 px-3 w-36">Người thực hiện</th>
                  <th className="py-2.5 px-3">Nội dung chi tiết</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filteredLogs.map((log) => {
                  const dateObj = new Date(log.created_at);
                  const timeStr = dateObj.toLocaleTimeString("vi-VN", {
                    hour: "2-digit",
                    minute: "2-digit",
                  });
                  const dateStr = dateObj.toLocaleDateString("vi-VN", {
                    day: "2-digit",
                    month: "2-digit",
                    year: "numeric",
                  });

                  return (
                    <tr key={log.id} className="hover:bg-muted/25 transition-colors">
                      <td className="py-2.5 px-3.5 font-mono text-muted-foreground">
                        <div>{timeStr}</div>
                        <div className="text-[10px] text-muted-foreground/70">{dateStr}</div>
                      </td>
                      <td className="py-2.5 px-3">{getActionBadge(log.action)}</td>
                      <td className="py-2.5 px-3 font-mono font-medium text-foreground">
                        {log.po_number}
                      </td>
                      <td className="py-2.5 px-3 text-muted-foreground font-medium">
                        {log.supplier_name || "—"}
                      </td>
                      <td className="py-2.5 px-3 text-foreground">
                        <span className="inline-flex items-center gap-1">
                          <User className="size-3 text-muted-foreground" />
                          {log.performed_by_name || "Nhân viên"}
                        </span>
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="space-y-1">
                          <div className="font-medium text-foreground">{log.details.summary}</div>
                          {log.details.reason && (
                            <div className="text-[11px] text-amber-600 dark:text-amber-400">
                              Lý do: {log.details.reason}
                            </div>
                          )}
                          {log.details.changes && (
                            <div className="flex flex-wrap gap-1.5 mt-1">
                              {Object.entries(log.details.changes).map(([f, diff]) => (
                                <Badge
                                  key={f}
                                  variant="secondary"
                                  className="text-[10px] font-normal"
                                >
                                  {f}: {String(diff.from || "—")} → {String(diff.to || "—")}
                                </Badge>
                              ))}
                            </div>
                          )}
                          {log.details.item && (
                            <div className="text-[11px] text-muted-foreground">
                              {log.details.item.name} · SL: {log.details.item.quantity}{" "}
                              {log.details.item.unit} · {formatVND(log.details.item.line_total)}
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
