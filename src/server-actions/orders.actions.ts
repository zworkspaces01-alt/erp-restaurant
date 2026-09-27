"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { fail, ok, type ActionResult } from "@/types/actions";
import { orderSchema, parseDbError, type OrderInput } from "@/types/restaurant";

import { getCurrentUserWithRole, requireAuth } from "@/lib/auth";
import { extractOrderTax } from "@/lib/queries/orders.queries";
import {
  logOrderTrash,
  getOrderTrashLogs,
  markOrderRestored,
  permanentDeleteOrderTrash,
  type OrderTrashLog,
  type OrderTrashSnapshot,
} from "@/lib/orders/order-trash-service";

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

/**
 * Khôi phục hóa đơn đã hủy:
 * Tái tạo lại đơn hàng qua create_order RPC, tự động trừ lại kho nguyên liệu theo định lượng món,
 * giữ nguyên toàn bộ thông tin mã đơn, ngày giờ, số bàn, giá trị hóa đơn.
 */
export async function restoreCancelledOrderAction(
  orderId: string
): Promise<ActionResult<{ id: string; orderNumber: string }>> {
  if (!orderId) return fail("Không tìm thấy đơn hàng.");

  const supabase = await createClient();

  // 1. Lấy thông tin đơn hàng hiện tại
  const { data: order, error: orderErr } = await supabase
    .from("orders")
    .select("*")
    .eq("id", orderId)
    .maybeSingle();

  if (orderErr) return fail(parseDbError(orderErr));
  if (!order) return fail("Không tìm thấy đơn hàng cần khôi phục.");
  if (order.status !== "cancelled") {
    return fail("Chỉ có thể khôi phục đơn hàng đang ở trạng thái 'Đã hủy'.");
  }

  // 2. Lấy danh sách các món trong đơn
  const { data: items, error: itemsErr } = await supabase
    .from("order_items")
    .select("menu_item_id, quantity, unit_price, menu_item_name")
    .eq("order_id", orderId);

  if (itemsErr) return fail(parseDbError(itemsErr));
  if (!items || items.length === 0) {
    return fail("Đơn hàng không có món nào để khôi phục.");
  }

  const originalOrderNumber = order.order_number || "";

  // 3. Đổi mã đơn cũ sang mã tạm để nhả UNIQUE constraint cho mã gốc
  const retiredOldNumber = `${originalOrderNumber}-RESTORED-OLD-${Date.now()}`;
  const retiredNote = order.note
    ? `${order.note} [RESTORED: Đã khôi phục thành đơn mới]`
    : `[RESTORED: Đã khôi phục thành đơn mới]`;

  const { error: retireErr } = await supabase
    .from("orders")
    .update({
      order_number: retiredOldNumber,
      note: retiredNote,
    })
    .eq("id", orderId);

  if (retireErr) {
    return fail(`Không thể cập nhật đơn cũ: ${parseDbError(retireErr)}`);
  }

  // 4. Tái tạo đơn qua RPC create_order (DB sẽ tự trừ lại kho và tính COGS)
  const { data: newOrderId, error: createErr } = await supabase.rpc("create_order", {
    p_items: items.map((it) => ({
      menu_item_id: it.menu_item_id,
      quantity: Number(it.quantity),
    })),
    p_order_date: order.order_date ?? undefined,
    p_table_number: order.table_number ?? undefined,
    p_discount: Number(order.discount ?? 0),
    p_payment_method: order.payment_method,
    p_note: order.note ?? undefined,
  });

  if (createErr || !newOrderId) {
    // Rollback lại mã đơn cũ nếu tạo mới thất bại
    await supabase
      .from("orders")
      .update({
        order_number: originalOrderNumber,
        note: order.note,
      })
      .eq("id", orderId);
    return fail(`Không thể tạo lại đơn hàng: ${parseDbError(createErr)}`);
  }

  // 5. Cập nhật mã đơn của đơn mới thành chính xác mã ban đầu
  const { error: numErr } = await supabase
    .from("orders")
    .update({ order_number: originalOrderNumber })
    .eq("id", newOrderId);

  if (numErr) {
    console.warn("Could not set original order_number on restored order:", numErr);
  }

  revalidateSales(orderId);
  revalidateSales(newOrderId);

  return ok({ id: newOrderId, orderNumber: originalOrderNumber });
}

