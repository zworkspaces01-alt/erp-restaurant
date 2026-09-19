import "server-only";

import { createClient } from "@/lib/supabase/server";
import { normalizeVietnamese } from "@/lib/ai/invoice-matcher";

export interface IngredientPurchaseItem {
  id: string;
  po_id: string;
  po_number: string;
  order_date: string;
  supplier_id: string;
  supplier_name: string;
  ingredient_id: string;
  ingredient_name: string;
  ingredient_code: string | null;
  quantity: number;
  unit: string;
  unit_price: number;
  line_total: number;
  base_quantity: number;
  base_unit: string;
}

export interface SupplierPurchaseBreakdown {
  supplier_id: string;
  supplier_name: string;
  quantity: number;
  amount: number;
  po_count: number;
}

export interface IngredientPurchaseSummary {
  ingredient_id: string;
  ingredient_name: string;
  ingredient_code: string | null;
  base_unit: string;
  total_quantity: number;
  total_amount: number;
  avg_unit_price: number;
  min_unit_price: number;
  max_unit_price: number;
  last_unit_price: number;
  last_order_date: string | null;
  po_count: number;
  suppliers: SupplierPurchaseBreakdown[];
  items: IngredientPurchaseItem[];
}

export interface QueryIngredientPurchasesParams {
  keyword?: string;
  fromDate?: string;
  toDate?: string;
  supplierId?: string;
}

export interface TopPurchasedIngredient {
  ingredient_id: string;
  ingredient_name: string;
  ingredient_code: string | null;
  base_unit: string;
  total_quantity: number;
  total_amount: number;
  avg_unit_price: number;
  po_count: number;
}

const num = (v: unknown): number => {
  if (v === null || v === undefined || v === "") return 0;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};

/**
 * Lấy danh sách tên & mã tất cả nguyên liệu trong DB để làm danh mục nhận diện từ khóa cho AI
 */
export async function getAllIngredientDirectory(): Promise<Array<{ id: string; name: string; code: string | null; base_unit: string }>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ingredients")
    .select("id, name, code, base_unit")
    .eq("is_active", true)
    .order("name", { ascending: true });

  if (error) {
    console.error("[getAllIngredientDirectory] Error:", error);
    return [];
  }
  return data ?? [];
}

/**
 * Truy vấn chi tiết và tổng hợp số lượng / chi phí nhập của nguyên liệu theo từ khóa và mốc thời gian
 */
