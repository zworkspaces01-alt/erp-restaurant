"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Merge,
  ArrowRight,
  CheckCircle2,
  Sparkles,
  Building2,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { formatVND } from "@/lib/format";
import {
  mergeSuppliers,
  getDuplicateSupplierCandidates,
  type DuplicateSupplierPair,
} from "@/server-actions/purchases.actions";
import type { SupplierDebtRow } from "@/lib/queries/purchases.queries";
import { toast } from "sonner";

interface SupplierMergeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  suppliers: SupplierDebtRow[];
  preselectedSourceId?: string;
  onSuccess?: () => void;
}

export function SupplierMergeDialog({
  open,
  onOpenChange,
  suppliers,
  preselectedSourceId,
  onSuccess,
}: SupplierMergeDialogProps) {
  const router = useRouter();

  const [targetId, setTargetId] = useState<string>("");
  const [sourceId, setSourceId] = useState<string>(preselectedSourceId || "");
  const [deleteSource, setDeleteSource] = useState<boolean>(true);
  const [loading, setLoading] = useState<boolean>(false);
  const [duplicateCandidates, setDuplicateCandidates] = useState<DuplicateSupplierPair[]>([]);

  // Load auto duplicate recommendations when opening
  useEffect(() => {
    if (open) {
      if (preselectedSourceId) {
        setSourceId(preselectedSourceId);
      }
      getDuplicateSupplierCandidates()
        .then((pairs) => {
          setDuplicateCandidates(pairs);
          // If no target selected yet, and there's a preselectedSourceId in duplicates, suggest the pair
          if (preselectedSourceId && pairs.length > 0) {
            const found = pairs.find((p) => p.idA === preselectedSourceId || p.idB === preselectedSourceId);
            if (found) {
              const other = found.idA === preselectedSourceId ? found.idB : found.idA;
              setTargetId(other);
            }
          }
        })
        .catch((err) => console.error("Could not load duplicate candidates:", err));
    }
  }, [open, preselectedSourceId]);

  const supplierMap = useMemo(() => new Map(suppliers.map((s) => [s.id, s])), [suppliers]);

  const sourceSupplier = useMemo(() => supplierMap.get(sourceId) || null, [supplierMap, sourceId]);
  const targetSupplier = useMemo(() => supplierMap.get(targetId) || null, [supplierMap, targetId]);

  // Apply a suggested duplicate pair
  const applyCandidatePair = (pair: DuplicateSupplierPair) => {
    // Choose the one with higher PO count or code as target
    if (pair.poCountB >= pair.poCountA) {
      setTargetId(pair.idB);
      setSourceId(pair.idA);
    } else {
      setTargetId(pair.idA);
      setSourceId(pair.idB);
    }
  };

  const handleMerge = async () => {
    if (!sourceId || !targetId) {
      toast.error("Vui lòng chọn đầy đủ NCC cần gộp và NCC giữ lại.");
      return;
    }

    if (sourceId === targetId) {
      toast.error("Không thể gộp một nhà cung cấp vào chính nó.");
      return;
    }

    setLoading(true);
    try {
      const res = await mergeSuppliers({
        sourceSupplierId: sourceId,
        targetSupplierId: targetId,
        deleteSource,
      });

      if (res.success) {
        toast.success(
          `Đã gộp thành công "${sourceSupplier?.name}" vào "${targetSupplier?.name}". Toàn bộ phiếu nhập và công nợ đã được chuyển giao.`
        );
        onOpenChange(false);
        router.refresh();
        onSuccess?.();
      } else {
        toast.error(res.error || "Gộp nhà cung cấp thất bại.");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Đã có lỗi xảy ra khi gộp.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2 text-primary">
            <Merge className="size-5" />
            <DialogTitle>Gộp Nhà Cung Cấp Trùng Lặp</DialogTitle>
          </div>
          <DialogDescription className="text-xs text-muted-foreground">
            Chuyển giao toàn bộ phiếu nhập kho, công nợ và nguyên liệu từ NCC trùng lặp sang NCC chính thức.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Smart Duplicate Suggestions */}
          {duplicateCandidates.length > 0 && (
            <div className="rounded-xl border border-primary/20 bg-primary/5 p-3.5 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-primary">
                  <Sparkles className="size-3.5" />
                  <span>Phát hiện {duplicateCandidates.length} cặp NCC có dấu hiệu trùng lặp:</span>
                </div>
                <Badge variant="outline" className="text-[10px] bg-background">
                  Tự động nhận diện
                </Badge>
              </div>

              <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
                {duplicateCandidates.map((pair, idx) => (
                  <div
                    key={idx}
                    onClick={() => applyCandidatePair(pair)}
                    className="p-2.5 rounded-lg border border-border/70 bg-card hover:bg-muted/80 hover:border-primary/50 cursor-pointer transition-all text-xs flex items-center justify-between gap-3 group"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 font-medium truncate">
                        <span className="truncate text-foreground/90">{pair.nameA}</span>
                        <ArrowRight className="size-3 text-muted-foreground shrink-0" />
                        <span className="truncate text-primary font-semibold">{pair.nameB}</span>
                      </div>
                      <div className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-2">
                        <span>{pair.reason}</span>
                        <span>•</span>
                        <span>
                          {pair.poCountA} phiếu vs {pair.poCountB} phiếu
                        </span>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-[11px] group-hover:border-primary group-hover:text-primary shrink-0"
                    >
                      Chọn cặp này
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Supplier Selectors */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Target Supplier (Keeper) */}
            <div className="space-y-1.5 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 flex items-center gap-1">
                  <CheckCircle2 className="size-3.5" />
                  NCC ĐÍCH (GIỮ LẠI)
                </Label>
                <Badge variant="outline" className="text-[10px] border-emerald-500/30 text-emerald-600 bg-emerald-500/10">
                  Chính thức
                </Badge>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Nhà cung cấp chuẩn sẽ nhận toàn bộ hóa đơn và công nợ gộp.
              </p>
              <Select value={targetId} onValueChange={setTargetId}>
                <SelectTrigger className="h-9 text-xs bg-background">
                  <SelectValue placeholder="Chọn NCC giữ lại..." />
                </SelectTrigger>
                <SelectContent className="max-h-56">
                  {suppliers
                    .filter((s) => s.id !== sourceId)
                    .map((s) => (
                      <SelectItem key={s.id} value={s.id} className="text-xs">
                        {s.name} {s.code ? `(${s.code})` : ""}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>

              {targetSupplier && (
                <div className="mt-2 text-[11px] text-muted-foreground space-y-0.5 border-t border-emerald-500/20 pt-1.5">
                  <div>
                    Số phiếu nhập hiện có: <strong className="text-foreground">{targetSupplier.po_count}</strong>
                  </div>
                  <div>
                    Công nợ hiện có: <strong className="text-foreground">{formatVND(targetSupplier.current_debt)}</strong>
                  </div>
                </div>
              )}
            </div>

            {/* Source Supplier (To merge) */}
            <div className="space-y-1.5 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold text-amber-700 dark:text-amber-400 flex items-center gap-1">
                  <Merge className="size-3.5" />
                  NCC NGUỒN (CẦN GỘP)
                </Label>
                <Badge variant="outline" className="text-[10px] border-amber-500/30 text-amber-600 bg-amber-500/10">
                  Trùng lặp
                </Badge>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Nhà cung cấp này sẽ chuyển hết dữ liệu đi và dọn dẹp.
              </p>
              <Select value={sourceId} onValueChange={setSourceId}>
                <SelectTrigger className="h-9 text-xs bg-background">
                  <SelectValue placeholder="Chọn NCC cần gộp vào..." />
                </SelectTrigger>
                <SelectContent className="max-h-56">
                  {suppliers
                    .filter((s) => s.id !== targetId)
                    .map((s) => (
                      <SelectItem key={s.id} value={s.id} className="text-xs">
                        {s.name} {s.code ? `(${s.code})` : ""}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>

              {sourceSupplier && (
                <div className="mt-2 text-[11px] text-muted-foreground space-y-0.5 border-t border-amber-500/20 pt-1.5">
                  <div>
                    Số phiếu sẽ chuyển: <strong className="text-foreground">{sourceSupplier.po_count} phiếu</strong>
                  </div>
                  <div>
                    Công nợ sẽ chuyển: <strong className="text-foreground">{formatVND(sourceSupplier.current_debt)}</strong>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Merge Impact Preview */}
          {sourceSupplier && targetSupplier && (
            <div className="rounded-xl border bg-muted/30 p-3.5 space-y-2 text-xs">
              <div className="font-semibold text-foreground flex items-center gap-1.5">
                <Building2 className="size-4 text-primary" />
                <span>Xem trước kết quả sau khi gộp:</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1 text-[11px]">
                <div className="p-2 rounded-lg bg-background border">
                  <span className="text-muted-foreground block">Tổng phiếu sau gộp</span>
                  <span className="font-bold text-sm text-foreground">
                    {targetSupplier.po_count + sourceSupplier.po_count} phiếu
                  </span>
                  <span className="text-[10px] text-emerald-600 block">
                    (+{sourceSupplier.po_count} phiếu)
                  </span>
                </div>
                <div className="p-2 rounded-lg bg-background border">
                  <span className="text-muted-foreground block">Tổng nợ sau gộp</span>
                  <span className="font-bold text-sm text-foreground">
                    {formatVND(targetSupplier.current_debt + sourceSupplier.current_debt)}
                  </span>
                  <span className="text-[10px] text-primary block">
                    (+{formatVND(sourceSupplier.current_debt)})
                  </span>
                </div>
                <div className="p-2 rounded-lg bg-background border col-span-2 sm:col-span-1">
                  <span className="text-muted-foreground block">Xử lý NCC phụ</span>
                  <span className="font-bold text-sm text-foreground">
                    {deleteSource ? "Xóa vĩnh viễn" : "Vô hiệu hóa"}
                  </span>
                  <span className="text-[10px] text-muted-foreground block">
                    {deleteSource ? "Làm sạch danh mục" : "Đổi is_active=false"}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Options */}
          <div className="flex items-center space-x-2 pt-1">
            <Checkbox
              id="deleteSource"
              checked={deleteSource}
              onCheckedChange={(c) => setDeleteSource(Boolean(c))}
            />
            <label
              htmlFor="deleteSource"
              className="text-xs text-muted-foreground cursor-pointer select-none leading-none"
            >
              Xóa hoàn toàn nhà cung cấp nguồn sau khi đã chuyển giao xong dữ liệu (khuyên dùng để sạch danh mục).
            </label>
          </div>
        </div>

        <DialogFooter className="flex flex-col-reverse sm:flex-row gap-2 pt-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            Hủy bỏ
          </Button>
          <Button
            type="button"
            onClick={handleMerge}
            disabled={!sourceId || !targetId || sourceId === targetId || loading}
            className="gap-1.5"
          >
            <Merge className="size-4" />
            {loading ? "Đang tiến hành gộp..." : "Xác nhận gộp nhà cung cấp"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
