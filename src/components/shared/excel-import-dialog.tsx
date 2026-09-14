"use client";

import { useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  FileUp,
  RotateCcw,
  UploadCloud,
} from "lucide-react";
import { toast } from "sonner";
import type { ActionResult } from "@/types/actions";
import type { ImportResult } from "@/server-actions/menu.actions";
import type { ParsedExcelRow } from "@/lib/excel";
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

export interface ExcelColumnDef<T> {
  key: string;
  label: string;
  render?: (row: ParsedExcelRow<T>) => React.ReactNode;
}

export interface ExcelImportDialogProps<T> {
  title: string;
  description: string;
  trigger?: React.ReactNode;
  downloadTemplate: () => void;
  parseFile: (file: File) => Promise<ParsedExcelRow<T>[]>;
  onImport: (validItems: T[], mode: "skip" | "update") => Promise<ActionResult<ImportResult>>;
  columns: ExcelColumnDef<T>[];
  onSuccess?: () => void;
}

export function ExcelImportDialog<T>({
  title,
  description,
  trigger,
  downloadTemplate,
  parseFile,
  onImport,
  columns,
  onSuccess,
}: ExcelImportDialogProps<T>) {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<ParsedExcelRow<T>[]>([]);
  const [mode, setMode] = useState<"skip" | "update">("skip");
  const [filterTab, setFilterTab] = useState<"all" | "error">("all");
  const [parsing, setParsing] = useState(false);
  const [pending, setPending] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const validRows = useMemo(() => rows.filter((r) => r.isValid), [rows]);
  const errorRows = useMemo(() => rows.filter((r) => !r.isValid), [rows]);

  const displayedRows = useMemo(() => {
    if (filterTab === "error") return errorRows;
    return rows;
  }, [rows, errorRows, filterTab]);

  function resetState() {
    setFile(null);
    setRows([]);
    setMode("skip");
    setFilterTab("all");
    setParsing(false);
    setPending(false);
    setServerError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleFileSelected(selectedFile: File) {
    setServerError(null);
    setFile(selectedFile);
    setParsing(true);
    try {
      const parsed = await parseFile(selectedFile);
      setRows(parsed);
      if (parsed.some((r) => !r.isValid)) {
        setFilterTab("all");
      }
    } catch (err) {
      setServerError(err instanceof Error ? err.message : "Không thể đọc file Excel");
      setRows([]);
    } finally {
      setParsing(false);
    }
  }

  async function handleImport() {
    if (validRows.length === 0) return;
    setPending(true);
    setServerError(null);
    try {
      const validData = validRows.map((r) => r.data as T);
      const res = await onImport(validData, mode);
      if (res.success) {
        toast.success(
          `Đã nhập thành công ${res.data.total} mục (Thêm mới: ${res.data.inserted}, Cập nhật: ${res.data.updated}, Bỏ qua: ${res.data.skipped})`
        );
        setOpen(false);
        resetState();
        onSuccess?.();
      } else {
        setServerError(res.error);
      }
    } catch (err) {
      setServerError(err instanceof Error ? err.message : "Đã xảy ra lỗi khi nhập dữ liệu");
    } finally {
      setPending(false);
    }
  }

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
          <Button variant="outline" size="sm">
            <FileSpreadsheet className="size-4" />
            Nhập Excel
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] sm:max-w-4xl flex flex-col p-0">
        <DialogHeader className="p-6 pb-2 border-b shrink-0">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <DialogTitle className="text-xl flex items-center gap-2">
                <FileSpreadsheet className="size-5 text-emerald-600" />
                {title}
              </DialogTitle>
              <DialogDescription className="mt-1">{description}</DialogDescription>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={downloadTemplate}
              className="gap-1.5"
            >
              <Download className="size-3.5" />
              Tải file mẫu (.xlsx)
            </Button>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Khu vực nạp file */}
          {!file ? (
            <div
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const droppedFile = e.dataTransfer.files[0];
                if (droppedFile) void handleFileSelected(droppedFile);
              }}
              className="flex flex-col items-center justify-center border-2 border-dashed rounded-xl p-10 cursor-pointer transition-colors border-border hover:border-primary/50 hover:bg-primary/5 text-center"
            >
              <div className="rounded-full bg-primary/10 p-4 mb-3">
                <UploadCloud className="size-8 text-primary" />
              </div>
              <p className="text-sm font-semibold">Bấm để tải file lên hoặc kéo thả vào đây</p>
              <p className="text-xs text-muted-foreground mt-1">Hỗ trợ định dạng .xlsx, .xls, .csv</p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx, .xls, .csv"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleFileSelected(f);
                }}
              />
            </div>
          ) : (
            <div className="space-y-4">
              {/* Tóm tắt file & thanh điều khiển */}
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/40 p-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <FileUp className="size-5 text-primary shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{file.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {(file.size / 1024).toFixed(1)} KB · {rows.length} dòng được tìm thấy
                    </p>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={pending}
                  onClick={resetState}
                  className="gap-1 text-xs"
                >
                  <RotateCcw className="size-3.5" />
                  Chọn file khác
                </Button>
              </div>

              {/* Tùy chọn trùng mã */}
              <div className="rounded-lg border p-3.5 space-y-2 bg-background">
                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Xử lý khi trùng mã trong hệ thống
                </Label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <button
                    type="button"
                    onClick={() => setMode("skip")}
                    className={cn(
                      "flex items-start gap-2.5 rounded-lg border p-3 text-left transition-colors",
                      mode === "skip"
                        ? "border-primary bg-primary/5 text-primary"
                        : "border-border text-muted-foreground hover:border-foreground/20"
                    )}
                  >
                    <div
                      className={cn(
                        "size-4 mt-0.5 rounded-full border flex items-center justify-center shrink-0",
                        mode === "skip" ? "border-primary" : "border-muted-foreground"
                      )}
                    >
                      {mode === "skip" && <div className="size-2 rounded-full bg-primary" />}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-foreground">Bỏ qua nếu trùng mã</p>
                      <p className="text-xs text-muted-foreground mt-0.5 font-normal">
                        Giữ nguyên dữ liệu cũ, chỉ thêm các mục mới chưa có.
                      </p>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setMode("update")}
                    className={cn(
                      "flex items-start gap-2.5 rounded-lg border p-3 text-left transition-colors",
                      mode === "update"
                        ? "border-primary bg-primary/5 text-primary"
                        : "border-border text-muted-foreground hover:border-foreground/20"
                    )}
                  >
                    <div
                      className={cn(
                        "size-4 mt-0.5 rounded-full border flex items-center justify-center shrink-0",
                        mode === "update" ? "border-primary" : "border-muted-foreground"
                      )}
                    >
                      {mode === "update" && <div className="size-2 rounded-full bg-primary" />}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-foreground">Cập nhật nếu trùng mã</p>
                      <p className="text-xs text-muted-foreground mt-0.5 font-normal">
                        Ghi đè thông tin mới lên các mã đã tồn tại.
                      </p>
                    </div>
                  </button>
                </div>
              </div>

              {/* Thống kê & Bảng xem trước */}
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <StatusBadge tone="neutral">Tổng: {rows.length}</StatusBadge>
                    <StatusBadge tone="success">Hợp lệ: {validRows.length}</StatusBadge>
                    {errorRows.length > 0 && (
                      <StatusBadge tone="danger">Lỗi: {errorRows.length}</StatusBadge>
                    )}
                  </div>

                  {errorRows.length > 0 && (
                    <Tabs
                      value={filterTab}
                      onValueChange={(v: string) => setFilterTab(v as "all" | "error")}
                    >
                      <TabsList className="h-8">
                        <TabsTrigger value="all" className="text-xs px-2.5">
                          Tất cả ({rows.length})
                        </TabsTrigger>
                        <TabsTrigger value="error" className="text-xs px-2.5 text-destructive">
                          Chỉ dòng lỗi ({errorRows.length})
                        </TabsTrigger>
                      </TabsList>
                    </Tabs>
                  )}
                </div>

                {parsing ? (
                  <div className="py-12 text-center text-sm text-muted-foreground">
                    Đang đọc và kiểm tra dữ liệu file...
                  </div>
                ) : (
                  <div className="max-h-72 overflow-auto rounded-lg border">
                    <Table>
                      <TableHeader className="sticky top-0 bg-background z-10">
                        <TableRow>
                          <TableHead className="w-14 text-center">Dòng</TableHead>
                          <TableHead className="w-24 text-center">Trạng thái</TableHead>
                          {columns.map((col) => (
                            <TableHead key={col.key}>{col.label}</TableHead>
                          ))}
                          <TableHead className="min-w-44">Ghi chú lỗi</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {displayedRows.length === 0 ? (
                          <TableRow>
                            <TableCell
                              colSpan={columns.length + 3}
                              className="text-center py-6 text-muted-foreground"
                            >
                              Không có dữ liệu
                            </TableCell>
                          </TableRow>
                        ) : (
                          displayedRows.map((row) => (
                            <TableRow
                              key={row.rowIndex}
                              className={cn(!row.isValid && "bg-destructive/5")}
                            >
                              <TableCell className="text-center font-mono text-xs text-muted-foreground">
                                {row.rowIndex}
                              </TableCell>
                              <TableCell className="text-center">
                                {row.isValid ? (
                                  <StatusBadge tone="success" className="gap-1">
                                    <CheckCircle2 className="size-3" />
                                    Hợp lệ
                                  </StatusBadge>
                                ) : (
                                  <StatusBadge tone="danger" className="gap-1">
                                    <AlertCircle className="size-3" />
                                    Lỗi
                                  </StatusBadge>
                                )}
                              </TableCell>
                              {columns.map((col) => (
                                <TableCell key={col.key} className="text-xs">
                                  {col.render ? col.render(row) : String((row.data as Record<string, unknown>)[col.key] ?? "—")}
                                </TableCell>
                              ))}
                              <TableCell className="text-xs text-destructive">
                                {Object.values(row.errors).join(", ") || "—"}
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
            </div>
          )}

          <FormServerError message={serverError} />
        </div>

        <DialogFooter className="p-4 px-6 border-t shrink-0 flex items-center justify-between sm:justify-between">
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => setOpen(false)}
          >
            Đóng
          </Button>
          <SubmitButton
            type="button"
            pending={pending}
            pendingText="Đang nhập dữ liệu..."
            disabled={!file || validRows.length === 0 || parsing}
            onClick={handleImport}
          >
            Tiến hành nhập ({validRows.length} dòng hợp lệ)
          </SubmitButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
