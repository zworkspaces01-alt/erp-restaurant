import "server-only";

import { createClient } from "@/lib/supabase/server";
import type {
  PaymentMethod,
  PoPaymentStatus,
  Supplier,
} from "@/types/restaurant";

const num = (v: number | string | null | undefined): number => {
  if (v === null || v === undefined || v === "") return 0;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};

// ============================================================================
// Row shapes handed to client components (numeric strings already parsed)
// ============================================================================

export interface SupplierDebtRow {
  id: string;
  code: string | null;
  name: string;
  phone: string | null;
  payment_terms_days: number;
  is_active: boolean;
  current_debt: number;
  po_count: number;
  unpaid_po_count: number;
  total_purchased: number;
  total_paid: number;
  overdue_debt: number;
  overdue_po_count: number;
  next_due_date: string | null;
  last_order_date: string | null;
}

export interface PurchaseOrderRow {
  id: string;
  po_number: string | null;
  supplier_id: string;
  supplier_name: string;
  supplier_code: string | null;
  order_date: string;
  due_date: string | null;
  total_amount: number;
  paid_amount: number;
  debt_amount: number;
  payment_status: PoPaymentStatus;
  invoice_number: string | null;
  invoice_image_url: string | null;
  note: string | null;
  item_count: number;
  is_overdue: boolean;
  days_overdue: number;
  created_at: string;
}

export interface PurchaseOrderItemRow {
  id: string;
  ingredient_id: string;
  ingredient_name: string;
  ingredient_code: string | null;
  base_unit: string;
  quantity: number;
  unit: string | null;
  conversion_factor: number;
  unit_price: number;
  line_total: number;
  base_quantity: number;
}

export interface PaymentAllocationRow {
  purchase_order_id: string;
  po_number: string | null;
  amount: number;
}

export interface SupplierPaymentRow {
  id: string;
  supplier_id: string;
  supplier_name: string;
  purchase_order_id: string | null;
  po_number: string | null;
  amount: number;
  payment_date: string;
  method: PaymentMethod;
  reference: string | null;
  note: string | null;
  created_at: string;
  allocations: PaymentAllocationRow[];
}

export interface IngredientPickRow {
  id: string;
  code: string | null;
  name: string;
  base_unit: string;
  import_unit: string | null;
  conversion_factor: number;
  current_stock: number;
  avg_cost_price: number;
  avg_cost_per_import_unit: number;
  default_supplier_id: string | null;
}

export interface SupplierPickRow {
  id: string;
  name: string;
  code: string | null;
  payment_terms_days: number;
  current_debt: number;
}

// ============================================================================
// Suppliers
// ============================================================================

const SUPPLIER_DEBT_COLUMNS =
  "id, code, name, phone, payment_terms_days, is_active, current_debt, po_count, unpaid_po_count, total_purchased, total_paid, overdue_debt, overdue_po_count, next_due_date, last_order_date";

interface RawSupplierDebtRow {
  id: string | null;
  code: string | null;
  name: string | null;
  phone: string | null;
  payment_terms_days: number | null;
  is_active: boolean | null;
  current_debt: number | string | null;
  po_count: number | null;
  unpaid_po_count: number | null;
  total_purchased: number | string | null;
  total_paid: number | string | null;
  overdue_debt: number | string | null;
  overdue_po_count: number | null;
  next_due_date: string | null;
  last_order_date: string | null;
}

function mapSupplierDebt(r: RawSupplierDebtRow): SupplierDebtRow {
  return {
    id: r.id ?? "",
    code: r.code,
    name: r.name ?? "—",
    phone: r.phone,
    payment_terms_days: r.payment_terms_days ?? 0,
    is_active: r.is_active ?? true,
    current_debt: num(r.current_debt),
    po_count: r.po_count ?? 0,
    unpaid_po_count: r.unpaid_po_count ?? 0,
    total_purchased: num(r.total_purchased),
    total_paid: num(r.total_paid),
    overdue_debt: num(r.overdue_debt),
    overdue_po_count: r.overdue_po_count ?? 0,
    next_due_date: r.next_due_date,
    last_order_date: r.last_order_date,
  };
}

export async function getSupplierDebtSummary(): Promise<SupplierDebtRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("v_supplier_debt_summary")
    .select(SUPPLIER_DEBT_COLUMNS)
    .order("current_debt", { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []).map(mapSupplierDebt);
}

export async function getSupplierDebtRow(id: string): Promise<SupplierDebtRow | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("v_supplier_debt_summary")
    .select(SUPPLIER_DEBT_COLUMNS)
    .eq("id", id)
    .maybeSingle();

  if (error || !data) return null;
  return mapSupplierDebt(data);
}

