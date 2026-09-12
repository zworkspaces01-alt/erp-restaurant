-- =============================================================================
-- Restaurant ERP - demo seed (dữ liệu mẫu)
-- Run AFTER supabase/migrations/*.sql. Re-runnable: truncates every public
-- table and recreates the demo user. Deterministic (setseed) so the numbers are
-- identical on every run. All stock / cost / debt figures are produced by the
-- triggers and RPCs (never written directly).
--
-- Demo login: admin@restaurant.local / Admin@123
--
-- NOTE on allow_negative_stock: it is switched ON while seeding so the demo can
-- never fail on a stock check while the historical orders are replayed, and
-- restored to false at the end (purchases are sized to cover consumption, so
-- stocks stay positive anyway).
-- =============================================================================
set client_min_messages = warning;
begin;
do $$ begin perform setseed(0.42); end $$;   -- deterministic random()

-- -----------------------------------------------------------------------------
-- 0. RESET
-- -----------------------------------------------------------------------------
truncate table
  public.supplier_payment_allocations,
  public.supplier_payments,
  public.purchase_order_items,
  public.purchase_orders,
  public.order_items,
  public.orders,
  public.inventory_transactions,
  public.recipes,
  public.menu_items,
  public.ingredients,
  public.suppliers,
  public.payroll_items,
  public.payroll_periods,
  public.timekeeping,
  public.employees,
  public.expense_records,
  public.expense_categories,
  public.profiles
  restart identity cascade;

delete from auth.users where email = 'admin@restaurant.local';

update public.app_settings set value = 'true'::jsonb where key = 'allow_negative_stock';
insert into public.app_settings (key, value) values ('allow_negative_stock', 'true'::jsonb) on conflict (key) do nothing;
insert into public.app_settings (key, value) values
  ('food_cost_target_pct', '35'::jsonb),
  ('restaurant_name', '"Nhà hàng Phố Việt"'::jsonb),
  ('timezone', '"Asia/Ho_Chi_Minh"'::jsonb)
on conflict (key) do update set value = excluded.value;

-- -----------------------------------------------------------------------------
-- 1. DEMO AUTH USER  (tài khoản demo) - adapts to the auth schema version:
--    * full Supabase schema (cloud / supabase start / test shim): email_confirmed_at + auth.identities
--    * bare supabase/postgres image (no GoTrue migrations yet): plain confirmed_at, no identities table
-- -----------------------------------------------------------------------------
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
  c       text;
begin
  -- email confirmation: prefer email_confirmed_at; else a writable confirmed_at
  if exists (select 1 from information_schema.columns where table_schema = 'auth' and table_name = 'users' and column_name = 'email_confirmed_at') then
    v_cols := array_append(v_cols, ('email_confirmed_at')::text); v_vals := array_append(v_vals, ('now()')::text);
  elsif exists (select 1 from information_schema.columns where table_schema = 'auth' and table_name = 'users' and column_name = 'confirmed_at' and is_generated = 'NEVER') then
    v_cols := array_append(v_cols, ('confirmed_at')::text); v_vals := array_append(v_vals, ('now()')::text);
  end if;
  -- GoTrue cannot scan NULL into these string columns -> set '' when they exist
  foreach c in array array['confirmation_token', 'recovery_token', 'email_change_token_new', 'email_change',
                           'email_change_token_current', 'phone_change', 'phone_change_token', 'reauthentication_token'] loop
    if exists (select 1 from information_schema.columns where table_schema = 'auth' and table_name = 'users' and column_name = c) then
      v_cols := array_append(v_cols, (c)::text); v_vals := array_append(v_vals, (quote_literal(''))::text);
    end if;
  end loop;
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

  -- profile: created by the auth trigger when present; make sure it exists and is the owner
  insert into public.profiles (id, full_name, role) values (v_uid, 'Quản lý', 'owner')
  on conflict (id) do update set full_name = excluded.full_name, role = 'owner';
end $$;

-- -----------------------------------------------------------------------------
-- 2. SUPPLIERS  (nhà cung cấp) - terms 0 (COD) / 7 / 15 / 30 days
-- -----------------------------------------------------------------------------
insert into public.suppliers (code, name, contact_name, phone, email, address, tax_code, payment_terms_days, note) values
  ('NCC-001', 'Công ty TNHH Thực phẩm Sạch Việt',      'Nguyễn Văn Bình',  '0903 111 222', 'kinhdoanh@thucphamsachviet.vn', '12 Lê Văn Sỹ, Q.3, TP.HCM',          '0312345678', 15, 'Thịt heo, bò, gà, trứng - giao mỗi sáng'),
  ('NCC-002', 'Vựa Hải sản Phú Quý',                    'Trần Thị Hồng',    '0908 333 444', 'phuquyseafood@gmail.com',       '45 Chợ Bình Điền, Q.8, TP.HCM',     '0398765432', 7,  'Hải sản tươi sống'),
  ('NCC-003', 'Nông trại Rau Củ Đà Lạt Xanh',            'Lê Minh Đức',      '0912 555 666', 'dalatxanh@farm.vn',             '78 Phan Đình Phùng, Đà Lạt',        '5800123456', 0,  'Rau củ quả - thanh toán khi giao (COD)'),
  ('NCC-004', 'Công ty CP Gia vị Miền Nam',               'Phạm Thu Hà',      '028 3844 5566','sales@giavimiennam.com',        '210 Nguyễn Trãi, Q.1, TP.HCM',      '0301122334', 30, 'Nước mắm, dầu ăn, gia vị khô'),
  ('NCC-005', 'Đại lý Nước giải khát Thành Đạt',          'Hoàng Văn Thành',  '0933 777 888', 'thanhdat.drinks@gmail.com',     '5 Quốc lộ 13, TP. Thủ Đức',         '0315566778', 15, 'Bia, nước ngọt, nước suối, cà phê, đá'),
  ('NCC-006', 'Công ty Bao bì Tân Tiến',                  'Vũ Thị Ngọc',      '0977 999 000', 'cskh@baobitantien.vn',          '99 Tân Kỳ Tân Quý, Q.Tân Phú',      '0309988776', 30, 'Hộp giấy, ống hút, túi'),
  ('NCC-007', 'Cửa hàng Gạo Mì Hạnh Phúc',               'Đỗ Văn Phúc',      '0918 123 456', null,                            '34 Nguyễn Tri Phương, Q.10',        null,         7,  'Gạo, bún, phở, bánh mì'),
  ('NCC-008', 'Công ty Sữa & Bơ Đông Á',                  'Bùi Thị Thu',      '028 3999 1234','order@donga-dairy.vn',          '150 Cộng Hòa, Q.Tân Bình',          '0304455667', 15, 'Sữa, bơ, kem');

-- -----------------------------------------------------------------------------
-- 3. INGREDIENTS  (nguyên liệu)
--    price column = reference VND per IMPORT unit (used by the POs below);
--    min_alert = minimum stock in BASE units.
-- -----------------------------------------------------------------------------
create temp table tmp_ingredients (
  code text, name text, category text, base_unit text, import_unit text, factor numeric, ref_price numeric, min_alert numeric, supplier_code text
);

insert into tmp_ingredients values
  -- Thịt & trứng (NCC-001)
  ('NL-001', 'Thịt bò thăn',            'Thịt',      'g',    'kg',          1000, 285000,  5000,  'NCC-001'),
  ('NL-002', 'Thịt heo ba chỉ',         'Thịt',      'g',    'kg',          1000, 135000,  3000,  'NCC-001'),
  ('NL-003', 'Sườn heo non',            'Thịt',      'g',    'kg',          1000, 155000,  5000,  'NCC-001'),
  ('NL-004', 'Thịt gà ta',              'Thịt',      'g',    'kg',          1000, 95000,   5000,  'NCC-001'),
  ('NL-005', 'Trứng gà',                'Thịt',      'quả',  'vỉ 10 quả',   10,   32000,   40,    'NCC-001'),
  -- Hải sản (NCC-002)
  ('NL-006', 'Tôm sú',                  'Hải sản',   'g',    'kg',          1000, 265000,  3000,  'NCC-002'),
  ('NL-007', 'Mực ống',                 'Hải sản',   'g',    'kg',          1000, 185000,  3000,  'NCC-002'),
  ('NL-008', 'Cá basa phi lê',          'Hải sản',   'g',    'kg',          1000, 98000,   2000,  'NCC-002'),
  -- Rau củ quả (NCC-003)
  ('NL-010', 'Xà lách',                 'Rau củ',    'g',    'kg',          1000, 32000,   1500,  'NCC-003'),
  ('NL-011', 'Cà chua',                 'Rau củ',    'g',    'kg',          1000, 26000,   1500,  'NCC-003'),
  ('NL-012', 'Hành tây',                'Rau củ',    'g',    'kg',          1000, 22000,   2000,  'NCC-003'),
  ('NL-013', 'Hành lá',                 'Rau củ',    'g',    'kg',          1000, 42000,   500,   'NCC-003'),
  ('NL-014', 'Rau thơm các loại',       'Rau củ',    'g',    'kg',          1000, 65000,   500,   'NCC-003'),
  ('NL-015', 'Giá đỗ',                  'Rau củ',    'g',    'kg',          1000, 18000,   1500,  'NCC-003'),
  ('NL-016', 'Khoai tây',               'Rau củ',    'g',    'kg',          1000, 28000,   5000,  'NCC-003'),
  ('NL-017', 'Ớt tươi',                 'Rau củ',    'g',    'kg',          1000, 55000,   300,   'NCC-003'),
  ('NL-018', 'Tỏi',                     'Rau củ',    'g',    'kg',          1000, 48000,   500,   'NCC-003'),
  ('NL-019', 'Chanh tươi',              'Rau củ',    'g',    'kg',          1000, 30000,   1500,  'NCC-003'),
  ('NL-020', 'Dưa leo',                 'Rau củ',    'g',    'kg',          1000, 20000,   1500,  'NCC-003'),
  ('NL-021', 'Xoài cát',                'Trái cây',  'g',    'kg',          1000, 45000,   2000,  'NCC-003'),
  ('NL-022', 'Dâu tây Đà Lạt',          'Trái cây',  'g',    'kg',          1000, 160000,  1500,  'NCC-003'),
  -- Gạo & mì (NCC-007)
  ('NL-023', 'Gạo thơm ST25',           'Gạo & mì',  'g',    'bao 10kg',    10000, 260000, 5000,  'NCC-007'),
  ('NL-024', 'Bún tươi',                'Gạo & mì',  'g',    'kg',          1000, 16000,   2000,  'NCC-007'),
  ('NL-025', 'Bánh phở tươi',           'Gạo & mì',  'g',    'kg',          1000, 17000,   3000,  'NCC-007'),
  ('NL-026', 'Bánh mì ổ',               'Gạo & mì',  'pcs',  'túi 10 ổ',    10,   40000,   25,    'NCC-007'),
  ('NL-027', 'Bánh tráng',              'Gạo & mì',  'g',    'kg',          1000, 65000,   500,   'NCC-007'),
  ('NL-028', 'Bột chiên giòn',          'Gạo & mì',  'g',    'kg',          1000, 38000,   500,   'NCC-007'),
  -- Gia vị (NCC-004)
  ('NL-029', 'Nước mắm',                'Gia vị',    'ml',   'chai 1L',     1000, 48000,   2000,  'NCC-004'),
  ('NL-030', 'Dầu ăn',                  'Gia vị',    'ml',   'can 5L',      5000, 210000,  3000,  'NCC-004'),
  ('NL-031', 'Đường cát',               'Gia vị',    'g',    'kg',          1000, 23000,   1000,  'NCC-004'),
  ('NL-032', 'Muối',                    'Gia vị',    'g',    'kg',          1000, 9000,    500,   'NCC-004'),
  ('NL-033', 'Tiêu xay',                'Gia vị',    'g',    'kg',          1000, 260000,  200,   'NCC-004'),
  ('NL-034', 'Hạt nêm',                 'Gia vị',    'g',    'kg',          1000, 62000,   500,   'NCC-004'),
  ('NL-035', 'Tương ớt',                'Gia vị',    'ml',   'chai 500ml',  500,  26000,   500,   'NCC-004'),
  ('NL-036', 'Sa tế',                   'Gia vị',    'g',    'hũ 200g',     200,  36000,   200,   'NCC-004'),
  -- Sữa & bơ (NCC-008)
  ('NL-037', 'Bơ lạt',                  'Sữa & bơ',  'g',    'kg',          1000, 225000,  300,   'NCC-008'),
  ('NL-039', 'Sữa tươi không đường',    'Sữa & bơ',  'ml',   'lít',         1000, 33000,   1000,  'NCC-008'),
  ('NL-040', 'Sữa đặc',                 'Sữa & bơ',  'g',    'lon 380g',    380,  29000,   760,   'NCC-008'),
  ('NL-041', 'Kem vani',                'Sữa & bơ',  'ml',   'hộp 5L',      5000, 360000,  4000,  'NCC-008'),
  -- Đồ uống (NCC-005)
  ('NL-042', 'Cà phê hạt rang',         'Đồ uống',   'g',    'kg',          1000, 190000,  1000,  'NCC-005'),
  ('NL-043', 'Trà đen',                 'Đồ uống',   'g',    'kg',          1000, 150000,  800,   'NCC-005'),
  ('NL-044', 'Coca-Cola lon',           'Đồ uống',   'lon',  'thùng 24',    24,   235000,  24,    'NCC-005'),
  ('NL-045', 'Bia Tiger lon',           'Đồ uống',   'lon',  'thùng 24',    24,   430000,  24,    'NCC-005'),
  ('NL-046', 'Nước suối Aquafina',      'Đồ uống',   'chai', 'thùng 24',    24,   105000,  20,    'NCC-005'),
  ('NL-047', 'Đá viên',                 'Đồ uống',   'g',    'bao 5kg',     5000, 22000,   10000, 'NCC-005'),
  -- Bao bì (NCC-006)
  ('NL-048', 'Hộp giấy đựng thức ăn',   'Bao bì',    'pcs',  'cây 50 hộp',  50,   78000,   50,    'NCC-006'),
  ('NL-049', 'Ống hút giấy',            'Bao bì',    'pcs',  'túi 100',     100,  16000,   100,   'NCC-006');

insert into public.ingredients (code, name, category, base_unit, import_unit, conversion_factor, min_alert_stock, default_supplier_id)
select t.code, t.name, t.category, t.base_unit, t.import_unit, t.factor, t.min_alert, s.id
  from tmp_ingredients t
  left join public.suppliers s on s.code = t.supplier_code
 order by t.code;

-- -----------------------------------------------------------------------------
-- 4. MENU ITEMS  (món ăn)
-- -----------------------------------------------------------------------------
insert into public.menu_items (code, name, category, selling_price, description) values
  ('KV-01', 'Gỏi cuốn tôm thịt (2 cuốn)',   'Khai vị',     55000,  'Tôm sú, ba chỉ, bún, rau sống cuốn bánh tráng'),
  ('KV-02', 'Khoai tây chiên',              'Khai vị',     35000,  'Khoai tây chiên giòn, tương ớt'),
  ('KV-03', 'Chả giò hải sản',              'Khai vị',     60000,  'Chả giò chiên giòn nhân tôm thịt'),
  ('KV-04', 'Mực chiên giòn',               'Khai vị',     95000,  'Mực ống tẩm bột chiên giòn'),
  ('KV-05', 'Salad dầu giấm',               'Khai vị',     45000,  'Xà lách, cà chua, dưa leo, hành tây'),
  ('MC-01', 'Bò lúc lắc khoai tây',         'Món chính',   175000, 'Thăn bò áp chảo, hành tây, ớt chuông'),
  ('MC-02', 'Sườn nướng mật ong',           'Món chính',   135000, 'Sườn non ướp sa tế nướng than'),
  ('MC-03', 'Gà chiên nước mắm',            'Món chính',   115000, 'Gà ta chiên giòn sốt nước mắm tỏi'),
  ('MC-04', 'Tôm sú nướng muối ớt',         'Món chính',   195000, 'Tôm sú size lớn nướng muối ớt'),
  ('MC-05', 'Cá basa kho tộ',               'Món chính',   95000,  'Cá kho tộ kiểu miền Tây'),
  ('MC-06', 'Bò bít tết khoai tây',         'Món chính',   255000, 'Steak bò 250g, khoai tây, salad'),
  ('MC-07', 'Mực xào sa tế',                'Món chính',   135000, 'Mực ống xào sa tế cay'),
  ('CB-01', 'Cơm chiên hải sản',            'Cơm & Bún',   95000,  'Cơm chiên tôm mực trứng'),
  ('CB-02', 'Cơm sườn trứng',               'Cơm & Bún',   85000,  'Cơm tấm sườn nướng, trứng ốp la'),
  ('CB-03', 'Bún bò xào',                   'Cơm & Bún',   75000,  'Bún tươi, bò xào, rau sống'),
  ('CB-04', 'Phở bò tái',                   'Cơm & Bún',   75000,  'Phở bò tái, hành, giá'),
  ('CB-05', 'Bánh mì thịt nướng',           'Cơm & Bún',   35000,  'Bánh mì kẹp thịt ba chỉ nướng'),
  ('CB-06', 'Cơm gà xối mỡ',                'Cơm & Bún',   80000,  'Đùi gà xối mỡ giòn, cơm trắng'),
  ('CB-07', 'Cơm trắng',                    'Cơm & Bún',   12000,  'Chén cơm trắng'),
  ('DU-01', 'Cà phê sữa đá',                'Đồ uống',     32000,  'Cà phê phin sữa đặc'),
  ('DU-02', 'Trà đá',                       'Đồ uống',     10000,  'Trà đen đá'),
  ('DU-03', 'Coca-Cola',                    'Đồ uống',     25000,  'Lon 330ml'),
  ('DU-04', 'Bia Tiger',                    'Đồ uống',     28000,  'Lon 330ml'),
  ('DU-05', 'Nước suối Aquafina',           'Đồ uống',     15000,  'Chai 500ml'),
  ('DU-06', 'Nước chanh tươi',              'Đồ uống',     30000,  'Chanh tươi vắt, đường'),
  ('DU-07', 'Sinh tố xoài',                 'Đồ uống',     45000,  'Xoài cát, sữa đặc, sữa tươi'),
  ('TM-01', 'Kem vani dâu tây',             'Tráng miệng', 35000,  'Kem vani, dâu tây tươi'),
  ('TM-02', 'Bánh flan',                    'Tráng miệng', 25000,  'Bánh flan caramel'),
  ('TM-03', 'Trái cây thập cẩm',            'Tráng miệng', 45000,  'Xoài, dâu tây theo mùa'),
  ('TM-04', 'Bánh ngọt của ngày',           'Tráng miệng', 35000,  'Bánh nhập từ tiệm đối tác (chưa có định lượng)');

-- -----------------------------------------------------------------------------
-- 5. RECIPES  (định lượng / BOM) - quantity in base units, waste % sơ chế
-- -----------------------------------------------------------------------------
create temp table tmp_recipes (menu_code text, ing_code text, qty numeric, waste numeric);
insert into tmp_recipes values
  -- KV-01 Gỏi cuốn
  ('KV-01','NL-006',30,5),  ('KV-01','NL-002',30,0),  ('KV-01','NL-024',40,0),  ('KV-01','NL-010',15,10), ('KV-01','NL-014',10,10), ('KV-01','NL-027',20,0), ('KV-01','NL-029',15,0), ('KV-01','NL-031',5,0),
  -- KV-02 Khoai tây chiên
  ('KV-02','NL-016',200,15), ('KV-02','NL-030',30,0), ('KV-02','NL-032',2,0), ('KV-02','NL-035',20,0),
  -- KV-03 Chả giò
  ('KV-03','NL-002',60,0), ('KV-03','NL-006',20,5), ('KV-03','NL-027',30,0), ('KV-03','NL-012',20,10), ('KV-03','NL-015',20,0), ('KV-03','NL-030',40,0), ('KV-03','NL-029',15,0), ('KV-03','NL-005',0.5,0),
  -- KV-04 Mực chiên giòn
  ('KV-04','NL-007',120,10), ('KV-04','NL-028',40,0), ('KV-04','NL-030',50,0), ('KV-04','NL-035',20,0), ('KV-04','NL-017',5,0), ('KV-04','NL-019',20,0),
  -- KV-05 Salad
  ('KV-05','NL-010',120,10), ('KV-05','NL-011',60,0), ('KV-05','NL-020',60,0), ('KV-05','NL-012',30,10), ('KV-05','NL-030',10,0), ('KV-05','NL-031',5,0), ('KV-05','NL-019',20,0),
  -- MC-01 Bò lúc lắc
  ('MC-01','NL-001',180,5), ('MC-01','NL-012',50,10), ('MC-01','NL-017',10,0), ('MC-01','NL-018',10,0), ('MC-01','NL-033',2,0), ('MC-01','NL-030',20,0), ('MC-01','NL-034',5,0), ('MC-01','NL-016',80,15),
  -- MC-02 Sườn nướng
  ('MC-02','NL-003',250,5), ('MC-02','NL-018',10,0), ('MC-02','NL-031',15,0), ('MC-02','NL-029',20,0), ('MC-02','NL-036',10,0), ('MC-02','NL-033',2,0),
  -- MC-03 Gà chiên nước mắm
  ('MC-03','NL-004',300,8), ('MC-03','NL-029',30,0), ('MC-03','NL-031',15,0), ('MC-03','NL-018',10,0), ('MC-03','NL-030',60,0), ('MC-03','NL-028',30,0), ('MC-03','NL-017',5,0),
  -- MC-04 Tôm nướng muối ớt
  ('MC-04','NL-006',250,5), ('MC-04','NL-032',5,0), ('MC-04','NL-017',15,0), ('MC-04','NL-036',15,0), ('MC-04','NL-030',15,0), ('MC-04','NL-019',20,0),
  -- MC-05 Cá kho tộ
  ('MC-05','NL-008',250,5), ('MC-05','NL-029',30,0), ('MC-05','NL-031',15,0), ('MC-05','NL-013',10,0), ('MC-05','NL-033',2,0), ('MC-05','NL-030',15,0), ('MC-05','NL-017',5,0),
  -- MC-06 Bít tết
  ('MC-06','NL-001',250,5), ('MC-06','NL-037',20,0), ('MC-06','NL-016',120,15), ('MC-06','NL-010',30,10), ('MC-06','NL-011',40,0), ('MC-06','NL-033',3,0), ('MC-06','NL-032',3,0), ('MC-06','NL-030',10,0),
  -- MC-07 Mực xào sa tế
  ('MC-07','NL-007',200,10), ('MC-07','NL-036',20,0), ('MC-07','NL-012',40,10), ('MC-07','NL-017',10,0), ('MC-07','NL-030',20,0), ('MC-07','NL-034',5,0),
  -- CB-01 Cơm chiên hải sản
  ('CB-01','NL-023',150,0), ('CB-01','NL-006',50,5), ('CB-01','NL-007',50,10), ('CB-01','NL-005',1,0), ('CB-01','NL-013',10,0), ('CB-01','NL-030',25,0), ('CB-01','NL-034',5,0), ('CB-01','NL-012',20,10),
  -- CB-02 Cơm sườn
  ('CB-02','NL-023',150,0), ('CB-02','NL-003',120,5), ('CB-02','NL-005',1,0), ('CB-02','NL-020',40,0), ('CB-02','NL-011',30,0), ('CB-02','NL-029',15,0), ('CB-02','NL-031',5,0),
  -- CB-03 Bún bò xào
  ('CB-03','NL-024',200,0), ('CB-03','NL-001',60,5), ('CB-03','NL-015',50,0), ('CB-03','NL-010',30,10), ('CB-03','NL-014',10,10), ('CB-03','NL-029',20,0), ('CB-03','NL-031',5,0), ('CB-03','NL-018',5,0),
  -- CB-04 Phở bò
  ('CB-04','NL-025',200,0), ('CB-04','NL-001',60,5), ('CB-04','NL-012',30,10), ('CB-04','NL-013',10,0), ('CB-04','NL-015',40,0), ('CB-04','NL-014',10,10), ('CB-04','NL-034',8,0),
  -- CB-05 Bánh mì thịt
  ('CB-05','NL-026',1,0), ('CB-05','NL-002',50,0), ('CB-05','NL-020',20,0), ('CB-05','NL-014',5,10), ('CB-05','NL-017',3,0), ('CB-05','NL-035',10,0), ('CB-05','NL-037',5,0),
  -- CB-06 Cơm gà xối mỡ
  ('CB-06','NL-023',150,0), ('CB-06','NL-004',180,8), ('CB-06','NL-030',60,0), ('CB-06','NL-020',40,0), ('CB-06','NL-011',30,0), ('CB-06','NL-029',15,0),
  -- CB-07 Cơm trắng
  ('CB-07','NL-023',150,0),
  -- DU-01 Cà phê sữa đá
  ('DU-01','NL-042',25,0), ('DU-01','NL-040',30,0), ('DU-01','NL-047',200,0), ('DU-01','NL-049',1,0),
  -- DU-02 Trà đá
  ('DU-02','NL-043',3,0), ('DU-02','NL-047',200,0), ('DU-02','NL-049',1,0),
  -- DU-03 Coca
  ('DU-03','NL-044',1,0), ('DU-03','NL-047',150,0), ('DU-03','NL-049',1,0),
  -- DU-04 Bia
  ('DU-04','NL-045',1,0),
  -- DU-05 Nước suối
  ('DU-05','NL-046',1,0),
  -- DU-06 Nước chanh
  ('DU-06','NL-019',60,0), ('DU-06','NL-031',25,0), ('DU-06','NL-047',200,0), ('DU-06','NL-049',1,0),
  -- DU-07 Sinh tố xoài
  ('DU-07','NL-021',200,20), ('DU-07','NL-040',30,0), ('DU-07','NL-047',150,0), ('DU-07','NL-039',50,0), ('DU-07','NL-049',1,0),
  -- TM-01 Kem
  ('TM-01','NL-041',100,0), ('TM-01','NL-040',10,0), ('TM-01','NL-022',20,5),
  -- TM-02 Flan
  ('TM-02','NL-005',1,0), ('TM-02','NL-039',80,0), ('TM-02','NL-031',25,0), ('TM-02','NL-040',20,0),
  -- TM-03 Trái cây
  ('TM-03','NL-021',150,20), ('TM-03','NL-022',40,5);
  -- TM-04 intentionally has no recipe (missing_recipe = true)

insert into public.recipes (menu_item_id, ingredient_id, quantity, waste_percent)
select m.id, i.id, r.qty, r.waste
  from tmp_recipes r
  join public.menu_items m on m.code = r.menu_code
  join public.ingredients i on i.code = r.ing_code;

-- -----------------------------------------------------------------------------
-- 6. PURCHASE ORDERS  (phiếu nhập) - via create_purchase_order (trigger-driven)
--    k = PO index, days_ago = order_date offset, paid_pct = tiền trả ngay (% of total)
-- -----------------------------------------------------------------------------
create temp table tmp_po (k int, supplier_code text, days_ago int, paid_pct numeric, paid_method public.payment_method, invoice text, note text, po_id uuid);
insert into tmp_po (k, supplier_code, days_ago, paid_pct, paid_method, invoice, note) values
  (1,  'NCC-001', 55, 0,    'bank_transfer', 'HD-0001/25', 'Nhập thịt đầu kỳ'),
  (2,  'NCC-002', 50, 0.5,  'cash',          'HD-PQ-118',  'Hải sản - trả trước 50%'),
  (3,  'NCC-003', 45, 1,    'cash',          null,         'Rau củ - COD'),
  (4,  'NCC-004', 40, 0,    'bank_transfer', 'GV-2025-77', 'Gia vị khô'),
  (5,  'NCC-005', 30, 0.3,  'cash',          'TD-0912',    'Bia, nước ngọt, đá'),
  (6,  'NCC-006', 25, 0,    'bank_transfer', 'BB-3311',    'Bao bì quý'),
  (7,  'NCC-007', 20, 0,    'cash',          null,         'Gạo mì'),
  (8,  'NCC-008', 18, 0,    'bank_transfer', 'DA-5520',    'Sữa bơ kem'),
  (9,  'NCC-001', 12, 0,    'bank_transfer', 'HD-0042/25', 'Nhập thịt bổ sung (giá mới)'),
  (10, 'NCC-002', 5,  0.2,  'cash',          'HD-PQ-131',  'Hải sản bổ sung - trả trước 20%');

-- (k, ingredient code, quantity in IMPORT units, unit price VND per import unit)
create temp table tmp_po_items (k int, ing_code text, qty numeric, price numeric);
insert into tmp_po_items values
  -- PO1 thịt đầu kỳ
  (1,'NL-001',50,285000), (1,'NL-002',18,135000), (1,'NL-003',70,155000), (1,'NL-004',70,95000), (1,'NL-005',65,32000),
  -- PO2 hải sản
  (2,'NL-006',20,265000), (2,'NL-007',20,185000), (2,'NL-008',28,98000),
  -- PO3 rau củ quả (COD)
  (3,'NL-010',20,32000),  (3,'NL-011',22,26000),  (3,'NL-012',36,22000),  (3,'NL-013',6,42000),   (3,'NL-014',7,65000),  (3,'NL-015',20,18000),
  (3,'NL-016',80,28000),  (3,'NL-017',6,55000),   (3,'NL-018',8,48000),   (3,'NL-019',18,30000),  (3,'NL-020',25,20000), (3,'NL-021',33,45000), (3,'NL-022',3,160000),
  -- PO4 gia vị
  (4,'NL-029',30,48000),  (4,'NL-030',12,210000), (4,'NL-031',19,23000),  (4,'NL-032',2,9000),    (4,'NL-033',2,260000), (4,'NL-034',5,62000),  (4,'NL-035',12,26000), (4,'NL-036',24,36000),
  -- PO5 đồ uống
  (5,'NL-044',16,235000), (5,'NL-045',11,430000), (5,'NL-046',2,105000),  (5,'NL-047',55,22000),  (5,'NL-042',7,190000), (5,'NL-043',2,150000),
  -- PO6 bao bì
  (6,'NL-048',3,78000),   (6,'NL-049',16,16000),
  -- PO7 gạo mì
  (7,'NL-023',12,260000), (7,'NL-024',38,16000),  (7,'NL-025',46,17000),  (7,'NL-026',4,40000),   (7,'NL-027',8,65000),  (7,'NL-028',9,38000),
  -- PO8 sữa bơ
  (8,'NL-037',1.5,225000), (8,'NL-039',12,33000), (8,'NL-040',36,29000),  (8,'NL-041',2,360000),
  -- PO9 thịt bổ sung (giá mới -> giá vốn bình quân thay đổi)
  (9,'NL-001',40,295000), (9,'NL-003',30,160000), (9,'NL-004',35,92000),
  -- PO10 hải sản bổ sung
  (10,'NL-006',17,270000), (10,'NL-007',16,180000);

do $$
declare
  p       record;
  v_items jsonb;
  v_total numeric;
  v_id    uuid;
begin
  for p in select * from tmp_po order by k loop
    select jsonb_agg(jsonb_build_object('ingredient_id', i.id, 'quantity', t.qty, 'unit_price', t.price) order by t.ing_code),
           sum(t.qty * t.price)
      into v_items, v_total
      from tmp_po_items t join public.ingredients i on i.code = t.ing_code
     where t.k = p.k;

    v_id := public.create_purchase_order(
      (select id from public.suppliers where code = p.supplier_code),
      current_date - p.days_ago,
      null,                                   -- due_date from supplier terms
      p.invoice,
      p.note,
      v_items,
      round(v_total * p.paid_pct, 0),
      p.paid_method);
    update tmp_po set po_id = v_id where k = p.k;
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- 7. SUPPLIER PAYMENTS  (sổ quỹ trả nợ) - via record_supplier_payment
-- -----------------------------------------------------------------------------
do $$
begin
-- P1: FIFO for NCC-001 (60% of PO1 debt -> PO1 partial, still overdue)
perform public.record_supplier_payment(
  (select id from public.suppliers where code = 'NCC-001'),
  round((select debt_amount from public.purchase_orders where id = (select po_id from tmp_po where k = 1)) * 0.6, 0),
  current_date - 30, 'bank_transfer', null, 'UNC-2025-0301', 'Trả dần công nợ thịt (FIFO)');
-- P2: đích danh PO4 (50%)
perform public.record_supplier_payment(
  (select id from public.suppliers where code = 'NCC-004'),
  round((select debt_amount from public.purchase_orders where id = (select po_id from tmp_po where k = 4)) * 0.5, 0),
  current_date - 8, 'bank_transfer', (select po_id from tmp_po where k = 4), 'UNC-2025-0355', 'Thanh toán 50% hóa đơn GV-2025-77');
-- P3: đích danh PO2 - pay off the remainder (PO2 becomes paid)
perform public.record_supplier_payment(
  (select id from public.suppliers where code = 'NCC-002'),
  (select debt_amount from public.purchase_orders where id = (select po_id from tmp_po where k = 2)),
  current_date - 35, 'cash', (select po_id from tmp_po where k = 2), null, 'Tất toán HD-PQ-118');
-- P4: FIFO for NCC-008 (40%)
perform public.record_supplier_payment(
  (select id from public.suppliers where code = 'NCC-008'),
  round((select current_debt from public.suppliers where code = 'NCC-008') * 0.4, 0),
  current_date - 2, 'bank_transfer', null, 'UNC-2025-0402', 'Trả một phần công nợ sữa bơ');
end $$;

-- -----------------------------------------------------------------------------
-- 8. EMPLOYEES  (nhân viên) - 5 full-time, 7 part-time
-- -----------------------------------------------------------------------------
insert into public.employees (code, full_name, phone, email, position, employment_type, base_salary, hourly_rate, allowance, standard_days_per_month, start_date, bank_account) values
  ('NV-001', 'Nguyễn Văn Hùng',  '0901 000 001', 'hung.nv@phoviet.vn',  'Quản lý nhà hàng',    'full_time', 14000000, 0,     1000000, 26, current_date - 800, 'VCB 0071000123456'),
  ('NV-002', 'Trần Thị Mai',     '0901 000 002', 'mai.tt@phoviet.vn',   'Thu ngân',            'full_time', 7500000,  0,     500000,  26, current_date - 600, 'TCB 19031234567'),
  ('NV-003', 'Lê Minh Tuấn',     '0901 000 003', 'tuan.lm@phoviet.vn',  'Bếp trưởng',          'full_time', 15000000, 0,     1500000, 26, current_date - 900, 'VCB 0071000765432'),
  ('NV-004', 'Phạm Thị Lan',     '0901 000 004', 'lan.pt@phoviet.vn',   'Bếp phó',             'full_time', 10000000, 0,     800000, 26, current_date - 500, 'ACB 123456789'),
  ('NV-005', 'Hoàng Văn Nam',    '0901 000 005', 'nam.hv@phoviet.vn',   'Trưởng ca phục vụ',   'full_time', 8500000,  0,     500000,  26, current_date - 400, 'MB 0123456789012'),
  ('NV-006', 'Đỗ Thị Hương',     '0901 000 006', 'huong.dt@phoviet.vn', 'Kế toán (bán thời gian)', 'part_time', 0, 45000, 0,  26, current_date - 300, 'VCB 0071000998877'),
  ('NV-007', 'Vũ Anh Khoa',      '0901 000 007', null,                  'Phục vụ',             'part_time', 0,        28000, 0,       26, current_date - 200, 'MOMO 0901000007'),
  ('NV-008', 'Bùi Thu Trang',    '0901 000 008', null,                  'Phục vụ',             'part_time', 0,        28000, 0,       26, current_date - 150, 'MOMO 0901000008'),
  ('NV-009', 'Ngô Đức Thịnh',    '0901 000 009', null,                  'Phụ bếp',             'part_time', 0,        32000, 0,       26, current_date - 250, 'VCB 0071000111222'),
  ('NV-010', 'Đặng Thị Yến',     '0901 000 010', null,                  'Rửa chén',            'part_time', 0,        25000, 0,       26, current_date - 120, null),
  ('NV-011', 'Phan Văn Lộc',     '0901 000 011', null,                  'Bảo vệ',              'part_time', 0,        27000, 0,       26, current_date - 350, 'ACB 987654321'),
  ('NV-012', 'Trịnh Mỹ Linh',    '0901 000 012', null,                  'Phục vụ',             'part_time', 0,        28000, 0,       26, date_trunc('month', current_date)::date - interval '20 days', 'MOMO 0901000012');

-- -----------------------------------------------------------------------------
-- 9. TIMEKEEPING  (chấm công) - from the 1st of last month to yesterday, some days skipped
-- -----------------------------------------------------------------------------
do $$
declare
  e       record;
  d       date;
  v_from  date := (date_trunc('month', current_date) - interval '1 month')::date;
  v_to    date := current_date - 1;
  v_r     numeric;
  v_shift text;
begin
  for e in select * from public.employees order by code loop
    d := greatest(v_from, coalesce(e.start_date, v_from));
    while d <= v_to loop
      v_r := random();
      if e.employment_type = 'full_time' then
        -- Sunday off + ~8% random absences
        if extract(isodow from d) <> 7 and v_r > 0.08 then
          insert into public.timekeeping (employee_id, work_date, shift, check_in, check_out, note)
          values (e.id, d, 'Full', time '09:00',
                  case when random() < 0.25 then time '18:00' else time '17:00' end,
                  case when random() < 0.05 then 'Tăng ca' else null end);
        end if;
      else
        -- part-time: ~65% of days, one of three shifts (Tối is an overnight shift for security)
        if v_r < 0.65 then
          v_shift := (array['Sáng', 'Chiều', 'Tối'])[1 + floor(random() * 3)::int];
          if e.position = 'Bảo vệ' then
            insert into public.timekeeping (employee_id, work_date, shift, check_in, check_out)
            values (e.id, d, 'Tối', time '18:00', time '02:00');     -- overnight: 8h
          else
            insert into public.timekeeping (employee_id, work_date, shift, check_in, check_out)
            values (e.id, d, v_shift,
                    case v_shift when 'Sáng' then time '07:00' when 'Chiều' then time '11:00' else time '17:00' end,
                    case v_shift when 'Sáng' then time '11:00' when 'Chiều' then time '15:00' else time '22:00' end);
          end if;
          -- occasionally a second shift the same day
          if random() < 0.15 and e.position <> 'Bảo vệ' and v_shift <> 'Tối' then
            insert into public.timekeeping (employee_id, work_date, shift, check_in, check_out)
            values (e.id, d, 'Tối', time '17:00', time '22:00')
            on conflict do nothing;
          end if;
        end if;
      end if;
      d := d + 1;
    end loop;
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- 10. PAYROLL  (kỳ lương): last month generated + finalized + paid; this month draft
-- -----------------------------------------------------------------------------
do $$
declare
  v_last_start date := (date_trunc('month', current_date) - interval '1 month')::date;
  v_last_end   date := (date_trunc('month', current_date) - interval '1 day')::date;
  v_cur_start  date := date_trunc('month', current_date)::date;
  v_cur_end    date := (date_trunc('month', current_date) + interval '1 month - 1 day')::date;
  v_last_id    uuid;
  v_cur_id     uuid;
begin
  insert into public.payroll_periods (name, period_start, period_end, note)
  values ('Lương tháng ' || to_char(v_last_start, 'MM/YYYY'), v_last_start, v_last_end, 'Kỳ lương tháng trước')
  returning id into v_last_id;

  perform public.generate_payroll(v_last_id);

  -- manual adjustments (thưởng / tips / tạm ứng / phạt)
  update public.payroll_items pi set bonus = 1500000, note = 'Thưởng KPI doanh thu'
    from public.employees e where e.id = pi.employee_id and pi.payroll_period_id = v_last_id and e.code = 'NV-001';
  update public.payroll_items pi set bonus = 1000000, tips = 450000
    from public.employees e where e.id = pi.employee_id and pi.payroll_period_id = v_last_id and e.code = 'NV-003';
  update public.payroll_items pi set tips = 650000
    from public.employees e where e.id = pi.employee_id and pi.payroll_period_id = v_last_id and e.code = 'NV-005';
  update public.payroll_items pi set advance_deduction = 2000000, note = 'Tạm ứng ngày 15'
    from public.employees e where e.id = pi.employee_id and pi.payroll_period_id = v_last_id and e.code = 'NV-004';
  update public.payroll_items pi set penalty = 200000, note = 'Đi trễ 4 lần'
    from public.employees e where e.id = pi.employee_id and pi.payroll_period_id = v_last_id and e.code = 'NV-007';
  update public.payroll_items pi set tips = 300000
    from public.employees e where e.id = pi.employee_id and pi.payroll_period_id = v_last_id and e.code = 'NV-008';

  perform public.finalize_payroll(v_last_id);
  perform public.pay_payroll(v_last_id, 'bank_transfer', public.local_day_start(v_cur_start + 4) + interval '10 hours');

  insert into public.payroll_periods (name, period_start, period_end, note)
  values ('Lương tháng ' || to_char(v_cur_start, 'MM/YYYY'), v_cur_start, v_cur_end, 'Kỳ lương tháng hiện tại (nháp)')
  returning id into v_cur_id;
  perform public.generate_payroll(v_cur_id);
end $$;

-- -----------------------------------------------------------------------------
-- 11. EXPENSES  (chi phí cố định & vận hành) - 3 months, mixed pending/paid
-- -----------------------------------------------------------------------------
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
  ('Khác',      'variable', 'Chi phí khác');

-- m = months back (0 = this month), d = day of month
create temp table tmp_expenses (cat text, title text, amount numeric, m int, d int, status public.expense_status, method public.payment_method, vendor text, invoice text);
insert into tmp_expenses values
  ('Mặt bằng',  'Thuê mặt bằng',                   25000000, 2, 1,  'paid',    'bank_transfer', 'Chủ nhà - Ông Trần Văn Bảy', null),
  ('Mặt bằng',  'Thuê mặt bằng',                   25000000, 1, 1,  'paid',    'bank_transfer', 'Chủ nhà - Ông Trần Văn Bảy', null),
  ('Mặt bằng',  'Thuê mặt bằng',                   25000000, 0, 1,  'pending', null,            'Chủ nhà - Ông Trần Văn Bảy', null),
  ('Điện',      'Tiền điện',                       6200000,  2, 8,  'paid',    'bank_transfer', 'EVN HCMC', 'PE-000812'),
  ('Điện',      'Tiền điện',                       6850000,  1, 8,  'paid',    'bank_transfer', 'EVN HCMC', 'PE-000913'),
  ('Điện',      'Tiền điện',                       6400000,  0, 8,  'pending', null,            'EVN HCMC', 'PE-001004'),
  ('Nước',      'Tiền nước',                       1250000,  2, 10, 'paid',    'cash',          'SAWACO', null),
  ('Nước',      'Tiền nước',                       1380000,  1, 10, 'paid',    'cash',          'SAWACO', null),
  ('Nước',      'Tiền nước',                       1300000,  0, 9,  'pending', null,            'SAWACO', null),
  ('Gas',       'Gas công nghiệp 4 bình 45kg',     4600000,  2, 5,  'paid',    'cash',          'Gas Petrolimex', null),
  ('Gas',       'Gas công nghiệp 4 bình 45kg',     4600000,  1, 5,  'paid',    'cash',          'Gas Petrolimex', null),
  ('Gas',       'Gas công nghiệp 2 bình 45kg',     2300000,  0, 4,  'paid',    'cash',          'Gas Petrolimex', null),
  ('Marketing', 'Facebook Ads tháng',              3000000,  1, 15, 'paid',    'bank_transfer', 'Meta Platforms', 'FB-INV-77120'),
  ('Marketing', 'Chụp ảnh menu mới',               2500000,  1, 22, 'paid',    'cash',          'Studio Ánh Sáng', null),
  ('Marketing', 'Facebook Ads tháng',              3000000,  0, 3,  'pending', null,            'Meta Platforms', null),
  ('Sửa chữa',  'Sửa máy lạnh khu A',              1800000,  1, 18, 'paid',    'cash',          'Điện lạnh Minh Phát', null),
  ('Sửa chữa',  'Thay bếp gas đôi',                3200000,  0, 6,  'pending', null,            'Thiết bị bếp Sài Gòn', 'TBSG-2210'),
  ('Bảo trì',   'Bảo trì hệ thống hút khói',       1500000,  2, 20, 'paid',    'bank_transfer', 'Kỹ thuật Nam Việt', null),
  ('Khấu hao',  'Khấu hao thiết bị bếp & nội thất',3000000,  2, 28, 'paid',    'bank_transfer', null, null),
  ('Khấu hao',  'Khấu hao thiết bị bếp & nội thất',3000000,  1, 28, 'paid',    'bank_transfer', null, null),
  ('Phần mềm',  'Phần mềm quản lý & POS',          500000,   2, 2,  'paid',    'bank_transfer', 'Phần mềm ABC', null),
  ('Phần mềm',  'Phần mềm quản lý & POS',          500000,   1, 2,  'paid',    'bank_transfer', 'Phần mềm ABC', null),
  ('Phần mềm',  'Phần mềm quản lý & POS',          500000,   0, 2,  'paid',    'bank_transfer', 'Phần mềm ABC', null),
  ('Khác',      'Đồng phục nhân viên',             1800000,  2, 12, 'paid',    'cash',          'May Thanh Tâm', null),
  ('Khác',      'Phí vệ sinh, rác',                400000,   1, 25, 'paid',    'cash',          null, null);

insert into public.expense_records (category_id, title, amount, expense_date, status, payment_method, vendor, invoice_number, paid_at)
select c.id, t.title, t.amount,
       least((date_trunc('month', current_date) - (t.m || ' months')::interval)::date + (t.d - 1), current_date),
       t.status, t.method, t.vendor, t.invoice,
       case when t.status = 'paid'
            then public.local_day_start(least((date_trunc('month', current_date) - (t.m || ' months')::interval)::date + (t.d - 1), current_date)) + interval '14 hours'
            else null end
  from tmp_expenses t
  join public.expense_categories c on c.name = t.cat;

-- -----------------------------------------------------------------------------
-- 12. SALES ORDERS  (đơn bán hàng) - 1000 orders over the last 45 days via create_order (~22/day)
--     Weighted random items so menu engineering shows all four classes.
-- -----------------------------------------------------------------------------
create temp table tmp_menu_weights (menu_code text, weight numeric);
insert into tmp_menu_weights values
  ('KV-01',5), ('KV-02',6), ('KV-03',4), ('KV-04',1.5), ('KV-05',2),
  ('MC-01',6), ('MC-02',6), ('MC-03',5), ('MC-04',1.5), ('MC-05',3), ('MC-06',1.2), ('MC-07',1.5),
  ('CB-01',6), ('CB-02',7), ('CB-03',4), ('CB-04',7), ('CB-05',1), ('CB-06',5), ('CB-07',1.5),
  ('DU-01',8), ('DU-02',12), ('DU-03',9), ('DU-04',8), ('DU-05',1.5), ('DU-06',6), ('DU-07',3),
  ('TM-01',1.5), ('TM-02',2), ('TM-03',1.2), ('TM-04',0.8);

create temp table tmp_weighted as
select m.id as menu_item_id, w.weight,
       sum(w.weight) over (order by w.menu_code rows between unbounded preceding and current row) as cum,
       sum(w.weight) over () as total
  from tmp_menu_weights w join public.menu_items m on m.code = w.menu_code;

do $$
declare
  i          int;
  j          int;
  v_lines    int;
  v_items    jsonb;
  v_pick     numeric;
  v_mi       uuid;
  v_day      int;
  v_ts       timestamptz;
  v_discount numeric;
  v_subtotal numeric;
  v_order    uuid;
  v_method   public.payment_method;
  v_count    int := 0;
begin
  for i in 1..1000 loop
    -- first 10 orders are today (so the dashboard has data), the rest spread over the previous 44 days;
    -- time between 10:30 and 21:30 local (today's orders never in the future)
    if i <= 10 then v_day := 0; else v_day := 1 + floor(random() * 44)::int; end if;
    v_ts  := least(now(), public.local_day_start(current_date - v_day) + interval '10 hours 30 minutes'
             + (floor(random() * 660)::int || ' minutes')::interval);

    v_lines := (array[1, 2, 2, 3, 3, 3, 4, 4, 5, 6])[1 + floor(random() * 10)::int];   -- 1..6 lines, mostly 2-4
    v_items := '[]'::jsonb;
    for j in 1..v_lines loop
      v_pick := random() * (select max(total) from tmp_weighted);
      select menu_item_id into v_mi from tmp_weighted where cum >= v_pick order by cum limit 1;
      v_items := v_items || jsonb_build_object('menu_item_id', v_mi, 'quantity', case when random() < 0.7 then 1 else 2 end);
    end loop;

    v_method := case when random() < 0.55 then 'cash' else 'bank_transfer' end;

    v_order := public.create_order(v_items, v_ts, 'B' || (1 + floor(random() * 15)::int), 0, v_method, null);
    v_count := v_count + 1;

    -- ~10% of orders get a small discount (rounded to 1,000 VND)
    if random() < 0.10 then
      select subtotal into v_subtotal from public.orders where id = v_order;
      v_discount := floor(v_subtotal * (0.05 + random() * 0.05) / 1000) * 1000;
      update public.orders set discount = v_discount, note = 'Giảm giá khách quen' where id = v_order;
    end if;
  end loop;

  -- cancel a handful of orders (stock returned by trigger)
  for v_order in select id from public.orders order by random() limit 15 loop
    perform public.cancel_order(v_order);
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- 13. WASTE & STOCKTAKE  (hao hụt / kiểm kê)
-- -----------------------------------------------------------------------------
-- Backdated waste rows (inserted straight into the ledger: the ledger trigger moves the stock)
insert into public.inventory_transactions (ingredient_id, txn_type, quantity, reference_type, note, created_at)
select i.id, 'waste', -w.qty, 'manual', w.note, public.local_day_start(current_date - w.days_ago) + interval '21 hours'
  from (values
    ('NL-010', 800,  38, 'Xà lách héo, hủy'),
    ('NL-006', 400,  33, 'Tôm chết, không đạt chất lượng'),
    ('NL-011', 600,  27, 'Cà chua dập'),
    ('NL-039', 500,  20, 'Sữa tươi hết hạn'),
    ('NL-001', 300,  14, 'Bò thăn quá hạn bảo quản'),
    ('NL-021', 900,  9,  'Xoài chín quá, hủy'),
    ('NL-024', 1200, 3,  'Bún tươi hỏng cuối ngày')
  ) as w(ing_code, qty, days_ago, note)
  join public.ingredients i on i.code = w.ing_code;

-- Today's stocktake via RPC (counted stock -> delta), one waste and one adjustment via RPC
do $$
declare v_stock numeric;
begin
  select current_stock into v_stock from public.ingredients where code = 'NL-002';
  perform public.record_stock_adjustment((select id from public.ingredients where code = 'NL-002'), 'stocktake', v_stock - 250, 'Kiểm kê tuần - thiếu hụt');
  select current_stock into v_stock from public.ingredients where code = 'NL-031';
  perform public.record_stock_adjustment((select id from public.ingredients where code = 'NL-031'), 'stocktake', v_stock + 120, 'Kiểm kê tuần - thừa so với sổ');
  select current_stock into v_stock from public.ingredients where code = 'NL-044';
  perform public.record_stock_adjustment((select id from public.ingredients where code = 'NL-044'), 'stocktake', v_stock, 'Kiểm kê tuần - khớp sổ');
  perform public.record_stock_adjustment((select id from public.ingredients where code = 'NL-014'), 'waste', 150, 'Rau thơm úng');
  perform public.record_stock_adjustment((select id from public.ingredients where code = 'NL-045'), 'adjustment', 2, 'Nhập bổ sung 2 lon từ kho phụ');
end $$;

-- -----------------------------------------------------------------------------
-- 14. WRAP-UP
-- -----------------------------------------------------------------------------
update public.app_settings set value = 'false'::jsonb where key = 'allow_negative_stock';

set client_min_messages = notice;
do $$
declare
  v_neg int;
  v_low int;
begin
  select count(*) into v_neg from public.ingredients where current_stock < 0;
  select count(*) into v_low from public.ingredients where current_stock < min_alert_stock;
  raise notice '=== SEED SUMMARY ===';
  raise notice 'suppliers=% ingredients=% menu_items=% recipes=%',
    (select count(*) from public.suppliers), (select count(*) from public.ingredients),
    (select count(*) from public.menu_items), (select count(*) from public.recipes);
  raise notice 'purchase_orders=% po_items=% supplier_payments=% allocations=% total_debt=%',
    (select count(*) from public.purchase_orders), (select count(*) from public.purchase_order_items),
    (select count(*) from public.supplier_payments), (select count(*) from public.supplier_payment_allocations),
    (select sum(current_debt) from public.suppliers);
  raise notice 'orders=% (cancelled %) order_items=% ledger_rows=% negative_stock=% low_stock=%',
    (select count(*) from public.orders), (select count(*) from public.orders where status = 'cancelled'),
    (select count(*) from public.order_items), (select count(*) from public.inventory_transactions), v_neg, v_low;
  raise notice 'employees=% timekeeping=% payroll_periods=% payroll_items=% expenses=%',
    (select count(*) from public.employees), (select count(*) from public.timekeeping),
    (select count(*) from public.payroll_periods), (select count(*) from public.payroll_items),
    (select count(*) from public.expense_records);
  raise notice 'demo login: admin@restaurant.local / Admin@123';
end $$;

commit;
