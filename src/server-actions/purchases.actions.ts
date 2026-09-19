"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
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

  revalidatePurchaseScope(
    parsed.data.supplier_id,
    data,
    items.map((it) => it.ingredient_id)
  );
  return ok({ id: data });
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
  const { data, error } = await supabase
    .from("purchase_orders")
    .update(patch)
    .eq("id", id)
    .select("supplier_id")
    .maybeSingle();

  if (error) return fail(parseDbError(error));
  if (!data) return fail("Không tìm thấy phiếu nhập.");

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
    .select("supplier_id")
    .eq("id", purchaseOrderId)
    .maybeSingle();
  if (poError) return fail(parseDbError(poError));
  if (!po) return fail("Không tìm thấy phiếu nhập.");

  // `conversion_factor`/`unit` được snapshot từ nguyên liệu khi form không ghi đè.
  const { data: ingredient, error: ingredientError } = await supabase
    .from("ingredients")
    .select("conversion_factor, import_unit, base_unit")
    .eq("id", parsed.data.ingredient_id)
    .maybeSingle();
  if (ingredientError) return fail(parseDbError(ingredientError));
  if (!ingredient) return fail("Không tìm thấy nguyên liệu.");

  const { data, error } = await supabase
    .from("purchase_order_items")
    .insert({
      purchase_order_id: purchaseOrderId,
      ingredient_id: parsed.data.ingredient_id,
      quantity: parsed.data.quantity,
      unit_price: parsed.data.unit_price,
      conversion_factor: parsed.data.conversion_factor ?? ingredient.conversion_factor ?? 1,
      unit: parsed.data.unit ?? ingredient.import_unit ?? ingredient.base_unit,
    })
    .select("id")
    .single();

  if (error || !data) return fail(parseDbError(error));

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
    .select("purchase_order_id, ingredient_id, purchase_orders(supplier_id)")
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

  revalidatePurchaseScope(line.purchase_orders?.supplier_id, line.purchase_order_id, [
    line.ingredient_id,
  ]);
  return ok({ id: lineId });
}

export async function deletePurchaseOrder(id: string): Promise<ActionResult<{ id: string }>> {
  const supabase = await createClient();
  const { data: po, error: lookupError } = await supabase
    .from("purchase_orders")
    .select("supplier_id, paid_amount, purchase_order_items(ingredient_id)")
    .eq("id", id)
    .maybeSingle();

  if (lookupError) return fail(parseDbError(lookupError));
  if (!po) return fail("Không tìm thấy phiếu nhập.");
  if (Number(po.paid_amount) > 0) {
    return fail("Phiếu nhập đã có thanh toán. Hãy hoàn tác phiếu chi trước khi xóa.");
  }

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
    (po.purchase_order_items ?? []).map((it) => it.ingredient_id)
  );
  return ok({ id });
}
