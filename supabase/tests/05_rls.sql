-- 05_rls.sql
-- Spec: RLS on every table; anon sees nothing and cannot write; authenticated has full access; anon must not be able to run mutating RPCs.
begin;
create function pg_temp.chk_num(p_name text, p_expected numeric, p_actual numeric, p_tol numeric default 0.01) returns void language plpgsql as $$
begin
  if p_actual is null or abs(p_actual - p_expected) > p_tol then raise exception 'FAIL %: expected % got %', p_name, p_expected, p_actual; end if;
  raise notice 'PASS %', p_name;
end $$;
create function pg_temp.chk_txt(p_name text, p_expected text, p_actual text) returns void language plpgsql as $$
begin
  if p_actual is distinct from p_expected then raise exception 'FAIL %: expected % got %', p_name, p_expected, p_actual; end if;
  raise notice 'PASS %', p_name;
end $$;
-- expects p_sql to fail with an RLS / privilege error
create function pg_temp.chk_denied(p_name text, p_sql text, p_extra text default null) returns void language plpgsql as $$
begin
  execute p_sql;
  raise exception 'FAIL %: expected RLS/privilege error got success', p_name;
exception when others then
  if sqlerrm like '%row-level security%' or sqlerrm like '%permission denied%' or (p_extra is not null and sqlerrm like p_extra || '%')
  then raise notice 'PASS %', p_name; else raise; end if;
end $$;
create temp table t05 (k text primary key, n bigint, u uuid);
insert into t05 select 'ingredients', count(*), (select id from ingredients order by code limit 1) from ingredients;
insert into t05 select 'orders', count(*), null from orders;
insert into t05 select 'menu_items', count(*), (select id from menu_items order by code limit 1) from menu_items;
grant select on t05 to anon, authenticated;

-- 1. every public table has RLS enabled and at least one policy
do $$
declare v text;
begin
  select string_agg(c.relname, ',') into v from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity;
  if v is not null then raise exception 'FAIL rls_enabled_all_tables: tables without RLS: %', v; end if;
  raise notice 'PASS rls_enabled_all_tables';
  select string_agg(c.relname, ',') into v from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r', 'p') and not exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname);
  if v is not null then raise exception 'FAIL rls_policy_all_tables: tables without any policy: %', v; end if;
  raise notice 'PASS rls_policy_all_tables';
  if (select n from t05 where k = 'ingredients') < 10 then
    raise exception 'FAIL rls_seed_has_ingredients: expected the seed to load ingredients, got %', (select n from t05 where k = 'ingredients');
  end if;
  raise notice 'PASS rls_seed_has_ingredients';
end $$;

-- 2. anon: NO privileges at all on public tables/views (D2: revoked, RLS is not the only barrier) and no writes
set local role anon;
-- Both claim shapes: real Supabase reads request.jwt.claims, the bare supabase/postgres
-- image ships the older auth.uid()/auth.role() that only read request.jwt.claim.<key>.
set local request.jwt.claims = '{"role":"anon"}';
set local request.jwt.claim.role = 'anon';
set local request.jwt.claim.sub = '';
do $$
begin
  perform pg_temp.chk_txt('anon_role_active', 'anon', current_user);
  perform pg_temp.chk_denied('anon_select_ingredients_denied', 'select count(*) from ingredients');
  perform pg_temp.chk_denied('anon_select_orders_denied', 'select count(*) from orders');
  perform pg_temp.chk_denied('anon_select_suppliers_denied', 'select count(*) from suppliers');
  perform pg_temp.chk_denied('anon_select_profiles_denied', 'select count(*) from profiles');
  perform pg_temp.chk_denied('anon_view_menu_costs_denied', 'select count(*) from v_menu_item_costs');
  perform pg_temp.chk_denied('anon_view_debt_summary_denied', 'select count(*) from v_supplier_debt_summary');
  perform pg_temp.chk_denied('anon_insert_ingredient_denied', $q$insert into ingredients (code, name, base_unit, import_unit, conversion_factor) values ('T05-ANON', 'x', 'g', 'kg', 1000)$q$);
  perform pg_temp.chk_denied('anon_insert_supplier_denied', $q$insert into suppliers (code, name) values ('T05-ANON', 'x')$q$);
  perform pg_temp.chk_denied('anon_update_settings_denied', $q$update app_settings set value = 'true'::jsonb where key = 'allow_negative_stock'$q$);
  perform pg_temp.chk_denied('anon_update_ingredients_denied', $q$update ingredients set note = 'x'$q$);
  perform pg_temp.chk_denied('anon_delete_order_items_denied', $q$delete from order_items$q$);
