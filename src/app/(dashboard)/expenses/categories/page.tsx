import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getExpenseCategoriesWithUsage } from "@/lib/queries/expenses.queries";
import { PageHeader } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { ExpenseCategoriesTable } from "@/components/expenses/expense-categories-table";

export const metadata = { title: "Nhóm chi phí | Restaurant ERP" };

export default async function ExpenseCategoriesPage() {
  const rows = await getExpenseCategoriesWithUsage();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Nhóm chi phí"
        description="Phân loại chi phí cố định / biến đổi để báo cáo P&L tách đúng cơ cấu chi phí."
        breadcrumbs={[{ label: "Chi phí vận hành", href: "/expenses" }, { label: "Nhóm chi phí" }]}
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/expenses">
              <ArrowLeft className="size-4" />
              Về danh sách chi phí
            </Link>
          </Button>
        }
      />
      <ExpenseCategoriesTable rows={rows} />
    </div>
  );
}
