-- 01_inventory_purchasing.sql
-- Spec: Module 1 (unit conversion, weighted average cost, ledger) + Module 3 (PO totals, terms, debt, immediate payment).
-- Expected values are computed BY HAND from the spec formulas. Everything runs inside one transaction and is rolled back.
begin;

create function pg_temp.chk_num(p_name text, p_expected numeric, p_actual numeric, p_tol numeric default 0.01) returns void
language plpgsql as $$
begin
  if p_actual is null or abs(p_actual - p_expected) > p_tol then
    raise exception 'FAIL %: expected % got %', p_name, p_expected, p_actual;
  end if;
  raise notice 'PASS %', p_name;
end $$;

create function pg_temp.chk_txt(p_name text, p_expected text, p_actual text) returns void
language plpgsql as $$
begin
  if p_actual is distinct from p_expected then
    raise exception 'FAIL %: expected % got %', p_name, p_expected, p_actual;
  end if;
  raise notice 'PASS %', p_name;
end $$;

create temp table t01 (k text primary key, v uuid);

-- Setup: fresh supplier (terms 15 days) + two ingredients (g/kg x1000, lon/thùng x24)
do $$
declare v_sup uuid; v_ing uuid; v_ing2 uuid;
begin
  insert into suppliers (code, name, payment_terms_days) values ('T01-SUP', 'Test NCC 01', 15) returning id into v_sup;
  insert into ingredients (code, name, base_unit, import_unit, conversion_factor) values ('T01-BO', 'Test thịt bò', 'g', 'kg', 1000) returning id into v_ing;
  insert into ingredients (code, name, base_unit, import_unit, conversion_factor) values ('T01-BIA', 'Test bia lon', 'lon', 'thùng', 24) returning id into v_ing2;
  insert into t01 values ('sup', v_sup), ('ing', v_ing), ('ing2', v_ing2);
  perform pg_temp.chk_num('setup_stock_zero', 0, (select current_stock from ingredients where id = v_ing));
  perform pg_temp.chk_num('setup_debt_zero', 0, (select current_debt from suppliers where id = v_sup));
end $$;

-- PO1: 10 kg @ 120,000/kg  -> 10,000 g @ 120 VND/g ; total 1,200,000 ; due = order_date + 15
do $$
declare v_sup uuid := (select v from t01 where k = 'sup'); v_ing uuid := (select v from t01 where k = 'ing');
        v_po uuid; po record; ing record; led record;
begin
  v_po := create_purchase_order(v_sup, current_date, null, 'INV-T01-1', null,
            jsonb_build_array(jsonb_build_object('ingredient_id', v_ing, 'quantity', 10, 'unit_price', 120000)));
  insert into t01 values ('po1', v_po);
  select * into po from purchase_orders where id = v_po;
  select * into ing from ingredients where id = v_ing;
  perform pg_temp.chk_num('po1_stock_10000g', 10000, ing.current_stock, 0.001);
  perform pg_temp.chk_num('po1_avg_120', 120, ing.avg_cost_price, 0.0001);
  perform pg_temp.chk_num('po1_total_amount', 1200000, po.total_amount);
  perform pg_temp.chk_num('po1_paid_amount_0', 0, po.paid_amount);
  perform pg_temp.chk_num('po1_debt_amount', 1200000, po.debt_amount);
  perform pg_temp.chk_txt('po1_status_unpaid', 'unpaid', po.payment_status::text);
  perform pg_temp.chk_txt('po1_due_date_terms15', (current_date + 15)::text, po.due_date::text);
  perform pg_temp.chk_txt('po1_number_prefix', 'PO-' || to_char(current_date, 'YYYYMMDD') || '-', left(po.po_number, 12));
  perform pg_temp.chk_num('po1_supplier_debt', 1200000, (select current_debt from suppliers where id = v_sup));
  -- PO item conversion snapshot
  perform pg_temp.chk_num('po1_item_base_quantity', 10000, (select base_quantity from purchase_order_items where purchase_order_id = v_po), 0.001);
  perform pg_temp.chk_num('po1_item_line_total', 1200000, (select line_total from purchase_order_items where purchase_order_id = v_po));
  perform pg_temp.chk_txt('po1_item_unit_default', 'kg', (select unit from purchase_order_items where purchase_order_id = v_po));
  -- ledger row
  select * into led from inventory_transactions where reference_type = 'purchase_order_item' and reference_id = (select id from purchase_order_items where purchase_order_id = v_po);
  perform pg_temp.chk_num('po1_ledger_qty', 10000, led.quantity, 0.001);
  perform pg_temp.chk_num('po1_ledger_unit_cost', 120, led.unit_cost, 0.0001);
  perform pg_temp.chk_num('po1_ledger_total_cost', 1200000, led.total_cost);
  perform pg_temp.chk_num('po1_ledger_stock_after', 10000, led.stock_after, 0.001);
  perform pg_temp.chk_txt('po1_ledger_reference', 'purchase_order_item', led.reference_type);
  perform pg_temp.chk_num('po1_ledger_count', 1, (select count(*) from inventory_transactions where ingredient_id = v_ing));
