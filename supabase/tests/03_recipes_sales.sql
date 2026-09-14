-- 03_recipes_sales.sql
-- Spec: Module 2 (BOM cost = qty*(1+waste%)*avg_cost, ideal cost / CM / food cost %, menu engineering 30d)
--       + sales flow (create_order deducts stock per recipe, COGS snapshot, cancel restores stock).
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

create temp table t03 (k text primary key, v uuid);

-- Setup: X 10 kg @200,000 -> 10,000 g @200/g ; Y 5 lít @50,000 -> 5,000 ml @50/ml ; Z 1 kg @1,000,000 -> 1,000 g @1,000/g ; M1 (150,000): X 200 g w10% + Y 50 ml ; M0: no recipe
do $$
declare v_sup uuid; v_x uuid; v_y uuid; v_z uuid; v_m1 uuid; v_m0 uuid;
begin
  insert into suppliers (code, name, payment_terms_days) values ('T03-SUP', 'Test NCC 03', 0) returning id into v_sup;
  insert into ingredients (code, name, base_unit, import_unit, conversion_factor) values ('T03-X', 'Test X', 'g', 'kg', 1000), ('T03-Y', 'Test Y', 'ml', 'lít', 1000), ('T03-Z', 'Test Z', 'g', 'kg', 1000);
  select id into v_x from ingredients where code = 'T03-X'; select id into v_y from ingredients where code = 'T03-Y'; select id into v_z from ingredients where code = 'T03-Z';
  perform create_purchase_order(v_sup, current_date, null, null, null, jsonb_build_array(
    jsonb_build_object('ingredient_id', v_x, 'quantity', 10, 'unit_price', 200000),
    jsonb_build_object('ingredient_id', v_y, 'quantity', 5,  'unit_price', 50000),
    jsonb_build_object('ingredient_id', v_z, 'quantity', 1,  'unit_price', 1000000)));
  insert into menu_items (code, name, selling_price) values ('T03-M1', 'Test món 1', 150000) returning id into v_m1;
  insert into menu_items (code, name, selling_price) values ('T03-M0', 'Test món trống', 80000) returning id into v_m0;
  insert into recipes (menu_item_id, ingredient_id, quantity, waste_percent) values (v_m1, v_x, 200, 10), (v_m1, v_y, 50, 0);
  insert into t03 values ('sup', v_sup), ('x', v_x), ('y', v_y), ('z', v_z), ('m1', v_m1), ('m0', v_m0);
  perform pg_temp.chk_num('setup_x_avg_200', 200, (select avg_cost_price from ingredients where id = v_x), 0.0001);
  perform pg_temp.chk_num('setup_y_avg_50', 50, (select avg_cost_price from ingredients where id = v_y), 0.0001);
  perform pg_temp.chk_num('setup_z_avg_1000', 1000, (select avg_cost_price from ingredients where id = v_z), 0.0001);
end $$;
-- v_recipe_costs: X 200*(1+10/100)=220 g -> 220*200 = 44,000 ; Y 50*50 = 2,500  |  v_menu_item_costs: ideal 46,500 ; CM 103,500 ; food cost 31.00%
do $$
declare v_m1 uuid := (select v from t03 where k = 'm1'); v_m0 uuid := (select v from t03 where k = 'm0');
        v_x uuid := (select v from t03 where k = 'x'); v_y uuid := (select v from t03 where k = 'y'); v_sup uuid := (select v from t03 where k = 'sup');
        rc record; mc record;
