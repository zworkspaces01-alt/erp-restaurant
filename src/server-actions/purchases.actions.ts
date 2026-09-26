"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAuth, getCurrentUserWithRole } from "@/lib/auth";
import { normalizeVietnamese } from "@/lib/ai/invoice-matcher";
import {
  logPoAction,
  getPoAuditLogs,
  getDeletedPoSnapshots,
  markPoRestored,
  type PoAuditSnapshot,
  type PurchaseOrderAuditLog,
} from "@/lib/purchases/po-audit-service";
import type { Json } from "@/types/database";
import { fail, failZod, ok, type ActionResult } from "@/types/actions";
import {
  parseDbError,
  purchaseOrderSchema,
  supplierSchema,
  type CreatePurchaseOrderItemPayload,
  type FunctionArgs,
  purchaseOrderLineSchema,
  purchaseOrderMetaSchema,
  type PurchaseOrderInput,
  type PurchaseOrderLineInput,
  type PurchaseOrderMetaInput,
  type SupplierInput,
} from "@/types/restaurant";

function revalidateSupplierScope(id?: string) {
  revalidatePath("/suppliers");
  if (id) revalidatePath(`/suppliers/${id}`);
  revalidatePath("/dashboard");
}

/**
 * Nhập hàng làm thay đổi `ingredients.avg_cost_price` (bình quân gia quyền, DATABASE.md §4.1),
 * vốn là đầu vào của `v_recipe_costs` / `v_menu_item_costs` / `v_menu_engineering`
 * → phải revalidate cả nhánh thực đơn.
 */
function revalidatePurchaseScope(
  supplierId?: string,
  poId?: string,
  ingredientIds: (string | null | undefined)[] = []
) {
  revalidatePath("/purchases");
  if (poId) revalidatePath(`/purchases/${poId}`);
  revalidatePath("/payments");
  revalidatePath("/inventory");
  revalidatePath("/inventory/transactions");
  for (const ingredientId of new Set(ingredientIds.filter((v): v is string => Boolean(v)))) {
    revalidatePath(`/inventory/${ingredientId}`);
  }
  revalidatePath("/menu");
  revalidatePath("/menu/[id]", "page");
  revalidatePath("/menu/engineering");
  revalidateSupplierScope(supplierId);
}

// ============================================================================
// Nhà cung cấp
// ============================================================================

