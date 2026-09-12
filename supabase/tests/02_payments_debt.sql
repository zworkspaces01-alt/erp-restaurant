-- 02_payments_debt.sql
-- Spec: Module 3 — đích danh payments, FIFO (trả trừ dần) across POs, over-payment guards,
-- invariant suppliers.current_debt == sum(purchase_orders.debt_amount) after every step.
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

-- invariant helper: current_debt == sum(debt_amount) for one supplier
create function pg_temp.chk_inv(p_name text, p_sup uuid) returns void
language plpgsql as $$
begin
  perform pg_temp.chk_num('invariant_' || p_name,
    coalesce((select sum(debt_amount) from purchase_orders where supplier_id = p_sup), 0),
    (select current_debt from suppliers where id = p_sup));
end $$;

create temp table t02 (k text primary key, v uuid);

-- Setup: supplier (COD terms) + ingredient ; three POs inserted OUT of due-date order
--   PO_C: due today+5  , 8 kg @100,000 =   800,000   (inserted 1st)
--   PO_A: due today-20 , 10 kg @100,000 = 1,000,000   (inserted 2nd)
--   PO_B: due today-10 , 5 kg @100,000 =   500,000   (inserted 3rd)
--   total outstanding = 2,300,000
do $$
declare v_sup uuid; v_sup2 uuid; v_ing uuid; v_a uuid; v_b uuid; v_c uuid;
begin
  insert into suppliers (code, name, payment_terms_days) values ('T02-SUP', 'Test NCC 02', 0) returning id into v_sup;
  insert into suppliers (code, name, payment_terms_days) values ('T02-SUP-B', 'Test NCC 02 khác', 0) returning id into v_sup2;
  insert into ingredients (code, name, base_unit, import_unit, conversion_factor) values ('T02-ING', 'Test cá', 'g', 'kg', 1000) returning id into v_ing;
  v_c := create_purchase_order(v_sup, current_date - 5,  current_date + 5,  'T02-C', null, jsonb_build_array(jsonb_build_object('ingredient_id', v_ing, 'quantity', 8,  'unit_price', 100000)));
  v_a := create_purchase_order(v_sup, current_date - 30, current_date - 20, 'T02-A', null, jsonb_build_array(jsonb_build_object('ingredient_id', v_ing, 'quantity', 10, 'unit_price', 100000)));
  v_b := create_purchase_order(v_sup, current_date - 15, current_date - 10, 'T02-B', null, jsonb_build_array(jsonb_build_object('ingredient_id', v_ing, 'quantity', 5,  'unit_price', 100000)));
  insert into t02 values ('sup', v_sup), ('sup2', v_sup2), ('ing', v_ing), ('a', v_a), ('b', v_b), ('c', v_c);
  perform pg_temp.chk_txt('setup_due_a', (current_date - 20)::text, (select due_date::text from purchase_orders where id = v_a));
  perform pg_temp.chk_txt('setup_due_c_explicit', (current_date + 5)::text, (select due_date::text from purchase_orders where id = v_c));
  perform pg_temp.chk_num('setup_total_debt', 2300000, (select current_debt from suppliers where id = v_sup));
  perform pg_temp.chk_num('setup_overdue_debt_view', 1500000, (select overdue_debt from v_supplier_debt_summary where id = v_sup));
  perform pg_temp.chk_num('setup_overdue_po_count_view', 2, (select overdue_po_count from v_supplier_debt_summary where id = v_sup));
  perform pg_temp.chk_inv('setup', v_sup);
end $$;

-- Step 1: đích danh partial 300,000 on PO_B -> PO_B partial (debt 200,000) ; supplier 2,000,000
do $$
declare v_sup uuid := (select v from t02 where k = 'sup'); v_b uuid := (select v from t02 where k = 'b'); v_pay uuid; po record;
begin
  v_pay := record_supplier_payment(v_sup, 300000, current_date, 'cash', v_b, 'REF-1', null);
  insert into t02 values ('pay1', v_pay);
  select * into po from purchase_orders where id = v_b;
  perform pg_temp.chk_num('dd_partial_paid_amount', 300000, po.paid_amount);
  perform pg_temp.chk_num('dd_partial_debt_amount', 200000, po.debt_amount);
  perform pg_temp.chk_txt('dd_partial_status', 'partial', po.payment_status::text);
  perform pg_temp.chk_num('dd_partial_alloc_rows', 1, (select count(*) from supplier_payment_allocations where payment_id = v_pay));
  perform pg_temp.chk_num('dd_partial_alloc_amount', 300000, (select amount from supplier_payment_allocations where payment_id = v_pay));
  perform pg_temp.chk_txt('dd_partial_alloc_po', v_b::text, (select purchase_order_id::text from supplier_payment_allocations where payment_id = v_pay));
  perform pg_temp.chk_num('dd_partial_supplier_debt', 2000000, (select current_debt from suppliers where id = v_sup));
  -- other POs untouched
  perform pg_temp.chk_num('dd_partial_po_a_untouched', 0, (select paid_amount from purchase_orders where id = (select v from t02 where k = 'a')));
  perform pg_temp.chk_inv('dd_partial', v_sup);
