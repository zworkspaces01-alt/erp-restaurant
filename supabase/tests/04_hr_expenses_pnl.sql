-- 04_hr_expenses_pnl.sql
-- Spec: Module 4 (timekeeping hours, FT prorated/capped + PT hourly payroll, adjustments, finalize/pay), Module 1 (waste/stocktake ledger),
--       Module 5/6 (OPEX by category type, P&L for a controlled range: Jan 2025 has no seed data).
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
create function pg_temp.chk_err(p_name text, p_sql text, p_prefix text) returns void language plpgsql as $$
begin
  execute p_sql;
  raise exception 'FAIL %: expected error % got success', p_name, p_prefix;
exception when others then
  if sqlerrm like p_prefix || '%' then raise notice 'PASS %', p_name; else raise; end if;
end $$;
create temp table t04 (k text primary key, v uuid);

-- Setup (seed employees retired before the test window - BL-02: generate_payroll now keys on employment overlap, not is_active): FT1 13,000,000 + 1,300,000 std 26 ; FT2 10,000,000 + 500,000 std 20 ; PT1 25,000/h ; PT-ended (end 2024-12-31) ; PT-future (start 2025-02-01)
do $$
declare v_ft1 uuid; v_ft2 uuid; v_pt1 uuid; v_ptx uuid; v_ptf uuid;
begin
  update employees set is_active = false, start_date = '2024-01-01', end_date = '2024-12-31';  -- SEC-09: end_date >= start_date
  insert into employees (code, full_name, employment_type, base_salary, allowance, standard_days_per_month, start_date) values ('T04-FT1', 'Test FT1', 'full_time', 13000000, 1300000, 26, '2024-01-01') returning id into v_ft1;
  insert into employees (code, full_name, employment_type, base_salary, allowance, standard_days_per_month, start_date) values ('T04-FT2', 'Test FT2', 'full_time', 10000000, 500000, 20, '2024-01-01') returning id into v_ft2;
  insert into employees (code, full_name, employment_type, hourly_rate, start_date) values ('T04-PT1', 'Test PT1', 'part_time', 25000, '2024-01-01') returning id into v_pt1;
  insert into employees (code, full_name, employment_type, hourly_rate, start_date, end_date) values ('T04-PTX', 'Test PT ended', 'part_time', 25000, '2024-01-01', '2024-12-31') returning id into v_ptx;
  insert into employees (code, full_name, employment_type, hourly_rate, start_date) values ('T04-PTF', 'Test PT future', 'part_time', 25000, '2025-02-01') returning id into v_ptf;
  insert into t04 values ('ft1', v_ft1), ('ft2', v_ft2), ('pt1', v_pt1), ('ptx', v_ptx), ('ptf', v_ptf);
end $$;
-- Timekeeping: 08:00-12:30 = 4.5h ; overnight 22:00-02:00 = 4h ; explicit hours ; update recomputes ; missing both raises
do $$
declare v_pt1 uuid := (select v from t04 where k = 'pt1'); v_ft1 uuid := (select v from t04 where k = 'ft1'); v_ft2 uuid := (select v from t04 where k = 'ft2');
        v_ptx uuid := (select v from t04 where k = 'ptx'); v_id uuid;
begin
  insert into timekeeping (employee_id, work_date, check_in, check_out) values (v_pt1, '2025-01-05', '08:00', '12:30') returning id into v_id;
  perform pg_temp.chk_num('tk_hours_from_checkin', 4.5, (select hours_worked from timekeeping where id = v_id));
  update timekeeping set check_out = '13:00' where id = v_id;
  perform pg_temp.chk_num('tk_hours_recomputed_on_update', 5, (select hours_worked from timekeeping where id = v_id));
  insert into timekeeping (employee_id, work_date, check_in, check_out) values (v_pt1, '2025-01-06', '22:00', '02:00') returning id into v_id;
  perform pg_temp.chk_num('tk_hours_overnight', 4, (select hours_worked from timekeeping where id = v_id));
  insert into timekeeping (employee_id, work_date, hours_worked) values (v_pt1, '2025-01-07', 2);
  insert into timekeeping (employee_id, work_date, hours_worked) values (v_pt1, '2025-02-01', 8), (v_ptx, '2025-01-07', 8);   -- outside period / ended employee
  perform pg_temp.chk_err('tk_missing_hours_raises', format($q$insert into timekeeping (employee_id, work_date, check_in) values (%L, '2025-01-09', '08:00')$q$, v_pt1), 'HOURS_REQUIRED');
  -- FT1: 13 distinct dates (one date has 2 shifts) ; FT2: 22 distinct dates (> 20 std -> capped)
  insert into timekeeping (employee_id, work_date, shift, hours_worked) select v_ft1, d::date, 'sáng', 8 from generate_series('2025-01-01'::date, '2025-01-13', '1 day') d;
  insert into timekeeping (employee_id, work_date, shift, hours_worked) values (v_ft1, '2025-01-01', 'tối', 6);
  insert into timekeeping (employee_id, work_date, shift, hours_worked) select v_ft2, d::date, 'sáng', 8 from generate_series('2025-01-01'::date, '2025-01-22', '1 day') d;
  perform pg_temp.chk_num('tk_ft1_rows', 14, (select count(*) from timekeeping where employee_id = v_ft1));
