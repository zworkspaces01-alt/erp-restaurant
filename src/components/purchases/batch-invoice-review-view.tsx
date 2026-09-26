"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  Building2,
  CheckCircle2,
  FileCheck2,
  Layers,
  Maximize2,
  Package,
  Plus,
  Receipt,
  RotateCw,
  Sparkles,
  Trash2,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { toast } from "sonner";
import { formatVND } from "@/lib/format";
import type { MatchedInvoiceItem, PaymentMethod } from "@/types/restaurant";
import type {
  IngredientPickRow,
  SupplierPickRow,
} from "@/lib/queries/purchases.queries";
import type { BatchInvoiceItemResult } from "@/server-actions/invoice-ocr.actions";
import {
  createBatchPurchaseOrders,
  createPurchaseOrder,
} from "@/server-actions/purchases.actions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { IngredientPicker } from "@/components/purchases/ingredient-picker";

interface BatchInvoiceReviewViewProps {
  invoices: BatchInvoiceItemResult[];
  suppliers: SupplierPickRow[];
  ingredients: IngredientPickRow[];
  onClose: () => void;
}

interface EditableInvoiceItem {
  id: string;
  fileName: string;
  imageUrl: string;
  modelUsed: string;
  isMock: boolean;
  status: "success" | "error";
  errorMessage?: string;
  supplierId: string;
  rawSupplierName?: string;
  invoiceNumber: string;
  orderDate: string;
  items: MatchedInvoiceItem[];
  savedPoId?: string;
  savedPoNumber?: string;
}

