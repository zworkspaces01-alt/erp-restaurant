"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { fail, ok, type ActionResult } from "@/types/actions";
import {
  PG_ERROR_MESSAGES,
  comboSchema,
  menuItemSchema,
  parseDbError,
  recipeSchema,
  type ComboInput,
  type MenuItemInput,
  type RecipeInput,
} from "@/types/restaurant";

interface DbError {
  message: string;
  code?: string;
}

/** Postgres/RPC error → thông báo tiếng Việt (DATABASE.md §8). */
function dbMessage(error: DbError): string {
  const byCode = error.code ? PG_ERROR_MESSAGES[error.code] : undefined;
  return byCode ?? parseDbError(error);
}

function revalidateMenu(id?: string) {
  revalidatePath("/menu");
  revalidatePath("/menu/engineering");
  if (id) revalidatePath(`/menu/${id}`);
  revalidatePath("/orders/new");
  revalidatePath("/dashboard");
}

export async function createMenuItem(input: MenuItemInput): Promise<ActionResult<{ id: string }>> {
  const parsed = menuItemSchema.safeParse(input);
  if (!parsed.success) {
    return fail("Dữ liệu không hợp lệ", parsed.error.flatten().fieldErrors);
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("menu_items")
    .insert({
      code: parsed.data.code ?? null,
      name: parsed.data.name,
      category: parsed.data.category ?? null,
      item_group: parsed.data.item_group ?? null,
      selling_price: parsed.data.selling_price,
      tax_percent: parsed.data.tax_percent,
      is_active: parsed.data.is_active,
      is_combo: parsed.data.is_combo,
      description: parsed.data.description ?? null,
      image_url: parsed.data.image_url ?? null,
    })
    .select("id")
    .single();

  if (error) {
    return error.code === "23505"
      ? fail("Mã món đã tồn tại.", { code: ["Mã món đã tồn tại."] })
      : fail(dbMessage(error));
  }

  revalidateMenu(data.id);
  return ok({ id: data.id });
}

export async function updateMenuItem(
  id: string,
  input: MenuItemInput
): Promise<ActionResult<{ id: string }>> {
  const parsed = menuItemSchema.safeParse(input);
  if (!parsed.success) {
    return fail("Dữ liệu không hợp lệ", parsed.error.flatten().fieldErrors);
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("menu_items")
    .update({
      code: parsed.data.code ?? null,
      name: parsed.data.name,
      category: parsed.data.category ?? null,
      item_group: parsed.data.item_group ?? null,
      selling_price: parsed.data.selling_price,
      tax_percent: parsed.data.tax_percent,
      is_active: parsed.data.is_active,
      is_combo: parsed.data.is_combo,
      description: parsed.data.description ?? null,
      image_url: parsed.data.image_url ?? null,
    })
    .eq("id", id);

  if (error) {
    return error.code === "23505"
      ? fail("Mã món đã tồn tại.", { code: ["Mã món đã tồn tại."] })
      : fail(dbMessage(error));
  }

  revalidateMenu(id);
  return ok({ id });
}

/** Bật/tắt bán món (không xóa: món đã bán bị chặn bởi khóa ngoại). */
export async function setMenuItemActive(input: {
  id: string;
  is_active: boolean;
}): Promise<ActionResult<{ id: string; is_active: boolean }>> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("menu_items")
    .update({ is_active: input.is_active })
    .eq("id", input.id);

  if (error) return fail(dbMessage(error));

  revalidateMenu(input.id);
  return ok({ id: input.id, is_active: input.is_active });
}

/**
 * `/menu/[id]` — lưu toàn bộ định lượng (BOM) của một món:
 * xóa các dòng không còn, upsert phần còn lại
 * (khóa duy nhất `recipes (menu_item_id, ingredient_id)`), rồi mới cập nhật giá bán.
 */
export async function saveRecipe(input: RecipeInput): Promise<ActionResult<{ id: string }>> {
  const parsed = recipeSchema.safeParse(input);
  if (!parsed.success) {
    return fail("Dữ liệu không hợp lệ", parsed.error.flatten().fieldErrors);
  }
  const { menu_item_id, selling_price, lines } = parsed.data;

  const supabase = await createClient();

  // Ghi định lượng (BOM) trước, cập nhật giá bán sau cùng: nếu một bước lỗi,
  // giá bán cũ vẫn khớp với BOM cũ thay vì tạo Food Cost % sai.
  const keptIds = lines.map((line) => line.ingredient_id);
  let deleteQuery = supabase.from("recipes").delete().eq("menu_item_id", menu_item_id);
  if (keptIds.length > 0) {
    deleteQuery = deleteQuery.not("ingredient_id", "in", `(${keptIds.join(",")})`);
  }
  const { error: deleteError } = await deleteQuery;
  if (deleteError) return fail(dbMessage(deleteError));

  if (lines.length > 0) {
    const { error: upsertError } = await supabase.from("recipes").upsert(
      lines.map((line) => ({
        menu_item_id,
        ingredient_id: line.ingredient_id,
        quantity: line.quantity,
        waste_percent: line.waste_percent,
        note: line.note ?? null,
      })),
      { onConflict: "menu_item_id,ingredient_id" }
    );
    if (upsertError) return fail(dbMessage(upsertError));
  }

  const { error: priceError } = await supabase
    .from("menu_items")
    .update({ selling_price })
    .eq("id", menu_item_id);
  if (priceError) {
    revalidateMenu(menu_item_id);
    revalidatePath("/inventory");
    return fail(dbMessage(priceError));
  }

  revalidateMenu(menu_item_id);
  revalidatePath("/inventory");
  return ok({ id: menu_item_id });
}

/**
 * `/menu/[id]` — lưu toàn bộ danh sách món thành phần của Combo:
 * xóa các món không còn, upsert phần còn lại, rồi mới cập nhật giá bán combo.
 */
export async function saveCombo(input: ComboInput): Promise<ActionResult<{ id: string }>> {
  const parsed = comboSchema.safeParse(input);
  if (!parsed.success) {
    return fail("Dữ liệu không hợp lệ", parsed.error.flatten().fieldErrors);
  }
  const { combo_id, selling_price, lines } = parsed.data;

  const supabase = await createClient();

  const keptIds = lines.map((line) => line.menu_item_id);
  let deleteQuery = supabase.from("combo_items").delete().eq("combo_id", combo_id);
  if (keptIds.length > 0) {
    deleteQuery = deleteQuery.not("menu_item_id", "in", `(${keptIds.join(",")})`);
  }
  const { error: deleteError } = await deleteQuery;
  if (deleteError) return fail(dbMessage(deleteError));

  if (lines.length > 0) {
    const { error: upsertError } = await supabase.from("combo_items").upsert(
      lines.map((line) => ({
        combo_id,
        menu_item_id: line.menu_item_id,
        quantity: line.quantity,
        note: line.note ?? null,
      })),
      { onConflict: "combo_id,menu_item_id" }
    );
    if (upsertError) return fail(dbMessage(upsertError));
  }

  const { error: priceError } = await supabase
    .from("menu_items")
    .update({ selling_price })
    .eq("id", combo_id);
  if (priceError) {
    revalidateMenu(combo_id);
    return fail(dbMessage(priceError));
  }

  revalidateMenu(combo_id);
  return ok({ id: combo_id });
}

export interface ImportResult {
  inserted: number;
  updated: number;
  skipped: number;
  total: number;
}

/**
 * Nhập hàng loạt món ăn từ file Excel.
 * - mode = "skip": Nếu mã món đã tồn tại thì bỏ qua.
 * - mode = "update": Nếu mã món đã tồn tại thì cập nhật thông tin.
 */
export async function importMenuItems(
  items: MenuItemInput[],
  mode: "skip" | "update" = "skip"
): Promise<ActionResult<ImportResult>> {
  if (!items || items.length === 0) {
    return fail("Không có dữ liệu để nhập");
  }

  const validItems: MenuItemInput[] = [];
  for (let i = 0; i < items.length; i++) {
    const parsed = menuItemSchema.safeParse(items[i]);
    if (!parsed.success) {
      const firstError = Object.values(parsed.error.flatten().fieldErrors)[0]?.[0] ?? "Dữ liệu không hợp lệ";
      return fail(`Dòng ${i + 1} (${items[i].name || "Chưa có tên"}): ${firstError}`);
    }
    validItems.push(parsed.data);
  }

  const supabase = await createClient();

  const codes = validItems.map((it) => it.code).filter((c): c is string => Boolean(c));
  const existingMap = new Map<string, string>();

  if (codes.length > 0) {
    const { data: existing, error: queryError } = await supabase
      .from("menu_items")
      .select("id, code")
      .in("code", codes);

    if (queryError) return fail(dbMessage(queryError));
    for (const r of existing ?? []) {
      if (r.code) existingMap.set(r.code, r.id);
    }
  }

  let inserted = 0;
  let updated = 0;
  let skipped = 0;

  for (const item of validItems) {
    const existingId = item.code ? existingMap.get(item.code) : undefined;
    if (existingId) {
      if (mode === "update") {
        const { error: updErr } = await supabase
          .from("menu_items")
          .update({
            name: item.name,
            category: item.category ?? null,
            item_group: item.item_group ?? null,
            selling_price: item.selling_price,
            tax_percent: item.tax_percent,
            is_active: item.is_active,
            is_combo: item.is_combo,
            description: item.description ?? null,
          })
          .eq("id", existingId);

        if (updErr) return fail(dbMessage(updErr));
        updated++;
      } else {
        skipped++;
      }
    } else {
      const { data: insData, error: insErr } = await supabase
        .from("menu_items")
        .insert({
          code: item.code ?? null,
          name: item.name,
          category: item.category ?? null,
          item_group: item.item_group ?? null,
          selling_price: item.selling_price,
          tax_percent: item.tax_percent,
          is_active: item.is_active,
          is_combo: item.is_combo,
          description: item.description ?? null,
        })
        .select("id, code")
        .single();

      if (insErr) return fail(dbMessage(insErr));
      if (insData?.code) existingMap.set(insData.code, insData.id);
      inserted++;
    }
  }

  revalidateMenu();
  return ok({
    inserted,
    updated,
    skipped,
    total: validItems.length,
  });
}

export interface RecipeImportSummary {
  totalRows: number;
  importedRows: number;
  matchedDishesCount: number;
  errors: string[];
}

import type { RecipeImportRowInput } from "@/types/restaurant";

export async function importRecipes(
  rows: RecipeImportRowInput[],
  mode: "replace" | "append" = "replace"
): Promise<ActionResult<RecipeImportSummary>> {
  if (rows.length === 0) {
    return fail("Không có dữ liệu định lượng để nhập.");
  }

  const supabase = await createClient();

  const [{ data: menuItems, error: menuErr }, { data: ingredients, error: ingErr }] = await Promise.all([
    supabase.from("menu_items").select("id, code, name, is_combo"),
    supabase.from("ingredients").select("id, code, name, base_unit"),
  ]);

  if (menuErr) return fail(dbMessage(menuErr));
  if (ingErr) return fail(dbMessage(ingErr));

  const menuByCode = new Map<string, { id: string; name: string; is_combo: boolean }>();
  const menuByName = new Map<string, { id: string; name: string; is_combo: boolean }>();
  for (const m of menuItems ?? []) {
    if (m.code) menuByCode.set(m.code.trim().toLowerCase(), m);
    if (m.name) menuByName.set(m.name.trim().toLowerCase(), m);
  }

  const ingByCode = new Map<string, { id: string; name: string; base_unit: string }>();
  const ingByName = new Map<string, { id: string; name: string; base_unit: string }>();
  for (const i of ingredients ?? []) {
    if (i.code) ingByCode.set(i.code.trim().toLowerCase(), i);
    if (i.name) ingByName.set(i.name.trim().toLowerCase(), i);
  }

  const errors: string[] = [];
  const dishRecipesMap = new Map<string, { ingredient_id: string; quantity: number; waste_percent: number; note: string | null }[]>();

  rows.forEach((row, index) => {
    const rowNum = index + 2;
    const mCode = row.menu_item_code?.trim().toLowerCase();
    const mName = row.menu_item_name?.trim().toLowerCase();
    const dish = (mCode ? menuByCode.get(mCode) : undefined) ?? (mName ? menuByName.get(mName) : undefined);

    if (!dish) {
      errors.push(`Dòng ${rowNum}: Không tìm thấy món ăn "${row.menu_item_code || row.menu_item_name}"`);
      return;
    }
    if (dish.is_combo) {
      errors.push(`Dòng ${rowNum}: "${dish.name}" là Combo, không định lượng từ nguyên liệu kho`);
      return;
    }

    const iCode = row.ingredient_code?.trim().toLowerCase();
    const iName = row.ingredient_name?.trim().toLowerCase();
    const ing = (iCode ? ingByCode.get(iCode) : undefined) ?? (iName ? ingByName.get(iName) : undefined);

    if (!ing) {
      errors.push(`Dòng ${rowNum}: Không tìm thấy nguyên liệu "${row.ingredient_code || row.ingredient_name}"`);
      return;
    }

    if (!dishRecipesMap.has(dish.id)) {
      dishRecipesMap.set(dish.id, []);
    }

    dishRecipesMap.get(dish.id)!.push({
      ingredient_id: ing.id,
      quantity: Number(row.quantity),
      waste_percent: Number(row.waste_percent || 0),
      note: row.note ?? null,
    });
  });

  if (dishRecipesMap.size === 0) {
    return fail("Không có dòng định lượng nào khớp với món ăn và nguyên liệu trong hệ thống.", {
      errors,
    });
  }

  let importedRows = 0;

  for (const [menuItemId, lines] of dishRecipesMap.entries()) {
    if (mode === "replace") {
      const { error: delErr } = await supabase.from("recipes").delete().eq("menu_item_id", menuItemId);
      if (delErr) return fail(dbMessage(delErr));
    }

    const { error: upsertErr } = await supabase.from("recipes").upsert(
      lines.map((l) => ({
        menu_item_id: menuItemId,
        ingredient_id: l.ingredient_id,
        quantity: l.quantity,
        waste_percent: l.waste_percent,
        note: l.note,
      })),
      { onConflict: "menu_item_id,ingredient_id" }
    );

    if (upsertErr) return fail(dbMessage(upsertErr));
    importedRows += lines.length;
  }

  revalidateMenu();
  revalidatePath("/inventory");

  return ok({
    totalRows: rows.length,
    importedRows,
    matchedDishesCount: dishRecipesMap.size,
    errors,
  });
}