end $$;
-- generate_payroll Jan 2025: FT1 13/26 days -> 6,500,000 + 650,000 ; FT2 22 days capped -> 10,000,000 + 500,000 ; PT1 11h*25,000 = 275,000 ; total 17,925,000
do $$
declare v_p uuid; v_ft1 uuid := (select v from t04 where k = 'ft1'); v_ft2 uuid := (select v from t04 where k = 'ft2'); v_pt1 uuid := (select v from t04 where k = 'pt1'); pi record;
begin
  insert into payroll_periods (name, period_start, period_end) values ('Test 01/2025', '2025-01-01', '2025-01-31') returning id into v_p;
  insert into t04 values ('period', v_p);
  perform generate_payroll(v_p);
  perform pg_temp.chk_num('pr_item_rows', 3, (select count(*) from payroll_items where payroll_period_id = v_p));
  select * into pi from payroll_items where payroll_period_id = v_p and employee_id = v_ft1;
  perform pg_temp.chk_num('pr_ft1_total_days_distinct', 13, pi.total_days);
  perform pg_temp.chk_num('pr_ft1_total_hours', 110, pi.total_hours);
  perform pg_temp.chk_num('pr_ft1_base_prorated', 6500000, pi.base_pay);
  perform pg_temp.chk_num('pr_ft1_allowance_prorated', 650000, pi.allowance);
  perform pg_temp.chk_num('pr_ft1_net', 7150000, pi.net_pay);
  perform pg_temp.chk_txt('pr_ft1_type_snapshot', 'full_time', pi.employment_type::text);
  select * into pi from payroll_items where payroll_period_id = v_p and employee_id = v_ft2;
  perform pg_temp.chk_num('pr_ft2_total_days', 22, pi.total_days);
  perform pg_temp.chk_num('pr_ft2_base_capped', 10000000, pi.base_pay);
  perform pg_temp.chk_num('pr_ft2_allowance_capped', 500000, pi.allowance);
  select * into pi from payroll_items where payroll_period_id = v_p and employee_id = v_pt1;
  perform pg_temp.chk_num('pr_pt1_total_hours_in_period', 11, pi.total_hours);
  perform pg_temp.chk_num('pr_pt1_total_days', 3, pi.total_days);
  perform pg_temp.chk_num('pr_pt1_base_hourly', 275000, pi.base_pay);
  perform pg_temp.chk_num('pr_pt1_allowance_zero', 0, pi.allowance);
  perform pg_temp.chk_num('pr_period_total_in_sync', 17925000, (select total_net_pay from payroll_periods where id = v_p));