end $$;

-- Step 2: đích danh remaining 200,000 on PO_B -> paid ; supplier 1,800,000
do $$
declare v_sup uuid := (select v from t02 where k = 'sup'); v_b uuid := (select v from t02 where k = 'b'); po record;
begin
  perform record_supplier_payment(v_sup, 200000, current_date, 'bank_transfer', v_b, 'REF-2', null);
  select * into po from purchase_orders where id = v_b;
  perform pg_temp.chk_num('dd_full_paid_amount', 500000, po.paid_amount);
  perform pg_temp.chk_num('dd_full_debt_zero', 0, po.debt_amount);
  perform pg_temp.chk_txt('dd_full_status_paid', 'paid', po.payment_status::text);
  perform pg_temp.chk_num('dd_full_supplier_debt', 1800000, (select current_debt from suppliers where id = v_sup));
  perform pg_temp.chk_inv('dd_full', v_sup);
end $$;

-- Step 3: FIFO 1,200,000 with no PO -> oldest due first: PO_A (due -20) takes 1,000,000, PO_C (due +5) takes 200,000 ; PO_B (paid) skipped
--   PO_A paid ; PO_C partial (paid 200,000, debt 600,000) ; supplier 600,000
do $$
declare v_sup uuid := (select v from t02 where k = 'sup'); v_a uuid := (select v from t02 where k = 'a'); v_b uuid := (select v from t02 where k = 'b');
        v_c uuid := (select v from t02 where k = 'c'); v_pay uuid; s record;
begin
  v_pay := record_supplier_payment(v_sup, 1200000, current_date, 'bank_transfer', null, 'REF-FIFO', 'trả dần');
  insert into t02 values ('pay3', v_pay);
  perform pg_temp.chk_num('fifo_alloc_rows', 2, (select count(*) from supplier_payment_allocations where payment_id = v_pay));
  perform pg_temp.chk_num('fifo_alloc_a', 1000000, (select amount from supplier_payment_allocations where payment_id = v_pay and purchase_order_id = v_a));
  perform pg_temp.chk_num('fifo_alloc_c', 200000, (select amount from supplier_payment_allocations where payment_id = v_pay and purchase_order_id = v_c));
  perform pg_temp.chk_num('fifo_alloc_b_none', 0, (select count(*) from supplier_payment_allocations where payment_id = v_pay and purchase_order_id = v_b));
  perform pg_temp.chk_num('fifo_po_a_paid_amount', 1000000, (select paid_amount from purchase_orders where id = v_a));
  perform pg_temp.chk_txt('fifo_po_a_status', 'paid', (select payment_status::text from purchase_orders where id = v_a));
  perform pg_temp.chk_num('fifo_po_c_paid_amount', 200000, (select paid_amount from purchase_orders where id = v_c));
  perform pg_temp.chk_num('fifo_po_c_debt', 600000, (select debt_amount from purchase_orders where id = v_c));
  perform pg_temp.chk_txt('fifo_po_c_status', 'partial', (select payment_status::text from purchase_orders where id = v_c));
  perform pg_temp.chk_num('fifo_supplier_debt', 600000, (select current_debt from suppliers where id = v_sup));
  select * into s from v_supplier_debt_summary where id = v_sup;
  perform pg_temp.chk_num('fifo_view_total_paid', 1700000, s.total_paid);
  perform pg_temp.chk_num('fifo_view_total_purchased', 2300000, s.total_purchased);
  perform pg_temp.chk_num('fifo_view_unpaid_po_count', 1, s.unpaid_po_count);
  perform pg_temp.chk_num('fifo_view_overdue_debt_zero', 0, s.overdue_debt);
  perform pg_temp.chk_txt('fifo_view_next_due', (current_date + 5)::text, s.next_due_date::text);
  perform pg_temp.chk_inv('fifo', v_sup);
end $$;

-- Step 4/5/6/7: over-payment and mismatch guards (each must raise and leave debt untouched)
do $$
declare v_sup uuid := (select v from t02 where k = 'sup'); v_sup2 uuid := (select v from t02 where k = 'sup2');
        v_a uuid := (select v from t02 where k = 'a'); v_c uuid := (select v from t02 where k = 'c'); v_pay uuid := (select v from t02 where k = 'pay3');
        v_cnt int := (select count(*) from supplier_payments where supplier_id = v_sup);
