-- =============================================================================
-- Restaurant ERP - initial schema (single migration)
-- Khởi tạo toàn bộ schema: types, tables, triggers, views, RPC, RLS.
--
-- Contract reference for app developers: docs/DATABASE.md
-- Idempotent-friendly: safe to re-run on an existing database (IF NOT EXISTS /
-- CREATE OR REPLACE / DO blocks). Runs on Supabase cloud, `supabase start`
-- and the plain Docker Postgres used by scripts/db-test.sh.
--
-- Conventions
--   * ids: uuid default gen_random_uuid()
--   * money: numeric VND, rounded to 2 decimals (VND has no cents in practice)
--   * quantities: numeric in BASE units (g / ml / pcs ...), may be fractional
--   * Every stock movement is written to inventory_transactions (audit ledger)
--   * Errors raised by triggers/RPCs use the form 'CODE: message' so the app
--     can map them (see docs/DATABASE.md "Error codes").
-- =============================================================================

set client_min_messages = warning;   -- hide 'does not exist, skipping' notices on re-runs

create extension if not exists pgcrypto;

-- -----------------------------------------------------------------------------
-- 1. ENUM TYPES  (kiểu liệt kê)
-- -----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace where t.typname = 'employment_type' and n.nspname = 'public') then
    create type public.employment_type as enum ('full_time', 'part_time');
  end if;
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace where t.typname = 'payment_method' and n.nspname = 'public') then
    create type public.payment_method as enum ('cash', 'bank_transfer');
  end if;
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace where t.typname = 'po_payment_status' and n.nspname = 'public') then
    create type public.po_payment_status as enum ('unpaid', 'partial', 'paid');
  end if;
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace where t.typname = 'inventory_txn_type' and n.nspname = 'public') then
    create type public.inventory_txn_type as enum ('purchase', 'sale', 'sale_reversal', 'waste', 'adjustment', 'stocktake');
  end if;
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace where t.typname = 'order_status' and n.nspname = 'public') then
    create type public.order_status as enum ('completed', 'cancelled');
  end if;
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace where t.typname = 'payroll_status' and n.nspname = 'public') then
    create type public.payroll_status as enum ('draft', 'finalized', 'paid');
  end if;
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace where t.typname = 'expense_status' and n.nspname = 'public') then
    create type public.expense_status as enum ('pending', 'paid');
  end if;
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace where t.typname = 'expense_type' and n.nspname = 'public') then
    create type public.expense_type as enum ('fixed', 'variable');
  end if;
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace where t.typname = 'user_role' and n.nspname = 'public') then
    create type public.user_role as enum ('owner', 'manager', 'staff');
  end if;
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace where t.typname = 'menu_class' and n.nspname = 'public') then
    create type public.menu_class as enum ('star', 'plowhorse', 'puzzle', 'dog');
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 2. SHARED HELPERS  (hàm dùng chung)
-- -----------------------------------------------------------------------------