end $$;
-- Adjustments survive regeneration: PT1 bonus 50,000 tips 20,000 advance 30,000 penalty 10,000 -> net 305,000 ; +4h & regen -> base 375,000, net 405,000 ; period 18,055,000
do $$
declare v_p uuid := (select v from t04 where k = 'period'); v_pt1 uuid := (select v from t04 where k = 'pt1'); pi record;
begin
  update payroll_items set bonus = 50000, tips = 20000, advance_deduction = 30000, penalty = 10000 where payroll_period_id = v_p and employee_id = v_pt1;
  perform pg_temp.chk_num('pr_pt1_net_after_adjust', 305000, (select net_pay from payroll_items where payroll_period_id = v_p and employee_id = v_pt1));
  perform pg_temp.chk_num('pr_period_total_after_adjust', 17955000, (select total_net_pay from payroll_periods where id = v_p));
  insert into timekeeping (employee_id, work_date, hours_worked) values (v_pt1, '2025-01-08', 4);
  perform generate_payroll(v_p);
  select * into pi from payroll_items where payroll_period_id = v_p and employee_id = v_pt1;
  perform pg_temp.chk_num('pr_regen_pt1_hours', 15, pi.total_hours);
  perform pg_temp.chk_num('pr_regen_pt1_base', 375000, pi.base_pay);
  perform pg_temp.chk_txt('pr_regen_keeps_manual_fields', '50000.00/20000.00/30000.00/10000.00', pi.bonus || '/' || pi.tips || '/' || pi.advance_deduction || '/' || pi.penalty);
  perform pg_temp.chk_num('pr_regen_pt1_net', 405000, pi.net_pay);
  perform pg_temp.chk_num('pr_regen_rows_still_3', 3, (select count(*) from payroll_items where payroll_period_id = v_p));
  perform pg_temp.chk_num('pr_regen_period_total', 18055000, (select total_net_pay from payroll_periods where id = v_p));
end $$;
-- finalize -> edits/regen raise ; pay_payroll marks items + period paid ; paid is terminal ; empty period cannot be finalized
do $$
declare v_p uuid := (select v from t04 where k = 'period'); v_pt1 uuid := (select v from t04 where k = 'pt1'); v_p2 uuid; v_ts timestamptz := '2025-02-05 10:00+07'; p record;
begin
  insert into payroll_periods (name, period_start, period_end) values ('Test rỗng', '2025-03-01', '2025-03-31') returning id into v_p2;
  perform pg_temp.chk_err('pr_finalize_empty_raises', format($q$select finalize_payroll(%L)$q$, v_p2), 'PAYROLL_NO_ITEMS');
  perform pg_temp.chk_err('pr_pay_before_finalize_raises', format($q$select pay_payroll(%L, 'cash', %L)$q$, v_p, v_ts), 'PAYROLL_NOT_FINALIZED');
  perform finalize_payroll(v_p);
  select * into p from payroll_periods where id = v_p;
  perform pg_temp.chk_txt('pr_finalized_status', 'finalized', p.status::text);
  perform pg_temp.chk_txt('pr_finalized_at_set', 'true', (p.finalized_at is not null)::text);
  perform pg_temp.chk_err('pr_edit_after_finalize_raises', format($q$update payroll_items set bonus = 999 where payroll_period_id = %L and employee_id = %L$q$, v_p, v_pt1), 'PAYROLL_PERIOD_LOCKED');
  perform pg_temp.chk_err('pr_regen_after_finalize_raises', format($q$select count(*) from generate_payroll(%L)$q$, v_p), 'PAYROLL_PERIOD_LOCKED');
  perform pg_temp.chk_num('pr_total_unchanged_after_lock', 18055000, (select total_net_pay from payroll_periods where id = v_p));
  perform pay_payroll(v_p, 'cash', v_ts);
  select * into p from payroll_periods where id = v_p;
  perform pg_temp.chk_txt('pr_paid_status', 'paid', p.status::text);
  perform pg_temp.chk_txt('pr_paid_at', v_ts::text, p.paid_at::text);
  perform pg_temp.chk_txt('pr_paid_method', 'cash', p.payment_method::text);
  perform pg_temp.chk_num('pr_items_all_paid', 3, (select count(*) from payroll_items where payroll_period_id = v_p and is_paid and paid_at = v_ts));
  perform pg_temp.chk_err('pr_pay_twice_raises', format($q$select pay_payroll(%L, 'cash', %L)$q$, v_p, v_ts), 'PAYROLL_PERIOD_PAID');
  perform pg_temp.chk_err('pr_reopen_paid_raises', format($q$update payroll_periods set status = 'draft' where id = %L$q$, v_p), 'PAYROLL_PERIOD_PAID');
  -- BL-04/D5: payroll periods may never overlap
  perform pg_temp.chk_err('pr_overlapping_period_raises', $q$insert into payroll_periods (name, period_start, period_end) values ('Test chồng', '2025-01-15', '2025-02-15')$q$, 'PAYROLL_PERIOD_OVERLAP');
  -- BL-06/D5: a DRAFT period counts as the labor estimate ; FT with NO timekeeping at all in the period is paid in full (13,000,000+1,300,000 and 10,000,000+500,000), PT with no hours gets 0
  insert into payroll_periods (name, period_start, period_end) values ('Test nháp 04/2025', '2025-04-01', '2025-04-30') returning id into v_p2;
  perform generate_payroll(v_p2);
  perform pg_temp.chk_num('pr_draft_apr_rows', 4, (select count(*) from payroll_items where payroll_period_id = v_p2));
  perform pg_temp.chk_num('pr_ft_no_timekeeping_full_pay', 14300000, (select base_pay + allowance from payroll_items where payroll_period_id = v_p2 and employee_id = (select v from t04 where k = 'ft1')));
  perform pg_temp.chk_num('pr_draft_period_total', 24800000, (select total_net_pay from payroll_periods where id = v_p2));