/**
 * Xóa hóa đơn bán hàng:
 * - Nếu đơn đang hoàn tất: tự động hoàn trả kho trước (qua RPC cancel_order)
 * - Lưu snapshot chi tiết vào Thùng rác (app_settings) phục vụ đối soát & khôi phục
 * - Đánh dấu xóa khỏi hệ thống để không còn hiển thị trên danh sách và báo cáo
 */
export async function deleteOrderAction(
  orderId: string,
  reason?: string
): Promise<ActionResult<{ id: string }>> {
  if (!orderId) return fail("Không tìm thấy đơn hàng.");

  const { authorized } = await requireAuth(["owner", "manager", "staff"]);
  if (!authorized) {
    return fail("Bạn không có quyền thực hiện thao tác xóa hóa đơn.");
  }

  const supabase = await createClient();

  // 1. Lấy thông tin đơn hàng
  const { data: order, error: orderErr } = await supabase
    .from("orders")
    .select("*")
    .eq("id", orderId)
    .maybeSingle();

  if (orderErr) return fail(parseDbError(orderErr));
  if (!order) return fail("Không tìm thấy hóa đơn cần xóa.");

  // 2. Lấy danh sách các dòng món trong đơn
  const { data: items } = await supabase
    .from("order_items")
    .select("*, menu_items(code)")
    .eq("order_id", orderId);

  // 3. Nếu đơn đang ở trạng thái 'completed': hoàn kho trước để tránh thất thoát/lệch kho
  if (order.status === "completed") {
    const { error: cancelErr } = await supabase.rpc("cancel_order", { p_order_id: orderId });
    if (cancelErr) {
      return fail(`Không thể hoàn kho trước khi xóa đơn: ${parseDbError(cancelErr)}`);
    }
  }

  // 4. Tạo snapshot lưu vào Thùng rác
  const userSession = await getCurrentUserWithRole().catch(() => null);
  const { tax_amount, total_with_tax } = extractOrderTax(
    order.note,
    Number(order.total_amount ?? 0)
  );

  const snapshot: OrderTrashSnapshot = {
    id: order.id,
    order_number: order.order_number,
    order_date: order.order_date,
    status: order.status,
    table_number: order.table_number,
    subtotal: Number(order.subtotal ?? 0),
    discount: Number(order.discount ?? 0),
    total_amount: Number(order.total_amount ?? 0),
    tax_amount,
    total_with_tax,
    total_cogs: Number(order.total_cogs ?? 0),
    payment_method: order.payment_method,
    note: order.note,
    items: (items ?? []).map((it) => ({
      menu_item_id: it.menu_item_id,
      menu_item_name: it.menu_item_name,
      menu_item_code: (it.menu_items as { code?: string } | null)?.code || null,
      quantity: Number(it.quantity),
      unit_price: Number(it.unit_price),
      line_total: Number(it.line_total),
      cogs_amount: Number(it.cogs_amount),
    })),
    deleted_at: new Date().toISOString(),
    deleted_by_name: userSession?.profile.full_name || userSession?.user.email || "Nhân viên",
    delete_reason: reason || "Người dùng xóa hóa đơn",
  };

  await logOrderTrash(supabase, {
    order_id: order.id,
    order_number: order.order_number,
    action: "deleted",
    performed_by: userSession?.user.id,
    performed_by_name: userSession?.profile.full_name || userSession?.user.email || "Nhân viên",
    details: {
      summary: `Đã xóa hóa đơn ${order.order_number}. Tổng tiền: ${order.total_amount}đ.`,
      reason: reason || "Người dùng xóa hóa đơn",
      item_count: items?.length ?? 0,
      total_amount: Number(order.total_amount ?? 0),
    },
    snapshot,
    is_restored: false,
  });

  // 5. Đánh dấu xóa trong DB để nhả mã đơn gốc và loại khỏi danh sách hiển thị
  const retiredOrderNumber = `${order.order_number}-DELETED-${Date.now()}`;
  const deletedNote = order.note
    ? `${order.note} [DELETED: ${reason || "Người dùng xóa"}]`
    : `[DELETED: ${reason || "Người dùng xóa"}]`;

  const { error: updateErr } = await supabase
    .from("orders")
    .update({
      order_number: retiredOrderNumber,
      note: deletedNote,
    })
    .eq("id", orderId);

  if (updateErr) {
    return fail(`Không thể đánh dấu xóa đơn: ${parseDbError(updateErr)}`);
  }

  revalidateSales(orderId);
  return ok({ id: orderId });
}

