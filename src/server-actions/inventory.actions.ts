"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fail, failZod, ok, type ActionResult } from "@/types/actions";
import { ingredientSchema, parseDbError, type IngredientInput } from "@/types/restaurant";
import { normalizeVietnamese, computeSimilarity } from "@/lib/ai/invoice-matcher";
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
  revalidatePath("/suppliers");
  revalidatePath("/purchases");
}

/** Chuyển đổi dữ liệu form sang row DB (loại bỏ các cột do DB tự tính như current_stock, avg_cost_price). */
function toIngredientRow(input: IngredientInput) {
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
  };
}

export async function createIngredient(input: IngredientInput): Promise<ActionResult<{ id: string }>> {
  const parsed = ingredientSchema.safeParse(input);
  if (!parsed.success) {
    return failZod(parsed.error);
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ingredients")
    .insert(toIngredientRow(parsed.data))
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
    return failZod(parsed.error);
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("ingredients")
    .update(toIngredientRow(parsed.data))
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
    return failZod(parsed.error);
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
    return failZod(parsed.error);
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

export interface SupplierProvisionInfo {
  id?: string | null;
  name?: string | null;
  tax_code?: string | null;
  phone?: string | null;
  address?: string | null;
  contact_name?: string | null;
}

export interface IngredientImportResult {
  inserted: number;
  updated: number;
  skipped: number;
  total: number;
  supplier_id?: string | null;
  supplier_name?: string | null;
}

/**
 * Nhập hàng loạt nguyên liệu từ file Excel hoặc từ quét hóa đơn OCR.
 * - mode = "skip": Nếu mã nguyên liệu đã tồn tại thì bỏ qua.
 * - mode = "update": Nếu mã nguyên liệu đã tồn tại thì cập nhật thông tin.
 * - supplierInfo: Thông tin NCC quét từ hóa đơn, tự động thêm vào danh mục NCC nếu chưa có.
 */
export async function importIngredients(
  items: IngredientInput[],
  mode: "skip" | "update" = "skip",
  supplierInfo?: SupplierProvisionInfo | null
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

  // Tự động lọc bỏ các nguyên liệu trùng lặp trong đợt nhập (giữ lại mục đầu tiên, bỏ các mục nhập sau)
  const uniqueItems: IngredientInput[] = [];
  const seenBatchNames = new Set<string>();
  const seenBatchCodes = new Set<string>();
  let duplicateBatchCount = 0;

  for (const item of validItems) {
    const norm = normalizeVietnamese(item.name);
    const c = item.code?.trim().toUpperCase();

    if (seenBatchNames.has(norm) || (c && seenBatchCodes.has(c))) {
      duplicateBatchCount++;
      continue;
    }
    seenBatchNames.add(norm);
    if (c) seenBatchCodes.add(c);
    uniqueItems.push(item);
  }

  const supabase = await createClient();
  const db = process.env.SUPABASE_SERVICE_ROLE_KEY ? createAdminClient() : supabase;

  // 1. Tự động kiểm tra & thêm Nhà cung cấp vào hệ thống nếu có thông tin NCC
  let resolvedSupplierId: string | null = supplierInfo?.id || null;
  let resolvedSupplierName: string | null = supplierInfo?.name || null;

  if (supplierInfo?.name?.trim()) {
    const rawSupName = supplierInfo.name.trim();
    const cleanTax = supplierInfo.tax_code ? supplierInfo.tax_code.replace(/\D/g, "") : "";
    const cleanPhone = supplierInfo.phone ? supplierInfo.phone.replace(/\D/g, "") : "";
    const normRawName = normalizeVietnamese(rawSupName);

    const { data: existingSuppliers } = await db
      .from("suppliers")
      .select("id, name, code, tax_code, phone, address")
      .eq("is_active", true);

    let matched = (existingSuppliers ?? []).find((s) => {
      if (cleanTax && s.tax_code && s.tax_code.replace(/\D/g, "") === cleanTax) return true;
      if (cleanPhone && s.phone && s.phone.replace(/\D/g, "") === cleanPhone) return true;
      if (normalizeVietnamese(s.name) === normRawName) return true;
      return computeSimilarity(s.name, rawSupName) >= 0.75;
    });

    if (!matched) {
      const supPrefix =
        normRawName
          .split(/\s+/)
          .map((w) => w[0])
          .join("")
          .toUpperCase()
          .slice(0, 4) || "NCC";
      let supCode = `NCC-${supPrefix}-${Math.floor(100 + Math.random() * 900)}`;

      let { data: newSup, error: insSupErr } = await db
        .from("suppliers")
        .insert({
          name: rawSupName,
          code: supCode,
          tax_code: supplierInfo.tax_code || null,
          phone: supplierInfo.phone || null,
          address: supplierInfo.address || null,
          contact_name: supplierInfo.contact_name || null,
          is_active: true,
          payment_terms_days: 0,
        })
        .select("id, name, code, tax_code, phone, address")
        .maybeSingle();

      if (insSupErr && insSupErr.code === "23505") {
        supCode = `NCC-${supPrefix}-${Date.now().toString().slice(-4)}`;
        const retryRes = await db
          .from("suppliers")
          .insert({
            name: rawSupName,
            code: supCode,
            tax_code: supplierInfo.tax_code || null,
            phone: supplierInfo.phone || null,
            address: supplierInfo.address || null,
            contact_name: supplierInfo.contact_name || null,
            is_active: true,
            payment_terms_days: 0,
          })
          .select("id, name, code, tax_code, phone, address")
          .maybeSingle();
        newSup = retryRes.data;
        insSupErr = retryRes.error;
      }

      if (newSup) {
        matched = newSup;
      }
    }

    if (matched) {
      resolvedSupplierId = matched.id;
      resolvedSupplierName = matched.name;
    }
  }

  // Gán nhà cung cấp vào các nguyên liệu chưa có default_supplier_id
  if (resolvedSupplierId) {
    for (const item of uniqueItems) {
      if (!item.default_supplier_id) {
        item.default_supplier_id = resolvedSupplierId;
      }
    }
  }

  // 2. Truy vấn toàn bộ nguyên liệu hiện có để đối chiếu cả Mã (code) và Tên (name)
  const { data: allExisting, error: queryError } = await supabase
    .from("ingredients")
    .select("id, code, name");

  if (queryError) return fail(parseDbError(queryError));

  const existingByCode = new Map<string, string>();
  const existingByName = new Map<string, string>();

  for (const r of allExisting ?? []) {
    if (r.code) existingByCode.set(r.code.trim().toUpperCase(), r.id);
    if (r.name) existingByName.set(normalizeVietnamese(r.name), r.id);
  }

  let inserted = 0;
  let updated = 0;
  let skipped = duplicateBatchCount;

  for (const item of uniqueItems) {
    const normName = normalizeVietnamese(item.name);
    const code = item.code?.trim().toUpperCase();
    const existingId = (code ? existingByCode.get(code) : undefined) || existingByName.get(normName);

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
            default_supplier_id: item.default_supplier_id ?? null,
            is_active: item.is_active,
            note: item.note ?? null,
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
          default_supplier_id: item.default_supplier_id ?? null,
          is_active: item.is_active,
          note: item.note ?? null,
        })
        .select("id, code, name")
        .single();

      if (insErr) return fail(parseDbError(insErr));
      if (insData) {
        if (insData.code) existingByCode.set(insData.code.trim().toUpperCase(), insData.id);
        if (insData.name) existingByName.set(normalizeVietnamese(insData.name), insData.id);
      }
      inserted++;
    }
  }

  revalidateInventory();
  return ok({
    inserted,
    updated,
    skipped,
    total: validItems.length,
    supplier_id: resolvedSupplierId,
    supplier_name: resolvedSupplierName,
  });
}

