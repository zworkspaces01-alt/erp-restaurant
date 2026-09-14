import { notFound } from "next/navigation";
import { Banknote, Users, Wallet } from "lucide-react";
import { getPayrollPeriodDetail } from "@/lib/queries/hr.queries";
import {
  PAYMENT_METHOD_LABELS,
  PAYROLL_STATUS_LABELS,
  payrollStatusTone,
} from "@/types/restaurant";
import { formatDate, formatDateTime, formatNumber, formatVND } from "@/lib/format";
import { PageHeader, StatCard, StatusBadge } from "@/components/shared";
import { Card, CardContent } from "@/components/ui/card";
import { PayrollActions } from "@/components/hr/payroll-actions";
import { PayrollItemsTable } from "@/components/hr/payroll-items-table";

export const metadata = { title: "Bảng lương | Restaurant ERP" };

export default async function PayrollDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const detail = await getPayrollPeriodDetail(id);
  if (!detail) notFound();

  const { period, items, status } = detail;
  // gross_pay = base + allowance + bonus + tips − penalty (không trừ tạm ứng),
  // đúng phần chi phí nhân công mà `get_pnl_report` tính.
  const totalGross = items.reduce(
    (sum, i) =>
      sum +
      Number(i.base_pay) +
      Number(i.allowance) +
      Number(i.bonus) +
      Number(i.tips) -
      Number(i.penalty),
    0
  );
  const totalBonus = items.reduce((sum, i) => sum + Number(i.bonus) + Number(i.tips), 0);
  const totalDeduction = items.reduce(
    (sum, i) => sum + Number(i.advance_deduction) + Number(i.penalty),
    0
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title={period.name}
        description={`Kỳ lương ${formatDate(period.period_start)} – ${formatDate(period.period_end)}`}
        breadcrumbs={[{ label: "Kỳ lương", href: "/payroll" }, { label: period.name }]}
        actions={<PayrollActions periodId={period.id} status={status} itemCount={items.length} />}
      />

      <Card>
        <CardContent className="flex flex-wrap items-center gap-x-8 gap-y-3 py-4 text-sm">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Trạng thái:</span>
            <StatusBadge tone={payrollStatusTone(status)} dot>
              {PAYROLL_STATUS_LABELS[status]}
            </StatusBadge>
          </div>
          <div>
            <span className="text-muted-foreground">Chốt lúc: </span>
            {period.finalized_at ? formatDateTime(period.finalized_at) : "—"}
          </div>
          <div>
            <span className="text-muted-foreground">Chi trả lúc: </span>
            {period.paid_at ? formatDateTime(period.paid_at) : "—"}
          </div>
          <div>
            <span className="text-muted-foreground">Hình thức: </span>
            {period.payment_method ? PAYMENT_METHOD_LABELS[period.payment_method] : "—"}
          </div>
          {period.note && (
            <div className="text-muted-foreground">Ghi chú: {period.note}</div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Tổng thực chi"
          value={formatVND(period.total_net_pay)}
          hint={`Tính từ ${formatNumber(items.length)} dòng lương`}
          icon={Banknote}
          tone="info"
        />
        <StatCard
          title="Chi phí nhân sự (P&L)"
          value={formatVND(totalGross)}
          hint="Lương trước khấu trừ tạm ứng — khớp chi phí nhân công báo cáo P&L"
          icon={Wallet}
        />
        <StatCard
          title="Thưởng + Tip"
          value={formatVND(totalBonus)}
          hint="Khoản cộng thêm ngoài lương cơ bản"
          icon={Banknote}
          tone="success"
        />
        <StatCard
          title="Tạm ứng + Khấu trừ"
          value={formatVND(totalDeduction)}
          hint={`${formatNumber(items.length)} nhân viên trong kỳ`}
          icon={Users}
          tone="danger"
        />
      </div>

      {status === "draft" && items.length > 0 && (
        <p className="text-sm text-muted-foreground">
          Kỳ lương đang ở trạng thái nháp: có thể sửa trực tiếp thưởng, tip, tạm ứng và khấu trừ
          trong bảng bên dưới. Sau khi chốt, bảng lương sẽ bị khóa.
        </p>
      )}

      <PayrollItemsTable items={items} status={status} />
    </div>
  );
}
