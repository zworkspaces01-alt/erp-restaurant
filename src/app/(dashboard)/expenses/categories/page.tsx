import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getExpenseCategories } from "@/lib/queries/expenses.queries";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export const metadata = { title: "Danh mục chi phí | Restaurant ERP" };

export default async function ExpenseCategoriesPage() {
  const categories = await getExpenseCategories();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Danh mục chi phí vận hành"
        description="Phân loại các khoản chi phí phục vụ báo cáo tài chính và cơ cấu chi phí nhà hàng."
        breadcrumbs={[
          { label: "Chi phí vận hành", href: "/expenses" },
          { label: "Danh mục chi phí" },
        ]}
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/expenses">
              <ArrowLeft className="mr-1.5 size-4" />
              Quay lại danh sách chi phí
            </Link>
          </Button>
        }
      />

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b bg-muted/40 text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Mã danh mục</th>
                  <th className="px-4 py-3 font-medium">Tên phân loại</th>
                  <th className="px-4 py-3 font-medium">Mô tả</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {categories.map((c) => (
                  <tr key={c.id} className="hover:bg-muted/30">
                    <td className="px-4 py-3 font-mono text-xs font-semibold text-foreground">
                      {c.code}
                    </td>
                    <td className="px-4 py-3 font-medium text-foreground">{c.name}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {c.description || "—"}
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