export async function getSupplier(id: string): Promise<Supplier | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("suppliers").select("*").eq("id", id).maybeSingle();
  return data ?? null;
}

export async function getSupplierOptions(): Promise<SupplierPickRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("suppliers")
    .select("id, name, code, payment_terms_days")
    .eq("is_active", true)
    .order("name", { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []).map((s) => ({
    id: s.id,
    name: s.name,
    code: s.code,
    payment_terms_days: s.payment_terms_days ?? 0,
    current_debt: 0,
  }));
}

export async function getSupplierOptionsWithDebt(): Promise<SupplierPickRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("v_supplier_debt_summary")
    .select("id, name, code, payment_terms_days, current_debt")
    .order("name", { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    id: r.id ?? "",
    name: r.name ?? "",
    code: r.code,
    payment_terms_days: r.payment_terms_days ?? 0,
    current_debt: num(r.current_debt),
  }));
}

// ============================================================================
// Purchase orders
// ============================================================================

const PO_COLUMNS =
  "id, po_number, supplier_id, supplier_name, supplier_code, order_date, due_date, total_amount, paid_amount, debt_amount, payment_status, invoice_number, invoice_image_url, note, item_count, is_overdue, days_overdue, created_at";

interface RawPoRow {
  id: string | null;
  po_number: string | null;
  supplier_id: string | null;
  supplier_name: string | null;
  supplier_code: string | null;
  order_date: string | null;
  due_date: string | null;
  total_amount: number | string | null;
  paid_amount: number | string | null;
  debt_amount: number | string | null;
  payment_status: PoPaymentStatus | null;
  invoice_number: string | null;
  invoice_image_url: string | null;
  note: string | null;
  item_count: number | null;
  is_overdue: boolean | null;
  days_overdue: number | null;
  created_at: string | null;
}

function mapPo(r: RawPoRow): PurchaseOrderRow {
  return {
    id: r.id ?? "",
    po_number: r.po_number,
    supplier_id: r.supplier_id ?? "",
    supplier_name: r.supplier_name ?? "—",
    supplier_code: r.supplier_code,
    order_date: r.order_date ?? "",
    due_date: r.due_date,
    total_amount: num(r.total_amount),
    paid_amount: num(r.paid_amount),
    debt_amount: num(r.debt_amount),
    payment_status: r.payment_status ?? "unpaid",
    invoice_number: r.invoice_number,
    invoice_image_url: r.invoice_image_url ?? null,
    note: r.note,
    item_count: r.item_count ?? 0,
    is_overdue: r.is_overdue ?? false,
    days_overdue: r.days_overdue ?? 0,
    created_at: r.created_at ?? "",
  };
}

export interface PurchaseOrdersFilter {
  from?: string;
  to?: string;
  supplierId?: string;
  status?: PoPaymentStatus;
}

export async function getPurchaseOrders(filter?: PurchaseOrdersFilter): Promise<PurchaseOrderRow[]> {
  const supabase = await createClient();
  let query = supabase.from("v_purchase_orders_summary").select(PO_COLUMNS);

  if (filter?.from) {
    query = query.gte("order_date", filter.from);
  }
  if (filter?.to) {
    query = query.lte("order_date", filter.to);
  }
  if (filter?.supplierId) {
    query = query.eq("supplier_id", filter.supplierId);
  }
  if (filter?.status) {
    query = query.eq("payment_status", filter.status);
  }

  const { data, error } = await query
    .order("order_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(5000);

  if (error) throw new Error(error.message);
  return (data ?? []).map(mapPo);
}

export async function getPurchaseOrdersBySupplier(supplierId: string): Promise<PurchaseOrderRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("v_purchase_orders_summary")
    .select(PO_COLUMNS)
    .eq("supplier_id", supplierId)
    .order("order_date", { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []).map(mapPo);
}

/** POs still owing money — used by the payment dialog (đích danh mode). */
export async function getOutstandingPurchaseOrders(supplierId?: string): Promise<PurchaseOrderRow[]> {
  const supabase = await createClient();
  let query = supabase
    .from("v_purchase_orders_summary")
    .select(PO_COLUMNS)
    .gt("debt_amount", 0)
    .order("due_date", { ascending: true });
  if (supplierId) query = query.eq("supplier_id", supplierId);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []).map(mapPo);
}

export async function getPurchaseOrder(id: string): Promise<PurchaseOrderRow | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("v_purchase_orders_summary")
    .select(PO_COLUMNS)
    .eq("id", id)
    .maybeSingle();

  if (error || !data) return null;
  return mapPo(data);
}