begin
  select * into rc from v_recipe_costs where menu_item_id = v_m1 and ingredient_id = v_x;
  perform pg_temp.chk_num('rc_x_effective_qty', 220, rc.effective_quantity, 0.001);
  perform pg_temp.chk_num('rc_x_component_cost', 44000, rc.component_cost);
  perform pg_temp.chk_num('rc_x_avg_cost', 200, rc.avg_cost_price, 0.0001);
  select * into rc from v_recipe_costs where menu_item_id = v_m1 and ingredient_id = v_y;
  perform pg_temp.chk_num('rc_y_component_cost', 2500, rc.component_cost);
  select * into mc from v_menu_item_costs where id = v_m1;
  perform pg_temp.chk_num('mc_ideal_cost', 46500, mc.ideal_cost);
  perform pg_temp.chk_num('mc_contribution_margin', 103500, mc.contribution_margin);
  perform pg_temp.chk_num('mc_food_cost_pct', 31.00, mc.food_cost_pct);
  perform pg_temp.chk_num('mc_ingredient_count', 2, mc.ingredient_count);
  perform pg_temp.chk_txt('mc_missing_recipe_false', 'false', mc.missing_recipe::text);
  select * into mc from v_menu_item_costs where id = v_m0;
  perform pg_temp.chk_num('mc_empty_ideal_zero', 0, mc.ideal_cost);
  perform pg_temp.chk_num('mc_empty_cm_is_price', 80000, mc.contribution_margin);
  perform pg_temp.chk_txt('mc_empty_missing_recipe', 'true', mc.missing_recipe::text);
  -- realtime: a new import at 300,000/kg moves X avg to (10000*200+10000*300)/20000 = 250 -> ideal 220*250+2500 = 57,500 (probe, rolled back)
  begin
    perform create_purchase_order(v_sup, current_date, null, null, null, jsonb_build_array(jsonb_build_object('ingredient_id', v_x, 'quantity', 10, 'unit_price', 300000)));
    perform pg_temp.chk_num('mc_realtime_ideal_after_price_change', 57500, (select ideal_cost from v_menu_item_costs where id = v_m1));
    perform pg_temp.chk_num('mc_realtime_food_cost_pct', 38.33, (select food_cost_pct from v_menu_item_costs where id = v_m1));
    raise exception 'ROLLBACK_PROBE';
  exception when others then
    if sqlerrm <> 'ROLLBACK_PROBE' then raise; end if;
  end;
  perform pg_temp.chk_num('mc_probe_rolled_back', 46500, (select ideal_cost from v_menu_item_costs where id = v_m1));
end $$;
-- create_order: 3 x M1, discount 10,000 -> X out 220*3 = 660 g (10,000 -> 9,340) ; Y out 150 ml (-> 4,850) ; cogs 3*46,500 = 139,500 ; subtotal 450,000 ; total 440,000
do $$
declare v_m1 uuid := (select v from t03 where k = 'm1'); v_x uuid := (select v from t03 where k = 'x'); v_y uuid := (select v from t03 where k = 'y');
        v_ord uuid; o record; oi record; led record;
begin
  v_ord := create_order(jsonb_build_array(jsonb_build_object('menu_item_id', v_m1, 'quantity', 3)), now(), 'T03', 10000, 'cash', null);
  insert into t03 values ('ord1', v_ord);
  select * into o from orders where id = v_ord;
  perform pg_temp.chk_txt('ord_status_completed', 'completed', o.status::text);
  perform pg_temp.chk_txt('ord_number_prefix', 'ORD-' || to_char(to_local_date(now()), 'YYYYMMDD') || '-', left(o.order_number, 13));
  perform pg_temp.chk_num('ord_subtotal', 450000, o.subtotal);
  perform pg_temp.chk_num('ord_discount', 10000, o.discount);
  perform pg_temp.chk_num('ord_total_amount', 440000, o.total_amount);
  perform pg_temp.chk_num('ord_total_cogs', 139500, o.total_cogs);
  select * into oi from order_items where order_id = v_ord;
  perform pg_temp.chk_num('ord_item_unit_price_snapshot', 150000, oi.unit_price);
  perform pg_temp.chk_num('ord_item_line_total', 450000, oi.line_total);
  perform pg_temp.chk_num('ord_item_cogs_amount', 139500, oi.cogs_amount);
  perform pg_temp.chk_txt('ord_item_name_snapshot', 'Test món 1', oi.menu_item_name);
  perform pg_temp.chk_num('ord_stock_x_9340', 9340, (select current_stock from ingredients where id = v_x), 0.001);
  perform pg_temp.chk_num('ord_stock_y_4850', 4850, (select current_stock from ingredients where id = v_y), 0.001);
  select * into led from inventory_transactions where reference_type = 'order_item' and reference_id = oi.id and ingredient_id = v_x and txn_type = 'sale';
  perform pg_temp.chk_num('ord_ledger_x_qty', -660, led.quantity, 0.001);
  perform pg_temp.chk_num('ord_ledger_x_unit_cost_snapshot', 200, led.unit_cost, 0.0001);
  perform pg_temp.chk_num('ord_ledger_x_total_cost', 132000, led.total_cost);
  perform pg_temp.chk_num('ord_ledger_x_stock_after', 9340, led.stock_after, 0.001);
  select * into led from inventory_transactions where reference_type = 'order_item' and reference_id = oi.id and ingredient_id = v_y and txn_type = 'sale';
  perform pg_temp.chk_num('ord_ledger_y_qty', -150, led.quantity, 0.001);
  perform pg_temp.chk_num('ord_ledger_y_total_cost', 7500, led.total_cost);
  perform pg_temp.chk_num('ord_ledger_sale_rows', 2, (select count(*) from inventory_transactions where reference_id = oi.id and txn_type = 'sale'));
  -- guards
  begin
    perform create_order(jsonb_build_array(jsonb_build_object('menu_item_id', v_m1, 'quantity', 1)), now(), null, 200000, 'cash', null);
    raise exception 'FAIL discount_exceeds_subtotal_raises: expected exception got success';
  exception when others then
    if sqlerrm like 'DISCOUNT_EXCEEDS_SUBTOTAL%' then raise notice 'PASS discount_exceeds_subtotal_raises'; else raise; end if;
  end;
  perform pg_temp.chk_num('discount_guard_stock_untouched', 9340, (select current_stock from ingredients where id = v_x), 0.001);
  begin
    delete from order_items where id = oi.id;
    raise exception 'FAIL order_item_delete_raises: expected exception got success';
  exception when others then
    if sqlerrm like 'ORDER_ITEMS_IMMUTABLE%' then raise notice 'PASS order_item_delete_raises'; else raise; end if;
  end;
