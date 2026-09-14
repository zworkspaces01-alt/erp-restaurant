import "server-only";

import { createClient } from "@/lib/supabase/server";
import type {
  Ingredient,
  InventoryStatusRow,
  InventoryTransaction,
  InventoryTxnType,
  Supplier,
} from "@/types/restaurant";

/**
 * Bien do ngay dia phuong (Asia/Ho_Chi_Minh, UTC+7) cho cot `timestamptz`.
 * `created_at` duoc bucket theo ngay dia phuong trong get_pnl_report, nen bo loc
 * phai dung offset +07:00 va chan tren mo (ngay ke tiep) de khong lech 7 gio.
 */
const APP_TZ_OFFSET = "+07:00";

function localDayStart(date: string): string {
  return `${date}T00:00:00${APP_TZ_OFFSET}`;
}

/** 00:00 +07:00 cua ngay ke tiep — dung lam chan tren KHONG bao gom (`lt`). */
function nextLocalDayStart(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const next = new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
  next.setUTCDate(next.getUTCDate() + 1);
  return `${next.toISOString().slice(0, 10)}T00:00:00${APP_TZ_OFFSET}`;
}

/** PostgREST loi 22P02 khi route segment khong phai uuid → coi nhu khong tim thay. */
function isInvalidUuid(error: { code?: string | null } | null): boolean {
  return error?.code === "22P02";
}

/** One ledger row joined with its ingredient (for the ledger tables). */
export interface LedgerRow extends InventoryTransaction {
  ingredient: Pick<Ingredient, "id" | "code" | "name" | "base_unit"> | null;
}

export interface LedgerFilters {
  ingredientId?: string;
  txnType?: InventoryTxnType;
  from?: string;
  to?: string;
  limit?: number;
}

/** `/inventory` — ingredients + supplier name, low-stock first (DATABASE.md §6 v_inventory_status). */
export async function getInventoryStatus(includeInactive = false): Promise<InventoryStatusRow[]> {
  const supabase = await createClient();
  let query = supabase.from("v_inventory_status").select("*");
  if (!includeInactive) query = query.eq("is_active", true);

  const { data, error } = await query
    .order("is_below_min", { ascending: false })
    .order("name", { ascending: true });

  if (error) throw new Error(error.message);
  return data ?? [];
}

/** Single ingredient row from the status view (`/inventory/[id]` header + stat cards). */
export async function getIngredientStatus(id: string): Promise<InventoryStatusRow | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("v_inventory_status")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    if (isInvalidUuid(error)) return null;
    throw new Error(error.message);
  }
  return data;
}

/** Active ingredients for pickers (adjustment form). */
export async function getIngredientOptions(): Promise<
  Pick<Ingredient, "id" | "code" | "name" | "base_unit" | "current_stock" | "category">[]
> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ingredients")
    .select("id, code, name, base_unit, current_stock, category")
    .eq("is_active", true)
    .order("name", { ascending: true });

  if (error) throw new Error(error.message);
  return data ?? [];
}

/** Active suppliers for the ingredient form's default-supplier select. */
export async function getSupplierOptions(): Promise<Pick<Supplier, "id" | "name">[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("suppliers")
    .select("id, name")
    .eq("is_active", true)
    .order("name", { ascending: true });

  if (error) throw new Error(error.message);
  return data ?? [];
}

/** Ledger rows (`/inventory/transactions`, `/inventory/[id]`), newest first. */
export async function getInventoryTransactions(filters: LedgerFilters = {}): Promise<LedgerRow[]> {
  const supabase = await createClient();
  let query = supabase
    .from("inventory_transactions")
    .select("*, ingredient:ingredients(id, code, name, base_unit)");

  if (filters.ingredientId) query = query.eq("ingredient_id", filters.ingredientId);
  if (filters.txnType) query = query.eq("txn_type", filters.txnType);
  if (filters.from) query = query.gte("created_at", localDayStart(filters.from));
  if (filters.to) query = query.lt("created_at", nextLocalDayStart(filters.to));

  const { data, error } = await query
    .order("created_at", { ascending: false })
    .limit(filters.limit ?? 500);

  if (error) throw new Error(error.message);
  return (data ?? []) as LedgerRow[];
}

/** Recent manual movements for `/inventory/adjustments`. */
export async function getRecentAdjustments(limit = 30): Promise<LedgerRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("inventory_transactions")
    .select("*, ingredient:ingredients(id, code, name, base_unit)")
    .in("txn_type", ["waste", "adjustment", "stocktake"])
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);
  return (data ?? []) as LedgerRow[];
}

/** Full ingredient rows (shared with the menu/purchases modules' pickers). */
export async function getIngredients(includeInactive = false): Promise<Ingredient[]> {
  const supabase = await createClient();
  let query = supabase.from("ingredients").select("*");
  if (!includeInactive) query = query.eq("is_active", true);

  const { data, error } = await query
    .order("category", { ascending: true, nullsFirst: false })
    .order("name", { ascending: true });

  if (error) throw new Error(error.message);
  return data ?? [];
}

/** Single ingredient row (edit dialog). */
export async function getIngredientById(id: string): Promise<Ingredient | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("ingredients").select("*").eq("id", id).maybeSingle();
  if (error) {
    if (isInvalidUuid(error)) return null;
    throw new Error(error.message);
  }
  return data;
}