export async function getPurchaseOrderItems(poId: string): Promise<PurchaseOrderItemRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("purchase_order_items")
    .select(
      "id, ingredient_id, quantity, unit, conversion_factor, unit_price, line_total, base_quantity, created_at, ingredients(name, code, base_unit)"
    )
    .eq("purchase_order_id", poId)
    .order("created_at", { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    id: r.id,
    ingredient_id: r.ingredient_id,
    ingredient_name: r.ingredients?.name ?? "—",
    ingredient_code: r.ingredients?.code ?? null,
    base_unit: r.ingredients?.base_unit ?? "",
    quantity: num(r.quantity),
    unit: r.unit,
    conversion_factor: num(r.conversion_factor),
    unit_price: num(r.unit_price),
    line_total: num(r.line_total),
    base_quantity: num(r.base_quantity),
  }));
}

// ============================================================================
// Supplier payments
// ============================================================================

const PAYMENT_SELECT =
  "id, supplier_id, purchase_order_id, amount, payment_date, method, reference, note, created_at, suppliers(name), purchase_orders(po_number), supplier_payment_allocations(purchase_order_id, amount, purchase_orders(po_number))";

interface RawAllocation {
  purchase_order_id: string;
  amount: number | string | null;
  purchase_orders: { po_number: string | null } | null;
}

interface RawPayment {
  id: string;
  supplier_id: string;
  purchase_order_id: string | null;
  amount: number | string | null;
  payment_date: string;
  method: PaymentMethod;
  reference: string | null;
  note: string | null;
  created_at: string;
  suppliers: { name: string } | null;
  purchase_orders: { po_number: string | null } | null;
  supplier_payment_allocations: RawAllocation[] | null;
}

function mapPayment(r: RawPayment): SupplierPaymentRow {
  return {
    id: r.id,
    supplier_id: r.supplier_id,
    supplier_name: r.suppliers?.name ?? "—",
    purchase_order_id: r.purchase_order_id,
    po_number: r.purchase_orders?.po_number ?? null,
    amount: num(r.amount),
    payment_date: r.payment_date,
    method: r.method,
    reference: r.reference,
    note: r.note,
    created_at: r.created_at,
    allocations: (r.supplier_payment_allocations ?? []).map((a) => ({
      purchase_order_id: a.purchase_order_id,
      po_number: a.purchase_orders?.po_number ?? null,
      amount: num(a.amount),
    })),
  };
}

export async function getSupplierPayments(): Promise<SupplierPaymentRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("supplier_payments")
    .select(PAYMENT_SELECT)
    .order("payment_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []).map(mapPayment);
}

export async function getSupplierPaymentsBySupplier(supplierId: string): Promise<SupplierPaymentRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("supplier_payments")
    .select(PAYMENT_SELECT)
    .eq("supplier_id", supplierId)
    .order("payment_date", { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []).map(mapPayment);
}

/** Payments that settled (all or part of) one PO — via the allocation table. */
export async function getPaymentsForPurchaseOrder(poId: string): Promise<SupplierPaymentRow[]> {
  const supabase = await createClient();
  const { data: allocs, error } = await supabase
    .from("supplier_payment_allocations")
    .select("payment_id")
    .eq("purchase_order_id", poId);

  if (error) throw new Error(error.message);
  const ids = [...new Set((allocs ?? []).map((a) => a.payment_id))];
  if (ids.length === 0) return [];

  const { data, error: err2 } = await supabase
    .from("supplier_payments")
    .select(PAYMENT_SELECT)
    .in("id", ids)
    .order("payment_date", { ascending: false });

  if (err2) throw new Error(err2.message);
  return (data ?? []).map(mapPayment);
}

// ============================================================================
// Ingredients (PO form picker)
// ============================================================================

export async function getIngredientPickList(): Promise<IngredientPickRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("v_inventory_status")
    .select(
      "id, code, name, base_unit, import_unit, conversion_factor, current_stock, avg_cost_price, avg_cost_per_import_unit, default_supplier_id, is_active"
    )
    .eq("is_active", true)
    .order("name", { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    id: r.id as string,
    code: r.code,
    name: r.name as string,
    base_unit: r.base_unit as string,
    import_unit: r.import_unit,
    conversion_factor: num(r.conversion_factor) || 1,
    current_stock: num(r.current_stock),
    avg_cost_price: num(r.avg_cost_price),
    avg_cost_per_import_unit: num(r.avg_cost_per_import_unit),
    default_supplier_id: r.default_supplier_id,
  }));
}
