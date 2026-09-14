import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Layers } from "lucide-react";
import {
  getComboLines,
  getIngredientOptions,
  getMenuItem,
  getMenuItemCost,
  getRecipeLines,
  getSingleMenuItemOptions,
  type ComboLineCost,
  type IngredientOption,
  type RecipeLineCost,
  type SingleMenuItemOption,
} from "@/lib/queries/menu.queries";
import { PageHeader, StatusBadge } from "@/components/shared";
import { RecipeEditor } from "@/components/menu/recipe-editor";
import { ComboEditor } from "@/components/menu/combo-editor";
import { MenuItemDialog } from "@/components/menu/menu-item-dialog";
import { Button } from "@/components/ui/button";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const item = await getMenuItemCost(id);
  if (!item) return { title: "Món ăn | Restaurant ERP" };
  return {
    title: item.is_combo
      ? `Cấu hình Combo: ${item.name} | Restaurant ERP`
      : `Định lượng: ${item.name} | Restaurant ERP`,
  };
}

export default async function MenuItemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [item, record] = await Promise.all([getMenuItemCost(id), getMenuItem(id)]);
  if (!item || !record) notFound();

  const isCombo = item.is_combo;

  const [lines, ingredients, comboLines, singleMenuItems] = await Promise.all([
    !isCombo ? getRecipeLines(id) : Promise.resolve<RecipeLineCost[]>([]),
    !isCombo ? getIngredientOptions() : Promise.resolve<IngredientOption[]>([]),
    isCombo ? getComboLines(id) : Promise.resolve<ComboLineCost[]>([]),
    isCombo ? getSingleMenuItemOptions() : Promise.resolve<SingleMenuItemOption[]>([]),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title={item.name}
        description={[
          isCombo ? "Combo / Set menu" : "Món đơn lẻ",
          item.code ?? "Chưa có mã",
          item.category ?? "Chưa phân loại",
        ].join(" · ")}
        breadcrumbs={[
          { label: "Thực đơn", href: "/menu" },
          { label: item.name },
        ]}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {isCombo && (
              <StatusBadge tone="info" className="gap-1">
                <Layers className="size-3" />
                Combo
              </StatusBadge>
            )}
            {!item.is_active && <StatusBadge tone="neutral">Ngừng bán</StatusBadge>}
            <MenuItemDialog
              item={{
                id: record.id,
                code: record.code,
                name: record.name,
                category: record.category,
                selling_price: Number(record.selling_price),
                tax_percent: Number(record.tax_percent ?? 0),
                is_active: record.is_active,
                is_combo: record.is_combo,
                description: record.description,
                image_url: record.image_url,
              }}
              trigger={
                <Button variant="outline" size="sm">
                  Sửa thông tin {isCombo ? "Combo" : "món"}
                </Button>
              }
            />
            <Button asChild variant="ghost" size="sm">
              <Link href="/menu">
                <ArrowLeft className="size-4" />
                Về thực đơn
              </Link>
            </Button>
          </div>
        }
      />

      {isCombo ? (
        <ComboEditor
          menuItem={item}
          initialLines={comboLines}
          singleMenuItems={singleMenuItems}
        />
      ) : (
        <RecipeEditor menuItem={item} initialLines={lines} ingredients={ingredients} />
      )}
    </div>
  );
}
