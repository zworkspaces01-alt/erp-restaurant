"use client";

import { useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Loader2,
  Plus,
  Sparkles,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  generateMisaCukCukTemplate,
  parseMisaSalesExcel,
  type MisaParseResult,
} from "@/lib/misa-excel";
import {
  getMisaImportMetadata,
  importMisaOrdersAction,
  autoCreateMissingMenuItemsAction,
  type MisaOrderToImport,
} from "@/server-actions/orders.actions";
import type { PosMenuItem } from "@/lib/queries/orders.queries";
import { formatNumber, formatVND } from "@/lib/format";

export function MisaImportDialog() {
  const router = useRouter();
  const inputId = useId();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [parseResult, setParseResult] = useState<MisaParseResult | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const [autoAddMenuItems, setAutoAddMenuItems] = useState(true);
  const [isCreatingItems, setIsCreatingItems] = useState(false);
  const [activeTab, setActiveTab] = useState<"all" | "valid" | "duplicate" | "invalid">("all");

  const fileBufferRef = useRef<ArrayBuffer | null>(null);
  const metadataRef = useRef<{
    menuItems: PosMenuItem[];
    existingMisaCodes: string[];
  } | null>(null);

  const [isPending, startTransition] = useTransition();

  // Reset khi đóng mở
  function handleOpenChange(nextOpen: boolean) {
    if (!isPending) {
      setOpen(nextOpen);
      if (!nextOpen) {
        setFile(null);
        setParseResult(null);
        setParseError(null);
        fileBufferRef.current = null;
        metadataRef.current = null;
      }
    }
  }

  // Tải file mẫu MISA CukCuk
  function handleDownloadTemplate() {
    try {
      const buffer = generateMisaCukCukTemplate();
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "mau_ban_hang_misa_cukcuk.xlsx";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("Đã tải xuống file mẫu MISA CukCuk");
    } catch {
      toast.error("Không tạo được file mẫu");
    }
  }

  // Xử lý file khi người dùng chọn
  async function handleFileSelect(selectedFile: File) {
    setFile(selectedFile);
    setParseError(null);
    setParsing(true);

    try {
      // 1. Tải danh mục món và các hóa đơn MISA đã có từ server
      const metaRes = await getMisaImportMetadata();
      if (!metaRes.success) {
        throw new Error(metaRes.error);
      }

      const { menuItems, existingMisaCodes } = metaRes.data;
      metadataRef.current = { menuItems, existingMisaCodes };

      // 2. Đọc arrayBuffer
      const buffer = await selectedFile.arrayBuffer();
      fileBufferRef.current = buffer;

      // 3. Phân tích cú pháp
      const result = parseMisaSalesExcel(buffer, menuItems, existingMisaCodes, {
        autoAddMenuItems,
      });
      setParseResult(result);

      if (result.totalInvoices === 0) {
        setParseError("Không tìm thấy dòng hóa đơn hợp lệ nào trong file.");
      }
    } catch (err) {
      console.error(err);
      setParseError(err instanceof Error ? err.message : "Không thể đọc file Excel.");
      setParseResult(null);
    } finally {
      setParsing(false);
    }
  }

  // Thay đổi tùy chọn tự động thêm món mới
  function handleToggleAutoAdd(nextChecked: boolean) {
    setAutoAddMenuItems(nextChecked);
    if (fileBufferRef.current && metadataRef.current) {
      const result = parseMisaSalesExcel(
        fileBufferRef.current,
        metadataRef.current.menuItems,
        metadataRef.current.existingMisaCodes,
        { autoAddMenuItems: nextChecked }
      );
      setParseResult(result);
    }
  }

  // Thêm ngay các món chưa có vào danh mục Thực đơn ERP
  async function handleCreateMissingMenuItems() {
    if (!parseResult || parseResult.unmatchedItems.length === 0) return;

    setIsCreatingItems(true);
    try {
      const res = await autoCreateMissingMenuItemsAction(
        parseResult.unmatchedItems.map((u) => ({
          code: u.code,
          name: u.name,
          unit_price: u.unitPrice,
          unit: u.unit,
          category: u.category,
          item_group: u.itemGroup,
          tax_percent: u.taxPercent,
        }))
      );

      if (!res.success) {
        toast.error(res.error);
        return;
      }

      toast.success(
        `Đã tự động thêm thành công ${res.data.createdCount} món mới vào Thực đơn ERP!`
      );

      // Cập nhật lại metadata và phân tích lại file
      const metaRes = await getMisaImportMetadata();
      if (metaRes.success && fileBufferRef.current) {
        metadataRef.current = metaRes.data;
        const newResult = parseMisaSalesExcel(
          fileBufferRef.current,
          metaRes.data.menuItems,
          metaRes.data.existingMisaCodes,
          { autoAddMenuItems }
        );
        setParseResult(newResult);
      }
    } catch (err) {
      console.error(err);
      toast.error("Có lỗi xảy ra khi tạo món mới vào Thực đơn");
    } finally {
      setIsCreatingItems(false);
    }
  }

  // Thực hiện import các đơn hợp lệ
  function handleImport() {
    if (!parseResult) return;

    // Danh sách đơn sẽ gửi lên server
    const candidateOrders = parseResult.orders.filter((o) => {
      if (!o.is_valid) return false;
      if (skipDuplicates && o.is_duplicate) return false;
      return true;
    });

    if (candidateOrders.length === 0) {
      toast.warning("Không có hóa đơn nào đủ điều kiện để nhập.");
      return;
    }

    const payload: MisaOrderToImport[] = candidateOrders.map((o) => ({
      invoice_code: o.invoice_code,
      order_date: o.order_date,
      table_number: o.table_number || undefined,
      payment_method: o.payment_method,
      discount: o.discount,
      note: o.note || undefined,
      items: o.items.map((it) => ({
        menu_item_id: it.menu_item_id,
        raw_code: it.raw_code,
        raw_name: it.raw_name,
        quantity: it.quantity,
        unit_price: it.unit_price,
        unit: it.unit,
        category: it.category,
        item_group: it.item_group,
        tax_percent: it.tax_percent,
      })),
    }));

    startTransition(async () => {
      const res = await importMisaOrdersAction(
        payload,
        skipDuplicates,
        autoAddMenuItems,
        parseResult.unmatchedItems.map((u) => ({
          code: u.code,
          name: u.name,
          unit_price: u.unitPrice,
          unit: u.unit,
          category: u.category,
          item_group: u.itemGroup,
          tax_percent: u.taxPercent,
        }))
      );

      if (!res.success) {
        toast.error(res.error);
        return;
      }

      const { importedCount, skippedCount, totalRevenue, createdMenuItemsCount, errors } = res.data;

      if (importedCount > 0) {
        const addedMenuMsg = createdMenuItemsCount > 0
          ? ` (đã tự động tạo ${createdMenuItemsCount} món mới vào Thực đơn)`
          : "";
        toast.success(
          `Đã nhập thành công ${importedCount} hóa đơn MISA${addedMenuMsg}! Doanh thu: ${formatVND(totalRevenue)}. Kho nguyên liệu đã được trừ tự động theo định lượng BOM.`
        );
      } else if (skippedCount > 0) {
        toast.info(`Đã bỏ qua ${skippedCount} hóa đơn do đã tồn tại.`);
      }

      if (errors.length > 0) {
        toast.warning(`Có ${errors.length} hóa đơn gặp lỗi khi lưu.`);
      }

      setOpen(false);
      router.refresh();
    });
  }

  // Lọc danh sách hóa đơn theo tab
  const filteredOrders = (parseResult?.orders ?? []).filter((o) => {
    if (activeTab === "valid") return o.is_valid && !o.is_duplicate;
    if (activeTab === "duplicate") return o.is_duplicate;
    if (activeTab === "invalid") return !o.is_valid;
    return true;
  });

  const readyToImportCount = (parseResult?.orders ?? []).filter(
    (o) => o.is_valid && (!skipDuplicates || !o.is_duplicate)
  ).length;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <FileSpreadsheet className="size-4 text-emerald-600 dark:text-emerald-400" />
          Nhập từ MISA CukCuk
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-4xl max-h-[92vh] flex flex-col p-0">
        <DialogHeader className="p-6 pb-2">
          <div className="flex items-center justify-between pr-6">
            <div className="flex items-center gap-2.5">
              <div className="flex size-9 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                <FileSpreadsheet className="size-5" />
              </div>
              <div>
                <DialogTitle className="text-lg">Nhập dữ liệu bán hàng MISA CukCuk</DialogTitle>
                <DialogDescription className="text-xs">
                  Nhập file Excel xuất từ MISA để tự động xuất kho theo định lượng (BOM) và tính PnL.
                </DialogDescription>
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleDownloadTemplate}
              className="gap-1.5 text-xs"
            >
              <Download className="size-3.5" />
              Tải file mẫu MISA
            </Button>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-2 space-y-4">
          {/* Vùng chọn / kéo thả file */}
          {!file ? (
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const dropped = e.dataTransfer.files[0];
                if (dropped) void handleFileSelect(dropped);
              }}
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-muted-foreground/30 hover:border-emerald-500/50 hover:bg-emerald-500/5 rounded-xl p-8 text-center cursor-pointer transition-colors"
            >
              <input
                ref={fileInputRef}
                id={inputId}
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleFileSelect(f);
                }}
              />
              <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-muted mb-3">
                <Upload className="size-6 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium text-foreground">
                Kéo thả file Excel xuất từ MISA CukCuk vào đây, hoặc <span className="text-emerald-600 underline">chọn từ máy tính</span>
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Hỗ trợ định dạng .xlsx, .xls xuất từ MISA CukCuk (Báo cáo chi tiết hóa đơn / Sổ chi tiết bán hàng).
              </p>
            </div>
          ) : (
            <div className="flex items-center justify-between rounded-lg border bg-muted/30 px-4 py-2.5">
              <div className="flex items-center gap-2.5">
                <FileSpreadsheet className="size-5 text-emerald-600 dark:text-emerald-400" />
                <div>
                  <p className="text-sm font-medium text-foreground">{file.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatNumber(file.size / 1024, 1)} KB
                  </p>
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setFile(null);
                  setParseResult(null);
                  setParseError(null);
                }}
                disabled={isPending || parsing}
                className="gap-1 text-xs"
              >
                <X className="size-3.5" />
                Đổi file khác
              </Button>
            </div>
          )}

          {/* Trạng thái đang phân tích */}
          {parsing && (
            <div className="flex flex-col items-center justify-center py-8 gap-2 text-muted-foreground">
              <Loader2 className="size-6 animate-spin text-emerald-600" />
              <p className="text-sm">Đang phân tích dữ liệu hóa đơn và đối chiếu thực đơn...</p>
            </div>
          )}

          {/* Lỗi phân tích */}
          {parseError && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive flex items-start gap-2.5">
              <AlertCircle className="size-4 shrink-0 mt-0.5" />
              <div>
                <p className="font-medium">Không thể xử lý file Excel</p>
                <p className="text-xs mt-0.5">{parseError}</p>
              </div>
            </div>
          )}

          {/* Kết quả xem trước */}
          {parseResult && !parsing && (
            <div className="space-y-4">
              {/* Thống kê nhanh */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div className="rounded-lg border bg-card p-3">
                  <span className="text-xs text-muted-foreground">Tổng số hóa đơn</span>
                  <div className="text-xl font-bold text-foreground mt-0.5">
                    {parseResult.totalInvoices}
                  </div>
                </div>
                <div className="rounded-lg border bg-card p-3 border-emerald-500/30 bg-emerald-500/5">
                  <span className="text-xs text-emerald-700 dark:text-emerald-400 font-medium">
                    Hợp lệ sẵn sàng nhập
                  </span>
                  <div className="text-xl font-bold text-emerald-700 dark:text-emerald-400 mt-0.5">
                    {parseResult.validInvoices}
                  </div>
                </div>
                <div className="rounded-lg border bg-card p-3">
                  <span className="text-xs text-muted-foreground">Đã có trên hệ thống</span>
                  <div className="text-xl font-bold text-amber-600 mt-0.5">
                    {parseResult.duplicateInvoices}
                  </div>
                </div>
                {autoAddMenuItems ? (
                  <div className="rounded-lg border bg-card p-3 border-emerald-500/20 bg-emerald-500/5">
                    <span className="text-xs text-emerald-700 dark:text-emerald-400 font-medium flex items-center gap-1">
                      <Sparkles className="size-3 text-emerald-600" />
                      Món mới sẽ tự tạo
                    </span>
                    <div className="text-xl font-bold text-emerald-700 dark:text-emerald-400 mt-0.5">
                      {parseResult.unmatchedItems.length}
                    </div>
                  </div>
                ) : (
                  <div className="rounded-lg border bg-card p-3 border-destructive/20 bg-destructive/5">
                    <span className="text-xs text-muted-foreground">Lỗi chưa map được món</span>
                    <div className="text-xl font-bold text-destructive mt-0.5">
                      {parseResult.invalidInvoices}
                    </div>
                  </div>
                )}
              </div>

              {/* Doanh thu dự kiến kép */}
              <div className="rounded-lg border bg-gradient-to-r from-emerald-500/10 via-emerald-500/5 to-transparent p-3.5 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <span className="text-xs text-muted-foreground">Tổng tiền thực thu (Khách trả đã gồm VAT):</span>
                  <div className="text-xl font-bold text-emerald-700 dark:text-emerald-400">
                    {formatVND(parseResult.totalGrossRevenue || parseResult.totalRevenue)}
                  </div>
                </div>
                <div className="flex items-center gap-4 text-xs">
                  <div>
                    <span className="text-muted-foreground">Thuần (trước thuế):</span>
                    <p className="font-semibold text-foreground">{formatVND(parseResult.totalRevenue)}</p>
                  </div>
                  <div className="border-l pl-4">
                    <span className="text-muted-foreground">Tiền thuế GTGT (8-10%):</span>
                    <p className="font-semibold text-foreground">{formatVND(parseResult.totalTax)}</p>
                  </div>
                </div>
              </div>

              {/* Banner cảnh báo / thông báo món mới */}
              {parseResult.unmatchedItems.length > 0 && (
                <div
                  className={`rounded-lg border p-3.5 space-y-2.5 text-xs transition-colors ${
                    autoAddMenuItems
                      ? "border-emerald-500/30 bg-emerald-500/5"
                      : "border-amber-500/30 bg-amber-500/5"
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 font-medium text-emerald-800 dark:text-emerald-300">
                      {autoAddMenuItems ? (
                        <Sparkles className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                      ) : (
                        <AlertTriangle className="size-4 shrink-0 text-amber-600 dark:text-amber-400" />
                      )}
                      <span>
                        Phát hiện {parseResult.unmatchedItems.length} món trong file MISA chưa có trong Thực đơn ERP:
                      </span>
                    </div>
                    {autoAddMenuItems && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={handleCreateMissingMenuItems}
                        disabled={isCreatingItems || isPending}
                        className="h-7 px-2.5 text-xs border-emerald-500/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/10 gap-1.5"
                      >
                        {isCreatingItems ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          <Plus className="size-3.5" />
                        )}
                        Thêm ngay {parseResult.unmatchedItems.length} món vào Thực đơn
                      </Button>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto pt-1">
                    {parseResult.unmatchedItems.map((u, i) => (
                      <span
                        key={i}
                        className={`inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-[11px] ${
                          autoAddMenuItems
                            ? "bg-emerald-500/15 text-emerald-950 dark:text-emerald-200"
                            : "bg-amber-500/15 text-amber-900 dark:text-amber-200"
                        }`}
                      >
                        <strong>{u.name || u.code}</strong>
                        {u.code && u.name && <span className="opacity-75">({u.code})</span>}
                        {u.unitPrice > 0 && (
                          <span className="opacity-80 font-mono text-[10px]">
                            {formatVND(u.unitPrice)}
                          </span>
                        )}
                        <span className="text-[10px] opacity-60">×{u.occurrences} lần</span>
                      </span>
                    ))}
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    {autoAddMenuItems ? (
                      <>
                        ✨ Hệ thống sẽ <strong>tự động thêm {parseResult.unmatchedItems.length} món trên vào Thực đơn</strong> (kèm giá bán & mã món từ MISA) khi bạn bấm Nhập hóa đơn. Bạn cũng có thể bấm <em>Thêm ngay vào Thực đơn</em> ở trên để xem trước trong menu.
                      </>
                    ) : (
                      <>
                        * Các hóa đơn có chứa món trên sẽ tạm thời bị đánh dấu lỗi. Bạn có thể bật tùy chọn <strong>Tự động thêm món</strong> bên dưới để hệ thống nhận diện và nhập ngay.
                      </>
                    )}
                  </p>
                </div>
              )}

              {/* Tùy chọn tự động thêm món mới */}
              <div className="flex items-center justify-between space-x-2 bg-emerald-500/5 p-3 rounded-lg border border-emerald-500/20">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="auto-add-menu"
                    checked={autoAddMenuItems}
                    onCheckedChange={(c) => handleToggleAutoAdd(Boolean(c))}
                  />
                  <Label htmlFor="auto-add-menu" className="text-xs cursor-pointer font-medium text-foreground">
                    Tự động thêm món chưa có vào Thực đơn (Mã món và giá bán lấy từ file MISA)
                  </Label>
                </div>
                {autoAddMenuItems && parseResult.unmatchedItems.length > 0 && (
                  <Badge variant="outline" className="text-[10px] border-emerald-500/30 text-emerald-700 dark:text-emerald-300 bg-emerald-500/10">
                    +{parseResult.unmatchedItems.length} món mới
                  </Badge>
                )}
              </div>

              {/* Tùy chọn bỏ qua trùng lặp */}
              <div className="flex items-center space-x-2 bg-muted/40 p-3 rounded-lg border">
                <Checkbox
                  id="skip-dup"
                  checked={skipDuplicates}
                  onCheckedChange={(c) => setSkipDuplicates(Boolean(c))}
                />
                <Label htmlFor="skip-dup" className="text-xs cursor-pointer">
                  Tự động bỏ qua các hóa đơn đã nhập trước đó (Tránh xuất kho 2 lần và không ghi nhận trùng doanh thu)
                </Label>
              </div>

              {/* Bảng xem trước danh sách hóa đơn */}
              <div className="space-y-2">
                <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
                  <div className="flex items-center justify-between">
                    <TabsList className="h-8">
                      <TabsTrigger value="all" className="text-xs">
                        Tất cả ({parseResult.orders.length})
                      </TabsTrigger>
                      <TabsTrigger value="valid" className="text-xs">
                        Hợp lệ ({parseResult.validInvoices})
                      </TabsTrigger>
                      {parseResult.duplicateInvoices > 0 && (
                        <TabsTrigger value="duplicate" className="text-xs text-amber-600">
                          Đã có ({parseResult.duplicateInvoices})
                        </TabsTrigger>
                      )}
                      {parseResult.invalidInvoices > 0 && (
                        <TabsTrigger value="invalid" className="text-xs text-destructive">
                          Chưa thể nhập ({parseResult.invalidInvoices})
                        </TabsTrigger>
                      )}
                    </TabsList>
                    <span className="text-xs text-muted-foreground">
                      Doanh thu dự kiến: <strong className="text-foreground">{formatVND(parseResult.totalRevenue)}</strong>
                    </span>
                  </div>

                  <TabsContent value={activeTab} className="mt-2">
                    <div className="rounded-lg border max-h-[300px] overflow-y-auto">
                      <table className="w-full text-xs">
                        <thead className="bg-muted/70 text-muted-foreground sticky top-0 border-b">
                          <tr>
                            <th className="py-2 px-3 text-left font-medium">Số HĐ MISA</th>
                            <th className="py-2 px-3 text-left font-medium">Thời gian</th>
                            <th className="py-2 px-3 text-left font-medium">Bàn</th>
                            <th className="py-2 px-3 text-left font-medium">Các món bán</th>
                            <th className="py-2 px-3 text-right font-medium">Thực thu</th>
                            <th className="py-2 px-3 text-center font-medium">Thanh toán</th>
                            <th className="py-2 px-3 text-center font-medium">Trạng thái</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {filteredOrders.length === 0 ? (
                            <tr>
                              <td colSpan={7} className="py-8 text-center text-muted-foreground">
                                Không có hóa đơn nào trong mục này.
                              </td>
                            </tr>
                          ) : (
                            filteredOrders.map((ord, idx) => (
                              <tr key={idx} className="hover:bg-muted/30 transition-colors">
                                <td className="py-2 px-3 font-mono font-medium text-foreground whitespace-nowrap">
                                  {ord.invoice_code}
                                </td>
                                <td className="py-2 px-3 text-muted-foreground whitespace-nowrap">
                                  {ord.display_date}
                                </td>
                                <td className="py-2 px-3 whitespace-nowrap">
                                  {ord.table_number || "—"}
                                </td>
                                <td className="py-2 px-3 max-w-[260px]">
                                  <div className="truncate" title={ord.items.map((it) => `${it.raw_name} (x${it.quantity})`).join(", ")}>
                                    {ord.items.map((it, itIdx) => (
                                      <span
                                        key={itIdx}
                                        className={
                                          !it.is_matched
                                            ? autoAddMenuItems
                                              ? "text-emerald-700 dark:text-emerald-400 font-medium"
                                              : "text-destructive font-semibold"
                                            : "text-foreground"
                                        }
                                      >
                                        {it.raw_name} (x{it.quantity})
                                        {!it.is_matched && autoAddMenuItems && (
                                          <span className="text-[9px] font-normal opacity-70 ml-0.5">
                                            (món mới)
                                          </span>
                                        )}
                                        {itIdx < ord.items.length - 1 ? ", " : ""}
                                      </span>
                                    ))}
                                  </div>
                                </td>
                                <td className="py-2 px-3 text-right font-medium text-foreground whitespace-nowrap">
                                  <div>{formatVND(ord.total_with_tax || ord.total_amount)}</div>
                                  {ord.tax_amount > 0 && (
                                    <div className="text-[10px] text-muted-foreground">
                                      Thuần: {formatVND(ord.total_amount)} · VAT: {formatVND(ord.tax_amount)}
                                    </div>
                                  )}
                                </td>
                                <td className="py-2 px-3 text-center whitespace-nowrap">
                                  <Badge variant="outline" className="text-[10px] font-normal">
                                    {ord.payment_method === "cash"
                                      ? "Tiền mặt"
                                      : ord.payment_method === "bank_transfer"
                                        ? "Chuyển khoản"
                                        : "Thẻ POS"}
                                  </Badge>
                                </td>
                                <td className="py-2 px-3 text-center whitespace-nowrap">
                                  {ord.is_duplicate ? (
                                    <Badge variant="outline" className="text-[10px] text-amber-700 bg-amber-500/10 border-amber-500/30">
                                      Đã có
                                    </Badge>
                                  ) : ord.has_new_items && autoAddMenuItems ? (
                                    <Badge variant="outline" className="text-[10px] text-emerald-700 dark:text-emerald-300 bg-emerald-500/10 border-emerald-500/30">
                                      <Sparkles className="size-3 mr-1 text-emerald-600" />
                                      Tạo món mới
                                    </Badge>
                                  ) : ord.is_valid ? (
                                    <Badge variant="outline" className="text-[10px] text-emerald-700 bg-emerald-500/10 border-emerald-500/30">
                                      <CheckCircle2 className="size-3 mr-1" />
                                      Hợp lệ
                                    </Badge>
                                  ) : (
                                    <Badge variant="destructive" className="text-[10px]">
                                      Thiếu món
                                    </Badge>
                                  )}
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </TabsContent>
                </Tabs>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="p-4 border-t bg-muted/20 gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={isPending}
          >
            Đóng
          </Button>
          <Button
            type="button"
            onClick={handleImport}
            disabled={!parseResult || readyToImportCount === 0 || isPending}
            className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            {isPending ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Đang lưu hóa đơn & trừ kho...
              </>
            ) : (
              <>
                <CheckCircle2 className="size-4" />
                Nhập {readyToImportCount} hóa đơn vào ERP
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
