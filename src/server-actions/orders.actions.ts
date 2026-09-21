"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { fail, ok, type ActionResult } from "@/types/actions";
import { orderSchema, parseDbError, type OrderInput } from "@/types/restaurant";

function revalidateSales(orderId?: string) {
  revalidatePath("/orders");
  if (orderId) revalidatePath(`/orders/${orderId}`);
  revalidatePath("/inventory");
  revalidatePath("/inventory/transactions");
  revalidatePath("/dashboard");
  revalidatePath("/menu/engineering");
  revalidatePath("/reports/pnl");
}

/** POS: tạo đơn bán qua RPC `create_order` (trừ kho + tính COGS tự động). */
export async function createOrderAction(
  input: OrderInput
): Promise<ActionResult<{ id: string }>> {
  const parsed = orderSchema.safeParse(input);
  if (!parsed.success) {
    return fail("Dữ liệu không hợp lệ", parsed.error.flatten().fieldErrors);
  }
  const values = parsed.data;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_order", {
    p_items: values.items.map((item) => ({
      menu_item_id: item.menu_item_id,
      quantity: item.quantity,
    })),
    p_order_date: values.order_date ?? undefined,
    p_table_number: values.table_number ?? undefined,
    p_discount: values.discount,
    p_payment_method: values.payment_method,
    p_note: values.note ?? undefined,
  });

  if (error) return fail(parseDbError(error));
  if (!data) return fail("Không tạo được đơn hàng. Vui lòng thử lại.");

  revalidateSales(data);
  return ok({ id: data });
}

/** Hủy đơn: RPC `cancel_order` hoàn kho bằng các dòng `sale_reversal`. */
export async function cancelOrderAction(orderId: string): Promise<ActionResult<null>> {
  if (!orderId) return fail("Không tìm thấy đơn hàng.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_order", { p_order_id: orderId });
  if (error) return fail(parseDbError(error));

  revalidateSales(orderId);
  return ok(null);
}

export interface MisaNewMenuItemInput {
  code?: string;
  name: string;
  unit_price?: number;
  unit?: string;
  category?: string;
  item_group?: string;
  tax_percent?: number;
}

export interface MisaOrderToImport {
  invoice_code: string;
  order_date?: string;
  table_number?: string;
  payment_method: "cash" | "bank_transfer";
  discount: number;
  note?: string;
  items: {
    menu_item_id?: string;
    raw_code?: string;
    raw_name?: string;
    quantity: number;
    unit_price?: number;
    unit?: string;
    category?: string;
    item_group?: string;
    tax_percent?: number;
  }[];
}

export interface MisaImportSummary {
  importedCount: number;
  skippedCount: number;
  totalRevenue: number;
  failedCount: number;
  createdMenuItemsCount: number;
  errors: string[];
}

