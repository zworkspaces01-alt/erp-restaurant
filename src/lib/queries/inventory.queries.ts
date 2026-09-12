import { createClient } from "@/lib/supabase/server";

export async function getIngredients() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ingredients")
    .select("*")
    .order("category", { ascending: true })
    .order("name", { ascending: true });

  if (error) throw new Error(error.message);
  return data;
}

export async function getIngredientById(id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ingredients")
    .select("*")
    .eq("id", id)
    .single();

  if (error) return null;
  return data;
}

export async function getInventoryTransactions(limit = 100) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("inventory_transactions")
    .select("*, ingredients(name, code, base_unit)")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);
  return data;
}

export async function getInventoryAdjustments(limit = 100) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("inventory_adjustments")
    .select("*, ingredients(name, code, base_unit)")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);
  return data;
}

export async function getDailyIngredientUsage(dateStr?: string) {
  const supabase = await createClient();
  let query = supabase.from("v_daily_ingredient_usage").select("*");
  if (dateStr) {
    query = query.eq("usage_date", dateStr);
  }
  const { data, error } = await query.order("usage_date", { ascending: false });
  if (error) throw new Error(error.message);
  return data;
}
