-- =============================================================================
-- Migration: Báo cáo tiêu hao nguyên liệu & Lỗ lãi theo ngày
-- =============================================================================

-- 1. Báo cáo tiêu hao nguyên vật liệu chi tiết trong một ngày
create or replace function public.get_daily_ingredient_usage(p_date date)
returns table (
  ingredient_id       uuid,
  ingredient_code     text,
  ingredient_name     text,
  category            text,
  base_unit           text,
  import_unit         text,
  conversion_factor   numeric,
  sale_qty            numeric,
  waste_qty           numeric,
  total_qty           numeric,
  avg_unit_cost       numeric,
  sale_cost           numeric,
  waste_cost          numeric,
  total_cost          numeric
)
language plpgsql
stable
set search_path = public
as $$
declare
  v_from timestamptz := public.local_day_start(p_date);
  v_to   timestamptz := public.local_day_start(p_date + 1);
begin
  return query
  with tx as (
    select
      it.ingredient_id,
      sum(case
        when it.txn_type = 'sale' then abs(it.quantity)
        when it.txn_type = 'sale_reversal' then -abs(it.quantity)
        else 0
      end) as s_qty,
      sum(case
        when it.txn_type = 'waste' then abs(it.quantity)
        when it.txn_type in ('adjustment', 'stocktake') and it.quantity < 0 then abs(it.quantity)
        when it.txn_type in ('adjustment', 'stocktake') and it.quantity > 0 then -abs(it.quantity)
        else 0
      end) as w_qty,
      sum(case
        when it.txn_type = 'sale' then it.total_cost
        when it.txn_type = 'sale_reversal' then -it.total_cost
        else 0
      end) as s_cost,
      sum(case
        when it.txn_type = 'waste' then it.total_cost
        when it.txn_type in ('adjustment', 'stocktake') and it.quantity < 0 then it.total_cost
        when it.txn_type in ('adjustment', 'stocktake') and it.quantity > 0 then -it.total_cost
        else 0
      end) as w_cost
    from public.inventory_transactions it
    where it.created_at >= v_from and it.created_at < v_to
      and it.txn_type in ('sale', 'sale_reversal', 'waste', 'adjustment', 'stocktake')
    group by it.ingredient_id
  )
  select
    ing.id                                                 as ingredient_id,
    ing.code::text                                         as ingredient_code,
    ing.name::text                                         as ingredient_name,
    coalesce(ing.category, 'Chưa phân loại')::text         as category,
    ing.base_unit::text                                    as base_unit,
    coalesce(ing.import_unit, ing.base_unit)::text         as import_unit,
    coalesce(ing.conversion_factor, 1)::numeric           as conversion_factor,
    coalesce(tx.s_qty, 0)::numeric                         as sale_qty,
    coalesce(tx.w_qty, 0)::numeric                         as waste_qty,
    (coalesce(tx.s_qty, 0) + coalesce(tx.w_qty, 0))::numeric as total_qty,
    case
      when (coalesce(tx.s_qty, 0) + coalesce(tx.w_qty, 0)) > 0
        then round((coalesce(tx.s_cost, 0) + coalesce(tx.w_cost, 0)) / (coalesce(tx.s_qty, 0) + coalesce(tx.w_qty, 0)), 2)
      else coalesce(ing.avg_cost_price, 0)
    end::numeric                                           as avg_unit_cost,
    coalesce(tx.s_cost, 0)::numeric                        as sale_cost,
    coalesce(tx.w_cost, 0)::numeric                        as waste_cost,
    (coalesce(tx.s_cost, 0) + coalesce(tx.w_cost, 0))::numeric as total_cost
  from tx
  join public.ingredients ing on ing.id = tx.ingredient_id
  where (coalesce(tx.s_qty, 0) + coalesce(tx.w_qty, 0)) > 0
     or (coalesce(tx.s_cost, 0) + coalesce(tx.w_cost, 0)) > 0
  order by (coalesce(tx.s_cost, 0) + coalesce(tx.w_cost, 0)) desc, ing.name asc;
end $$;