end $$;

-- PO2: 5 kg @ 150,000/kg -> +5,000 g @ 150 VND/g
-- New_Avg = (10000*120 + 5000*150) / 15000 = 1,950,000 / 15,000 = 130 VND/g ; stock 15,000 g
do $$
declare v_sup uuid := (select v from t01 where k = 'sup'); v_ing uuid := (select v from t01 where k = 'ing');
        v_po uuid; ing record; led record; vis record;
begin
  v_po := create_purchase_order(v_sup, current_date, null, 'INV-T01-2', null,
            jsonb_build_array(jsonb_build_object('ingredient_id', v_ing, 'quantity', 5, 'unit_price', 150000)));
  insert into t01 values ('po2', v_po);
  select * into ing from ingredients where id = v_ing;
  perform pg_temp.chk_num('po2_stock_15000g', 15000, ing.current_stock, 0.001);
  perform pg_temp.chk_num('po2_weighted_avg_130', 130, ing.avg_cost_price, 0.0001);
  perform pg_temp.chk_num('po2_total_amount', 750000, (select total_amount from purchase_orders where id = v_po));
  perform pg_temp.chk_num('po2_supplier_debt_cumulative', 1950000, (select current_debt from suppliers where id = v_sup));
  select * into led from inventory_transactions where reference_type = 'purchase_order_item' and reference_id = (select id from purchase_order_items where purchase_order_id = v_po);
  perform pg_temp.chk_num('po2_ledger_qty', 5000, led.quantity, 0.001);
  perform pg_temp.chk_num('po2_ledger_unit_cost_import', 150, led.unit_cost, 0.0001);
  perform pg_temp.chk_num('po2_ledger_stock_after', 15000, led.stock_after, 0.001);
  perform pg_temp.chk_num('po2_ledger_total_cost', 750000, led.total_cost);
  select * into vis from v_inventory_status where id = v_ing;
  perform pg_temp.chk_num('po2_view_stock_import_units', 15, vis.stock_in_import_units, 0.001);
  perform pg_temp.chk_num('po2_view_avg_per_import_unit', 130000, vis.avg_cost_per_import_unit);
  perform pg_temp.chk_num('po2_view_stock_value', 1950000, vis.stock_value);
end $$;

-- PO3 (ing2): 5 thùng @ 100,000 -> 120 lon @ 4,166.6667/lon ; total 500,000 ; paid_now 300,000
--   -> supplier_payments row (đích danh PO3) + allocation, PO3 partial, debt 200,000
--   -> supplier debt 1,950,000 + 200,000 = 2,150,000
do $$
declare v_sup uuid := (select v from t01 where k = 'sup'); v_ing2 uuid := (select v from t01 where k = 'ing2');
        v_po uuid; po record; pay record; ing record;