end $$;
-- record_stock_adjustment on W (1,000 g @ 1,000/g): waste 100 -> 900 ; stocktake 850 -> delta -50 ; stocktake 900 -> +50 ; adjustment +25 -> 925
do $$
declare v_sup uuid; v_w uuid; v_id uuid; led record;
begin
  insert into suppliers (code, name) values ('T04-SUP', 'Test NCC 04') returning id into v_sup;
  insert into ingredients (code, name, base_unit, import_unit, conversion_factor) values ('T04-W', 'Test W', 'g', 'kg', 1000) returning id into v_w;
  perform create_purchase_order(v_sup, current_date, null, null, null, jsonb_build_array(jsonb_build_object('ingredient_id', v_w, 'quantity', 1, 'unit_price', 1000000)));
  insert into t04 values ('w', v_w);
  v_id := record_stock_adjustment(v_w, 'waste', 100, 'hỏng');
  select * into led from inventory_transactions where id = v_id;
  perform pg_temp.chk_txt('adj_waste_type', 'waste/manual', led.txn_type::text || '/' || led.reference_type);
  perform pg_temp.chk_num('adj_waste_qty', -100, led.quantity, 0.001);
  perform pg_temp.chk_num('adj_waste_unit_cost_snapshot', 1000, led.unit_cost, 0.0001);
  perform pg_temp.chk_num('adj_waste_total_cost', 100000, led.total_cost);
  perform pg_temp.chk_num('adj_waste_stock_after', 900, led.stock_after, 0.001);
  perform pg_temp.chk_num('adj_waste_stock', 900, (select current_stock from ingredients where id = v_w), 0.001);
  v_id := record_stock_adjustment(v_w, 'stocktake', 850, 'kiểm kê');
  select * into led from inventory_transactions where id = v_id;
  perform pg_temp.chk_num('adj_stocktake_delta', -50, led.quantity, 0.001);
  perform pg_temp.chk_num('adj_stocktake_total_cost', 50000, led.total_cost);
  perform pg_temp.chk_num('adj_stocktake_stock', 850, (select current_stock from ingredients where id = v_w), 0.001);
  perform pg_temp.chk_txt('adj_stocktake_note_has_count', 'true', (led.note like '%850%')::text);
  perform record_stock_adjustment(v_w, 'stocktake', 900, null);
  perform pg_temp.chk_num('adj_stocktake_surplus_stock', 900, (select current_stock from ingredients where id = v_w), 0.001);
  perform record_stock_adjustment(v_w, 'adjustment', 25, null);
  perform pg_temp.chk_num('adj_adjustment_stock', 925, (select current_stock from ingredients where id = v_w), 0.001);
  perform pg_temp.chk_err('adj_waste_over_stock_raises', format($q$select record_stock_adjustment(%L, 'waste', 5000, null)$q$, v_w), 'INSUFFICIENT_STOCK');
  perform pg_temp.chk_err('adj_sale_type_raises', format($q$select record_stock_adjustment(%L, 'sale', 5, null)$q$, v_w), 'INVALID_TXN_TYPE');
  perform pg_temp.chk_num('adj_guards_stock_unchanged', 925, (select current_stock from ingredients where id = v_w), 0.001);
