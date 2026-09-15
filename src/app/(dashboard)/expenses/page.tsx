import Link from "next/link";
import { CircleDollarSign, Clock, FolderTree, Wallet } from "lucide-react";
import {
  getExpenseCategories,
  getExpenses,
  normalizeMonth,
  summarizeExpenses,
} from "@/lib/queries/expenses.queries";
import { formatMonth, formatVND } from "@/lib/format";
import { Forbidden, PageHeader, StatCard } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { ExpensesTable } from "@/components/expenses/expenses-table";
import { MonthFilter } from "@/components/expenses/month-filter";
import type { ExpenseStatus } from "@/types/restaurant";
import { requireAuth } from "@/lib/auth";

export const metadata = { title: "Chi phí vận hành | Restaurant ERP" };

interface PageProps {
  searchParams: Promise<{ month?: string; status?: string; category?: string }>;
}

export default async function ExpensesPage({ searchParams }: PageProps) {
  const { role, authorized } = await requireAuth(["owner", "manager"]);
  if (!authorized) {
    return <Forbidden requiredRoles={["owner", "manager"]} currentRole={role} />;
  }

  const params = await searchParams;
  const month = normalizeMonth(params.month);
  const status: ExpenseStatus | undefined =
    params.status === "paid" || params.status === "pending" ? params.status : undefined;

  const [rows, categories] = await Promise.all([
    getExpenses({ month, status, categoryId: params.category }),
    getExpenseCategories(),
  ]);

  const totals = summarizeExpenses(rows);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Chi phí vận hành"
        description="Theo dõi chi phí mặt bằng, điện nước, marketing, bảo trì… phục vụ báo cáo lãi lỗ P&L."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <MonthFilter month={month} />
            <Button asChild variant="outline" size="sm">
              <Link href="/expenses/categories">
                <FolderTree className="size-4" />
                Nhóm chi phí
              </Link>
            </Button>
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title={`Chờ thanh toán · ${formatMonth(`${month}-01`)}`}
          value={formatVND(totals.pending_amount)}
          hint={`${totals.pending_count} khoản chưa chi`}
          icon={Clock}
          tone="warning"
        />
        <StatCard
          title="Đã thanh toán"
          value={formatVND(totals.paid_amount)}
          hint={`${totals.paid_count} khoản đã chi`}
          icon={Wallet}
          tone="success"
        />
        <StatCard
          title="Tổng chi phí trong kỳ"
          value={formatVND(totals.total_amount)}
          hint="Ghi nhận theo ngày chi (dồn tích)"
          icon={CircleDollarSign}
        />
        <StatCard
          title="Cố định / Biến đổi"
          value={formatVND(totals.fixed_amount)}
          hint={`Biến đổi: ${formatVND(totals.variable_amount)}`}
          icon={CircleDollarSign}
          tone="info"
        />
      </div>

      <ExpensesTable rows={rows} categories={categories} />
    </div>
  );
}
