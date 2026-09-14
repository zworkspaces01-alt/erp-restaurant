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

export interface MisaOrderToImport {
  invoice_code: string;
  order_date?: string;
  table_number?: string;
  payment_method: "cash" | "bank_transfer";
  discount: number;
  note?: string;
  items: {
    menu_item_id: string;
    quantity: number;
    unit_price?: number;
  }[];
}

export interface MisaImportSummary {
  importedCount: number;
  skippedCount: number;
  totalRevenue: number;
  failedCount: number;
  errors: string[];
}

/** Nhập hàng loạt đơn hàng từ MISA CukCuk qua RPC create_order (trừ kho theo định lượng BOM). */
export async function importMisaOrdersAction(
  ordersToImport: MisaOrderToImport[],
  skipDuplicates = true
): Promise<ActionResult<MisaImportSummary>> {
  if (!ordersToImport || ordersToImport.length === 0) {
    return fail("Không có hóa đơn nào để nhập");
  }

  const supabase = await createClient();

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

    const finalNote = order.note?.trim()
      ? `[MISA: ${order.invoice_code}] ${order.note.trim()}`
      : `[MISA: ${order.invoice_code}]`;

    const { error } = await supabase.rpc("create_order", {
      p_items: order.items.map((it) => ({
        menu_item_id: it.menu_item_id,
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


