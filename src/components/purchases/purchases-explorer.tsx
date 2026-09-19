"use client";

import { useMemo, useState, useCallback } from "react";
import Link from "next/link";
import { useSearchParams, usePathname } from "next/navigation";
import {
  AlertTriangle,
  Banknote,
  Building2,
  Calendar,
  CheckCircle2,
  ExternalLink,
  FileText,
  Filter,
  History,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  Wallet,
  X,
} from "lucide-react";
import { PurchasesTrashView } from "./purchases-trash-view";
import { PurchasesAuditLogView } from "./purchases-audit-log-view";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { StatCard } from "@/components/shared";
import { PurchaseOrdersTable } from "@/components/purchases/purchase-orders-table";
import { formatDate, formatVND, todayISO } from "@/lib/format";
import { normalizeVietnamese } from "@/lib/ai/invoice-matcher";
import { paymentTermLabel } from "@/types/restaurant";
import type { PurchaseOrderRow, SupplierPickRow } from "@/lib/queries/purchases.queries";

interface PurchasesExplorerProps {
  orders: PurchaseOrderRow[];
  suppliers: SupplierPickRow[];
  initialFilters?: {
    supplierId?: string;
    status?: string;
    from?: string;
    to?: string;
    q?: string;
  };
}

type DatePreset = "all" | "today" | "yesterday" | "7days" | "thisMonth" | "lastMonth" | "custom";

function shiftDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + days);
  const ry = date.getFullYear();
  const rm = String(date.getMonth() + 1).padStart(2, "0");
  const rd = String(date.getDate()).padStart(2, "0");
  return `${ry}-${rm}-${rd}`;
}

