import type { SupabaseClient } from "@supabase/supabase-js";

export type PoAuditAction =
  | "created"
  | "updated"
  | "line_added"
  | "line_deleted"
  | "deleted"
  | "restored";

export interface PoAuditItemSnapshot {
  ingredient_id: string;
  ingredient_name: string;
  quantity: number;
  unit: string;
  conversion_factor?: number;
  unit_price: number;
  line_total: number;
}

export interface PoAuditSnapshot {
  id: string;
  po_number: string;
  supplier_id: string;
  supplier_name: string;
  order_date: string;
  due_date: string | null;
  total_amount: number;
  invoice_number: string | null;
  invoice_image_url: string | null;
  note: string | null;
  items: PoAuditItemSnapshot[];
  deleted_at: string;
  deleted_by_name?: string;
  delete_reason?: string;
}

export interface PurchaseOrderAuditLog {
  id: string;
  purchase_order_id?: string | null;
  po_number: string;
  supplier_id?: string | null;
  supplier_name?: string | null;
  action: PoAuditAction;
  performed_by?: string | null;
  performed_by_name?: string | null;
  details: {
    summary?: string;
    reason?: string;
    changes?: Record<string, { from: unknown; to: unknown }>;
    item?: {
      name: string;
      quantity: number;
      unit: string;
      unit_price: number;
      line_total: number;
    };
  };
  snapshot?: PoAuditSnapshot | null;
  is_restored?: boolean;
  created_at: string;
}

const SETTINGS_KEY = "po_audit_logs";

/**
 * Ghi nhận một hành vi thao tác trên phiếu nhập (tạo, sửa, thêm/xóa dòng, xóa, khôi phục)
 */
export async function logPoAction(
  supabase: SupabaseClient,
  entry: Omit<PurchaseOrderAuditLog, "id" | "created_at">
): Promise<string> {
  const id = `audit-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const now = new Date().toISOString();
  const record: PurchaseOrderAuditLog = {
    ...entry,
    id,
    created_at: now,
    is_restored: entry.is_restored ?? false,
  };

  // 1. Thử ghi vào bảng SQL purchase_order_audit_logs nếu có
  try {
    const { error } = await supabase
      .from("purchase_order_audit_logs")
      .insert({
        id: record.id.startsWith("audit-") ? undefined : record.id,
        purchase_order_id: record.purchase_order_id || null,
        po_number: record.po_number,
        supplier_id: record.supplier_id || null,
        supplier_name: record.supplier_name || null,
        action: record.action,
        performed_by: record.performed_by || null,
        performed_by_name: record.performed_by_name || null,
        details: record.details,
        snapshot: record.snapshot || null,
        is_restored: record.is_restored,
      });

    if (!error) {
      return record.id;
    }
  } catch {
    // Fallback sang app_settings bên dưới
  }

  // 2. Fallback sang app_settings
  try {
    const { data } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", SETTINGS_KEY)
      .maybeSingle();

    const currentLogs: PurchaseOrderAuditLog[] = Array.isArray(data?.value)
      ? (data.value as PurchaseOrderAuditLog[])
      : [];

    // Giữ tối đa 500 logs gần nhất để tránh phình to
    const updated = [record, ...currentLogs].slice(0, 500);

    await supabase
      .from("app_settings")
      .upsert({
        key: SETTINGS_KEY,
        value: updated,
        updated_at: now,
      });
  } catch (fallbackErr) {
    console.warn("Could not save audit log to app_settings:", fallbackErr);
  }

  return record.id;
}

/**
 * Lấy danh sách nhật ký kiểm toán (toàn bộ hoặc lọc theo purchase_order_id / po_number)
 */
export async function getPoAuditLogs(
  supabase: SupabaseClient,
  options?: {
    poId?: string;
    poNumber?: string;
    action?: PoAuditAction;
    limit?: number;
  }
): Promise<PurchaseOrderAuditLog[]> {
  const limit = options?.limit ?? 100;

  // 1. Thử lấy từ bảng SQL
  try {
    let query = supabase
      .from("purchase_order_audit_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (options?.poId) {
      query = query.eq("purchase_order_id", options.poId);
    }
    if (options?.poNumber) {
      query = query.eq("po_number", options.poNumber);
    }
    if (options?.action) {
      query = query.eq("action", options.action);
    }

    const { data, error } = await query;
    if (!error && data) {
      return data as PurchaseOrderAuditLog[];
    }
  } catch {
    // Fallback
  }

  // 2. Lấy từ app_settings
  try {
    const { data } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", SETTINGS_KEY)
      .maybeSingle();

    if (data?.value && Array.isArray(data.value)) {
      let logs = data.value as PurchaseOrderAuditLog[];
      if (options?.poId) {
        logs = logs.filter((l) => l.purchase_order_id === options.poId);
      }
      if (options?.poNumber) {
        logs = logs.filter((l) => l.po_number === options.poNumber);
      }
      if (options?.action) {
        logs = logs.filter((l) => l.action === options.action);
      }
      return logs.slice(0, limit);
    }
  } catch (err) {
    console.warn("Could not load audit logs from app_settings:", err);
  }

  return [];
}

/**
 * Lấy danh sách các phiếu nhập đã bị xóa (chưa khôi phục) trong Thùng rác
 */
export async function getDeletedPoSnapshots(
  supabase: SupabaseClient
): Promise<PurchaseOrderAuditLog[]> {
  // 1. Thử từ bảng SQL
  try {
    const { data, error } = await supabase
      .from("purchase_order_audit_logs")
      .select("*")
      .eq("action", "deleted")
      .eq("is_restored", false)
      .order("created_at", { ascending: false });

    if (!error && data) {
      return data as PurchaseOrderAuditLog[];
    }
  } catch {
    // Fallback
  }

  // 2. Thử từ app_settings
  try {
    const { data } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", SETTINGS_KEY)
      .maybeSingle();

    if (data?.value && Array.isArray(data.value)) {
      const logs = data.value as PurchaseOrderAuditLog[];
      return logs.filter((l) => l.action === "deleted" && !l.is_restored);
    }
  } catch {
    // Ignore
  }

  return [];
}

/**
 * Đánh dấu phiếu nhập đã xóa là đã được khôi phục
 */
export async function markPoRestored(
  supabase: SupabaseClient,
  auditLogId: string
): Promise<boolean> {
  // 1. Cập nhật bảng SQL
  try {
    const { error } = await supabase
      .from("purchase_order_audit_logs")
      .update({ is_restored: true })
      .eq("id", auditLogId);

    if (!error) return true;
  } catch {
    // Fallback
  }

  // 2. Cập nhật app_settings
  try {
    const { data } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", SETTINGS_KEY)
      .maybeSingle();

    if (data?.value && Array.isArray(data.value)) {
      const logs = data.value as PurchaseOrderAuditLog[];
      const updated = logs.map((l) => (l.id === auditLogId ? { ...l, is_restored: true } : l));
      await supabase
        .from("app_settings")
        .upsert({
          key: SETTINGS_KEY,
          value: updated,
          updated_at: new Date().toISOString(),
        });
      return true;
    }
  } catch {
    // Ignore
  }

  return false;
}
