"use client";

import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  PackageSearch,
  Plus,
  Receipt,
  Sparkles,
  Truck,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatNumber, formatVND } from "@/lib/format";
import type {
  DashboardLowStockRow,
  DashboardOverduePoRow,
} from "@/lib/queries/dashboard.queries";
import type { DashboardStats } from "@/types/restaurant";

interface DashboardActionCenterProps {
  stats: DashboardStats | null;
  lowStock: DashboardLowStockRow[];
  overduePos: DashboardOverduePoRow[];
}

export function DashboardActionCenter({
  stats,
  lowStock,
  overduePos,
}: DashboardActionCenterProps) {
  const lowStockCount = lowStock.length;
  const overduePoCount = overduePos.length;
  const overdueDebtAmount = stats?.overdue_debt ?? 0;
  const pendingExpenseCount = stats?.pending_expenses_count ?? 0;
  const pendingExpenseAmount = stats?.pending_expenses_amount ?? 0;

  const urgentIssuesCount =
    (lowStockCount > 0 ? 1 : 0) +
    (overduePoCount > 0 ? 1 : 0) +
    (pendingExpenseCount > 0 ? 1 : 0);

  return (
    <div className="space-y-4">
      {/* Quick Action Bar cho ca làm việc */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 rounded-xl border bg-card/60 p-2.5 shadow-2xs backdrop-blur-xs">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-1 hidden sm:inline-block">
            Thao tác nhanh:
          </span>
          <Button asChild size="sm" className="h-8 shadow-2xs">
            <Link href="/orders/new">
              <Plus className="size-3.5" />
              Tạo đơn bán (POS)
            </Link>
          </Button>

          <Button asChild size="sm" variant="outline" className="h-8">
            <Link href="/purchases/new">
              <Truck className="size-3.5" />
              Nhập hàng & Quét bill
            </Link>
          </Button>

          <Button asChild size="sm" variant="outline" className="h-8">
            <Link href="/inventory/adjustments">
              <PackageSearch className="size-3.5" />
              Kiểm kê kho thực tế
            </Link>
          </Button>
        </div>

        <Button asChild size="sm" variant="secondary" className="h-8">
          <Link href="/ai-assistant">
            <Sparkles className="size-3.5 text-primary" />
            Hỏi trợ lý AI
          </Link>
        </Button>
      </div>

      {/* Action Center - Việc cần xử lý ngay */}
      {urgentIssuesCount > 0 ? (
        <div className="rounded-xl border border-amber-500/25 bg-amber-500/5 p-4 sm:p-5 transition-all">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-amber-500/20 pb-3 mb-3">
            <div className="flex items-center gap-2.5">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-amber-500/20 text-amber-600 dark:text-amber-400">
                <AlertTriangle className="size-4" />
              </span>
              <div>
                <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  Việc cần lưu ý hôm nay
                  <span className="inline-flex items-center rounded-full bg-amber-500/20 px-2 py-0.5 text-xs font-semibold text-amber-700 dark:text-amber-300">
                    {urgentIssuesCount} nhóm cần xử lý
                  </span>
                </h2>
                <p className="text-xs text-muted-foreground">
                  Hệ thống phát hiện các mục cần can thiệp để tránh đứt gãy nguyên liệu hoặc trễ hạn thanh toán.
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {/* 1. Cảnh báo kho */}
            {lowStockCount > 0 ? (
              <div className="rounded-lg border border-red-500/20 bg-card p-3 shadow-2xs flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between gap-1 mb-1">
                    <span className="text-xs font-semibold text-red-600 dark:text-red-400 flex items-center gap-1.5">
                      <PackageSearch className="size-3.5" />
                      Kho thiếu nguyên liệu
                    </span>
                    <span className="text-xs font-bold text-red-600 dark:text-red-400">
                      {lowStockCount} món
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-2 mb-2">
                    {lowStock.slice(0, 3).map((i) => i.name).join(", ")}
                    {lowStockCount > 3 ? ` và ${lowStockCount - 3} món khác` : ""}
                  </p>
                </div>
                <div className="pt-2 border-t border-border/50 flex items-center justify-between gap-2 mt-auto">
                  <Button asChild size="sm" variant="default" className="h-7 text-xs w-full">
                    <Link href="/purchases/new">
                      Tạo phiếu nhập
                      <ArrowRight className="size-3 ml-1" />
                    </Link>
                  </Button>
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-emerald-500/20 bg-card p-3 shadow-2xs flex flex-col justify-between">
                <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 text-xs font-semibold mb-1">
                  <CheckCircle2 className="size-3.5" />
                  Kho nguyên liệu
                </div>
                <p className="text-xs text-muted-foreground">Toàn bộ nguyên liệu đều trên ngưỡng an toàn.</p>
                <div className="pt-2 border-t border-border/50 mt-2">
                  <Link href="/inventory" className="text-xs text-primary hover:underline flex items-center gap-1">
                    Xem sổ kho <ArrowRight className="size-3" />
                  </Link>
                </div>
              </div>
            )}

            {/* 2. Cảnh báo nợ NCC quá hạn */}
            {overduePoCount > 0 ? (
              <div className="rounded-lg border border-amber-500/30 bg-card p-3 shadow-2xs flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between gap-1 mb-1">
                    <span className="text-xs font-semibold text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
                      <Clock className="size-3.5" />
                      Nợ NCC quá hạn
                    </span>
                    <span className="text-xs font-bold text-destructive">
                      {formatVND(overdueDebtAmount)}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-2 mb-2">
                    {overduePoCount} phiếu quá ngày hẹn: {overduePos.slice(0, 2).map((p) => p.po_number).join(", ")}
                  </p>
                </div>
                <div className="pt-2 border-t border-border/50 flex items-center justify-between gap-2 mt-auto">
                  <Button asChild size="sm" variant="destructive" className="h-7 text-xs w-full">
                    <Link href="/payments">
                      <Wallet className="size-3 mr-1" />
                      Chi trả công nợ
                    </Link>
                  </Button>
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-emerald-500/20 bg-card p-3 shadow-2xs flex flex-col justify-between">
                <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 text-xs font-semibold mb-1">
                  <CheckCircle2 className="size-3.5" />
                  Công nợ nhà cung cấp
                </div>
                <p className="text-xs text-muted-foreground">Không có phiếu nhập nào quá hạn thanh toán.</p>
                <div className="pt-2 border-t border-border/50 mt-2">
                  <Link href="/payments" className="text-xs text-primary hover:underline flex items-center gap-1">
                    Quản lý công nợ <ArrowRight className="size-3" />
                  </Link>
                </div>
              </div>
            )}

            {/* 3. Cảnh báo chi phí chờ duyệt */}
            {pendingExpenseCount > 0 ? (
              <div className="rounded-lg border border-border bg-card p-3 shadow-2xs flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between gap-1 mb-1">
                    <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                      <Receipt className="size-3.5 text-muted-foreground" />
                      Chi phí chờ thanh toán
                    </span>
                    <span className="text-xs font-bold text-foreground">
                      {formatNumber(pendingExpenseCount, 0)} khoản
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-2 mb-2">
                    Tổng giá trị {formatVND(pendingExpenseAmount)} đang chờ thủ quỹ duyệt chi.
                  </p>
                </div>
                <div className="pt-2 border-t border-border/50 flex items-center justify-between gap-2 mt-auto">
                  <Button asChild size="sm" variant="outline" className="h-7 text-xs w-full">
                    <Link href="/expenses">
                      Duyệt chi phí
                      <ArrowRight className="size-3 ml-1" />
                    </Link>
                  </Button>
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-emerald-500/20 bg-card p-3 shadow-2xs flex flex-col justify-between">
                <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 text-xs font-semibold mb-1">
                  <CheckCircle2 className="size-3.5" />
                  Chi phí vận hành
                </div>
                <p className="text-xs text-muted-foreground">Không có khoản chi phí nào tồn đọng chờ duyệt.</p>
                <div className="pt-2 border-t border-border/50 mt-2">
                  <Link href="/expenses" className="text-xs text-primary hover:underline flex items-center gap-1">
                    Xem hóa đơn chi <ArrowRight className="size-3" />
                  </Link>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-4 rounded-xl border border-emerald-500/25 bg-emerald-500/5 px-4 py-3 text-emerald-800 dark:text-emerald-300">
          <div className="flex items-center gap-3">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="size-4" />
            </span>
            <div>
              <p className="text-sm font-semibold">Trạng thái vận hành ổn định</p>
              <p className="text-xs text-muted-foreground">
                Toàn bộ nguyên liệu đều trên mức an toàn, không có công nợ quá hạn và chi phí tồn đọng.
              </p>
            </div>
          </div>
          <Button asChild size="sm" variant="ghost" className="hidden sm:inline-flex text-xs">
            <Link href="/reports/daily">
              Xem báo cáo ngày
              <ArrowRight className="size-3.5 ml-1" />
            </Link>
          </Button>
        </div>
      )}
    </div>
  );
}