export function BatchInvoiceReviewView({
  invoices,
  suppliers,
  ingredients,
  onClose,
}: BatchInvoiceReviewViewProps) {
  const router = useRouter();

  // Khởi tạo danh sách hóa đơn có thể chỉnh sửa
  const [invoiceList, setInvoiceList] = useState<EditableInvoiceItem[]>(() =>
    invoices.map((inv) => ({
      id: inv.id,
      fileName: inv.fileName,
      imageUrl: inv.imageUrl,
      modelUsed: inv.modelUsed,
      isMock: inv.isMock,
      status: inv.status,
      errorMessage: inv.errorMessage,
      supplierId: inv.reviewData.supplier_id || "",
      rawSupplierName:
        inv.reviewData.raw_extracted?.supplier_name ||
        inv.reviewData.matched_supplier_name ||
        "",
      invoiceNumber: inv.reviewData.invoice_number || "",
      orderDate:
        inv.reviewData.order_date || new Date().toISOString().slice(0, 10),
      items: inv.reviewData.items.map((it) => ({
        ...it,
        tax_rate: typeof it.tax_rate === "number" ? it.tax_rate : 0,
        is_taxable: (it.tax_rate ?? 0) > 0,
      })),
    }))
  );

  const [activeIndex, setActiveIndex] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submittingProgress, setSubmittingProgress] = useState("");

  // Điều khiển phóng to/thu nhỏ ảnh hóa đơn
  const [zoomLevel, setZoomLevel] = useState(1);
  const [rotation, setRotation] = useState(0);

  const activeInvoice = invoiceList[activeIndex] ?? null;

  // Tính toán tổng số liệu cả đợt nhập
  const grandTotal = invoiceList.reduce((sum, inv) => {
    return (
      sum +
      inv.items.reduce(
        (itSum, it) => itSum + (it.line_total || it.quantity * it.unit_price),
        0
      )
    );
  }, 0);

  const totalLineItems = invoiceList.reduce(
    (sum, inv) => sum + inv.items.length,
    0
  );

  const uniqueSupplierIds = Array.from(
    new Set(invoiceList.map((inv) => inv.supplierId).filter(Boolean))
  );

  // Cập nhật thông tin hóa đơn hiện tại
  const updateActiveInvoice = (updater: (prev: EditableInvoiceItem) => EditableInvoiceItem) => {
    setInvoiceList((prev) => {
      const copy = [...prev];
      if (copy[activeIndex]) {
        copy[activeIndex] = updater(copy[activeIndex]);
      }
      return copy;
    });
  };

  // Cập nhật dòng mặt hàng trong hóa đơn đang xem
  const updateItemInActiveInvoice = (
    itemIndex: number,
    updater: (prev: MatchedInvoiceItem) => MatchedInvoiceItem
  ) => {
    updateActiveInvoice((inv) => {
      const newItems = [...inv.items];
      if (newItems[itemIndex]) {
        const updated = updater(newItems[itemIndex]);
        // Tự động tính lại line_total nếu thay đổi số lượng hoặc đơn giá
        updated.line_total = Math.round(updated.quantity * updated.unit_price);
        newItems[itemIndex] = updated;
      }
      return { ...inv, items: newItems };
    });
  };

  const removeItemFromActiveInvoice = (itemIndex: number) => {
    updateActiveInvoice((inv) => ({
      ...inv,
      items: inv.items.filter((_, idx) => idx !== itemIndex),
    }));
  };

  const addItemToActiveInvoice = () => {
    const firstIng = ingredients[0];
    const newItem: MatchedInvoiceItem = {
      raw_name: firstIng ? firstIng.name : "Nguyên liệu mới",
      quantity: 1,
      unit: firstIng?.import_unit || firstIng?.base_unit || "kg",
      unit_price: firstIng?.avg_cost_price || 0,
      line_total: firstIng?.avg_cost_price || 0,
      ingredient_id: firstIng ? firstIng.id : null,
      matched_ingredient_name: firstIng ? firstIng.name : null,
      conversion_factor: firstIng?.conversion_factor || 1,
      match_confidence: firstIng ? "exact" : "unmatched",
      tax_rate: 0,
      is_taxable: false,
    };
    updateActiveInvoice((inv) => ({
      ...inv,
      items: [...inv.items, newItem],
    }));
  };

  const removeInvoiceFromBatch = (indexToRemove: number) => {
    if (invoiceList.length <= 1) {
      toast.error("Không thể xóa hóa đơn cuối cùng trong danh sách.");
      return;
    }
    setInvoiceList((prev) => prev.filter((_, idx) => idx !== indexToRemove));
    if (activeIndex >= indexToRemove && activeIndex > 0) {
      setActiveIndex(activeIndex - 1);
    }
    toast.info("Đã xóa hóa đơn khỏi danh sách nhập hàng loạt.");
  };

  // Kiểm tra tính hợp lệ của từng hóa đơn
  const getInvoiceValidationStatus = (inv: EditableInvoiceItem) => {
    if (!inv.supplierId) {
      return { valid: false, reason: "Chưa chọn Nhà Cung Cấp" };
    }
    if (inv.items.length === 0) {
      return { valid: false, reason: "Chưa có mặt hàng nào" };
    }
    const missingIng = inv.items.some((it) => !it.ingredient_id);
    if (missingIng) {
      return { valid: false, reason: "Có mặt hàng chưa khớp kho" };
    }
    return { valid: true, reason: "Sẵn sàng nhập kho" };
  };

  // Lưu riêng hóa đơn đang kích hoạt
  const handleSaveSingleInvoice = async () => {
    if (!activeInvoice) return;
    const status = getInvoiceValidationStatus(activeInvoice);
    if (!status.valid) {
      toast.error(`Không thể lưu: ${status.reason}`);
      return;
    }

    setIsSubmitting(true);
    setSubmittingProgress(`Đang lưu hóa đơn #${activeIndex + 1}...`);

    try {
      const itemsPayload = activeInvoice.items.map((it) => ({
        ingredient_id: it.ingredient_id!,
        quantity: it.quantity,
        unit_price: it.unit_price,
        unit: it.unit || null,
        conversion_factor: it.conversion_factor || 1,
      }));

      const res = await createPurchaseOrder({
        supplier_id: activeInvoice.supplierId,
        order_date: activeInvoice.orderDate,
        due_date: null,
        invoice_number: activeInvoice.invoiceNumber || null,
        invoice_image_url: activeInvoice.imageUrl || null,
        note: `Nhập tự động AI từ file ${activeInvoice.fileName}`,
        items: itemsPayload,
        paid_now: 0,
        paid_method: "cash",
      });

      if (!res.success) {
        toast.error(`Lỗi: ${res.error}`);
        return;
      }

      toast.success(
        `Đã tạo thành công phiếu nhập kho cho hóa đơn #${activeIndex + 1}!`
      );
      updateActiveInvoice((inv) => ({
        ...inv,
        savedPoId: res.data.id,
      }));
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Lỗi không xác định");
    } finally {
      setIsSubmitting(false);
      setSubmittingProgress("");
    }
  };

  // Lưu tất cả các hóa đơn trong đợt nhập hàng loạt
  const handleSaveAllBatch = async () => {
    // 1. Kiểm tra toàn bộ danh sách
    const invalidList = invoiceList
      .map((inv, idx) => ({ index: idx, status: getInvoiceValidationStatus(inv) }))
      .filter((item) => !item.status.valid);

    if (invalidList.length > 0) {
      const firstInvalid = invalidList[0];
      setActiveIndex(firstInvalid.index);
      toast.error(
        `Hóa đơn #${firstInvalid.index + 1} chưa hợp lệ: ${firstInvalid.status.reason}. Vui lòng kiểm tra lại.`
      );
      return;
    }

    setIsSubmitting(true);
    setSubmittingProgress(
      `Đang tạo hàng loạt ${invoiceList.length} phiếu nhập kho cho ${uniqueSupplierIds.length} Nhà Cung Cấp...`
    );

    try {
      const ordersPayload = invoiceList.map((inv) => ({
        supplier_id: inv.supplierId,
        order_date: inv.orderDate,
        due_date: null,
        invoice_number: inv.invoiceNumber || null,
        invoice_image_url: inv.imageUrl || null,
        note: `Nhập tự động hàng loạt AI từ file ${inv.fileName}`,
        items: inv.items.map((it) => ({
          ingredient_id: it.ingredient_id!,
          quantity: it.quantity,
          unit_price: it.unit_price,
          unit: it.unit || null,
          conversion_factor: it.conversion_factor || 1,
        })),
        paid_now: 0,
        paid_method: "cash" as PaymentMethod,
      }));

      const res = await createBatchPurchaseOrders(ordersPayload);

      if (!res.success) {
        toast.error(`Lỗi tạo hàng loạt: ${res.error}`);
        return;
      }

      const summary = res.data;
      if (summary.failedCount === 0) {
        toast.success(
          `🎉 Đã tạo thành công toàn bộ ${summary.successfulCount} phiếu nhập kho!`,
          { duration: 6000 }
        );
        onClose();
        router.push("/purchases");
        router.refresh();
      } else {
        toast.warning(
          `Hoàn tất: ${summary.successfulCount} phiếu thành công, ${summary.failedCount} phiếu lỗi. Vui lòng kiểm tra các phiếu còn lại.`,
          { duration: 8000 }
        );
        // Cập nhật lại trạng thái các phiếu đã lưu thành công
        setInvoiceList((prev) => {
          return prev.map((inv, idx) => {
            const itemResult = summary.results.find((r) => r.index === idx);
            if (itemResult && itemResult.success) {
              return {
                ...inv,
                savedPoId: itemResult.id,
                savedPoNumber: itemResult.po_number,
              };
            }
            return inv;
          });
        });
        router.refresh();
      }
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : "Đã xảy ra lỗi khi tạo hàng loạt phiếu nhập kho."
      );
    } finally {
      setIsSubmitting(false);
      setSubmittingProgress("");
    }
  };

  const activeInvoiceSubtotal =
    activeInvoice?.items.reduce(
      (sum, it) => sum + (it.line_total || it.quantity * it.unit_price),
      0
    ) || 0;

  return (
    <div className="flex flex-col h-[90vh] max-h-[920px] overflow-hidden bg-background">
      {/* Top Banner: Metrics & Global Actions */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-3 border-b bg-muted/40">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Layers className="size-5 text-emerald-600 dark:text-emerald-400" />
            <h2 className="font-bold text-base">
              Nhập Hàng Loạt AI — {invoiceList.length} Hóa Đơn
            </h2>
          </div>

          <div className="flex items-center gap-2">
            <Badge
              variant="outline"
              className="gap-1.5 py-1 px-2.5 bg-background font-semibold text-emerald-700 dark:text-emerald-300 border-emerald-500/30"
            >
              <Building2 className="size-3.5" />
              {uniqueSupplierIds.length} Nhà Cung Cấp
            </Badge>

            <Badge
              variant="outline"
              className="gap-1.5 py-1 px-2.5 bg-background text-muted-foreground"
            >
              <Package className="size-3.5" />
              {totalLineItems} mặt hàng
            </Badge>

            <Badge
              variant="secondary"
              className="gap-1.5 py-1 px-2.5 font-bold text-xs bg-emerald-50 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200 border border-emerald-300/40"
            >
              Tổng tiền: {formatVND(grandTotal)}
            </Badge>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onClose}
            disabled={isSubmitting}
            className="text-xs"
          >
            Đóng
          </Button>

          <Button
            type="button"
            variant="default"
            size="sm"
            onClick={handleSaveAllBatch}
            disabled={isSubmitting}
            className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs shadow-sm"
          >
            {isSubmitting ? (
              <>
                <div className="size-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                <span>{submittingProgress || "Đang xử lý..."}</span>
              </>
            ) : (
              <>
                <Sparkles className="size-3.5 text-amber-300" />
                <span>
                  Duyệt & Tạo Tất Cả ({invoiceList.length} Phiếu Nhập)
                </span>
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Main Workspace: Left Sidebar (Invoice List) + Right Pane (Active Invoice Inspector) */}
      <div className="grid grid-cols-12 flex-1 min-h-0 overflow-hidden">
        {/* Left Sidebar: Cards List of All Invoices */}
        <div className="col-span-12 md:col-span-4 lg:col-span-3 border-r bg-muted/10 flex flex-col min-h-0">
          <div className="p-3 border-b bg-muted/20 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Danh sách phiếu ({invoiceList.length})
            </span>
            <span className="text-[11px] text-muted-foreground">
              Chọn phiếu để kiểm tra
            </span>
          </div>

          <div className="flex-1 overflow-y-auto p-2.5 space-y-2">
            {invoiceList.map((inv, idx) => {
              const isActive = idx === activeIndex;
              const status = getInvoiceValidationStatus(inv);
              const supName =
                suppliers.find((s) => s.id === inv.supplierId)?.name ||
                inv.rawSupplierName ||
                "Chưa chọn NCC";
              const invTotal = inv.items.reduce(
                (sum, it) =>
                  sum + (it.line_total || it.quantity * it.unit_price),
                0
              );

              return (
                <div
                  key={inv.id}
                  onClick={() => setActiveIndex(idx)}
                  className={`group relative rounded-xl border p-2.5 cursor-pointer transition-all ${
                    isActive
                      ? "bg-background border-emerald-500 shadow-md ring-1 ring-emerald-500/30"
                      : "bg-card hover:bg-accent/40 border-border/70"
                  }`}
                >
                  <div className="flex items-start gap-2.5">
                    {/* Thumbnail */}
                    <div className="relative size-14 shrink-0 rounded-lg overflow-hidden bg-muted border">
                      {inv.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={inv.imageUrl}
                          alt={inv.fileName}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                          <Receipt className="size-5 opacity-40" />
                        </div>
                      )}
                      <span className="absolute top-0.5 left-0.5 bg-black/70 text-white font-mono text-[9px] font-bold px-1 rounded">
                        #{idx + 1}
                      </span>
                    </div>

                    {/* Meta info */}
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center justify-between gap-1">
                        <p className="font-semibold text-xs truncate" title={supName}>
                          {supName}
                        </p>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            removeInvoiceFromBatch(idx);
                          }}
                          disabled={isSubmitting}
                          className="opacity-0 group-hover:opacity-100 hover:text-destructive text-muted-foreground transition-opacity p-0.5 rounded"
                          title="Xóa hóa đơn này khỏi đợt nhập"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>

                      <p className="text-[11px] text-muted-foreground truncate">
                        {inv.invoiceNumber ? `Số HĐ: ${inv.invoiceNumber}` : inv.fileName}
                      </p>

                      <div className="flex items-center justify-between pt-0.5">
                        <span className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
                          {formatVND(invTotal)}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          {inv.items.length} món
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Status Badge */}
                  <div className="mt-2 pt-1.5 border-t flex items-center justify-between text-[11px]">
                    {inv.savedPoId ? (
                      <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1 font-medium">
                        <CheckCircle2 className="size-3" />
                        Đã lưu kho ({inv.savedPoNumber || "PO"})
                      </span>
                    ) : status.valid ? (
                      <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                        <CheckCircle2 className="size-3" />
                        Hợp lệ
                      </span>
                    ) : (
                      <span className="text-amber-600 dark:text-amber-400 flex items-center gap-1">
                        <AlertCircle className="size-3" />
                        {status.reason}
                      </span>
                    )}

                    <span className="text-[10px] text-muted-foreground">
                      {inv.orderDate}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Pane: Active Invoice Inspector */}
        <div className="col-span-12 md:col-span-8 lg:col-span-9 flex flex-col min-h-0 bg-background overflow-hidden">
          {activeInvoice ? (
            <>
              {/* Header Info of Active Invoice */}
              <div className="p-3.5 border-b bg-muted/20 flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-3">
                  <Badge variant="secondary" className="font-mono text-xs font-bold">
                    Hóa Đơn #{activeIndex + 1}/{invoiceList.length}
                  </Badge>

                  {/* Supplier Select */}
                  <div className="flex items-center gap-2">
                    <Label className="text-xs whitespace-nowrap text-muted-foreground">
                      Nhà Cung Cấp:
                    </Label>
                    <div className="w-[240px]">
                      <Select
                        value={activeInvoice.supplierId}
                        onValueChange={(val) =>
                          updateActiveInvoice((inv) => ({ ...inv, supplierId: val }))
                        }
                      >
                        <SelectTrigger className="h-8 text-xs font-semibold">
                          <SelectValue placeholder="Chọn Nhà Cung Cấp..." />
                        </SelectTrigger>
                        <SelectContent className="max-h-[300px]">
                          {suppliers.map((s) => (
                            <SelectItem key={s.id} value={s.id} className="text-xs">
                              {s.name} {s.code ? `(${s.code})` : ""}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Invoice Number */}
                  <div className="flex items-center gap-1.5">
                    <Label className="text-xs text-muted-foreground">Số HĐ:</Label>
                    <Input
                      value={activeInvoice.invoiceNumber}
                      onChange={(e) =>
                        updateActiveInvoice((inv) => ({
                          ...inv,
                          invoiceNumber: e.target.value,
                        }))
                      }
                      placeholder="Mã phiếu / Số hóa đơn"
                      className="h-8 w-32 text-xs font-mono"
                    />
                  </div>

                  {/* Order Date */}
                  <div className="flex items-center gap-1.5">
                    <Label className="text-xs text-muted-foreground">Ngày:</Label>
                    <Input
                      type="date"
                      value={activeInvoice.orderDate}
                      onChange={(e) =>
                        updateActiveInvoice((inv) => ({
                          ...inv,
                          orderDate: e.target.value,
                        }))
                      }
                      className="h-8 w-36 text-xs"
                    />
                  </div>
                </div>

                {/* Sub-actions for current invoice */}
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleSaveSingleInvoice}
                    disabled={isSubmitting || Boolean(activeInvoice.savedPoId)}
                    className="h-8 text-xs font-medium gap-1"
                  >
                    {activeInvoice.savedPoId ? (
                      <>
                        <CheckCircle2 className="size-3.5 text-emerald-600" />
                        Đã lưu kho
                      </>
                    ) : (
                      <>
                        <FileCheck2 className="size-3.5" />
                        Tạo riêng phiếu này
                      </>
                    )}
                  </Button>
                </div>
              </div>

              {/* Split Body: Left Photo Viewer (40%) + Right Editable Items Table (60%) */}
              <div className="grid grid-cols-1 lg:grid-cols-12 flex-1 min-h-0 overflow-hidden">
                {/* Image Photo Viewer */}
                <div className="lg:col-span-5 border-r bg-muted/20 flex flex-col min-h-0 overflow-hidden relative">
                  {/* Photo Toolbar */}
                  <div className="px-3 py-1.5 border-b bg-background/80 backdrop-blur-xs flex items-center justify-between text-xs">
                    <span className="font-medium text-muted-foreground truncate max-w-[200px]" title={activeInvoice.fileName}>
                      {activeInvoice.fileName}
                    </span>
                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-7"
                        onClick={() => setZoomLevel((z) => Math.max(0.5, z - 0.2))}
                        title="Thu nhỏ"
                      >
                        <ZoomOut className="size-3.5" />
                      </Button>
                      <span className="text-[11px] font-mono px-1">
                        {Math.round(zoomLevel * 100)}%
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-7"
                        onClick={() => setZoomLevel((z) => Math.min(3, z + 0.2))}
                        title="Phóng to"
                      >
                        <ZoomIn className="size-3.5" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-7"
                        onClick={() => setRotation((r) => (r + 90) % 360)}
                        title="Xoay ảnh"
                      >
                        <RotateCw className="size-3.5" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-7"
                        onClick={() => {
                          setZoomLevel(1);
                          setRotation(0);
                        }}
                        title="Đặt lại"
                      >
                        <Maximize2 className="size-3.5" />
                      </Button>
                    </div>
                  </div>

                  {/* Photo Canvas */}
                  <div className="flex-1 overflow-auto p-4 flex items-center justify-center bg-slate-900/5 dark:bg-slate-900/40">
                    {activeInvoice.imageUrl ? (
                      <div
                        className="transition-transform duration-150 origin-center"
                        style={{
                          transform: `scale(${zoomLevel}) rotate(${rotation}deg)`,
                        }}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={activeInvoice.imageUrl}
                          alt="Hóa đơn"
                          className="max-w-full max-h-[600px] object-contain rounded shadow-lg"
                        />
                      </div>
                    ) : (
                      <div className="text-center text-muted-foreground p-8">
                        <Receipt className="size-12 mx-auto mb-2 opacity-30" />
                        <p className="text-xs">Không có ảnh xem trước</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Editable Items Table */}
                <div className="lg:col-span-7 flex flex-col min-h-0 bg-background overflow-hidden">
                  <div className="p-3 border-b bg-muted/10 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-xs">
                        Chi Tiết Hàng Hóa ({activeInvoice.items.length} mặt hàng)
                      </span>
                      <Badge variant="outline" className="text-[10px]">
                        AI: {activeInvoice.modelUsed}
                      </Badge>
                    </div>

                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={addItemToActiveInvoice}
                      className="h-7 text-xs gap-1"
                    >
                      <Plus className="size-3" /> Thêm dòng
                    </Button>
                  </div>

                  {/* Table area */}
                  <div className="flex-1 overflow-y-auto p-3">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="border-b text-muted-foreground font-semibold text-[11px]">
                          <th className="pb-2 w-8 text-center">STT</th>
                          <th className="pb-2 min-w-[200px]">Tên Nguyên Liệu Khớp Kho</th>
                          <th className="pb-2 w-20 text-right">SL Nhập</th>
                          <th className="pb-2 w-16 text-center">ĐVT</th>
                          <th className="pb-2 w-28 text-right">Đơn Giá (đ)</th>
                          <th className="pb-2 w-28 text-right">Thành Tiền (đ)</th>
                          <th className="pb-2 w-8"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/60">
                        {activeInvoice.items.map((item, itemIdx) => {
                          const isMatched = Boolean(item.ingredient_id);
                          return (
                            <tr
                              key={itemIdx}
                              className={`group hover:bg-muted/30 transition-colors ${
                                !isMatched ? "bg-amber-500/5" : ""
                              }`}
                            >
                              <td className="py-2.5 text-center font-mono text-[11px] text-muted-foreground">
                                {itemIdx + 1}
                              </td>

                              {/* Ingredient Picker */}
                              <td className="py-2.5 pr-2">
                                <div className="space-y-1">
                                  <IngredientPicker
                                    ingredients={ingredients}
                                    value={item.ingredient_id || ""}
                                    onSelect={(selectedIng) => {
                                      updateItemInActiveInvoice(itemIdx, (it) => ({
                                        ...it,
                                        ingredient_id: selectedIng.id,
                                        matched_ingredient_name: selectedIng.name,
                                        unit: selectedIng.import_unit || selectedIng.base_unit,
                                        conversion_factor: selectedIng.conversion_factor || 1,
                                        match_confidence: "exact",
                                      }));
                                    }}
                                  />
                                  {item.raw_name && item.raw_name !== item.matched_ingredient_name && (
                                    <p className="text-[10px] text-muted-foreground truncate" title={item.raw_name}>
                                      Tên trên HĐ: <span className="italic">{item.raw_name}</span>
                                    </p>
                                  )}
                                </div>
                              </td>

                              {/* Quantity */}
                              <td className="py-2.5 px-1">
                                <Input
                                  type="number"
                                  step="any"
                                  min="0"
                                  value={item.quantity}
                                  onChange={(e) => {
                                    const val = parseFloat(e.target.value) || 0;
                                    updateItemInActiveInvoice(itemIdx, (it) => ({
                                      ...it,
                                      quantity: val,
                                    }));
                                  }}
                                  className="h-8 text-right text-xs font-mono"
                                />
                              </td>

                              {/* Unit */}
                              <td className="py-2.5 px-1">
                                <Input
                                  type="text"
                                  value={item.unit || "kg"}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    updateItemInActiveInvoice(itemIdx, (it) => ({
                                      ...it,
                                      unit: val,
                                    }));
                                  }}
                                  className="h-8 text-center text-xs"
                                />
                              </td>

                              {/* Unit Price */}
                              <td className="py-2.5 px-1">
                                <Input
                                  type="number"
                                  step="any"
                                  min="0"
                                  value={item.unit_price}
                                  onChange={(e) => {
                                    const val = parseFloat(e.target.value) || 0;
                                    updateItemInActiveInvoice(itemIdx, (it) => ({
                                      ...it,
                                      unit_price: val,
                                    }));
                                  }}
                                  className="h-8 text-right text-xs font-mono"
                                />
                              </td>

                              {/* Line Total */}
                              <td className="py-2.5 pl-1 text-right font-mono font-semibold text-xs text-foreground">
                                {formatVND(item.line_total || item.quantity * item.unit_price)}
                              </td>

                              {/* Delete button */}
                              <td className="py-2.5 text-center">
                                <button
                                  type="button"
                                  onClick={() => removeItemFromActiveInvoice(itemIdx)}
                                  className="opacity-0 group-hover:opacity-100 hover:text-destructive text-muted-foreground p-1 transition-opacity rounded"
                                  title="Xóa dòng"
                                >
                                  <X className="size-3.5" />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Active Invoice Footer Summary */}
                  <div className="p-3 border-t bg-muted/20 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-3">
                      <span className="text-muted-foreground">
                        Mặt hàng: <strong>{activeInvoice.items.length}</strong>
                      </span>
                    </div>

                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <span className="text-muted-foreground mr-2">Tổng tiền phiếu #{activeIndex + 1}:</span>
                        <span className="text-base font-bold text-emerald-700 dark:text-emerald-300 font-mono">
                          {formatVND(activeInvoiceSubtotal)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center p-8 text-muted-foreground">
              Vui lòng chọn một hóa đơn bên trái để kiểm tra.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
