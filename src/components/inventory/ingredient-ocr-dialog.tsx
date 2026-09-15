"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Building2,
  Camera,
  CheckCircle2,
  FileSpreadsheet,
  FileX2,
  Hash,
  MapPin,
  Maximize2,
  Package,
  Phone,
  Plus,
  RotateCw,
  ScanLine,
  Sparkles,
  Trash2,
  UploadCloud,
  User,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { toast } from "sonner";
import { formatNumber } from "@/lib/format";
import type { IngredientOcrResult, IngredientParsedItem } from "@/lib/ai/ingredient-ocr";
import { extractIngredientsFromImageAction } from "@/server-actions/ingredient-ocr.actions";
import { importIngredients } from "@/server-actions/inventory.actions";
import { SubmitButton } from "@/components/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface IngredientOcrDialogProps {
  trigger?: React.ReactNode;
  categoryOptions?: string[];
}

export function IngredientOcrDialog({
  trigger,
  categoryOptions = [],
}: IngredientOcrDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [duplicateMode, setDuplicateMode] = useState<"skip" | "update">("skip");

  // Result state
  const [ocrResult, setOcrResult] = useState<IngredientOcrResult | null>(null);
  const [items, setItems] = useState<IngredientParsedItem[]>([]);

  // Viewer state
  const [zoomLevel, setZoomLevel] = useState(1);
  const [rotation, setRotation] = useState(0);

  const resetState = () => {
    setIsScanning(false);
    setIsSubmitting(false);
    setOcrResult(null);
    setItems([]);
    setZoomLevel(1);
    setRotation(0);
  };

  const handleFileUpload = async (file: File) => {
    const isImage =
      file.type.startsWith("image/") ||
      /\.(jpg|jpeg|png|webp|heic|heif|bmp|tiff)$/i.test(file.name);

    if (!isImage) {
      toast.error("Vui lòng chọn file hình ảnh (PNG, JPG, WEBP, HEIC).");
      return;
    }

    setIsScanning(true);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await extractIngredientsFromImageAction(formData);

      if (!res.success) {
        toast.error(res.error);
        setIsScanning(false);
        return;
      }

      setOcrResult(res.data);
      setItems(res.data.items);
      toast.success(
        `Đã trích xuất thành công ${res.data.items.length} nguyên liệu từ ảnh!`
      );
      if (res.data.duplicates_removed && res.data.duplicates_removed.length > 0) {
        toast.warning(
          `Đã phát hiện và tự động loại bỏ ${res.data.duplicates_removed.length} nguyên liệu trùng lặp (nhập sau): ${res.data.duplicates_removed.join(", ")}`,
          { duration: 6000 }
        );
      }
      if (res.data.excluded_items && res.data.excluded_items.length > 0) {
        toast.info(
          `AI đã nhận diện và tự động loại bỏ ${res.data.excluded_items.length} mặt hàng bị gạch tay trên phiếu: ${res.data.excluded_items.join(", ")}`,
          { duration: 7000 }
        );
      }
    } catch (err: unknown) {
      console.error("Lỗi scan ảnh nguyên liệu:", err);
      const msg =
        err instanceof Error
          ? err.message
          : "Không thể xử lý ảnh nguyên liệu. Vui lòng thử lại hoặc chụp cận cảnh hơn.";
      toast.error(msg);
    } finally {
      setIsScanning(false);
    }
  };

  const handleDemoScan = async () => {
    setIsScanning(true);
    try {
      const formData = new FormData();
      formData.append("is_demo", "true");

      const res = await extractIngredientsFromImageAction(formData);

      if (!res.success) {
        toast.error(res.error);
        setIsScanning(false);
        return;
      }

      setOcrResult(res.data);
      setItems(res.data.items);
      toast.success("Đã nạp mẫu bảng giá nguyên liệu mẫu!");
    } catch {
      toast.error("Lỗi khi nạp bảng giá mẫu.");
    } finally {
      setIsScanning(false);
    }
  };

  const handleUpdateItem = (index: number, patch: Partial<IngredientParsedItem>) => {
    setItems((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], ...patch };
      return copy;
    });
  };

  const handleAddItem = () => {
    setItems((prev) => [
      ...prev,
      {
        code: `NL-${String(prev.length + 1).padStart(3, "0")}`,
        name: "Nguyên liệu mới",
        category: categoryOptions[0] || "Gia vị",
        base_unit: "kg",
        import_unit: "kg",
        conversion_factor: 1,
        min_alert_stock: 0,
        default_price: 0,
        default_supplier_id: null,
        is_active: true,
        note: null,
      },
    ]);
  };

  const handleDeleteItem = (index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSaveToInventory = async () => {
    if (items.length === 0) {
      toast.error("Không có nguyên liệu nào để lưu.");
      return;
    }

    const invalid = items.find((it) => !it.name.trim() || !it.base_unit.trim());
    if (invalid) {
      toast.error("Vui lòng điền đầy đủ Tên nguyên liệu và Đơn vị cơ sở.");
      return;
    }

    setIsSubmitting(true);

    try {
      const payload = items.map((it) => ({
        code: it.code || null,
        name: it.name.trim(),
        category: it.category || null,
        base_unit: it.base_unit.trim(),
        import_unit: it.import_unit?.trim() || it.base_unit.trim(),
        conversion_factor: Number(it.conversion_factor) || 1,
        min_alert_stock: Number(it.min_alert_stock) || 0,
        default_price: Number(it.default_price) || 0,
        default_supplier_id: it.default_supplier_id || ocrResult?.supplier_id || null,
        is_active: true,
        note: it.note || null,
      }));

      const supplierInfo = (ocrResult?.supplier || ocrResult?.matched_supplier_name) ? {
        id: ocrResult.supplier_id || null,
        name: ocrResult.matched_supplier_name || ocrResult.supplier?.name || null,
        tax_code: ocrResult.supplier?.tax_code || null,
        phone: ocrResult.supplier?.phone || null,
        address: ocrResult.supplier?.address || null,
        contact_name: ocrResult.supplier?.contact_name || null,
      } : null;

      const res = await importIngredients(payload, duplicateMode, supplierInfo);

      if (!res.success) {
        toast.error(res.error);
        return;
      }

      const linkedSupName = res.data.supplier_name || ocrResult?.matched_supplier_name || ocrResult?.supplier?.name;

      toast.success(
        `Đã lưu thành công ${res.data.inserted} nguyên liệu mới${
          res.data.updated ? `, cập nhật ${res.data.updated}` : ""
        }${res.data.skipped ? `, bỏ qua ${res.data.skipped} trùng mã` : ""}${
          linkedSupName ? ` và tự động liên kết vào danh mục NCC "${linkedSupName}"` : ""
        }!`
      );

      setOpen(false);
      resetState();
      router.refresh();
    } catch {
      toast.error("Lỗi khi lưu nguyên liệu vào kho.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) resetState();
      }}
    >
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" size="sm" className="gap-1.5">
            <Camera className="size-4 text-emerald-600 dark:text-emerald-400" />
            <span>Quét ảnh nguyên liệu</span>
            <Badge
              variant="secondary"
              className="text-[10px] px-1 py-0 bg-emerald-500/10 text-emerald-600 font-semibold"
            >
              AI
            </Badge>
          </Button>
        )}
      </DialogTrigger>

      <DialogContent
        className={
          ocrResult
            ? "sm:max-w-[95vw] lg:max-w-[92vw] xl:max-w-[1360px] w-full max-h-[92vh] p-0 overflow-hidden flex flex-col shadow-2xl rounded-2xl border"
            : "sm:max-w-2xl w-full p-0 overflow-hidden rounded-2xl"
        }
      >
        {!ocrResult ? (
          <>
            <DialogHeader className="p-6 pb-2">
              <div className="flex items-center gap-2">
                <div className="size-9 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-600">
                  <ScanLine className="size-5" />
                </div>
                <div>
                  <DialogTitle className="flex items-center gap-2">
                    Quét Ảnh Bảng Giá & Danh Mục Nguyên Liệu
                    <Badge variant="outline" className="text-xs gap-1">
                      <Sparkles className="size-3 text-amber-500" /> Groq Vision
                    </Badge>
                  </DialogTitle>
                  <DialogDescription className="text-xs">
                    Chụp hoặc tải lên ảnh bảng báo giá, bảng kê giao hàng hoặc danh mục nguyên liệu từ NCC để tự động trích xuất vào kho.
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>

            <div className="p-6 pt-2 space-y-4">
              {isScanning ? (
                <div className="py-12 flex flex-col items-center justify-center space-y-3 text-center">
                  <div className="relative">
                    <div className="size-14 rounded-full border-4 border-emerald-500/20 border-t-emerald-600 animate-spin" />
                    <Sparkles className="size-6 text-emerald-600 absolute inset-0 m-auto animate-pulse" />
                  </div>
                  <div className="space-y-1">
                    <p className="font-semibold text-sm">
                      AI Vision đang phân tích ảnh nguyên liệu...
                    </p>
                    <p className="text-xs text-muted-foreground max-w-sm">
                      Đang nhận diện tên mặt hàng, đơn vị mua, đơn vị dùng, hệ số quy đổi và đơn giá dự kiến.
                    </p>
                  </div>
                </div>
              ) : (
                <>
                  {/* Upload Dropzone */}
                  <label
                    htmlFor="ingredient_file_upload"
                    className="border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center gap-3 cursor-pointer hover:border-emerald-500/50 hover:bg-emerald-500/5 transition-colors text-center"
                  >
                    <div className="size-12 rounded-full bg-muted flex items-center justify-center text-muted-foreground">
                      <UploadCloud className="size-6" />
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm font-medium">
                        Kéo thả file ảnh hoặc{" "}
                        <span className="text-emerald-600 hover:underline">
                          chọn từ thiết bị
                        </span>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Hỗ trợ PNG, JPG, WEBP (bảng báo giá, hóa đơn, bảng kê hàng hóa, nhãn bao bì)
                      </p>
                    </div>
                    <input
                      id="ingredient_file_upload"
                      type="file"
                      accept="image/*"
                      className="sr-only"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) void handleFileUpload(file);
                      }}
                    />
                  </label>

                  {/* Demo option */}
                  <div className="p-3 bg-muted/40 rounded-lg border flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <FileSpreadsheet className="size-4 text-emerald-600" />
                      <div className="text-xs">
                        <span className="font-medium">Chưa có sẵn ảnh?</span>
                        <span className="text-muted-foreground ml-1">
                          Thử nghiệm ngay với bảng giá mẫu F&B.
                        </span>
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => void handleDemoScan()}
                      className="h-7 text-xs"
                    >
                      Nạp bảng giá mẫu
                    </Button>
                  </div>
                </>
              )}
            </div>
          </>
        ) : (
          /* Split View Review & Save */
          <div className="flex flex-col h-[88vh] max-h-[850px]">
            {/* Header */}
            <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-3 border-b bg-muted/40">
              <div className="flex items-center gap-2">
                <Package className="size-5 text-emerald-600" />
                <h3 className="font-semibold text-sm">
                  Đối Soát Nguyên Liệu Trích Xuất ({items.length} mặt hàng)
                </h3>
                <Badge variant="outline" className="text-xs gap-1">
                  <Sparkles className="size-3 text-sky-500" />
                  {ocrResult.model_used}
                </Badge>
              </div>
              <div className="text-xs text-muted-foreground">
                Kiểm tra thông tin trước khi lưu vào kho nguyên liệu.
              </div>
            </div>

            {/* Main Split Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-12 flex-1 overflow-hidden">
              {/* Left Column: Image Viewer (4 cols) */}
              <div className="lg:col-span-4 border-r flex flex-col bg-zinc-950/90 text-zinc-100 overflow-hidden relative select-none">
                <div className="absolute top-3 left-3 z-10 flex items-center gap-1.5 p-1 bg-zinc-900/80 backdrop-blur-md rounded-md border border-zinc-800 shadow-md">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-7 text-zinc-300 hover:text-white"
                    onClick={() => setZoomLevel((z) => Math.min(z + 0.25, 3))}
                    title="Phóng to"
                  >
                    <ZoomIn className="size-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-7 text-zinc-300 hover:text-white"
                    onClick={() => setZoomLevel((z) => Math.max(z - 0.25, 0.5))}
                    title="Thu nhỏ"
                  >
                    <ZoomOut className="size-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-7 text-zinc-300 hover:text-white"
                    onClick={() => setRotation((r) => (r + 90) % 360)}
                    title="Xoay"
                  >
                    <RotateCw className="size-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-7 text-zinc-300 hover:text-white"
                    onClick={() => {
                      setZoomLevel(1);
                      setRotation(0);
                    }}
                    title="Mặc định"
                  >
                    <Maximize2 className="size-4" />
                  </Button>
                  <span className="text-[11px] px-1 font-mono text-zinc-400">
                    {Math.round(zoomLevel * 100)}%
                  </span>
                </div>

                <div className="flex-1 overflow-auto flex items-center justify-center p-4">
                  {ocrResult.image_url && ocrResult.image_url !== "/sample-ingredient-list.png" ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={ocrResult.image_url}
                      alt="Ảnh bảng giá gốc"
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
                      className="w-full max-w-sm bg-white text-zinc-900 p-5 rounded-lg shadow-xl font-sans text-xs border border-zinc-200"
                    >
                      <div className="border-b pb-2 mb-3 text-center">
                        <h4 className="font-bold uppercase tracking-wider text-xs">
                          {ocrResult.source_title || "BẢNG BÁO GIÁ NGUYÊN LIỆU"}
                        </h4>
                        <p className="text-[10px] text-zinc-500">Danh mục nhà cung cấp đề xuất</p>
                      </div>
                      <table className="w-full text-left text-[11px]">
                        <thead>
                          <tr className="border-b font-semibold">
                            <th className="py-1">Mặt hàng</th>
                            <th className="py-1">Quy cách</th>
                            <th className="py-1 text-right">Đơn giá</th>
                          </tr>
                        </thead>
                        <tbody>
                          {items.map((it, i) => (
                            <tr key={i} className="border-b border-zinc-100">
                              <td className="py-1 font-medium">{it.name}</td>
                              <td className="py-1 text-zinc-500">
                                1 {it.import_unit} = {it.conversion_factor} {it.base_unit}
                              </td>
                              <td className="py-1 text-right">{formatNumber(it.default_price || 0)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>

              {/* Right Column: Editable Table (8 cols) */}
              <div className="lg:col-span-8 flex flex-col overflow-hidden bg-background">
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                  {/* Supplier Info Card (Auto-detected & linked) */}
                  {(ocrResult?.supplier?.name || ocrResult?.matched_supplier_name) && (
                    <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <div className="size-7 rounded-md bg-emerald-500/10 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shrink-0">
                            <Building2 className="size-4" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-xs font-semibold text-foreground">
                                {ocrResult.matched_supplier_name || ocrResult.supplier?.name}
                              </span>
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-emerald-500/30 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 gap-1 font-medium">
                                <CheckCircle2 className="size-2.5" /> Tự động liên kết NCC
                              </Badge>
                            </div>
                            <p className="text-[11px] text-muted-foreground">
                              Tất cả nguyên liệu trong bảng sẽ được gán mặc định cho nhà cung cấp này trong hệ thống
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1 border-t border-emerald-500/10 text-xs">
                        {ocrResult.supplier?.tax_code && (
                          <div className="flex items-center gap-1.5 text-muted-foreground">
                            <Hash className="size-3.5 text-emerald-600 shrink-0" />
                            <span>MST: <strong className="text-foreground font-medium">{ocrResult.supplier.tax_code}</strong></span>
                          </div>
                        )}
                        {ocrResult.supplier?.phone && (
                          <div className="flex items-center gap-1.5 text-muted-foreground">
                            <Phone className="size-3.5 text-emerald-600 shrink-0" />
                            <span>SĐT: <strong className="text-foreground font-medium">{ocrResult.supplier.phone}</strong></span>
                          </div>
                        )}
                        {ocrResult.supplier?.contact_name && (
                          <div className="flex items-center gap-1.5 text-muted-foreground">
                            <User className="size-3.5 text-emerald-600 shrink-0" />
                            <span>Liên hệ: <strong className="text-foreground font-medium">{ocrResult.supplier.contact_name}</strong></span>
                          </div>
                        )}
                        {ocrResult.supplier?.address && (
                          <div className="flex items-center gap-1.5 text-muted-foreground sm:col-span-3">
                            <MapPin className="size-3.5 text-emerald-600 shrink-0" />
                            <span className="truncate">Địa chỉ: <strong className="text-foreground font-medium">{ocrResult.supplier.address}</strong></span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Cảnh báo nguyên liệu trùng lặp đã tự động loại bỏ */}
                  {ocrResult.duplicates_removed && ocrResult.duplicates_removed.length > 0 && (
                    <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 flex items-start gap-2.5 text-xs text-amber-900 dark:text-amber-200">
                      <AlertTriangle className="size-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                      <div className="space-y-0.5">
                        <p className="font-semibold">
                          Đã tự động loại bỏ {ocrResult.duplicates_removed.length} nguyên liệu trùng lặp (nhập sau):
                        </p>
                        <p className="text-[11px] opacity-90 leading-relaxed">
                          {ocrResult.duplicates_removed.join(", ")}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Thông báo các mặt hàng bị gạch tay trên phiếu đã tự động loại bỏ */}
                  {ocrResult.excluded_items && ocrResult.excluded_items.length > 0 && (
                    <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 flex items-start gap-2.5 text-xs text-rose-900 dark:text-rose-200">
                      <FileX2 className="size-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
                      <div className="space-y-0.5">
                        <p className="font-semibold">
                          Phát hiện {ocrResult.excluded_items.length} mặt hàng bị gạch tay trên phiếu (hàng hủy / không nhận - đã tự động loại bỏ):
                        </p>
                        <p className="text-[11px] opacity-90 leading-relaxed font-mono">
                          {ocrResult.excluded_items.join(", ")}
                        </p>
                      </div>
                    </div>
                  )}

                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Danh Sách Nguyên Liệu Sẽ Nhập
                      </h4>
                      <p className="text-[11px] text-muted-foreground">
                        Bạn có thể sửa trực tiếp tên, đơn vị, hệ số quy đổi hoặc thêm/xóa dòng.
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleAddItem}
                      className="gap-1 text-xs h-8"
                    >
                      <Plus className="size-3.5" /> Thêm dòng
                    </Button>
                  </div>

                  <div className="border rounded-lg overflow-x-auto">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-muted/50 border-b">
                        <tr>
                          <th className="p-2 min-w-[150px]">Tên nguyên liệu</th>
                          <th className="p-2 min-w-[110px]">Mã gợi ý</th>
                          <th className="p-2 min-w-[120px]">Danh mục</th>
                          <th className="p-2 min-w-[70px]">ĐV cơ sở</th>
                          <th className="p-2 min-w-[70px]">ĐV nhập</th>
                          <th className="p-2 text-center min-w-[70px]" title="1 Đơn vị nhập = ? Đơn vị cơ sở">
                            Hệ số
                          </th>
                          <th className="p-2 text-right min-w-[95px]">Giá nhập (VNĐ)</th>
                          <th className="p-2 text-center min-w-[75px]" title="Cảnh báo tồn tối thiểu">
                            Tồn min
                          </th>
                          <th className="p-2 w-[40px]"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {items.map((it, idx) => (
                          <tr key={idx}>
                            <td className="p-1.5">
                              <Input
                                value={it.name}
                                onChange={(e) => handleUpdateItem(idx, { name: e.target.value })}
                                className="h-7 text-xs font-medium"
                                placeholder="Tên nguyên liệu"
                              />
                            </td>
                            <td className="p-1.5">
                              <Input
                                value={it.code || ""}
                                onChange={(e) => handleUpdateItem(idx, { code: e.target.value })}
                                className="h-7 text-xs font-mono"
                                placeholder="NL-..."
                              />
                            </td>
                            <td className="p-1.5">
                              <Input
                                value={it.category || ""}
                                onChange={(e) => handleUpdateItem(idx, { category: e.target.value })}
                                className="h-7 text-xs"
                                placeholder="Danh mục..."
                              />
                            </td>
                            <td className="p-1.5">
                              <Input
                                value={it.base_unit}
                                onChange={(e) => handleUpdateItem(idx, { base_unit: e.target.value })}
                                className="h-7 text-xs text-center"
                                placeholder="kg, g..."
                              />
                            </td>
                            <td className="p-1.5">
                              <Input
                                value={it.import_unit}
                                onChange={(e) => handleUpdateItem(idx, { import_unit: e.target.value })}
                                className="h-7 text-xs text-center"
                                placeholder="thùng..."
                              />
                            </td>
                            <td className="p-1.5">
                              <Input
                                type="number"
                                step="any"
                                value={it.conversion_factor}
                                onChange={(e) =>
                                  handleUpdateItem(idx, {
                                    conversion_factor: Math.max(0.001, Number(e.target.value)),
                                  })
                                }
                                className="h-7 text-xs text-center tabular-nums"
                              />
                            </td>
                            <td className="p-1.5">
                              <Input
                                type="number"
                                value={it.default_price || 0}
                                onChange={(e) =>
                                  handleUpdateItem(idx, {
                                    default_price: Math.max(0, Number(e.target.value)),
                                  })
                                }
                                className="h-7 text-xs text-right tabular-nums"
                              />
                            </td>
                            <td className="p-1.5">
                              <Input
                                type="number"
                                step="any"
                                value={it.min_alert_stock || 0}
                                onChange={(e) =>
                                  handleUpdateItem(idx, {
                                    min_alert_stock: Math.max(0, Number(e.target.value)),
                                  })
                                }
                                className="h-7 text-xs text-center tabular-nums"
                              />
                            </td>
                            <td className="p-1.5 text-center">
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="size-6 text-muted-foreground hover:text-destructive"
                                onClick={() => handleDeleteItem(idx)}
                              >
                                <Trash2 className="size-3.5" />
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Settings / Deduplication mode */}
                  <div className="p-3 bg-muted/20 border rounded-lg flex flex-wrap items-center justify-between gap-3 text-xs">
                    <div className="flex items-center gap-2">
                      <Label htmlFor="dup_mode" className="text-xs font-medium">
                        Nếu mã nguyên liệu đã có sẵn:
                      </Label>
                      <Select
                        value={duplicateMode}
                        onValueChange={(v) => setDuplicateMode(v as "skip" | "update")}
                      >
                        <SelectTrigger id="dup_mode" className="h-7 w-[160px] text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="skip">Bỏ qua (Giữ cũ)</SelectItem>
                          <SelectItem value="update">Cập nhật thông tin</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="text-muted-foreground text-[11px]">
                      Tổng dự kiến: <strong>{items.length}</strong> nguyên liệu
                    </div>
                  </div>
                </div>

                {/* Footer Actions */}
                <div className="flex items-center justify-between p-4 border-t bg-muted/30">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={resetState}
                    disabled={isSubmitting}
                  >
                    Quét ảnh khác
                  </Button>

                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setOpen(false)}
                      disabled={isSubmitting}
                    >
                      Đóng
                    </Button>

                    <SubmitButton
                      size="sm"
                      pending={isSubmitting}
                      pendingText="Đang lưu vào kho..."
                      disabled={items.length === 0}
                      onClick={() => void handleSaveToInventory()}
                      className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
                    >
                      <CheckCircle2 className="size-4" />
                      Lưu {items.length} nguyên liệu vào kho
                    </SubmitButton>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
