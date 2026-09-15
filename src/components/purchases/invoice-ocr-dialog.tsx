"use client";

import { useState } from "react";
import {
  FileText,
  KeyRound,
  ScanLine,
  Sparkles,
  UploadCloud,
} from "lucide-react";
import { toast } from "sonner";
import type { InvoiceOcrReviewData } from "@/types/restaurant";
import type {
  IngredientPickRow,
  SupplierPickRow,
} from "@/lib/queries/purchases.queries";
import { SAMPLE_DEMO_INVOICES } from "@/lib/ai/invoice-ocr";
import { extractAndMatchInvoice } from "@/server-actions/invoice-ocr.actions";
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
  const [showApiKey, setShowApiKey] = useState(false);
  const [customApiKey, setCustomApiKey] = useState("");
  const [reviewResult, setReviewResult] = useState<{
    reviewData: InvoiceOcrReviewData;
    modelUsed: string;
    isMock: boolean;
  } | null>(null);

  const resetState = () => {
    setIsScanning(false);
    setReviewResult(null);
  };

  const handleFileUpload = async (file: File) => {
    if (!file.type.startsWith("image/") && file.type !== "application/pdf") {
      toast.error("Vui lòng chọn file ảnh (PNG, JPG, WEBP) hoặc PDF.");
      return;
    }

    setIsScanning(true);

    try {
      const formData = new FormData();
      formData.append("file", file);
      if (customApiKey.trim()) {
        formData.append("api_key", customApiKey.trim());
      }

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
      toast.success("Đã quét và trích xuất dữ liệu hóa đơn thành công!");
      if (res.data.reviewData.excluded_items && res.data.reviewData.excluded_items.length > 0) {
        toast.info(
          `AI đã nhận diện và tự động loại bỏ ${res.data.reviewData.excluded_items.length} mặt hàng bị gạch tay trên hóa đơn: ${res.data.reviewData.excluded_items.join(", ")}`,
          { duration: 7000 }
        );
      }
    } catch {
      toast.error("Không thể phân tích hóa đơn. Vui lòng thử lại.");
    } finally {
      setIsScanning(false);
    }
  };

  const handleSelectDemo = async (demoId: string) => {
    setIsScanning(true);

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
          <Button variant="default" size="sm" className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm">
            <ScanLine className="size-4" />
            Quét ảnh hóa đơn
          </Button>
        )}
      </DialogTrigger>

      <DialogContent
        className={
          reviewResult
            ? "sm:max-w-[96vw] xl:max-w-[1440px] w-full max-h-[94vh] p-0 overflow-hidden shadow-2xl rounded-2xl border"
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
                Tải lên ảnh chụp hóa đơn mua hàng từ nhà cung cấp. Trí tuệ nhân tạo sẽ tự động
                trích xuất mặt hàng, số lượng, giá và điền vào phiếu nhập để bạn đối soát trước khi duyệt.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-5 py-3">
              {/* Dropzone Area */}
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  if (e.dataTransfer.files?.[0]) {
                    void handleFileUpload(e.dataTransfer.files[0]);
                  }
                }}
                className="relative flex flex-col items-center justify-center p-8 border-2 border-dashed rounded-xl bg-muted/20 hover:bg-muted/40 transition-colors cursor-pointer text-center group"
                onClick={() => {
                  const input = document.getElementById("invoice-file-input") as HTMLInputElement;
                  input?.click();
                }}
              >
                <input
                  id="invoice-file-input"
                  type="file"
                  accept="image/*,application/pdf"
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files?.[0]) {
                      void handleFileUpload(e.target.files[0]);
                    }
                  }}
                  disabled={isScanning}
                />

                {isScanning ? (
                  <div className="flex flex-col items-center gap-3 py-4">
                    <div className="relative">
                      <div className="size-12 rounded-full border-4 border-emerald-500/20 border-t-emerald-600 animate-spin" />
                      <Sparkles className="size-5 text-emerald-600 absolute inset-0 m-auto animate-pulse" />
                    </div>
                    <div className="space-y-1">
                      <p className="font-semibold text-sm">Đang đọc & phân tích hóa đơn...</p>
                      <p className="text-xs text-muted-foreground">
                        AI đang trích xuất ký tự, nhận diện nhà cung cấp & so khớp nguyên liệu kho
                      </p>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="size-12 rounded-full bg-emerald-50 dark:bg-emerald-950/40 flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
                      <UploadCloud className="size-6 text-emerald-600 dark:text-emerald-400" />
                    </div>
                    <p className="font-medium text-sm">
                      Kéo thả ảnh hóa đơn vào đây hoặc <span className="text-emerald-600 dark:text-emerald-400 underline underline-offset-2">Chọn file</span>
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Hỗ trợ định dạng JPG, PNG, WEBP, PDF (hóa đơn bán lẻ, GTGT, phiếu xuất kho)
                    </p>
                  </>
                )}
              </div>

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
