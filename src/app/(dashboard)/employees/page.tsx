import Link from "next/link";
import { ClipboardList, Wallet } from "lucide-react";
import { getEmployees } from "@/lib/queries/hr.queries";
import { PageHeader } from "@/components/shared/page-header";
import { AddEmployeeDialog } from "@/components/hr/add-employee-dialog";
import { EMPLOYMENT_TYPE_LABELS, type EmploymentType } from "@/types/restaurant";
import { formatVND } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export const metadata = { title: "Nhân viên & Bảng lương | Restaurant ERP" };

export default async function EmployeesPage() {
  const employees = await getEmployees();

  const ftCount = employees.filter((e) => e.employment_type === "full_time").length;
  const ptCount = employees.filter((e) => e.employment_type === "part_time").length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Nhân sự & Nhân viên"
        description="Quản lý danh sách nhân sự toàn thời gian (lương cứng + phụ cấp) và bán thời gian (lương theo giờ)."
        actions={
          <div className="flex gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href="/timekeeping">
                <ClipboardList className="mr-1.5 size-4" />
                Chấm công
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href="/payroll">
                <Wallet className="mr-1.5 size-4" />
                Bảng lương
              </Link>
            </Button>
            <AddEmployeeDialog />
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="p-4">
          <p className="text-xs font-medium text-muted-foreground">Tổng nhân sự</p>
          <p className="mt-1 text-2xl font-semibold">{employees.length} người</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-medium text-muted-foreground">Nhân viên Full-time</p>
          <p className="mt-1 text-2xl font-semibold text-primary">{ftCount} người</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-medium text-muted-foreground">Nhân viên Part-time</p>
          <p className="mt-1 text-2xl font-semibold text-muted-foreground">{ptCount} người</p>
        </Card>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b bg-muted/40 text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Mã / Họ tên</th>
                  <th className="px-4 py-3 font-medium">Vị trí</th>
                  <th className="px-4 py-3 font-medium">Hình thức</th>
                  <th className="px-4 py-3 font-medium">Liên hệ</th>
                  <th className="px-4 py-3 font-medium text-right">Lương chuẩn</th>
                  <th className="px-4 py-3 font-medium text-right">Phụ cấp</th>
                  <th className="px-4 py-3 font-medium text-center">Trạng thái</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {employees.map((emp) => (
                  <tr key={emp.id} className="hover:bg-muted/30">
                    <td className="px-4 py-3">
                      <p className="font-medium text-foreground">{emp.full_name}</p>
                      <p className="font-mono text-xs text-muted-foreground">{emp.code}</p>
                    </td>
                    <td className="px-4 py-3 font-medium text-muted-foreground">{emp.role}</td>
                    <td className="px-4 py-3">
                      <span className="rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                        {EMPLOYMENT_TYPE_LABELS[emp.employment_type as EmploymentType] || emp.employment_type}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {emp.phone || "—"}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-foreground">
                      {emp.employment_type === "full_time"
                        ? `${formatVND(emp.base_salary)}/tháng`
                        : `${formatVND(emp.base_salary)}/giờ`}
                    </td>
                    <td className="px-4 py-3 text-right text-muted-foreground">
                      {formatVND(emp.allowance)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Badge
                        variant="outline"
                        className={
                          emp.status === "active"
                            ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                            : ""
                        }
                      >
                        {emp.status === "active" ? "Đang làm việc" : "Đã nghỉ"}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