export function PurchasesExplorer({
  orders,
  suppliers,
  initialFilters,
}: PurchasesExplorerProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const today = todayISO();
  const yesterday = shiftDays(today, -1);
  const sevenDaysAgo = shiftDays(today, -6);
  const currentMonthStart = `${today.slice(0, 7)}-01`;

  const [currentYear, currentMonth] = today.split("-").map(Number);
  const lastMonthYear = currentMonth === 1 ? currentYear - 1 : currentYear;
  const lastMonthNum = currentMonth === 1 ? 12 : currentMonth - 1;
  const lastMonthStr = String(lastMonthNum).padStart(2, "0");
  const lastMonthStart = `${lastMonthYear}-${lastMonthStr}-01`;
  const lastMonthEndDay = new Date(lastMonthYear, lastMonthNum, 0).getDate();
  const lastMonthEnd = `${lastMonthYear}-${lastMonthStr}-${String(lastMonthEndDay).padStart(2, "0")}`;

  // Active tab state (orders, trash, audit)
  const [activeTab, setActiveTab] = useState<"orders" | "trash" | "audit">(() => {
    const tab = searchParams.get("tab");
    if (tab === "trash" || tab === "audit") return tab;
    return "orders";
  });

  // Initial states from props or URL
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>(() => {
    return initialFilters?.supplierId || searchParams.get("supplier") || searchParams.get("supplierId") || "all";
  });

  const [selectedStatus, setSelectedStatus] = useState<string>(() => {
    return initialFilters?.status || searchParams.get("status") || "all";
  });

  const [searchQuery, setSearchQuery] = useState<string>(() => {
    return initialFilters?.q || searchParams.get("q") || "";
  });

  const [fromDate, setFromDate] = useState<string>(() => {
    return initialFilters?.from || searchParams.get("from") || "";
  });

  const [toDate, setToDate] = useState<string>(() => {
    return initialFilters?.to || searchParams.get("to") || "";
  });

  const [showCustomDate, setShowCustomDate] = useState<boolean>(() => {
    const f = initialFilters?.from || searchParams.get("from") || "";
    const t = initialFilters?.to || searchParams.get("to") || "";
    if (!f && !t) return false;
    if (f === today && t === today) return false;
    if (f === yesterday && t === yesterday) return false;
    if (f === sevenDaysAgo && t === today) return false;
    if (f === currentMonthStart && (t === today || !t)) return false;
    if (f === lastMonthStart && t === lastMonthEnd) return false;
    return true;
  });

  // Identify current active date preset
  const datePreset: DatePreset = useMemo(() => {
    if (!fromDate && !toDate) return "all";
    if (fromDate === today && toDate === today) return "today";
    if (fromDate === yesterday && toDate === yesterday) return "yesterday";
    if (fromDate === sevenDaysAgo && toDate === today) return "7days";
    if (fromDate === currentMonthStart && (toDate === today || !toDate)) return "thisMonth";
    if (fromDate === lastMonthStart && toDate === lastMonthEnd) return "lastMonth";
    return "custom";
  }, [fromDate, toDate, today, yesterday, sevenDaysAgo, currentMonthStart, lastMonthStart, lastMonthEnd]);

  // Synchronize state with URL query parameters
  const updateUrl = useCallback(
    (nextSupplier: string, nextStatus: string, nextFrom: string, nextTo: string, nextQ: string) => {
      const params = new URLSearchParams();
      if (nextSupplier && nextSupplier !== "all") params.set("supplier", nextSupplier);
      if (nextStatus && nextStatus !== "all") params.set("status", nextStatus);
      if (nextFrom) params.set("from", nextFrom);
      if (nextTo) params.set("to", nextTo);
      if (nextQ.trim()) params.set("q", nextQ.trim());

      const qs = params.toString();
      const nextUrl = qs ? `${pathname}?${qs}` : pathname;
      if (typeof window !== "undefined") {
        window.history.replaceState(null, "", nextUrl);
      }
    },
    [pathname]
  );

  const applyDatePreset = (preset: DatePreset) => {
    let nextFrom = "";
    let nextTo = "";
    if (preset === "today") {
      nextFrom = today;
      nextTo = today;
      setShowCustomDate(false);
    } else if (preset === "yesterday") {
      nextFrom = yesterday;
      nextTo = yesterday;
      setShowCustomDate(false);
    } else if (preset === "7days") {
      nextFrom = sevenDaysAgo;
      nextTo = today;
      setShowCustomDate(false);
    } else if (preset === "thisMonth") {
      nextFrom = currentMonthStart;
      nextTo = today;
      setShowCustomDate(false);
    } else if (preset === "lastMonth") {
      nextFrom = lastMonthStart;
      nextTo = lastMonthEnd;
      setShowCustomDate(false);
    } else if (preset === "custom") {
      setShowCustomDate(true);
      return;
    } else {
      // "all"
      nextFrom = "";
      nextTo = "";
      setShowCustomDate(false);
    }

    setFromDate(nextFrom);
    setToDate(nextTo);
    updateUrl(selectedSupplierId, selectedStatus, nextFrom, nextTo, searchQuery);
  };

  const resetAllFilters = () => {
    setSelectedSupplierId("all");
    setSelectedStatus("all");
    setSearchQuery("");
    setFromDate("");
    setToDate("");
    setShowCustomDate(false);
    updateUrl("all", "all", "", "", "");
  };

  const handleSupplierChange = (val: string) => {
    setSelectedSupplierId(val);
    updateUrl(val, selectedStatus, fromDate, toDate, searchQuery);
  };

  const handleStatusChange = (val: string) => {
    setSelectedStatus(val);
    updateUrl(selectedSupplierId, val, fromDate, toDate, searchQuery);
  };

  const handleSearchChange = (val: string) => {
    setSearchQuery(val);
    updateUrl(selectedSupplierId, selectedStatus, fromDate, toDate, val);
  };

  const handleCustomDateApply = (f: string, t: string) => {
    setFromDate(f);
    setToDate(t);
    updateUrl(selectedSupplierId, selectedStatus, f, t, searchQuery);
  };

  // Find currently selected supplier details
  const activeSupplier = useMemo(() => {
    if (!selectedSupplierId || selectedSupplierId === "all") return null;
    return suppliers.find((s) => s.id === selectedSupplierId) || null;
  }, [selectedSupplierId, suppliers]);

  // Combined Multi-Filter logic
  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      // 1. Supplier Filter
      if (selectedSupplierId && selectedSupplierId !== "all") {
        if (order.supplier_id !== selectedSupplierId) return false;
      }

      // 2. Status Filter
      if (selectedStatus && selectedStatus !== "all") {
        if (selectedStatus === "overdue") {
          if (!order.is_overdue) return false;
        } else if (order.payment_status !== selectedStatus) {
          return false;
        }
      }

      // 3. Date Filter (from - to)
      if (fromDate && order.order_date < fromDate) {
        return false;
      }
      if (toDate && order.order_date > toDate) {
        return false;
      }

      // 4. Search Query (po_number, invoice_number, supplier_name, note, item_names)
      if (searchQuery.trim()) {
        const q = normalizeVietnamese(searchQuery);
        const po = normalizeVietnamese(order.po_number || "");
        const inv = normalizeVietnamese(order.invoice_number || "");
        const sup = normalizeVietnamese(order.supplier_name || "");
        const note = normalizeVietnamese(order.note || "");
        const items = (order.item_names || []).map((name) => normalizeVietnamese(name)).join(" ");

        if (
          !po.includes(q) &&
          !inv.includes(q) &&
          !sup.includes(q) &&
          !note.includes(q) &&
          !items.includes(q)
        ) {
          return false;
        }
      }

      return true;
    });
  }, [orders, selectedSupplierId, selectedStatus, fromDate, toDate, searchQuery]);

  // Dynamic KPI calculations based on filtered orders
  const metrics = useMemo(() => {
    const count = filteredOrders.length;
    let totalAmount = 0;
    let paidAmount = 0;
    let debtAmount = 0;
    let unpaidCount = 0;
    let partialCount = 0;
    let paidCount = 0;
    let overdueCount = 0;
    let overdueDebt = 0;

    for (const o of filteredOrders) {
      totalAmount += o.total_amount;
      paidAmount += o.paid_amount;
      debtAmount += o.debt_amount;
      if (o.payment_status === "unpaid") unpaidCount++;
      else if (o.payment_status === "partial") partialCount++;
      else if (o.payment_status === "paid") paidCount++;

      if (o.is_overdue) {
        overdueCount++;
        overdueDebt += o.debt_amount;
      }
    }

    const paidPercentage = totalAmount > 0 ? (paidAmount / totalAmount) * 100 : 0;
    const avgInvoiceValue = count > 0 ? Math.round(totalAmount / count) : 0;

    return {
      count,
      totalAmount,
      paidAmount,
      debtAmount,
      unpaidCount,
      partialCount,
      paidCount,
      overdueCount,
      overdueDebt,
      paidPercentage,
      avgInvoiceValue,
    };
  }, [filteredOrders]);

  // Active filters count
  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (selectedSupplierId !== "all") count++;
    if (selectedStatus !== "all") count++;
    if (fromDate || toDate) count++;
    if (searchQuery.trim()) count++;
    return count;
  }, [selectedSupplierId, selectedStatus, fromDate, toDate, searchQuery]);

  // Human-readable period label
  const periodHint = useMemo(() => {
    if (fromDate && toDate) {
      return fromDate === toDate
        ? `Ngày ${formatDate(fromDate)}`
        : `${formatDate(fromDate)} – ${formatDate(toDate)}`;
    }
    if (fromDate) return `Từ ${formatDate(fromDate)}`;
    if (toDate) return `Đến ${formatDate(toDate)}`;
    return "Toàn bộ thời gian";
  }, [fromDate, toDate]);

  return (
    <div className="space-y-5">
      {/* Top Tabs Navigation */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-3">
        <div className="flex items-center gap-1.5 p-1 bg-muted/60 rounded-xl border">
          <Button
            type="button"
            variant={activeTab === "orders" ? "default" : "ghost"}
            size="sm"
            onClick={() => setActiveTab("orders")}
            className="h-8 text-xs gap-1.5 rounded-lg font-medium shadow-none"
          >
            <FileText className="size-3.5" />
            Phiếu nhập ({orders.length})
          </Button>
          <Button
            type="button"
            variant={activeTab === "trash" ? "default" : "ghost"}
            size="sm"
            onClick={() => setActiveTab("trash")}
            className="h-8 text-xs gap-1.5 rounded-lg font-medium shadow-none hover:text-destructive"
          >
            <Trash2 className="size-3.5 text-destructive" />
            Thùng rác & Khôi phục
          </Button>
          <Button
            type="button"
            variant={activeTab === "audit" ? "default" : "ghost"}
            size="sm"
            onClick={() => setActiveTab("audit")}
            className="h-8 text-xs gap-1.5 rounded-lg font-medium shadow-none"
          >
            <History className="size-3.5 text-primary" />
            Nhật ký sửa xóa
          </Button>
        </div>
      </div>

      {activeTab === "trash" ? (
        <PurchasesTrashView />
      ) : activeTab === "audit" ? (
        <PurchasesAuditLogView />
      ) : (
        <>
          {/* 1. Multi-Filter Control Center */}
          <Card className="border-border/80 shadow-xs">
            <CardContent className="p-4 space-y-3.5">
          {/* Main Controls: Search, Supplier, Status */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-2.5 items-center">
            {/* Search Input */}
            <div className="relative lg:col-span-4">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(e) => handleSearchChange(e.target.value)}
                placeholder="Tìm số phiếu, số HĐ, tên sản phẩm nhập, NCC..."
                className="pl-9 pr-8 h-9 text-xs sm:text-sm"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => handleSearchChange("")}
                  className="absolute top-1/2 right-2.5 -translate-y-1/2 text-muted-foreground hover:text-foreground p-0.5"
                >
                  <X className="size-3.5" />
                </button>
              )}
            </div>

            {/* Supplier Selector */}
            <div className="lg:col-span-4">
              <Select value={selectedSupplierId} onValueChange={handleSupplierChange}>
                <SelectTrigger className="h-9 text-xs sm:text-sm w-full">
                  <div className="flex items-center gap-1.5 truncate">
                    <Building2 className="size-3.5 text-primary shrink-0" />
                    <span className="truncate">
                      {activeSupplier ? activeSupplier.name : "Tất cả nhà cung cấp"}
                    </span>
                  </div>
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  <SelectItem value="all">
                    <span className="font-medium">Tất cả nhà cung cấp</span> ({suppliers.length})
                  </SelectItem>
                  {suppliers.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      <div className="flex items-center justify-between gap-3 w-full">
                        <span className="truncate">{s.name}</span>
                        {s.code && (
                          <span className="text-[11px] font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                            {s.code}
                          </span>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Payment Status Selector */}
            <div className="lg:col-span-3">
              <Select value={selectedStatus} onValueChange={handleStatusChange}>
                <SelectTrigger className="h-9 text-xs sm:text-sm w-full">
                  <SelectValue placeholder="Trạng thái thanh toán" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tất cả trạng thái</SelectItem>
                  <SelectItem value="unpaid">Chưa thanh toán</SelectItem>
                  <SelectItem value="partial">Thanh toán một phần</SelectItem>
                  <SelectItem value="paid">Đã thanh toán đủ</SelectItem>
                  <SelectItem value="overdue">
                    <span className="text-destructive font-medium">Quá hạn thanh toán</span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Reset Filters Button */}
            <div className="lg:col-span-1 flex justify-end">
              {activeFiltersCount > 0 ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={resetAllFilters}
                  className="h-9 px-2.5 text-xs text-muted-foreground hover:text-foreground w-full flex items-center justify-center gap-1 border-dashed"
                  title="Xóa tất cả bộ lọc"
                >
                  <RotateCcw className="size-3.5" />
                  <span className="hidden sm:inline lg:hidden xl:inline">Đặt lại</span>
                  <Badge variant="secondary" className="size-4 p-0 text-[10px] flex items-center justify-center rounded-full">
                    {activeFiltersCount}
                  </Badge>
                </Button>
              ) : (
                <div className="text-[11px] text-muted-foreground text-center w-full hidden lg:block">
                  {orders.length} phiếu
                </div>
              )}
            </div>
          </div>

          {/* Quick Date Range Pills & Custom Date Toggle */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t text-xs">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-muted-foreground font-medium flex items-center gap-1 mr-1">
                <Calendar className="size-3.5 text-primary" />
                Kỳ nhập:
              </span>
              <Button
                type="button"
                size="sm"
                variant={datePreset === "all" ? "default" : "outline"}
                onClick={() => applyDatePreset("all")}
                className="h-7 text-xs px-2.5"
              >
                Tất cả
              </Button>
              <Button
                type="button"
                size="sm"
                variant={datePreset === "today" ? "default" : "outline"}
                onClick={() => applyDatePreset("today")}
                className="h-7 text-xs px-2.5"
              >
                Hôm nay
              </Button>
              <Button
                type="button"
                size="sm"
                variant={datePreset === "yesterday" ? "default" : "outline"}
                onClick={() => applyDatePreset("yesterday")}
                className="h-7 text-xs px-2.5"
              >
                Hôm qua
              </Button>
              <Button
                type="button"
                size="sm"
                variant={datePreset === "7days" ? "default" : "outline"}
                onClick={() => applyDatePreset("7days")}
                className="h-7 text-xs px-2.5"
              >
                7 ngày qua
              </Button>
              <Button
                type="button"
                size="sm"
                variant={datePreset === "thisMonth" ? "default" : "outline"}
                onClick={() => applyDatePreset("thisMonth")}
                className="h-7 text-xs px-2.5"
              >
                Tháng này
              </Button>
              <Button
                type="button"
                size="sm"
                variant={datePreset === "lastMonth" ? "default" : "outline"}
                onClick={() => applyDatePreset("lastMonth")}
                className="h-7 text-xs px-2.5"
              >
                Tháng trước
              </Button>
              <Button
                type="button"
                size="sm"
                variant={datePreset === "custom" || showCustomDate ? "secondary" : "ghost"}
                onClick={() => setShowCustomDate(!showCustomDate)}
                className="h-7 text-xs px-2.5 gap-1"
              >
                <Filter className="size-3" />
                Tùy chọn ngày...
              </Button>
            </div>

            {/* Hint of active result count */}
            <div className="text-muted-foreground font-medium">
              Tìm thấy: <span className="font-semibold text-foreground">{metrics.count}</span> phiếu
            </div>
          </div>

          {/* Custom Date Pickers Collapsible */}
          {showCustomDate && (
            <div className="flex flex-wrap items-end gap-2.5 pt-2 border-t border-dashed bg-muted/30 p-2.5 rounded-lg">
              <div className="space-y-1">
                <span className="text-[11px] font-medium text-muted-foreground">Từ ngày</span>
                <Input
                  type="date"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                  className="h-8 w-36 text-xs bg-background"
                />
              </div>
              <div className="space-y-1">
                <span className="text-[11px] font-medium text-muted-foreground">Đến ngày</span>
                <Input
                  type="date"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                  className="h-8 w-36 text-xs bg-background"
                />
              </div>
              <Button
                type="button"
                size="sm"
                onClick={() => handleCustomDateApply(fromDate, toDate)}
                className="h-8 text-xs px-3 gap-1"
              >
                <Filter className="size-3" />
                Áp dụng ngày
              </Button>
              {(fromDate || toDate) && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setFromDate("");
                    setToDate("");
                    setShowCustomDate(false);
                    handleCustomDateApply("", "");
                  }}
                  className="h-8 text-xs text-muted-foreground hover:text-foreground"
                >
                  <X className="size-3 mr-1" />
                  Xóa ngày
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 2. Active Supplier Banner (Highlighted when filtering by supplier) */}
      {activeSupplier && (
        <div className="rounded-xl border border-primary/25 bg-primary/5 dark:bg-primary/10 p-3.5 flex flex-wrap items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center gap-3 min-w-0">
            <div className="size-10 rounded-lg bg-primary/15 flex items-center justify-center shrink-0 text-primary">
              <Building2 className="size-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-semibold text-base tracking-tight truncate text-foreground">
                  {activeSupplier.name}
                </h3>
                {activeSupplier.code && (
                  <Badge variant="outline" className="font-mono text-[11px] bg-background">
                    Mã: {activeSupplier.code}
                  </Badge>
                )}
                <Badge variant="secondary" className="text-[11px]">
                  {paymentTermLabel(activeSupplier.payment_terms_days)}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Đang tổng hợp số liệu nhập hàng theo NCC này ({periodHint}
                {selectedStatus !== "all" ? ` · Trạng thái: ${selectedStatus}` : ""})
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button asChild size="sm" variant="outline" className="h-8 text-xs gap-1.5 bg-background">
              <Link href={`/suppliers/${activeSupplier.id}`}>
                <ExternalLink className="size-3.5" />
                Xem hồ sơ NCC
              </Link>
            </Button>
            <Button asChild size="sm" className="h-8 text-xs gap-1.5">
              <Link href={`/purchases/new?supplierId=${activeSupplier.id}`}>
                <Plus className="size-3.5" />
                Tạo phiếu nhập
              </Link>
            </Button>
          </div>
        </div>
      )}

      {/* 3. Dynamic Summary KPI Cards */}
      <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
        {/* Số lượng hóa đơn */}
        <StatCard
          title="Số lượng hóa đơn / phiếu"
          value={`${metrics.count} hóa đơn`}
          icon={FileText}
          hint={`${metrics.unpaidCount} chưa trả · ${metrics.partialCount} một phần · ${metrics.paidCount} đã tất toán`}
        />

        {/* Tổng tiền nhập */}
        <StatCard
          title="Tổng giá trị nhập"
          value={formatVND(metrics.totalAmount)}
          icon={Banknote}
          hint={
            activeSupplier
              ? `Hàng nhập từ ${activeSupplier.name}`
              : metrics.count > 0
              ? `Trung bình: ${formatVND(metrics.avgInvoiceValue)} / hóa đơn`
              : periodHint
          }
        />

        {/* Số tiền đã thanh toán */}
        <StatCard
          title="Số tiền đã thanh toán"
          value={formatVND(metrics.paidAmount)}
          icon={CheckCircle2}
          tone="success"
          hint={
            metrics.totalAmount > 0
              ? `Đã trả ${metrics.paidPercentage.toFixed(1)}% (${metrics.paidCount} đơn xong)`
              : "Chưa phát sinh thanh toán"
          }
        />

        {/* Còn nợ NCC */}
        <StatCard
          title="Còn nợ nhà cung cấp"
          value={formatVND(metrics.debtAmount)}
          icon={Wallet}
          tone={metrics.debtAmount > 0 ? (metrics.overdueDebt > 0 ? "danger" : "warning") : "success"}
          hint={
            metrics.debtAmount > 0
              ? metrics.overdueDebt > 0
                ? `⚠️ Có ${metrics.overdueCount} đơn quá hạn (${formatVND(metrics.overdueDebt)})`
                : `${metrics.unpaidCount + metrics.partialCount} đơn chưa tất toán`
              : "Đã thanh toán đủ toàn bộ"
          }
        />
      </div>

      {/* Overdue Warning Alert if any overdue orders in filtered set */}
      {metrics.overdueCount > 0 && selectedStatus !== "overdue" && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 flex flex-wrap items-center justify-between gap-2.5 text-xs text-destructive">
          <div className="flex items-center gap-2 font-medium">
            <AlertTriangle className="size-4 shrink-0" />
            <span>
              Phát hiện <strong>{metrics.overdueCount} hóa đơn quá hạn</strong> thanh toán với tổng
              tiền nợ <strong>{formatVND(metrics.overdueDebt)}</strong>.
            </span>
          </div>
          <Button
            type="button"
            size="sm"
            variant="destructive"
            onClick={() => handleStatusChange("overdue")}
            className="h-7 text-xs px-2.5 font-medium"
          >
            Chỉ xem đơn quá hạn ({metrics.overdueCount})
          </Button>
        </div>
      )}

      {/* 4. Filtered Purchase Orders Table */}
      <PurchaseOrdersTable
        orders={filteredOrders}
        hideToolbar={true}
        emptyMessage={
          activeFiltersCount > 0
            ? "Không tìm thấy phiếu nhập nào phù hợp với các bộ lọc đã chọn."
            : "Chưa có phiếu nhập nào trong hệ thống."
        }
      />
        </>
      )}
    </div>
  );
}
