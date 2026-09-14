import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { MenuCategoryRow, IngredientCategoryRow } from "@/types/restaurant";

export interface CategoryListItem {
  id: string;
  name: string;
  description: string | null;
  display_order: number;
  is_active: boolean;
  item_count: number;
  created_at: string;
  updated_at: string;
}

export async function getMenuCategories(): Promise<CategoryListItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("v_menu_categories")
    .select("*")
    .order("display_order", { ascending: true })
    .order("name", { ascending: true });

  if (error) throw new Error(error.message);

  return (data ?? []).map((row: MenuCategoryRow) => ({
    id: row.id ?? "",
    name: row.name ?? "",
    description: row.description ?? null,
    display_order: Number(row.display_order ?? 0),
    is_active: Boolean(row.is_active ?? true),
    item_count: Number(row.item_count ?? 0),
    created_at: row.created_at ?? "",
    updated_at: row.updated_at ?? "",
  }));
}

export async function getIngredientCategories(): Promise<CategoryListItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("v_ingredient_categories")
    .select("*")
    .order("display_order", { ascending: true })
    .order("name", { ascending: true });

  if (error) throw new Error(error.message);

  return (data ?? []).map((row: IngredientCategoryRow) => ({
    id: row.id ?? "",
    name: row.name ?? "",
    description: row.description ?? null,
    display_order: Number(row.display_order ?? 0),
    is_active: Boolean(row.is_active ?? true),
    item_count: Number(row.item_count ?? 0),
    created_at: row.created_at ?? "",
    updated_at: row.updated_at ?? "",
  }));
}

export async function getMenuCategoryOptions(): Promise<string[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("menu_categories")
    .select("name")
    .eq("is_active", true)
    .order("display_order", { ascending: true })
    .order("name", { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => r.name);
}

export async function getIngredientCategoryOptions(): Promise<string[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ingredient_categories")
    .select("name")
    .eq("is_active", true)
    .order("display_order", { ascending: true })
    .order("name", { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => r.name);
}