end $$;
-- Insufficient stock: 100 x M1 needs 22,000 g X > 9,340 -> raises when allow_negative_stock=false, succeeds when true
do $$
declare v_m1 uuid := (select v from t03 where k = 'm1'); v_x uuid := (select v from t03 where k = 'x'); v_y uuid := (select v from t03 where k = 'y');
        v_ord uuid; v_cnt int := (select count(*) from orders);
begin
  update app_settings set value = 'false'::jsonb where key = 'allow_negative_stock';
  begin
    perform create_order(jsonb_build_array(jsonb_build_object('menu_item_id', v_m1, 'quantity', 100)), now(), null, 0, 'cash', null);
    raise exception 'FAIL insufficient_stock_raises: expected exception got success';
  exception when others then
    if sqlerrm like 'INSUFFICIENT_STOCK%' then raise notice 'PASS insufficient_stock_raises'; else raise; end if;
  end;
  perform pg_temp.chk_num('insufficient_stock_no_order_row', v_cnt, (select count(*) from orders));
  perform pg_temp.chk_num('insufficient_stock_x_unchanged', 9340, (select current_stock from ingredients where id = v_x), 0.001);
  update app_settings set value = 'true'::jsonb where key = 'allow_negative_stock';
  v_ord := create_order(jsonb_build_array(jsonb_build_object('menu_item_id', v_m1, 'quantity', 100)), now(), null, 0, 'cash', null);
  perform pg_temp.chk_num('negative_allowed_x_stock', 9340 - 22000, (select current_stock from ingredients where id = v_x), 0.001);
  perform pg_temp.chk_num('negative_allowed_y_stock', 4850 - 5000, (select current_stock from ingredients where id = v_y), 0.001);
  perform pg_temp.chk_num('negative_allowed_cogs', 4650000, (select total_cogs from orders where id = v_ord));
  perform cancel_order(v_ord);
  perform pg_temp.chk_num('negative_cancel_restores_x', 9340, (select current_stock from ingredients where id = v_x), 0.001);
  update app_settings set value = 'false'::jsonb where key = 'allow_negative_stock';
end $$;
-- cancel_order(ord1): sale_reversal rows mirror the sale rows (+660 X @200, +150 Y @50), stock restored, totals kept; second cancel raises
do $$
declare v_ord uuid := (select v from t03 where k = 'ord1'); v_x uuid := (select v from t03 where k = 'x'); v_y uuid := (select v from t03 where k = 'y');
        v_oi uuid := (select id from order_items where order_id = (select v from t03 where k = 'ord1')); led record; o record;