export async function queryIngredientPurchases(
  params: QueryIngredientPurchasesParams
): Promise<{
  summaries: IngredientPurchaseSummary[];
  period: { fromDate?: string; toDate?: string };
  matchedIngredientsCount: number;
}> {
  const supabase = await createClient();
  const { keyword, fromDate, toDate, supplierId } = params;

  // 1. Tìm nguyên liệu phù hợp nếu có từ khóa
  let targetIngredientIds: string[] = [];
  let ingredientDir: Array<{ id: string; name: string; code: string | null; base_unit: string }> = [];

  if (keyword && keyword.trim()) {
    const normKeyword = normalizeVietnamese(keyword);
    const { data: allIngs } = await supabase
      .from("ingredients")
      .select("id, name, code, base_unit")
      .order("name", { ascending: true });

    ingredientDir = allIngs ?? [];

    const matches = ingredientDir.filter((ing) => {
      const normName = normalizeVietnamese(ing.name);
      const normCode = normalizeVietnamese(ing.code || "");
      return normName.includes(normKeyword) || normCode.includes(normKeyword) || normKeyword.includes(normName);
    });

    if (matches.length > 0) {
      targetIngredientIds = matches.map((m) => m.id);
    }
  }

  // 2. Query purchase_order_items với join
  let query = supabase.from("purchase_order_items").select(`
    id,
    quantity,
    unit,
    unit_price,
    line_total,
    base_quantity,
    created_at,
    ingredients!inner (
      id,
      code,
      name,
      base_unit
    ),
    purchase_orders!inner (
      id,
      po_number,
      order_date,
      payment_status,
      supplier_id,
      suppliers (
        id,
        name,
        code
      )
    )
  `);

  if (targetIngredientIds.length > 0) {
    query = query.in("ingredient_id", targetIngredientIds);
  }

  if (fromDate) {
    query = query.gte("purchase_orders.order_date", fromDate);
  }
  if (toDate) {
    query = query.lte("purchase_orders.order_date", toDate);
  }
  if (supplierId) {
    query = query.eq("purchase_orders.supplier_id", supplierId);
  }

  const { data, error } = await query
    .order("purchase_orders(order_date)", { ascending: false })
    .limit(1000);

  if (error) {
    console.error("[queryIngredientPurchases] Error:", error);
    throw new Error(error.message);
  }

  // 3. Chuẩn hóa dữ liệu sang cấu trúc phẳng
  type RawJoinRow = {
    id: string;
    quantity: number | string | null;
    unit: string | null;
    unit_price: number | string | null;
    line_total: number | string | null;
    base_quantity: number | string | null;
    created_at: string;
    ingredients: { id: string; code: string | null; name: string; base_unit: string };
    purchase_orders: {
      id: string;
      po_number: string | null;
      order_date: string;
      payment_status: string;
      supplier_id: string;
      suppliers: { id: string; name: string; code: string | null } | null;
    };
  };

  const rawRows = (data as unknown as RawJoinRow[]) ?? [];

  const items: IngredientPurchaseItem[] = rawRows.map((r) => ({
    id: r.id,
    po_id: r.purchase_orders?.id ?? "",
    po_number: r.purchase_orders?.po_number ?? "—",
    order_date: r.purchase_orders?.order_date ?? "",
    supplier_id: r.purchase_orders?.supplier_id ?? "",
    supplier_name: r.purchase_orders?.suppliers?.name ?? "—",
    ingredient_id: r.ingredients?.id ?? "",
    ingredient_name: r.ingredients?.name ?? "—",
    ingredient_code: r.ingredients?.code ?? null,
    quantity: num(r.quantity),
    unit: r.unit ?? r.ingredients?.base_unit ?? "",
    unit_price: num(r.unit_price),
    line_total: num(r.line_total),
    base_quantity: num(r.base_quantity || r.quantity),
    base_unit: r.ingredients?.base_unit ?? "",
  }));

  // 4. Nhóm theo từng nguyên liệu (ingredient_id)
  const groupedMap = new Map<string, IngredientPurchaseItem[]>();
  for (const item of items) {
    const list = groupedMap.get(item.ingredient_id) || [];
    list.push(item);
    groupedMap.set(item.ingredient_id, list);
  }

  const summaries: IngredientPurchaseSummary[] = [];

  for (const [ingId, ingItems] of groupedMap.entries()) {
    const first = ingItems[0];
    let totalQuantity = 0;
    let totalAmount = 0;
    let minPrice = Infinity;
    let maxPrice = -Infinity;
    let lastPrice = 0;
    let lastOrderDate: string | null = null;

    const supMap = new Map<string, { supplier_id: string; supplier_name: string; quantity: number; amount: number; count: number }>();

    // Sắp xếp ngày giảm dần
    const sorted = [...ingItems].sort((a, b) => b.order_date.localeCompare(a.order_date));
    if (sorted.length > 0) {
      lastPrice = sorted[0].unit_price;
      lastOrderDate = sorted[0].order_date;
    }

    for (const it of ingItems) {
      totalQuantity += it.quantity;
      totalAmount += it.line_total;
      if (it.unit_price > 0) {
        if (it.unit_price < minPrice) minPrice = it.unit_price;
        if (it.unit_price > maxPrice) maxPrice = it.unit_price;
      }

      const sup = supMap.get(it.supplier_id) || {
        supplier_id: it.supplier_id,
        supplier_name: it.supplier_name,
        quantity: 0,
        amount: 0,
        count: 0,
      };
      sup.quantity += it.quantity;
      sup.amount += it.line_total;
      sup.count += 1;
      supMap.set(it.supplier_id, sup);
    }

    const avgPrice = totalQuantity > 0 ? Math.round(totalAmount / totalQuantity) : 0;

    summaries.push({
      ingredient_id: ingId,
      ingredient_name: first.ingredient_name,
      ingredient_code: first.ingredient_code,
      base_unit: first.unit || first.base_unit,
      total_quantity: totalQuantity,
      total_amount: totalAmount,
      avg_unit_price: avgPrice,
      min_unit_price: minPrice === Infinity ? 0 : minPrice,
      max_unit_price: maxPrice === -Infinity ? 0 : maxPrice,
      last_unit_price: lastPrice,
      last_order_date: lastOrderDate,
      po_count: ingItems.length,
      suppliers: Array.from(supMap.values()).map((s) => ({
        supplier_id: s.supplier_id,
        supplier_name: s.supplier_name,
        quantity: s.quantity,
        amount: s.amount,
        po_count: s.count,
      })),
      items: sorted,
    });
  }

  // Sắp xếp summaries theo tổng tiền giảm dần
  summaries.sort((a, b) => b.total_amount - a.total_amount);

  return {
    summaries,
    period: { fromDate, toDate },
    matchedIngredientsCount: targetIngredientIds.length || summaries.length,
  };
}

/**
 * Lấy top nguyên liệu nhập nhiều nhất theo chi phí hoặc số lượng
 */
export async function getTopPurchasedIngredients(params: {
  fromDate?: string;
  toDate?: string;
  limit?: number;
}): Promise<TopPurchasedIngredient[]> {
  const result = await queryIngredientPurchases({
    fromDate: params.fromDate,
    toDate: params.toDate,
  });

  const limit = params.limit ?? 10;
  return result.summaries.slice(0, limit).map((s) => ({
    ingredient_id: s.ingredient_id,
    ingredient_name: s.ingredient_name,
    ingredient_code: s.ingredient_code,
    base_unit: s.base_unit,
    total_quantity: s.total_quantity,
    total_amount: s.total_amount,
    avg_unit_price: s.avg_unit_price,
    po_count: s.po_count,
  }));
}
