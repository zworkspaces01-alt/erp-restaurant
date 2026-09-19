"use client";

import { useState, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  FileSpreadsheet,
  UploadCloud,
  CheckCircle2,
  RotateCcw,
  Download,
} from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatNumber, formatVND, todayISO } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  parseStocktakeExcelFile,
  downloadStocktakeExcel,
} from "@/lib/excel";
import { recordStocktakeSheet } from "@/server-actions/inventory.actions";
import { normalizeVietnamese } from "@/lib/ai/invoice-matcher";
import type { StocktakeRow } from "./stocktake-sheet";

interface MatchedStocktakeRow {
  rowIdx: number;
  ingredient: StocktakeRow | null;
  rawName: string;
  rawCode?: string;
  counted: number;
  delta: number | null;
  varianceValue: number;
  status: "match_diff" | "match_equal" | "not_found";
  note?: string;
}

interface StocktakeImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stockRows: StocktakeRow[];
  onSuccess?: () => void;
}

export function StocktakeImportDialog({
  open,
  onOpenChange,
  stockRows,
  onSuccess,
}: StocktakeImportDialogProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [txnAt, setTxnAt] = useState(todayISO());
  const [generalNote, setGeneralNote] = useState("Kiểm kê thực tế qua file Excel");
  const [matchedRows, setMatchedRows] = useState<MatchedStocktakeRow[]>([]);
  const [filterTab, setFilterTab] = useState<"all" | "diff" | "error">("all");

  // Lookup maps for matching
  const mapByCode = useMemo(() => {
    const m = new Map<string, StocktakeRow>();
    for (const r of stockRows) {
      if (r.code) m.set(r.code.trim().toUpperCase(), r);
    }
    return m;
  }, [stockRows]);

  const mapByName = useMemo(() => {
    const m = new Map<string, StocktakeRow>();
    for (const r of stockRows) {
      m.set(normalizeVietnamese(r.name), r);
    }
    return m;
  }, [stockRows]);

  const resetState = () => {
    setFile(null);
    setMatchedRows([]);
    setParsing(false);
    setSaving(false);
    setFilterTab("all");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleFileSelected = async (selectedFile: File) => {
    setFile(selectedFile);
    setParsing(true);
    try {
      const parsed = await parseStocktakeExcelFile(selectedFile);
      if (parsed.length === 0) {
        toast.error("File không có dữ liệu hoặc không đúng định dạng cột kiểm kê.");
        setFile(null);
        return;
      }

      // Match rows
      const matched: MatchedStocktakeRow[] = parsed.map((p) => {
        let ing: StocktakeRow | null = null;
        if (p.code) {
          ing = mapByCode.get(p.code.trim().toUpperCase()) || null;
        }
        if (!ing && p.name) {
          ing = mapByName.get(normalizeVietnamese(p.name)) || null;
        }

        if (!ing) {
          return {
            rowIdx: p.rowIndex,
            ingredient: null,
            rawName: p.name,
            rawCode: p.code,
            counted: p.counted,
            delta: null,
            varianceValue: 0,
            status: "not_found",
            note: p.note,
          };
        }

        const delta = Number((p.counted - ing.current_stock).toFixed(3));
        const varianceValue = delta * ing.avg_cost_price;
        return {
          rowIdx: p.rowIndex,
          ingredient: ing,
          rawName: p.name,
          rawCode: p.code,
          counted: p.counted,
          delta,
          varianceValue,
          status: delta !== 0 ? "match_diff" : "match_equal",
          note: p.note,
        };
      });

      setMatchedRows(matched);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Lỗi khi đọc file Excel.");
      setFile(null);
    } finally {
      setParsing(false);
    }
  };

  // Stats
  const validMatches = useMemo(() => matchedRows.filter((r) => r.ingredient !== null), [matchedRows]);
  const diffRows = useMemo(() => matchedRows.filter((r) => r.status === "match_diff"), [matchedRows]);
  const notFoundRows = useMemo(() => matchedRows.filter((r) => r.status === "not_found"), [matchedRows]);
  const totalVarianceValue = useMemo(() => diffRows.reduce((s, r) => s + r.varianceValue, 0), [diffRows]);

  const displayedRows = useMemo(() => {
    if (filterTab === "diff") return diffRows;
    if (filterTab === "error") return notFoundRows;
    return matchedRows;
  }, [matchedRows, diffRows, notFoundRows, filterTab]);

  const handleSaveStocktake = async () => {
    if (diffRows.length === 0) {
      toast.info("Tất cả số lượng trong file đều khớp với tồn sổ sách, không phát sinh chênh lệch cần điều chỉnh.");
      onOpenChange(false);
      return;
    }

    setSaving(true);
    try {
      const res = await recordStocktakeSheet({
        txn_at: txnAt,
        note: generalNote.trim() || undefined,
        lines: diffRows.map((r) => ({
          ingredient_id: r.ingredient!.id,
          counted: r.counted,
        })),
      });

      if (res.success) {
        toast.success(
          `Cập nhật kiểm kho thành công! Đã ghi nhận ${res.data.recorded} mặt hàng có chênh lệch vào sổ kho.`
        );
        onOpenChange(false);
        resetState();
        router.refresh();
        onSuccess?.();
      } else {
        toast.error(res.error || "Không thể lưu kiểm kê.");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Đã có lỗi xảy ra.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <div className="flex items-center gap-2 text-primary">
            <FileSpreadsheet className="size-5" />
            <DialogTitle>Nhập kết quả kiểm kho từ file Excel</DialogTitle>
          </div>
          <DialogDescription className="text-xs text-muted-foreground">
            Tải lên file Excel bạn đã điền số đếm thực tế. Hệ thống sẽ so khớp mã/tên nguyên liệu và tính chênh lệch tồn kho.
          </DialogDescription>
        </DialogHeader>

        {!file ? (
          <div className="space-y-4 py-4">
            <div
              onClick={() => fileInputRef.current?.click()}
              className="flex flex-col items-center justify-center p-8 border-2 border-dashed rounded-xl border-border hover:border-primary cursor-pointer transition-colors bg-muted/20 hover:bg-muted/40"
            >
              <UploadCloud className="size-10 text-primary mb-3" />
              <div className="text-sm font-medium">Nhấp để chọn file Excel hoặc kéo thả vào đây</div>
              <div className="text-xs text-muted-foreground mt-1">
                Hỗ trợ các định dạng .xlsx, .xls, .csv
              </div>
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

            <div className="flex items-center justify-between rounded-lg border p-3 bg-muted/10 text-xs">
              <div>
                <span className="font-semibold">Chưa có file mẫu?</span>
                <span className="text-muted-foreground ml-1">
                  Xuất file danh sách tồn kho hiện tại để in ra hoặc điền số đếm:
                </span>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 h-8 text-xs shrink-0"
                onClick={() => downloadStocktakeExcel(stockRows)}
              >
                <Download className="size-3.5" />
                Tải file mẫu Excel
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-hidden flex flex-col space-y-3">
            {/* Top configuration and stats */}
            <div className="grid gap-3 sm:grid-cols-3 pt-2">
              <div className="space-y-1">
                <Label htmlFor="import-date" className="text-xs font-semibold">
                  Ngày kiểm kê
                </Label>
                <Input
                  id="import-date"
                  type="date"
                  max={todayISO()}
                  value={txnAt}
                  onChange={(e) => setTxnAt(e.target.value)}
                  className="h-8 text-xs"
                />
              </div>
              <div className="sm:col-span-2 space-y-1">
                <Label htmlFor="import-note" className="text-xs font-semibold">
                  Ghi chú đợt kiểm kho
                </Label>
                <Input
                  id="import-note"
                  placeholder="Ghi chú chung..."
                  value={generalNote}
                  onChange={(e) => setGeneralNote(e.target.value)}
                  className="h-8 text-xs"
                />
              </div>
            </div>

            {/* Quick summary badges */}
            <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-lg border bg-muted/20 text-xs">
              <div className="flex items-center gap-3">
                <span>
                  Tổng dòng: <strong>{matchedRows.length}</strong>
                </span>
                <span>•</span>
                <span className="text-primary font-medium">
                  Khớp kho: {validMatches.length}
                </span>
                <span>•</span>
                <span className="text-amber-600 font-semibold">
                  Lệch tồn: {diffRows.length} dòng
                </span>
                {notFoundRows.length > 0 && (
                  <>
                    <span>•</span>
                    <span className="text-destructive font-semibold">
                      Không tìm thấy: {notFoundRows.length}
                    </span>
                  </>
                )}
              </div>
              <div className="font-medium">
                Giá trị lệch:{" "}
                <span
                  className={cn(
                    "font-bold",
                    totalVarianceValue < 0
                      ? "text-destructive"
                      : totalVarianceValue > 0
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-muted-foreground"
                  )}
                >
                  {formatVND(totalVarianceValue)}
                </span>
              </div>
            </div>

            {/* Filter Tabs */}
            <Tabs
              value={filterTab}
              onValueChange={(v) => setFilterTab(v as "all" | "diff" | "error")}
              className="w-full"
            >
              <div className="flex items-center justify-between">
                <TabsList className="h-7 text-xs">
                  <TabsTrigger value="all" className="h-6 text-xs">
                    Tất cả ({matchedRows.length})
                  </TabsTrigger>
                  <TabsTrigger value="diff" className="h-6 text-xs">
                    Có chênh lệch ({diffRows.length})
                  </TabsTrigger>
                  {notFoundRows.length > 0 && (
                    <TabsTrigger value="error" className="h-6 text-xs text-destructive">
                      Không khớp ({notFoundRows.length})
                    </TabsTrigger>
                  )}
                </TabsList>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 text-[11px] gap-1 text-muted-foreground"
                  onClick={resetState}
                >
                  <RotateCcw className="size-3" />
                  Chọn file khác
                </Button>
              </div>
            </Tabs>

            {/* Preview table */}
            <div className="flex-1 overflow-auto rounded-lg border max-h-[42vh]">
              <Table>
                <TableHeader className="sticky top-0 bg-muted/60 text-xs">
                  <TableRow>
                    <TableHead className="w-10 text-center">#</TableHead>
                    <TableHead>Nguyên liệu</TableHead>
                    <TableHead className="text-right">Tồn sổ</TableHead>
                    <TableHead className="text-right font-bold">Số đếm thực tế</TableHead>
                    <TableHead className="text-right">Chênh lệch</TableHead>
                    <TableHead className="text-right">Giá trị lệch</TableHead>
                    <TableHead className="text-center w-24">Trạng thái</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="text-xs">
                  {displayedRows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-6 text-muted-foreground">
                        Không có dữ liệu phù hợp với bộ lọc.
                      </TableCell>
                    </TableRow>
                  ) : (
                    displayedRows.map((r) => {
                      const isNotFound = r.status === "not_found";
                      const ing = r.ingredient;
                      const delta = r.delta;
                      return (
                        <TableRow key={r.rowIdx} className={cn(isNotFound && "bg-destructive/5")}>
                          <TableCell className="text-center text-muted-foreground tabular-nums">
                            {r.rowIdx}
                          </TableCell>
                          <TableCell>
                            <div className="font-medium">
                              {ing ? ing.name : r.rawName || "Chưa có tên"}
                            </div>
                            <div className="text-[11px] text-muted-foreground">
                              {ing ? `${ing.code ?? "—"} · ${ing.base_unit}` : r.rawCode || "Không mã"}
                            </div>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {ing ? formatNumber(ing.current_stock, 3) : "—"}
                          </TableCell>
                          <TableCell className="text-right tabular-nums font-semibold">
                            {formatNumber(r.counted, 3)} {ing?.base_unit}
                          </TableCell>
                          <TableCell
                            className={cn(
                              "text-right tabular-nums font-medium",
                              delta === null || delta === 0
                                ? "text-muted-foreground"
                                : delta < 0
                                  ? "text-destructive"
                                  : "text-emerald-600 dark:text-emerald-400"
                            )}
                          >
                            {delta === null
                              ? "—"
                              : `${delta > 0 ? "+" : ""}${formatNumber(delta, 3)}`}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {delta === null || delta === 0
                              ? "—"
                              : formatVND(r.varianceValue)}
                          </TableCell>
                          <TableCell className="text-center">
                            {isNotFound ? (
                              <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                                Không tìm thấy
                              </Badge>
                            ) : delta === 0 ? (
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-muted-foreground">
                                Khớp sổ
                              </Badge>
                            ) : delta && delta < 0 ? (
                              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 text-destructive bg-destructive/10">
                                Thiếu hụt
                              </Badge>
                            ) : (
                              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 text-emerald-600 bg-emerald-50 dark:bg-emerald-950">
                                Dôi thừa
                              </Badge>
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

        <DialogFooter className="gap-2 sm:gap-0 pt-2 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Đóng
          </Button>
          {file && (
            <Button
              onClick={handleSaveStocktake}
              disabled={saving || parsing || diffRows.length === 0}
              className="gap-1.5"
            >
              {saving ? (
                "Đang lưu sổ kho..."
              ) : (
                <>
                  <CheckCircle2 className="size-4" />
                  Xác nhận cập nhật ({diffRows.length} mặt hàng lệch)
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