begin
  perform cancel_order(v_ord);
  select * into o from orders where id = v_ord;
  perform pg_temp.chk_txt('cancel_status', 'cancelled', o.status::text);
  perform pg_temp.chk_num('cancel_total_kept', 440000, o.total_amount);
  perform pg_temp.chk_num('cancel_cogs_kept', 139500, o.total_cogs);
  perform pg_temp.chk_num('cancel_stock_x_restored', 10000, (select current_stock from ingredients where id = v_x), 0.001);
  perform pg_temp.chk_num('cancel_stock_y_restored', 5000, (select current_stock from ingredients where id = v_y), 0.001);
  select * into led from inventory_transactions where reference_id = v_oi and ingredient_id = v_x and txn_type = 'sale_reversal';
  perform pg_temp.chk_num('cancel_reversal_x_qty', 660, led.quantity, 0.001);
  perform pg_temp.chk_num('cancel_reversal_x_unit_cost', 200, led.unit_cost, 0.0001);
  perform pg_temp.chk_num('cancel_reversal_x_stock_after', 10000, led.stock_after, 0.001);
  perform pg_temp.chk_txt('cancel_reversal_reference', 'order_item', led.reference_type);
  select * into led from inventory_transactions where reference_id = v_oi and ingredient_id = v_y and txn_type = 'sale_reversal';
  perform pg_temp.chk_num('cancel_reversal_y_qty', 150, led.quantity, 0.001);
  perform pg_temp.chk_num('cancel_reversal_rows', 2, (select count(*) from inventory_transactions where reference_id = v_oi and txn_type = 'sale_reversal'));
  begin
    perform cancel_order(v_ord);
    raise exception 'FAIL cancel_twice_raises: expected exception got success';
  exception when others then
    if sqlerrm like 'ORDER_ALREADY_CANCELLED%' then raise notice 'PASS cancel_twice_raises'; else raise; end if;
  end;
  perform pg_temp.chk_num('cancel_twice_no_extra_reversal', 2, (select count(*) from inventory_transactions where reference_id = v_oi and txn_type = 'sale_reversal'));
  begin
    update orders set status = 'completed' where id = v_ord;
    raise exception 'FAIL uncancel_raises: expected exception got success';
  exception when others then
    if sqlerrm like 'ORDER_CANCEL_IRREVERSIBLE%' then raise notice 'PASS uncancel_raises'; else raise; end if;
  end;
