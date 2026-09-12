"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { fail, ok, type ActionResult } from "@/types/actions";
import {
  adjustmentSchema,
  ingredientSchema,
  type AdjustmentInput,
  type IngredientInput,
} from "@/types/restaurant";

export async function createIngredient(
  input: IngredientInput
): Promise<ActionResult<{ id: string }>> {
  const parsed = ingredientSchema.safeParse(input);
  if (!parsed.success) {
    return fail("Dữ liệu không hợp lệ", parsed.error.flatten().fieldErrors);
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ingredients")
    .insert(parsed.data)
    .select("id")
    .single();

  if (error) {
    return fail(error.code === "23505" ? "Mã nguyên liệu đã tồn tại" : error.message);
  }

  revalidatePath("/inventory");
  revalidatePath("/dashboard");
  return ok({ id: data.id });
}

export async function updateIngredient(
  id: string,
  input: IngredientInput
): Promise<ActionResult<void>> {
  const parsed = ingredientSchema.safeParse(input);
  if (!parsed.success) {
    return fail("Dữ liệu không hợp lệ", parsed.error.flatten().fieldErrors);
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("ingredients")
    .update(parsed.data)
    .eq("id", id);

  if (error) return fail(error.message);

  revalidatePath("/inventory");
  revalidatePath(`/inventory/${id}`);
  return ok(undefined);
}

export async function createAdjustment(
  input: AdjustmentInput
): Promise<ActionResult<void>> {
  const parsed = adjustmentSchema.safeParse(input);
  if (!parsed.success) {
    return fail("Dữ liệu không hợp lệ", parsed.error.flatten().fieldErrors);
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("create_inventory_adjustment", {
    p_ingredient_id: parsed.data.ingredient_id,
    p_adjustment_type: parsed.data.adjustment_type,
    p_new_stock: parsed.data.new_stock,
    p_reason: parsed.data.reason,
  });

  if (error) return fail(error.message);

  revalidatePath("/inventory");
  revalidatePath("/inventory/adjustments");
  revalidatePath("/inventory/transactions");
  revalidatePath("/dashboard");
  return ok(undefined);
}