/**
 * Khôi phục hóa đơn bán hàng từ Thùng rác
 */
export async function restoreDeletedOrderAction(
  trashLogId: string
): Promise<ActionResult<{ id: string; orderNumber: string }>> {
  const { authorized } = await requireAuth(["owner", "manager", "staff"]);
  if (!authorized) {
    return fail("Bạn không có quyền khôi phục hóa đơn đã xóa.");
  }

  const supabase = await createClient();
  const logs = await getOrderTrashLogs(supabase);
  const found = logs.find((l) => l.id === trashLogId);

  if (!found || !found.snapshot) {
    return fail("Không tìm thấy thông tin bản sao lưu hóa đơn trong Thùng rác.");
  }

  if (found.is_restored) {
    return fail("Hóa đơn này đã được khôi phục trước đó.");
  }

  const snapshot = found.snapshot;

  // Tái tạo đơn qua RPC create_order (DB sẽ trừ lại kho tự động)
  const restoreNote = snapshot.note
    ? `${snapshot.note} [Khôi phục từ thùng rác lúc ${new Date().toLocaleTimeString("vi-VN")}]`
    : `[Khôi phục từ thùng rác lúc ${new Date().toLocaleTimeString("vi-VN")}]`;

  const { data: newOrderId, error: createErr } = await supabase.rpc("create_order", {
    p_items: snapshot.items.map((it) => ({
      menu_item_id: it.menu_item_id,
      quantity: Number(it.quantity),
    })),
    p_order_date: snapshot.order_date,
    p_table_number: snapshot.table_number ?? undefined,
    p_discount: Number(snapshot.discount ?? 0),
    p_payment_method: snapshot.payment_method,
    p_note: restoreNote,
  });

  if (createErr || !newOrderId) {
    return fail(`Không thể khôi phục hóa đơn: ${parseDbError(createErr)}`);
  }

  // Cập nhật lại mã hóa đơn gốc
  await supabase
    .from("orders")
    .update({ order_number: snapshot.order_number })
    .eq("id", newOrderId);

  // Đánh dấu bản ghi trong Thùng rác là đã khôi phục
  await markOrderRestored(supabase, trashLogId);

  revalidateSales(newOrderId);
  return ok({ id: newOrderId, orderNumber: snapshot.order_number || "" });
}

/** Lấy danh sách hóa đơn trong Thùng rác */
export async function getOrderTrashLogsAction(): Promise<OrderTrashLog[]> {
  const supabase = await createClient();
  return getOrderTrashLogs(supabase);
}

/** Xóa vĩnh viễn hóa đơn khỏi Thùng rác */
export async function permanentDeleteOrderTrashAction(
  trashLogId: string
): Promise<ActionResult<null>> {
  const { authorized } = await requireAuth(["owner", "manager"]);
  if (!authorized) {
    return fail("Chỉ Quản lý hoặc Chủ nhà hàng mới có quyền xóa vĩnh viễn.");
  }

  const supabase = await createClient();
  const okResult = await permanentDeleteOrderTrash(supabase, trashLogId);
  if (!okResult) {
    return fail("Không thể xóa bản ghi khỏi Thùng rác.");
  }

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


