import { Users, UserCheck, Wallet } from "lucide-react";
import { getEmployees } from "@/lib/queries/hr.queries";
import { formatNumber, formatVND } from "@/lib/format";
import { PageHeader, StatCard, EmptyState } from "@/components/shared";
import { EmployeeFormDialog } from "@/components/hr/employee-form-dialog";
import { EmployeesTable } from "@/components/hr/employees-table";

export const metadata = { title: "Nhân viên | Restaurant ERP" };

export default async function EmployeesPage() {
  // Tính ở server theo giờ Việt Nam để mặc định ngày vào làm không lệch múi giờ.
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date());
  const employees = await getEmployees();

  const active = employees.filter((e) => e.is_active);
  const fullTime = active.filter((e) => e.employment_type === "full_time");
  const partTime = active.filter((e) => e.employment_type === "part_time");
  const monthlyFixed = fullTime.reduce(
    (sum, e) => sum + Number(e.base_salary) + Number(e.allowance),
    0
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Nhân viên"
        description="Hồ sơ nhân sự toàn thời gian và bán thời gian, mức lương và phụ cấp dùng để tính bảng lương."
        actions={<EmployeeFormDialog today={today} />}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          title="Đang làm việc"
          value={formatNumber(active.length)}
          hint={`${formatNumber(employees.length - active.length)} đã nghỉ việc`}
          icon={UserCheck}
          tone="success"
        />
        <StatCard
          title="Toàn thời gian / Bán thời gian"
          value={`${formatNumber(fullTime.length)} / ${formatNumber(partTime.length)}`}
          hint="FT tính lương tháng, PT tính theo giờ"
          icon={Users}
          tone="info"
        />
        <StatCard
          title="Quỹ lương cố định / tháng"
          value={formatVND(monthlyFixed)}
          hint="Lương cơ bản + phụ cấp của nhân viên toàn thời gian"
          icon={Wallet}
        />
      </div>

      {employees.length === 0 ? (
        <EmptyState
          icon={Users}
          title="Chưa có nhân viên nào"
          description="Thêm nhân viên để bắt đầu chấm công và tính lương."
          action={<EmployeeFormDialog today={today} />}
        />
      ) : (
        <EmployeesTable employees={employees} />
      )}
    </div>
  );
}
