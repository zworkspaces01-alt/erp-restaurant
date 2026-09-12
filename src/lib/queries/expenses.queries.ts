import { createClient } from "@/lib/supabase/server";

export async function getExpenses() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("expense_records")
    .select("*, expense_categories(name, code)")
    .order("expense_date", { ascending: false });

  if (error) throw new Error(error.message);
  return data;
}

export async function getExpenseCategories() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("expense_categories")
    .select("*")
    .order("name", { ascending: true });

  if (error) throw new Error(error.message);
  return data;
}