export async function createSupplier(
  input: SupplierInput
): Promise<ActionResult<{ id: string }>> {
  const parsed = supplierSchema.safeParse(input);
  if (!parsed.success) {
    return failZod(parsed.error);
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("suppliers")
    .insert({
      code: parsed.data.code ?? null,
      name: parsed.data.name,
      contact_name: parsed.data.contact_name ?? null,
      phone: parsed.data.phone ?? null,
      email: parsed.data.email ?? null,
      address: parsed.data.address ?? null,
      tax_code: parsed.data.tax_code ?? null,
      payment_terms_days: parsed.data.payment_terms_days,
      is_active: parsed.data.is_active,
      note: parsed.data.note ?? null,
    })
    .select("id")
    .single();

  if (error || !data) {
    return fail(parseDbError(error));
  }

  revalidateSupplierScope(data.id);
  return ok({ id: data.id });
}

export async function updateSupplier(
  id: string,
  input: SupplierInput
): Promise<ActionResult<{ id: string }>> {
  const parsed = supplierSchema.safeParse(input);
  if (!parsed.success) {
    return failZod(parsed.error);
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("suppliers")
    .update({
      code: parsed.data.code ?? null,
      name: parsed.data.name,
      contact_name: parsed.data.contact_name ?? null,
      phone: parsed.data.phone ?? null,
      email: parsed.data.email ?? null,
      address: parsed.data.address ?? null,
      tax_code: parsed.data.tax_code ?? null,
      payment_terms_days: parsed.data.payment_terms_days,
      is_active: parsed.data.is_active,
      note: parsed.data.note ?? null,
    })
    .eq("id", id);

  if (error) return fail(parseDbError(error));

  revalidateSupplierScope(id);
  revalidatePath("/purchases");
  return ok({ id });
}

export async function deleteSupplier(id: string): Promise<ActionResult<{ id: string }>> {
  const { authorized } = await requireAuth(["owner", "manager"]);
  if (!authorized) {
    return fail("Bạn không có quyền xóa nhà cung cấp.");
  }

  const supabase = await createClient();

  // Kiểm tra xem NCC có phiếu nhập nào không
  const { count: poCount } = await supabase
    .from("purchase_orders")
    .select("*", { count: "exact", head: true })
    .eq("supplier_id", id);

  // Kiểm tra xem NCC có phiếu chi nào không
  const { count: payCount } = await supabase
    .from("supplier_payments")
    .select("*", { count: "exact", head: true })
    .eq("supplier_id", id);

  if ((poCount ?? 0) > 0 || (payCount ?? 0) > 0) {
    return fail(
      `Nhà cung cấp này đã có ${poCount ?? 0} phiếu nhập và ${payCount ?? 0} phiếu thanh toán. Để bảo toàn sổ sách tài chính, bạn không thể xóa vĩnh viễn. Vui lòng chọn "Ngừng hợp tác" (vô hiệu hóa) hoặc dùng chức năng "Gộp NCC" để chuyển chứng từ sang NCC khác.`
    );
  }

  // Tháo gỡ liên kết default_supplier_id trên bảng ingredients nếu có
  await supabase
    .from("ingredients")
    .update({ default_supplier_id: null })
    .eq("default_supplier_id", id);

  // Xóa vĩnh viễn
  const { error } = await supabase.from("suppliers").delete().eq("id", id);
  if (error) {
    return fail(parseDbError(error));
  }

  revalidateSupplierScope(id);
  return ok({ id });
}

export async function deactivateSupplier(id: string): Promise<ActionResult<{ id: string }>> {
  const { authorized } = await requireAuth(["owner", "manager"]);
  if (!authorized) {
    return fail("Bạn không có quyền cập nhật trạng thái nhà cung cấp.");
  }

  const supabase = await createClient();
  const { error } = await supabase.from("suppliers").update({ is_active: false }).eq("id", id);
  if (error) {
    return fail(parseDbError(error));
  }

  revalidateSupplierScope(id);
  return ok({ id });
}

export interface MergeSuppliersInput {
  sourceSupplierId: string;
  targetSupplierId: string;
  deleteSource?: boolean;
}

export async function mergeSuppliers(
  input: MergeSuppliersInput
): Promise<ActionResult<{ success: boolean; targetId: string }>> {
  const { authorized } = await requireAuth(["owner", "manager"]);
  if (!authorized) {
    return fail("Bạn không có quyền thực hiện gộp nhà cung cấp.");
  }

  const { sourceSupplierId, targetSupplierId, deleteSource = true } = input;
  if (!sourceSupplierId || !targetSupplierId) {
    return fail("Vui lòng chọn đầy đủ Nhà cung cấp nguồn và Nhà cung cấp đích.");
  }

  if (sourceSupplierId === targetSupplierId) {
    return fail("Nhà cung cấp nguồn và Nhà cung cấp đích không được trùng nhau.");
  }

  const supabase = await createClient();

  // Lấy thông tin cả 2 NCC
  const [sourceRes, targetRes] = await Promise.all([
    supabase.from("suppliers").select("*").eq("id", sourceSupplierId).single(),
    supabase.from("suppliers").select("*").eq("id", targetSupplierId).single(),
  ]);

  if (!sourceRes.data) return fail("Không tìm thấy thông tin Nhà cung cấp cần gộp.");
  if (!targetRes.data) return fail("Không tìm thấy thông tin Nhà cung cấp giữ lại.");

  const source = sourceRes.data;
  const target = targetRes.data;

  // Kiểm tra xem source có phiếu nhập đã thanh toán (paid_amount > 0) hay có phiếu chi thanh toán không
  const { count: payCount } = await supabase
    .from("supplier_payments")
    .select("*", { count: "exact", head: true })
    .eq("supplier_id", sourceSupplierId);

  const { data: paidPos } = await supabase
    .from("purchase_orders")
    .select("id, po_number, paid_amount")
    .eq("supplier_id", sourceSupplierId)
    .gt("paid_amount", 0)
    .limit(1);

  if ((payCount ?? 0) > 0 || (paidPos && paidPos.length > 0)) {
    return fail(
      `Nhà cung cấp "${source.name}" đã có phiếu chi hoặc phiếu nhập đã thanh toán. Để bảo toàn số sách tài chính, vui lòng chọn "${source.name}" làm "NCC giữ lại (NCC Đích)" và gộp nhà cung cấp kia vào.`
    );
  }

  // 1. Chuyển toàn bộ phiếu nhập sang target
  const { error: poErr } = await supabase
    .from("purchase_orders")
    .update({ supplier_id: targetSupplierId })
    .eq("supplier_id", sourceSupplierId);

  if (poErr) {
    return fail(`Lỗi khi chuyển phiếu nhập: ${poErr.message}`);
  }

  // 2. Chuyển nguyên liệu mặc định sang target
  await supabase
    .from("ingredients")
    .update({ default_supplier_id: targetSupplierId })
    .eq("default_supplier_id", sourceSupplierId);

  const updates: {
    tax_code?: string;
    phone?: string;
    email?: string;
    contact_name?: string;
    address?: string;
    note?: string;
  } = {};
  if (!target.tax_code && source.tax_code) updates.tax_code = source.tax_code;
  if (!target.phone && source.phone) updates.phone = source.phone;
  if (!target.email && source.email) updates.email = source.email;
  if (!target.contact_name && source.contact_name) updates.contact_name = source.contact_name;
  if (!target.address && source.address) updates.address = source.address;
  if (source.note) {
    updates.note = target.note
      ? `${target.note}\n[Đã gộp từ ${source.name}]: ${source.note}`
      : `[Đã gộp từ ${source.name}]: ${source.note}`;
  }

  if (Object.keys(updates).length > 0) {
    await supabase.from("suppliers").update(updates).eq("id", targetSupplierId);
  }

  // 4. Xóa hoặc vô hiệu hóa source
  if (deleteSource) {
    const { error: delErr } = await supabase.from("suppliers").delete().eq("id", sourceSupplierId);
    if (delErr) {
      console.warn("Could not delete source supplier, deactivating instead:", delErr);
      await supabase
        .from("suppliers")
        .update({ is_active: false, note: `[Đã gộp vào ${target.name}]` })
        .eq("id", sourceSupplierId);
    }
  } else {
    await supabase
      .from("suppliers")
      .update({ is_active: false, note: `[Đã gộp vào ${target.name}]` })
      .eq("id", sourceSupplierId);
  }

  revalidateSupplierScope(sourceSupplierId);
  revalidateSupplierScope(targetSupplierId);
  revalidatePath("/purchases");
  revalidatePath("/inventory");
  revalidatePath("/dashboard");

  return ok({ success: true, targetId: targetSupplierId });
}

export interface DuplicateSupplierPair {
  idA: string;
  nameA: string;
  codeA: string | null;
  debtA: number;
  poCountA: number;
  idB: string;
  nameB: string;
  codeB: string | null;
  debtB: number;
  poCountB: number;
  reason: string;
}

function cleanLegal(str: string): string {
  return normalizeVietnamese(str)
    .replace(/\b(cong ty|tnhh|cp|co phan|thuong mai|thuc pham|mtv|tm tp|tm|tp|dich vu|san xuat|viet nam|asia|co ltd|ltd)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export async function getDuplicateSupplierCandidates(): Promise<DuplicateSupplierPair[]> {
  const supabase = await createClient();
  const { data: sups } = await supabase
    .from("suppliers")
    .select("id, name, code, phone, tax_code, current_debt, is_active")
    .order("name", { ascending: true });

  if (!sups || sups.length < 2) return [];

  // Lấy số lượng PO của từng supplier
  const { data: poCounts } = await supabase.from("purchase_orders").select("supplier_id");

  const poCountMap = new Map<string, number>();
  for (const po of poCounts || []) {
    poCountMap.set(po.supplier_id, (poCountMap.get(po.supplier_id) || 0) + 1);
  }

  const duplicates: DuplicateSupplierPair[] = [];

  for (let i = 0; i < sups.length; i++) {
    for (let j = i + 1; j < sups.length; j++) {
      const a = sups[i];
      const b = sups[j];

      const normA = normalizeVietnamese(a.name);
      const normB = normalizeVietnamese(b.name);
      const coreA = cleanLegal(a.name);
      const coreB = cleanLegal(b.name);

      let isDup = false;
      let reason = "";

      if (a.tax_code && b.tax_code && a.tax_code.trim() === b.tax_code.trim()) {
        isDup = true;
        reason = `Trùng mã số thuế: ${a.tax_code}`;
      } else if (normA === normB) {
        isDup = true;
        reason = "Tên hoàn toàn giống nhau (khác dấu hoặc hoa thường)";
      } else if (
        coreA &&
        coreB &&
        (coreA === coreB ||
          (coreA.length > 3 && coreB.includes(coreA)) ||
          (coreB.length > 3 && coreA.includes(coreB)))
      ) {
        isDup = true;
        reason = `Tên tương tự: "${coreA}" & "${coreB}"`;
      }

      if (isDup) {
        duplicates.push({
          idA: a.id,
          nameA: a.name,
          codeA: a.code,
          debtA: Number(a.current_debt) || 0,
          poCountA: poCountMap.get(a.id) || 0,
          idB: b.id,
          nameB: b.name,
          codeB: b.code,
          debtB: Number(b.current_debt) || 0,
          poCountB: poCountMap.get(b.id) || 0,
          reason,
        });
      }
    }
  }

  return duplicates;
}

// ============================================================================
// Phiếu nhập
// ============================================================================

export async function createPurchaseOrder(
  input: PurchaseOrderInput
): Promise<ActionResult<{ id: string }>> {
  const parsed = purchaseOrderSchema.safeParse(input);
  if (!parsed.success) {
    return failZod(parsed.error);
  }

  const items: CreatePurchaseOrderItemPayload[] = parsed.data.items.map((it) => ({
    ingredient_id: it.ingredient_id,
    quantity: it.quantity,
    unit_price: it.unit_price,
    ...(it.conversion_factor ? { conversion_factor: it.conversion_factor } : {}),
    ...(it.unit ? { unit: it.unit } : {}),
  }));

  const supabase = await createClient();
  // p_due_date/p_invoice_number/p_note nhận null ở DB (generated types khai báo `string`).
  const args = {
    p_supplier_id: parsed.data.supplier_id,
    p_order_date: parsed.data.order_date,
    p_due_date: parsed.data.due_date ?? null,
    p_invoice_number: parsed.data.invoice_number ?? null,
    p_note: parsed.data.note ?? null,
    p_items: items as unknown as Json,
    p_paid_now: parsed.data.paid_now,
    p_paid_method: parsed.data.paid_method,
    p_invoice_image_url: parsed.data.invoice_image_url ?? null,
  } as unknown as FunctionArgs<"create_purchase_order">;

  const { data, error } = await supabase.rpc("create_purchase_order", args);

  if (error || !data) return fail(parseDbError(error));

  // Ghi nhật ký tạo phiếu nhập
  try {
    const userSession = await getCurrentUserWithRole().catch(() => null);
    const { data: createdPo } = await supabase
      .from("purchase_orders")
      .select("po_number, suppliers(name)")
      .eq("id", data)
      .maybeSingle();

    const supplierName = (createdPo?.suppliers as { name?: string } | null)?.name || null;
    await logPoAction(supabase, {
      purchase_order_id: data,
      po_number: createdPo?.po_number || data.slice(0, 8),
      supplier_id: parsed.data.supplier_id,
      supplier_name: supplierName,
      action: "created",
      performed_by: userSession?.user.id,
      performed_by_name: userSession?.profile.full_name || userSession?.user.email || "Nhân viên",
      details: {
        summary: `Tạo phiếu nhập mới gồm ${items.length} mặt hàng`,
      },
    });
  } catch (auditErr) {
    console.warn("Could not log createPurchaseOrder audit:", auditErr);
  }

  revalidatePurchaseScope(
    parsed.data.supplier_id,
    data,
    items.map((it) => it.ingredient_id)
  );
  return ok({ id: data });
}

export interface BatchCreatePoItemResult {
  index: number;
  success: boolean;
  id?: string;
  po_number?: string;
  supplier_name?: string;
  invoice_number?: string;
  total_amount?: number;
  error?: string;
}

export interface BatchCreatePoSummary {
  totalRequested: number;
  successfulCount: number;
  failedCount: number;
  results: BatchCreatePoItemResult[];
}

/** Tạo hàng loạt phiếu nhập hàng từ nhiều hóa đơn/nhiều Nhà cung cấp khác nhau */
export async function createBatchPurchaseOrders(
  orders: PurchaseOrderInput[]
): Promise<ActionResult<BatchCreatePoSummary>> {
  if (!orders || orders.length === 0) {
    return fail("Không có phiếu nhập nào để lưu");
  }

  const supabase = await createClient();
  const userSession = await getCurrentUserWithRole().catch(() => null);

  const results: BatchCreatePoItemResult[] = [];
  let successfulCount = 0;
  let failedCount = 0;
  const touchedSuppliers = new Set<string>();
  const touchedIngredients = new Set<string>();

  for (let idx = 0; idx < orders.length; idx++) {
    const input = orders[idx];
    const parsed = purchaseOrderSchema.safeParse(input);
    if (!parsed.success) {
      failedCount++;
      results.push({
        index: idx,
        success: false,
        invoice_number: input.invoice_number ?? undefined,
        error: parsed.error.issues.map((i) => i.message).join(", "),
      });
      continue;
    }

    const items: CreatePurchaseOrderItemPayload[] = parsed.data.items.map((it) => ({
      ingredient_id: it.ingredient_id,
      quantity: it.quantity,
      unit_price: it.unit_price,
      ...(it.conversion_factor ? { conversion_factor: it.conversion_factor } : {}),
      ...(it.unit ? { unit: it.unit } : {}),
    }));

    const args = {
      p_supplier_id: parsed.data.supplier_id,
      p_order_date: parsed.data.order_date,
      p_due_date: parsed.data.due_date ?? null,
      p_invoice_number: parsed.data.invoice_number ?? null,
      p_note: parsed.data.note ?? null,
      p_items: items as unknown as Json,
      p_paid_now: parsed.data.paid_now,
      p_paid_method: parsed.data.paid_method,
      p_invoice_image_url: parsed.data.invoice_image_url ?? null,
    } as unknown as FunctionArgs<"create_purchase_order">;

    const { data: poId, error } = await supabase.rpc("create_purchase_order", args);

    if (error || !poId) {
      failedCount++;
      results.push({
        index: idx,
        success: false,
        invoice_number: parsed.data.invoice_number ?? undefined,
        error: parseDbError(error),
      });
      continue;
    }

    successfulCount++;
    touchedSuppliers.add(parsed.data.supplier_id);
    items.forEach((it) => touchedIngredients.add(it.ingredient_id));

    // Lấy thông tin số PO và tên NCC
    const { data: createdPo } = await supabase
      .from("purchase_orders")
      .select("po_number, total_amount, suppliers(name)")
      .eq("id", poId)
      .maybeSingle();

    const supplierName = (createdPo?.suppliers as { name?: string } | null)?.name || undefined;

    // Ghi nhật ký
    try {
      await logPoAction(supabase, {
        purchase_order_id: poId,
        po_number: createdPo?.po_number || poId.slice(0, 8),
        supplier_id: parsed.data.supplier_id,
        supplier_name: supplierName,
        action: "created",
        performed_by: userSession?.user.id,
        performed_by_name: userSession?.profile.full_name || userSession?.user.email || "Nhân viên",
        details: {
          summary: `Tạo từ nhập hàng loạt AI gồm ${items.length} mặt hàng`,
        },
      });
    } catch (auditErr) {
      console.warn("Could not log audit in createBatchPurchaseOrders:", auditErr);
    }

    results.push({
      index: idx,
      success: true,
      id: poId,
      po_number: createdPo?.po_number || undefined,
      supplier_name: supplierName,
      invoice_number: parsed.data.invoice_number ?? undefined,
      total_amount: Number(createdPo?.total_amount) || undefined,
    });
  }

  // Cập nhật lại cache / views cho các NCC & Nguyên liệu liên quan
  for (const supId of touchedSuppliers) {
    revalidatePurchaseScope(supId, undefined, Array.from(touchedIngredients));
  }

  return ok({
    totalRequested: orders.length,
    successfulCount,
    failedCount,
    results,
  });
}

/** Chỉ sửa được các trường không do trigger quản lý (DATABASE.md §1.3). */
export async function updatePurchaseOrderMeta(
  id: string,
  input: PurchaseOrderMetaInput
): Promise<ActionResult<{ id: string }>> {
  const parsed = purchaseOrderMetaSchema.safeParse(input);
  if (!parsed.success) {
    return failZod(parsed.error);
  }

  // Chỉ gửi đúng các cột người dùng thực sự chỉnh — tránh xóa trắng dữ liệu cũ.
  const patch: {
    order_date?: string;
    invoice_number?: string | null;
    invoice_image_url?: string | null;
    note?: string | null;
    due_date?: string | null;
  } = {};
  if (parsed.data.order_date !== undefined) {
    patch.order_date = parsed.data.order_date;
  }
  if (parsed.data.invoice_number !== undefined) {
    patch.invoice_number = parsed.data.invoice_number ?? null;
  }
  if (parsed.data.invoice_image_url !== undefined) {
    patch.invoice_image_url = parsed.data.invoice_image_url ?? null;
  }
  if (parsed.data.note !== undefined) patch.note = parsed.data.note ?? null;
  if (parsed.data.due_date !== undefined) patch.due_date = parsed.data.due_date ?? null;

  if (Object.keys(patch).length === 0) return ok({ id });

  const supabase = await createClient();

  // Đọc thông tin cũ để ghi diff
  const { data: oldPo } = await supabase
    .from("purchase_orders")
    .select("po_number, order_date, due_date, invoice_number, invoice_image_url, note, supplier_id, suppliers(name)")
    .eq("id", id)
    .maybeSingle();

  const { data, error } = await supabase
    .from("purchase_orders")
    .update(patch)
    .eq("id", id)
    .select("supplier_id")
    .maybeSingle();

  if (error) return fail(parseDbError(error));
  if (!data) return fail("Không tìm thấy phiếu nhập.");

  // Ghi nhật ký thay đổi
  try {
    const userSession = await getCurrentUserWithRole().catch(() => null);
    const changes: Record<string, { from: unknown; to: unknown }> = {};
    if (patch.order_date !== undefined && oldPo?.order_date !== patch.order_date) {
      changes["Ngày nhập"] = { from: oldPo?.order_date, to: patch.order_date };
    }
    if (patch.due_date !== undefined && oldPo?.due_date !== patch.due_date) {
      changes["Hạn thanh toán"] = { from: oldPo?.due_date, to: patch.due_date };
    }
    if (patch.invoice_number !== undefined && oldPo?.invoice_number !== patch.invoice_number) {
      changes["Số hóa đơn"] = { from: oldPo?.invoice_number, to: patch.invoice_number };
    }
    if (patch.note !== undefined && oldPo?.note !== patch.note) {
      changes["Ghi chú"] = { from: oldPo?.note, to: patch.note };
    }
    if (patch.invoice_image_url !== undefined && oldPo?.invoice_image_url !== patch.invoice_image_url) {
      changes["Ảnh hóa đơn"] = {
        from: oldPo?.invoice_image_url ? "Có ảnh" : "Không có",
        to: patch.invoice_image_url ? "Có ảnh mới" : "Đã gỡ",
      };
    }

    if (Object.keys(changes).length > 0) {
      const supplierName = (oldPo?.suppliers as { name?: string } | null)?.name || null;
      await logPoAction(supabase, {
        purchase_order_id: id,
        po_number: oldPo?.po_number || id.slice(0, 8),
        supplier_id: data.supplier_id,
        supplier_name: supplierName,
        action: "updated",
        performed_by: userSession?.user.id,
        performed_by_name: userSession?.profile.full_name || userSession?.user.email || "Nhân viên",
        details: {
          summary: `Chỉnh sửa thông tin: ${Object.keys(changes).join(", ")}`,
          changes,
        },
      });
    }
  } catch (auditErr) {
    console.warn("Could not log updatePurchaseOrderMeta audit:", auditErr);
  }

  revalidatePurchaseScope(data.supplier_id, id);
  return ok({ id });
}

/** Thêm một dòng vào phiếu nhập đã tồn tại (trigger tự cộng kho + WAC + tổng tiền). */
export async function addPurchaseOrderLine(
  purchaseOrderId: string,
  input: PurchaseOrderLineInput
): Promise<ActionResult<{ id: string }>> {
  const parsed = purchaseOrderLineSchema.safeParse(input);
  if (!parsed.success) {
    return failZod(parsed.error);
  }

  const supabase = await createClient();
  const { data: po, error: poError } = await supabase
    .from("purchase_orders")
    .select("supplier_id, po_number, suppliers(name)")
    .eq("id", purchaseOrderId)
    .maybeSingle();
  if (poError) return fail(parseDbError(poError));
  if (!po) return fail("Không tìm thấy phiếu nhập.");

  // `conversion_factor`/`unit` được snapshot từ nguyên liệu khi form không ghi đè.
  const { data: ingredient, error: ingredientError } = await supabase
    .from("ingredients")
    .select("name, conversion_factor, import_unit, base_unit")
    .eq("id", parsed.data.ingredient_id)
    .maybeSingle();
  if (ingredientError) return fail(parseDbError(ingredientError));
  if (!ingredient) return fail("Không tìm thấy nguyên liệu.");

  const unit = parsed.data.unit ?? ingredient.import_unit ?? ingredient.base_unit;
  const factor = parsed.data.conversion_factor ?? ingredient.conversion_factor ?? 1;

  const { data, error } = await supabase
    .from("purchase_order_items")
    .insert({
      purchase_order_id: purchaseOrderId,
      ingredient_id: parsed.data.ingredient_id,
      quantity: parsed.data.quantity,
      unit_price: parsed.data.unit_price,
      conversion_factor: factor,
      unit: unit,
    })
    .select("id")
    .single();

  if (error || !data) return fail(parseDbError(error));

  // Ghi nhật ký thêm dòng
  try {
    const userSession = await getCurrentUserWithRole().catch(() => null);
    const supplierName = (po.suppliers as { name?: string } | null)?.name || null;
    const lineTotal = Number(parsed.data.quantity) * Number(parsed.data.unit_price);
    await logPoAction(supabase, {
      purchase_order_id: purchaseOrderId,
      po_number: po.po_number || purchaseOrderId.slice(0, 8),
      supplier_id: po.supplier_id,
      supplier_name: supplierName,
      action: "line_added",
      performed_by: userSession?.user.id,
      performed_by_name: userSession?.profile.full_name || userSession?.user.email || "Nhân viên",
      details: {
        summary: `Thêm món: ${ingredient.name} (x${parsed.data.quantity} ${unit})`,
        item: {
          name: ingredient.name,
          quantity: Number(parsed.data.quantity),
          unit: unit || "",
          unit_price: Number(parsed.data.unit_price),
          line_total: lineTotal,
        },
      },
    });
  } catch (auditErr) {
    console.warn("Could not log addPurchaseOrderLine audit:", auditErr);
  }

  revalidatePurchaseScope(po.supplier_id, purchaseOrderId, [parsed.data.ingredient_id]);
  return ok({ id: data.id });
}

/** Sửa một dòng = xóa dòng cũ rồi nhập lại (DATABASE.md §7.1 — UPDATE bị chặn). */
export async function deletePurchaseOrderLine(
  lineId: string
): Promise<ActionResult<{ id: string }>> {
  const supabase = await createClient();
  const { data: line, error: lookupError } = await supabase
    .from("purchase_order_items")
    .select(`
      purchase_order_id,
      ingredient_id,
      quantity,
      unit_price,
      line_total,
      unit,
      ingredients(name),
      purchase_orders(po_number, supplier_id, suppliers(name))
    `)
    .eq("id", lineId)
    .maybeSingle();

  if (lookupError) return fail(parseDbError(lookupError));
  if (!line) return fail("Không tìm thấy dòng nhập.");

  const { data: deleted, error } = await supabase
    .from("purchase_order_items")
    .delete()
    .eq("id", lineId)
    .select("id")
    .maybeSingle();
  if (error) return fail(parseDbError(error));
  if (!deleted) return fail("Không tìm thấy dòng nhập.");

  // Ghi nhật ký xóa dòng
  try {
    const userSession = await getCurrentUserWithRole().catch(() => null);
    const poInfo = line.purchase_orders as {
      po_number?: string;
      supplier_id?: string;
      suppliers?: { name?: string };
    } | null;
    const ingName = (line.ingredients as { name?: string } | null)?.name || "Nguyên liệu";

    await logPoAction(supabase, {
      purchase_order_id: line.purchase_order_id,
      po_number: poInfo?.po_number || line.purchase_order_id.slice(0, 8),
      supplier_id: poInfo?.supplier_id || null,
      supplier_name: poInfo?.suppliers?.name || null,
      action: "line_deleted",
      performed_by: userSession?.user.id,
      performed_by_name: userSession?.profile.full_name || userSession?.user.email || "Nhân viên",
      details: {
        summary: `Xóa món: ${ingName} (x${line.quantity} ${line.unit || ""})`,
        item: {
          name: ingName,
          quantity: Number(line.quantity),
          unit: line.unit || "",
          unit_price: Number(line.unit_price),
          line_total: Number(line.line_total),
        },
      },
    });
  } catch (auditErr) {
    console.warn("Could not log deletePurchaseOrderLine audit:", auditErr);
  }

  const poInfo = line.purchase_orders as { supplier_id?: string } | null;
  revalidatePurchaseScope(poInfo?.supplier_id, line.purchase_order_id, [line.ingredient_id]);
  return ok({ id: lineId });
}

/**
 * Sửa một dòng trong phiếu nhập.
 * Do cơ sở dữ liệu có trigger trg_po_items_no_update chặn UPDATE trực tiếp,
 * thao tác sửa được thực hiện chuẩn mực theo thiết kế kế toán:
 * 1. Thu hồi dòng cũ (DELETE -> trigger tự động trừ tồn kho và giảm công nợ).
 * 2. Thêm dòng mới đã chỉnh sửa (INSERT -> trigger tự động cộng tồn kho, tính WAC và cập nhật công nợ).
 * 3. Ghi vết audit log với chi tiết các trường thay đổi (nguyên liệu, số lượng, đơn giá, thành tiền).
 */
export async function updatePurchaseOrderLine(
  lineId: string,
  input: PurchaseOrderLineInput
): Promise<ActionResult<{ id: string }>> {
  const parsed = purchaseOrderLineSchema.safeParse(input);
  if (!parsed.success) {
    return failZod(parsed.error);
  }

  const supabase = await createClient();

  // 1. Tìm thông tin dòng cũ
  const { data: oldLine, error: lookupError } = await supabase
    .from("purchase_order_items")
    .select(`
      id,
      purchase_order_id,
      ingredient_id,
      quantity,
      unit_price,
      line_total,
      unit,
      conversion_factor,
      ingredients(name),
      purchase_orders(po_number, supplier_id, suppliers(name))
    `)
    .eq("id", lineId)
    .maybeSingle();

  if (lookupError) return fail(parseDbError(lookupError));
  if (!oldLine) return fail("Không tìm thấy dòng nhập cần sửa.");

  // 2. Lấy thông tin nguyên liệu mới
  const { data: ingredient, error: ingredientError } = await supabase
    .from("ingredients")
    .select("name, conversion_factor, import_unit, base_unit")
    .eq("id", parsed.data.ingredient_id)
    .maybeSingle();
  if (ingredientError) return fail(parseDbError(ingredientError));
  if (!ingredient) return fail("Không tìm thấy nguyên liệu.");

  const unit = parsed.data.unit ?? ingredient.import_unit ?? ingredient.base_unit;
  const factor = parsed.data.conversion_factor ?? ingredient.conversion_factor ?? 1;

  // 3. Xóa dòng cũ (trigger DB tự động thu hồi tồn kho và giảm công nợ)
  const { error: delError } = await supabase
    .from("purchase_order_items")
    .delete()
    .eq("id", lineId);

  if (delError) return fail(`Không thể xóa dòng cũ để cập nhật: ${parseDbError(delError)}`);

  // 4. Thêm dòng mới
  const { data: newLine, error: insError } = await supabase
    .from("purchase_order_items")
    .insert({
      purchase_order_id: oldLine.purchase_order_id,
      ingredient_id: parsed.data.ingredient_id,
      quantity: parsed.data.quantity,
      unit_price: parsed.data.unit_price,
      conversion_factor: factor,
      unit: unit,
    })
    .select("id")
    .single();

  if (insError || !newLine) {
    // Phục hồi lại dòng cũ nếu thêm dòng mới không thành công
    await supabase.from("purchase_order_items").insert({
      purchase_order_id: oldLine.purchase_order_id,
      ingredient_id: oldLine.ingredient_id,
      quantity: oldLine.quantity,
      unit_price: oldLine.unit_price,
      conversion_factor: oldLine.conversion_factor ?? 1,
      unit: oldLine.unit ?? undefined,
    });
    return fail(`Không thể lưu dòng mới: ${parseDbError(insError)}`);
  }

  // 5. Ghi nhật ký kiểm toán (Audit Trail)
  try {
    const userSession = await getCurrentUserWithRole().catch(() => null);
    const poInfo = oldLine.purchase_orders as {
      po_number?: string;
      supplier_id?: string;
      suppliers?: { name?: string };
    } | null;
    const oldIngName = (oldLine.ingredients as { name?: string } | null)?.name || "Nguyên liệu";
    const newIngName = ingredient.name;
    const newLineTotal = Number(parsed.data.quantity) * Number(parsed.data.unit_price);

    const changes: Record<string, { from: unknown; to: unknown }> = {};
    if (oldLine.ingredient_id !== parsed.data.ingredient_id) {
      changes["Nguyên liệu"] = { from: oldIngName, to: newIngName };
    }
    if (Number(oldLine.quantity) !== Number(parsed.data.quantity)) {
      changes["Số lượng"] = {
        from: `${oldLine.quantity} ${oldLine.unit || ""}`,
        to: `${parsed.data.quantity} ${unit || ""}`,
      };
    }
    if (Number(oldLine.unit_price) !== Number(parsed.data.unit_price)) {
      changes["Đơn giá"] = {
        from: Number(oldLine.unit_price),
        to: Number(parsed.data.unit_price),
      };
    }
    changes["Thành tiền"] = {
      from: Number(oldLine.line_total),
      to: newLineTotal,
    };

    await logPoAction(supabase, {
      purchase_order_id: oldLine.purchase_order_id,
      po_number: poInfo?.po_number || oldLine.purchase_order_id.slice(0, 8),
      supplier_id: poInfo?.supplier_id || null,
      supplier_name: poInfo?.suppliers?.name || null,
      action: "line_updated",
      performed_by: userSession?.user.id,
      performed_by_name: userSession?.profile.full_name || userSession?.user.email || "Nhân viên",
      details: {
        summary: `Sửa dòng: ${oldIngName} (x${oldLine.quantity} ${oldLine.unit || ""}) → ${newIngName} (x${parsed.data.quantity} ${unit || ""})`,
        changes,
        item: {
          name: newIngName,
          quantity: Number(parsed.data.quantity),
          unit: unit || "",
          unit_price: Number(parsed.data.unit_price),
          line_total: newLineTotal,
        },
      },
    });
  } catch (auditErr) {
    console.warn("Could not log updatePurchaseOrderLine audit:", auditErr);
  }

  const poInfo = oldLine.purchase_orders as { supplier_id?: string } | null;
  revalidatePurchaseScope(poInfo?.supplier_id, oldLine.purchase_order_id, [
    oldLine.ingredient_id,
    parsed.data.ingredient_id,
  ]);

  return ok({ id: newLine.id });
}

export async function deletePurchaseOrder(
  id: string,
  reason?: string
): Promise<ActionResult<{ id: string }>> {
  const supabase = await createClient();
  const { data: po, error: lookupError } = await supabase
    .from("purchase_orders")
    .select(`
      id,
      po_number,
      supplier_id,
      order_date,
      due_date,
      total_amount,
      paid_amount,
      invoice_number,
      invoice_image_url,
      note,
      suppliers(name),
      purchase_order_items(
        ingredient_id,
        quantity,
        unit,
        conversion_factor,
        unit_price,
        line_total,
        ingredients(name)
      )
    `)
    .eq("id", id)
    .maybeSingle();

  if (lookupError) return fail(parseDbError(lookupError));
  if (!po) return fail("Không tìm thấy phiếu nhập.");
  if (Number(po.paid_amount) > 0) {
    return fail("Phiếu nhập đã có thanh toán. Hãy hoàn tác phiếu chi trước khi xóa.");
  }

  // Chuẩn bị snapshot sao lưu toàn diện trước khi xóa để hỗ trợ khôi phục (Restore)
  const userSession = await getCurrentUserWithRole().catch(() => null);
  const supplierName = (po.suppliers as { name?: string } | null)?.name || "Nhà cung cấp";
  type PoItemRow = {
    ingredient_id: string;
    quantity: number;
    unit?: string | null;
    conversion_factor?: number | null;
    unit_price: number;
    line_total: number;
    ingredients?: { name?: string | null } | null;
  };
  const itemsSnapshot = ((po.purchase_order_items || []) as unknown as PoItemRow[]).map((it) => ({
    ingredient_id: it.ingredient_id,
    ingredient_name: it.ingredients?.name || "Nguyên liệu",
    quantity: Number(it.quantity),
    unit: it.unit || "",
    conversion_factor: it.conversion_factor ? Number(it.conversion_factor) : 1,
    unit_price: Number(it.unit_price),
    line_total: Number(it.line_total),
  }));

  const poNumber = po.po_number || po.id.slice(0, 8);
  const snapshot: PoAuditSnapshot = {
    id: po.id,
    po_number: poNumber,
    supplier_id: po.supplier_id,
    supplier_name: supplierName,
    order_date: po.order_date,
    due_date: po.due_date,
    total_amount: Number(po.total_amount),
    invoice_number: po.invoice_number,
    invoice_image_url: po.invoice_image_url,
    note: po.note,
    items: itemsSnapshot,
    deleted_at: new Date().toISOString(),
    deleted_by_name: userSession?.profile.full_name || userSession?.user.email || "Nhân viên",
    delete_reason: reason || "Người dùng xóa",
  };

  // Lưu snapshot vào nhật ký kiểm toán & thùng rác
  try {
    await logPoAction(supabase, {
      purchase_order_id: po.id,
      po_number: poNumber,
      supplier_id: po.supplier_id,
      supplier_name: supplierName,
      action: "deleted",
      performed_by: userSession?.user.id,
      performed_by_name: snapshot.deleted_by_name,
      details: {
        summary: `Xóa phiếu nhập ${poNumber} (${itemsSnapshot.length} mặt hàng, ${Number(po.total_amount).toLocaleString("vi-VN")} đ)`,
        reason: reason || "Người dùng xóa",
      },
      snapshot,
      is_restored: false,
    });
  } catch (auditErr) {
    console.warn("Could not log deletePurchaseOrder snapshot:", auditErr);
  }

  // Thực hiện xóa (database trigger sẽ tự động trừ tồn kho và giảm công nợ)
  const { data: deleted, error } = await supabase
    .from("purchase_orders")
    .delete()
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (error) return fail(parseDbError(error));
  if (!deleted) return fail("Không tìm thấy phiếu nhập.");

  revalidatePurchaseScope(
    po.supplier_id,
    id,
    itemsSnapshot.map((it) => it.ingredient_id)
  );
  return ok({ id });
}

/**
 * Khôi phục phiếu nhập đã xóa từ Snapshot trong Thùng rác
 * Sử dụng RPC create_purchase_order để trigger DB tự động cộng lại tồn kho & công nợ nhà cung cấp
 */
export async function restorePurchaseOrderAction(
  auditLogId: string
): Promise<ActionResult<{ id: string; poNumber: string }>> {
  const { authorized } = await requireAuth(["owner", "manager"]);
  if (!authorized) {
    return fail("Bạn không có quyền khôi phục phiếu nhập đã xóa.");
  }

  const supabase = await createClient();

  // Lấy snapshot từ audit logs (thùng rác)
  let snapshot: PoAuditSnapshot | null = null;
  const deletedList = await getDeletedPoSnapshots(supabase);
  const found = deletedList.find((l) => l.id === auditLogId || l.snapshot?.id === auditLogId);
  if (found) {
    if (found.is_restored) {
      return fail("Phiếu nhập này đã được khôi phục trước đó.");
    }
    snapshot = found.snapshot || null;
  }

  if (!snapshot || !snapshot.items || snapshot.items.length === 0) {
    return fail("Không tìm thấy bản sao lưu (snapshot) hợp lệ của phiếu nhập cần khôi phục.");
  }

  // Tái tạo mảng items cho create_purchase_order RPC
  const items: CreatePurchaseOrderItemPayload[] = snapshot.items.map((it) => ({
    ingredient_id: it.ingredient_id,
    quantity: it.quantity,
    unit_price: it.unit_price,
    ...(it.conversion_factor ? { conversion_factor: it.conversion_factor } : {}),
    ...(it.unit ? { unit: it.unit } : {}),
  }));

  const restoreNote = snapshot.note
    ? `${snapshot.note}\n[Đã khôi phục từ phiếu ${snapshot.po_number} bị xóa lúc ${new Date(snapshot.deleted_at).toLocaleString("vi-VN")}]`
    : `[Đã khôi phục từ phiếu ${snapshot.po_number} bị xóa lúc ${new Date(snapshot.deleted_at).toLocaleString("vi-VN")}]`;

  const args = {
    p_supplier_id: snapshot.supplier_id,
    p_order_date: snapshot.order_date,
    p_due_date: snapshot.due_date ?? null,
    p_invoice_number: snapshot.invoice_number ? `${snapshot.invoice_number} (Khôi phục)` : null,
    p_note: restoreNote,
    p_items: items as unknown as Json,
    p_paid_now: 0,
    p_paid_method: "cash",
    p_invoice_image_url: snapshot.invoice_image_url ?? null,
  } as unknown as FunctionArgs<"create_purchase_order">;

  const { data: newPoId, error } = await supabase.rpc("create_purchase_order", args);
  if (error || !newPoId) {
    return fail(`Không thể tái tạo phiếu nhập: ${parseDbError(error)}`);
  }

  // Đánh dấu bản ghi đã khôi phục
  await markPoRestored(supabase, auditLogId);

  // Ghi log hành động khôi phục
  const userSession = await getCurrentUserWithRole().catch(() => null);
  await logPoAction(supabase, {
    purchase_order_id: newPoId,
    po_number: snapshot.po_number,
    supplier_id: snapshot.supplier_id,
    supplier_name: snapshot.supplier_name,
    action: "restored",
    performed_by: userSession?.user.id,
    performed_by_name: userSession?.profile.full_name || userSession?.user.email || "Nhân viên",
    details: {
      summary: `Khôi phục thành công phiếu nhập ${snapshot.po_number}. Tồn kho và công nợ đã được cộng lại đầy đủ.`,
      reason: `Khôi phục từ bản lưu trữ xóa ngày ${new Date(snapshot.deleted_at).toLocaleDateString("vi-VN")}`,
    },
  });

  revalidatePurchaseScope(
    snapshot.supplier_id,
    newPoId,
    items.map((it) => it.ingredient_id)
  );

  return ok({ id: newPoId, poNumber: snapshot.po_number });
}

/**
 * Lấy lịch sử sửa/xóa/khôi phục cho phiếu nhập (hoặc toàn bộ)
 */
export async function getPurchaseOrderAuditLogsAction(
  poId?: string,
  poNumber?: string
): Promise<PurchaseOrderAuditLog[]> {
  const supabase = await createClient();
  return getPoAuditLogs(supabase, { poId, poNumber, limit: 100 });
}

/**
 * Lấy danh sách phiếu nhập trong Thùng rác (đã xóa, chưa khôi phục)
 */
export async function getDeletedPurchaseOrdersAction(): Promise<PurchaseOrderAuditLog[]> {
  const supabase = await createClient();
  return getDeletedPoSnapshots(supabase);
}
