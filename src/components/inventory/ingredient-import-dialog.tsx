"use client";

import { useRouter } from "next/navigation";
import type { IngredientInput } from "@/types/restaurant";
import { downloadIngredientTemplate, parseIngredientExcelFile } from "@/lib/excel";
import { importIngredients } from "@/server-actions/inventory.actions";
import { formatNumber, formatVND } from "@/lib/format";
import { ExcelImportDialog, type ExcelColumnDef } from "@/components/shared/excel-import-dialog";

const columns: ExcelColumnDef<IngredientInput>[] = [
  {
    key: "code",
    label: "Mã NL",
    render: (r) => (
      <span className="font-mono text-xs text-muted-foreground">{r.data.code || "—"}</span>
    ),
  },
  {
    key: "name",
    label: "Tên nguyên liệu",
    render: (r) => <span className="font-medium">{r.data.name || "—"}</span>,
  },
  {
    key: "category",
    label: "Danh mục",
    render: (r) => <span>{r.data.category || "—"}</span>,
  },
  {
    key: "base_unit",
    label: "Đơn vị cơ sở",
    render: (r) => <span className="text-muted-foreground">{r.data.base_unit || "—"}</span>,
  },
  {
    key: "import_unit",
    label: "Đơn vị nhập",
    render: (r) => <span className="text-muted-foreground">{r.data.import_unit || "—"}</span>,
  },
  {
    key: "conversion_factor",
    label: "Hệ số",
    render: (r) => (
      <span className="tabular-nums">
        {r.data.conversion_factor ? formatNumber(r.data.conversion_factor, 2) : "—"}
      </span>
    ),
  },
  {
    key: "default_price",
    label: "Giá nhập ngầm định",
    render: (r) => (
      <span className="tabular-nums font-medium text-right">
        {r.data.default_price ? formatVND(r.data.default_price) : "—"}
      </span>
    ),
  },
  {
    key: "min_alert_stock",
    label: "Cảnh báo tồn",
    render: (r) => (
      <span className="tabular-nums text-muted-foreground">
        {r.data.min_alert_stock ? formatNumber(r.data.min_alert_stock, 2) : "0"}
      </span>
    ),
  },
];

export function IngredientImportDialog({ trigger }: { trigger?: React.ReactNode }) {
  const router = useRouter();

  return (
    <ExcelImportDialog<IngredientInput>
      title="Nhập nguyên liệu từ file Excel"
      description="Tải lên danh sách nguyên liệu từ file Excel (.xlsx, .xls) hoặc CSV. Hệ thống tự động kiểm tra định dạng và đơn vị trước khi lưu."
      trigger={trigger}
      downloadTemplate={downloadIngredientTemplate}
      parseFile={parseIngredientExcelFile}
      onImport={importIngredients}
      columns={columns}
      onSuccess={() => router.refresh()}
    />
  );
}
