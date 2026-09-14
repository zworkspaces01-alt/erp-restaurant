-- =============================================================================
-- Restaurant ERP - Clean Database (Xóa dữ liệu mẫu, chuẩn bị cho dữ liệu thật)
-- Xóa toàn bộ dữ liệu nghiệp vụ mock: món, nguyên liệu, đơn hàng, nhập hàng,
-- nhân sự, chi phí...
-- Giữ lại:
--   1. Tài khoản Quản trị: admin@restaurant.local / Admin@123 (role owner)
--   2. Cài đặt hệ thống (app_settings)
--   3. Danh mục chi phí chuẩn (expense_categories)
-- =============================================================================
set client_min_messages = warning;
begin;

-- 1. Truncate toàn bộ dữ liệu nghiệp vụ
truncate table
  public.supplier_payment_allocations,
  public.supplier_payments,
  public.purchase_order_items,
  public.purchase_orders,
  public.order_items,
  public.orders,
  public.inventory_transactions,
  public.recipes,
  public.combo_items,
  public.menu_items,
  public.ingredients,
  public.suppliers,
  public.payroll_items,
  public.payroll_periods,
  public.timekeeping,
  public.employees,
  public.expense_records,
  public.menu_categories,
  public.ingredient_categories
  restart identity cascade;

-- 2. Cài đặt hệ thống mặc định
insert into public.app_settings (key, value) values
  ('allow_negative_stock', 'false'::jsonb),
  ('food_cost_target_pct', '35'::jsonb),
  ('restaurant_name', '"Nhà hàng"'::jsonb),
  ('timezone', '"Asia/Ho_Chi_Minh"'::jsonb)
on conflict (key) do update set value = excluded.value;

-- 3. Danh mục chi phí chuẩn
insert into public.expense_categories (name, expense_type, description) values
  ('Mặt bằng',  'fixed',    'Tiền thuê mặt bằng hàng tháng'),
  ('Điện',      'variable', 'Tiền điện'),
  ('Nước',      'variable', 'Tiền nước'),
  ('Gas',       'variable', 'Gas công nghiệp cho bếp'),
  ('Marketing', 'variable', 'Quảng cáo, ads, KOL'),
  ('Sửa chữa',  'variable', 'Sửa chữa thiết bị, cơ sở vật chất'),
  ('Bảo trì',   'fixed',    'Hợp đồng bảo trì định kỳ'),
  ('Khấu hao',  'fixed',    'Khấu hao tài sản cố định'),
  ('Phần mềm',  'fixed',    'Phần mềm quản lý, POS, kế toán'),
  ('Khác',      'variable', 'Chi phí khác')
on conflict (name) do nothing;

-- 4. Đảm bảo tài khoản Admin tồn tại
do $$
declare
  v_uid   uuid := 'a0000000-0000-4000-8000-000000000001';
  v_email text := 'admin@restaurant.local';
  v_cols  text[] := array['instance_id', 'id', 'aud', 'role', 'email', 'encrypted_password', 'raw_app_meta_data', 'raw_user_meta_data', 'created_at', 'updated_at'];
  v_vals  text[] := array[
    quote_literal('00000000-0000-0000-0000-000000000000') || '::uuid',
    quote_literal(v_uid::text) || '::uuid',
    quote_literal('authenticated'),
    quote_literal('authenticated'),
    quote_literal(v_email),
    'crypt(' || quote_literal('Admin@123') || ', gen_salt(''bf''))',
    quote_literal('{"provider":"email","providers":["email"]}') || '::jsonb',
    quote_literal('{"full_name":"Quản lý"}') || '::jsonb',
    'now()', 'now()'];
begin
  if exists (select 1 from information_schema.columns where table_schema = 'auth' and table_name = 'users' and column_name = 'email_confirmed_at') then
    v_cols := array_append(v_cols, ('email_confirmed_at')::text); v_vals := array_append(v_vals, ('now()')::text);
  elsif exists (select 1 from information_schema.columns where table_schema = 'auth' and table_name = 'users' and column_name = 'confirmed_at') then
    v_cols := array_append(v_cols, ('confirmed_at')::text); v_vals := array_append(v_vals, ('now()')::text);
  end if;

  if exists (select 1 from information_schema.columns where table_schema = 'auth' and table_name = 'users' and column_name = 'is_sso_user') then
    v_cols := array_append(v_cols, ('is_sso_user')::text); v_vals := array_append(v_vals, ('false')::text);
  end if;

  if exists (select 1 from information_schema.columns where table_schema = 'auth' and table_name = 'users' and column_name = 'is_anonymous') then
    v_cols := array_append(v_cols, ('is_anonymous')::text); v_vals := array_append(v_vals, ('false')::text);
  end if;

  execute format('insert into auth.users (%s) values (%s) on conflict (id) do nothing',
                 (select string_agg(quote_ident(x), ', ') from unnest(v_cols) x),
                 array_to_string(v_vals, ', '));

  if to_regclass('auth.identities') is not null then
    execute format(
      'insert into auth.identities (id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
       values (gen_random_uuid(), %L, %L::uuid, %L::jsonb, ''email'', now(), now(), now())
       on conflict (provider_id, provider) do nothing',
      v_uid::text, v_uid::text,
      jsonb_build_object('sub', v_uid::text, 'email', v_email, 'email_verified', true, 'phone_verified', false)::text);
  end if;

  insert into public.profiles (id, full_name, role) values (v_uid, 'Quản lý', 'owner')
  on conflict (id) do update set full_name = excluded.full_name, role = 'owner';
end $$;

commit;