/** Tự động tạo các món mới vào danh mục Thực đơn nếu chưa tồn tại */
export async function autoCreateMissingMenuItemsAction(
  items: MisaNewMenuItemInput[]
): Promise<ActionResult<{
  createdCount: number;
  items: { id: string; code: string | null; name: string; selling_price: number }[];
}>> {
  if (!items || items.length === 0) {
    return ok({ createdCount: 0, items: [] });
  }

  const supabase = await createClient();

  // 1. Lấy toàn bộ món hiện tại trong menu_items
  const { data: existingDbItems, error: fetchErr } = await supabase
    .from("menu_items")
    .select("id, code, name, selling_price");

  if (fetchErr) return fail(parseDbError(fetchErr));

  const existingByCode = new Map<string, { id: string; code: string | null; name: string; selling_price: number }>();
  const existingByName = new Map<string, { id: string; code: string | null; name: string; selling_price: number }>();

  const norm = (s: string) => s.trim().toLowerCase().normalize("NFC").replace(/\s+/g, " ");

  for (const m of existingDbItems ?? []) {
    if (m.code) existingByCode.set(m.code.trim().toLowerCase(), m);
    if (m.name) existingByName.set(norm(m.name), m);
  }

  const allResultItems: { id: string; code: string | null; name: string; selling_price: number }[] = [];
  const toInsert: {
    code: string;
    name: string;
    selling_price: number;
    category: string | null;
    item_group: string | null;
    tax_percent: number;
    is_active: boolean;
    is_combo: boolean;
    description: string;
  }[] = [];

  let newCounter = 1;

  for (const it of items) {
    const rawName = (it.name || "").trim();
    if (!rawName) continue;

    const byName = existingByName.get(norm(rawName));
    if (byName) {
      allResultItems.push(byName);
      continue;
    }

    let codeCandidate = (it.code || "").trim();
    if (codeCandidate) {
      const byCode = existingByCode.get(codeCandidate.toLowerCase());
      if (byCode) {
        // Trùng mã nhưng khác tên -> sinh mã mới tránh vi phạm UNIQUE
        let suffix = 1;
        while (existingByCode.has(`${codeCandidate.toLowerCase()}_${suffix}`)) {
          suffix++;
        }
        codeCandidate = `${codeCandidate}_${suffix}`;
      }
    } else {
      while (existingByCode.has(`misa_${newCounter}`)) {
        newCounter++;
      }
      codeCandidate = `MISA-${String(newCounter).padStart(3, "0")}`;
      newCounter++;
    }

    const price = Math.max(0, it.unit_price || 0);
    const tax = it.tax_percent ?? 0;
    const cat = it.category || "Món ăn";
    const group = it.item_group || (cat.toLowerCase().includes("uống") ? "Đồ uống" : "Món ăn");
    const desc = it.unit ? `ĐVT: ${it.unit} · Tự động thêm từ MISA CukCuk` : "Tự động thêm từ MISA CukCuk";

    toInsert.push({
      code: codeCandidate,
      name: rawName,
      selling_price: price,
      category: cat,
      item_group: group,
      tax_percent: tax,
      is_active: true,
      is_combo: false,
      description: desc,
    });

    existingByCode.set(codeCandidate.toLowerCase(), {
      id: "",
      code: codeCandidate,
      name: rawName,
      selling_price: price,
    });
  }

  let createdCount = 0;
  if (toInsert.length > 0) {
    const { data: inserted, error: insErr } = await supabase
      .from("menu_items")
      .insert(toInsert)
      .select("id, code, name, selling_price");

    if (insErr) {
      return fail(`Lỗi tạo món mới: ${parseDbError(insErr)}`);
    }

    if (inserted) {
      createdCount = inserted.length;
      allResultItems.push(...inserted);
    }

    // Revalidate menu caches
    revalidatePath("/menu");
    revalidatePath("/menu/engineering");
    revalidatePath("/orders/new");
    revalidatePath("/dashboard");
  }

  return ok({ createdCount, items: allResultItems });
}

