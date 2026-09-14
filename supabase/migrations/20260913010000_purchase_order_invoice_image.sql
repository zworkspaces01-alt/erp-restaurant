-- Migration: Add invoice_image_url to purchase_orders and update v_purchase_orders_summary
-- Supports uploaded invoice images from supplier purchases for OCR and review.

alter table public.purchase_orders
  add column if not exists invoice_image_url text;

-- Cập nhật view v_purchase_orders_summary: thêm cột invoice_image_url ở cuối
create or replace view public.v_purchase_orders_summary
with (security_invoker = true) as
select
  po.id, po.po_number, po.supplier_id,
  s.name                                                           as supplier_name,
  s.code                                                           as supplier_code,
  po.order_date, po.due_date, po.total_amount, po.paid_amount, po.debt_amount, po.payment_status,
  po.invoice_number, po.note, po.created_by, po.created_at, po.updated_at,
  (select count(*)::int from public.purchase_order_items i where i.purchase_order_id = po.id) as item_count,
  (po.debt_amount > 0 and po.due_date < public.local_today())              as is_overdue,
  case when po.debt_amount > 0 and po.due_date < public.local_today() then (public.local_today() - po.due_date) else 0 end as days_overdue,
  po.invoice_image_url
from public.purchase_orders po
join public.suppliers s on s.id = po.supplier_id;

-- Cập nhật hàm create_purchase_order hỗ trợ nhận p_invoice_image_url
create or replace function public.create_purchase_order(
  p_supplier_id       uuid,
  p_order_date        date,
  p_due_date          date,
  p_invoice_number    text,
  p_note              text,
  p_items             jsonb,
  p_paid_now          numeric default 0,
  p_paid_method       public.payment_method default 'cash',
  p_invoice_image_url text default null
)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_po_id  uuid;
  v_item   jsonb;
  v_ing_id uuid;
  v_qty    numeric;
  v_price  numeric;
  v_factor numeric;
  v_unit   text;
begin
  if p_supplier_id is null or not exists (select 1 from public.suppliers where id = p_supplier_id) then
    raise exception 'SUPPLIER_NOT_FOUND: %', p_supplier_id;
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'PO_ITEMS_REQUIRED: at least one line is required';
  end if;
  if coalesce(p_paid_now, 0) < 0 then
    raise exception 'INVALID_AMOUNT: p_paid_now cannot be negative';
  end if;

  insert into public.purchase_orders (supplier_id, order_date, due_date, invoice_number, note, invoice_image_url)
  values (p_supplier_id, coalesce(p_order_date, public.local_today()), p_due_date, p_invoice_number, p_note, p_invoice_image_url)
  returning id into v_po_id;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_ing_id := nullif(v_item ->> 'ingredient_id', '')::uuid;
    v_qty    := nullif(v_item ->> 'quantity', '')::numeric;
    v_price  := coalesce(nullif(v_item ->> 'unit_price', '')::numeric, 0);
    v_factor := nullif(v_item ->> 'conversion_factor', '')::numeric;
    v_unit   := nullif(v_item ->> 'unit', '');

    if v_ing_id is null or not exists (select 1 from public.ingredients where id = v_ing_id) then
      raise exception 'INGREDIENT_NOT_FOUND: %', coalesce(v_item ->> 'ingredient_id', 'null');
    end if;
    if v_qty is null or v_qty <= 0 then
      raise exception 'INVALID_QUANTITY: quantity must be > 0 (ingredient %)', v_ing_id;
    end if;
    if v_price < 0 then
      raise exception 'INVALID_AMOUNT: unit_price must be >= 0 (ingredient %)', v_ing_id;
    end if;
    if v_factor is not null and v_factor <= 0 then
      raise exception 'INVALID_CONVERSION: conversion_factor must be > 0 (ingredient %)', v_ing_id;
    end if;

    insert into public.purchase_order_items (purchase_order_id, ingredient_id, quantity, unit, conversion_factor, unit_price)
    values (v_po_id, v_ing_id, v_qty, v_unit, v_factor, v_price);
  end loop;

  if coalesce(p_paid_now, 0) > 0 then
    insert into public.supplier_payments (supplier_id, purchase_order_id, amount, payment_date, method, note)
    values (p_supplier_id, v_po_id, round(p_paid_now, 2), coalesce(p_order_date, public.local_today()), coalesce(p_paid_method, 'cash'), 'Trả ngay khi nhập hàng');
  end if;

  return v_po_id;
end $$;

-- Tạo storage bucket invoices nếu có schema storage
do $$
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    insert into storage.buckets (id, name, public)
    values ('invoices', 'invoices', true)
    on conflict (id) do nothing;
  end if;
exception when others then
  null;
end $$;
