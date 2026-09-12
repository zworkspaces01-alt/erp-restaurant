"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { fail, ok, type ActionResult } from "@/types/actions";
import {
  menuItemSchema,
  recipeBatchSchema,
  type MenuItemInput,
  type RecipeBatchInput,
} from "@/types/restaurant";

export async function createMenuItem(
  input: MenuItemInput
): Promise<ActionResult<{ id: string }>> {
  const parsed = menuItemSchema.safeParse(input);
  if (!parsed.success) {
    return fail("Dữ liệu không hợp lệ", parsed.error.flatten().fieldErrors);
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("menu_items")
    .insert(parsed.data)
    .select("id")
    .single();

  if (error) {
    return fail(error.code === "23505" ? "Mã món ăn đã tồn tại" : error.message);
  }

  revalidatePath("/menu");
  return ok({ id: data.id });
}

export async function updateMenuItem(
  id: string,
  input: MenuItemInput
): Promise<ActionResult<void>> {
  const parsed = menuItemSchema.safeParse(input);
  if (!parsed.success) {
    return fail("Dữ liệu không hợp lệ", parsed.error.flatten().fieldErrors);
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("menu_items")
    .update(parsed.data)
    .eq("id", id);

  if (error) return fail(error.message);

  revalidatePath("/menu");
  revalidatePath(`/menu/${id}`);
  return ok(undefined);
}

export async function saveRecipeBatch(
  input: RecipeBatchInput
): Promise<ActionResult<void>> {
  const parsed = recipeBatchSchema.safeParse(input);
  if (!parsed.success) {
    return fail("Dữ liệu không hợp lệ", parsed.error.flatten().fieldErrors);
  }

  const supabase = await createClient();

  // Xóa recipes cũ của món và nạp recipes mới
  const { error: delError } = await supabase
    .from("recipes")
    .delete()
    .eq("menu_item_id", parsed.data.menu_item_id);

  if (delError) return fail(delError.message);

  if (parsed.data.items.length > 0) {
    const records = parsed.data.items.map((it) => ({
      menu_item_id: parsed.data.menu_item_id,
      ingredient_id: it.ingredient_id,
      quantity: it.quantity,
      waste_percent: it.waste_percent,
      notes: it.notes ?? null,
    }));

    const { error: insError } = await supabase.from("recipes").insert(records);
    if (insError) return fail(insError.message);
  }

  revalidatePath("/menu");
  revalidatePath(`/menu/${parsed.data.menu_item_id}`);
  revalidatePath("/menu/engineering");
  return ok(undefined);
}
