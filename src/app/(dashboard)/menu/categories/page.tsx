import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getMenuCategories } from "@/lib/queries/categories.queries";
import { PageHeader, StatCard } from "@/components/shared";
import { CategoriesTable } from "@/components/categories/categories-table";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Danh mục món ăn | Restaurant ERP" };
export const dynamic = "force-dynamic";

export default async function MenuCategoriesPage() {
  const categories = await getMenuCategories();

  const total = categories.length;
  const activeCount = categories.filter((c) => c.is_active).length;
  const totalItemsAssigned = categories.reduce((sum, c) => sum + c.item_count, 0);
  const emptyCategories = categories.filter((c) => c.item_count === 0).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Danh mục món ăn"
        description="Quản lý các nhóm danh mục món ăn (Khai vị, Món chính, Đồ uống...). Đổi tên danh mục sẽ tự động cập nhật trên toàn bộ món ăn."
        breadcrumbs={[
          { label: "Thực đơn", href: "/menu" },
          { label: "Danh mục món" },
        ]}
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/menu">
              <ArrowLeft className="size-4" />
              Về danh sách món
            </Link>
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Tổng danh mục món"
          value={String(total)}
          hint="Nhóm phân loại thực đơn"
        />
        <StatCard
          title="Đang hoạt động"
          value={`${activeCount}/${total}`}
          tone={activeCount === total ? "success" : "default"}
          hint="Hiển thị khi tạo món mới"
        />
        <StatCard
          title="Tổng món đã phân loại"
          value={String(totalItemsAssigned)}
          hint="Tổng số món thuộc các danh mục"
        />
        <StatCard
          title="Danh mục trống"
          value={String(emptyCategories)}
          tone={emptyCategories > 0 ? "warning" : "default"}
          hint={emptyCategories > 0 ? "Có thể xóa an toàn" : "Tất cả đều có món"}
        />
      </div>

      <CategoriesTable categories={categories} type="menu" />
    </div>
  );
}
