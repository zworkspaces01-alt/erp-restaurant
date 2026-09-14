"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  FileCheck2,
  HelpCircle,
  Maximize2,
  Percent,
  Plus,
  Receipt,
  RotateCw,
  Sparkles,
  Trash2,
  Undo2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { toast } from "sonner";
import { formatNumber, formatVND } from "@/lib/format";
import type {
  InvoiceOcrReviewData,
  MatchedInvoiceItem,
  PaymentMethod,
} from "@/types/restaurant";
import type {
  IngredientPickRow,
  SupplierPickRow,
} from "@/lib/queries/purchases.queries";
import { createPurchaseOrder } from "@/server-actions/purchases.actions";
import { createIngredient } from "@/server-actions/inventory.actions";
import { SubmitButton } from "@/components/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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

interface InvoiceReviewSplitViewProps {
  reviewData: InvoiceOcrReviewData;
  modelUsed: string;
  isMock: boolean;
  suppliers: SupplierPickRow[];
  ingredients: IngredientPickRow[];
  onClose: () => void;
}

export function InvoiceReviewSplitView({
  reviewData,
  modelUsed,
  isMock,
  suppliers,
  ingredients,
  onClose,
}: InvoiceReviewSplitViewProps) {
  const router = useRouter();

  // Review Form States
  const [supplierId, setSupplierId] = useState<string>(reviewData.supplier_id || "");
  const [invoiceNumber, setInvoiceNumber] = useState<string>(reviewData.invoice_number || "");
  const [orderDate, setOrderDate] = useState<string>(reviewData.order_date);
  const [note, setNote] = useState<string>(
    `Nhập tự động qua AI OCR (${modelUsed}). Hóa đơn: ${reviewData.invoice_number || "—"}`
  );
  const [items, setItems] = useState<MatchedInvoiceItem[]>(reviewData.items);
  const [paidNow, setPaidNow] = useState<number>(0);
  const [paidMethod, setPaidMethod] = useState<PaymentMethod>("cash");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  // VAT & Pricing Reconciliation States
  const extractedSubtotal = reviewData.subtotal > 0
    ? reviewData.subtotal
    : reviewData.total_amount - (reviewData.tax_amount || 0);

  const extractedTaxAmount = reviewData.tax_amount > 0
    ? reviewData.tax_amount
    : Math.max(0, reviewData.total_amount - extractedSubtotal);

  const detectedTaxPercent = reviewData.raw_extracted?.tax_percent ?? (
    extractedSubtotal > 0 && extractedTaxAmount > 0
      ? Math.round((extractedTaxAmount / extractedSubtotal) * 100)
      : 0
  );

  const [rawItems] = useState<MatchedInvoiceItem[]>(() =>
    reviewData.items.map((it) => ({ ...it }))
  );
  const [taxPercent, setTaxPercent] = useState<number>(detectedTaxPercent);
  const [isVatAllocated, setIsVatAllocated] = useState<boolean>(false);

  // Allocate VAT into line items so unit prices reflect net cost + tax & match invoice total
  const handleAllocateVat = (percentToApply: number = taxPercent) => {
    const rate = percentToApply > 0 ? percentToApply : 0;
    if (rate <= 0 && extractedTaxAmount <= 0) {
      toast.error("Không có thông tin thuế suất VAT để phân bổ.");
      return;
    }

    const ratio = rate > 0
      ? 1 + rate / 100
      : (extractedSubtotal > 0 ? (extractedSubtotal + extractedTaxAmount) / extractedSubtotal : 1);

    setItems((prev) => {
      let currentSum = 0;
      const updated = prev.map((item) => {
        const newPrice = Math.round(item.unit_price * ratio);
        const newLineTotal = item.quantity * newPrice;
        currentSum += newLineTotal;
        return {
          ...item,
          unit_price: newPrice,
          line_total: newLineTotal,
        };
      });

      // Điều chỉnh làm tròn vào mặt hàng có thành tiền lớn nhất để tổng đúng 100%
      const targetTotal = reviewData.total_amount;
      const diff = targetTotal - currentSum;
      if (Math.abs(diff) > 0 && Math.abs(diff) < 5000 && updated.length > 0) {
        let maxIdx = 0;
        for (let i = 1; i < updated.length; i++) {
          if (updated[i].line_total > updated[maxIdx].line_total) {
            maxIdx = i;
          }
        }
        const target = updated[maxIdx];
        if (target.quantity > 0) {
          const adjustedPrice = Math.round((target.line_total + diff) / target.quantity);
          target.unit_price = adjustedPrice;
          target.line_total = target.quantity * adjustedPrice;
        }
      }

      return updated;
    });

    setIsVatAllocated(true);
    if (rate > 0) setTaxPercent(rate);

    setNote((prev) => {
      const tag = `[Đã gồm VAT ${rate > 0 ? `${rate}%` : ""}]`;
      if (prev.includes(tag)) return prev;
      return `${prev} ${tag}`.trim();
    });

    toast.success(`Đã phân bổ thuế VAT ${rate > 0 ? `${rate}%` : ""} vào đơn giá nguyên liệu!`);
  };

  // Hoàn tác về đơn giá gốc trước thuế
  const handleRevertVat = () => {
    setItems((prev) =>
      prev.map((item, idx) => {
        const raw = rawItems[idx];
        if (!raw) return item;
        return {
          ...item,
          unit_price: raw.unit_price,
          line_total: item.quantity * raw.unit_price,
        };
      })
    );

    setIsVatAllocated(false);
    setNote((prev) => prev.replace(/\s*\[Đã gồm VAT.*?\]/g, "").trim());
    toast.info("Đã khôi phục đơn giá gốc trước thuế (Chưa VAT).");
  };

  // Image Viewer Controls
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [rotation, setRotation] = useState<number>(0);

  const handleZoomIn = () => setZoomLevel((z) => Math.min(z + 0.25, 3));
  const handleZoomOut = () => setZoomLevel((z) => Math.max(z - 0.25, 0.5));
  const handleRotate = () => setRotation((r) => (r + 90) % 360);
  const handleResetView = () => {
    setZoomLevel(1);
    setRotation(0);
  };

  // Line item manipulation
  const handleUpdateItem = (index: number, patch: Partial<MatchedInvoiceItem>) => {
    setItems((prev) => {
      const copy = [...prev];
      const current = { ...copy[index], ...patch };
      current.line_total = current.quantity * current.unit_price;
      copy[index] = current;
      return copy;
    });
  };

  const [currentIngredients, setCurrentIngredients] = useState<IngredientPickRow[]>(ingredients);
  const [isCreatingIngredient, setIsCreatingIngredient] = useState<number | null>(null);

  const handleSelectIngredient = (index: number, ing: IngredientPickRow) => {
    setItems((prev) => {
      const copy = [...prev];
      copy[index] = {
        ...copy[index],
        ingredient_id: ing.id,
        matched_ingredient_name: ing.name,
        unit: ing.import_unit || ing.base_unit,
        conversion_factor: ing.conversion_factor || 1,
        match_confidence: "exact",
      };
      return copy;
    });
  };

  const handleQuickCreateIngredient = async (index: number) => {
    const item = items[index];
    if (!item) return;

    setIsCreatingIngredient(index);
    try {
      const res = await createIngredient({
        name: item.raw_name,
        code: null,
        category: null,
        base_unit: item.unit || "kg",
        import_unit: item.unit || "kg",
        conversion_factor: 1,
        min_alert_stock: 0,
        default_price: item.unit_price || 0,
        default_supplier_id: null,
        is_active: true,
        note: null,
      });

      if (!res.success) {
        toast.error(res.error);
        return;
      }

      const newIng: IngredientPickRow = {
        id: res.data.id,
        name: item.raw_name,
        code: null,
        base_unit: item.unit || "kg",
        import_unit: item.unit || "kg",
        conversion_factor: 1,
        current_stock: 0,
        avg_cost_price: item.unit_price || 0,
        avg_cost_per_import_unit: item.unit_price || 0,
        default_supplier_id: null,
      };

      setCurrentIngredients((prev) => [...prev, newIng]);
      handleSelectIngredient(index, newIng);
      toast.success(`Đã tạo nguyên liệu "${item.raw_name}" vào kho!`);
    } catch {
      toast.error("Lỗi khi tạo nhanh nguyên liệu.");
    } finally {
      setIsCreatingIngredient(null);
    }
  };

  const handleAddItem = () => {
    setItems((prev) => [
      ...prev,
      {
        raw_name: "Nguyên liệu bổ sung",
        quantity: 1,
        unit: "kg",
        unit_price: 0,
        line_total: 0,
        ingredient_id: null,
        matched_ingredient_name: null,
        conversion_factor: 1,
        match_confidence: "unmatched",
      },
    ]);
  };

  const handleDeleteItem = (index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  // Calculate totals
  const calculatedTotal = items.reduce((sum, it) => sum + (it.line_total || 0), 0);
  const isTotalMatched = Math.abs(calculatedTotal - reviewData.total_amount) < 1000;
  const hasUnmatchedItems = items.some((it) => !it.ingredient_id);

  // Submit and Approve
  const handleApproveAndCreate = async () => {
    if (!supplierId) {
      toast.error("Vui lòng chọn Nhà cung cấp trước khi duyệt.");
      return;
    }

    if (items.length === 0) {
      toast.error("Hóa đơn cần ít nhất 1 mặt hàng nguyên liệu.");
      return;
    }

    if (hasUnmatchedItems) {
      toast.error("Có mặt hàng chưa chọn nguyên liệu trong kho. Vui lòng chọn nguyên liệu tương ứng.");
      return;
    }

    setIsSubmitting(true);
    setServerError(null);

    try {
      const payload = {
        supplier_id: supplierId,
        order_date: orderDate,
        due_date: null,
        invoice_number: invoiceNumber || null,
        invoice_image_url: reviewData.image_url || null,
        note: note || null,
        items: items.map((it) => ({
          ingredient_id: it.ingredient_id!,
          quantity: it.quantity,
          unit_price: it.unit_price,
          unit: it.unit || null,
          conversion_factor: it.conversion_factor,
        })),
        paid_now: paidNow,
        paid_method: paidMethod,
      };

      const res = await createPurchaseOrder(payload);

      if (!res.success) {
        setServerError(res.error);
        return;
      }

      toast.success("Đã duyệt và tạo phiếu nhập hàng thành công!");
      onClose();
      router.push(`/purchases/${res.data.id}`);
      router.refresh();
    } catch {
      setServerError("Đã xảy ra lỗi không xác định khi lưu phiếu nhập.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col h-[85vh] max-h-[900px] overflow-hidden">
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-3 border-b bg-muted/40">
        <div className="flex items-center gap-2">
          <FileCheck2 className="size-5 text-emerald-600 dark:text-emerald-400" />
          <h2 className="font-semibold text-base">
            Đối Soát & Duyệt Hóa Đơn Nhập Hàng
          </h2>
          <Badge variant="outline" className="gap-1 text-xs bg-background">
            <Sparkles className="size-3 text-sky-500" />
            {modelUsed}
          </Badge>
          {isMock && (
            <Badge variant="secondary" className="text-xs">
              Chế độ mẫu (Demo)
            </Badge>
          )}
        </div>

        <div className="text-sm text-muted-foreground">
          Vui lòng kiểm tra đối chiếu các trường trước khi nhấn <strong>Duyệt phiếu</strong>.
        </div>
      </div>

      {/* Main Split View */}
      <div className="grid grid-cols-1 lg:grid-cols-12 flex-1 overflow-hidden">
        {/* Left Column: Interactive Image Viewer (5 cols) */}
        <div className="lg:col-span-5 border-r flex flex-col bg-zinc-950/90 text-zinc-100 overflow-hidden relative select-none">
          {/* Viewer Floating Controls */}
          <div className="absolute top-3 left-3 z-10 flex items-center gap-1.5 p-1 bg-zinc-900/80 backdrop-blur-md rounded-md border border-zinc-800 shadow-md">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-7 text-zinc-300 hover:text-white"
              onClick={handleZoomIn}
              title="Phóng to"
            >
              <ZoomIn className="size-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-7 text-zinc-300 hover:text-white"
              onClick={handleZoomOut}
              title="Thu nhỏ"
            >
              <ZoomOut className="size-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-7 text-zinc-300 hover:text-white"
              onClick={handleRotate}
              title="Xoay 90 độ"
            >
              <RotateCw className="size-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-7 text-zinc-300 hover:text-white"
              onClick={handleResetView}
              title="Đặt lại góc nhìn"
            >
              <Maximize2 className="size-4" />
            </Button>
            <span className="text-[11px] px-1 font-mono text-zinc-400">
              {Math.round(zoomLevel * 100)}%
            </span>
          </div>

          {/* Image Canvas Container */}
          <div className="flex-1 overflow-auto flex items-center justify-center p-4">
            {reviewData.image_url && reviewData.image_url !== "/sample-invoice.png" ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={reviewData.image_url}
                alt="Ảnh hóa đơn gốc"
                style={{
                  transform: `scale(${zoomLevel}) rotate(${rotation}deg)`,
                  transformOrigin: "center center",
                  transition: "transform 0.15s ease-out",
                }}
                className="max-w-full max-h-full object-contain rounded shadow-lg"
              />
            ) : (
              <div
                style={{
                  transform: `scale(${zoomLevel}) rotate(${rotation}deg)`,
                  transition: "transform 0.15s ease-out",
                }}
                className="w-full max-w-md bg-white text-zinc-900 p-6 rounded-lg shadow-xl font-sans text-xs border border-zinc-200"
              >
                <div className="border-b pb-3 mb-3 text-center">
                  <h3 className="font-bold text-sm tracking-wide uppercase">
                    {reviewData.supplier_name_raw || "HÓA ĐƠN BÁN HÀNG"}
                  </h3>
                  <p className="text-[11px] text-zinc-500">Phiếu Xuất Kho & Bàn Giao Hàng Hóa</p>
                  <p className="text-[10px] text-zinc-400 mt-1">
                    Số HĐ: {reviewData.invoice_number || "HD-DEMO-001"} · Ngày: {reviewData.order_date}
                  </p>
                </div>
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-zinc-300 font-semibold">
                      <th className="py-1">Mặt hàng</th>
                      <th className="py-1 text-center">SL</th>
                      <th className="py-1 text-right">Đơn giá</th>
                      <th className="py-1 text-right">Thành tiền</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reviewData.items.map((it, idx) => (
                      <tr key={idx} className="border-b border-zinc-100">
                        <td className="py-1.5">{it.raw_name}</td>
                        <td className="py-1.5 text-center">
                          {it.quantity} {it.unit}
                        </td>
                        <td className="py-1.5 text-right">{formatNumber(it.unit_price)}</td>
                        <td className="py-1.5 text-right font-medium">
                          {formatNumber(it.line_total)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="mt-4 pt-2 border-t text-right space-y-0.5">
                  <div className="flex justify-between font-bold text-sm text-emerald-700">
                    <span>Tổng tiền thanh toán:</span>
                    <span>{formatVND(reviewData.total_amount)}</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Pre-filled Review & Approval Form (7 cols) */}
        <div className="lg:col-span-7 flex flex-col overflow-hidden bg-background">
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {serverError && (
              <div className="p-3 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md">
                {serverError}
              </div>
            )}

            {/* Supplier & Invoice Meta Section */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 rounded-lg border bg-muted/20">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="supplier_id" className="text-xs font-semibold">
                    Nhà cung cấp <span className="text-destructive">*</span>
                  </Label>
                  {reviewData.supplier_match_confidence === "exact" ? (
                    <Badge variant="outline" className="text-[10px] text-emerald-600 dark:text-emerald-400 gap-1">
                      <CheckCircle2 className="size-2.5" /> Khớp chính xác
                    </Badge>
                  ) : reviewData.supplier_match_confidence === "partial" ? (
                    <Badge variant="outline" className="text-[10px] text-amber-600 dark:text-amber-400 gap-1">
                      <HelpCircle className="size-2.5" /> Gợi ý khớp
                    </Badge>
                  ) : (
                    <Badge variant="destructive" className="text-[10px]">
                      Chưa khớp NCC
                    </Badge>
                  )}
                </div>

                <Select value={supplierId} onValueChange={setSupplierId}>
                  <SelectTrigger id="supplier_id">
                    <SelectValue placeholder="-- Chọn nhà cung cấp --" />
                  </SelectTrigger>
                  <SelectContent>
                    {suppliers.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name} {s.code ? `(${s.code})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {reviewData.supplier_name_raw && (
                  <p className="text-[11px] text-muted-foreground truncate">
                    Tên trên HĐ: <span className="font-medium">{reviewData.supplier_name_raw}</span>
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="invoice_number" className="text-xs font-semibold">
                  Số hóa đơn / Chứng từ
                </Label>
                <Input
                  id="invoice_number"
                  value={invoiceNumber}
                  onChange={(e) => setInvoiceNumber(e.target.value)}
                  placeholder="Vd: HD-2026-001"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="order_date" className="text-xs font-semibold">
                  Ngày nhập hàng
                </Label>
                <Input
                  id="order_date"
                  type="date"
                  value={orderDate}
                  onChange={(e) => setOrderDate(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="note" className="text-xs font-semibold">
                  Ghi chú phiếu
                </Label>
                <Input
                  id="note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Ghi chú thêm..."
                />
              </div>
            </div>

            {/* Line Items Table */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold">Chi tiết nguyên liệu ({items.length} dòng)</h3>
                  <p className="text-xs text-muted-foreground">
                    Kiểm tra nguyên liệu trong kho được gán và hệ số quy đổi.
                  </p>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={handleAddItem} className="gap-1 text-xs">
                  <Plus className="size-3.5" />
                  Thêm dòng
                </Button>
              </div>

              <div className="border rounded-lg overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-muted/50 border-b">
                    <tr>
                      <th className="p-2.5 min-w-[160px]">Tên trên hóa đơn</th>
                      <th className="p-2.5 min-w-[200px]">Nguyên liệu trong kho</th>
                      <th className="p-2.5 text-center w-[80px]">SL</th>
                      <th className="p-2.5 w-[80px]">Đơn vị</th>
                      <th className="p-2.5 text-right min-w-[100px]">Đơn giá</th>
                      <th className="p-2.5 text-center w-[70px]" title="Hệ số quy đổi về đơn vị gốc của kho">
                        Hệ số
                      </th>
                      <th className="p-2.5 text-right min-w-[110px]">Thành tiền</th>
                      <th className="p-2.5 w-[40px]"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {items.map((item, idx) => {
                      const isMatched = Boolean(item.ingredient_id);
                      return (
                        <tr
                          key={idx}
                          className={!isMatched ? "bg-amber-500/10 dark:bg-amber-950/20" : undefined}
                        >
                          <td className="p-2">
                            <Input
                              value={item.raw_name}
                              onChange={(e) => handleUpdateItem(idx, { raw_name: e.target.value })}
                              className="h-8 text-xs font-medium"
                            />
                          </td>
                          <td className="p-2">
                            <div className="space-y-1">
                              <IngredientPicker
                                ingredients={currentIngredients}
                                value={item.ingredient_id ?? ""}
                                onSelect={(ing) => handleSelectIngredient(idx, ing)}
                              />
                              {!isMatched && (
                                <div className="flex items-center justify-between gap-1 pt-0.5">
                                  <span className="flex items-center gap-1 text-[10px] text-amber-600 dark:text-amber-400">
                                    <AlertTriangle className="size-3 shrink-0" /> Chưa chọn NL
                                  </span>
                                  <button
                                    type="button"
                                    disabled={isCreatingIngredient === idx}
                                    onClick={() => void handleQuickCreateIngredient(idx)}
                                    className="text-[10px] text-emerald-600 hover:text-emerald-700 hover:underline font-medium whitespace-nowrap"
                                  >
                                    {isCreatingIngredient === idx ? "Đang tạo..." : "+ Tạo mới NL"}
                                  </button>
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="p-2">
                            <Input
                              type="number"
                              step="any"
                              value={item.quantity}
                              onChange={(e) =>
                                handleUpdateItem(idx, { quantity: Math.max(0, Number(e.target.value)) })
                              }
                              className="h-8 text-xs text-center tabular-nums"
                            />
                          </td>
                          <td className="p-2">
                            <Input
                              value={item.unit}
                              onChange={(e) => handleUpdateItem(idx, { unit: e.target.value })}
                              className="h-8 text-xs text-center"
                            />
                          </td>
                          <td className="p-2">
                            <Input
                              type="number"
                              value={item.unit_price}
                              onChange={(e) =>
                                handleUpdateItem(idx, { unit_price: Math.max(0, Number(e.target.value)) })
                              }
                              className="h-8 text-xs text-right tabular-nums"
                            />
                          </td>
                          <td className="p-2">
                            <Input
                              type="number"
                              step="any"
                              value={item.conversion_factor}
                              onChange={(e) =>
                                handleUpdateItem(idx, {
                                  conversion_factor: Math.max(0.001, Number(e.target.value)),
                                })
                              }
                              className="h-8 text-xs text-center tabular-nums"
                              title="1 Đơn vị mua = ? Đơn vị cơ sở của kho"
                            />
                          </td>
                          <td className="p-2 text-right font-medium tabular-nums">
                            {formatVND(item.line_total)}
                          </td>
                          <td className="p-2 text-center">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="size-7 text-muted-foreground hover:text-destructive"
                              onClick={() => handleDeleteItem(idx)}
                            >
                              <Trash2 className="size-3.5" />
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Reconciliation and Payment Details */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 rounded-lg border bg-muted/10">
              {/* Payment Allocation */}
              <div className="space-y-3">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Thanh Toán Hóa Đơn
                </h4>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="paid_now" className="text-xs">
                      Thanh toán ngay (VNĐ)
                    </Label>
                    <Input
                      id="paid_now"
                      type="number"
                      value={paidNow}
                      onChange={(e) => setPaidNow(Math.max(0, Number(e.target.value)))}
                      className="h-9 text-xs"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="paid_method" className="text-xs">
                      Hình thức
                    </Label>
                    <Select
                      value={paidMethod}
                      onValueChange={(v) => setPaidMethod(v as PaymentMethod)}
                    >
                      <SelectTrigger id="paid_method" className="h-9 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="cash">Tiền mặt</SelectItem>
                        <SelectItem value="bank_transfer">Chuyển khoản</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Số tiền còn lại sẽ được tính vào <strong>Công nợ nhà cung cấp</strong>.
                </p>
              </div>

              {/* Total Reconciliation & VAT Handling */}
              <div className="space-y-2.5 border-t md:border-t-0 md:border-l md:pl-4 pt-3 md:pt-0">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <Receipt className="size-3.5 text-primary" />
                    Đối Chiếu Số Liệu & Thuế VAT
                  </h4>
                  {extractedTaxAmount > 0 && (
                    <Badge variant={isVatAllocated ? "default" : "secondary"} className="text-[10px] gap-1">
                      <Percent className="size-2.5" />
                      {taxPercent > 0 ? `VAT ${taxPercent}%` : "Có thuế GTGT"}
                    </Badge>
                  )}
                </div>

                {/* Detailed breakdown */}
                <div className="space-y-1 text-xs">
                  <div className="flex justify-between py-0.5 text-muted-foreground">
                    <span>Tiền hàng (chưa thuế):</span>
                    <span className="font-medium text-foreground">{formatVND(extractedSubtotal)}</span>
                  </div>

                  {(extractedTaxAmount > 0 || taxPercent > 0) && (
                    <div className="flex justify-between py-0.5 text-muted-foreground">
                      <span>Thuế GTGT ({taxPercent > 0 ? `${taxPercent}%` : "VAT"}):</span>
                      <span className="font-medium text-amber-600 dark:text-amber-400">
                        +{formatVND(extractedTaxAmount)}
                      </span>
                    </div>
                  )}

                  <div className="flex justify-between py-1 border-t font-semibold">
                    <span>Tổng hóa đơn thanh toán:</span>
                    <span className="text-primary">{formatVND(reviewData.total_amount)}</span>
                  </div>

                  <div className="flex justify-between py-0.5 text-muted-foreground">
                    <span>Tổng tính theo bảng kho:</span>
                    <span className="font-bold text-foreground">{formatVND(calculatedTotal)}</span>
                  </div>
                </div>

                {/* VAT Allocation Controls */}
                {(extractedTaxAmount > 0 || taxPercent > 0 || reviewData.total_amount > calculatedTotal) && (
                  <div className="pt-2 border-t space-y-2">
                    {!isVatAllocated ? (
                      <div className="p-2.5 rounded-md bg-amber-500/10 border border-amber-500/20 space-y-2">
                        <div className="text-[11px] text-amber-800 dark:text-amber-300 leading-relaxed">
                          Đơn giá trên hóa đơn đang là <strong>giá chưa VAT</strong>. Bạn có thể phân bổ thuế vào đơn giá để khớp 100% công nợ NCC và tính đúng giá vốn món ăn.
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Button
                            type="button"
                            size="sm"
                            variant="default"
                            onClick={() => handleAllocateVat(taxPercent || 8)}
                            className="h-7 text-xs gap-1 bg-amber-600 hover:bg-amber-700 text-white"
                          >
                            <Percent className="size-3" />
                            Phân bổ VAT {taxPercent > 0 ? `(${taxPercent}%)` : ""} vào đơn giá
                          </Button>

                          {taxPercent !== 8 && taxPercent !== 10 && (
                            <>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() => handleAllocateVat(8)}
                                className="h-7 text-[11px] px-2"
                              >
                                +8% VAT
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() => handleAllocateVat(10)}
                                className="h-7 text-[11px] px-2"
                              >
                                +10% VAT
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="p-2.5 rounded-md bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-400 font-medium">
                          <CheckCircle2 className="size-4 shrink-0" />
                          <span>Đã phân bổ VAT {taxPercent}% vào đơn giá kho</span>
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={handleRevertVat}
                          className="h-7 text-xs text-muted-foreground hover:text-foreground gap-1"
                        >
                          <Undo2 className="size-3" />
                          Giá chưa VAT
                        </Button>
                      </div>
                    )}
                  </div>
                )}

                {/* Match Status indicator */}
                <div className="pt-1">
                  {isTotalMatched ? (
                    <div className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                      <CheckCircle2 className="size-4" />
                      Số tiền khớp hoàn toàn với hóa đơn
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400 font-medium">
                      <AlertTriangle className="size-4" />
                      Lệch {formatVND(Math.abs(calculatedTotal - reviewData.total_amount))} so với hóa đơn
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="flex flex-wrap items-center justify-between gap-3 p-4 border-t bg-muted/30">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Hủy / Đóng
            </Button>

            <div className="flex items-center gap-2">
              <SubmitButton
                size="sm"
                pending={isSubmitting}
                pendingText="Đang lưu phiếu..."
                disabled={items.length === 0 || hasUnmatchedItems || !supplierId}
                onClick={() => void handleApproveAndCreate()}
                className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                <CheckCircle2 className="size-4" />
                Duyệt & Tạo Phiếu Nhập ({formatVND(calculatedTotal)})
              </SubmitButton>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
