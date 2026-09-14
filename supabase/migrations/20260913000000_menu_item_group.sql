-- =============================================================================
-- Migration: Add item_group to menu_items and update v_menu_item_costs
-- =============================================================================

alter table public.menu_items
  add column if not exists item_group text;

create index if not exists idx_menu_items_item_group on public.menu_items (item_group);

-- Recreate view v_menu_item_costs with item_group appended to avoid invalidating dependent view v_menu_engineering
create or replace view public.v_menu_item_costs
with (security_invoker = true) as
with single_item_costs as (
  select
    m.id,
    coalesce(rc.ideal_cost, 0) as ideal_cost,
    coalesce(rc.ingredient_count, 0)::int as ingredient_count,
    (coalesce(rc.ingredient_count, 0) = 0) as missing_recipe
  from public.menu_items m
  left join (
    select menu_item_id, sum(component_cost) as ideal_cost, count(*) as ingredient_count
      from public.v_recipe_costs
     group by menu_item_id
  ) rc on rc.menu_item_id = m.id
  where not m.is_combo
),
combo_costs as (
  select
    ci.combo_id as id,
    coalesce(sum(ci.quantity * sic.ideal_cost), 0) as ideal_cost,
    coalesce(sum(ci.quantity * sic.ingredient_count), 0)::int as ingredient_count,
    (bool_or(sic.missing_recipe) or count(ci.id) = 0) as missing_recipe
  from public.combo_items ci
  join single_item_costs sic on sic.id = ci.menu_item_id
  group by ci.combo_id
)
select
  m.id,
  m.code,
  m.name,
  m.category,
  m.selling_price,
  m.tax_percent,
  m.is_active,
  m.is_combo,
  m.image_url,
  case
    when m.is_combo then coalesce(cc.ideal_cost, 0)
    else coalesce(sc.ideal_cost, 0)
  end as ideal_cost,
  m.selling_price - case
    when m.is_combo then coalesce(cc.ideal_cost, 0)
    else coalesce(sc.ideal_cost, 0)
  end as contribution_margin,
  case when m.selling_price > 0
       then round((case when m.is_combo then coalesce(cc.ideal_cost, 0) else coalesce(sc.ideal_cost, 0) end) / m.selling_price * 100, 2)
       else null end as food_cost_pct,
  case
    when m.is_combo then coalesce(cc.ingredient_count, 0)::int
    else coalesce(sc.ingredient_count, 0)::int
  end as ingredient_count,
  case
    when m.is_combo then coalesce(cc.missing_recipe, true)
    else coalesce(sc.missing_recipe, true)
  end as missing_recipe,
  m.created_at,
  m.updated_at,
  m.item_group
from public.menu_items m
left join single_item_costs sc on sc.id = m.id and not m.is_combo
left join combo_costs cc on cc.id = m.id and m.is_combo;
