import "server-only";
import { createClient } from "@/lib/supabase/server";
import type {
  MenuClass,
  MenuEngineeringRow,
  MenuItem,
  MenuItemCostRow,
  RecipeCostRow,
} from "@/types/restaurant";

/** One row of `/menu` (v_menu_item_costs) with nulls normalised for the client. */
export interface MenuItemCost {
  id: string;
  code: string | null;
  name: string;
  category: string | null;
  item_group: string | null;
  selling_price: number;
  tax_percent: number;
  is_active: boolean;
  is_combo: boolean;
  ideal_cost: number;
  contribution_margin: number;
  /** null when selling_price = 0 → show "—". */
  food_cost_pct: number | null;
  ingredient_count: number;
  missing_recipe: boolean;
}

/** One BOM line of `/menu/[id]` (v_recipe_costs). */
export interface RecipeLineCost {
  ingredient_id: string;
  ingredient_code: string | null;
  ingredient_name: string;
  ingredient_category: string | null;
  base_unit: string;
  import_unit?: string;
  conversion_factor?: number;
  avg_cost_price: number;
  quantity: number;
  waste_percent: number;
  effective_quantity: number;
  component_cost: number;
  note: string | null;
}

/** One child item line of a combo (v_combo_items). */
export interface ComboLineCost {
  id: string;
  combo_id: string;
  menu_item_id: string;
  item_code: string | null;
  item_name: string;
  item_category: string | null;
  item_selling_price: number;
  quantity: number;
  item_ideal_cost: number;
  line_cost: number;
  line_selling_total: number;
  item_missing_recipe: boolean;
  note: string | null;
}

/** Single menu item option for adding into a combo. */
export interface SingleMenuItemOption {
  id: string;
  code: string | null;
  name: string;
  category: string | null;
  selling_price: number;
  ideal_cost: number;
  missing_recipe: boolean;
}

/** Ingredient option for the BOM picker. */
export interface IngredientOption {
  id: string;
  code: string | null;
  name: string;
  category: string | null;
  base_unit: string;
  import_unit: string;
  conversion_factor: number;
  avg_cost_price: number;
}

/** One row of `/menu/engineering` (v_menu_engineering, Kasavana-Smith 30 ngày). */
export interface MenuEngineeringItem {
  id: string;
  code: string | null;
  name: string;
  category: string | null;
  selling_price: number;
  ideal_cost: number;
  contribution_margin: number;
  food_cost_pct: number | null;
  qty_sold: number;
  revenue: number;
  total_cm: number;
  avg_cm: number;
  popularity_share: number;
  /** null khi không có doanh số trong 30 ngày → "chưa có dữ liệu". */
  popularity_threshold: number | null;
  /** null khi không có doanh số trong 30 ngày → "chưa có dữ liệu". */
  benchmark_cm: number | null;
  is_popular: boolean;
  is_profitable: boolean;
  menu_class: MenuClass | null;
}

function n(value: number | string | null | undefined): number {
  if (value === null || value === undefined || value === "") return 0;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function nullableNumber(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function mapMenuItemCost(row: MenuItemCostRow): MenuItemCost {
  return {
    id: row.id ?? "",
    code: row.code,
    name: row.name ?? "",
    category: row.category,
    item_group: row.item_group ?? null,
    selling_price: n(row.selling_price),
    tax_percent: n(row.tax_percent),
    is_active: row.is_active ?? true,
    is_combo: row.is_combo ?? false,
    ideal_cost: n(row.ideal_cost),
    contribution_margin: n(row.contribution_margin),
    food_cost_pct: nullableNumber(row.food_cost_pct),
    ingredient_count: n(row.ingredient_count),
    missing_recipe: row.missing_recipe ?? true,
  };
}

/** `/menu` — danh sách món kèm giá vốn chuẩn & Food Cost %. */
export async function getMenuItemCosts(): Promise<MenuItemCost[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("v_menu_item_costs")
    .select("*")
    .order("category", { ascending: true, nullsFirst: false })
    .order("name", { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []).map(mapMenuItemCost);
}

/** Một món trong `v_menu_item_costs` (giá trị đã lưu, dùng cho header của BOM editor). */
export async function getMenuItemCost(id: string): Promise<MenuItemCost | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("v_menu_item_costs")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error || !data) return null;
  return mapMenuItemCost(data);
}

/** Bản ghi gốc `menu_items` (form sửa món). */
export async function getMenuItem(id: string): Promise<MenuItem | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("menu_items").select("*").eq("id", id).maybeSingle();
  if (error || !data) return null;
  return data;
}