begin
  v_po := create_purchase_order(v_sup, current_date, null, 'INV-T01-3', null,
            jsonb_build_array(jsonb_build_object('ingredient_id', v_ing2, 'quantity', 5, 'unit_price', 100000)),
            300000, 'bank_transfer');
  insert into t01 values ('po3', v_po);
  select * into ing from ingredients where id = v_ing2;
  perform pg_temp.chk_num('po3_stock_120_lon', 120, ing.current_stock, 0.001);
  perform pg_temp.chk_num('po3_avg_per_lon', 100000.0 / 24, ing.avg_cost_price, 0.0001);
  select * into po from purchase_orders where id = v_po;
  perform pg_temp.chk_num('po3_total_amount', 500000, po.total_amount);
  perform pg_temp.chk_num('po3_paid_amount', 300000, po.paid_amount);
  perform pg_temp.chk_num('po3_debt_amount', 200000, po.debt_amount);
  perform pg_temp.chk_txt('po3_status_partial', 'partial', po.payment_status::text);
  select * into pay from supplier_payments where purchase_order_id = v_po;
  perform pg_temp.chk_num('po3_payment_row_amount', 300000, pay.amount);
  perform pg_temp.chk_txt('po3_payment_method', 'bank_transfer', pay.method::text);
  perform pg_temp.chk_txt('po3_payment_supplier', v_sup::text, pay.supplier_id::text);
  perform pg_temp.chk_num('po3_allocation_amount', 300000, (select sum(amount) from supplier_payment_allocations where payment_id = pay.id and purchase_order_id = v_po));
  perform pg_temp.chk_num('po3_allocation_count', 1, (select count(*) from supplier_payment_allocations where payment_id = pay.id));
  perform pg_temp.chk_num('po3_supplier_debt', 2150000, (select current_debt from suppliers where id = v_sup));
end $$;

-- PO4 (ing2): explicit unit/conversion override: 1 lốc (x12) @ 48,000 -> 12 lon @ 4,000/lon
-- New_Avg = (120 * 100000/24 + 12 * 4000) / 132 = (500,000 + 48,000) / 132 = 4,151.5152 ; stock 132
do $$
declare v_sup uuid := (select v from t01 where k = 'sup'); v_ing2 uuid := (select v from t01 where k = 'ing2');
        v_po uuid; ing record; it record;
begin
  v_po := create_purchase_order(v_sup, current_date, null, 'INV-T01-4', null,
            jsonb_build_array(jsonb_build_object('ingredient_id', v_ing2, 'quantity', 1, 'unit_price', 48000, 'unit', 'lốc', 'conversion_factor', 12)));
  insert into t01 values ('po4', v_po);
  select * into it from purchase_order_items where purchase_order_id = v_po;
  perform pg_temp.chk_txt('po4_item_unit_override', 'lốc', it.unit);
  perform pg_temp.chk_num('po4_item_factor_override', 12, it.conversion_factor, 0.0001);
  perform pg_temp.chk_num('po4_item_base_qty', 12, it.base_quantity, 0.001);
  select * into ing from ingredients where id = v_ing2;
  perform pg_temp.chk_num('po4_stock_132', 132, ing.current_stock, 0.001);
  perform pg_temp.chk_num('po4_weighted_avg', 548000.0 / 132, ing.avg_cost_price, 0.0001);
  perform pg_temp.chk_num('po4_supplier_debt', 2198000, (select current_debt from suppliers where id = v_sup));
end $$;

-- Pay PO3's remaining 200,000 đích danh -> PO3 fully paid ; supplier debt 2,198,000 - 200,000 = 1,998,000
do $$
declare v_sup uuid := (select v from t01 where k = 'sup'); v_po uuid := (select v from t01 where k = 'po3'); po record;
begin
  perform record_supplier_payment(v_sup, 200000, current_date, 'cash', v_po, 'REF-T01', 'tất toán PO3');
  select * into po from purchase_orders where id = v_po;
  perform pg_temp.chk_num('po3_paid_amount_full', 500000, po.paid_amount);
  perform pg_temp.chk_num('po3_debt_zero', 0, po.debt_amount);
  perform pg_temp.chk_txt('po3_status_paid', 'paid', po.payment_status::text);
  perform pg_temp.chk_num('po3_supplier_debt_after_full', 1998000, (select current_debt from suppliers where id = v_sup));
end $$;

