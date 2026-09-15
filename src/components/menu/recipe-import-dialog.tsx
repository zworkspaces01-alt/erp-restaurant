"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  FileUp,
  RotateCcw,
  SlidersHorizontal,
  UploadCloud,
} from "lucide-react";
import { toast } from "sonner";
import type { RecipeImportRowInput } from "@/types/restaurant";
import {
  downloadCostingTemplate,
  downloadRecipeTemplate,
  parseRecipeExcelFile,
  type ParsedExcelRow,
} from "@/lib/excel";
import { importRecipes, type RecipeImportSummary } from "@/server-actions/menu.actions";
import { FormServerError, StatusBadge, SubmitButton } from "@/components/shared";
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
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

export function RecipeImportDialog({ trigger }: { trigger?: React.ReactNode }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<ParsedExcelRow<RecipeImportRowInput>[]>([]);
  const [mode, setMode] = useState<"replace" | "append">("replace");
  const [filterTab, setFilterTab] = useState<"all" | "valid" | "invalid">("all");
  const [isParsing, setIsParsing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const validRows = useMemo(() => rows.filter((r) => r.isValid), [rows]);
  const invalidRows = useMemo(() => rows.filter((r) => !r.isValid), [rows]);

  const uniqueDishes = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => {
      const codeOrName = r.data.menu_item_code || r.data.menu_item_name;
      if (codeOrName) set.add(codeOrName);
    });
    return set.size;
  }, [rows]);

  const displayedRows = useMemo(() => {
    if (filterTab === "valid") return validRows;
    if (filterTab === "invalid") return invalidRows;
    return rows;
  }, [rows, validRows, invalidRows, filterTab]);

  const resetState = () => {
    setFile(null);
    setRows([]);
    setServerError(null);
    setFilterTab("all");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    setFile(selectedFile);
    setIsParsing(true);
    setServerError(null);

    try {
      const parsed = await parseRecipeExcelFile(selectedFile);
      setRows(parsed);
      if (parsed.length === 0) {
        setServerError("File không có dòng dữ liệu nào hoặc sai định dạng.");
      }
    } catch {
      setServerError("Không thể đọc file. Vui lòng kiểm tra lại định dạng file Excel (.xlsx, .xls) hoặc CSV.");
    } finally {
      setIsParsing(false);
    }
  };

  const handleImport = async () => {
    if (validRows.length === 0) return;

    setIsSubmitting(true);
    setServerError(null);

    try {
      const validData = validRows.map((r) => r.data as RecipeImportRowInput);
      const res = await importRecipes(validData, mode);

      if (!res.success) {
        setServerError(res.error);
        return;
      }

      const summary: RecipeImportSummary = res.data;
      toast.success(
        `Đã nhập ${summary.importedRows} dòng định lượng cho ${summary.matchedDishesCount} món ăn!`
      );
      if (summary.errors && summary.errors.length > 0) {
        toast.warning(`Có ${summary.errors.length} dòng không khớp mã món/nguyên liệu.`);
      }

      setOpen(false);
      resetState();
      router.refresh();
    } catch {
      setServerError("Đã xảy ra lỗi khi lưu định lượng vào cơ sở dữ liệu.");
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
        {trigger ?? (
          <Button variant="outline" size="sm" className="gap-1.5">
            <SlidersHorizontal className="size-4" />
            Nhập định lượng Excel
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="max-h-[90vh] w-full max-w-4xl flex flex-col p-6">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <FileSpreadsheet className="size-5 text-primary" />
            Nhập định lượng (BOM) từ file Excel
          </DialogTitle>
          <DialogDescription>
            Bốc công thức định lượng nguyên liệu hàng loạt cho các món ăn. Tải file mẫu bên dưới để xem định dạng chuẩn.
          </DialogDescription>
        </DialogHeader>

        <FormServerError message={serverError} />

        {!file ? (
          <div className="flex flex-col items-center justify-center gap-4 py-8 border-2 border-dashed rounded-lg bg-muted/20">
            <div className="p-3 bg-primary/10 text-primary rounded-full">
              <UploadCloud className="size-8" />
            </div>
            <div className="text-center space-y-1">
              <p className="text-sm font-medium">Chọn file Excel (.xlsx, .xls) hoặc CSV để tải lên</p>
              <p className="text-xs text-muted-foreground">Kéo thả file vào đây hoặc bấm nút duyệt bên dưới</p>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx, .xls, .csv"
                className="hidden"
                onChange={(e) => void handleFileChange(e)}
              />
              <Button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isParsing}
                className="gap-2"
              >
                <FileUp className="size-4" />
                {isParsing ? "Đang đọc file..." : "Chọn file định lượng"}
              </Button>

              <Button
                type="button"
                variant="outline"
                onClick={downloadCostingTemplate}
                className="gap-2 text-primary border-primary/30 hover:bg-primary/5"
              >
                <Download className="size-4" />
                Tải mẫu Costing đơn món (ảnh)
              </Button>

              <Button
                type="button"
                variant="outline"
                onClick={downloadRecipeTemplate}
                className="gap-2"
              >
                <Download className="size-4" />
                Tải mẫu BOM tổng hợp
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-hidden flex flex-col gap-4">
            {/* Thanh công cụ tóm tắt & chọn chế độ */}
            <div className="flex flex-wrap items-center justify-between gap-3 bg-muted/40 p-3 rounded-lg border text-sm">
              <div className="flex items-center gap-3">
                <FileSpreadsheet className="size-4 text-primary" />
                <div>
                  <p className="font-medium text-foreground">{file.name}</p>
                  <p className="text-xs text-muted-foreground">
                    Tổng cộng: <strong>{rows.length}</strong> dòng · <strong>{uniqueDishes}</strong> món ăn
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <Label htmlFor="recipe-mode" className="text-xs whitespace-nowrap text-muted-foreground">
                    Chế độ nạp:
                  </Label>
                  <select
                    id="recipe-mode"
                    value={mode}
                    onChange={(e) => setMode(e.target.value as "replace" | "append")}
                    className="h-8 rounded border bg-background px-2 text-xs font-medium focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    <option value="replace">Ghi đè (Xóa BOM cũ, nạp mới)</option>
                    <option value="append">Bổ sung (Cộng thêm nguyên liệu)</option>
                  </select>
                </div>

                <Button variant="ghost" size="sm" onClick={resetState} className="gap-1 text-xs">
                  <RotateCcw className="size-3.5" />
                  Chọn file khác
                </Button>
              </div>
            </div>

            {/* Bộ lọc tab xem dữ liệu */}
            <div className="flex items-center justify-between gap-2 border-b pb-2">
              <Tabs
                value={filterTab}
                onValueChange={(v) => setFilterTab(v as "all" | "valid" | "invalid")}
                className="w-full sm:w-auto"
              >
                <TabsList className="h-8 text-xs">
                  <TabsTrigger value="all" className="gap-1.5">
                    Tất cả ({rows.length})
                  </TabsTrigger>
                  <TabsTrigger value="valid" className="gap-1.5 text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="size-3.5" />
                    Hợp lệ ({validRows.length})
                  </TabsTrigger>
                  <TabsTrigger value="invalid" className="gap-1.5 text-destructive">
                    <AlertCircle className="size-3.5" />
                    Cần sửa ({invalidRows.length})
                  </TabsTrigger>
                </TabsList>
              </Tabs>

              {invalidRows.length > 0 && (
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  ⚠️ Có {invalidRows.length} dòng không hợp lệ sẽ bị bỏ qua khi lưu.
                </p>
              )}
            </div>

            {/* Bảng xem trước dữ liệu */}
            <div className="flex-1 overflow-auto rounded-md border text-xs">
              <Table>
                <TableHeader className="sticky top-0 bg-background shadow-sm">
                  <TableRow>
                    <TableHead className="w-12 text-center">Dòng</TableHead>
                    <TableHead className="min-w-40">Món ăn</TableHead>
                    <TableHead className="min-w-40">Nguyên liệu</TableHead>
                    <TableHead className="w-24 text-right">Định lượng</TableHead>
                    <TableHead className="w-20 text-right">Hao hụt %</TableHead>
                    <TableHead className="min-w-32">Ghi chú</TableHead>
                    <TableHead className="w-28 text-center">Trạng thái</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {displayedRows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                        Không có dữ liệu phù hợp với bộ lọc.
                      </TableCell>
                    </TableRow>
                  ) : (
                    displayedRows.map((r) => {
                      const errEntries = Object.entries(r.errors);
                      return (
                        <TableRow key={r.rowIndex} className={cn(!r.isValid && "bg-destructive/5")}>
                          <TableCell className="text-center font-mono text-muted-foreground">
                            {r.rowIndex}
                          </TableCell>
                          <TableCell>
                            <div className="font-medium">{r.data.menu_item_name || "—"}</div>
                            <span className="font-mono text-[11px] text-muted-foreground">
                              {r.data.menu_item_code || "Không có mã"}
                            </span>
                          </TableCell>
                          <TableCell>
                            <div className="font-medium">{r.data.ingredient_name || "—"}</div>
                            <span className="font-mono text-[11px] text-muted-foreground">
                              {r.data.ingredient_code || "Không có mã"}
                            </span>
                          </TableCell>
                          <TableCell className="text-right font-medium tabular-nums">
                            {r.data.quantity ?? "—"} {r.data.unit ? `(${r.data.unit})` : ""}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {r.data.waste_percent !== undefined ? `${r.data.waste_percent}%` : "0%"}
                          </TableCell>
                          <TableCell className="text-muted-foreground truncate max-w-xs">
                            {r.data.note || "—"}
                          </TableCell>
                          <TableCell className="text-center">
                            {r.isValid ? (
                              <StatusBadge tone="success" className="text-[10px] py-0">
                                Sẵn sàng
                              </StatusBadge>
                            ) : (
                              <div className="space-y-1">
                                <StatusBadge tone="danger" className="text-[10px] py-0">
                                  Lỗi
                                </StatusBadge>
                                <p className="text-[10px] text-destructive leading-tight" title={errEntries.map(([, m]) => m).join(", ")}>
                                  {errEntries[0]?.[1]}
                                </p>
                              </div>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        <DialogFooter className="mt-4 flex sm:justify-between items-center gap-2 border-t pt-3">
          <div className="text-xs text-muted-foreground">
            {file && (
              <span>
                Đã duyệt <strong>{validRows.length}</strong> / {rows.length} dòng hợp lệ
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setOpen(false)} disabled={isSubmitting}>
              Đóng
            </Button>
            {file && (
              <SubmitButton
                size="sm"
                pending={isSubmitting}
                pendingText="Đang lưu định lượng..."
                disabled={validRows.length === 0}
                onClick={() => void handleImport()}
                className="gap-2"
              >
                <CheckCircle2 className="size-4" />
                Lưu {validRows.length} dòng định lượng
              </SubmitButton>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
