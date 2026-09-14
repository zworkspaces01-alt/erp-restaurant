import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getIngredientCategories } from "@/lib/queries/categories.queries";
import { PageHeader, StatCard } from "@/components/shared";
import { CategoriesTable } from "@/components/categories/categories-table";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Danh mục nguyên liệu | Restaurant ERP" };
export const dynamic = "force-dynamic";

export default async function IngredientCategoriesPage() {
  const categories = await getIngredientCategories();

  const total = categories.length;
  const activeCount = categories.filter((c) => c.is_active).length;
  const totalItemsAssigned = categories.reduce((sum, c) => sum + c.item_count, 0);
  const emptyCategories = categories.filter((c) => c.item_count === 0).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Danh mục nguyên liệu"
        description="Quản lý các nhóm phân loại nguyên vật liệu (Thịt / Hải sản, Rau củ, Gia vị...). Đổi tên danh mục sẽ tự động đồng bộ sang tất cả nguyên liệu liên quan."
        breadcrumbs={[
          { label: "Kho hàng", href: "/inventory" },
          { label: "Danh mục nguyên liệu" },
        ]}
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/inventory">
              <ArrowLeft className="size-4" />
              Về kho nguyên liệu
            </Link>
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Tổng danh mục nguyên liệu"
          value={String(total)}
          hint="Nhóm phân loại tồn kho"
        />
        <StatCard
          title="Đang hoạt động"
          value={`${activeCount}/${total}`}
          tone={activeCount === total ? "success" : "default"}
          hint="Hiển thị khi tạo nguyên liệu mới"
        />
        <StatCard
          title="Tổng nguyên liệu đã gán"
          value={String(totalItemsAssigned)}
          hint="Tổng nguyên liệu trong các danh mục"
        />
        <StatCard
          title="Danh mục trống"
          value={String(emptyCategories)}
          tone={emptyCategories > 0 ? "warning" : "default"}
          hint={emptyCategories > 0 ? "Có thể xóa an toàn" : "Tất cả đều có nguyên liệu"}
        />
      </div>

      <CategoriesTable categories={categories} type="ingredient" />
    </div>
  );
}