-- Delete PO2's line -> stock back to 10,000 g, PO2 total 0 / debt 0, supplier debt 1,998,000 - 750,000 = 1,248,000
do $$
declare v_sup uuid := (select v from t01 where k = 'sup'); v_ing uuid := (select v from t01 where k = 'ing'); v_po uuid := (select v from t01 where k = 'po2');
        po record; led record; v_item uuid := (select id from purchase_order_items where purchase_order_id = v_po);
begin
  delete from purchase_order_items where purchase_order_id = v_po;
  select * into po from purchase_orders where id = v_po;
  perform pg_temp.chk_num('po2_delete_total_zero', 0, po.total_amount);
  perform pg_temp.chk_num('po2_delete_debt_zero', 0, po.debt_amount);
  perform pg_temp.chk_num('po2_delete_stock_10000', 10000, (select current_stock from ingredients where id = v_ing), 0.001);
  perform pg_temp.chk_num('po2_delete_supplier_debt', 1248000, (select current_debt from suppliers where id = v_sup));
  select * into led from inventory_transactions where reference_id = v_item and quantity < 0;
  perform pg_temp.chk_txt('po2_delete_ledger_type', 'purchase', led.txn_type::text);
  perform pg_temp.chk_num('po2_delete_ledger_qty', -5000, led.quantity, 0.001);
  perform pg_temp.chk_num('po2_delete_ledger_stock_after', 10000, led.stock_after, 0.001);
  perform pg_temp.chk_num('po2_delete_ledger_rows', 3, (select count(*) from inventory_transactions where ingredient_id = v_ing));
end $$;

-- Guards: updating a PO line raises ; ledger rows are immutable ; paid_now > total raises
do $$
declare v_po uuid := (select v from t01 where k = 'po1'); v_ing uuid := (select v from t01 where k = 'ing');
        v_sup uuid := (select v from t01 where k = 'sup');
begin
  begin
    update purchase_order_items set quantity = 1 where purchase_order_id = v_po;
    raise exception 'FAIL po_item_update_raises: expected exception got success';
  exception when others then
    if sqlerrm like 'PO_ITEM_UPDATE_NOT_ALLOWED%' then raise notice 'PASS po_item_update_raises'; else raise; end if;
  end;
  begin
    update inventory_transactions set quantity = 1 where ingredient_id = v_ing;
    raise exception 'FAIL ledger_update_raises: expected exception got success';
  exception when others then
    if sqlerrm like 'LEDGER_IMMUTABLE%' then raise notice 'PASS ledger_update_raises'; else raise; end if;
  end;
  begin
    delete from inventory_transactions where ingredient_id = v_ing;
    raise exception 'FAIL ledger_delete_raises: expected exception got success';
  exception when others then
    if sqlerrm like 'LEDGER_IMMUTABLE%' then raise notice 'PASS ledger_delete_raises'; else raise; end if;
  end;
  begin
    perform create_purchase_order(v_sup, current_date, null, 'INV-T01-X', null,
      jsonb_build_array(jsonb_build_object('ingredient_id', v_ing, 'quantity', 1, 'unit_price', 100000)), 150000, 'cash');
    raise exception 'FAIL paid_now_exceeds_total_raises: expected exception got success';
  exception when others then
    if sqlerrm like 'PAYMENT_EXCEEDS_PO_DEBT%' then raise notice 'PASS paid_now_exceeds_total_raises'; else raise; end if;
  end;
  -- stock untouched by the failed PO
  perform pg_temp.chk_num('failed_po_leaves_stock', 10000, (select current_stock from ingredients where id = v_ing), 0.001);
end $$;

-- Invariant: suppliers.current_debt == sum(purchase_orders.debt_amount)
do $$
declare v_sup uuid := (select v from t01 where k = 'sup');
begin
  perform pg_temp.chk_num('debt_invariant_test_supplier', (select sum(debt_amount) from purchase_orders where supplier_id = v_sup),
                          (select current_debt from suppliers where id = v_sup));
  perform pg_temp.chk_num('debt_invariant_all_suppliers_mismatches', 0,
    (select count(*) from suppliers s where abs(s.current_debt - coalesce((select sum(debt_amount) from purchase_orders where supplier_id = s.id), 0)) > 0.01));
end $$;

rollback;