end $$;
-- Menu engineering (30-day window); all other menu items deactivated so aggregates only see this scenario.
--   A: Z 10g (CM 40,000) sold 10 + 2 (29d ago) = 12 ; B: Z 40g (CM 10,000) sold 10 (+5 cancelled, excluded) ; C: Z 10g sold 1 (+5 at 31d, outside)
--   D: Z 40g sold 1 ; E: no recipe/no sales (CM = price 50,000). total qty 24 ; n_sold 4 -> threshold 0.7/4 = 0.175 ; shares A .5 B .4167 C/D .0417
--   benchmark_cm = (12*40,000 + 10*10,000 + 40,000 + 10,000)/24 = 26,250  -> A star, B plowhorse, C puzzle, D dog, E puzzle
do $$
declare v_z uuid := (select v from t03 where k = 'z'); v_a uuid; v_b uuid; v_c uuid; v_d uuid; v_e uuid; v_ord uuid; r record;
begin
  insert into menu_items (code, name, selling_price) values ('T03-ME-A', 'ME A', 50000), ('T03-ME-B', 'ME B', 50000), ('T03-ME-C', 'ME C', 50000), ('T03-ME-D', 'ME D', 50000), ('T03-ME-E', 'ME E', 50000);
  select id into v_a from menu_items where code = 'T03-ME-A'; select id into v_b from menu_items where code = 'T03-ME-B'; select id into v_c from menu_items where code = 'T03-ME-C';
  select id into v_d from menu_items where code = 'T03-ME-D'; select id into v_e from menu_items where code = 'T03-ME-E';
  insert into recipes (menu_item_id, ingredient_id, quantity, waste_percent) values (v_a, v_z, 10, 0), (v_b, v_z, 40, 0), (v_c, v_z, 10, 0), (v_d, v_z, 40, 0);
  update menu_items set is_active = false where id not in (v_a, v_b, v_c, v_d, v_e);
  perform create_order(jsonb_build_array(jsonb_build_object('menu_item_id', v_a, 'quantity', 10), jsonb_build_object('menu_item_id', v_b, 'quantity', 10),
                                         jsonb_build_object('menu_item_id', v_c, 'quantity', 1),  jsonb_build_object('menu_item_id', v_d, 'quantity', 1)), now(), null, 0, 'cash', null);
  perform create_order(jsonb_build_array(jsonb_build_object('menu_item_id', v_a, 'quantity', 2)), now() - interval '29 days', null, 0, 'cash', null);
  perform create_order(jsonb_build_array(jsonb_build_object('menu_item_id', v_c, 'quantity', 5)), now() - interval '31 days', null, 0, 'cash', null);
  v_ord := create_order(jsonb_build_array(jsonb_build_object('menu_item_id', v_b, 'quantity', 5)), now(), null, 0, 'cash', null);
  perform cancel_order(v_ord);
  perform pg_temp.chk_num('me_active_rows', 5, (select count(*) from v_menu_engineering));
  select * into r from v_menu_engineering where id = v_a;
  perform pg_temp.chk_num('me_threshold_014', 0.14, r.popularity_threshold, 0.0001);   -- BL-09: 0.7 / 5 active menu items (not 0.7 / 4 sold)
  perform pg_temp.chk_num('me_benchmark_cm_26250', 26250, r.benchmark_cm);
  perform pg_temp.chk_num('me_a_qty_sold', 12, r.qty_sold, 0.001);
  perform pg_temp.chk_num('me_a_revenue', 600000, r.revenue);
  perform pg_temp.chk_num('me_a_total_cm', 480000, r.total_cm);
  perform pg_temp.chk_num('me_a_avg_cm', 40000, r.avg_cm);
  perform pg_temp.chk_num('me_a_share', 0.5, r.popularity_share, 0.0001);
  perform pg_temp.chk_txt('me_a_flags', 'true/true', r.is_popular::text || '/' || r.is_profitable::text);
  perform pg_temp.chk_txt('me_a_star', 'star', r.menu_class::text);
  select * into r from v_menu_engineering where id = v_b;
  perform pg_temp.chk_num('me_b_qty_sold_excludes_cancelled', 10, r.qty_sold, 0.001);
  perform pg_temp.chk_num('me_b_share', 0.4167, r.popularity_share, 0.0001);
  perform pg_temp.chk_num('me_b_avg_cm', 10000, r.avg_cm);
  perform pg_temp.chk_txt('me_b_plowhorse', 'plowhorse', r.menu_class::text);
  select * into r from v_menu_engineering where id = v_c;
  perform pg_temp.chk_num('me_c_qty_sold_excludes_31d', 1, r.qty_sold, 0.001);
  perform pg_temp.chk_txt('me_c_puzzle', 'puzzle', r.menu_class::text);
  select * into r from v_menu_engineering where id = v_d;
  perform pg_temp.chk_txt('me_d_flags', 'false/false', r.is_popular::text || '/' || r.is_profitable::text);
  perform pg_temp.chk_txt('me_d_dog', 'dog', r.menu_class::text);
  select * into r from v_menu_engineering where id = v_e;
  perform pg_temp.chk_num('me_e_qty_zero', 0, r.qty_sold, 0.001);
  perform pg_temp.chk_num('me_e_avg_cm_is_current_cm', 50000, r.avg_cm);
  perform pg_temp.chk_txt('me_e_puzzle', 'puzzle', r.menu_class::text);
  perform pg_temp.chk_num('me_class_distribution', 5, (select count(*) from v_menu_engineering where menu_class in ('star','plowhorse','puzzle','dog')));
  -- BL-08: menu_class is exactly the star/plowhorse/puzzle/dog matrix of (is_popular, is_profitable)
  perform pg_temp.chk_num('me_class_matches_flags', 5, (select count(*) from v_menu_engineering
    where menu_class = (case when is_popular and is_profitable then 'star' when is_popular then 'plowhorse' when is_profitable then 'puzzle' else 'dog' end)::menu_class));
end $$;

-- -----------------------------------------------------------------------------
-- 7. COMBO ITEMS & COMBO SALES
-- -----------------------------------------------------------------------------
do $$
declare
  v_combo_id   uuid;
  v_dish_a     uuid;
  v_dish_b     uuid;
  v_nested     uuid;
  v_order_id   uuid;
  v_x          uuid := (select v from t03 where k = 'x');
  v_y          uuid := (select v from t03 where k = 'y');
  v_stock_x    numeric;
  v_stock_y    numeric;
  r            record;