/** `/menu/[id]` — các dòng định lượng đã lưu kèm chi phí thành phần. */
export async function getRecipeLines(menuItemId: string): Promise<RecipeLineCost[]> {
  const supabase = await createClient();
  const [{ data, error }, { data: ingData }] = await Promise.all([
    supabase
      .from("v_recipe_costs")
      .select("*")
      .eq("menu_item_id", menuItemId)
      .order("ingredient_name", { ascending: true }),
    supabase.from("ingredients").select("id, import_unit, conversion_factor"),
  ]);

  if (error) throw new Error(error.message);
  const ingMap = new Map((ingData ?? []).map((i) => [i.id, i]));

  return ((data ?? []) as RecipeCostRow[]).map((row) => {
    const extra = row.ingredient_id ? ingMap.get(row.ingredient_id) : undefined;
    return {
      ingredient_id: row.ingredient_id ?? "",
      ingredient_code: row.ingredient_code,
      ingredient_name: row.ingredient_name ?? "",
      ingredient_category: row.ingredient_category,
      base_unit: row.base_unit ?? "",
      import_unit: extra?.import_unit ?? row.base_unit ?? "",
      conversion_factor: n(extra?.conversion_factor || 1),
      avg_cost_price: n(row.avg_cost_price),
      quantity: n(row.quantity),
      waste_percent: n(row.waste_percent),
      effective_quantity: n(row.effective_quantity),
      component_cost: n(row.component_cost),
      note: row.note,
    };
  });
}

/** Nguyên liệu đang hoạt động cho picker định lượng. */
export async function getIngredientOptions(): Promise<IngredientOption[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ingredients")
    .select("id, code, name, category, base_unit, import_unit, conversion_factor, avg_cost_price")
    .eq("is_active", true)
    .order("name", { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({
    id: row.id,
    code: row.code,
    name: row.name,
    category: row.category,
    base_unit: row.base_unit,
    import_unit: row.import_unit ?? row.base_unit,
    conversion_factor: n(row.conversion_factor || 1),
    avg_cost_price: n(row.avg_cost_price),
  }));
}

/** `/menu/engineering` — ma trận Kasavana-Smith 30 ngày. */
export async function getMenuEngineering(): Promise<MenuEngineeringItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("v_menu_engineering")
    .select("*")
    .order("qty_sold", { ascending: false, nullsFirst: false });

  if (error) throw new Error(error.message);
  return ((data ?? []) as MenuEngineeringRow[]).map((row) => ({
    id: row.id ?? "",
    code: row.code,
    name: row.name ?? "",
    category: row.category,
    selling_price: n(row.selling_price),
    ideal_cost: n(row.ideal_cost),
    contribution_margin: n(row.contribution_margin),
    food_cost_pct: nullableNumber(row.food_cost_pct),
    qty_sold: n(row.qty_sold),
    revenue: n(row.revenue),
    total_cm: n(row.total_cm),
    avg_cm: n(row.avg_cm),
    popularity_share: n(row.popularity_share),
    popularity_threshold: nullableNumber(row.popularity_threshold),
    benchmark_cm: nullableNumber(row.benchmark_cm),
    is_popular: row.is_popular ?? false,
    is_profitable: row.is_profitable ?? false,
    menu_class: row.menu_class,
  }));
}

/** Bản ghi gốc `menu_items` (đổ vào form sửa trên `/menu`). */
export async function getMenuItems(): Promise<MenuItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("menu_items")
    .select("*")
    .order("name", { ascending: true });

  if (error) throw new Error(error.message);
  return data ?? [];
}

/** `/menu/[id]` — các món con trong combo đã lưu (v_combo_items). */
export async function getComboLines(comboId: string): Promise<ComboLineCost[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("v_combo_items")
    .select("*")
    .eq("combo_id", comboId)
    .order("item_name", { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({
    id: row.id ?? "",
    combo_id: row.combo_id ?? "",
    menu_item_id: row.menu_item_id ?? "",
    item_code: row.item_code,
    item_name: row.item_name ?? "",
    item_category: row.item_category,
    item_selling_price: n(row.item_selling_price),
    quantity: n(row.quantity),
    item_ideal_cost: n(row.item_ideal_cost),
    line_cost: n(row.line_cost),
    line_selling_total: n(row.line_selling_total),
    item_missing_recipe: row.item_missing_recipe ?? true,
    note: row.note,
  }));
}

/** Danh sách các món đơn lẻ đang hoạt động để thêm vào combo. */
export async function getSingleMenuItemOptions(): Promise<SingleMenuItemOption[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("v_menu_item_costs")
    .select("id, code, name, category, selling_price, ideal_cost, missing_recipe")
    .eq("is_active", true)
    .eq("is_combo", false)
    .order("name", { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({
    id: row.id ?? "",
    code: row.code,
    name: row.name ?? "",
    category: row.category,
    selling_price: n(row.selling_price),
    ideal_cost: n(row.ideal_cost),
    missing_recipe: row.missing_recipe ?? true,
  }));
}
