-- Migration: Tạo tài khoản SuperAdmin chính thức cho Restaurant ERP
-- Email: superadmin@restaurant.com
-- Password: SuperAdmin@2026!
-- Role: owner (Toàn quyền quản trị cao nhất)

create extension if not exists "pgcrypto";

do $$
declare
  v_uid   uuid := 'a0000000-0000-4000-8000-000000000099';
  v_email text := 'superadmin@restaurant.com';
  v_pass  text := 'SuperAdmin@2026!';
  v_cols  text[] := array['instance_id', 'id', 'aud', 'role', 'email', 'encrypted_password', 'raw_app_meta_data', 'raw_user_meta_data', 'created_at', 'updated_at'];
  v_vals  text[] := array[
    quote_literal('00000000-0000-0000-0000-000000000000') || '::uuid',
    quote_literal(v_uid::text) || '::uuid',
    quote_literal('authenticated'),
    quote_literal('authenticated'),
    quote_literal(v_email),
    'crypt(' || quote_literal(v_pass) || ', gen_salt(''bf''))',
    quote_literal('{"provider":"email","providers":["email"]}') || '::jsonb',
    quote_literal('{"full_name":"Super Admin"}') || '::jsonb',
    'now()', 'now()'];
begin
  -- 1. Thêm các cột xác thực email tùy phiên bản Supabase Auth
  if exists (select 1 from information_schema.columns where table_schema = 'auth' and table_name = 'users' and column_name = 'email_confirmed_at') then
    v_cols := array_append(v_cols, ('email_confirmed_at')::text);
    v_vals := array_append(v_vals, ('now()')::text);
  elsif exists (select 1 from information_schema.columns where table_schema = 'auth' and table_name = 'users' and column_name = 'confirmed_at') then
    v_cols := array_append(v_cols, ('confirmed_at')::text);
    v_vals := array_append(v_vals, ('now()')::text);
  end if;

  if exists (select 1 from information_schema.columns where table_schema = 'auth' and table_name = 'users' and column_name = 'is_sso_user') then
    v_cols := array_append(v_cols, ('is_sso_user')::text);
    v_vals := array_append(v_vals, ('false')::text);
  end if;

  if exists (select 1 from information_schema.columns where table_schema = 'auth' and table_name = 'users' and column_name = 'is_anonymous') then
    v_cols := array_append(v_cols, ('is_anonymous')::text);
    v_vals := array_append(v_vals, ('false')::text);
  end if;

  -- 2. Chèn vào auth.users (nếu chưa có thì insert, nếu có rồi thì update password)
  execute format(
    'insert into auth.users (%s) values (%s)
     on conflict (id) do update set encrypted_password = crypt(%L, gen_salt(''bf'')), updated_at = now()',
    (select string_agg(quote_ident(x), ', ') from unnest(v_cols) x),
    array_to_string(v_vals, ', '),
    v_pass
  );

  -- 3. Tạo identity trong auth.identities
  if to_regclass('auth.identities') is not null then
    execute format(
      'insert into auth.identities (id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
       values (gen_random_uuid(), %L, %L::uuid, %L::jsonb, ''email'', now(), now(), now())
       on conflict (provider_id, provider) do nothing',
      v_uid::text, v_uid::text,
      jsonb_build_object('sub', v_uid::text, 'email', v_email, 'email_verified', true, 'phone_verified', false)::text
    );
  end if;

  -- 4. Đảm bảo hồ sơ profile có role = owner (Superadmin cao nhất)
  insert into public.profiles (id, full_name, role)
  values (v_uid, 'Super Admin', 'owner')
  on conflict (id) do update
  set full_name = 'Super Admin',
      role = 'owner',
      updated_at = now();

  raise notice 'Tài khoản SuperAdmin đã sẵn sàng: % / % (role: owner)', v_email, v_pass;
end $$;
