"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { fail, ok, type ActionResult } from "@/types/actions";
import { ingredientSchema, parseDbError, type IngredientInput } from "@/types/restaurant";
import { todayISO } from "@/lib/format";
import {
  stockAdjustmentWithDateSchema,
  toTxnTimestamp,
  stocktakeSheetSchema,
  type StockAdjustmentWithDateInput,
  type StocktakeSheetInput,
} from "@/components/inventory/adjustment-schema";

function revalidateInventory(id?: string) {
  revalidatePath("/inventory");
  revalidatePath("/inventory/transactions");
  revalidatePath("/inventory/adjustments");
  if (id) revalidatePath(`/inventory/${id}`);
  revalidatePath("/dashboard");
}

/** Chuyển đổi dữ liệu form sang row DB. Nếu có default_price > 0 và includePrice = true, gán avg_cost_price ban đầu. */
function toIngredientRow(input: IngredientInput, includePrice = false) {
  const factor = Number(input.conversion_factor) || 1;
  const defaultPrice = Number(input.default_price ?? 0);
  const avgCostPrice = defaultPrice > 0 ? defaultPrice / factor : 0;

  return {
    code: input.code,
    name: input.name,
    category: input.category,
    base_unit: input.base_unit,
    import_unit: input.import_unit,
    conversion_factor: input.conversion_factor,
    min_alert_stock: input.min_alert_stock,
    default_supplier_id: input.default_supplier_id,
    is_active: input.is_active,
    note: input.note,
    ...(includePrice && defaultPrice > 0 ? { avg_cost_price: avgCostPrice } : {}),
  };
}