begin
  -- Dish A & Dish B
  insert into menu_items (code, name, category, selling_price, is_combo)
  values ('MI-TEST-A', 'Món A', 'Món chính', 60000, false) returning id into v_dish_a;

  insert into menu_items (code, name, category, selling_price, is_combo)
  values ('MI-TEST-B', 'Món B', 'Đồ uống', 10000, false) returning id into v_dish_b;

  -- Combo: 1 Món A + 2 Món B
  insert into menu_items (code, name, category, selling_price, is_combo)
  values ('COMBO-TEST-1', 'Combo Tiết Kiệm', 'Combo', 70000, true) returning id into v_combo_id;

  -- Recipe for Dish A: 100g X (unit_cost 200) -> component_cost 20000
  insert into recipes (menu_item_id, ingredient_id, quantity, waste_percent)
  values (v_dish_a, v_x, 100, 0);

  -- Recipe for Dish B: 50g Y (unit_cost 50) -> component_cost 2500
  insert into recipes (menu_item_id, ingredient_id, quantity, waste_percent)
  values (v_dish_b, v_y, 50, 0);

  -- Add to combo: 1x Dish A + 2x Dish B
  insert into combo_items (combo_id, menu_item_id, quantity) values
    (v_combo_id, v_dish_a, 1),
    (v_combo_id, v_dish_b, 2);

  -- 1. Check v_menu_item_costs for combo
  select * into r from v_menu_item_costs where id = v_combo_id;
  -- ideal_cost = 1 * 20000 + 2 * 2500 = 25000
  perform pg_temp.chk_num('combo_ideal_cost', 25000, r.ideal_cost);
  -- contribution_margin = 70000 - 25000 = 45000
  perform pg_temp.chk_num('combo_cm', 45000, r.contribution_margin);
  -- food_cost_pct = 25000 / 70000 * 100 = 35.71%
  perform pg_temp.chk_num('combo_food_cost_pct', 35.71, r.food_cost_pct, 0.01);
  perform pg_temp.chk_txt('combo_is_combo', 'true', r.is_combo::text);
  perform pg_temp.chk_txt('combo_missing_recipe', 'false', r.missing_recipe::text);

  -- 2. Validation guards
  -- Cannot contain self
  begin
    insert into combo_items (combo_id, menu_item_id, quantity) values (v_combo_id, v_combo_id, 1);
    raise exception 'combo_self_guard_failed';
  exception when others then
    if sqlerrm like '%INVALID_COMBO_ITEM%' then
      raise notice 'PASS combo_self_guard';
    else
      raise;
    end if;
  end;

  -- Cannot nest combo inside combo
  insert into menu_items (code, name, category, selling_price, is_combo)
  values ('COMBO-TEST-2', 'Combo Lồng', 'Combo', 100000, true) returning id into v_nested;

  begin
    insert into combo_items (combo_id, menu_item_id, quantity) values (v_nested, v_combo_id, 1);
    raise exception 'combo_nesting_guard_failed';
  exception when others then
    if sqlerrm like '%INVALID_COMBO_ITEM%' then
      raise notice 'PASS combo_nesting_guard';
    else
      raise;
    end if;
  end;

  -- 3. Selling combo in an order
  select current_stock into v_stock_x from ingredients where id = v_x;
  select current_stock into v_stock_y from ingredients where id = v_y;

  -- Sell 2 combos:
  -- Should deduct X: 2 combos * 1 Dish A * 100g = 200g
  -- Should deduct Y: 2 combos * 2 Dish B * 50g = 200g
  v_order_id := create_order(
    jsonb_build_array(
      jsonb_build_object('menu_item_id', v_combo_id::text, 'quantity', 2)
    ),
    now(), 'Table 10', 0, 'cash', 'Đơn thử combo'
  );

  select current_stock into r from ingredients where id = v_x;
  perform pg_temp.chk_num('combo_deduct_x', v_stock_x - 200, r.current_stock);

  select current_stock into r from ingredients where id = v_y;
  perform pg_temp.chk_num('combo_deduct_y', v_stock_y - 200, r.current_stock);

  -- Check order_items COGS: 2 * 25000 = 50000
  select cogs_amount into r from order_items where order_id = v_order_id and menu_item_id = v_combo_id;
  perform pg_temp.chk_num('combo_order_cogs', 50000, r.cogs_amount);

  -- 4. Cancel order restores ingredients
  perform cancel_order(v_order_id);
  select current_stock into r from ingredients where id = v_x;
  perform pg_temp.chk_num('combo_cancel_restores_x', v_stock_x, r.current_stock);

  select current_stock into r from ingredients where id = v_y;
  perform pg_temp.chk_num('combo_cancel_restores_y', v_stock_y, r.current_stock);
end $$;

rollback;