begin
  begin
    perform record_supplier_payment(v_sup, 700000, current_date, 'cash', null, null, null);
    raise exception 'FAIL fifo_exceeds_debt_raises: expected exception got success';
  exception when others then
    if sqlerrm like 'PAYMENT_EXCEEDS_DEBT%' then raise notice 'PASS fifo_exceeds_debt_raises'; else raise; end if;
  end;
  begin
    perform record_supplier_payment(v_sup, 700000, current_date, 'cash', v_c, null, null);
    raise exception 'FAIL dd_exceeds_po_debt_raises: expected exception got success';
  exception when others then
    if sqlerrm like 'PAYMENT_EXCEEDS_PO_DEBT%' then raise notice 'PASS dd_exceeds_po_debt_raises'; else raise; end if;
  end;
  begin
    perform record_supplier_payment(v_sup, 1, current_date, 'cash', v_a, null, null);
    raise exception 'FAIL dd_on_paid_po_raises: expected exception got success';
  exception when others then
    if sqlerrm like 'PAYMENT_EXCEEDS_PO_DEBT%' then raise notice 'PASS dd_on_paid_po_raises'; else raise; end if;
  end;
  begin
    perform record_supplier_payment(v_sup2, 100, current_date, 'cash', v_c, null, null);
    raise exception 'FAIL po_supplier_mismatch_raises: expected exception got success';
  exception when others then
    if sqlerrm like 'PO_SUPPLIER_MISMATCH%' then raise notice 'PASS po_supplier_mismatch_raises'; else raise; end if;
  end;
  begin
    perform record_supplier_payment(v_sup, 0, current_date, 'cash', null, null, null);
    raise exception 'FAIL zero_amount_raises: expected exception got success';
  exception when others then
    if sqlerrm like 'INVALID_AMOUNT%' then raise notice 'PASS zero_amount_raises'; else raise; end if;
  end;
  begin
    update supplier_payments set amount = amount + 1 where id = v_pay;
    raise exception 'FAIL payment_amount_update_raises: expected exception got success';
  exception when others then
    if sqlerrm like 'PAYMENT_UPDATE_NOT_ALLOWED%' then raise notice 'PASS payment_amount_update_raises'; else raise; end if;
  end;
  perform pg_temp.chk_num('guards_no_payment_rows_added', v_cnt, (select count(*) from supplier_payments where supplier_id = v_sup));
  perform pg_temp.chk_num('guards_debt_unchanged', 600000, (select current_debt from suppliers where id = v_sup));
  perform pg_temp.chk_inv('guards', v_sup);
end $$;

-- Step 8: FIFO exactly the remaining 600,000 -> everything paid, debt 0 ; then any further FIFO payment raises
do $$
declare v_sup uuid := (select v from t02 where k = 'sup'); v_c uuid := (select v from t02 where k = 'c');
begin
  perform record_supplier_payment(v_sup, 600000, current_date, 'cash', null, null, null);
  perform pg_temp.chk_num('fifo_settle_supplier_debt_zero', 0, (select current_debt from suppliers where id = v_sup));
  perform pg_temp.chk_txt('fifo_settle_po_c_paid', 'paid', (select payment_status::text from purchase_orders where id = v_c));
  perform pg_temp.chk_num('fifo_settle_unpaid_count', 0, (select count(*) from purchase_orders where supplier_id = v_sup and debt_amount > 0));
  perform pg_temp.chk_inv('fifo_settle', v_sup);
  begin
    perform record_supplier_payment(v_sup, 1, current_date, 'cash', null, null, null);
    raise exception 'FAIL fifo_no_debt_raises: expected exception got success';
  exception when others then
    if sqlerrm like 'PAYMENT_EXCEEDS_DEBT%' then raise notice 'PASS fifo_no_debt_raises'; else raise; end if;
  end;
end $$;

-- Step 9: deleting the FIFO payment (step 3) reverses its allocations: PO_A back to unpaid 1,000,000, PO_C paid 600,000 (partial) ; supplier 1,200,000
do $$
declare v_sup uuid := (select v from t02 where k = 'sup'); v_a uuid := (select v from t02 where k = 'a'); v_c uuid := (select v from t02 where k = 'c');
        v_pay uuid := (select v from t02 where k = 'pay3');
begin
  delete from supplier_payments where id = v_pay;
  perform pg_temp.chk_num('reverse_alloc_rows_gone', 0, (select count(*) from supplier_payment_allocations where payment_id = v_pay));
  perform pg_temp.chk_num('reverse_po_a_debt', 1000000, (select debt_amount from purchase_orders where id = v_a));
  perform pg_temp.chk_txt('reverse_po_a_status', 'unpaid', (select payment_status::text from purchase_orders where id = v_a));
  perform pg_temp.chk_num('reverse_po_c_paid', 600000, (select paid_amount from purchase_orders where id = v_c));
  perform pg_temp.chk_txt('reverse_po_c_status', 'partial', (select payment_status::text from purchase_orders where id = v_c));
  perform pg_temp.chk_num('reverse_supplier_debt', 1200000, (select current_debt from suppliers where id = v_sup));
  perform pg_temp.chk_inv('reverse', v_sup);
  perform pg_temp.chk_num('invariant_all_suppliers_mismatches', 0,
    (select count(*) from suppliers s where abs(s.current_debt - coalesce((select sum(debt_amount) from purchase_orders where supplier_id = s.id), 0)) > 0.01));
end $$;

rollback;