end $$;
-- P&L Jan 2025 (no seed data there). P 100,000 with W 30 g (cost 30,000). Orders: 01-01 00:30+07 1xP ; 01-10 2xP ; 01-20 1xP -20,000 ; 01-25 cancelled ; 02-01 00:30+07 excluded
--   revenue 380,000 ; cogs_sales 120,000 ; waste 10 g + stocktake shortage 5 g @1,000 = 15,000 (surplus + Feb excluded) ; gross 245,000 (64.47%) ; labor 18,085,000 = sum(gross_pay), draft periods included (D6)
--   opex fixed 1,000,000 + variable 150,000 (Feb / Dec rows excluded) ; net = 245,000 - 18,055,000 - 1,150,000 = -18,960,000 ; net margin -4,989.47%
do $$
declare v_w uuid := (select v from t04 where k = 'w'); v_p uuid; v_cf uuid; v_cv uuid; v_ord uuid; r record; ex record;
begin
  insert into menu_items (code, name, selling_price) values ('T04-P', 'Test P', 100000) returning id into v_p;
  insert into recipes (menu_item_id, ingredient_id, quantity, waste_percent) values (v_p, v_w, 30, 0);
  perform create_order(jsonb_build_array(jsonb_build_object('menu_item_id', v_p, 'quantity', 1)), '2025-01-01 00:30+07', null, 0, 'cash', null);
  perform create_order(jsonb_build_array(jsonb_build_object('menu_item_id', v_p, 'quantity', 2)), '2025-01-10 12:00+07', null, 0, 'cash', null);
  perform create_order(jsonb_build_array(jsonb_build_object('menu_item_id', v_p, 'quantity', 1)), '2025-01-20 19:00+07', null, 20000, 'bank_transfer', null);
  v_ord := create_order(jsonb_build_array(jsonb_build_object('menu_item_id', v_p, 'quantity', 1)), '2025-01-25 12:00+07', null, 0, 'cash', null);
  perform cancel_order(v_ord);
  perform create_order(jsonb_build_array(jsonb_build_object('menu_item_id', v_p, 'quantity', 1)), '2025-02-01 00:30+07', null, 0, 'cash', null);
  insert into inventory_transactions (ingredient_id, txn_type, quantity, reference_type, note, created_at) values
    (v_w, 'waste', -10, 'manual', 'hỏng', '2025-01-10 21:00+07'), (v_w, 'stocktake', -5, 'manual', 'thiếu', '2025-01-12 21:00+07'),
    (v_w, 'stocktake', 5, 'manual', 'thừa', '2025-01-13 21:00+07'), (v_w, 'waste', -10, 'manual', 'tháng 2', '2025-02-01 21:00+07');
  insert into expense_categories (name, expense_type) values ('T04 Mặt bằng', 'fixed'), ('T04 Điện', 'variable');
  select id into v_cf from expense_categories where name = 'T04 Mặt bằng'; select id into v_cv from expense_categories where name = 'T04 Điện';
  insert into expense_records (category_id, title, amount, expense_date, status) values (v_cf, 'Thuê nhà', 1000000, '2025-01-05', 'pending');
  insert into expense_records (category_id, title, amount, expense_date, status, payment_method) values (v_cv, 'Điện', 150000, '2025-01-20', 'paid', 'bank_transfer') returning * into ex;
  -- T-16: a 'paid' expense now requires payment_method + amount > 0 (EXPENSE_INVALID)
  insert into expense_records (category_id, title, amount, expense_date, status, payment_method) values (v_cv, 'Điện T2', 99000, '2025-02-01', 'paid', 'cash'), (v_cf, 'Cũ', 77000, '2024-12-31', 'paid', 'cash');
  perform pg_temp.chk_txt('exp_paid_sets_paid_at', 'true', (ex.paid_at is not null)::text);
  perform pg_temp.chk_txt('exp_pending_paid_at_null', 'true', (select (paid_at is null)::text from expense_records where title = 'Thuê nhà'));
  select * into r from get_pnl_report('2025-01-01', '2025-01-31');
  perform pg_temp.chk_num('pnl_revenue', 380000, r.revenue);
  perform pg_temp.chk_num('pnl_cogs_sales', 120000, r.cogs_sales);
  perform pg_temp.chk_num('pnl_cogs_waste', 10000, r.cogs_waste);
  perform pg_temp.chk_num('pnl_cogs_total', 130000, r.cogs_total);
  perform pg_temp.chk_num('pnl_gross_profit', 250000, r.gross_profit);
  perform pg_temp.chk_num('pnl_gross_margin_pct', 65.79, r.gross_margin_pct);
  perform pg_temp.chk_num('pnl_labor_cost', 18085000, r.labor_cost);
  perform pg_temp.chk_num('pnl_opex_fixed', 1000000, r.opex_fixed);
  perform pg_temp.chk_num('pnl_opex_variable', 150000, r.opex_variable);
  perform pg_temp.chk_num('pnl_opex_total', 1150000, r.opex_total);
  perform pg_temp.chk_num('pnl_net_profit', -18985000, r.net_profit);
  perform pg_temp.chk_num('pnl_net_margin_pct', -4996.05, r.net_margin_pct);
  perform pg_temp.chk_num('pnl_order_count', 3, r.order_count);
  perform pg_temp.chk_num('pnl_avg_order_value', 126666.67, r.avg_order_value);
  perform pg_temp.chk_err('pnl_invalid_range_raises', $q$select * from get_pnl_report('2025-01-31', '2025-01-01')$q$, 'INVALID_RANGE');
  -- monthly: 12 rows ; Jan matches ; Feb = 100,000 - (30,000 + 10,000 waste) - 99,000 = -39,000 ; Mar..Dec empty
  perform pg_temp.chk_num('pnl_monthly_12_rows', 12, (select count(*) from get_pnl_monthly(2025)));
  perform pg_temp.chk_txt('pnl_monthly_months_1_to_12', '1,12,2025-01-01,2025-12-01', (select min(month) || ',' || max(month) || ',' || min(month_start) || ',' || max(month_start) from get_pnl_monthly(2025)));
  select * into r from get_pnl_monthly(2025) where month = 1;
  perform pg_temp.chk_num('pnl_monthly_jan_revenue', 380000, r.revenue);
  perform pg_temp.chk_num('pnl_monthly_jan_net', -18985000, r.net_profit);
  select * into r from get_pnl_monthly(2025) where month = 2;
  perform pg_temp.chk_num('pnl_monthly_feb_revenue', 100000, r.revenue);
  perform pg_temp.chk_num('pnl_monthly_feb_cogs', 40000, r.cogs_total);
  perform pg_temp.chk_num('pnl_monthly_feb_net', -39000, r.net_profit);
  perform pg_temp.chk_num('pnl_monthly_apr_labor_draft', 24800000, (select labor_cost from get_pnl_monthly(2025) where month = 4));
  perform pg_temp.chk_num('pnl_monthly_rest_empty', 0, (select coalesce(sum(abs(revenue) + abs(cogs_total) + abs(opex_total) + abs(labor_cost)), 0) from get_pnl_monthly(2025) where month >= 3 and month <> 4));
