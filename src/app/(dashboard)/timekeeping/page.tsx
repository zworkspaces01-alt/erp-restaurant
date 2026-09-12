import Link from "next/link";
import { Wallet } from "lucide-react";
import { getTimekeeping } from "@/lib/queries/hr.queries";
import { PageHeader } from "@/components/shared/page-header";
import { TimekeepingTable } from "@/components/hr/timekeeping-table";
import { todayISO } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export const metadata = { title: "Chấm công nhân viên | Restaurant ERP" };

export default async function TimekeepingPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const { date } = await searchParams;
  const targetDate = date ?? todayISO();
  const { employees, timekeeping } = await getTimekeeping(targetDate);

  const formattedEmployees = employees.map((e) => ({
    id: e.id,
    code: e.code,
    full_name: e.full_name,
    role: e.role,
    employment_type: e.employment_type,
  }));

  const formattedTimekeeping = timekeeping.map((t) => ({
    employee_id: t.employee_id,
    shift: t.shift,
    hours_worked: Number(t.hours_worked),
    status: t.status,
    notes: t.notes,
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Chấm công hàng ngày"
        description="Điểm danh ca làm, ghi nhận số giờ làm việc thực tế của nhân sự Full-time và Part-time để tự động tính bảng lương."
        breadcrumbs={[
          { label: "Nhân sự", href: "/employees" },
          { label: "Chấm công" },
        ]}
        actions={
          <div className="flex items-center gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href="/payroll">
                <Wallet className="mr-1.5 size-4" />
                Kỳ tính lương
              </Link>
            </Button>
          </div>
        }
      />

      <Card>
        <CardContent className="p-0">
          <TimekeepingTable
            targetDate={targetDate}
            employees={formattedEmployees}
            timekeeping={formattedTimekeeping}
          />
        </CardContent>
      </Card>
    </div>
  );
}
