import { AlertTriangle, Banknote, CalendarClock, Truck } from "lucide-react";
import { PageHeader, StatCard } from "@/components/shared";
import { SuppliersTable } from "@/components/suppliers/suppliers-table";
import type { SupplierFormData } from "@/components/suppliers/supplier-form-dialog";
import { getSupplierDebtSummary } from "@/lib/queries/purchases.queries";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatVND } from "@/lib/format";

export const metadata = { title: "Nhà cung cấp" };

async function getSupplierDetails(): Promise<SupplierFormData[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("suppliers")
    .select(
      "id, code, name, contact_name, phone, email, address, tax_code, payment_terms_days, is_active, note"
    );
  return (data ?? []).map((s) => ({
    id: s.id,
    code: s.code,
    name: s.name,
    contact_name: s.contact_name,
    phone: s.phone,
    email: s.email,
    address: s.address,
    tax_code: s.tax_code,
    payment_terms_days: s.payment_terms_days ?? 0,
    is_active: s.is_active ?? true,
    note: s.note,
  }));
}

export default async function SuppliersPage() {
  const [rows, details] = await Promise.all([getSupplierDebtSummary(), getSupplierDetails()]);

  const totalDebt = rows.reduce((s, r) => s + r.current_debt, 0);
  const overdueDebt = rows.reduce((s, r) => s + r.overdue_debt, 0);
  const activeCount = rows.filter((r) => r.is_active).length;
  const nextDue = rows
    .map((r) => r.next_due_date)
    .filter((d): d is string => Boolean(d))
    .sort()[0];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Nhà cung cấp"
        description="Công nợ, điều khoản thanh toán và lịch sử mua hàng theo từng nhà cung cấp."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard title="Đang hợp tác" value={String(activeCount)} icon={Truck} hint={`Tổng ${rows.length} nhà cung cấp`} />
        <StatCard title="Tổng công nợ" value={formatVND(totalDebt)} icon={Banknote} tone={totalDebt > 0 ? "info" : "default"} />
        <StatCard
          title="Nợ quá hạn"
          value={formatVND(overdueDebt)}
          icon={AlertTriangle}
          tone={overdueDebt > 0 ? "danger" : "success"}
          hint={overdueDebt > 0 ? "Cần thanh toán ngay" : "Không có khoản quá hạn"}
        />
        <StatCard
          title="Hạn thanh toán gần nhất"
          value={nextDue ? formatDate(nextDue) : "—"}
          icon={CalendarClock}
        />
      </div>

      <SuppliersTable rows={rows} details={details} />
    </div>
  );
}
