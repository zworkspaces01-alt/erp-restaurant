"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Building2,
  Camera,
  CheckCircle2,
  FileSpreadsheet,
  FileText,
  Filter,
  Layers,
  Maximize2,
  Package,
  Plus,
  RotateCw,
  ScanLine,
  Sparkles,
  Trash2,
  UploadCloud,
  X,
  ZoomIn,
  ZoomOut,
  Image as ImageIcon,
} from "lucide-react";
import { toast } from "sonner";
import type {
  IngredientOcrResult,
  IngredientParsedItem,
} from "@/lib/ai/ingredient-ocr";
import { compressImageForUpload } from "@/lib/client-image-compression";
import {
  extractIngredientsFromImageAction,
  extractMultipleIngredientsFromImagesAction,
  type ExtractBatchIngredientsResponse,
} from "@/server-actions/ingredient-ocr.actions";
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

interface EnrichedIngredientItem extends IngredientParsedItem {
  sourceImageId?: string;
  sourceSupplierName?: string | null;
}

export function IngredientOcrDialog({
  trigger,
  categoryOptions = [],
}: IngredientOcrDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgressText, setScanProgressText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [duplicateMode, setDuplicateMode] = useState<"skip" | "update">("skip");

  // Multi-image selection state
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Result state
  const [batchResponse, setBatchResponse] =
    useState<ExtractBatchIngredientsResponse | null>(null);
  const [singleResult, setSingleResult] = useState<IngredientOcrResult | null>(
    null
  );
  const [items, setItems] = useState<EnrichedIngredientItem[]>([]);
  const [selectedSupplierFilter, setSelectedSupplierFilter] =
    useState<string>("all");

  // Viewer state
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [rotation, setRotation] = useState(0);

  const resetState = () => {
    setIsScanning(false);
    setScanProgressText("");
    setIsSubmitting(false);
    setSelectedFiles([]);
    setBatchResponse(null);
    setSingleResult(null);
    setItems([]);
    setSelectedSupplierFilter("all");
    setActiveImageIndex(0);
    setZoomLevel(1);
    setRotation(0);
  };

  const handleAddFiles = (newFiles: FileList | File[]) => {
    const validFiles: File[] = [];
    for (let i = 0; i < newFiles.length; i++) {
      const file = newFiles[i];
      const isSupported =
        file.type.startsWith("image/") ||
        /\.(jpg|jpeg|png|webp|heic|heif|bmp|tiff)$/i.test(file.name);
      if (isSupported) {
        validFiles.push(file);
      }
    }

    if (validFiles.length === 0) {
      toast.error("Vui lòng chọn file hình ảnh (PNG, JPG, WEBP, HEIC).");
      return;
    }

    setSelectedFiles((prev) => [...prev, ...validFiles]);
  };

  const handleRemoveFile = (index: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  // Bắt đầu quét các ảnh đã chọn
  const handleStartScan = async () => {
    if (selectedFiles.length === 0) {
      toast.error("Vui lòng chọn ít nhất 1 ảnh nguyên liệu.");
      return;
    }

    setIsScanning(true);

    try {
      if (selectedFiles.length === 1) {
        // Quét 1 ảnh đơn
        setScanProgressText("Đang nén và phân tích ảnh nguyên liệu...");
        const readyFile = await compressImageForUpload(selectedFiles[0]);
        const formData = new FormData();
        formData.append("file", readyFile);

        const res = await extractIngredientsFromImageAction(formData);
        if (!res.success) {
          toast.error(res.error);
          setIsScanning(false);
          return;
        }

        const ocr = res.data;
        const supName =
          ocr.matched_supplier_name || ocr.supplier?.name || undefined;
        const enrichedItems: EnrichedIngredientItem[] = (ocr.items || []).map(
          (it) => ({
            ...it,
            sourceImageId: "img-0",
            sourceSupplierName: supName,
          })
        );

        setSingleResult(ocr);
        setItems(enrichedItems);
        toast.success(
          `Đã trích xuất thành công ${enrichedItems.length} nguyên liệu!`
        );
      } else {
        // Quét hàng loạt nhiều ảnh từ các Nhà Cung Cấp khác nhau
        setScanProgressText(
          `Đang nén ${selectedFiles.length} ảnh nguyên liệu...`
        );
        const formData = new FormData();

        for (let i = 0; i < selectedFiles.length; i++) {
          setScanProgressText(
            `Đang tối ưu ảnh ${i + 1}/${selectedFiles.length}...`
          );
          const compressed = await compressImageForUpload(selectedFiles[i]);
          formData.append("files", compressed);
        }

        setScanProgressText(
          `AI đang bóc tách nguyên liệu từ ${selectedFiles.length} ảnh...`
        );
        const res = await extractMultipleIngredientsFromImagesAction(formData);

        if (!res.success) {
          toast.error(res.error);
          setIsScanning(false);
          return;
        }

        const batch = res.data;
        setBatchResponse(batch);

        const allEnriched: EnrichedIngredientItem[] = [];
        batch.results.forEach((imgRes) => {
          imgRes.items.forEach((it) => {
            allEnriched.push({
              ...it,
              sourceImageId: imgRes.id,
              sourceSupplierName: imgRes.supplierName,
            });
          });
        });

        setItems(allEnriched);
        toast.success(
          `Đã trích xuất thành công ${allEnriched.length} nguyên liệu từ ${batch.totalSuccess}/${batch.totalImages} ảnh (${batch.uniqueSuppliersCount} NCC)!`
        );
      }
    } catch (err: unknown) {
      console.error("Lỗi scan ảnh nguyên liệu:", err);
      toast.error(
        err instanceof Error
          ? err.message
          : "Không thể xử lý ảnh nguyên liệu. Vui lòng thử lại."
      );
    } finally {
      setIsScanning(false);
      setScanProgressText("");
    }
  };

  // Nạp bản mẫu đơn
  const handleSingleDemoScan = async () => {
    setIsScanning(true);
    setScanProgressText("Đang nạp bảng giá nguyên liệu mẫu...");
    try {
      const formData = new FormData();
      formData.append("is_demo", "true");

      const res = await extractIngredientsFromImageAction(formData);
      if (!res.success) {
        toast.error(res.error);
        setIsScanning(false);
        return;
      }

      setSingleResult(res.data);
      const supName =
        res.data.matched_supplier_name ||
        res.data.supplier?.name ||
        undefined;
      setItems(
        (res.data.items || []).map((it) => ({
          ...it,
          sourceImageId: "img-demo",
          sourceSupplierName: supName,
        }))
      );
      toast.success("Đã nạp mẫu bảng giá nguyên liệu!");
    } catch {
      toast.error("Lỗi khi nạp bảng giá mẫu.");
    } finally {
      setIsScanning(false);
      setScanProgressText("");
    }
  };

  // Nạp bản mẫu hàng loạt (3 Nhà Cung Cấp khác nhau)
  const handleBatchDemoScan = async () => {
    setIsScanning(true);
    setScanProgressText(
      "Đang nạp dữ liệu nguyên liệu mẫu từ 3 Nhà Cung Cấp khác nhau..."
    );
    try {
      const formData = new FormData();
      formData.append("demo_id", "batch-ingredients-demo");

      const res = await extractMultipleIngredientsFromImagesAction(formData);
      if (!res.success) {
        toast.error(res.error);
        setIsScanning(false);
        return;
      }

      const batch = res.data;
      setBatchResponse(batch);

      const allEnriched: EnrichedIngredientItem[] = [];
      batch.results.forEach((imgRes) => {
        imgRes.items.forEach((it) => {
          allEnriched.push({
            ...it,
            sourceImageId: imgRes.id,
            sourceSupplierName: imgRes.supplierName,
          });
        });
      });

      setItems(allEnriched);
      toast.success(
        `Đã nạp thành công ${allEnriched.length} nguyên liệu từ 3 Nhà Cung Cấp mẫu!`
      );
    } catch {
      toast.error("Lỗi khi nạp dữ liệu mẫu hàng loạt.");
    } finally {
      setIsScanning(false);
      setScanProgressText("");
    }
  };

  const handleUpdateItem = (
    index: number,
    patch: Partial<EnrichedIngredientItem>
  ) => {
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
        default_supplier_id: it.default_supplier_id || null,
        is_active: true,
        note: it.note || null,
      }));

      // Nếu chỉ có 1 NCC từ singleResult
      const supplierInfo =
        singleResult?.supplier || singleResult?.matched_supplier_name
          ? {
              id: singleResult.supplier_id || null,
              name:
                singleResult.matched_supplier_name ||
                singleResult.supplier?.name ||
                null,
              tax_code: singleResult.supplier?.tax_code || null,
              phone: singleResult.supplier?.phone || null,
              address: singleResult.supplier?.address || null,
              contact_name: singleResult.supplier?.contact_name || null,
            }
          : null;

      const res = await importIngredients(payload, duplicateMode, supplierInfo);

      if (!res.success) {
        toast.error(res.error);
        return;
      }

      toast.success(
        `Đã lưu thành công ${res.data.inserted} nguyên liệu mới${
          res.data.updated ? `, cập nhật ${res.data.updated}` : ""
        }${res.data.skipped ? `, bỏ qua ${res.data.skipped} trùng mã` : ""}!`
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

  const hasResults = Boolean(singleResult || batchResponse);

  // Danh sách các Nhà cung cấp phát hiện được trong đợt quét
  const uniqueSuppliers = Array.from(
    new Set(items.map((it) => it.sourceSupplierName).filter(Boolean))
  ) as string[];

  // Lọc theo Nhà cung cấp
  const filteredItems = items.filter((it) => {
    if (selectedSupplierFilter === "all") return true;
    return it.sourceSupplierName === selectedSupplierFilter;
  });

  // Xác định ảnh và thông tin NCC hiện tại đang xem trên khung ảnh
  const activeImageInfo = batchResponse
    ? batchResponse.results[activeImageIndex] || batchResponse.results[0]
    : singleResult
    ? {
        fileName: "Ảnh nguyên liệu",
        imageUrl: singleResult.image_url || "",
        supplierName:
          singleResult.matched_supplier_name || singleResult.supplier?.name,
        supplier: singleResult.supplier,
      }
    : null;

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
          hasResults
            ? "sm:max-w-[96vw] lg:max-w-[94vw] 2xl:max-w-[1550px] w-full max-h-[94vh] p-0 overflow-hidden flex flex-col shadow-2xl rounded-2xl border"
            : "sm:max-w-2xl w-full p-0 overflow-hidden rounded-2xl"
        }
      >
        {!hasResults ? (
          <>
            <DialogHeader className="p-6 pb-2">
              <div className="flex items-center gap-2">
                <div className="size-9 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-600">
                  <ScanLine className="size-5" />
                </div>
                <div>
                  <DialogTitle className="flex items-center gap-2">
                    Quét Ảnh Bảng Giá & Danh Mục Nguyên Liệu (AI OCR)
                    <Badge variant="outline" className="text-xs gap-1">
                      <Sparkles className="size-3 text-amber-500" /> Groq Vision
                    </Badge>
                  </DialogTitle>
                  <DialogDescription className="text-xs">
                    Chụp hoặc tải lên cùng lúc nhiều ảnh bảng báo giá, biên bản giao nhận hoặc bao bì từ nhiều Nhà Cung Cấp khác nhau.
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>

            <div className="p-6 pt-2 space-y-4">
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/*"
                className="hidden"
                disabled={isScanning}
                onChange={(e) => {
                  if (e.target.files && e.target.files.length > 0) {
                    handleAddFiles(e.target.files);
                  }
                  e.target.value = "";
                }}
              />

              {isScanning ? (
                <div className="py-12 flex flex-col items-center justify-center space-y-3 text-center">
                  <div className="relative">
                    <div className="size-14 rounded-full border-4 border-emerald-500/20 border-t-emerald-600 animate-spin" />
                    <Sparkles className="size-6 text-emerald-600 absolute inset-0 m-auto animate-pulse" />
                  </div>
                  <div className="space-y-1">
                    <p className="font-semibold text-sm">
                      {scanProgressText || "AI Vision đang phân tích ảnh nguyên liệu..."}
                    </p>
                    <p className="text-xs text-muted-foreground max-w-sm">
                      Đang nhận diện tên mặt hàng, đơn vị mua, đơn vị dùng, hệ số quy đổi và đơn giá dự kiến.
                    </p>
                  </div>
                </div>
              ) : selectedFiles.length > 0 ? (
                /* Danh sách ảnh đã chọn */
                <div className="space-y-3 rounded-xl border p-3 bg-muted/20">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <ImageIcon className="size-4 text-emerald-600 dark:text-emerald-400" />
                      <span className="font-semibold text-xs">
                        Đã chọn {selectedFiles.length} ảnh nguyên liệu
                      </span>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setSelectedFiles([])}
                      disabled={isScanning}
                      className="h-7 text-xs text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="size-3.5 mr-1" /> Xóa tất cả
                    </Button>
                  </div>

                  {/* Grid thumbnails */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 max-h-[220px] overflow-y-auto p-1">
                    {selectedFiles.map((file, idx) => (
                      <div
                        key={idx}
                        className="relative group border rounded-lg overflow-hidden bg-background shadow-xs flex flex-col"
                      >
                        <div className="relative aspect-4/3 w-full bg-muted/40 flex items-center justify-center overflow-hidden">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={URL.createObjectURL(file)}
                            alt={file.name}
                            className="w-full h-full object-cover"
                          />
                          <Badge
                            variant="secondary"
                            className="absolute top-1.5 left-1.5 text-[10px] font-bold bg-background/90 backdrop-blur-xs px-1.5 py-0 shadow-xs"
                          >
                            Ảnh {idx + 1}
                          </Badge>
                          <button
                            type="button"
                            onClick={() => handleRemoveFile(idx)}
                            disabled={isScanning}
                            className="absolute top-1.5 right-1.5 size-6 rounded-full bg-destructive/90 text-white flex items-center justify-center opacity-90 hover:opacity-100 transition-opacity shadow-sm"
                            title="Xóa ảnh này"
                          >
                            <X className="size-3.5" />
                          </button>
                        </div>
                        <div className="p-1.5 text-[11px] truncate">
                          <p className="font-medium truncate">{file.name}</p>
                          <p className="text-[10px] text-muted-foreground">
                            {(file.size / 1024).toFixed(0)} KB
                          </p>
                        </div>
                      </div>
                    ))}

                    <button
                      type="button"
                      disabled={isScanning}
                      onClick={() => fileInputRef.current?.click()}
                      className="aspect-4/3 border-2 border-dashed rounded-lg flex flex-col items-center justify-center gap-1.5 text-xs text-muted-foreground hover:text-foreground hover:border-emerald-500 hover:bg-emerald-50/20 transition-all cursor-pointer"
                    >
                      <Plus className="size-5 text-emerald-600" />
                      <span className="font-medium text-[11px]">+ Thêm ảnh</span>
                    </button>
                  </div>

                  <div className="pt-2 border-t flex items-center justify-between gap-3">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isScanning}
                      className="gap-1.5 text-xs"
                    >
                      <Plus className="size-3.5" /> Thêm ảnh khác
                    </Button>

                    <Button
                      type="button"
                      variant="default"
                      size="sm"
                      onClick={handleStartScan}
                      disabled={isScanning}
                      className="gap-1.5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm flex-1 sm:flex-initial"
                    >
                      <Sparkles className="size-3.5 text-amber-300" />
                      Bắt đầu quét AI ({selectedFiles.length} ảnh)
                    </Button>
                  </div>
                </div>
              ) : (
                /* Upload Dropzone */
                <div
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                      handleAddFiles(e.dataTransfer.files);
                    }
                  }}
                  className="border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center gap-3 cursor-pointer hover:border-emerald-500/50 hover:bg-emerald-500/5 transition-colors text-center"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <div className="size-12 rounded-full bg-muted flex items-center justify-center text-muted-foreground">
                    <UploadCloud className="size-6 text-emerald-600" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-medium">
                      Kéo thả 1 hoặc nhiều ảnh nguyên liệu vào đây hoặc{" "}
                      <span className="text-emerald-600 hover:underline">
                        chọn từ thiết bị
                      </span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Hỗ trợ chọn nhiều ảnh cùng lúc (PNG, JPG, WEBP) từ các Nhà Cung Cấp khác nhau
                    </p>
                  </div>
                </div>
              )}

              {/* Demo Options */}
              <div className="space-y-2 pt-2 border-t">
                <span className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                  <FileText className="size-3.5" /> HOẶC TRẢI NGHIỆM NHANH VỚI MẪU CÓ SẴN:
                </span>

                {/* Batch multi-supplier demo */}
                <button
                  type="button"
                  disabled={isScanning}
                  onClick={() => void handleBatchDemoScan()}
                  className="w-full flex items-center justify-between p-3 rounded-lg border-2 border-emerald-500/40 bg-emerald-50/20 dark:bg-emerald-950/20 hover:border-emerald-500 hover:bg-emerald-50/40 transition-all text-xs group cursor-pointer text-left disabled:opacity-50"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="size-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                      <Sparkles className="size-4 text-amber-200" />
                    </div>
                    <div>
                      <div className="font-bold text-foreground flex items-center gap-2">
                        Quét Hàng Loạt 3 Ảnh Từ 3 Nhà Cung Cấp Khác Nhau
                        <Badge className="text-[10px] py-0 px-1.5 bg-emerald-600 text-white font-semibold">
                          Batch AI
                        </Badge>
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        Đại lý Toàn Thắng (Gia vị/Khô) + Đà Lạt Mart (Rau củ) + SIM BA (Hải sản/Trứng)
                      </p>
                    </div>
                  </div>
                  <span className="text-xs font-semibold text-emerald-600 shrink-0 group-hover:translate-x-0.5 transition-transform ml-2">
                    Thử ngay &rarr;
                  </span>
                </button>

                {/* Single demo */}
                <div className="p-2.5 bg-muted/30 rounded-lg border flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs">
                    <FileSpreadsheet className="size-3.5 text-emerald-600" />
                    <span>Mẫu đơn: Bảng giá Đại lý Gia vị Toàn Thắng (1 NCC)</span>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void handleSingleDemoScan()}
                    disabled={isScanning}
                    className="h-7 text-xs"
                  >
                    Nạp mẫu đơn
                  </Button>
                </div>
              </div>
            </div>
          </>
        ) : (
          /* Split View Review & Save */
          <div className="flex flex-col h-[90vh] max-h-[880px]">
            {/* Top Bar Header */}
            <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-3 border-b bg-muted/40">
              <div className="flex flex-wrap items-center gap-2.5">
                <Package className="size-5 text-emerald-600" />
                <h3 className="font-bold text-sm">
                  Đối Soát & Nhập Kho {items.length} Nguyên Liệu
                </h3>

                {batchResponse && (
                  <Badge
                    variant="outline"
                    className="gap-1 py-0.5 text-xs bg-background text-emerald-700 dark:text-emerald-300 border-emerald-500/30"
                  >
                    <Layers className="size-3" />
                    {batchResponse.totalSuccess} ảnh quét
                  </Badge>
                )}

                {uniqueSuppliers.length > 0 && (
                  <Badge
                    variant="outline"
                    className="gap-1 py-0.5 text-xs bg-background font-semibold"
                  >
                    <Building2 className="size-3" />
                    {uniqueSuppliers.length} Nhà Cung Cấp
                  </Badge>
                )}
              </div>

              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleAddItem}
                  className="h-8 text-xs gap-1"
                >
                  <Plus className="size-3.5" /> Thêm dòng
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={resetState}
                  disabled={isSubmitting}
                  className="h-8 text-xs"
                >
                  Quét ảnh khác
                </Button>
              </div>
            </div>

            {/* Main Split Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-12 flex-1 min-h-0 overflow-hidden">
              {/* Left Column: Image Viewer (4 cols) */}
              <div className="lg:col-span-4 border-r flex flex-col bg-zinc-950/90 text-zinc-100 overflow-hidden relative select-none">
                {/* Image switcher toolbar if multiple images */}
                {batchResponse && batchResponse.results.length > 1 && (
                  <div className="px-3 py-1.5 bg-zinc-900 border-b border-zinc-800 flex items-center gap-1.5 overflow-x-auto text-xs shrink-0">
                    <span className="text-[11px] text-zinc-400 shrink-0 font-medium">
                      Xem ảnh:
                    </span>
                    {batchResponse.results.map((r, idx) => (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => {
                          setActiveImageIndex(idx);
                          setZoomLevel(1);
                          setRotation(0);
                        }}
                        className={`px-2 py-0.5 rounded text-[11px] font-mono shrink-0 transition-all ${
                          idx === activeImageIndex
                            ? "bg-emerald-600 text-white font-bold"
                            : "bg-zinc-800 text-zinc-400 hover:text-white"
                        }`}
                      >
                        #{idx + 1}
                      </button>
                    ))}
                  </div>
                )}

                {/* Photo Zoom/Rotate Toolbar */}
                <div className="flex items-center justify-between p-2 bg-zinc-900/80 border-b border-zinc-800 text-xs">
                  <span
                    className="font-medium text-zinc-300 truncate max-w-[200px]"
                    title={activeImageInfo?.fileName}
                  >
                    {activeImageInfo?.fileName || "Ảnh nguyên liệu"}
                  </span>
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-7 text-zinc-300 hover:text-white"
                      onClick={() => setZoomLevel((z) => Math.max(z - 0.25, 0.5))}
                      title="Thu nhỏ"
                    >
                      <ZoomOut className="size-3.5" />
                    </Button>
                    <span className="text-[10px] font-mono px-1">
                      {Math.round(zoomLevel * 100)}%
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-7 text-zinc-300 hover:text-white"
                      onClick={() => setZoomLevel((z) => Math.min(z + 0.25, 3))}
                      title="Phóng to"
                    >
                      <ZoomIn className="size-3.5" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-7 text-zinc-300 hover:text-white"
                      onClick={() => setRotation((r) => (r + 90) % 360)}
                      title="Xoay"
                    >
                      <RotateCw className="size-3.5" />
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
                      title="Đặt lại"
                    >
                      <Maximize2 className="size-3.5" />
                    </Button>
                  </div>
                </div>

                {/* Photo Canvas */}
                <div className="flex-1 overflow-auto flex items-center justify-center p-4">
                  {activeImageInfo?.imageUrl &&
                  activeImageInfo.imageUrl !== "/sample-ingredient-list.png" ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={activeImageInfo.imageUrl}
                      alt="Ảnh nguyên liệu gốc"
                      style={{
                        transform: `scale(${zoomLevel}) rotate(${rotation}deg)`,
                        transformOrigin: "center center",
                        transition: "transform 0.15s ease-out",
                      }}
                      className="max-w-full max-h-full object-contain rounded shadow-lg"
                    />
                  ) : (
                    <div className="text-center p-6 text-zinc-400">
                      <FileSpreadsheet className="size-12 mx-auto mb-2 opacity-30" />
                      <p className="text-xs">Bản mẫu nguyên liệu demo</p>
                    </div>
                  )}
                </div>

                {/* Supplier Info for active photo */}
                {activeImageInfo?.supplierName && (
                  <div className="p-2.5 bg-zinc-900 border-t border-zinc-800 text-xs text-zinc-300 space-y-1">
                    <div className="flex items-center gap-1.5 font-semibold text-white">
                      <Building2 className="size-3.5 text-emerald-400" />
                      <span>{activeImageInfo.supplierName}</span>
                    </div>
                    {activeImageInfo.supplier?.phone && (
                      <p className="text-[11px] text-zinc-400">
                        SĐT: {activeImageInfo.supplier.phone}
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Right Column: Editable Table (8 cols) */}
              <div className="lg:col-span-8 flex flex-col min-h-0 overflow-hidden bg-background">
                {/* Filter and stats toolbar */}
                <div className="p-3 border-b bg-muted/20 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Filter className="size-3.5 text-muted-foreground" />
                    <span className="text-xs font-semibold text-muted-foreground">
                      Lọc theo NCC:
                    </span>
                    <Select
                      value={selectedSupplierFilter}
                      onValueChange={setSelectedSupplierFilter}
                    >
                      <SelectTrigger className="h-7 text-xs w-[220px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">
                          Tất cả Nhà Cung Cấp ({items.length} món)
                        </SelectItem>
                        {uniqueSuppliers.map((sup) => (
                          <SelectItem key={sup} value={sup}>
                            {sup} (
                            {
                              items.filter((it) => it.sourceSupplierName === sup)
                                .length
                            }
                            )
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <span className="text-xs text-muted-foreground">
                    Hiển thị <strong>{filteredItems.length}</strong> /{" "}
                    {items.length} nguyên liệu
                  </span>
                </div>

                {/* Editable Table */}
                <div className="flex-1 overflow-y-auto p-3">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b text-muted-foreground font-semibold text-[11px]">
                        <th className="pb-2 w-8 text-center">STT</th>
                        {uniqueSuppliers.length > 1 && (
                          <th className="pb-2 min-w-[140px]">Nhà Cung Cấp</th>
                        )}
                        <th className="pb-2 min-w-[170px]">Tên Nguyên Liệu *</th>
                        <th className="pb-2 w-28">Mã SKU</th>
                        <th className="pb-2 w-28">Danh Mục</th>
                        <th className="pb-2 w-16 text-center">ĐVT Cơ Sở</th>
                        <th className="pb-2 w-16 text-center">ĐVT Nhập</th>
                        <th className="pb-2 w-16 text-right">Quy Đổi</th>
                        <th className="pb-2 w-24 text-right">Giá Nhập (đ)</th>
                        <th className="pb-2 w-8"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60">
                      {filteredItems.map((it) => {
                        const originalIndex = items.indexOf(it);
                        return (
                          <tr
                            key={originalIndex}
                            className="group hover:bg-muted/30 transition-colors"
                          >
                            <td className="py-2 text-center font-mono text-[11px] text-muted-foreground">
                              {originalIndex + 1}
                            </td>

                            {uniqueSuppliers.length > 1 && (
                              <td className="py-2 pr-2">
                                <Badge
                                  variant="secondary"
                                  className="text-[10px] truncate max-w-[150px] font-normal"
                                  title={it.sourceSupplierName || "Chưa rõ"}
                                >
                                  {it.sourceSupplierName || "Tự do"}
                                </Badge>
                              </td>
                            )}

                            <td className="py-2 pr-2">
                              <Input
                                value={it.name}
                                onChange={(e) =>
                                  handleUpdateItem(originalIndex, {
                                    name: e.target.value,
                                  })
                                }
                                placeholder="Tên nguyên liệu"
                                className="h-7 text-xs font-medium"
                              />
                            </td>

                            <td className="py-2 pr-1">
                              <Input
                                value={it.code || ""}
                                onChange={(e) =>
                                  handleUpdateItem(originalIndex, {
                                    code: e.target.value,
                                  })
                                }
                                placeholder="NL-..."
                                className="h-7 text-xs font-mono"
                              />
                            </td>

                            <td className="py-2 pr-1">
                              <Input
                                value={it.category || ""}
                                onChange={(e) =>
                                  handleUpdateItem(originalIndex, {
                                    category: e.target.value,
                                  })
                                }
                                placeholder="Danh mục"
                                className="h-7 text-xs"
                              />
                            </td>

                            <td className="py-2 px-1">
                              <Input
                                value={it.base_unit}
                                onChange={(e) =>
                                  handleUpdateItem(originalIndex, {
                                    base_unit: e.target.value,
                                  })
                                }
                                placeholder="kg"
                                className="h-7 text-xs text-center"
                              />
                            </td>

                            <td className="py-2 px-1">
                              <Input
                                value={it.import_unit || it.base_unit}
                                onChange={(e) =>
                                  handleUpdateItem(originalIndex, {
                                    import_unit: e.target.value,
                                  })
                                }
                                placeholder="thùng"
                                className="h-7 text-xs text-center"
                              />
                            </td>

                            <td className="py-2 px-1">
                              <Input
                                type="number"
                                step="any"
                                value={it.conversion_factor || 1}
                                onChange={(e) =>
                                  handleUpdateItem(originalIndex, {
                                    conversion_factor: Math.max(
                                      0.001,
                                      Number(e.target.value) || 1
                                    ),
                                  })
                                }
                                className="h-7 text-xs text-right font-mono"
                              />
                            </td>

                            <td className="py-2 px-1">
                              <Input
                                type="number"
                                step="any"
                                value={it.default_price || 0}
                                onChange={(e) =>
                                  handleUpdateItem(originalIndex, {
                                    default_price: Math.max(
                                      0,
                                      Number(e.target.value) || 0
                                    ),
                                  })
                                }
                                className="h-7 text-xs text-right font-mono"
                              />
                            </td>

                            <td className="py-2 text-center">
                              <button
                                type="button"
                                onClick={() => handleDeleteItem(originalIndex)}
                                className="opacity-0 group-hover:opacity-100 hover:text-destructive text-muted-foreground p-1 transition-opacity rounded"
                                title="Xóa dòng này"
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

                {/* Bottom Bar: Duplicate Mode & Submit */}
                <div className="p-3 border-t bg-muted/20 flex flex-wrap items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-2">
                    <Label htmlFor="dup_mode" className="text-xs text-muted-foreground">
                      Xử lý nếu trùng mã SKU:
                    </Label>
                    <Select
                      value={duplicateMode}
                      onValueChange={(v) =>
                        setDuplicateMode(v as "skip" | "update")
                      }
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

                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setOpen(false)}
                      disabled={isSubmitting}
                      className="h-8 text-xs"
                    >
                      Đóng
                    </Button>

                    <SubmitButton
                      size="sm"
                      pending={isSubmitting}
                      pendingText="Đang lưu vào kho..."
                      disabled={items.length === 0}
                      onClick={() => void handleSaveToInventory()}
                      className="h-8 gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs shadow-sm"
                    >
                      <CheckCircle2 className="size-3.5" />
                      Lưu Tất Cả ({items.length} Nguyên Liệu) Vào Kho
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
