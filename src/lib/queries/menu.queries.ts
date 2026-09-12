import { createClient } from "@/lib/supabase/server";

export async function getMenuItemsWithCosts() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("v_menu_item_costs")
    .select("*")
    .order("category", { ascending: true })
    .order("name", { ascending: true });

  if (error) throw new Error(error.message);
  return data;
}

export async function getMenuItemDetail(id: string) {
  const supabase = await createClient();
  const [itemRes, recipeRes] = await Promise.all([
    supabase.from("menu_items").select("*").eq("id", id).single(),
    supabase
      .from("recipes")
      .select("*, ingredients(id, name, code, base_unit, avg_cost_price)")
      .eq("menu_item_id", id),
  ]);

  if (itemRes.error) return null;
  return {
    item: itemRes.data,
    recipe: recipeRes.data ?? [],
  };
}

export async function getMenuEngineering() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("v_menu_engineering")
    .select("*")
    .order("total_sold", { ascending: false });

  if (error) throw new Error(error.message);
  return data;
}
