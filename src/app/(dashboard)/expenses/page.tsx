import Link from "next/link";
import { FolderTree } from "lucide-react";
import { getExpenseCategories, getExpenses } from "@/lib/queries/expenses.queries";
import { PageHeader } from "@/components/shared/page-header";
import { AddExpenseDialog } from "@/components/expenses/add-expense-dialog";
import { formatDate, formatVND } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export const metadata = { title: "Chi phí vận hành | Restaurant ERP" };

export default async function ExpensesPage() {
  const [expenses, categories] = await Promise.all([
    getExpenses(),
    getExpenseCategories(),
  ]);

  const totalOpex = expenses
    .filter((e) => e.status === "paid")
    .reduce((sum, e) => sum + Number(e.amount), 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Chi phí cố định & Vận hành (OPEX)"
        description="Quản lý chi phí mặt bằng, điện nước gas, marketing và bảo dưỡng thiết bị phục vụ tính toán lãi lỗ P&L."
        actions={
          <div className="flex gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href="/expenses/categories">
                <FolderTree className="mr-1.5 size-4" />
                Danh mục chi phí
              </Link>
            </Button>
            <AddExpenseDialog categories={categories} />
          </div>
        }
      />

      <Card className="p-4">
        <p className="text-xs font-medium text-muted-foreground">Tổng chi phí vận hành đã chi</p>
        <p className="mt-1 text-2xl font-semibold text-rose-600 dark:text-rose-400">
          {formatVND(totalOpex)}
        </p>
      </Card>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b bg-muted/40 text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Ngày chi</th>
                  <th className="px-4 py-3 font-medium">Danh mục</th>
                  <th className="px-4 py-3 font-medium">Nội dung chi phí</th>
                  <th className="px-4 py-3 font-medium">Hình thức</th>
                  <th className="px-4 py-3 font-medium text-right">Số tiền</th>
                  <th className="px-4 py-3 font-medium text-center">Trạng thái</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {expenses.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-muted-foreground">
                      Chưa có hóa đơn chi phí nào.
                    </td>
                  </tr>
                ) : (
                  expenses.map((e) => {
                    const cat = e.expense_categories as { name?: string; code?: string } | null;

                    return (
                      <tr key={e.id} className="hover:bg-muted/30">
                        <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">
                          {formatDate(e.expense_date)}
                        </td>
                        <td className="px-4 py-3 font-medium text-foreground">
                          {cat?.name ?? "—"}
                        </td>
                        <td className="px-4 py-3 text-foreground">
                          {e.description}
                        </td>
                        <td className="px-4 py-3 text-xs capitalize text-muted-foreground">
                          {e.payment_method === "bank_transfer" ? "Chuyển khoản" : "Tiền mặt"}
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-foreground">
                          {formatVND(e.amount)}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <Badge
                            variant={e.status === "paid" ? "outline" : "secondary"}
                            className={
                              e.status === "paid"
                                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                                : ""
                            }
                          >
                            {e.status === "paid" ? "Đã chi" : "Chờ chi"}
                          </Badge>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