end $$;
-- get_dashboard_stats: all keys present and live totals consistent
do $$
declare j jsonb := get_dashboard_stats();
begin
  perform pg_temp.chk_txt('dash_keys_present', 'true', (j ?& array['as_of','today','today_revenue','today_cogs','today_orders','month_start','month_revenue','month_cogs','month_gross_profit',
    'month_labor_cost','month_opex','month_net_profit','month_order_count','low_stock_count','total_supplier_debt','overdue_debt','pending_expenses_amount','pending_expenses_count'])::text);
  perform pg_temp.chk_num('dash_total_supplier_debt', (select sum(current_debt) from suppliers), (j ->> 'total_supplier_debt')::numeric);
  perform pg_temp.chk_num('dash_pending_expenses_count', (select count(*) from expense_records where status = 'pending'), (j ->> 'pending_expenses_count')::numeric);
  perform pg_temp.chk_num('dash_low_stock_count', (select count(*) from ingredients where is_active and current_stock < min_alert_stock), (j ->> 'low_stock_count')::numeric);
  perform pg_temp.chk_txt('dash_today_local', to_local_date(now())::text, j ->> 'today');
end $$;

-- BL-11: record_stock_adjustment can date the ledger row at business time (bounded to <= now())
do $$
declare v_w uuid := (select v from t04 where k = 'w'); v_id uuid; r record;
begin
  v_id := record_stock_adjustment(v_w, 'waste', 3, 'hỏng cuối tháng 12', '2024-12-20 21:00+07');
  perform pg_temp.chk_txt('adj_backdated_created_at', '2024-12-20', to_local_date((select created_at from inventory_transactions where id = v_id))::text);
  select * into r from get_pnl_report('2024-12-01', '2024-12-31');
  perform pg_temp.chk_num('adj_backdated_lands_in_dec', 3000, r.cogs_waste);
  perform pg_temp.chk_err('adj_future_date_raises', format($q$select record_stock_adjustment(%L, 'waste', 1, null, now() + interval '1 day')$q$, v_w), 'INVALID_TXN_DATE');
end $$;

rollback;