-- 2. Báo cáo doanh thu, chi phí nguyên liệu, % food cost và lãi lỗ theo chuỗi ngày
create or replace function public.get_daily_pnl_trend(p_start date, p_end date)
returns table (
  report_date      date,
  order_count      int,
  revenue          numeric,
  cogs_sales       numeric,
  cogs_waste       numeric,
  cogs_total       numeric,
  food_cost_pct    numeric,
  gross_profit     numeric,
  gross_margin_pct numeric,
  opex_total       numeric,
  net_profit       numeric,
  net_margin_pct   numeric
)
language plpgsql
stable
set search_path = public
as $$
begin
  if p_start is null or p_end is null or p_end < p_start then
    raise exception 'INVALID_RANGE: p_end must be >= p_start';
  end if;

  return query
  with days as (
    select generate_series(p_start, p_end, '1 day'::interval)::date as d
  ),
  s as (
    select
      public.to_local_date(o.order_date) as d,
      count(*)::int as order_count,
      coalesce(sum(o.total_amount), 0)::numeric as revenue,
      coalesce(sum(o.total_cogs), 0)::numeric as cogs_sales
    from public.orders o
    where o.status = 'completed'
      and o.order_date >= public.local_day_start(p_start)
      and o.order_date < public.local_day_start(p_end + 1)
    group by public.to_local_date(o.order_date)
  ),
  w as (
    select
      public.to_local_date(it.created_at) as d,
      coalesce(round(sum(case
        when it.txn_type = 'waste' then it.total_cost
        when it.txn_type in ('adjustment', 'stocktake') and it.quantity < 0 then it.total_cost
        else 0
      end), 2), 0)::numeric as cogs_waste
    from public.inventory_transactions it
    where it.created_at >= public.local_day_start(p_start)
      and it.created_at < public.local_day_start(p_end + 1)
      and it.txn_type in ('waste', 'adjustment', 'stocktake')
    group by public.to_local_date(it.created_at)
  ),
  x as (
    select
      er.expense_date as d,
      coalesce(sum(er.amount), 0)::numeric as opex_total
    from public.expense_records er
    where er.expense_date between p_start and p_end
    group by er.expense_date
  )
  select
    days.d as report_date,
    coalesce(s.order_count, 0)::int as order_count,
    coalesce(s.revenue, 0)::numeric as revenue,
    coalesce(s.cogs_sales, 0)::numeric as cogs_sales,
    coalesce(w.cogs_waste, 0)::numeric as cogs_waste,
    (coalesce(s.cogs_sales, 0) + coalesce(w.cogs_waste, 0))::numeric as cogs_total,
    case
      when coalesce(s.revenue, 0) > 0
        then round((coalesce(s.cogs_sales, 0) + coalesce(w.cogs_waste, 0)) / s.revenue * 100, 2)
      else 0
    end::numeric as food_cost_pct,
    (coalesce(s.revenue, 0) - coalesce(s.cogs_sales, 0) - coalesce(w.cogs_waste, 0))::numeric as gross_profit,
    case
      when coalesce(s.revenue, 0) > 0
        then round((coalesce(s.revenue, 0) - coalesce(s.cogs_sales, 0) - coalesce(w.cogs_waste, 0)) / s.revenue * 100, 2)
      else 0
    end::numeric as gross_margin_pct,
    coalesce(x.opex_total, 0)::numeric as opex_total,
    (coalesce(s.revenue, 0) - coalesce(s.cogs_sales, 0) - coalesce(w.cogs_waste, 0) - coalesce(x.opex_total, 0))::numeric as net_profit,
    case
      when coalesce(s.revenue, 0) > 0
        then round((coalesce(s.revenue, 0) - coalesce(s.cogs_sales, 0) - coalesce(w.cogs_waste, 0) - coalesce(x.opex_total, 0)) / s.revenue * 100, 2)
      else 0
    end::numeric as net_margin_pct
  from days
  left join s on s.d = days.d
  left join w on w.d = days.d
  left join x on x.d = days.d
  order by days.d desc;
end $$;

-- 3. Cấp quyền thực thi cho các hàm mới
grant execute on function public.get_daily_ingredient_usage(date) to authenticated, service_role;
grant execute on function public.get_daily_pnl_trend(date, date) to authenticated, service_role;
