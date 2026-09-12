import Link from "next/link";
import { Users } from "lucide-react";
import { getPayrollPeriods } from "@/lib/queries/hr.queries";
import { PageHeader } from "@/components/shared/page-header";
import { CreatePayrollDialog } from "@/components/hr/create-payroll-dialog";
import { PayrollActions } from "@/components/hr/payroll-actions";
import { formatDate, formatVND } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export const metadata = { title: "Bảng lương định kỳ | Restaurant ERP" };

export default async function PayrollPage() {
  const periods = await getPayrollPeriods();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Quản lý kỳ lương & Chi trả"
        description="Tổng hợp công/giờ làm việc, tính lương cứng và lương giờ, chốt bảng lương và ghi nhận chi phí nhân sự."
        breadcrumbs={[
          { label: "Nhân sự", href: "/employees" },
          { label: "Bảng lương" },
        ]}
        actions={
          <div className="flex gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href="/employees">
                <Users className="mr-1.5 size-4" />
                Danh sách nhân viên
              </Link>
            </Button>
            <CreatePayrollDialog />
          </div>
        }
      />

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b bg-muted/40 text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Tên kỳ lương</th>
                  <th className="px-4 py-3 font-medium">Chu kỳ</th>
                  <th className="px-4 py-3 font-medium text-right">Tổng quỹ lương</th>
                  <th className="px-4 py-3 font-medium text-center">Trạng thái</th>
                  <th className="px-4 py-3 font-medium text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {periods.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-muted-foreground">
                      Chưa có kỳ lương nào. Bấm &quot;Tạo kỳ lương mới&quot; để bắt đầu.
                    </td>
                  </tr>
                ) : (
                  periods.map((period) => (
                    <tr key={period.id} className="hover:bg-muted/30">
                      <td className="px-4 py-3 font-semibold text-foreground">
                        {period.period_name}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {formatDate(period.start_date)} — {formatDate(period.end_date)}
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-foreground">
                        {formatVND(period.total_salary)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Badge
                          variant={
                            period.status === "paid"
                              ? "outline"
                              : period.status === "finalized"
                              ? "secondary"
                              : "outline"
                          }
                          className={
                            period.status === "paid"
                              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                              : period.status === "finalized"
                              ? "border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-400"
                              : ""
                          }
                        >
                          {period.status === "paid"
                            ? "Đã chi trả"
                            : period.status === "finalized"
                            ? "Đã chốt"
                            : "Bản nháp"}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end">
                          <PayrollActions periodId={period.id} status={period.status} />
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
