-- Migration: Thêm các RPC quản trị tài khoản cho Owner
-- Cho phép Owner tạo, liệt kê, đổi mật khẩu và xóa tài khoản nhân sự trực tiếp từ ERP

create extension if not exists "pgcrypto";

-- 1. Tạo tài khoản người dùng mới (chỉ Owner)
create or replace function public.admin_create_user(
  p_email text,
  p_password text,
  p_full_name text,
  p_role public.user_role
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_uid uuid := gen_random_uuid();
  v_cols text[] := array['instance_id', 'id', 'aud', 'role', 'email', 'encrypted_password', 'raw_app_meta_data', 'raw_user_meta_data', 'created_at', 'updated_at'];
  v_vals text[];
begin
  -- Bảo vệ: Chỉ Chủ nhà hàng (owner) mới được tạo tài khoản
  if public.current_user_role() <> 'owner' then
    raise exception 'PERMISSION_DENIED: Chỉ Chủ nhà hàng mới có quyền tạo tài khoản';
  end if;

  if exists (select 1 from auth.users where email = p_email) then
    raise exception 'EMAIL_EXISTS: Email này đã được sử dụng trong hệ thống';
  end if;

  v_vals := array[
    quote_literal('00000000-0000-0000-0000-000000000000') || '::uuid',
    quote_literal(v_uid::text) || '::uuid',
    quote_literal('authenticated'),
    quote_literal('authenticated'),
    quote_literal(p_email),
    'crypt(' || quote_literal(p_password) || ', gen_salt(''bf''))',
    quote_literal('{"provider":"email","providers":["email"]}') || '::jsonb',
    json_build_object('full_name', p_full_name)::text || '::jsonb',
    'now()', 'now()'
  ];

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

  execute format(
    'insert into auth.users (%s) values (%s)',
    (select string_agg(quote_ident(x), ', ') from unnest(v_cols) x),
    array_to_string(v_vals, ', ')
  );

  if to_regclass('auth.identities') is not null then
    execute format(
      'insert into auth.identities (id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
       values (gen_random_uuid(), %L, %L::uuid, %L::jsonb, ''email'', now(), now(), now())',
      v_uid::text, v_uid::text,
      jsonb_build_object('sub', v_uid::text, 'email', p_email, 'email_verified', true, 'phone_verified', false)::text
    );
  end if;

  insert into public.profiles (id, full_name, role)
  values (v_uid, p_full_name, p_role)
  on conflict (id) do update
  set full_name = excluded.full_name,
      role = excluded.role,
      updated_at = now();

  return v_uid;
end;
$$;

grant execute on function public.admin_create_user(text, text, text, public.user_role) to authenticated, service_role;

-- 2. Liệt kê danh sách người dùng kèm vai trò (chỉ Owner)
create or replace function public.admin_list_users()
returns table (
  id uuid,
  email text,
  full_name text,
  role public.user_role,
  created_at timestamptz,
  last_sign_in_at timestamptz
)
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if public.current_user_role() <> 'owner' then
    raise exception 'PERMISSION_DENIED: Chỉ Chủ nhà hàng mới có quyền xem danh sách tài khoản';
  end if;

  return query
  select 
    u.id,
    u.email::text,
    coalesce(p.full_name, (u.raw_user_meta_data->>'full_name'), 'Người dùng'::text) as full_name,
    coalesce(p.role, 'staff'::user_role) as role,
    u.created_at,
    u.last_sign_in_at
  from auth.users u
  left join public.profiles p on p.id = u.id
  order by u.created_at desc;
end;
$$;

grant execute on function public.admin_list_users() to authenticated, service_role;

-- 3. Đặt lại mật khẩu người dùng (chỉ Owner)
create or replace function public.admin_reset_user_password(
  p_user_id uuid,
  p_new_password text
)
returns boolean
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if public.current_user_role() <> 'owner' then
    raise exception 'PERMISSION_DENIED: Chỉ Chủ nhà hàng mới có quyền đặt lại mật khẩu';
  end if;

  update auth.users
  set encrypted_password = crypt(p_new_password, gen_salt('bf')),
      updated_at = now()
  where id = p_user_id;

  return true;
end;
$$;

grant execute on function public.admin_reset_user_password(uuid, text) to authenticated, service_role;

-- 4. Xóa tài khoản người dùng (chỉ Owner)
create or replace function public.admin_delete_user(p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if public.current_user_role() <> 'owner' then
    raise exception 'PERMISSION_DENIED: Chỉ Chủ nhà hàng mới có quyền xóa tài khoản';
  end if;

  if p_user_id = auth.uid() then
    raise exception 'CANNOT_DELETE_SELF: Không thể tự xóa tài khoản của chính mình';
  end if;

  delete from auth.users where id = p_user_id;
  return true;
end;
$$;

grant execute on function public.admin_delete_user(uuid) to authenticated, service_role;
