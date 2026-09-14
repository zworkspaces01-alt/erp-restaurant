import Link from "next/link";
import { BarChart3, FolderTree } from "lucide-react";
import { getMenuItemCosts, getMenuItems } from "@/lib/queries/menu.queries";
import { getMenuCategoryOptions } from "@/lib/queries/categories.queries";
import { PageHeader, StatCard } from "@/components/shared";
import type { StatTone } from "@/components/shared";
import { MenuTable } from "@/components/menu/menu-table";
import type { MenuItemDialogValues } from "@/components/menu/menu-item-dialog";
import { MenuItemDialog } from "@/components/menu/menu-item-dialog";
import { MenuImportDialog } from "@/components/menu/menu-import-dialog";
import { RecipeImportDialog } from "@/components/menu/recipe-import-dialog";
import { Button } from "@/components/ui/button";
import { formatPercent, formatVND } from "@/lib/format";
import { classifyFoodCost } from "@/types/restaurant";

export const metadata = { title: "Thực đơn & Định lượng | Restaurant ERP" };
export const dynamic = "force-dynamic";

export default async function MenuPage() {
  const [items, records, categoryOptions] = await Promise.all([
    getMenuItemCosts(),
    getMenuItems(),
    getMenuCategoryOptions(),
  ]);

  const editValues: Record<string, MenuItemDialogValues> = {};
  for (const r of records) {
    editValues[r.id] = {
      id: r.id,
      code: r.code,
      name: r.name,
      category: r.category,
      item_group: r.item_group,
      selling_price: Number(r.selling_price),
      tax_percent: Number(r.tax_percent ?? 0),
      is_active: r.is_active,
      is_combo: r.is_combo,
      description: r.description,
      image_url: r.image_url,
    };
  }

  const activeItems = items.filter((i) => i.is_active);
  const missingRecipe = items.filter((i) => i.missing_recipe).length;
  // Món chưa có định lượng có ideal_cost = 0 → food_cost_pct = 0; loại khỏi trung bình
  // để không kéo chỉ số về xanh khi menu chưa được tính giá vốn.
  const withPct = items.filter((i) => i.food_cost_pct !== null && !i.missing_recipe);
  const avgFoodCost =
    withPct.length > 0
      ? withPct.reduce((sum, i) => sum + (i.food_cost_pct ?? 0), 0) / withPct.length
      : null;
  const avgCm =
    activeItems.length > 0
      ? activeItems.reduce((sum, i) => sum + i.contribution_margin, 0) / activeItems.length
      : 0;
  const avgTone: StatTone =
    avgFoodCost === null
      ? "default"
      : classifyFoodCost(avgFoodCost) === "danger"
        ? "danger"
        : classifyFoodCost(avgFoodCost) === "warn"
          ? "warning"
          : "success";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Thực đơn & Định lượng"
        description="Giá bán, giá vốn chuẩn theo định lượng (BOM), lãi gộp và Food Cost % của từng món."
        breadcrumbs={[{ label: "Thực đơn" }]}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href="/menu/categories">
                <FolderTree className="size-4" />
                Danh mục món
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href="/menu/engineering">
                <BarChart3 className="size-4" />
                Menu Engineering
              </Link>
            </Button>
            <MenuImportDialog />
            <RecipeImportDialog />
            <MenuItemDialog gotoRecipeOnCreate categoryOptions={categoryOptions} />
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard title="Món đang bán" value={`${activeItems.length}/${items.length}`} />
        <StatCard
          title="Food Cost % trung bình"
          value={avgFoodCost === null ? "—" : formatPercent(avgFoodCost)}
          tone={avgTone}
          hint={
            missingRecipe > 0
              ? `Mục tiêu: dưới 30% · bỏ qua ${missingRecipe} món chưa có định lượng`
              : "Mục tiêu: dưới 30%"
          }
        />
        <StatCard title="Lãi gộp TB / món" value={formatVND(avgCm)} hint="Giá bán − giá vốn chuẩn" />
        <StatCard
          title="Món chưa có định lượng"
          value={String(missingRecipe)}
          tone={missingRecipe > 0 ? "warning" : "success"}
          hint="Không tính được giá vốn chuẩn"
        />
      </div>

      <MenuTable items={items} editValues={editValues} categoryOptions={categoryOptions} />
    </div>
  );
}
