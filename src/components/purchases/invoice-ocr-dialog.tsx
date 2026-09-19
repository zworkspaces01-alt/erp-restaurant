"use client";

import { useState, useRef } from "react";
import {
  FileText,
  KeyRound,
  Plus,
  ScanLine,
  Sparkles,
  Trash2,
  UploadCloud,
  X,
  Image as ImageIcon,
} from "lucide-react";
import { toast } from "sonner";
import type { InvoiceOcrReviewData } from "@/types/restaurant";
import {
  IngredientPickRow,
  SupplierPickRow,
} from "@/lib/queries/purchases.queries";
import { SAMPLE_DEMO_INVOICES } from "@/lib/ai/sample-invoices";
import { compressImageForUpload } from "@/lib/client-image-compression";
import { extractAndMatchInvoice } from "@/server-actions/invoice-ocr.actions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { InvoiceReviewSplitView } from "./invoice-review-split-view";

interface InvoiceOcrDialogProps {
  suppliers: SupplierPickRow[];
  ingredients: IngredientPickRow[];
  trigger?: React.ReactNode;
}

export function InvoiceOcrDialog({
  suppliers,
  ingredients,
  trigger,
}: InvoiceOcrDialogProps) {
  const [open, setOpen] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgressText, setScanProgressText] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [customApiKey, setCustomApiKey] = useState("");

  // Quản lý danh sách nhiều ảnh hóa đơn được chọn
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [reviewResult, setReviewResult] = useState<{
    reviewData: InvoiceOcrReviewData;
    modelUsed: string;
    isMock: boolean;
  } | null>(null);

  const resetState = () => {
    setIsScanning(false);
    setScanProgressText("");
    setSelectedFiles([]);
    setReviewResult(null);
  };

  const handleAddFiles = (newFiles: FileList | File[]) => {
    const validFiles: File[] = [];
    for (let i = 0; i < newFiles.length; i++) {
      const file = newFiles[i];
      const isSupported =
        file.type.startsWith("image/") ||
        file.type === "application/pdf" ||
        /\.(jpg|jpeg|png|webp|heic|heif|bmp|tiff|pdf)$/i.test(file.name);
      if (isSupported) {
        validFiles.push(file);
      }
    }

    if (validFiles.length === 0) {
      toast.error("Vui lòng chọn file hình ảnh (PNG, JPG, WEBP, HEIC) hoặc PDF.");
      return;
    }

    setSelectedFiles((prev) => [...prev, ...validFiles]);
  };

  const handleRemoveFile = (index: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleStartScan = async () => {
    if (selectedFiles.length === 0) {
      toast.error("Vui lòng tải lên ít nhất 1 ảnh hóa đơn.");
      return;
    }

    setIsScanning(true);
    setScanProgressText(
      selectedFiles.length > 1
        ? `Đang nén và chuẩn bị ${selectedFiles.length} trang ảnh...`
        : "Đang nén và chuẩn bị ảnh..."
    );

    try {
      const formData = new FormData();

      // Nén lần lượt từng ảnh client-side
      for (let i = 0; i < selectedFiles.length; i++) {
        if (selectedFiles.length > 1) {
          setScanProgressText(`Đang tối ưu trang ${i + 1}/${selectedFiles.length}...`);
        }
        const compressed = await compressImageForUpload(selectedFiles[i]);
        formData.append("files", compressed);
      }

      if (customApiKey.trim()) {
        formData.append("api_key", customApiKey.trim());
      }

      setScanProgressText(
        selectedFiles.length > 1
          ? `AI đang đọc và gộp ${selectedFiles.length} trang hóa đơn...`
          : "AI đang trích xuất dữ liệu hóa đơn..."
      );

      const res = await extractAndMatchInvoice(formData);

      if (!res.success) {
        toast.error(res.error);
        setIsScanning(false);
        return;
      }

      setReviewResult({
        reviewData: res.data.reviewData,
        modelUsed: res.data.modelUsed,
        isMock: res.data.isMock,
      });

      toast.success(
        selectedFiles.length > 1
          ? `Đã quét và gộp thành công ${selectedFiles.length} trang hóa đơn!`
          : "Đã quét và trích xuất dữ liệu hóa đơn thành công!"
      );

      if (
        res.data.reviewData.excluded_items &&
        res.data.reviewData.excluded_items.length > 0
      ) {
        toast.info(
          `AI đã nhận diện và loại bỏ ${res.data.reviewData.excluded_items.length} mặt hàng bị gạch tay: ${res.data.reviewData.excluded_items.join(", ")}`,
          { duration: 7000 }
        );
      }
    } catch (err: unknown) {
      console.error("Lỗi quét hóa đơn:", err);
      const msg =
        err instanceof Error
          ? err.message
          : "Không thể phân tích hóa đơn. Vui lòng thử lại hoặc chụp ảnh rõ nét hơn.";
      toast.error(msg);
    } finally {
      setIsScanning(false);
      setScanProgressText("");
    }
  };

  const handleSelectDemo = async (demoId: string) => {
    setIsScanning(true);
    setScanProgressText("Đang tải dữ liệu mẫu...");

    try {
      const formData = new FormData();
      formData.append("demo_id", demoId);

      const res = await extractAndMatchInvoice(formData);

      if (!res.success) {
        toast.error(res.error);
        setIsScanning(false);
        return;
      }

      setReviewResult({
        reviewData: res.data.reviewData,
        modelUsed: res.data.modelUsed,
        isMock: res.data.isMock,
      });
      toast.success("Đã nạp dữ liệu hóa đơn mẫu thành công!");
    } catch {
      toast.error("Lỗi khi nạp mẫu hóa đơn.");
    } finally {
      setIsScanning(false);
      setScanProgressText("");
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
        {trigger ?? (
          <Button
            variant="default"
            size="sm"
            className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm"
          >
            <ScanLine className="size-4" />
            Quét ảnh hóa đơn
          </Button>
        )}
      </DialogTrigger>

      <DialogContent
        className={
          reviewResult
            ? "sm:max-w-[98vw] 2xl:max-w-[1600px] xl:max-w-[1500px] w-full max-h-[96vh] p-0 overflow-hidden shadow-2xl rounded-2xl border"
            : "sm:max-w-xl"
        }
      >
        {reviewResult ? (
          <InvoiceReviewSplitView
            reviewData={reviewResult.reviewData}
            modelUsed={reviewResult.modelUsed}
            isMock={reviewResult.isMock}
            suppliers={suppliers}
            ingredients={ingredients}
            onClose={() => {
              setOpen(false);
              resetState();
            }}
          />
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-lg">
                <ScanLine className="size-5 text-emerald-600 dark:text-emerald-400" />
                Quét Hóa Đơn Nhập Hàng Tự Động (AI OCR)
              </DialogTitle>
              <DialogDescription>
                Hỗ trợ hóa đơn 1 hoặc nhiều ảnh (hóa đơn dài nhiều trang). Trí tuệ nhân tạo sẽ tự động
                gộp các mặt hàng, tính tổng tiền và đối soát cho bạn trước khi lưu kho.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/*,application/pdf"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files && e.target.files.length > 0) {
                    handleAddFiles(e.target.files);
                  }
                  e.target.value = "";
                }}
                disabled={isScanning}
              />

              {/* Danh sách ảnh đã chọn (nếu có) */}
              {selectedFiles.length > 0 ? (
                <div className="space-y-3 rounded-xl border p-3 bg-muted/20">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <ImageIcon className="size-4 text-emerald-600 dark:text-emerald-400" />
                      <span className="font-semibold text-xs">
                        Đã chọn {selectedFiles.length} ảnh hóa đơn
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

                  {/* Danh sách thumbnail từng trang */}
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
                            Trang {idx + 1}
                          </Badge>
                          <button
                            type="button"
                            onClick={() => handleRemoveFile(idx)}
                            disabled={isScanning}
                            className="absolute top-1.5 right-1.5 size-6 rounded-full bg-destructive/90 text-white flex items-center justify-center opacity-90 hover:opacity-100 transition-opacity shadow-sm"
                            title="Xóa trang này"
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

                    {/* Nút thêm ảnh trang tiếp theo */}
                    <button
                      type="button"
                      disabled={isScanning}
                      onClick={() => fileInputRef.current?.click()}
                      className="aspect-4/3 border-2 border-dashed rounded-lg flex flex-col items-center justify-center gap-1.5 text-xs text-muted-foreground hover:text-foreground hover:border-emerald-500 hover:bg-emerald-50/20 dark:hover:bg-emerald-950/20 transition-all cursor-pointer"
                    >
                      <Plus className="size-5 text-emerald-600" />
                      <span className="font-medium text-[11px]">+ Thêm trang</span>
                    </button>
                  </div>

                  {/* Nút thực thi quét AI */}
                  <div className="pt-2 border-t flex items-center justify-between gap-3">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isScanning}
                      className="gap-1.5 text-xs"
                    >
                      <Plus className="size-3.5" /> Thêm trang tiếp
                    </Button>

                    <Button
                      type="button"
                      variant="default"
                      size="sm"
                      onClick={handleStartScan}
                      disabled={isScanning}
                      className="gap-1.5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm flex-1 sm:flex-initial"
                    >
                      {isScanning ? (
                        <>
                          <div className="size-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                          <span>{scanProgressText || "Đang xử lý..."}</span>
                        </>
                      ) : (
                        <>
                          <Sparkles className="size-3.5 text-amber-300" />
                          <span>Bắt đầu quét AI ({selectedFiles.length} ảnh)</span>
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              ) : (
                /* Dropzone Area khi chưa chọn ảnh */
                <div
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                      handleAddFiles(e.dataTransfer.files);
                    }
                  }}
                  className="relative flex flex-col items-center justify-center p-8 border-2 border-dashed rounded-xl bg-muted/20 hover:bg-muted/40 transition-colors cursor-pointer text-center group"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <div className="size-12 rounded-full bg-emerald-50 dark:bg-emerald-950/40 flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
                    <UploadCloud className="size-6 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <p className="font-medium text-sm">
                    Kéo thả 1 hoặc nhiều ảnh hóa đơn vào đây hoặc{" "}
                    <span className="text-emerald-600 dark:text-emerald-400 underline underline-offset-2">
                      Chọn file
                    </span>
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Hỗ trợ chọn nhiều ảnh cùng lúc (JPG, PNG, WEBP, PDF) cho hóa đơn nhiều trang
                  </p>
                </div>
              )}

              {/* Demo Sample Invoices */}
              <div className="space-y-2.5">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                  <FileText className="size-3.5" />
                  HOẶC TRẢI NGHIỆM NHANH VỚI HÓA ĐƠN MẪU:
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {SAMPLE_DEMO_INVOICES.map((demo) => (
                    <button
                      key={demo.id}
                      type="button"
                      disabled={isScanning}
                      onClick={() => void handleSelectDemo(demo.id)}
                      className="flex flex-col text-left p-3 rounded-lg border bg-card hover:bg-accent/50 hover:border-emerald-500/50 transition-all text-xs group disabled:opacity-50"
                    >
                      <span className="font-semibold text-foreground group-hover:text-emerald-600 dark:group-hover:text-emerald-400 flex items-center gap-1">
                        <Sparkles className="size-3 text-sky-500" />
                        {demo.name}
                      </span>
                      <span className="text-[11px] text-muted-foreground line-clamp-2 mt-1">
                        {demo.description}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Optional Custom API Key input */}
              <div className="border-t pt-3">
                <button
                  type="button"
                  onClick={() => setShowApiKey(!showApiKey)}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  <KeyRound className="size-3.5" />
                  {showApiKey ? "Ẩn cấu hình API Key" : "Cấu hình Groq API Key (Khuyên dùng - Siêu nhanh)"}
                </button>

                {showApiKey && (
                  <div className="mt-2 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="groq-key" className="text-xs">
                        Groq API Key (bắt đầu bằng <code>gsk_...</code>)
                      </Label>
                      <a
                        href="https://console.groq.com/keys"
                        target="_blank"
                        rel="noreferrer"
                        className="text-[11px] text-emerald-600 hover:underline"
                      >
                        Lấy key miễn phí tại Groq Console &rarr;
                      </a>
                    </div>
                    <Input
                      id="groq-key"
                      type="password"
                      placeholder="gsk_..."
                      value={customApiKey}
                      onChange={(e) => setCustomApiKey(e.target.value)}
                      className="h-8 text-xs font-mono"
                    />
                    <p className="text-[11px] text-muted-foreground">
                      Hệ thống ưu tiên sử dụng mô hình <strong>Llama 3.2 Vision trên Groq LPU</strong> để nhận diện tức thì. Bạn cũng có thể cấu hình vĩnh viễn biến <code>GROQ_API_KEY</code> trong file <code>.env.local</code>. (Vẫn hỗ trợ khóa Gemini / OpenAI).
                    </p>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