export async function createIngredient(input: IngredientInput): Promise<ActionResult<{ id: string }>> {
  const parsed = ingredientSchema.safeParse(input);
  if (!parsed.success) {
    return fail("Dữ liệu không hợp lệ", parsed.error.flatten().fieldErrors);
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ingredients")
    .insert(toIngredientRow(parsed.data, true))
    .select("id")
    .single();

  if (error) {
    return fail(error.code === "23505" ? "Mã nguyên liệu đã tồn tại" : parseDbError(error));
  }

  revalidateInventory(data.id);
  return ok({ id: data.id });
}

export async function updateIngredient(
  id: string,
  input: IngredientInput
): Promise<ActionResult<{ id: string }>> {
  const parsed = ingredientSchema.safeParse(input);
  if (!parsed.success) {
    return fail("Dữ liệu không hợp lệ", parsed.error.flatten().fieldErrors);
  }

  const supabase = await createClient();
  const includePrice = Boolean(parsed.data.default_price && parsed.data.default_price > 0);
  const { error } = await supabase
    .from("ingredients")
    .update(toIngredientRow(parsed.data, includePrice))
    .eq("id", id);

  if (error) {
    return fail(error.code === "23505" ? "Mã nguyên liệu đã tồn tại" : parseDbError(error));
  }

  revalidateInventory(id);
  return ok({ id });
}

/** Soft delete: ngừng sử dụng nguyên liệu (không xóa để giữ lịch sử sổ kho). */
export async function setIngredientActive(
  id: string,
  isActive: boolean
): Promise<ActionResult<{ id: string }>> {
  const supabase = await createClient();
  const { error } = await supabase.from("ingredients").update({ is_active: isActive }).eq("id", id);
  if (error) return fail(parseDbError(error));

  revalidateInventory(id);
  return ok({ id });
}

/**
 * Gọi `record_stock_adjustment` kèm `p_txn_at` (DATABASE.md §5.5).
 * Bản RPC đang triển khai trên máy chưa có tham số này (PGRST202) → tự lùi về
 * chữ ký cũ để app vẫn chạy; khi DB được migrate thì ngày nghiệp vụ có hiệu lực ngay.
 */
async function callRecordStockAdjustment(
  supabase: Awaited<ReturnType<typeof createClient>>,
  args: {
    p_ingredient_id: string;
    p_txn_type: "waste" | "adjustment" | "stocktake";
    p_quantity: number;
    p_note?: string;
  },
  txnAt?: string
) {
  if (txnAt) {
    const withDate = await supabase.rpc("record_stock_adjustment", {
      ...args,
      ...({ p_txn_at: txnAt } as Record<string, string>),
    });
    if (!withDate.error || withDate.error.code !== "PGRST202") return withDate;
  }
  return supabase.rpc("record_stock_adjustment", args);
}

/** `record_stock_adjustment` (DATABASE.md §5.5) — waste / adjustment / stocktake, base units. */
export async function recordStockAdjustment(
  input: StockAdjustmentWithDateInput
): Promise<ActionResult<{ id: string | null }>> {
  const parsed = stockAdjustmentWithDateSchema.safeParse(input);
  if (!parsed.success) {
    return fail("Dữ liệu không hợp lệ", parsed.error.flatten().fieldErrors);
  }

  const supabase = await createClient();
  const txnAt = toTxnTimestamp(parsed.data.txn_at, todayISO());
  const { data, error } = await callRecordStockAdjustment(
    supabase,
    {
      p_ingredient_id: parsed.data.ingredient_id,
      p_txn_type: parsed.data.txn_type,
      p_quantity: parsed.data.quantity,
      p_note: parsed.data.note ?? undefined,
    },
    txnAt
  );

  if (error) return fail(parseDbError(error));

  revalidateInventory(parsed.data.ingredient_id);
  revalidatePath("/reports/pnl");
  // §5.5: kiểm kê khớp sổ không ghi dòng nào và trả về null.
  return ok({ id: (data as string | null) ?? null });
}

/**
 * Kiểm kê hàng loạt (DATABASE.md §7.4): gọi `record_stock_adjustment` kiểu `stocktake`
 * cho từng dòng người dùng đã đếm. Dòng khớp sổ được RPC bỏ qua (trả null).
 */
export async function recordStocktakeSheet(
  input: StocktakeSheetInput
): Promise<ActionResult<{ recorded: number; skipped: number }>> {
  const parsed = stocktakeSheetSchema.safeParse(input);
  if (!parsed.success) {
    return fail("Dữ liệu không hợp lệ", parsed.error.flatten().fieldErrors);
  }

  const supabase = await createClient();
  const txnAt = toTxnTimestamp(parsed.data.txn_at, todayISO());
  let recorded = 0;
  let skipped = 0;

  for (const line of parsed.data.lines) {
    const { data, error } = await callRecordStockAdjustment(
      supabase,
      {
        p_ingredient_id: line.ingredient_id,
        p_txn_type: "stocktake",
        p_quantity: line.counted,
        p_note: parsed.data.note ?? undefined,
      },
      txnAt
    );

    if (error) {
      revalidateInventory();
      revalidatePath("/reports/pnl");
      return fail(
        recorded > 0
          ? `Đã ghi ${recorded} dòng, dừng ở dòng kế tiếp: ${parseDbError(error)}`
          : parseDbError(error)
      );
    }
    if (data) recorded += 1;
    else skipped += 1;
  }

  revalidateInventory();
  revalidatePath("/reports/pnl");
  return ok({ recorded, skipped });
}

export interface IngredientImportResult {
  inserted: number;
  updated: number;
  skipped: number;
  total: number;
}

/**
 * Nhập hàng loạt nguyên liệu từ file Excel.
 * - mode = "skip": Nếu mã nguyên liệu đã tồn tại thì bỏ qua.
 * - mode = "update": Nếu mã nguyên liệu đã tồn tại thì cập nhật thông tin.
 */
export async function importIngredients(
  items: IngredientInput[],
  mode: "skip" | "update" = "skip"
): Promise<ActionResult<IngredientImportResult>> {
  if (!items || items.length === 0) {
    return fail("Không có dữ liệu để nhập");
  }

  const validItems: IngredientInput[] = [];
  for (let i = 0; i < items.length; i++) {
    const parsed = ingredientSchema.safeParse(items[i]);
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
      .from("ingredients")
      .select("id, code")
      .in("code", codes);

    if (queryError) return fail(parseDbError(queryError));
    for (const r of existing ?? []) {
      if (r.code) existingMap.set(r.code, r.id);
    }
  }

  let inserted = 0;
  let updated = 0;
  let skipped = 0;

  for (const item of validItems) {
    const existingId = item.code ? existingMap.get(item.code) : undefined;
    const factor = Number(item.conversion_factor) || 1;
    const defaultPrice = Number(item.default_price ?? 0);
    const avgCostPrice = defaultPrice > 0 ? defaultPrice / factor : 0;

    if (existingId) {
      if (mode === "update") {
        const { error: updErr } = await supabase
          .from("ingredients")
          .update({
            name: item.name,
            category: item.category ?? null,
            base_unit: item.base_unit,
            import_unit: item.import_unit,
            conversion_factor: item.conversion_factor,
            min_alert_stock: item.min_alert_stock,
            is_active: item.is_active,
            note: item.note ?? null,
            ...(defaultPrice > 0 ? { avg_cost_price: avgCostPrice } : {}),
          })
          .eq("id", existingId);

        if (updErr) return fail(parseDbError(updErr));
        updated++;
      } else {
        skipped++;
      }
    } else {
      const { data: insData, error: insErr } = await supabase
        .from("ingredients")
        .insert({
          code: item.code ?? null,
          name: item.name,
          category: item.category ?? null,
          base_unit: item.base_unit,
          import_unit: item.import_unit,
          conversion_factor: item.conversion_factor,
          min_alert_stock: item.min_alert_stock,
          is_active: item.is_active,
          note: item.note ?? null,
          ...(defaultPrice > 0 ? { avg_cost_price: avgCostPrice } : {}),
        })
        .select("id, code")
        .single();

      if (insErr) return fail(parseDbError(insErr));
      if (insData?.code) existingMap.set(insData.code, insData.id);
      inserted++;
    }
  }

  revalidateInventory();
  return ok({
    inserted,
    updated,
    skipped,
    total: validItems.length,
  });
}

