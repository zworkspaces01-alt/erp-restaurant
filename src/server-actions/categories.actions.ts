"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { fail, ok, type ActionResult } from "@/types/actions";
import { categorySchema, type CategoryInput } from "@/types/restaurant";

export type CategoryType = "menu" | "ingredient";

function revalidateCategoryPaths(type: CategoryType) {
  if (type === "menu") {
    revalidatePath("/menu");
    revalidatePath("/menu/categories");
    revalidatePath("/menu/engineering");
    revalidatePath("/orders/new");
  } else {
    revalidatePath("/inventory");
    revalidatePath("/inventory/categories");
    revalidatePath("/inventory/purchases/new");
    revalidatePath("/inventory/transactions");
  }
}

export async function createCategory(
  type: CategoryType,
  input: CategoryInput
): Promise<ActionResult<{ id: string }>> {
  const parsed = categorySchema.safeParse(input);
  if (!parsed.success) {
    return fail("Dữ liệu không hợp lệ", parsed.error.flatten().fieldErrors);
  }

  const tableName = type === "menu" ? "menu_categories" : "ingredient_categories";
  const supabase = await createClient();

  const { data, error } = await supabase
    .from(tableName)
    .insert({
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      display_order: parsed.data.display_order,
      is_active: parsed.data.is_active,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      return fail(`Danh mục "${parsed.data.name}" đã tồn tại`, {
        name: ["Tên danh mục đã tồn tại"],
      });
    }
    return fail(error.message);
  }

  revalidateCategoryPaths(type);
  return ok({ id: data.id });
}

export async function updateCategory(
  type: CategoryType,
  id: string,
  input: CategoryInput
): Promise<ActionResult<null>> {
  const parsed = categorySchema.safeParse(input);
  if (!parsed.success) {
    return fail("Dữ liệu không hợp lệ", parsed.error.flatten().fieldErrors);
  }

  const tableName = type === "menu" ? "menu_categories" : "ingredient_categories";
  const supabase = await createClient();

  // 1. Fetch current category name to detect rename
  const { data: current, error: fetchError } = await supabase
    .from(tableName)
    .select("name")
    .eq("id", id)
    .single();

  if (fetchError || !current) {
    return fail("Không tìm thấy danh mục cần cập nhật");
  }

  const oldName = current.name;
  const newName = parsed.data.name;

  // 2. Update category record
  const { error: updateError } = await supabase
    .from(tableName)
    .update({
      name: newName,
      description: parsed.data.description ?? null,
      display_order: parsed.data.display_order,
      is_active: parsed.data.is_active,
    })
    .eq("id", id);

  if (updateError) {
    if (updateError.code === "23505") {
      return fail(`Tên danh mục "${newName}" đã được sử dụng`, {
        name: ["Tên danh mục đã tồn tại"],
      });
    }
    return fail(updateError.message);
  }

  // 3. If renamed, cascade to items/ingredients
  if (oldName !== newName) {
    if (type === "menu") {
      const { error: cascadeError } = await supabase
        .from("menu_items")
        .update({ category: newName })
        .eq("category", oldName);
      if (cascadeError) {
        console.error("Failed to cascade menu category rename:", cascadeError);
      }
    } else {
      const { error: cascadeError } = await supabase
        .from("ingredients")
        .update({ category: newName })
        .eq("category", oldName);
      if (cascadeError) {
        console.error("Failed to cascade ingredient category rename:", cascadeError);
      }
    }
  }

  revalidateCategoryPaths(type);
  return ok(null);
}

export async function deleteCategory(
  type: CategoryType,
  id: string
): Promise<ActionResult<null>> {
  const tableName = type === "menu" ? "menu_categories" : "ingredient_categories";
  const viewName = type === "menu" ? "v_menu_categories" : "v_ingredient_categories";
  const itemLabel = type === "menu" ? "món ăn" : "nguyên liệu";
  const supabase = await createClient();

  // 1. Check item_count in the view
  const { data: catView, error: viewError } = await supabase
    .from(viewName)
    .select("name, item_count")
    .eq("id", id)
    .single();

  if (viewError || !catView) {
    return fail("Không tìm thấy danh mục cần xóa");
  }

  const count = Number(catView.item_count ?? 0);
  if (count > 0) {
    return fail(
      `Không thể xóa danh mục "${catView.name}" vì đang có ${count} ${itemLabel} thuộc danh mục này. Vui lòng chuyển hoặc xóa các ${itemLabel} liên quan trước.`
    );
  }

  // 2. Safe to delete
  const { error: deleteError } = await supabase
    .from(tableName)
    .delete()
    .eq("id", id);

  if (deleteError) {
    return fail(deleteError.message);
  }

  revalidateCategoryPaths(type);
  return ok(null);
}

export async function toggleCategoryActive(
  type: CategoryType,
  id: string,
  isActive: boolean
): Promise<ActionResult<null>> {
  const tableName = type === "menu" ? "menu_categories" : "ingredient_categories";
  const supabase = await createClient();

  const { error } = await supabase
    .from(tableName)
    .update({ is_active: isActive })
    .eq("id", id);

  if (error) {
    return fail(error.message);
  }

  revalidateCategoryPaths(type);
  return ok(null);
}
