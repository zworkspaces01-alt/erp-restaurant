import { AlertTriangle, Banknote, CalendarClock, FileText, PackagePlus, Truck, Wallet } from "lucide-react";
import { DateRangeFilter, Forbidden, PageHeader, StatCard } from "@/components/shared";
import { SuppliersTable } from "@/components/suppliers/suppliers-table";
import type { SupplierFormData } from "@/components/suppliers/supplier-form-dialog";
import {
  getSupplierDebtSummary,
  getSupplierPeriodActivity,
  type SupplierPeriodActivity,
} from "@/lib/queries/purchases.queries";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatVND } from "@/lib/format";
import { requireAuth } from "@/lib/auth";

export const metadata = { title: "Nhà cung cấp" };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function dateParam(value: string | string[] | undefined): string | undefined {
  const v = Array.isArray(value) ? value[0] : value;
  return v && DATE_RE.test(v) ? v : undefined;
}

interface PageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

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
    payment_terms_days: s.payment_terms_days,
    is_active: s.is_active,
    note: s.note,
  }));
}

export default async function SuppliersPage({ searchParams }: PageProps) {
  const { role, authorized } = await requireAuth(["owner", "manager"]);
  if (!authorized) {
    return <Forbidden requiredRoles={["owner", "manager"]} currentRole={role} />;
  }

  const params = await searchParams;
  const from = dateParam(params.from);
  const to = dateParam(params.to);
  const hasPeriod = Boolean(from || to);

  const [rows, details, activity] = await Promise.all([
    getSupplierDebtSummary(),
    getSupplierDetails(),
    hasPeriod ? getSupplierPeriodActivity({ from, to }) : Promise.resolve(null),
  ]);

  const periodTotals = Object.values(activity ?? {}).reduce<SupplierPeriodActivity>(
    (acc, a) => ({ po_count: acc.po_count + a.po_count, purchased: acc.purchased + a.purchased, paid: acc.paid + a.paid }),
    { po_count: 0, purchased: 0, paid: 0 }
  );
  const periodLabel = hasPeriod
    ? `${from ? formatDate(from) : "Từ đầu"} – ${to ? formatDate(to) : "nay"}`
    : "";

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

      <DateRangeFilter key={`${from ?? ""}_${to ?? ""}`} from={from} to={to} idPrefix="suppliers" />

      {activity ? (
        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard
            title="Nhập trong kỳ"
            value={formatVND(periodTotals.purchased)}
            icon={PackagePlus}
            hint={periodLabel}
          />
          <StatCard
            title="Đã thanh toán trong kỳ"
            value={formatVND(periodTotals.paid)}
            icon={Wallet}
            tone={periodTotals.paid > 0 ? "success" : "default"}
            hint={periodLabel}
          />
          <StatCard
            title="Phiếu nhập trong kỳ"
            value={String(periodTotals.po_count)}
            icon={FileText}
            hint={`${Object.keys(activity).length} nhà cung cấp có phát sinh`}
          />
        </div>
      ) : null}

      <SuppliersTable rows={rows} details={details} activity={activity} />
    </div>
  );
}
