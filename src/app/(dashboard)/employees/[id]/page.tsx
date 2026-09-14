import { notFound } from "next/navigation";
import Link from "next/link";
import { CalendarClock, Clock, Wallet } from "lucide-react";
import { getEmployeeDetail } from "@/lib/queries/hr.queries";
import {
  EMPLOYMENT_TYPE_LABELS,
  PAYROLL_STATUS_LABELS,
  payrollStatusTone,
} from "@/types/restaurant";
import { formatDate, formatNumber, formatVND } from "@/lib/format";
import { EmptyState, PageHeader, StatCard, StatusBadge } from "@/components/shared";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmployeeFormDialog } from "@/components/hr/employee-form-dialog";

export const metadata = { title: "Hồ sơ nhân viên | Restaurant ERP" };

export default async function EmployeeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const detail = await getEmployeeDetail(id);
  if (!detail) notFound();

  const { employee, timekeeping, payrollHistory, totalHours30d } = detail;
  const isFullTime = employee.employment_type === "full_time";
  const lastPaid = payrollHistory.find((p) => p.is_paid);

  return (
    <div className="space-y-6">
      <PageHeader
        title={employee.full_name}
        description={`${employee.code ? `${employee.code} · ` : ""}${employee.position ?? "Chưa có vị trí"} · ${EMPLOYMENT_TYPE_LABELS[employee.employment_type]}`}
        breadcrumbs={[
          { label: "Nhân viên", href: "/employees" },
          { label: employee.full_name },
        ]}
        actions={<EmployeeFormDialog employee={employee} />}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          title={isFullTime ? "Lương cơ bản / tháng" : "Lương theo giờ"}
          value={formatVND(isFullTime ? employee.base_salary : employee.hourly_rate)}
          hint={`Phụ cấp ${formatVND(employee.allowance)}`}
          icon={Wallet}
          tone="info"
        />
        <StatCard
          title="Giờ công gần đây"
          value={`${formatNumber(totalHours30d, 1)} giờ`}
          hint={`${formatNumber(timekeeping.length)} lượt chấm công gần nhất`}
          icon={Clock}
        />
        <StatCard
          title="Kỳ lương đã chi gần nhất"
          value={lastPaid ? formatVND(lastPaid.net_pay) : "—"}
          hint={lastPaid?.payroll_periods?.name ?? "Chưa có kỳ lương đã chi trả"}
          icon={CalendarClock}
          tone={lastPaid ? "success" : "default"}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Thông tin hồ sơ</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Trạng thái">
            <StatusBadge tone={employee.is_active ? "success" : "neutral"} dot>
              {employee.is_active ? "Đang làm việc" : "Đã nghỉ việc"}
            </StatusBadge>
          </Field>
          <Field label="Ngày vào làm">{formatDate(employee.start_date)}</Field>
          <Field label="Ngày nghỉ việc">{employee.end_date ? formatDate(employee.end_date) : "—"}</Field>
          <Field label="Số điện thoại">{employee.phone ?? "—"}</Field>
          <Field label="Email">{employee.email ?? "—"}</Field>
          <Field label="Tài khoản ngân hàng">{employee.bank_account ?? "—"}</Field>
          {isFullTime && (
            <Field label="Số công chuẩn / tháng">
              {formatNumber(employee.standard_days_per_month)} công
            </Field>
          )}
          <Field label="Ghi chú" className="sm:col-span-2">
            {employee.note ?? "—"}
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="text-base">Chấm công gần đây</CardTitle>
          <Link href="/timekeeping" className="text-sm text-primary hover:underline">
            Xem sổ chấm công
          </Link>
        </CardHeader>
        <CardContent className="p-0">
          {timekeeping.length === 0 ? (
            <div className="p-6">
              <EmptyState icon={Clock} title="Chưa có dữ liệu chấm công" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b bg-muted/40 text-xs text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">Ngày</th>
                    <th className="px-4 py-3 font-medium">Ca</th>
                    <th className="px-4 py-3 font-medium">Giờ vào</th>
                    <th className="px-4 py-3 font-medium">Giờ ra</th>
                    <th className="px-4 py-3 text-right font-medium">Số giờ</th>
                    <th className="px-4 py-3 font-medium">Ghi chú</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {timekeeping.map((t) => (
                    <tr key={t.id} className="hover:bg-muted/30">
                      <td className="whitespace-nowrap px-4 py-2.5">{formatDate(t.work_date)}</td>
                      <td className="px-4 py-2.5 text-muted-foreground">{t.shift ?? "—"}</td>
                      <td className="px-4 py-2.5 tabular-nums text-muted-foreground">
                        {t.check_in?.slice(0, 5) ?? "—"}
                      </td>
                      <td className="px-4 py-2.5 tabular-nums text-muted-foreground">
                        {t.check_out?.slice(0, 5) ?? "—"}
                      </td>
                      <td className="px-4 py-2.5 text-right font-medium tabular-nums">
                        {formatNumber(t.hours_worked, 1)}
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground">{t.note ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Lịch sử lương</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {payrollHistory.length === 0 ? (
            <div className="p-6">
              <EmptyState icon={Wallet} title="Chưa có kỳ lương nào" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b bg-muted/40 text-xs text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">Kỳ lương</th>
                    <th className="px-4 py-3 font-medium">Thời gian</th>
                    <th className="px-4 py-3 text-right font-medium">Công / Giờ</th>
                    <th className="px-4 py-3 text-right font-medium">Lương cơ bản</th>
                    <th className="px-4 py-3 text-right font-medium">Thưởng + Tip</th>
                    <th className="px-4 py-3 text-right font-medium">Trừ</th>
                    <th className="px-4 py-3 text-right font-medium">Thực nhận</th>
                    <th className="px-4 py-3 text-center font-medium">Trạng thái</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {payrollHistory.map((item) => {
                    const period = item.payroll_periods;
                    return (
                      <tr key={item.id} className="hover:bg-muted/30">
                        <td className="px-4 py-2.5 font-medium">
                          {period ? (
                            <Link href={`/payroll/${period.id}`} className="hover:underline">
                              {period.name}
                            </Link>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="whitespace-nowrap px-4 py-2.5 text-xs text-muted-foreground">
                          {period
                            ? `${formatDate(period.period_start)} – ${formatDate(period.period_end)}`
                            : "—"}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums">
                          {item.employment_type === "full_time"
                            ? `${formatNumber(item.total_days, 1)} công`
                            : `${formatNumber(item.total_hours, 1)} giờ`}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{formatVND(item.base_pay)}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums">
                          {formatVND(Number(item.bonus) + Number(item.tips))}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-destructive">
                          {formatVND(Number(item.advance_deduction) + Number(item.penalty))}
                        </td>
                        <td className="px-4 py-2.5 text-right font-semibold tabular-nums">
                          {formatVND(item.net_pay)}
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          {period && (
                            <StatusBadge tone={payrollStatusTone(period.status)}>
                              {PAYROLL_STATUS_LABELS[period.status]}
                            </StatusBadge>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <div className="mt-1 text-foreground">{children}</div>
    </div>
  );
}
