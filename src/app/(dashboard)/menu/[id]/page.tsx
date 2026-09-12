import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getMenuItemDetail } from "@/lib/queries/menu.queries";
import { getIngredients } from "@/lib/queries/inventory.queries";
import { PageHeader } from "@/components/shared/page-header";
import { RecipeEditor } from "@/components/menu/recipe-editor";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Chi tiết món & Định lượng | Restaurant ERP" };

export default async function MenuItemPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [detail, ingredients] = await Promise.all([
    getMenuItemDetail(id),
    getIngredients(),
  ]);

  if (!detail) notFound();

  return (
    <div className="space-y-6">
      <PageHeader
        title={detail.item.name}
        description={`Mã: ${detail.item.code} · Danh mục: ${detail.item.category}`}
        breadcrumbs={[
          { label: "Thực đơn", href: "/menu" },
          { label: detail.item.name },
        ]}
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/menu">
              <ArrowLeft className="mr-1.5 size-4" />
              Quay lại thực đơn
            </Link>
          </Button>
        }
      />

      <RecipeEditor
        menuItem={detail.item}
        initialRecipes={detail.recipe}
        availableIngredients={ingredients}
      />
    </div>
  );
}
