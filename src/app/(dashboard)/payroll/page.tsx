import { CalendarRange, Wallet, FileCheck2 } from "lucide-react";
import { getPayrollPeriods } from "@/lib/queries/hr.queries";
import { formatNumber, formatVND } from "@/lib/format";
import { EmptyState, Forbidden, PageHeader, StatCard } from "@/components/shared";
import { CreatePayrollDialog } from "@/components/hr/create-payroll-dialog";
import { PayrollPeriodsTable } from "@/components/hr/payroll-periods-table";
import { requireAuth } from "@/lib/auth";

export const metadata = { title: "Kỳ lương | Restaurant ERP" };

export default async function PayrollPage() {
  const { role, authorized } = await requireAuth(["owner", "manager"]);
  if (!authorized) {
    return <Forbidden requiredRoles={["owner", "manager"]} currentRole={role} />;
  }

  // Tính ở server theo giờ Việt Nam để client không phụ thuộc timezone trình duyệt.
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date());
  const periods = await getPayrollPeriods();

  const drafts = periods.filter((p) => p.status === "draft");
  const paid = periods.filter((p) => p.status === "paid");
  const paidTotal = paid.reduce((sum, p) => sum + Number(p.total_net_pay), 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Kỳ lương"
        description="Tạo kỳ lương, tính lương từ chấm công, chốt và chi trả cho nhân viên."
        actions={<CreatePayrollDialog today={today} />}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          title="Tổng số kỳ lương"
          value={formatNumber(periods.length)}
          hint={`${formatNumber(drafts.length)} kỳ đang ở trạng thái nháp`}
          icon={CalendarRange}
        />
        <StatCard
          title="Đã chi trả"
          value={formatNumber(paid.length)}
          hint={`${formatNumber(periods.length - paid.length)} kỳ chưa chi trả`}
          icon={FileCheck2}
          tone="success"
        />
        <StatCard
          title="Tổng lương đã chi"
          value={formatVND(paidTotal)}
          hint="Tổng thực nhận của các kỳ đã chi trả"
          icon={Wallet}
          tone="info"
        />
      </div>

      {periods.length === 0 ? (
        <EmptyState
          icon={CalendarRange}
          title="Chưa có kỳ lương nào"
          description="Tạo kỳ lương đầu tiên để bắt đầu tính lương cho nhân viên."
          action={<CreatePayrollDialog today={today} />}
        />
      ) : (
        <PayrollPeriodsTable periods={periods} />
      )}
    </div>
  );
}
