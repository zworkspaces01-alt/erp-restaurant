import type { SupabaseClient } from "@supabase/supabase-js";
import type { OrderStatus, PaymentMethod } from "@/types/restaurant";

export interface OrderAuditItemSnapshot {
  menu_item_id: string;
  menu_item_name: string;
  menu_item_code?: string | null;
  quantity: number;
  unit_price: number;
  line_total: number;
  cogs_amount: number;
}

export interface OrderTrashSnapshot {
  id: string;
  order_number: string | null;
  order_date: string;
  status: OrderStatus;
  table_number: string | null;
  subtotal: number;
  discount: number;
  total_amount: number;
  tax_amount: number;
  total_with_tax: number;
  total_cogs: number;
  payment_method: PaymentMethod;
  note: string | null;
  items: OrderAuditItemSnapshot[];
  deleted_at: string;
  deleted_by_name?: string;
  delete_reason?: string;
}

export interface OrderTrashLog {
  id: string;
  order_id: string;
  order_number: string | null;
  action: "deleted" | "restored";
  performed_by?: string | null;
  performed_by_name?: string | null;
  details: {
    summary?: string;
    reason?: string;
    item_count?: number;
    total_amount?: number;
  };
  snapshot?: OrderTrashSnapshot | null;
  is_restored?: boolean;
  created_at: string;
}

const SETTINGS_KEY = "order_trash_logs";

/**
 * Ghi nhận nhật ký khi một hóa đơn bán hàng bị xóa (lưu snapshot phục vụ khôi phục)
 */
export async function logOrderTrash(
  supabase: SupabaseClient,
  entry: Omit<OrderTrashLog, "id" | "created_at">
): Promise<string> {
  const id = `order-trash-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const now = new Date().toISOString();
  const record: OrderTrashLog = {
    ...entry,
    id,
    created_at: now,
    is_restored: entry.is_restored ?? false,
  };

  try {
    const { data } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", SETTINGS_KEY)
      .maybeSingle();

    const currentLogs: OrderTrashLog[] = Array.isArray(data?.value)
      ? (data.value as OrderTrashLog[])
      : [];

    // Giữ tối đa 500 bản ghi
    const updated = [record, ...currentLogs].slice(0, 500);

    await supabase.from("app_settings").upsert({
      key: SETTINGS_KEY,
      value: updated,
      updated_at: now,
    });
  } catch (err) {
    console.warn("Could not save order trash log to app_settings:", err);
  }

  return record.id;
}

/**
 * Lấy danh sách các hóa đơn bán hàng trong Thùng rác
 */
export async function getOrderTrashLogs(
  supabase: SupabaseClient,
  options?: { onlyActive?: boolean }
): Promise<OrderTrashLog[]> {
  try {
    const { data } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", SETTINGS_KEY)
      .maybeSingle();

    let logs: OrderTrashLog[] = Array.isArray(data?.value)
      ? (data.value as OrderTrashLog[])
      : [];

    if (options?.onlyActive) {
      logs = logs.filter((l) => !l.is_restored);
    }

    return logs;
  } catch (err) {
    console.warn("Could not fetch order trash logs:", err);
    return [];
  }
}

/**
 * Đánh dấu bản ghi trong Thùng rác là đã được khôi phục
 */
export async function markOrderRestored(
  supabase: SupabaseClient,
  trashLogId: string
): Promise<boolean> {
  try {
    const { data } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", SETTINGS_KEY)
      .maybeSingle();

    const currentLogs: OrderTrashLog[] = Array.isArray(data?.value)
      ? (data.value as OrderTrashLog[])
      : [];

    const updated = currentLogs.map((l) => {
      if (l.id === trashLogId) {
        return { ...l, is_restored: true };
      }
      return l;
    });

    await supabase.from("app_settings").upsert({
      key: SETTINGS_KEY,
      value: updated,
      updated_at: new Date().toISOString(),
    });

    return true;
  } catch (err) {
    console.warn("Could not mark order as restored:", err);
    return false;
  }
}

/**
 * Xóa vĩnh viễn một bản ghi khỏi Thùng rác
 */
export async function permanentDeleteOrderTrash(
  supabase: SupabaseClient,
  trashLogId: string
): Promise<boolean> {
  try {
    const { data } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", SETTINGS_KEY)
      .maybeSingle();

    const currentLogs: OrderTrashLog[] = Array.isArray(data?.value)
      ? (data.value as OrderTrashLog[])
      : [];

    const updated = currentLogs.filter((l) => l.id !== trashLogId);

    await supabase.from("app_settings").upsert({
      key: SETTINGS_KEY,
      value: updated,
      updated_at: new Date().toISOString(),
    });

    return true;
  } catch (err) {
    console.warn("Could not permanently delete order from trash:", err);
    return false;
  }
}