end $$;

-- 3. authenticated (demo user claims): full read/write; created_by stamped from the JWT sub
set local role authenticated;
set local request.jwt.claims = '{"role":"authenticated","sub":"a0000000-0000-4000-8000-000000000001"}';
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claim.sub = 'a0000000-0000-4000-8000-000000000001';
do $$
declare v_id uuid; v_ord uuid; v_mi uuid; v_n int;
begin
  perform pg_temp.chk_txt('auth_role_active', 'authenticated', current_user);
  perform pg_temp.chk_txt('auth_uid_from_claims', 'a0000000-0000-4000-8000-000000000001', auth.uid()::text);
  perform pg_temp.chk_num('auth_select_ingredients_all', (select n from t05 where k = 'ingredients'), (select count(*) from ingredients));
  perform pg_temp.chk_num('auth_select_orders_all', (select n from t05 where k = 'orders'), (select count(*) from orders));
  insert into ingredients (code, name, base_unit, import_unit, conversion_factor) values ('T05-AUTH', 'Test auth', 'g', 'kg', 1000) returning id into v_id;
  perform pg_temp.chk_num('auth_insert_ingredient_visible', 1, (select count(*) from ingredients where id = v_id));
  update ingredients set note = 'edited' where id = v_id;
  perform pg_temp.chk_txt('auth_update_ingredient', 'edited', (select note from ingredients where id = v_id));
  delete from ingredients where id = v_id;
  perform pg_temp.chk_num('auth_delete_ingredient', 0, (select count(*) from ingredients where id = v_id));
  select id into v_mi from v_menu_item_costs where is_active and not missing_recipe order by code limit 1;
  v_ord := create_order(jsonb_build_array(jsonb_build_object('menu_item_id', v_mi, 'quantity', 1)), now(), 'T05', 0, 'cash', null);
  perform pg_temp.chk_txt('auth_rpc_create_order_created_by', 'a0000000-0000-4000-8000-000000000001', (select created_by::text from orders where id = v_ord));
  perform pg_temp.chk_num('auth_rpc_order_visible', 1, (select count(*) from orders where id = v_ord));
  perform cancel_order(v_ord);
  perform pg_temp.chk_txt('auth_rpc_cancel_order', 'cancelled', (select status::text from orders where id = v_ord));
  perform pg_temp.chk_num('auth_profiles_readable', 1, (select count(*) from profiles where id = auth.uid()));
  update profiles set full_name = 'Me' where id = auth.uid(); get diagnostics v_n = row_count;
  perform pg_temp.chk_num('auth_profiles_update_own', 1, v_n);
end $$;

-- 4. anon and mutating RPCs: the call must fail, AND anon must not hold EXECUTE (D2)
set local role anon;
-- Both claim shapes: real Supabase reads request.jwt.claims, the bare supabase/postgres
-- image ships the older auth.uid()/auth.role() that only read request.jwt.claim.<key>.
set local request.jwt.claims = '{"role":"anon"}';
set local request.jwt.claim.role = 'anon';
set local request.jwt.claim.sub = '';
do $$
declare v_mi uuid := (select u from t05 where k = 'menu_items'); v text;
begin
  perform pg_temp.chk_denied('anon_sees_no_menu_items', 'select count(*) from menu_items');
  perform pg_temp.chk_denied('anon_call_create_order_denied', format($q$select create_order(jsonb_build_array(jsonb_build_object('menu_item_id', %L, 'quantity', 1)))$q$, coalesce(v_mi, gen_random_uuid())));
  -- a real ingredient id: anon cannot see the row, so the RPC must refuse (RLS error or NOT_FOUND from the RLS-filtered lookup)
  perform pg_temp.chk_denied('anon_call_record_stock_adjustment_denied', format($q$select record_stock_adjustment(%L, 'waste', 1, null)$q$, (select u from t05 where k = 'ingredients')), 'INGREDIENT_NOT_FOUND');
  select string_agg(p.proname, ',' order by p.proname) into v
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('create_purchase_order', 'record_supplier_payment', 'create_order', 'cancel_order', 'record_stock_adjustment',
                       'generate_payroll', 'finalize_payroll', 'pay_payroll')
     and has_function_privilege('anon', p.oid, 'execute');
  if v is not null then raise exception 'FAIL anon_no_execute_on_mutating_rpcs: expected none got anon EXECUTE on: %', v; end if;
  raise notice 'PASS anon_no_execute_on_mutating_rpcs';
end $$;
reset role;
rollback;