-- Generic updated_at maintainer.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- app_settings: key/value store for runtime flags (allow_negative_stock, ...).
create table if not exists public.app_settings (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_app_settings_updated_at on public.app_settings;
create trigger trg_app_settings_updated_at
  before update on public.app_settings
  for each row execute function public.set_updated_at();

-- Read a boolean setting (missing key -> default). Đọc cờ cấu hình boolean.
create or replace function public.app_setting_bool(p_key text, p_default boolean default false)
returns boolean
language sql
stable
set search_path = public
as $$
  select coalesce(
    (select case jsonb_typeof(value)
              when 'boolean' then (value)::text::boolean
              when 'string'  then lower(value #>> '{}') in ('true', 't', '1', 'yes', 'on')
              else null end
       from public.app_settings where key = p_key),
    p_default);
$$;

-- Restaurant local timezone used to bucket orders into calendar days.
-- Múi giờ dùng để gom đơn theo ngày (mặc định Asia/Ho_Chi_Minh).
create or replace function public.app_timezone()
returns text
language sql
stable
set search_path = public
as $$
  select coalesce(
    (select nullif(value #>> '{}', '') from public.app_settings where key = 'timezone'),
    'Asia/Ho_Chi_Minh');
$$;

create or replace function public.to_local_date(p_ts timestamptz)
returns date
language sql
stable
set search_path = public
as $$
  select (p_ts at time zone public.app_timezone())::date;
$$;

-- Start of a local calendar day as timestamptz (for index-friendly range filters).
create or replace function public.local_day_start(p_date date)
returns timestamptz
language sql
stable
set search_path = public
as $$
  select (p_date::timestamp) at time zone public.app_timezone();
$$;

-- -----------------------------------------------------------------------------
-- 3. PROFILES  (hồ sơ người dùng, gắn với auth.users)
-- -----------------------------------------------------------------------------
create table if not exists public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  full_name  text,
  role       public.user_role not null default 'staff',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Auto-create a profile for every new auth user. Security definer so it works
-- from the auth service (which is not an authenticated app user).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.email),
    'staff'
  )
  on conflict (id) do nothing;
  return new;
end $$;

-- Creating a trigger on auth.users needs table privileges that exist on Supabase
-- (postgres role) but may be missing on exotic setups -> degrade to a NOTICE.
do $$
begin
  execute 'drop trigger if exists on_auth_user_created on auth.users';
  execute 'create trigger on_auth_user_created after insert on auth.users
           for each row execute function public.handle_new_user()';
exception when insufficient_privilege then
  raise notice 'Could not create trigger on auth.users (insufficient privilege). Profiles must be created by the app.';
end $$;

-- -----------------------------------------------------------------------------
-- 4. SUPPLIERS  (nhà cung cấp)
-- -----------------------------------------------------------------------------
create table if not exists public.suppliers (
  id                 uuid primary key default gen_random_uuid(),
  code               text unique,
  name               text not null,
  contact_name       text,
  phone              text,
  email              text,
  address            text,
  tax_code           text,
  payment_terms_days int  not null default 0 check (payment_terms_days >= 0),   -- 0 = COD (trả ngay)
  current_debt       numeric(14,2) not null default 0,                          -- MAINTAINED by triggers (công nợ hiện tại)
  is_active          boolean not null default true,
  note               text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

drop trigger if exists trg_suppliers_updated_at on public.suppliers;
create trigger trg_suppliers_updated_at
  before update on public.suppliers
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 5. INGREDIENTS  (nguyên liệu)
-- -----------------------------------------------------------------------------
create table if not exists public.ingredients (
  id                  uuid primary key default gen_random_uuid(),
  code                text unique,
  name                text not null,
  category            text,
  base_unit           text not null,                                          -- g | ml | pcs ... (đơn vị cơ sở, dùng cho định lượng & tồn kho)
  import_unit         text not null,                                          -- kg | lít | thùng ... (đơn vị nhập hàng)
  conversion_factor   numeric(14,4) not null check (conversion_factor > 0),   -- 1 import_unit = conversion_factor base_unit
  current_stock       numeric(14,3) not null default 0,                       -- MAINTAINED (tồn kho, base unit)
  avg_cost_price      numeric(14,4) not null default 0,                       -- MAINTAINED (giá vốn BQ gia quyền, VND / base unit)
  min_alert_stock     numeric(14,3) not null default 0,                       -- ngưỡng cảnh báo (base unit)
  default_supplier_id uuid references public.suppliers (id) on delete set null,
  is_active           boolean not null default true,
  note                text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists idx_ingredients_default_supplier on public.ingredients (default_supplier_id);
create index if not exists idx_ingredients_category on public.ingredients (category);

drop trigger if exists trg_ingredients_updated_at on public.ingredients;
create trigger trg_ingredients_updated_at
  before update on public.ingredients
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 6. INVENTORY LEDGER  (sổ kho - mọi biến động tồn kho đều đi qua bảng này)
-- -----------------------------------------------------------------------------
create table if not exists public.inventory_transactions (
  id             uuid primary key default gen_random_uuid(),
  ingredient_id  uuid not null references public.ingredients (id),
  txn_type       public.inventory_txn_type not null,
  quantity       numeric(14,3) not null,                 -- signed, base units: + in / - out
  unit_cost      numeric(14,4),                          -- VND per base unit (avg cost snapshot, or import cost for purchases)
  total_cost     numeric(14,2) generated always as (round(abs(quantity) * coalesce(unit_cost, 0), 2)) stored,
  stock_after    numeric(14,3),                          -- ingredients.current_stock right after this row
  reference_type text,                                   -- 'purchase_order_item' | 'order_item' | 'manual' | ...
  reference_id   uuid,
  note           text,
  created_by     uuid default auth.uid(),
  created_at     timestamptz not null default now()
);

create index if not exists idx_inv_txn_ingredient_created on public.inventory_transactions (ingredient_id, created_at);
create index if not exists idx_inv_txn_type_created on public.inventory_transactions (txn_type, created_at);
create index if not exists idx_inv_txn_reference on public.inventory_transactions (reference_type, reference_id);

-- BEFORE INSERT: apply the movement to ingredients.current_stock.
--   * sale / sale_reversal / waste / adjustment / stocktake -> stock += quantity
--   * purchase -> stock already applied by the purchase_order_items trigger;
--     the ledger row only records it (unit_cost = import cost per base unit).
-- Stock is not allowed to go below zero unless app_settings.allow_negative_stock = true.
create or replace function public.trg_inventory_txn_before_insert()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_stock     numeric(14,3);
  v_avg       numeric(14,4);
  v_name      text;
  v_new_stock numeric(14,3);
begin
  if new.quantity is null then
    raise exception 'INVALID_QUANTITY: quantity is required';
  end if;

  select current_stock, avg_cost_price, name
    into v_stock, v_avg, v_name
    from public.ingredients
   where id = new.ingredient_id
     for update;

  if not found then
    raise exception 'INGREDIENT_NOT_FOUND: %', new.ingredient_id;
  end if;

  if new.unit_cost is null then
    new.unit_cost := v_avg;
  end if;

  if new.txn_type = 'purchase' then
    -- Stock was already moved by the PO-items trigger; just record stock_after if missing.
    if new.stock_after is null then
      new.stock_after := v_stock;
    end if;
    return new;
  end if;

  v_new_stock := v_stock + new.quantity;

  if v_new_stock < 0 and not public.app_setting_bool('allow_negative_stock', false) then
    raise exception 'INSUFFICIENT_STOCK: % (tồn % , cần %)', v_name, v_stock, abs(new.quantity);
  end if;

  update public.ingredients
     set current_stock = v_new_stock
   where id = new.ingredient_id;

  new.stock_after := v_new_stock;
  return new;
end $$;

drop trigger if exists trg_inventory_txn_before_insert on public.inventory_transactions;
create trigger trg_inventory_txn_before_insert
  before insert on public.inventory_transactions
  for each row execute function public.trg_inventory_txn_before_insert();

-- The ledger is append-only (sổ kho chỉ ghi thêm, không sửa/xóa).
create or replace function public.trg_ledger_immutable()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'LEDGER_IMMUTABLE: inventory_transactions rows cannot be updated or deleted';
end $$;

drop trigger if exists trg_inventory_txn_immutable on public.inventory_transactions;
create trigger trg_inventory_txn_immutable
  before update or delete on public.inventory_transactions
  for each row execute function public.trg_ledger_immutable();

-- -----------------------------------------------------------------------------
-- 7. MENU ITEMS & RECIPES  (món ăn & định lượng / BOM)
-- -----------------------------------------------------------------------------
create table if not exists public.menu_items (
  id            uuid primary key default gen_random_uuid(),
  code          text unique,
  name          text not null,
  category      text,
  selling_price numeric(14,2) not null default 0 check (selling_price >= 0),
  is_active     boolean not null default true,
  description   text,
  image_url     text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists idx_menu_items_category on public.menu_items (category);

drop trigger if exists trg_menu_items_updated_at on public.menu_items;
create trigger trg_menu_items_updated_at
  before update on public.menu_items
  for each row execute function public.set_updated_at();

create table if not exists public.recipes (
  id            uuid primary key default gen_random_uuid(),
  menu_item_id  uuid not null references public.menu_items (id) on delete cascade,
  ingredient_id uuid not null references public.ingredients (id),
  quantity      numeric(14,3) not null check (quantity > 0),                         -- base units per 1 portion
  waste_percent numeric(6,2) not null default 0 check (waste_percent >= 0 and waste_percent <= 100),
  note          text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (menu_item_id, ingredient_id)
);

create index if not exists idx_recipes_menu_item on public.recipes (menu_item_id);
create index if not exists idx_recipes_ingredient on public.recipes (ingredient_id);

drop trigger if exists trg_recipes_updated_at on public.recipes;
create trigger trg_recipes_updated_at
  before update on public.recipes
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 8. PURCHASE ORDERS  (phiếu nhập hàng)
-- -----------------------------------------------------------------------------
create table if not exists public.purchase_orders (
  id             uuid primary key default gen_random_uuid(),
  po_number      text unique,                                                    -- auto 'PO-yyyymmdd-0001' (from order_date)
  supplier_id    uuid not null references public.suppliers (id),
  order_date     date not null default current_date,
  due_date       date,                                                           -- default order_date + supplier.payment_terms_days
  total_amount   numeric(14,2) not null default 0,                               -- MAINTAINED = sum(items.line_total)
  paid_amount    numeric(14,2) not null default 0,                               -- MAINTAINED by payment allocations
  debt_amount    numeric(14,2) generated always as (total_amount - paid_amount) stored,
  payment_status public.po_payment_status not null default 'unpaid',            -- MAINTAINED
  invoice_number text,
  note           text,
  created_by     uuid default auth.uid(),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists idx_purchase_orders_supplier_due on public.purchase_orders (supplier_id, due_date);
create index if not exists idx_purchase_orders_order_date on public.purchase_orders (order_date);

-- Next PO number for a date: PO-YYYYMMDD-#### (serialized with an advisory lock).
create or replace function public.next_po_number(p_date date default current_date)
returns text
language plpgsql
set search_path = public
as $$
declare
  v_prefix text := 'PO-' || to_char(p_date, 'YYYYMMDD') || '-';
  v_seq    int;
begin
  perform pg_advisory_xact_lock(hashtext('po_number'), hashtext(v_prefix));
  select coalesce(max(substring(po_number from length(v_prefix) + 1)::int), 0) + 1
    into v_seq
    from public.purchase_orders
   where po_number like v_prefix || '%'
     and substring(po_number from length(v_prefix) + 1) ~ '^[0-9]+$';
  return v_prefix || lpad(v_seq::text, 4, '0');
end $$;

-- BEFORE INSERT/UPDATE: fill po_number/due_date, recompute payment_status, guard totals.
create or replace function public.trg_purchase_orders_before()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_terms int;
begin
  if tg_op = 'INSERT' then
    if new.order_date is null then
      new.order_date := current_date;
    end if;
    if new.po_number is null or new.po_number = '' then
      new.po_number := public.next_po_number(new.order_date);
    end if;
    if new.due_date is null then
      select payment_terms_days into v_terms from public.suppliers where id = new.supplier_id;
      if v_terms is null then
        raise exception 'SUPPLIER_NOT_FOUND: %', new.supplier_id;
      end if;
      new.due_date := new.order_date + v_terms;
    end if;
  end if;

  new.total_amount := round(coalesce(new.total_amount, 0), 2);
  new.paid_amount  := round(coalesce(new.paid_amount, 0), 2);

  if new.paid_amount < 0 then
    raise exception 'INVALID_AMOUNT: paid_amount cannot be negative';
  end if;
  if new.total_amount < new.paid_amount then
    raise exception 'PO_TOTAL_BELOW_PAID: total % is lower than paid % on %', new.total_amount, new.paid_amount, new.po_number;
  end if;

  if new.paid_amount <= 0 then
    new.payment_status := 'unpaid';
  elsif new.paid_amount >= new.total_amount then
    new.payment_status := 'paid';
  else
    new.payment_status := 'partial';
  end if;

  if tg_op = 'UPDATE' then
    new.updated_at := now();
  end if;
  return new;
end $$;

drop trigger if exists trg_purchase_orders_before on public.purchase_orders;
create trigger trg_purchase_orders_before
  before insert or update on public.purchase_orders
  for each row execute function public.trg_purchase_orders_before();

-- AFTER INSERT/UPDATE/DELETE (spec #1): suppliers.current_debt += delta(debt_amount).
-- Invariant: suppliers.current_debt == sum(purchase_orders.debt_amount) of that supplier.
create or replace function public.trg_purchase_orders_debt()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform 1 from public.suppliers where id = new.supplier_id for update;
    update public.suppliers set current_debt = current_debt + new.debt_amount where id = new.supplier_id;
    return new;
  elsif tg_op = 'DELETE' then
    perform 1 from public.suppliers where id = old.supplier_id for update;
    update public.suppliers set current_debt = current_debt - old.debt_amount where id = old.supplier_id;
    return old;
  else
    if new.supplier_id = old.supplier_id then
      if new.debt_amount <> old.debt_amount then
        perform 1 from public.suppliers where id = new.supplier_id for update;
        update public.suppliers set current_debt = current_debt + (new.debt_amount - old.debt_amount) where id = new.supplier_id;
      end if;
    else
      perform 1 from public.suppliers where id in (old.supplier_id, new.supplier_id) order by id for update;
      update public.suppliers set current_debt = current_debt - old.debt_amount where id = old.supplier_id;
      update public.suppliers set current_debt = current_debt + new.debt_amount where id = new.supplier_id;
    end if;
    return new;
  end if;
end $$;

drop trigger if exists trg_purchase_orders_debt on public.purchase_orders;
create trigger trg_purchase_orders_debt
  after insert or update or delete on public.purchase_orders
  for each row execute function public.trg_purchase_orders_debt();

-- -----------------------------------------------------------------------------
-- 9. PURCHASE ORDER ITEMS  (chi tiết phiếu nhập) + weighted average cost
-- -----------------------------------------------------------------------------
create table if not exists public.purchase_order_items (
  id                uuid primary key default gen_random_uuid(),
  purchase_order_id uuid not null references public.purchase_orders (id) on delete cascade,
  ingredient_id     uuid not null references public.ingredients (id),
  quantity          numeric(14,3) not null check (quantity > 0),                -- in IMPORT units (kg, thùng...)
  unit              text,                                                        -- import unit snapshot
  conversion_factor numeric(14,4) not null check (conversion_factor > 0),        -- snapshot from ingredient (overridable)
  unit_price        numeric(14,2) not null default 0 check (unit_price >= 0),    -- VND per import unit
  line_total        numeric(14,2) generated always as (round(quantity * unit_price, 2)) stored,
  base_quantity     numeric(14,3) generated always as (round(quantity * conversion_factor, 3)) stored,
  created_at        timestamptz not null default now()
);

create index if not exists idx_po_items_po on public.purchase_order_items (purchase_order_id);
create index if not exists idx_po_items_ingredient on public.purchase_order_items (ingredient_id);

-- BEFORE INSERT: snapshot unit / conversion_factor from the ingredient when not given.
create or replace function public.trg_po_items_before_insert()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_import_unit text;
  v_factor      numeric(14,4);
begin
  select import_unit, conversion_factor into v_import_unit, v_factor
    from public.ingredients where id = new.ingredient_id;
  if not found then
    raise exception 'INGREDIENT_NOT_FOUND: %', new.ingredient_id;
  end if;
  if new.unit is null or new.unit = '' then
    new.unit := v_import_unit;
  end if;
  if new.conversion_factor is null then
    new.conversion_factor := v_factor;
  end if;
  new.unit_price := round(coalesce(new.unit_price, 0), 2);
  return new;
end $$;

drop trigger if exists trg_po_items_before_insert on public.purchase_order_items;
create trigger trg_po_items_before_insert
  before insert on public.purchase_order_items
  for each row execute function public.trg_po_items_before_insert();

-- AFTER INSERT (spec #3): convert units, add stock, recompute weighted average
-- cost, write the ledger row, refresh PO total.
--   new_avg = (old_stock*old_avg + base_qty*import_cost) / (old_stock + base_qty)
--   if old_stock <= 0 -> new_avg = import_cost (giá nhập mới thay thế giá vốn cũ)
create or replace function public.trg_po_items_after_insert()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_stock        numeric(14,3);
  v_avg          numeric(14,4);
  v_base_qty     numeric(14,3);
  v_cost_base    numeric(14,4);
  v_new_avg      numeric(14,4);
  v_new_stock    numeric(14,3);
  v_po_number    text;
  v_po_date      date;
  v_txn_at       timestamptz;
begin
  select current_stock, avg_cost_price into v_stock, v_avg
    from public.ingredients where id = new.ingredient_id for update;

  v_base_qty  := new.base_quantity;
  v_cost_base := round(new.unit_price / new.conversion_factor, 4);

  if v_stock <= 0 or (v_stock + v_base_qty) <= 0 then
    v_new_avg := v_cost_base;
  else
    v_new_avg := round((v_stock * v_avg + v_base_qty * v_cost_base) / (v_stock + v_base_qty), 4);
  end if;
  v_new_stock := v_stock + v_base_qty;

  update public.ingredients
     set current_stock  = v_new_stock,
         avg_cost_price = v_new_avg
   where id = new.ingredient_id;

  select po_number, order_date into v_po_number, v_po_date from public.purchase_orders where id = new.purchase_order_id;
  -- ledger row dated at the PO's business date (09:00 local) when the PO is backdated
  v_txn_at := case when v_po_date is null or v_po_date >= public.to_local_date(now()) then now()
                   else public.local_day_start(v_po_date) + interval '9 hours' end;

  insert into public.inventory_transactions
    (ingredient_id, txn_type, quantity, unit_cost, stock_after, reference_type, reference_id, note, created_at)
  values
    (new.ingredient_id, 'purchase', v_base_qty, v_cost_base, v_new_stock, 'purchase_order_item', new.id,
     'Nhập hàng ' || coalesce(v_po_number, ''), v_txn_at);

  update public.purchase_orders
     set total_amount = (select coalesce(sum(line_total), 0) from public.purchase_order_items where purchase_order_id = new.purchase_order_id)
   where id = new.purchase_order_id;

  return new;
end $$;

drop trigger if exists trg_po_items_after_insert on public.purchase_order_items;
create trigger trg_po_items_after_insert
  after insert on public.purchase_order_items
  for each row execute function public.trg_po_items_after_insert();

-- AFTER DELETE: reverse the stock (avg cost is intentionally left unchanged),
-- write a negative 'purchase' ledger row, refresh PO total. Raises
-- INSUFFICIENT_STOCK if the stock would go negative (unless allowed).
create or replace function public.trg_po_items_after_delete()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_stock     numeric(14,3);
  v_name      text;
  v_new_stock numeric(14,3);
  v_po_number text;
begin
  select current_stock, name into v_stock, v_name
    from public.ingredients where id = old.ingredient_id for update;

  v_new_stock := v_stock - old.base_quantity;
  if v_new_stock < 0 and not public.app_setting_bool('allow_negative_stock', false) then
    raise exception 'INSUFFICIENT_STOCK: % (đã bán/xuất, không thể xóa dòng nhập)', v_name;
  end if;

  update public.ingredients set current_stock = v_new_stock where id = old.ingredient_id;

  select po_number into v_po_number from public.purchase_orders where id = old.purchase_order_id;

  insert into public.inventory_transactions
    (ingredient_id, txn_type, quantity, unit_cost, stock_after, reference_type, reference_id, note)
  values
    (old.ingredient_id, 'purchase', -old.base_quantity, round(old.unit_price / old.conversion_factor, 4), v_new_stock,
     'purchase_order_item', old.id, 'Xóa dòng nhập ' || coalesce(v_po_number, ''));

  -- PO may already be gone when the delete cascades from purchase_orders.
  update public.purchase_orders
     set total_amount = (select coalesce(sum(line_total), 0) from public.purchase_order_items where purchase_order_id = old.purchase_order_id)
   where id = old.purchase_order_id;

  return old;
end $$;

drop trigger if exists trg_po_items_after_delete on public.purchase_order_items;
create trigger trg_po_items_after_delete
  after delete on public.purchase_order_items
  for each row execute function public.trg_po_items_after_delete();

-- UPDATE of PO items is not allowed (delete + re-insert instead) to keep the ledger honest.
create or replace function public.trg_po_items_no_update()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'PO_ITEM_UPDATE_NOT_ALLOWED: delete the line and insert it again';
end $$;

drop trigger if exists trg_po_items_no_update on public.purchase_order_items;
create trigger trg_po_items_no_update
  before update on public.purchase_order_items
  for each row execute function public.trg_po_items_no_update();

-- -----------------------------------------------------------------------------
-- 10. SUPPLIER PAYMENTS & ALLOCATIONS  (sổ quỹ trả nợ NCC)
-- -----------------------------------------------------------------------------
create table if not exists public.supplier_payments (
  id                uuid primary key default gen_random_uuid(),
  supplier_id       uuid not null references public.suppliers (id),
  purchase_order_id uuid references public.purchase_orders (id),               -- đích danh PO (null = trừ dần FIFO)
  amount            numeric(14,2) not null check (amount > 0),
  payment_date      date not null default current_date,
  method            public.payment_method not null default 'cash',
  reference         text,
  note              text,
  created_by        uuid default auth.uid(),
  created_at        timestamptz not null default now()
);

create index if not exists idx_supplier_payments_supplier on public.supplier_payments (supplier_id, payment_date);
create index if not exists idx_supplier_payments_po on public.supplier_payments (purchase_order_id);

create table if not exists public.supplier_payment_allocations (
  id                uuid primary key default gen_random_uuid(),
  payment_id        uuid not null references public.supplier_payments (id) on delete cascade,
  purchase_order_id uuid not null references public.purchase_orders (id),
  amount            numeric(14,2) not null check (amount > 0),
  created_at        timestamptz not null default now()
);

create index if not exists idx_spa_payment on public.supplier_payment_allocations (payment_id);
create index if not exists idx_spa_po on public.supplier_payment_allocations (purchase_order_id);

-- Allocation rows move purchase_orders.paid_amount (which cascades to supplier debt).
create or replace function public.trg_spa_apply()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform 1 from public.purchase_orders where id = new.purchase_order_id for update;
    update public.purchase_orders set paid_amount = paid_amount + new.amount where id = new.purchase_order_id;
    return new;
  elsif tg_op = 'DELETE' then
    perform 1 from public.purchase_orders where id = old.purchase_order_id for update;
    update public.purchase_orders set paid_amount = paid_amount - old.amount where id = old.purchase_order_id;
    return old;
  end if;
  raise exception 'ALLOCATION_UPDATE_NOT_ALLOWED: allocations are immutable';
end $$;

drop trigger if exists trg_spa_apply on public.supplier_payment_allocations;
create trigger trg_spa_apply
  after insert or update or delete on public.supplier_payment_allocations
  for each row execute function public.trg_spa_apply();

-- AFTER INSERT (spec #2): allocate the payment.
--   * purchase_order_id set  -> đích danh: must be <= that PO's debt (PAYMENT_EXCEEDS_PO_DEBT)
--   * null                   -> FIFO over supplier POs with debt, by due_date, order_date, created_at
--                               (PAYMENT_EXCEEDS_DEBT if amount > total outstanding)
create or replace function public.trg_supplier_payments_after_insert()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_po_supplier uuid;
  v_po_debt     numeric(14,2);
  v_po_number   text;
  v_outstanding numeric(14,2);
  v_remaining   numeric(14,2);
  v_alloc       numeric(14,2);
  r             record;
begin
  perform 1 from public.suppliers where id = new.supplier_id for update;
  if not found then
    raise exception 'SUPPLIER_NOT_FOUND: %', new.supplier_id;
  end if;

  if new.purchase_order_id is not null then
    select supplier_id, debt_amount, po_number into v_po_supplier, v_po_debt, v_po_number
      from public.purchase_orders where id = new.purchase_order_id for update;
    if not found then
      raise exception 'PO_NOT_FOUND: %', new.purchase_order_id;
    end if;
    if v_po_supplier <> new.supplier_id then
      raise exception 'PO_SUPPLIER_MISMATCH: PO % does not belong to supplier %', v_po_number, new.supplier_id;
    end if;
    if new.amount > v_po_debt then
      raise exception 'PAYMENT_EXCEEDS_PO_DEBT: PO % còn nợ %, thanh toán %', v_po_number, v_po_debt, new.amount;
    end if;
    insert into public.supplier_payment_allocations (payment_id, purchase_order_id, amount)
    values (new.id, new.purchase_order_id, new.amount);
    return new;
  end if;

  select coalesce(sum(debt_amount), 0) into v_outstanding
    from public.purchase_orders where supplier_id = new.supplier_id and debt_amount > 0;
  if new.amount > v_outstanding then
    raise exception 'PAYMENT_EXCEEDS_DEBT: tổng nợ %, thanh toán %', v_outstanding, new.amount;
  end if;

  v_remaining := new.amount;
  for r in
    select id, debt_amount
      from public.purchase_orders
     where supplier_id = new.supplier_id and debt_amount > 0
     order by due_date, order_date, created_at
       for update
  loop
    exit when v_remaining <= 0;
    v_alloc := least(r.debt_amount, v_remaining);
    insert into public.supplier_payment_allocations (payment_id, purchase_order_id, amount)
    values (new.id, r.id, v_alloc);
    v_remaining := v_remaining - v_alloc;
  end loop;

  if v_remaining > 0 then
    raise exception 'PAYMENT_EXCEEDS_DEBT: could not allocate %', v_remaining;
  end if;
  return new;
end $$;

drop trigger if exists trg_supplier_payments_after_insert on public.supplier_payments;
create trigger trg_supplier_payments_after_insert
  after insert on public.supplier_payments
  for each row execute function public.trg_supplier_payments_after_insert();

-- Financial fields of a payment are immutable (delete the payment to reverse it).
create or replace function public.trg_supplier_payments_before_update()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.amount <> old.amount
     or new.supplier_id <> old.supplier_id
     or new.purchase_order_id is distinct from old.purchase_order_id then
    raise exception 'PAYMENT_UPDATE_NOT_ALLOWED: delete the payment and record it again';
  end if;
  return new;
end $$;

drop trigger if exists trg_supplier_payments_before_update on public.supplier_payments;
create trigger trg_supplier_payments_before_update
  before update on public.supplier_payments
  for each row execute function public.trg_supplier_payments_before_update();

-- -----------------------------------------------------------------------------
-- 11. EMPLOYEES & TIMEKEEPING  (nhân sự & chấm công)
-- -----------------------------------------------------------------------------
create table if not exists public.employees (
  id                      uuid primary key default gen_random_uuid(),
  code                    text unique,
  full_name               text not null,
  phone                   text,
  email                   text,
  position                text,
  employment_type         public.employment_type not null default 'full_time',
  base_salary             numeric(14,2) not null default 0 check (base_salary >= 0),     -- lương tháng (FT)
  hourly_rate             numeric(14,2) not null default 0 check (hourly_rate >= 0),     -- lương giờ (PT)
  allowance               numeric(14,2) not null default 0 check (allowance >= 0),       -- phụ cấp tháng (FT)
  standard_days_per_month int not null default 26 check (standard_days_per_month > 0),
  start_date              date,
  end_date                date,
  bank_account            text,
  is_active               boolean not null default true,
  note                    text,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

drop trigger if exists trg_employees_updated_at on public.employees;
create trigger trg_employees_updated_at
  before update on public.employees
  for each row execute function public.set_updated_at();

create table if not exists public.timekeeping (
  id           uuid primary key default gen_random_uuid(),
  employee_id  uuid not null references public.employees (id) on delete cascade,
  work_date    date not null,
  shift        text,                                                 -- 'Sáng' | 'Chiều' | 'Tối' | 'Full' ...
  check_in     time,
  check_out    time,
  hours_worked numeric(6,2) not null check (hours_worked >= 0),      -- computed from check_in/out when null
  note         text,
  created_by   uuid default auth.uid(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique nulls not distinct (employee_id, work_date, shift)
);

create index if not exists idx_timekeeping_employee_date on public.timekeeping (employee_id, work_date);
create index if not exists idx_timekeeping_work_date on public.timekeeping (work_date);

-- BEFORE INSERT/UPDATE: derive hours_worked from check_in/check_out (overnight-aware).
create or replace function public.trg_timekeeping_before()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_minutes numeric;
begin
  if new.hours_worked is null
     or (tg_op = 'UPDATE' and (new.check_in is distinct from old.check_in or new.check_out is distinct from old.check_out)
         and new.hours_worked = old.hours_worked) then
    if new.check_in is not null and new.check_out is not null then
      v_minutes := extract(epoch from (new.check_out - new.check_in)) / 60;
      if v_minutes < 0 then
        v_minutes := v_minutes + 24 * 60;      -- ca qua đêm
      end if;
      new.hours_worked := round(v_minutes / 60, 2);
    end if;
  end if;
  if new.hours_worked is null then
    raise exception 'HOURS_REQUIRED: provide hours_worked or both check_in and check_out';
  end if;
  if tg_op = 'UPDATE' then
    new.updated_at := now();
  end if;
  return new;
end $$;

drop trigger if exists trg_timekeeping_before on public.timekeeping;
create trigger trg_timekeeping_before
  before insert or update on public.timekeeping
  for each row execute function public.trg_timekeeping_before();

-- -----------------------------------------------------------------------------
-- 12. PAYROLL  (kỳ lương & bảng lương)
-- -----------------------------------------------------------------------------
create table if not exists public.payroll_periods (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  period_start   date not null,
  period_end     date not null,
  status         public.payroll_status not null default 'draft',
  total_net_pay  numeric(14,2) not null default 0,                 -- MAINTAINED = sum(items.net_pay)
  finalized_at   timestamptz,
  paid_at        timestamptz,
  payment_method public.payment_method,
  note           text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  check (period_end >= period_start),
  unique (period_start, period_end)
);

create index if not exists idx_payroll_periods_dates on public.payroll_periods (period_start, period_end);

-- Status machine: draft <-> finalized -> paid. 'paid' is terminal.
create or replace function public.trg_payroll_periods_before_update()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.status = 'paid' and new.status <> 'paid' then
    raise exception 'PAYROLL_PERIOD_PAID: a paid period cannot be changed';
  end if;
  if new.status = 'paid' and old.status <> 'paid' then
    if old.status <> 'finalized' then
      raise exception 'PAYROLL_NOT_FINALIZED: finalize the period before paying it';
    end if;
    new.paid_at := coalesce(new.paid_at, now());
  end if;
  if new.status = 'finalized' and old.status = 'draft' then
    new.finalized_at := coalesce(new.finalized_at, now());
  end if;
  if new.status = 'draft' and old.status = 'finalized' then
    new.finalized_at := null;
  end if;
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists trg_payroll_periods_before_update on public.payroll_periods;
create trigger trg_payroll_periods_before_update
  before update on public.payroll_periods
  for each row execute function public.trg_payroll_periods_before_update();

create table if not exists public.payroll_items (
  id                uuid primary key default gen_random_uuid(),
  payroll_period_id uuid not null references public.payroll_periods (id) on delete cascade,
  employee_id       uuid not null references public.employees (id),
  employment_type   public.employment_type not null,                 -- snapshot
  total_hours       numeric(8,2) not null default 0,
  total_days        numeric(6,2) not null default 0,
  base_pay          numeric(14,2) not null default 0,
  allowance         numeric(14,2) not null default 0,
  bonus             numeric(14,2) not null default 0,
  tips              numeric(14,2) not null default 0,
  advance_deduction numeric(14,2) not null default 0,
  penalty           numeric(14,2) not null default 0,
  net_pay           numeric(14,2) generated always as (base_pay + allowance + bonus + tips - advance_deduction - penalty) stored,
  is_paid           boolean not null default false,
  paid_at           timestamptz,
  note              text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (payroll_period_id, employee_id)
);

create index if not exists idx_payroll_items_period on public.payroll_items (payroll_period_id);
create index if not exists idx_payroll_items_employee on public.payroll_items (employee_id);

-- Items may only change while the period is 'draft' (pay_payroll unlocks via a
-- transaction-local setting app.payroll_unlock = 'on').
create or replace function public.trg_payroll_items_guard()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_period uuid := case when tg_op = 'DELETE' then old.payroll_period_id else new.payroll_period_id end;
  v_status public.payroll_status;
begin
  select status into v_status from public.payroll_periods where id = v_period;
  if v_status is null then
    -- period is being deleted (cascade) or does not exist; FK handles the latter
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if v_status <> 'draft' and coalesce(current_setting('app.payroll_unlock', true), '') <> 'on' then
    raise exception 'PAYROLL_PERIOD_LOCKED: period is %, items can only be edited in draft', v_status;
  end if;
  if tg_op = 'UPDATE' then
    new.updated_at := now();
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;

drop trigger if exists trg_payroll_items_guard on public.payroll_items;
create trigger trg_payroll_items_guard
  before insert or update or delete on public.payroll_items
  for each row execute function public.trg_payroll_items_guard();

-- Keep payroll_periods.total_net_pay in sync.
create or replace function public.trg_payroll_items_sync_total()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_period uuid := case when tg_op = 'DELETE' then old.payroll_period_id else new.payroll_period_id end;
begin
  update public.payroll_periods p
     set total_net_pay = (select coalesce(sum(net_pay), 0) from public.payroll_items where payroll_period_id = v_period)
   where p.id = v_period;
  return null;
end $$;

drop trigger if exists trg_payroll_items_sync_total on public.payroll_items;
create trigger trg_payroll_items_sync_total
  after insert or update or delete on public.payroll_items
  for each row execute function public.trg_payroll_items_sync_total();

-- -----------------------------------------------------------------------------
-- 13. EXPENSES  (chi phí cố định & vận hành)
-- -----------------------------------------------------------------------------
create table if not exists public.expense_categories (
  id           uuid primary key default gen_random_uuid(),
  name         text not null unique,
  expense_type public.expense_type not null default 'variable',
  description  text,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now()
);

create table if not exists public.expense_records (
  id             uuid primary key default gen_random_uuid(),
  category_id    uuid not null references public.expense_categories (id),
  title          text not null,
  amount         numeric(14,2) not null default 0 check (amount >= 0),
  expense_date   date not null default current_date,
  status         public.expense_status not null default 'pending',
  payment_method public.payment_method,
  paid_at        timestamptz,
  vendor         text,
  invoice_number text,
  attachment_url text,
  note           text,
  created_by     uuid default auth.uid(),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists idx_expense_records_date on public.expense_records (expense_date);
create index if not exists idx_expense_records_category on public.expense_records (category_id);
create index if not exists idx_expense_records_status on public.expense_records (status);

create or replace function public.trg_expense_records_before()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status = 'paid' and new.paid_at is null then
    new.paid_at := now();
  end if;
  if new.status = 'pending' then
    new.paid_at := null;
  end if;
  if tg_op = 'UPDATE' then
    new.updated_at := now();
  end if;
  return new;
end $$;

drop trigger if exists trg_expense_records_before on public.expense_records;
create trigger trg_expense_records_before
  before insert or update on public.expense_records
  for each row execute function public.trg_expense_records_before();

-- -----------------------------------------------------------------------------
-- 14. ORDERS & ORDER ITEMS  (đơn bán hàng)
-- -----------------------------------------------------------------------------
create table if not exists public.orders (
  id             uuid primary key default gen_random_uuid(),
  order_number   text unique,                                              -- auto 'ORD-yyyymmdd-0001' (local date of order_date)
  order_date     timestamptz not null default now(),
  status         public.order_status not null default 'completed',
  table_number   text,
  subtotal       numeric(14,2) not null default 0,                         -- MAINTAINED = sum(items.line_total)
  discount       numeric(14,2) not null default 0 check (discount >= 0),
  total_amount   numeric(14,2) not null default 0,                         -- MAINTAINED = subtotal - discount
  total_cogs     numeric(14,2) not null default 0,                         -- MAINTAINED = sum(items.cogs_amount)
  payment_method public.payment_method not null default 'cash',
  note           text,
  created_by     uuid default auth.uid(),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists idx_orders_date_status on public.orders (order_date, status);

create or replace function public.next_order_number(p_date date default current_date)
returns text
language plpgsql
set search_path = public
as $$
declare
  v_prefix text := 'ORD-' || to_char(p_date, 'YYYYMMDD') || '-';
  v_seq    int;
begin
  perform pg_advisory_xact_lock(hashtext('order_number'), hashtext(v_prefix));
  select coalesce(max(substring(order_number from length(v_prefix) + 1)::int), 0) + 1
    into v_seq
    from public.orders
   where order_number like v_prefix || '%'
     and substring(order_number from length(v_prefix) + 1) ~ '^[0-9]+$';
  return v_prefix || lpad(v_seq::text, 4, '0');
end $$;

create or replace function public.trg_orders_before()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.order_date is null then
      new.order_date := now();
    end if;
    if new.order_number is null or new.order_number = '' then
      new.order_number := public.next_order_number(public.to_local_date(new.order_date));
    end if;
  else
    if old.status = 'cancelled' and new.status = 'completed' then
      raise exception 'ORDER_CANCEL_IRREVERSIBLE: a cancelled order cannot be completed again';
    end if;
    new.updated_at := now();
  end if;
  new.subtotal     := round(coalesce(new.subtotal, 0), 2);
  new.discount     := round(coalesce(new.discount, 0), 2);
  new.total_amount := new.subtotal - new.discount;
  new.total_cogs   := round(coalesce(new.total_cogs, 0), 2);
  return new;
end $$;

drop trigger if exists trg_orders_before on public.orders;
create trigger trg_orders_before
  before insert or update on public.orders
  for each row execute function public.trg_orders_before();

create table if not exists public.order_items (
  id             uuid primary key default gen_random_uuid(),
  order_id       uuid not null references public.orders (id) on delete cascade,
  menu_item_id   uuid not null references public.menu_items (id),
  menu_item_name text not null,                                            -- snapshot
  quantity       numeric(10,2) not null check (quantity > 0),
  unit_price     numeric(14,2) not null check (unit_price >= 0),           -- snapshot
  line_total     numeric(14,2) generated always as (round(quantity * unit_price, 2)) stored,
  cogs_amount    numeric(14,2) not null default 0,                         -- MAINTAINED = actual cost of deducted ingredients
  created_at     timestamptz not null default now()
);

create index if not exists idx_order_items_order on public.order_items (order_id);
create index if not exists idx_order_items_menu_item on public.order_items (menu_item_id);

-- AFTER INSERT ("trừ kho khi bán"): for a completed order, deduct every recipe
-- line: qty_out = recipe.quantity * (1 + waste_percent/100) * item.quantity,
-- ledger row 'sale' at current avg cost; cogs_amount = sum of ledger total_cost.
create or replace function public.trg_order_items_after_insert()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_status       public.order_status;
  v_order_number text;
  v_order_date   timestamptz;
  v_cogs         numeric(14,2) := 0;
  v_line_cost    numeric(14,2);
  r              record;
begin
  select status, order_number, order_date into v_status, v_order_number, v_order_date
    from public.orders where id = new.order_id for update;
  if not found then
    raise exception 'ORDER_NOT_FOUND: %', new.order_id;
  end if;

  if v_status = 'completed' then
    for r in
      select rc.ingredient_id,
             round(rc.quantity * (1 + coalesce(rc.waste_percent, 0) / 100) * new.quantity, 3) as qty_out
        from public.recipes rc
       where rc.menu_item_id = new.menu_item_id
    loop
      if r.qty_out <= 0 then
        continue;
      end if;
      -- ledger row is dated at the order's business time (order_date), see docs
      insert into public.inventory_transactions
        (ingredient_id, txn_type, quantity, reference_type, reference_id, note, created_at)
      values
        (r.ingredient_id, 'sale', -r.qty_out, 'order_item', new.id, 'Bán ' || coalesce(v_order_number, '') || ' - ' || new.menu_item_name,
         coalesce(v_order_date, now()))
      returning total_cost into v_line_cost;
      v_cogs := v_cogs + coalesce(v_line_cost, 0);
    end loop;

    -- Set cogs on the row we just inserted (no UPDATE trigger recursion: the
    -- immutability guard below allows this via the transaction-local flag).
    perform set_config('app.order_items_unlock', 'on', true);
    update public.order_items set cogs_amount = v_cogs where id = new.id;
    perform set_config('app.order_items_unlock', 'off', true);
  end if;

  update public.orders o
     set subtotal   = (select coalesce(sum(line_total), 0) from public.order_items where order_id = new.order_id),
         total_cogs = (select coalesce(sum(cogs_amount), 0) from public.order_items where order_id = new.order_id)
   where o.id = new.order_id;

  return new;
end $$;

drop trigger if exists trg_order_items_after_insert on public.order_items;
create trigger trg_order_items_after_insert
  after insert on public.order_items
  for each row execute function public.trg_order_items_after_insert();

-- Order lines are immutable once written (stock has already moved). Cancel the order instead.
create or replace function public.trg_order_items_immutable()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if coalesce(current_setting('app.order_items_unlock', true), '') = 'on' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  raise exception 'ORDER_ITEMS_IMMUTABLE: order lines cannot be updated or deleted; cancel the order instead';
end $$;

drop trigger if exists trg_order_items_immutable on public.order_items;
create trigger trg_order_items_immutable
  before update or delete on public.order_items
  for each row execute function public.trg_order_items_immutable();

-- AFTER UPDATE completed -> cancelled: return stock with 'sale_reversal' rows that
-- mirror the original 'sale' rows (same quantity and unit cost). Order totals are kept.
create or replace function public.trg_orders_after_cancel()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  r record;
begin
  if old.status = 'completed' and new.status = 'cancelled' then
    for r in
      select it.ingredient_id, it.quantity, it.unit_cost, it.reference_id
        from public.inventory_transactions it
        join public.order_items oi on oi.id = it.reference_id
       where it.reference_type = 'order_item'
         and it.txn_type = 'sale'
         and oi.order_id = new.id
       order by it.created_at, it.id
    loop
      insert into public.inventory_transactions
        (ingredient_id, txn_type, quantity, unit_cost, reference_type, reference_id, note)
      values
        (r.ingredient_id, 'sale_reversal', -r.quantity, r.unit_cost, 'order_item', r.reference_id,
         'Hủy đơn ' || coalesce(new.order_number, ''));
    end loop;
  end if;
  return null;
end $$;

drop trigger if exists trg_orders_after_cancel on public.orders;
create trigger trg_orders_after_cancel
  after update of status on public.orders
  for each row execute function public.trg_orders_after_cancel();

-- -----------------------------------------------------------------------------
-- 15. VIEWS  (security_invoker: RLS of the caller applies)
-- -----------------------------------------------------------------------------

-- Recipe lines with live cost. Component_Cost = qty * (1 + waste%) * avg_cost.
create or replace view public.v_recipe_costs
with (security_invoker = true) as
select
  r.id,
  r.menu_item_id,
  r.ingredient_id,
  i.code                                        as ingredient_code,
  i.name                                        as ingredient_name,
  i.category                                    as ingredient_category,
  i.base_unit,
  i.avg_cost_price,
  r.quantity,
  r.waste_percent,
  round(r.quantity * (1 + r.waste_percent / 100), 3)                          as effective_quantity,
  round(r.quantity * (1 + r.waste_percent / 100) * i.avg_cost_price, 2)       as component_cost,
  r.note,
  r.created_at,
  r.updated_at
from public.recipes r
join public.ingredients i on i.id = r.ingredient_id;

-- Per menu item: ideal cost, contribution margin, food cost %.
create or replace view public.v_menu_item_costs
with (security_invoker = true) as
select
  m.id,
  m.code,
  m.name,
  m.category,
  m.selling_price,
  m.is_active,
  m.image_url,
  coalesce(c.ideal_cost, 0)                                                   as ideal_cost,
  m.selling_price - coalesce(c.ideal_cost, 0)                                 as contribution_margin,
  case when m.selling_price > 0
       then round(coalesce(c.ideal_cost, 0) / m.selling_price * 100, 2)
       else null end                                                          as food_cost_pct,
  coalesce(c.ingredient_count, 0)::int                                        as ingredient_count,
  (coalesce(c.ingredient_count, 0) = 0)                                       as missing_recipe,
  m.created_at,
  m.updated_at
from public.menu_items m
left join (
  select menu_item_id, sum(component_cost) as ideal_cost, count(*) as ingredient_count
    from public.v_recipe_costs
   group by menu_item_id
) c on c.menu_item_id = m.id;

-- Menu engineering (Kasavana-Smith), last 30 days of completed orders.
--   popularity_share = qty_sold / total qty sold
--   popular    : popularity_share >= 0.7 * (1 / N), N = number of active items with sales in the window
--   profitable : avg_cm >= weighted average CM of all units sold
--                (items with no sales use their current contribution margin)
--   class      : star (popular+profitable) / plowhorse (popular) / puzzle (profitable) / dog
-- Includes every active menu item (zero-sales items become puzzle or dog).
create or replace view public.v_menu_engineering
with (security_invoker = true) as
with sales as (
  select oi.menu_item_id,
         sum(oi.quantity)                                          as qty_sold,
         sum(oi.line_total)                                        as revenue,
         sum(oi.quantity * oi.unit_price)                          as gross_unit_revenue
    from public.order_items oi
    join public.orders o on o.id = oi.order_id
   where o.status = 'completed'
     and o.order_date >= now() - interval '30 days'
   group by oi.menu_item_id
),
base as (
  select mc.id, mc.code, mc.name, mc.category, mc.selling_price, mc.ideal_cost, mc.contribution_margin, mc.food_cost_pct, mc.missing_recipe,
         coalesce(s.qty_sold, 0)                                   as qty_sold,
         coalesce(s.revenue, 0)                                    as revenue,
         coalesce(s.gross_unit_revenue, 0) - coalesce(s.qty_sold, 0) * mc.ideal_cost as total_cm
    from public.v_menu_item_costs mc
    left join sales s on s.menu_item_id = mc.id
   where mc.is_active
),
agg as (
  select sum(qty_sold)                                             as total_qty,
         count(*) filter (where qty_sold > 0)                      as n_sold,
         case when sum(qty_sold) > 0 then sum(total_cm) / sum(qty_sold) else null end as avg_cm_all
    from base
),
scored as (
  select b.*,
         a.total_qty,
         a.n_sold,
         round(a.avg_cm_all, 2)                                    as benchmark_cm,
         case when a.total_qty > 0 then round(b.qty_sold / a.total_qty, 4) else 0 end as popularity_share,
         case when a.n_sold > 0 then round(0.7 / a.n_sold, 4) else null end          as popularity_threshold,
         case when b.qty_sold > 0 then round(b.total_cm / b.qty_sold, 2) else b.contribution_margin end as avg_cm
    from base b cross join agg a
)
select
  s.id, s.code, s.name, s.category, s.selling_price, s.ideal_cost, s.contribution_margin, s.food_cost_pct, s.missing_recipe,
  s.qty_sold,
  s.revenue,
  round(s.total_cm, 2)                                             as total_cm,
  s.avg_cm,
  s.popularity_share,
  s.popularity_threshold,
  s.benchmark_cm,
  (s.qty_sold > 0 and s.popularity_threshold is not null and s.popularity_share >= s.popularity_threshold) as is_popular,
  (s.benchmark_cm is not null and s.avg_cm >= s.benchmark_cm)     as is_profitable,
  case
    when (s.qty_sold > 0 and s.popularity_share >= coalesce(s.popularity_threshold, 1)) and (s.avg_cm >= coalesce(s.benchmark_cm, 0)) then 'star'::public.menu_class
    when (s.qty_sold > 0 and s.popularity_share >= coalesce(s.popularity_threshold, 1))                                             then 'plowhorse'::public.menu_class
    when (s.avg_cm >= coalesce(s.benchmark_cm, 0))                                                                                   then 'puzzle'::public.menu_class
    else 'dog'::public.menu_class
  end                                                              as menu_class
from scored s;

-- Inventory status with value and low-stock flag.
create or replace view public.v_inventory_status
with (security_invoker = true) as
select
  i.id, i.code, i.name, i.category, i.base_unit, i.import_unit, i.conversion_factor,
  i.current_stock,
  i.avg_cost_price,
  i.min_alert_stock,
  round(i.current_stock * i.avg_cost_price, 2)                     as stock_value,
  (i.current_stock < i.min_alert_stock)                            as is_below_min,
  round(i.current_stock / i.conversion_factor, 3)                  as stock_in_import_units,
  round(i.avg_cost_price * i.conversion_factor, 2)                 as avg_cost_per_import_unit,
  i.default_supplier_id,
  s.name                                                           as default_supplier_name,
  i.is_active,
  i.note,
  i.created_at,
  i.updated_at
from public.ingredients i
left join public.suppliers s on s.id = i.default_supplier_id;

-- Supplier debt summary.
create or replace view public.v_supplier_debt_summary
with (security_invoker = true) as
select
  s.id, s.code, s.name, s.phone, s.payment_terms_days, s.is_active,
  s.current_debt,
  count(po.id)::int                                                                as po_count,
  count(po.id) filter (where po.debt_amount > 0)::int                              as unpaid_po_count,
  coalesce(sum(po.total_amount), 0)                                                as total_purchased,
  coalesce(sum(po.paid_amount), 0)                                                 as total_paid,
  coalesce(sum(po.debt_amount) filter (where po.debt_amount > 0 and po.due_date < current_date), 0) as overdue_debt,
  count(po.id) filter (where po.debt_amount > 0 and po.due_date < current_date)::int as overdue_po_count,
  min(po.due_date) filter (where po.debt_amount > 0)                               as next_due_date,
  max(po.order_date)                                                               as last_order_date
from public.suppliers s
left join public.purchase_orders po on po.supplier_id = s.id
group by s.id;

-- PO list with supplier name, item count and overdue flag.
create or replace view public.v_purchase_orders_summary
with (security_invoker = true) as
select
  po.id, po.po_number, po.supplier_id,
  s.name                                                           as supplier_name,
  s.code                                                           as supplier_code,
  po.order_date, po.due_date, po.total_amount, po.paid_amount, po.debt_amount, po.payment_status,
  po.invoice_number, po.note, po.created_by, po.created_at, po.updated_at,
  (select count(*)::int from public.purchase_order_items i where i.purchase_order_id = po.id) as item_count,
  (po.debt_amount > 0 and po.due_date < current_date)              as is_overdue,
  case when po.debt_amount > 0 and po.due_date < current_date then (current_date - po.due_date) else 0 end as days_overdue
from public.purchase_orders po
join public.suppliers s on s.id = po.supplier_id;

-- Daily sales (completed orders only), bucketed by the restaurant's local date.
create or replace view public.v_daily_sales
with (security_invoker = true) as
select
  public.to_local_date(o.order_date)                               as sales_date,
  count(*)::int                                                    as order_count,
  coalesce(sum(o.total_amount), 0)                                 as revenue,
  coalesce(sum(o.discount), 0)                                     as discount_total,
  coalesce(sum(o.total_cogs), 0)                                   as cogs,
  coalesce(sum(o.total_amount), 0) - coalesce(sum(o.total_cogs), 0) as gross_profit,
  case when sum(o.total_amount) > 0
       then round((sum(o.total_amount) - sum(o.total_cogs)) / sum(o.total_amount) * 100, 2)
       else null end                                               as gross_margin_pct,
  case when count(*) > 0 then round(sum(o.total_amount) / count(*), 2) else 0 end as avg_order_value
from public.orders o
where o.status = 'completed'
group by public.to_local_date(o.order_date);

-- -----------------------------------------------------------------------------
-- 16. RPC FUNCTIONS  (nghiệp vụ nhiều bước, atomic)
-- -----------------------------------------------------------------------------

-- Create a purchase order with its lines (+ optional immediate payment).
-- p_items: [{ingredient_id, quantity, unit_price, conversion_factor?, unit?}]
create or replace function public.create_purchase_order(
  p_supplier_id    uuid,
  p_order_date     date,
  p_due_date       date,
  p_invoice_number text,
  p_note           text,
  p_items          jsonb,
  p_paid_now       numeric default 0,
  p_paid_method    public.payment_method default 'cash'
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

  insert into public.purchase_orders (supplier_id, order_date, due_date, invoice_number, note)
  values (p_supplier_id, coalesce(p_order_date, current_date), p_due_date, p_invoice_number, p_note)
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
    values (p_supplier_id, v_po_id, round(p_paid_now, 2), coalesce(p_order_date, current_date), coalesce(p_paid_method, 'cash'), 'Trả ngay khi nhập hàng');
  end if;

  return v_po_id;
end $$;

-- Record a supplier payment (đích danh PO when p_purchase_order_id is given, else FIFO).
create or replace function public.record_supplier_payment(
  p_supplier_id       uuid,
  p_amount            numeric,
  p_payment_date      date,
  p_method            public.payment_method,
  p_purchase_order_id uuid default null,
  p_reference         text default null,
  p_note              text default null
)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_id uuid;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'INVALID_AMOUNT: amount must be > 0';
  end if;
  insert into public.supplier_payments (supplier_id, purchase_order_id, amount, payment_date, method, reference, note)
  values (p_supplier_id, p_purchase_order_id, round(p_amount, 2), coalesce(p_payment_date, current_date), coalesce(p_method, 'cash'), p_reference, p_note)
  returning id into v_id;
  return v_id;
end $$;

-- Create a completed sales order. p_items: [{menu_item_id, quantity}]
create or replace function public.create_order(
  p_items          jsonb,
  p_order_date     timestamptz default now(),
  p_table_number   text default null,
  p_discount       numeric default 0,
  p_payment_method public.payment_method default 'cash',
  p_note           text default null
)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_order_id uuid;
  v_item     jsonb;
  v_mi_id    uuid;
  v_qty      numeric;
  v_name     text;
  v_price    numeric(14,2);
  v_active   boolean;
  v_subtotal numeric(14,2);
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'ORDER_ITEMS_REQUIRED: at least one line is required';
  end if;
  if coalesce(p_discount, 0) < 0 then
    raise exception 'INVALID_AMOUNT: discount cannot be negative';
  end if;

  insert into public.orders (order_date, status, table_number, discount, payment_method, note)
  values (coalesce(p_order_date, now()), 'completed', p_table_number, round(coalesce(p_discount, 0), 2), coalesce(p_payment_method, 'cash'), p_note)
  returning id into v_order_id;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_mi_id := nullif(v_item ->> 'menu_item_id', '')::uuid;
    v_qty   := nullif(v_item ->> 'quantity', '')::numeric;

    select name, selling_price, is_active into v_name, v_price, v_active
      from public.menu_items where id = v_mi_id;
    if not found then
      raise exception 'MENU_ITEM_NOT_FOUND: %', coalesce(v_item ->> 'menu_item_id', 'null');
    end if;
    if not v_active then
      raise exception 'MENU_ITEM_INACTIVE: %', v_name;
    end if;
    if v_qty is null or v_qty <= 0 then
      raise exception 'INVALID_QUANTITY: quantity must be > 0 (%)', v_name;
    end if;

    insert into public.order_items (order_id, menu_item_id, menu_item_name, quantity, unit_price)
    values (v_order_id, v_mi_id, v_name, v_qty, v_price);
  end loop;

  select subtotal into v_subtotal from public.orders where id = v_order_id;
  if round(coalesce(p_discount, 0), 2) > v_subtotal then
    raise exception 'DISCOUNT_EXCEEDS_SUBTOTAL: discount % > subtotal %', p_discount, v_subtotal;
  end if;

  return v_order_id;
end $$;

-- Cancel a completed order (stock is returned by trigger; totals are kept for audit).
create or replace function public.cancel_order(p_order_id uuid)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_status public.order_status;
begin
  select status into v_status from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'ORDER_NOT_FOUND: %', p_order_id;
  end if;
  if v_status = 'cancelled' then
    raise exception 'ORDER_ALREADY_CANCELLED: %', p_order_id;
  end if;
  update public.orders set status = 'cancelled' where id = p_order_id;
end $$;

-- Manual stock movement.
--   waste     : p_quantity = amount wasted (> 0)             -> ledger -p_quantity
--   adjustment: p_quantity = signed delta (<> 0)             -> ledger p_quantity
--   stocktake : p_quantity = COUNTED stock (>= 0)            -> ledger (counted - current_stock)
-- Returns the inventory_transactions id.
create or replace function public.record_stock_adjustment(
  p_ingredient_id uuid,
  p_txn_type      public.inventory_txn_type,
  p_quantity      numeric,
  p_note          text default null
)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_stock numeric(14,3);
  v_delta numeric(14,3);
  v_id    uuid;
begin
  if p_txn_type not in ('waste', 'adjustment', 'stocktake') then
    raise exception 'INVALID_TXN_TYPE: % (allowed: waste, adjustment, stocktake)', p_txn_type;
  end if;
  if p_quantity is null then
    raise exception 'INVALID_QUANTITY: quantity is required';
  end if;

  select current_stock into v_stock from public.ingredients where id = p_ingredient_id for update;
  if not found then
    raise exception 'INGREDIENT_NOT_FOUND: %', p_ingredient_id;
  end if;

  if p_txn_type = 'waste' then
    if p_quantity <= 0 then
      raise exception 'INVALID_QUANTITY: waste quantity must be > 0';
    end if;
    v_delta := -round(p_quantity, 3);
  elsif p_txn_type = 'adjustment' then
    if p_quantity = 0 then
      raise exception 'INVALID_QUANTITY: adjustment quantity must not be 0';
    end if;
    v_delta := round(p_quantity, 3);
  else
    if p_quantity < 0 then
      raise exception 'INVALID_QUANTITY: counted stock must be >= 0';
    end if;
    v_delta := round(p_quantity, 3) - v_stock;
  end if;

  insert into public.inventory_transactions (ingredient_id, txn_type, quantity, reference_type, note)
  values (p_ingredient_id, p_txn_type, v_delta, 'manual',
          case when p_txn_type = 'stocktake'
               then coalesce(p_note || ' | ', '') || 'Kiểm kê: đếm ' || round(p_quantity, 3) || ', sổ ' || v_stock
               else p_note end)
  returning id into v_id;
  return v_id;
end $$;

-- (Re)build payroll items for a draft period. Manual bonus/tips/advance/penalty are preserved.
--   FT: base_pay = min(base_salary, base_salary / standard_days * total_days); allowance prorated the same way
--   PT: base_pay = hourly_rate * total_hours; allowance = 0
--   total_days = count(distinct work_date), total_hours = sum(hours_worked) within the period
create or replace function public.generate_payroll(p_period_id uuid)
returns setof public.payroll_items
language plpgsql
set search_path = public
as $$
declare
  v_period public.payroll_periods%rowtype;
  e        record;
  v_days   numeric(6,2);
  v_hours  numeric(8,2);
  v_base   numeric(14,2);
  v_allow  numeric(14,2);
  v_std    int;
begin
  select * into v_period from public.payroll_periods where id = p_period_id for update;
  if not found then
    raise exception 'PAYROLL_PERIOD_NOT_FOUND: %', p_period_id;
  end if;
  if v_period.status <> 'draft' then
    raise exception 'PAYROLL_PERIOD_LOCKED: period is %', v_period.status;
  end if;

  for e in
    select *
      from public.employees
     where is_active
       and (start_date is null or start_date <= v_period.period_end)
       and (end_date is null or end_date >= v_period.period_start)
     order by code, full_name
  loop
    select coalesce(count(distinct work_date), 0), coalesce(sum(hours_worked), 0)
      into v_days, v_hours
      from public.timekeeping
     where employee_id = e.id
       and work_date between v_period.period_start and v_period.period_end;

    v_std := coalesce(nullif(e.standard_days_per_month, 0), 26);

    if e.employment_type = 'full_time' then
      v_base  := round(least(e.base_salary, e.base_salary / v_std * v_days), 2);
      v_allow := round(least(e.allowance,   e.allowance   / v_std * v_days), 2);
    else
      v_base  := round(e.hourly_rate * v_hours, 2);
      v_allow := 0;
    end if;

    insert into public.payroll_items (payroll_period_id, employee_id, employment_type, total_hours, total_days, base_pay, allowance)
    values (p_period_id, e.id, e.employment_type, v_hours, v_days, v_base, v_allow)
    on conflict (payroll_period_id, employee_id) do update
      set employment_type = excluded.employment_type,
          total_hours     = excluded.total_hours,
          total_days      = excluded.total_days,
          base_pay        = excluded.base_pay,
          allowance       = excluded.allowance,
          updated_at      = now();
  end loop;

  -- Drop rows of employees that are no longer eligible (inactive / outside dates).
  delete from public.payroll_items pi
   where pi.payroll_period_id = p_period_id
     and not exists (
       select 1 from public.employees em
        where em.id = pi.employee_id
          and em.is_active
          and (em.start_date is null or em.start_date <= v_period.period_end)
          and (em.end_date is null or em.end_date >= v_period.period_start));

  return query
    select * from public.payroll_items where payroll_period_id = p_period_id order by created_at;
end $$;

create or replace function public.finalize_payroll(p_period_id uuid)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_status public.payroll_status;
begin
  select status into v_status from public.payroll_periods where id = p_period_id for update;
  if not found then
    raise exception 'PAYROLL_PERIOD_NOT_FOUND: %', p_period_id;
  end if;
  if v_status <> 'draft' then
    raise exception 'PAYROLL_PERIOD_LOCKED: period is %', v_status;
  end if;
  if not exists (select 1 from public.payroll_items where payroll_period_id = p_period_id) then
    raise exception 'PAYROLL_NO_ITEMS: generate the payroll first';
  end if;
  update public.payroll_periods set status = 'finalized', finalized_at = now() where id = p_period_id;
end $$;

create or replace function public.pay_payroll(
  p_period_id uuid,
  p_method    public.payment_method default 'bank_transfer',
  p_paid_at   timestamptz default now()
)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_status public.payroll_status;
begin
  select status into v_status from public.payroll_periods where id = p_period_id for update;
  if not found then
    raise exception 'PAYROLL_PERIOD_NOT_FOUND: %', p_period_id;
  end if;
  if v_status = 'paid' then
    raise exception 'PAYROLL_PERIOD_PAID: period already paid';
  end if;
  if v_status <> 'finalized' then
    raise exception 'PAYROLL_NOT_FINALIZED: finalize the period before paying it';
  end if;

  perform set_config('app.payroll_unlock', 'on', true);
  update public.payroll_items
     set is_paid = true, paid_at = coalesce(p_paid_at, now())
   where payroll_period_id = p_period_id;
  perform set_config('app.payroll_unlock', 'off', true);

  update public.payroll_periods
     set status = 'paid', paid_at = coalesce(p_paid_at, now()), payment_method = coalesce(p_method, 'bank_transfer')
   where id = p_period_id;
end $$;

-- P&L for a date range (inclusive, local dates).
--   revenue     = sum(orders.total_amount) of completed orders
--   cogs_sales  = sum(orders.total_cogs) of completed orders
--   cogs_waste  = ledger total_cost of 'waste' rows + stocktake shortages (quantity < 0)
--   labor_cost  = sum(payroll_items.net_pay) of periods with period_end in range and status in (finalized, paid)
--   opex        = expense_records.amount by expense_date (accrual, any status), split by category expense_type
create or replace function public.get_pnl_report(p_start date, p_end date)
returns table (
  revenue          numeric,
  cogs_sales       numeric,
  cogs_waste       numeric,
  cogs_total       numeric,
  gross_profit     numeric,
  gross_margin_pct numeric,
  labor_cost       numeric,
  opex_fixed       numeric,
  opex_variable    numeric,
  opex_total       numeric,
  net_profit       numeric,
  net_margin_pct   numeric,
  order_count      int,
  avg_order_value  numeric
)
language plpgsql
stable
set search_path = public
as $$
declare
  v_from timestamptz := public.local_day_start(p_start);
  v_to   timestamptz := public.local_day_start(p_end + 1);
begin
  if p_start is null or p_end is null or p_end < p_start then
    raise exception 'INVALID_RANGE: p_end must be >= p_start';
  end if;

  return query
  with s as (
    select coalesce(sum(o.total_amount), 0)::numeric as revenue,
           coalesce(sum(o.total_cogs), 0)::numeric   as cogs_sales,
           count(*)::int                             as order_count
      from public.orders o
     where o.status = 'completed' and o.order_date >= v_from and o.order_date < v_to
  ),
  w as (
    select coalesce(sum(it.total_cost), 0)::numeric as cogs_waste
      from public.inventory_transactions it
     where it.created_at >= v_from and it.created_at < v_to
       and (it.txn_type = 'waste' or (it.txn_type = 'stocktake' and it.quantity < 0))
  ),
  l as (
    select coalesce(sum(pi.net_pay), 0)::numeric as labor_cost
      from public.payroll_items pi
      join public.payroll_periods pp on pp.id = pi.payroll_period_id
     where pp.status in ('finalized', 'paid')
       and pp.period_end between p_start and p_end
  ),
  x as (
    select coalesce(sum(er.amount) filter (where ec.expense_type = 'fixed'), 0)::numeric    as opex_fixed,
           coalesce(sum(er.amount) filter (where ec.expense_type = 'variable'), 0)::numeric as opex_variable
      from public.expense_records er
      join public.expense_categories ec on ec.id = er.category_id
     where er.expense_date between p_start and p_end
  )
  select
    s.revenue,
    s.cogs_sales,
    w.cogs_waste,
    s.cogs_sales + w.cogs_waste                                                             as cogs_total,
    s.revenue - s.cogs_sales - w.cogs_waste                                                 as gross_profit,
    case when s.revenue > 0 then round((s.revenue - s.cogs_sales - w.cogs_waste) / s.revenue * 100, 2) else 0 end as gross_margin_pct,
    l.labor_cost,
    x.opex_fixed,
    x.opex_variable,
    x.opex_fixed + x.opex_variable                                                          as opex_total,
    s.revenue - s.cogs_sales - w.cogs_waste - l.labor_cost - x.opex_fixed - x.opex_variable as net_profit,
    case when s.revenue > 0
         then round((s.revenue - s.cogs_sales - w.cogs_waste - l.labor_cost - x.opex_fixed - x.opex_variable) / s.revenue * 100, 2)
         else 0 end                                                                         as net_margin_pct,
    s.order_count,
    case when s.order_count > 0 then round(s.revenue / s.order_count, 2) else 0 end         as avg_order_value
  from s, w, l, x;
end $$;

-- Monthly P&L for a year: always 12 rows (zeros where empty).
create or replace function public.get_pnl_monthly(p_year int)
returns table (
  month        int,
  month_start  date,
  revenue      numeric,
  cogs_total   numeric,
  gross_profit numeric,
  labor_cost   numeric,
  opex_total   numeric,
  net_profit   numeric
)
language plpgsql
stable
set search_path = public
as $$
begin
  return query
  select m::int,
         make_date(p_year, m, 1),
         r.revenue, r.cogs_total, r.gross_profit, r.labor_cost, r.opex_total, r.net_profit
    from generate_series(1, 12) as m
    cross join lateral public.get_pnl_report(make_date(p_year, m, 1), (make_date(p_year, m, 1) + interval '1 month - 1 day')::date) r
   order by m;
end $$;

-- Dashboard KPIs.
create or replace function public.get_dashboard_stats()
returns jsonb
language plpgsql
stable
set search_path = public
as $$
declare
  v_today       date := public.to_local_date(now());
  v_month_start date := date_trunc('month', public.to_local_date(now()))::date;
  v_today_rev   numeric := 0;
  v_today_cogs  numeric := 0;
  v_today_ord   int := 0;
  v_month       record;
  v_low_stock   int;
  v_debt        numeric;
  v_overdue     numeric;
  v_pending     numeric;
  v_pending_cnt int;
begin
  select coalesce(sum(total_amount), 0), coalesce(sum(total_cogs), 0), count(*)
    into v_today_rev, v_today_cogs, v_today_ord
    from public.orders
   where status = 'completed'
     and order_date >= public.local_day_start(v_today)
     and order_date <  public.local_day_start(v_today + 1);

  select * into v_month from public.get_pnl_report(v_month_start, v_today);

  select count(*) into v_low_stock
    from public.ingredients where is_active and current_stock < min_alert_stock;

  select coalesce(sum(current_debt), 0) into v_debt from public.suppliers;

  select coalesce(sum(debt_amount), 0) into v_overdue
    from public.purchase_orders where debt_amount > 0 and due_date < current_date;

  select coalesce(sum(amount), 0), count(*) into v_pending, v_pending_cnt
    from public.expense_records where status = 'pending';

  return jsonb_build_object(
    'as_of',                   now(),
    'today',                   v_today,
    'today_revenue',           v_today_rev,
    'today_cogs',              v_today_cogs,
    'today_orders',            v_today_ord,
    'month_start',             v_month_start,
    'month_revenue',           v_month.revenue,
    'month_cogs',              v_month.cogs_total,
    'month_gross_profit',      v_month.gross_profit,
    'month_labor_cost',        v_month.labor_cost,
    'month_opex',              v_month.opex_total,
    'month_net_profit',        v_month.net_profit,
    'month_order_count',       v_month.order_count,
    'low_stock_count',         v_low_stock,
    'total_supplier_debt',     v_debt,
    'overdue_debt',            v_overdue,
    'pending_expenses_amount', v_pending,
    'pending_expenses_count',  v_pending_cnt
  );
end $$;

-- -----------------------------------------------------------------------------
-- 17. ROW LEVEL SECURITY  (đơn tenant: mọi user đã đăng nhập có toàn quyền)
-- -----------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'app_settings', 'suppliers', 'ingredients', 'inventory_transactions', 'menu_items', 'recipes',
    'purchase_orders', 'purchase_order_items', 'supplier_payments', 'supplier_payment_allocations',
    'employees', 'timekeeping', 'payroll_periods', 'payroll_items',
    'expense_categories', 'expense_records', 'orders', 'order_items'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "authenticated full access" on public.%I', t);
    execute format(
      'create policy "authenticated full access" on public.%I for all to authenticated using (auth.role() = ''authenticated'') with check (auth.role() = ''authenticated'')', t);
  end loop;
end $$;

-- profiles: everyone authenticated can read; a user can update only their own row.
alter table public.profiles enable row level security;
drop policy if exists "profiles select authenticated" on public.profiles;
create policy "profiles select authenticated" on public.profiles
  for select to authenticated using (auth.role() = 'authenticated');
drop policy if exists "profiles update own" on public.profiles;
create policy "profiles update own" on public.profiles
  for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

-- -----------------------------------------------------------------------------
-- 17a. SECURITY HARDENING  (SEC-01/02/04/07/08/10/12)  -- role helpers, delete guards,
--      settings validation, created_by stamping, definer trigger functions.
-- -----------------------------------------------------------------------------
-- Role of the calling user (null outside a request / for psql & seeds).
create or replace function public.current_user_role()
returns public.user_role
language sql
stable
security definer
set search_path = public
as $$
  select p.role from public.profiles p where p.id = auth.uid();
$$;

-- owner | manager, or no JWT at all (seed / migrations / service_role via psql).
create or replace function public.is_manager()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is null or public.current_user_role() in ('owner', 'manager');
$$;

-- payroll_periods: only draft periods may be deleted (finalized/paid history is kept).
create or replace function public.trg_payroll_periods_before_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.status <> 'draft' then
    raise exception 'PAYROLL_PERIOD_LOCKED: period is %, only draft periods can be deleted', old.status;
  end if;
  return old;
end $$;

drop trigger if exists trg_payroll_periods_before_delete on public.payroll_periods;
create trigger trg_payroll_periods_before_delete
  before delete on public.payroll_periods
  for each row execute function public.trg_payroll_periods_before_delete();

-- supplier_payments: manager/owner only (the cascade rewrites PO paid_amount and supplier debt).
create or replace function public.trg_supplier_payments_before_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_manager() then
    raise exception 'PERMISSION_DENIED: only owner/manager can delete a supplier payment';
  end if;
  return old;
end $$;

drop trigger if exists trg_supplier_payments_before_delete on public.supplier_payments;
create trigger trg_supplier_payments_before_delete
  before delete on public.supplier_payments
  for each row execute function public.trg_supplier_payments_before_delete();

-- purchase_orders: a PO that already received money is manager/owner-only to delete.
create or replace function public.trg_purchase_orders_before_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.paid_amount > 0 and not public.is_manager() then
    raise exception 'PERMISSION_DENIED: only owner/manager can delete a purchase order with payments';
  end if;
  return old;
end $$;

drop trigger if exists trg_purchase_orders_before_delete on public.purchase_orders;
create trigger trg_purchase_orders_before_delete
  before delete on public.purchase_orders
  for each row execute function public.trg_purchase_orders_before_delete();

-- employees: with attendance history -> manager/owner only (soft-delete via is_active/end_date is the norm).
create or replace function public.trg_employees_before_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_manager()
     and exists (select 1 from public.timekeeping t where t.employee_id = old.id) then
    raise exception 'PERMISSION_DENIED: only owner/manager can delete an employee with timekeeping history';
  end if;
  return old;
end $$;

drop trigger if exists trg_employees_before_delete on public.employees;
create trigger trg_employees_before_delete
  before delete on public.employees
  for each row execute function public.trg_employees_before_delete();

-- reopen_payroll: finalized -> draft (manager/owner only; paid periods stay paid).
create or replace function public.reopen_payroll(p_period_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status public.payroll_status;
begin
  if not public.is_manager() then
    raise exception 'PERMISSION_DENIED: only owner/manager can reopen a payroll period';
  end if;
  select status into v_status from public.payroll_periods where id = p_period_id for update;
  if not found then
    raise exception 'PAYROLL_PERIOD_NOT_FOUND: %', p_period_id;
  end if;
  if v_status = 'paid' then
    raise exception 'PAYROLL_PERIOD_PAID: a paid period cannot be reopened';
  end if;
  if v_status = 'draft' then
    return;
  end if;
  update public.payroll_periods set status = 'draft', finalized_at = null where id = p_period_id;
end $$;

-- app_settings: validate known keys (SEC-10).
create or replace function public.trg_app_settings_validate()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.key = 'timezone' then
    if jsonb_typeof(new.value) <> 'string'
       or not exists (select 1 from pg_timezone_names where name = (new.value #>> '{}')) then
      raise exception 'INVALID_SETTING: timezone must be a valid IANA timezone name (got %)', new.value;
    end if;
  elsif new.key = 'allow_negative_stock' then
    if jsonb_typeof(new.value) <> 'boolean' then
      raise exception 'INVALID_SETTING: allow_negative_stock must be a JSON boolean (got %)', new.value;
    end if;
  elsif new.key = 'food_cost_target_pct' then
    if jsonb_typeof(new.value) <> 'number' or (new.value #>> '{}')::numeric < 0 or (new.value #>> '{}')::numeric > 100 then
      raise exception 'INVALID_SETTING: food_cost_target_pct must be a number between 0 and 100 (got %)', new.value;
    end if;
  elsif new.key in ('restaurant_name', 'currency') then
    if jsonb_typeof(new.value) <> 'string' or length(new.value #>> '{}') = 0 then
      raise exception 'INVALID_SETTING: % must be a non-empty JSON string (got %)', new.key, new.value;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_app_settings_validate on public.app_settings;
create trigger trg_app_settings_validate
  before insert or update on public.app_settings
  for each row execute function public.trg_app_settings_validate();

-- created_by is stamped from the JWT (client value ignored) when a user is present (SEC-12).
create or replace function public.trg_set_created_by()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if auth.uid() is not null then
    new.created_by := auth.uid();
  end if;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['inventory_transactions', 'purchase_orders', 'supplier_payments', 'orders', 'timekeeping', 'expense_records'] loop
    execute format('drop trigger if exists trg_%s_set_created_by on public.%I', t, t);
    execute format('create trigger trg_%s_set_created_by before insert on public.%I for each row execute function public.trg_set_created_by()', t, t);
  end loop;
end $$;

-- Maintained columns are protected by column-level privileges (see 18. GRANTS), so every
-- trigger function and mutating RPC that writes them runs as its owner (postgres).
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and (p.proname like 'trg\_%' or p.proname in (
            'create_purchase_order', 'record_supplier_payment', 'create_order', 'cancel_order',
            'record_stock_adjustment', 'generate_payroll', 'finalize_payroll', 'pay_payroll', 'reopen_payroll',
            'next_po_number', 'next_order_number'))
  loop
    execute format('alter function %s security definer set search_path = public', f.sig);
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- 18. GRANTS
-- -----------------------------------------------------------------------------
grant usage on schema public to anon, authenticated, service_role;

-- SEC-04/05: anon and PUBLIC hold nothing in public (RLS is not the only barrier).
revoke all on all tables    in schema public from anon, public;
revoke all on all sequences in schema public from anon, public;
revoke all on all functions in schema public from anon, public;
alter default privileges in schema public revoke all on tables    from anon, public;
alter default privileges in schema public revoke all on sequences from anon, public;
alter default privileges in schema public revoke all on functions from anon, public;

-- SEC-03: no TRUNCATE / TRIGGER / REFERENCES for the API roles.
revoke all on all tables in schema public from authenticated, service_role;
grant select, insert, update, delete on all tables in schema public to authenticated, service_role;
revoke truncate, trigger, references on all tables in schema public from anon, authenticated;
grant usage, select on all sequences in schema public to authenticated, service_role;

-- SEC-01/06: MAINTAINED columns are owned by triggers/RPCs -> column-level privileges.
-- authenticated keeps UPDATE/INSERT on every other column (service_role keeps full access).
do $$
declare
  r record; v_cols text;
begin
  for r in
    select * from (values
      ('ingredients',      array['current_stock', 'avg_cost_price'],                                        array['current_stock', 'avg_cost_price']),
      ('suppliers',        array['current_debt'],                                                           array['current_debt']),
      ('purchase_orders',  array['total_amount', 'paid_amount', 'payment_status', 'po_number'],             array['total_amount', 'paid_amount', 'payment_status']),
      ('orders',           array['subtotal', 'total_amount', 'total_cogs', 'order_number', 'status'],       array['subtotal', 'total_amount', 'total_cogs']),
      ('order_items',      array['cogs_amount'],                                                            array['cogs_amount']),
      ('payroll_periods',  array['status', 'finalized_at', 'paid_at', 'total_net_pay', 'payment_method'],   array['total_net_pay']),
      ('profiles',         array['role'],                                                                   array['role'])
    ) as v(tbl, no_update, no_insert)
  loop
    execute format('revoke insert, update on public.%I from authenticated', r.tbl);
    select string_agg(quote_ident(column_name), ', ' order by ordinal_position) into v_cols
      from information_schema.columns
     where table_schema = 'public' and table_name = r.tbl
       and is_generated = 'NEVER' and column_name <> all (r.no_update);
    execute format('grant update (%s) on public.%I to authenticated', v_cols, r.tbl);
    select string_agg(quote_ident(column_name), ', ' order by ordinal_position) into v_cols
      from information_schema.columns
     where table_schema = 'public' and table_name = r.tbl
       and is_generated = 'NEVER' and column_name <> all (r.no_insert);
    execute format('grant insert (%s) on public.%I to authenticated', v_cols, r.tbl);
  end loop;
end $$;

-- Functions: RPCs, reports and helpers for authenticated + service_role only.
-- Trigger functions (trg_*, handle_new_user) get no EXECUTE - they fire through triggers regardless.
do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as sig
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
       and p.proname not like 'trg\_%'
       and p.proname <> 'handle_new_user'
  loop
    execute format('grant execute on function %s to authenticated, service_role', f.sig);
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- 19. DEFAULT SETTINGS  (cấu hình mặc định)
-- -----------------------------------------------------------------------------
insert into public.app_settings (key, value) values
  ('allow_negative_stock', 'false'::jsonb),
  ('food_cost_target_pct', '35'::jsonb),
  ('restaurant_name',      '"Nhà hàng Phố Việt"'::jsonb),
  ('timezone',             '"Asia/Ho_Chi_Minh"'::jsonb),
  ('currency',             '"VND"'::jsonb)
on conflict (key) do nothing;

-- =============================================================================
-- END OF MIGRATION
-- =============================================================================