/** Nhập hàng loạt đơn hàng từ MISA CukCuk qua RPC create_order (trừ kho theo định lượng BOM). */
export async function importMisaOrdersAction(
  ordersToImport: MisaOrderToImport[],
  skipDuplicates = true,
  autoCreateMenuItems = true,
  unmatchedItems?: MisaNewMenuItemInput[]
): Promise<ActionResult<MisaImportSummary>> {
  if (!ordersToImport || ordersToImport.length === 0) {
    return fail("Không có hóa đơn nào để nhập");
  }

  const supabase = await createClient();
  let createdMenuItemsCount = 0;

  // 0. Nếu autoCreateMenuItems = true: tự động tạo món mới vào Thực đơn trước khi import hóa đơn
  if (autoCreateMenuItems) {
    const missingMap = new Map<string, MisaNewMenuItemInput>();

    for (const ord of ordersToImport) {
      for (const it of ord.items) {
        if (!it.menu_item_id && it.raw_name) {
          const key = (it.raw_code || it.raw_name).trim().toLowerCase();
          if (!missingMap.has(key)) {
            missingMap.set(key, {
              code: it.raw_code,
              name: it.raw_name,
              unit_price: it.unit_price,
              unit: it.unit,
              category: it.category,
              item_group: it.item_group,
              tax_percent: it.tax_percent,
            });
          }
        }
      }
    }

    if (unmatchedItems && unmatchedItems.length > 0) {
      for (const u of unmatchedItems) {
        const key = (u.code || u.name).trim().toLowerCase();
        if (!missingMap.has(key)) {
          missingMap.set(key, u);
        }
      }
    }

    if (missingMap.size > 0) {
      const createRes = await autoCreateMissingMenuItemsAction(Array.from(missingMap.values()));
      if (!createRes.success) {
        return fail(createRes.error);
      }
      createdMenuItemsCount = createRes.data.createdCount;

      // Tra cứu và gán menu_item_id lại cho các order items
      const lookupByCode = new Map<string, string>();
      const lookupByName = new Map<string, string>();
      const norm = (s: string) => s.trim().toLowerCase().normalize("NFC").replace(/\s+/g, " ");

      for (const it of createRes.data.items) {
        if (it.code) lookupByCode.set(it.code.toLowerCase(), it.id);
        if (it.name) lookupByName.set(norm(it.name), it.id);
      }

      for (const ord of ordersToImport) {
        for (const it of ord.items) {
          if (!it.menu_item_id) {
            const byCodeId = it.raw_code ? lookupByCode.get(it.raw_code.toLowerCase()) : undefined;
            const byNameId = it.raw_name ? lookupByName.get(norm(it.raw_name)) : undefined;
            it.menu_item_id = byCodeId || byNameId;
          }
        }
      }
    }
  }

  // 1. Lấy danh sách mã hóa đơn MISA đã từng import
  const { data: existingRows } = await supabase
    .from("orders")
    .select("note")
    .ilike("note", "%[MISA:%");

  const existingCodes = new Set<string>();
  const regex = /\[MISA:\s*([^\]]+)\]/i;
  for (const row of existingRows ?? []) {
    if (row.note) {
      const match = regex.exec(row.note);
      if (match && match[1]) {
        existingCodes.add(match[1].trim().toLowerCase());
      }
    }
  }

  const summary: MisaImportSummary = {
    importedCount: 0,
    skippedCount: 0,
    totalRevenue: 0,
    failedCount: 0,
    createdMenuItemsCount,
    errors: [],
  };

  // 2. Thực hiện tuần tự tạo từng đơn hàng qua RPC
  for (const order of ordersToImport) {
    const codeKey = order.invoice_code.trim().toLowerCase();
    if (existingCodes.has(codeKey)) {
      if (skipDuplicates) {
        summary.skippedCount++;
        continue;
      }
      summary.failedCount++;
      summary.errors.push(`Hóa đơn "${order.invoice_code}" đã tồn tại trên hệ thống.`);
      continue;
    }

    // Kiểm tra xem tất cả items đã có menu_item_id chưa
    const missingItems = order.items.filter((it) => !it.menu_item_id);
    if (missingItems.length > 0) {
      summary.failedCount++;
      const names = missingItems.map((m) => m.raw_name || m.raw_code || "không tên").join(", ");
      summary.errors.push(`Hóa đơn "${order.invoice_code}": chưa tìm thấy mã món trong Thực đơn ERP (${names})`);
      continue;
    }

    const finalNote = order.note?.trim()
      ? `[MISA: ${order.invoice_code}] ${order.note.trim()}`
      : `[MISA: ${order.invoice_code}]`;

    const { error } = await supabase.rpc("create_order", {
      p_items: order.items.map((it) => ({
        menu_item_id: it.menu_item_id!,
        quantity: it.quantity,
      })),
      p_order_date: order.order_date ?? undefined,
      p_table_number: order.table_number ?? undefined,
      p_discount: order.discount,
      p_payment_method: order.payment_method,
      p_note: finalNote,
    });

    if (error) {
      summary.failedCount++;
      summary.errors.push(`Hóa đơn "${order.invoice_code}": ${parseDbError(error)}`);
    } else {
      summary.importedCount++;
      // Đánh dấu mã đã import để tránh trùng lặp ngay trong cùng 1 file
      existingCodes.add(codeKey);

      // Cộng dồn doanh thu thực thu
      const subtotal = order.items.reduce(
        (sum, it) => sum + (it.unit_price ?? 0) * it.quantity,
        0
      );
      summary.totalRevenue += Math.max(0, subtotal - order.discount);
    }
  }

  revalidateSales();
  return ok(summary);
}

/** Lấy dữ liệu danh mục món và danh sách hóa đơn MISA đã có để đối chiếu trước khi import. */
export async function getMisaImportMetadata(): Promise<
  ActionResult<{
    menuItems: import("@/lib/queries/orders.queries").PosMenuItem[];
    existingMisaCodes: string[];
  }>
> {
  try {
    const { getPosMenuItems, getExistingMisaOrderCodes } = await import(
      "@/lib/queries/orders.queries"
    );
    const [menuItems, existingMisaCodes] = await Promise.all([
      getPosMenuItems(),
      getExistingMisaOrderCodes(),
    ]);
    return ok({ menuItems, existingMisaCodes });
  } catch (err) {
    return fail(err instanceof Error ? err.message : "Không tải được danh mục món.");
  }
}


