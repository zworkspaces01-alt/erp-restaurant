"use client";

import { useRouter } from "next/navigation";
import type { MenuItemInput } from "@/types/restaurant";
import { downloadMenuTemplate, parseMenuExcelFile } from "@/lib/excel";
import { importMenuItems } from "@/server-actions/menu.actions";
import { formatVND } from "@/lib/format";
import { ExcelImportDialog, type ExcelColumnDef } from "@/components/shared/excel-import-dialog";

const columns: ExcelColumnDef<MenuItemInput>[] = [
  {
    key: "code",
    label: "Mã món",
    render: (r) => (
      <span className="font-mono text-xs text-muted-foreground">{r.data.code || "—"}</span>
    ),
  },
  {
    key: "name",
    label: "Tên món",
    render: (r) => <span className="font-medium">{r.data.name || "—"}</span>,
  },
  {
    key: "category",
    label: "Danh mục",
    render: (r) => <span>{r.data.category || "—"}</span>,
  },
  {
    key: "item_group",
    label: "Nhóm món",
    render: (r) => <span>{r.data.item_group || "—"}</span>,
  },
  {
    key: "selling_price",
    label: "Giá bán",
    render: (r) => (
      <span className="font-medium text-right">
        {r.data.selling_price !== undefined ? formatVND(r.data.selling_price) : "—"}
      </span>
    ),
  },
  {
    key: "tax_percent",
    label: "Thuế (%)",
    render: (r) => (
      <span className="tabular-nums">
        {r.data.tax_percent !== undefined ? `${r.data.tax_percent}%` : "0%"}
      </span>
    ),
  },
  {
    key: "is_combo",
    label: "Loại",
    render: (r) => (
      <span className="text-xs">
        {r.data.is_combo ? (
          <span className="text-sky-600 font-medium dark:text-sky-400">Combo</span>
        ) : (
          <span className="text-muted-foreground">Món đơn</span>
        )}
      </span>
    ),
  },
];

export function MenuImportDialog({ trigger }: { trigger?: React.ReactNode }) {
  const router = useRouter();

  return (
    <ExcelImportDialog<MenuItemInput>
      title="Nhập thực đơn từ file Excel"
      description="Tải lên danh sách món ăn từ file Excel (.xlsx, .xls) hoặc CSV. Hệ thống tự động kiểm tra định dạng và dữ liệu trước khi lưu."
      trigger={trigger}
      downloadTemplate={downloadMenuTemplate}
      parseFile={parseMenuExcelFile}
      onImport={importMenuItems}
      columns={columns}
      onSuccess={() => router.refresh()}
    />
  );
}
