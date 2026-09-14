# Restaurant ERP — Database Contract (docs/DATABASE.md)

Developer contract for the Supabase/Postgres layer. App code (Server Actions, queries, pages) is written
against THIS document. Column-level details (types, defaults, constraints, indexes, policies) live in the
auto-generated reference **`docs/DATABASE.generated.md`** (regenerate: `bash scripts/db-doc.sh`) and are
not repeated here. Source of truth: `supabase/migrations/20260911000000_init.sql`. Business spec:
`docs/restaurant_erp_prompt.md`. Route/stack contract: `docs/ARCHITECTURE.md`.

Local test loop: `bash scripts/db-test.sh <your_db>` (migration + seed + `supabase/tests/*.sql`).

---

## 1. Overview & invariants (tổng quan & bất biến)

**Domain flow**: Suppliers → Purchase orders (nhập hàng) → Inventory ledger & weighted-average cost →
Recipes/BOM → Orders (bán hàng, trừ kho tự động) → Supplier debt → HR/Payroll → Expenses → P&L.

### 1.1 Units (đơn vị)
- Every ingredient has a **base unit** (`base_unit`: g, ml, pcs…) and an **import unit** (`import_unit`: kg, thùng, lít…)
  with `conversion_factor` = number of base units in 1 import unit (1 kg = 1000 g → factor 1000).
- **Stock, recipes, ledger quantities and `avg_cost_price` are ALWAYS in base units.**
  `ingredients.current_stock` (base), `recipes.quantity` (base per 1 portion), `inventory_transactions.quantity` (signed base),
  `ingredients.avg_cost_price` (VND per base unit).
- **Purchase order lines are in import units**: `purchase_order_items.quantity` (import), `unit_price` (VND per import unit).
  The DB converts: `base_quantity = quantity * conversion_factor`, cost per base = `unit_price / conversion_factor`.
- UI helpers: `v_inventory_status.stock_in_import_units` and `avg_cost_per_import_unit` for human-friendly display.

### 1.2 Money & numbers
- All money is **VND as `numeric(14,2)`** (no cents in practice; DB rounds to 2 decimals). Format with `formatVND`.
- supabase-js returns `numeric` as **string** → parse with `Number()` in queries/types (or cast in select).
- Quantities: `numeric(14,3)`; percentages: `numeric` already multiplied by 100 (`food_cost_pct = 32.50` means 32.5 %).
- Dates: `date` columns are local business dates; `timestamptz` columns are UTC instants. Orders are bucketed into
  calendar days with `to_local_date(order_date)` using `app_settings.timezone` (default `Asia/Ho_Chi_Minh`).

### 1.3 Trigger-maintained columns — NEVER write these from the app
| Table | Column(s) | Maintained by |
|---|---|---|
| `ingredients` | `current_stock`, `avg_cost_price` | PO item insert/delete, every `inventory_transactions` insert |
| `suppliers` | `current_debt` | `purchase_orders` insert/update/delete (= Σ `debt_amount` of that supplier) |
| `purchase_orders` | `total_amount`, `paid_amount`, `debt_amount` (generated), `payment_status`, `due_date` (defaulted), `po_number` (defaulted) | PO items, payment allocations, BEFORE trigger |
| `orders` | `subtotal`, `total_amount`, `total_cogs`, `order_number` (defaulted) | order_items insert, BEFORE trigger |
| `order_items` | `cogs_amount`, `line_total` (generated) | AFTER INSERT trigger |
| `payroll_periods` | `total_net_pay`, `finalized_at`, `paid_at` | payroll_items sync, status trigger / RPCs |
| `payroll_items` | `net_pay`, `gross_pay` (both generated) | — |
| `expense_records` | `paid_at` | BEFORE trigger (set when status → paid, cleared when → pending) |
| `timekeeping` | `hours_worked` (derived when null) | BEFORE trigger |
| `*` | `updated_at` | `set_updated_at` / BEFORE triggers |

Since the hardening pass these columns are **revoked from `authenticated` at column level** (§1.5): writing them raises
`permission denied` instead of silently corrupting the invariants (`current_debt == Σ debt_amount`, `current_stock == Σ ledger`).
Use the RPCs/tables below. `updated_at`, `hours_worked`, `paid_at` on expenses and the generated columns stay trigger-owned by convention.

### 1.4 Immutable / append-only data (dữ liệu chỉ ghi thêm)
- `inventory_transactions`: **no UPDATE/DELETE ever** (`LEDGER_IMMUTABLE`). Reverse with an opposite movement.
- `order_items`: no UPDATE/DELETE (`ORDER_ITEMS_IMMUTABLE`) → an order with lines **cannot be deleted**; call `cancel_order`.
- `purchase_order_items`: no UPDATE (`PO_ITEM_UPDATE_NOT_ALLOWED`); DELETE reverses stock but is **owner/manager only**
  (`PO_ITEM_DELETE_FORBIDDEN`) and does **not** un-blend `avg_cost_price` (§4.1) — delete + re-insert to "edit".
- `supplier_payments`: financial fields (`amount`, `supplier_id`, `purchase_order_id`) cannot change
  (`PAYMENT_UPDATE_NOT_ALLOWED`); `note`/`reference`/`method`/`payment_date` may. **DELETE a payment to reverse it** (allocations cascade → debt restored).
- `supplier_payment_allocations`: never written by the app (created by triggers); UPDATE raises `ALLOCATION_UPDATE_NOT_ALLOWED`.
- Deleting a PO: only possible when it has **no payments** (FK from allocations/payments; a PO with `paid_amount > 0` is additionally
  owner/manager only → `PERMISSION_DENIED`) and the stock it added is still available (`INSUFFICIENT_STOCK` otherwise). Deleting a supplier/ingredient/menu item/employee with history fails on FK → use `is_active = false`.

### 1.5 Security (updated 2026-09-12 — hardening pass)
- Single tenant. RLS is enabled on every table with policy "authenticated full access"; `profiles` is read-all / update-own.
- **`anon` holds no privilege at all** in `public` (tables, sequences, functions revoked, including from `PUBLIC`). RLS is a second barrier, not the only one.
- EXECUTE on functions: the RPCs, reports and helpers are granted to `authenticated` + `service_role`; the **trigger functions**
  (`trg_*`, `handle_new_user`, `set_updated_at`) are explicitly revoked from `authenticated`/`anon`/`PUBLIC` (DOC-09 — Supabase's default
  privileges had already granted them at creation time, so leaving them out of the grant loop was not enough). Triggers keep firing:
  EXECUTE on a trigger function is checked when the trigger is created, not when it fires. `docs/DATABASE.generated.md` →
  *Grants on functions* is the live list (`anon=false` on every row).
- `authenticated` has `select, insert, update, delete` but **not** `truncate / trigger / references` (TRUNCATE would bypass the append-only ledger triggers).
- **Column-level privileges protect every MAINTAINED column of §1.3** (`ingredients.current_stock/avg_cost_price`, `suppliers.current_debt`,
  `purchase_orders.total_amount/paid_amount/payment_status/po_number`, `orders.subtotal/total_amount/total_cogs/order_number/status`,
  `order_items.cogs_amount`, `payroll_periods.status/finalized_at/paid_at/total_net_pay/payment_method`, `profiles.role`).
  Writing them from the app now fails with `permission denied` instead of silently corrupting the invariants.
- Consequently **the business RPCs and every trigger function are `SECURITY DEFINER set search_path = public`** (owner `postgres`): they are the only
  sanctioned writers of those columns. RLS does **not** apply inside them; the barriers are EXECUTE (authenticated/service_role only) and `auth.uid()`.
  → Always call them with an authenticated session (`createClient()` from `@/lib/supabase/server`); a service-role or psql call has no user context.
- `created_by` is stamped from the JWT by a trigger on `inventory_transactions`, `purchase_orders`, `supplier_payments`, `orders`, `timekeeping`, `expense_records` — a client-supplied value is ignored.
- `user_role` (`owner/manager/staff`): helpers `current_user_role()` and `is_manager()` exist and gate the **delete guards**
  (supplier payment, PO with payments, employee with timekeeping, payroll period ≠ draft). No RLS *policy* uses the role yet — enforce the rest in the app UI.
- `app_settings` values are validated by a trigger (`INVALID_SETTING`): timezone must be a real IANA name, `allow_negative_stock` boolean, `food_cost_target_pct` 0–100.
- RLS policies are written `for all to authenticated using (true) with check (true)` (SEC-14): `to authenticated` **is** the role filter, so repeating
  `auth.role() = 'authenticated'` only added a per-row call of a deprecated helper. The real write barrier is the column-level privileges above.
- **The "unlock" flags are no longer forgeable (SEC-11).** The internal writers (`purchase_order_items` → ledger, `order_items` → ledger + `cogs_amount`,
  cancel → `sale_reversal`) still set a transaction-local `app.*` GUC, but the guards now also require `pg_trigger_depth() > 1` (helper
  `public.internal_unlocked(text)`) — a hand-written statement from an `authenticated` session runs at depth 1, so setting the GUC no longer opens anything.
  `app.payroll_unlock` is gone entirely: a finalized/paid period accepts an UPDATE only when nothing except `is_paid/paid_at` changes (what `pay_payroll` does).
- **`supabase/seed.sql` refuses to run on a database that has real users (SEC-16)** → `SEED_BLOCKED`. It truncates every table and plants the demo owner
  `admin@restaurant.local / Admin@123`, so it only proceeds when the session opted in (`set app.allow_seed = 'on'`, which `scripts/db-test.sh` does) or when
  `auth.users` holds no account other than the demo one. **Rotate the demo password before any shared deployment.**
- Errors raised by triggers/RPCs use the form `'CODE: detail'` (see §8). Parse: `const code = error.message.split(':')[0]`.

### 1.6 Sanity CHECK constraints (SEC-09)

Money/quantity columns carry `CHECK`s so a direct `UPDATE` (not only the RPCs) cannot produce impossible values — migration section *17b. SANITY CONSTRAINTS*:

| table | constraint |
|---|---|
| `ingredients` | `avg_cost_price >= 0`, `min_alert_stock >= 0` |
| `inventory_transactions` | `quantity <> 0`, `unit_cost is null or unit_cost >= 0` |
| `purchase_orders` | `due_date >= order_date`, `total_amount >= 0`, `paid_amount >= 0` |
| `employees` | `end_date is null or end_date >= start_date` |
| `orders` | `subtotal >= 0`, `total_cogs >= 0` (plus the existing `discount >= 0`) |
| `order_items` | `cogs_amount >= 0` |
| `payroll_items` | all eight money/time columns `>= 0` (see §4.8) |

Deliberately **not** CHECKs:
- `orders.discount <= subtotal` and `orders.total_amount >= 0` — `create_order` inserts the order (discount already set, `subtotal` still 0) and then builds
  the subtotal line by line, so the intermediate row would violate them. Enforced by `trg_orders_before` instead (`DISCOUNT_EXCEEDS_SUBTOTAL`).
- `purchase_orders.paid_amount <= total_amount` — deleting a paid PO line legitimately drops `total_amount` below `paid_amount` (§4.1); over-payment is
  prevented where it happens (`PAYMENT_EXCEEDS_PO_DEBT`).
- `ingredients.current_stock >= 0` — negative stock is a supported mode (`app_settings.allow_negative_stock`).

---

## 2. Enums (kiểu liệt kê) — Vietnamese labels for UI maps

| Enum | Value | Nhãn UI | Notes |
|---|---|---|---|
| `employment_type` | `full_time` | Toàn thời gian | lương tháng + phụ cấp; prorated by chấm công **only if** the period has timekeeping rows (§5.6) |
| | `part_time` | Bán thời gian | lương theo giờ |
| `payment_method` | `cash` | Tiền mặt | |
| | `bank_transfer` | Chuyển khoản | |
| `po_payment_status` | `unpaid` | Chưa thanh toán | paid_amount = 0 |
| | `partial` | Thanh toán một phần | 0 < paid < total |
| | `paid` | Đã thanh toán | paid ≥ total (badge xanh) |
| `inventory_txn_type` | `purchase` | Nhập hàng | from PO items (+) or PO line delete (−) |
| | `sale` | Bán hàng | − recipe qty × (1+waste%) |
| | `sale_reversal` | Hủy đơn (hoàn kho) | + mirror of sale |
| | `waste` | Hao hụt / hủy bỏ | − (counted in P&L `cogs_waste`) |
| | `adjustment` | Điều chỉnh | ± manual delta — **counted in `cogs_waste`** sign-aware (− costs, + credits), D7 |
| | `stocktake` | Kiểm kê | counted − book; same sign-aware `cogs_waste` treatment (shortage costs, surplus credits); no row when the count matches |
| `order_status` | `completed` | Hoàn thành | default on insert |
| | `cancelled` | Đã hủy | terminal |
| `payroll_status` | `draft` | Nháp | items editable; already counts in P&L labor as the month-to-date estimate (D6) |
| | `finalized` | Đã chốt | locked (reopen with `reopen_payroll`) |
| | `paid` | Đã chi trả | terminal |
| `expense_status` | `pending` | Chờ thanh toán | |
| | `paid` | Đã thanh toán | badge xanh |
| `expense_type` | `fixed` | Chi phí cố định | mặt bằng, khấu hao… |
| | `variable` | Chi phí vận hành | điện nước, marketing, sửa chữa… |
| `user_role` | `owner` / `manager` / `staff` | Chủ / Quản lý / Nhân viên | `owner`/`manager` = `is_manager()`: gates the delete guards, `reopen_payroll`, re-dating an order, deleting a PO line. No RLS policy uses it (§1.5) |
| `menu_class` | `star` | STAR (bán chạy, lãi cao) | |
| | `plowhorse` | PLOWHORSE (bán chạy, lãi thấp) | |
| | `puzzle` | PUZZLE (bán chậm, lãi cao) | |
| | `dog` | DOG (bán chậm, lãi thấp) | |

---

## 3. Tables — semantics & who writes them

Columns: see `docs/DATABASE.generated.md`. "App" = Server Action via supabase-js `.from()`; "RPC" = the functions in §5;
"Trigger" = DB only. Every table has `authenticated full access` RLS.

| Table | Semantics (ý nghĩa) | Who writes |
|---|---|---|
| `app_settings` | Key/value runtime flags (`jsonb`). See §9. | App (settings page, rarely) |
| `profiles` | 1:1 with `auth.users`; auto-created by `handle_new_user` on sign-up (role `staff`). | Trigger; user updates own row |
| `suppliers` | Nhà cung cấp. `payment_terms_days` 0 = COD, else gối đầu N ngày (drives `due_date`). `current_debt` maintained. | App (CRUD master data; never `current_debt`) |
| `ingredients` | Nguyên liệu, base/import unit + factor, `min_alert_stock` (base). `current_stock`/`avg_cost_price` maintained. | App (master data only) |
| `inventory_transactions` | Sổ kho — append-only ledger of every stock movement (signed base qty, `unit_cost` snapshot, `total_cost` generated, `stock_after`, `reference_type`/`reference_id` = `purchase_order_item` / `order_item` / `manual`). | Trigger + RPC `record_stock_adjustment` only. App reads. |
| `menu_items` | Món ăn, `selling_price`, `is_active` (inactive cannot be sold), `is_combo` (true = combo/set menu). | App |
| `recipes` | BOM: one row per (menu_item, ingredient): `quantity` base units per portion, `waste_percent` (0–100). | App (recipe editor: upsert/delete rows) |
| `combo_items` | Món thành phần trong Combo: `combo_id`, `menu_item_id`, `quantity` (món cha `is_combo=true`, món con `is_combo=false`). | App (combo editor: upsert/delete rows) |
| `purchase_orders` | Phiếu nhập. Header only; totals/status/debt maintained. `po_number` auto `PO-YYYYMMDD-####`. | RPC `create_purchase_order`; App may update `invoice_number`/`note`/`due_date`; App may DELETE (see §1.4) |
| `purchase_order_items` | Dòng nhập (import units, snapshot `unit`/`conversion_factor`). Insert = stock in + WAC; delete = stock out. | RPC; App may DELETE / INSERT single lines to correct a PO |
| `supplier_payments` | Sổ quỹ trả nợ NCC. `purchase_order_id` set → đích danh; null → trừ dần FIFO. | RPC `record_supplier_payment`; App DELETE to reverse |
| `supplier_payment_allocations` | Which PO(s) a payment settled and how much. Not in the spec's table list: the spec's "payment updates purchase_orders" is implemented through this join table, so **read the allocations** (never `supplier_payments.purchase_order_id`, which is null for a FIFO/trừ dần payment) to know which POs a payment settled (DOC-13). | Trigger only. App reads for payment detail |
| `employees` | Nhân viên FT/PT: `base_salary`+`allowance` (FT/month), `hourly_rate` (PT), `standard_days_per_month` (default 26). | App |
| `timekeeping` | Chấm công: one row per employee/date/shift (unique, `shift` nullable but treated distinct-null-safe). `hours_worked` derived from `check_in`/`check_out` when omitted (overnight aware). | App (insert/update/delete) |
| `payroll_periods` | Kỳ lương `draft → finalized → paid` (`paid` terminal; `finalized → draft` allowed to reopen). Unique `(period_start, period_end)` **and** a `daterange(period_start, period_end, '[]')` no-overlap EXCLUDE (`PAYROLL_PERIOD_OVERLAP`, §4.8). | App INSERT (draft) + update `name`/`note`; RPCs for status |
| `payroll_items` | One row per employee per period. `net_pay` = what is paid out (`base+allowance+bonus+tips-advance_deduction-penalty`), `gross_pay` = the labor **cost** for the P&L (the same sum without `advance_deduction`) — both generated. Editable **only while period is draft**. | RPC `generate_payroll` creates/refreshes; App updates `bonus`/`tips`/`advance_deduction`/`penalty`/`note` in draft |
| `expense_categories` | Danh mục chi phí with `expense_type` fixed/variable (drives P&L split). `updated_at` maintained by trigger. | App |
| `expense_records` | Hóa đơn chi phí: `amount`, `expense_date` (accrual date used by P&L), `status`, `payment_method`, `attachment_url`. | App (CRUD) |
| `orders` | Đơn bán (POS). `status` default `completed`; totals maintained; `order_number` auto `ORD-YYYYMMDD-####` from local date. | RPC `create_order` / `cancel_order`; App may update `table_number`/`note`/`payment_method` |
| `order_items` | Dòng bán with `menu_item_name`/`unit_price` snapshots and actual `cogs_amount`. Immutable. | RPC only |

Deleting rules recap: `orders` with items → blocked; `purchase_orders` → cascades items (stock reversed), but with `paid_amount > 0`
it is **owner/manager only** (`PERMISSION_DENIED`) and a PO that a `supplier_payments` / `supplier_payment_allocations` row still points at
is refused by the FK (`23503`) until that payment is deleted first;
`menu_items` → cascades `recipes`, blocked if ever sold; `employees` → cascades `timekeeping` (**owner/manager only** once the employee has
timekeeping rows), blocked if the employee appears in any payroll;
`supplier_payments` → cascades allocations (debt comes back); `payroll_periods` → **only a `draft` period can be deleted**
(`trg_payroll_periods_before_delete` → `PAYROLL_PERIOD_LOCKED`; the cascade to `payroll_items` can no longer erase a finalized/paid
payment trail, DOC-08). Reopen with `reopen_payroll` first if a finalized period really must go.

---

## 4. Trigger behaviour (in firing order)

All triggers are row-level and run inside the caller's transaction: any `raise exception` rolls back the whole RPC call.

### 4.1 `purchase_order_items`
**INSERT**
1. `trg_po_items_before_insert` (BEFORE): ingredient must exist (`INGREDIENT_NOT_FOUND`); fills `unit` ← `ingredients.import_unit`
   and `conversion_factor` ← `ingredients.conversion_factor` when null; rounds `unit_price` to 2 dp.
2. Generated columns: `line_total = round(quantity*unit_price,2)`, `base_quantity = round(quantity*conversion_factor,3)`.
3. `trg_po_items_after_insert` (AFTER), spec trigger #3: locks the ingredient, `cost_base = round(unit_price/conversion_factor,4)`;
   **WAC**: `new_avg = (old_stock*old_avg + base_qty*cost_base)/(old_stock+base_qty)`, but if `old_stock <= 0` → `new_avg = cost_base`;
   `current_stock += base_qty`; inserts ledger row `purchase` (+base_qty, `unit_cost = cost_base`, `stock_after`, ref `purchase_order_item`).
   Ledger `created_at` = now(), or **09:00 local on the PO's `order_date` when the PO is backdated**; then
   `purchase_orders.total_amount = Σ line_total` (this UPDATE fires the PO triggers below → supplier debt grows).
**DELETE** — `trg_po_items_after_delete`: **manager/owner only** (`PO_ITEM_DELETE_FORBIDDEN`); `current_stock -= base_quantity`
(`INSUFFICIENT_STOCK` if it would go negative and `allow_negative_stock` is false); **`avg_cost_price` is intentionally NOT
recomputed** — reversing a weighted average needs the full purchase history, so after deleting a line the avg cost keeps the
value that line produced (known limitation, BL-01; correct it with a `stocktake`/`adjustment` if it matters); negative `purchase`
ledger row ("Xóa dòng nhập …"); PO total refreshed (debt shrinks). **UPDATE** — always `PO_ITEM_UPDATE_NOT_ALLOWED`.
Both the insert and the delete path lock the parent `purchase_orders` row (`for update`) *before* recomputing `total_amount`,
so concurrent line changes cannot drop each other from the total.

### 4.2 `purchase_orders`
**BEFORE INSERT/UPDATE** `trg_purchase_orders_before`: on insert fills `order_date` (today), `po_number` (`next_po_number(order_date)`),
`due_date = order_date + suppliers.payment_terms_days` (`SUPPLIER_NOT_FOUND` if supplier missing). Always: rounds amounts,
`INVALID_AMOUNT` if `paid_amount < 0`, `PO_TOTAL_BELOW_PAID` if `total < paid` (e.g. deleting a line of a paid PO),
recomputes `payment_status` (`unpaid` / `partial` / `paid`).
On UPDATE: changing `supplier_id` while payments/allocations exist raises `PO_SUPPLIER_LOCKED`; when `order_date` changes and
`due_date` is **not** set in the same statement, `due_date` is recomputed as `order_date + suppliers.payment_terms_days`.
**AFTER INSERT/UPDATE/DELETE** `trg_purchase_orders_debt` (spec trigger #1): `suppliers.current_debt += Δ debt_amount`
(handles supplier change and delete). Invariant: `current_debt = Σ debt_amount` per supplier.
Note: at INSERT the PO has total 0, so debt actually rises as lines are inserted (via the UPDATE path).

### 4.3 `supplier_payments` INSERT — `trg_supplier_payments_after_insert` (spec trigger #2)
- Locks supplier (`SUPPLIER_NOT_FOUND`).
- **Đích danh** (`purchase_order_id` set): PO must exist (`PO_NOT_FOUND`), belong to the supplier (`PO_SUPPLIER_MISMATCH`),
  and `amount <= PO.debt_amount` (`PAYMENT_EXCEEDS_PO_DEBT`); inserts ONE allocation for the full amount.
- **Trừ dần / FIFO** (`purchase_order_id` null): `amount <= Σ debt_amount` of the supplier (`PAYMENT_EXCEEDS_DEBT`); walks
  POs with debt ordered by `due_date, order_date, created_at` inserting allocations of `least(po.debt, remaining)`.
- Each allocation insert fires `trg_spa_apply`, which re-validates the row on its own (the table is REST-exposed): payment must
  exist (`PAYMENT_NOT_FOUND`), PO must exist (`PO_NOT_FOUND`) and belong to the payment's supplier (`PO_SUPPLIER_MISMATCH`),
  `amount <= PO.debt_amount` (`PAYMENT_EXCEEDS_PO_DEBT`) and `Σ allocations of the payment <= payment.amount`
  (`ALLOCATION_EXCEEDS_PAYMENT`). A direct DELETE of an allocation raises `ALLOCATION_DELETE_NOT_ALLOWED` — they only go away
  with their payment (cascade). Then `purchase_orders.paid_amount += amount` → PO BEFORE trigger recomputes
  `payment_status` → PO debt trigger reduces `suppliers.current_debt`. Deleting the payment reverses all of this.
- UPDATE of amount/supplier/PO → `PAYMENT_UPDATE_NOT_ALLOWED`.

### 4.4 `inventory_transactions` INSERT — `trg_inventory_txn_before_insert`
`INVALID_QUANTITY` if quantity null; `purchase` / `sale` / `sale_reversal` rows may only be written by the PO-item, order-item and
cancel triggers (`LEDGER_MANUAL_FORBIDDEN` otherwise — use `record_stock_adjustment` for manual corrections);
locks ingredient (`INGREDIENT_NOT_FOUND`); `unit_cost` defaults to current `avg_cost_price`.
`purchase` rows: stock already moved by 4.1 → only `stock_after` is filled. All other types: `new_stock = current_stock + quantity`;
`INSUFFICIENT_STOCK` when `< 0` unless `app_settings.allow_negative_stock = true`; updates `ingredients.current_stock`; sets `stock_after`.
`total_cost` is generated = `abs(quantity) * unit_cost`. UPDATE/DELETE → `LEDGER_IMMUTABLE`.

### 4.5 `order_items` INSERT — `trg_order_items_after_insert` ("trừ kho khi bán")
Locks the order (`ORDER_NOT_FOUND`); a **cancelled** order refuses new lines (`ORDER_CANCELLED`). If order is `completed`: for each recipe line
`qty_out = round(recipe.quantity * (1 + waste_percent/100) * item.quantity, 3)` → ledger `sale` row of `-qty_out` at current
`avg_cost_price`, `created_at = orders.order_date` (backdated orders produce backdated ledger rows), ref `order_item`;
`cogs_amount = Σ ledger total_cost` (written through a transaction-local unlock of the immutability guard).
Then `orders.subtotal = Σ line_total`, `orders.total_cogs = Σ cogs_amount` (BEFORE trigger derives `total_amount = subtotal - discount`).
Items of a menu item **without recipe** sell fine with `cogs_amount = 0`. UPDATE/DELETE → `ORDER_ITEMS_IMMUTABLE`.

### 4.6 `orders` — cancel
`trg_orders_before` (BEFORE): insert fills `order_date`, `order_number`; `cancelled → completed` raises `ORDER_CANCEL_IRREVERSIBLE`;
changing `order_date` afterwards is manager/owner only (`ORDER_DATE_LOCKED`) because `order_number` and the `sale` ledger rows keep
the original date; recomputes `total_amount` and raises `DISCOUNT_EXCEEDS_SUBTOTAL` when the discount is changed above the subtotal
(the partial subtotals `create_order` writes while inserting lines are exempt — that RPC re-checks once every line is in). `trg_orders_after_cancel` (AFTER UPDATE OF status, `completed → cancelled`): inserts one `sale_reversal`
row per original `sale` row (same qty positive, same `unit_cost`, `created_at = now()`), restoring stock. **Order totals and
`total_cogs` are kept** for audit; reports exclude cancelled orders by `status`.

### 4.7 `timekeeping` — `trg_timekeeping_before`
When `hours_worked` is null (or on UPDATE the times changed but hours did not): `hours = round(minutes(check_out - check_in)/60, 2)`,
adding 24 h for overnight shifts. Still null → `HOURS_REQUIRED`. Unique `(employee_id, work_date, shift)` with NULLS NOT DISTINCT
→ a second row with the same date and null shift violates the unique constraint (23505).

### 4.8 Payroll
- `payroll_items` `trg_payroll_items_guard` (BEFORE I/U/D): period must be `draft` else `PAYROLL_PERIOD_LOCKED`. The single exception
  (SEC-11) is `pay_payroll` stamping `is_paid/paid_at`: on a non-draft period an UPDATE passes only when **no other column changes**. The same trigger raises `NET_PAY_NEGATIVE` when
  `advance_deduction + penalty` exceed the earnings — a code from a trigger, not a bare CHECK, so the app can show a message (D5).
  All money/time columns additionally carry `>= 0` CHECKs. `trg_payroll_items_sync_total` (AFTER): `payroll_periods.total_net_pay = Σ net_pay`.
- **Two payroll periods may never overlap** (D5/BL-04): `payroll_periods` has `exclude using gist (daterange(period_start, period_end, '[]') with &&)`
  (extension `btree_gist`) and a BEFORE INSERT/UPDATE trigger that raises the readable `PAYROLL_PERIOD_OVERLAP` first. Without it the same
  timekeeping could be paid twice and the P&L would count both periods.
- `payroll_periods` `trg_payroll_periods_before_update`: `paid → anything else` raises `PAYROLL_PERIOD_PAID`;
  any change to the name/dates/payment_method of a paid period raises it too; `→ paid` requires `finalized`
  (`PAYROLL_NOT_FINALIZED`), a non-null `payment_method` (`PAYROLL_PAYMENT_METHOD_REQUIRED`) and stamps `paid_at`;
  `draft → finalized` requires at least one item (`PAYROLL_NO_ITEMS`) and stamps `finalized_at`; `finalized → draft` clears it.
  Direct status updates are blocked for `authenticated` by the column privileges (§1.5) — use the RPCs (`pay_payroll` also marks
  every item `is_paid`).
- `payroll_periods` `trg_payroll_periods_before_delete`: **only a `draft` period can be deleted** (`PAYROLL_PERIOD_LOCKED`).
  The guard is a BEFORE DELETE on the *period*, so the cascade into `payroll_items` never gets to run for a finalized/paid period —
  the payment trail (`is_paid`, `paid_at`, `payment_method`) cannot be erased by deleting the parent (DOC-08).

### 4.9 `expense_records` — `trg_expense_records_before`
`status = 'paid'` and `paid_at` null → `paid_at = now()`; `status = 'pending'` → `paid_at = null`.
A `paid` expense must carry a `payment_method` and an `amount > 0`, else `EXPENSE_INVALID`.

---

## 5. RPC contract (Server Actions call these with `supabase.rpc(name, args)`)

Signatures are copied from `docs/DATABASE.generated.md`. Pass `numeric` as JS numbers, `date` as `YYYY-MM-DD`,
`timestamptz` as ISO strings, uuids as strings. On error `error.message` starts with the CODE (§8). Every RPC is atomic.

### 5.1 `create_purchase_order(p_supplier_id uuid, p_order_date date, p_due_date date, p_invoice_number text, p_note text, p_items jsonb, p_paid_now numeric = 0, p_paid_method payment_method = 'cash') → uuid`
Creates the PO header, inserts every line (stock in + WAC + ledger + totals), and — when `p_paid_now > 0` — records an
**đích danh** payment on this PO dated `p_order_date` (note "Trả ngay khi nhập hàng"). Returns the new PO id.
`p_items` (import units): `[{ "ingredient_id": uuid, "quantity": number > 0, "unit_price": number ≥ 0, "conversion_factor"?: number > 0, "unit"?: string }]`
(omitted `conversion_factor`/`unit` are snapshotted from the ingredient). `p_order_date` null → today; `p_due_date` null → order_date + terms.
```ts
const { data: poId, error } = await supabase.rpc("create_purchase_order", {
  p_supplier_id: supplierId, p_order_date: "2026-09-11", p_due_date: null,
  p_invoice_number: "HD-0012", p_note: null,
  p_items: [{ ingredient_id: beefId, quantity: 5, unit_price: 320000 }],   // 5 kg @ 320,000/kg
  p_paid_now: 800000, p_paid_method: "bank_transfer",
});
```
Errors: `SUPPLIER_NOT_FOUND`, `PO_ITEMS_REQUIRED`, `INVALID_AMOUNT` (paid_now < 0 / unit_price < 0), `INGREDIENT_NOT_FOUND`,
`INVALID_QUANTITY`, `INVALID_CONVERSION`, `PAYMENT_EXCEEDS_PO_DEBT` (paid_now > total). Pages: `/purchases/new`.

### 5.2 `record_supplier_payment(p_supplier_id uuid, p_amount numeric, p_payment_date date, p_method payment_method, p_purchase_order_id uuid = null, p_reference text = null, p_note text = null) → uuid`
Inserts a `supplier_payments` row; the trigger allocates it (đích danh when `p_purchase_order_id` given, else FIFO by due date).
Returns payment id. `p_payment_date` null → today; `p_method` null → cash.
```ts
await supabase.rpc("record_supplier_payment", { p_supplier_id, p_amount: 5000000, p_payment_date: "2026-09-11",
  p_method: "cash", p_purchase_order_id: null /* FIFO */, p_reference: "UNC 1234", p_note: null });
```
Errors: `INVALID_AMOUNT`, `SUPPLIER_NOT_FOUND`, `PO_NOT_FOUND`, `PO_SUPPLIER_MISMATCH`, `PAYMENT_EXCEEDS_PO_DEBT`, `PAYMENT_EXCEEDS_DEBT`.
Pages: `/payments`, `/suppliers/[id]`, `/purchases/[id]` (pay this PO).

### 5.3 `create_order(p_items jsonb, p_order_date timestamptz = now(), p_table_number text = null, p_discount numeric = 0, p_payment_method payment_method = 'cash', p_note text = null) → uuid`
Creates a **completed** order; each line snapshots name/price from `menu_items`, deducts stock per recipe and computes actual COGS.
`p_items`: `[{ "menu_item_id": uuid, "quantity": number > 0 }]` (price is never taken from the client). Returns order id.
```ts
await supabase.rpc("create_order", { p_items: [{ menu_item_id: phoId, quantity: 2 }], p_table_number: "B3",
  p_discount: 20000, p_payment_method: "cash", p_note: null });        // p_order_date omitted → now()
```
Errors: `ORDER_ITEMS_REQUIRED`, `INVALID_AMOUNT` (discount < 0), `MENU_ITEM_NOT_FOUND`, `MENU_ITEM_INACTIVE`, `INVALID_QUANTITY`,
`INSUFFICIENT_STOCK` (unless `allow_negative_stock`), `DISCOUNT_EXCEEDS_SUBTOTAL` (checked after lines → rolled back). Pages: `/orders/new`.

### 5.4 `cancel_order(p_order_id uuid) → void`
Sets `status = 'cancelled'`; the trigger returns stock with `sale_reversal` rows. Totals kept.
Errors: `ORDER_NOT_FOUND`, `ORDER_ALREADY_CANCELLED`. Pages: `/orders`, `/orders/[id]`.

### 5.5 `record_stock_adjustment(p_ingredient_id uuid, p_txn_type inventory_txn_type, p_quantity numeric, p_note text = null, p_txn_at timestamptz = null) → uuid`
Manual movement in **base units**, returns the ledger row id. Meaning of `p_quantity` depends on type:
- `waste`: amount lost (> 0) → ledger `-qty`, valued at avg cost (goes to P&L `cogs_waste`).
- `adjustment`: signed delta (≠ 0) → ledger `qty`. **Counts in `cogs_waste` too** (negative = cost, positive = credit).
- `stocktake`: the **counted** stock (≥ 0) → ledger `counted - current_stock`; note auto-appended "Kiểm kê: đếm X, sổ Y".
  A count that **equals** the book stock writes **no ledger row** and returns `null`. Shortages cost, surpluses credit `cogs_waste`.
`p_txn_at` dates the ledger row at **business time** (BL-11) — waste found on the 31st but entered on the 2nd still belongs to the
month it happened. Omit it (or pass `null`) for `now()`; it may not be in the future (`INVALID_TXN_DATE`). `stock_after` is always the stock at
write time: the ledger is a running balance, back-dating a row does not rewrite the balances of the rows after it.
Errors: `INVALID_TXN_TYPE` (only waste/adjustment/stocktake), `INVALID_QUANTITY`, `INVALID_TXN_DATE`,
`INGREDIENT_NOT_FOUND`, `INSUFFICIENT_STOCK`. Pages: `/inventory/adjustments`, `/inventory/[id]`.

### 5.6 `generate_payroll(p_period_id uuid) → setof payroll_items`
(Re)builds items for a **draft** period from every employee whose **employment overlaps** the period
(`(start_date is null or start_date <= period_end) and (end_date is null or end_date >= period_start)`) and `timekeeping`
in `[period_start, period_end]`: `total_days = count(distinct work_date)`, `total_hours = Σ hours_worked`.
`is_active` is **not** part of the filter (BL-02): an employee who left mid-period is still paid for the days worked — deactivate *and*
set `end_date` to retire someone, `end_date` is what removes them from later periods.
- FT **with** timekeeping in the period: `base_pay = base_salary * least(total_days/standard_days_per_month, 1.0)` (capped at a full month).
- FT with **no** timekeeping row at all in the period: the **full** `base_salary` — attendance is not tracked for that employee (D5).
- PT: `base_pay = hourly_rate * total_hours`.
- `allowance` is paid to **both** types (BL-14): prorated exactly like FT base pay, paid in full for PT.
Upserts per employee — **manual `bonus`/`tips`/`advance_deduction`/`penalty`/`note` are preserved**; rows of employees whose employment
no longer overlaps the period are deleted.
Returns the period's items (array). Errors: `PAYROLL_PERIOD_NOT_FOUND`, `PAYROLL_PERIOD_LOCKED`. Pages: `/payroll/[id]`.

### 5.7 `finalize_payroll(p_period_id uuid) → void`
`draft → finalized` (stamps `finalized_at`); requires at least one item. Errors: `PAYROLL_PERIOD_NOT_FOUND`, `PAYROLL_PERIOD_LOCKED`, `PAYROLL_NO_ITEMS`.
To reopen: `rpc("reopen_payroll", { p_period_id })` — see §5.8b (a direct `update … set status` is blocked by column privileges).

### 5.8 `pay_payroll(p_period_id uuid, p_method payment_method = 'bank_transfer', p_paid_at timestamptz = now()) → void`
`finalized → paid`; marks every item `is_paid = true, paid_at`; stores `payment_method`, `paid_at` on the period. Terminal.
Errors: `PAYROLL_PERIOD_NOT_FOUND`, `PAYROLL_PERIOD_PAID`, `PAYROLL_NOT_FINALIZED`. Pages: `/payroll/[id]`.

### 5.8b `reopen_payroll(p_period_id uuid) → void`
`finalized → draft` so the period can be recalculated (`generate_payroll`) or edited again. **owner/manager only**; a `paid` period cannot be
reopened. Clears `finalized_at`. A `draft` period is a no-op. Errors: `PERMISSION_DENIED`, `PAYROLL_PERIOD_NOT_FOUND`, `PAYROLL_PERIOD_PAID`.
Pages: `/payroll/[id]`.

### 5.9 `get_pnl_report(p_start date, p_end date) → table (1 row)`
Inclusive local-date range. Columns (all `numeric` except `order_count int`):
| column | formula |
|---|---|
| `revenue` | Σ `orders.total_amount` where `status = completed` and `order_date` in range (local days) |
| `cogs_sales` | Σ `orders.total_cogs` of those orders (actual avg-cost at sale time) |
| `cogs_waste` | `-Σ (quantity × unit_cost)` of ledger rows with `txn_type in (waste, adjustment, stocktake)` (by `created_at`) — **sign aware**: shortages cost, surpluses credit, so the same physical event costs the same whichever manual type was used. `purchase`/`sale`/`sale_reversal` are excluded (they are in `cogs_sales` / inventory). |
| `cogs_total` / `gross_profit` / `gross_margin_pct` | `cogs_sales + cogs_waste` / `revenue - cogs_total` / `gross_profit / revenue * 100` (0 when no revenue) |
| `labor_cost` | Σ `payroll_items.gross_pay` (= `base_pay+allowance+bonus+tips-penalty`) of periods with `period_end` inside the range, **any status** (D6). `advance_deduction` is cash timing, not cost, so it is *not* deducted (BL-03); a **draft** period counts as the month-to-date estimate, otherwise an open month would show zero labor (BL-06) — badge it as provisional in the UI while `status = 'draft'`. |
| `opex_fixed` / `opex_variable` / `opex_total` | Σ `expense_records.amount` by `expense_date` in range (accrual: **pending included**), split by category `expense_type` |
| `net_profit` / `net_margin_pct` | `gross_profit - labor_cost - opex_total` / `net_profit / revenue * 100` |
| `order_count` / `avg_order_value` | completed orders / `revenue / order_count` |
**`net_profit` is net profit, not EBITDA (DOC-04).** Every `expense_records` row in the range is subtracted, including a
*Khấu hao / depreciation* category — there is no flag that excludes it and no `get_ebitda_report`. If you need EBITDA, subtract the
depreciation categories in the app: query `expense_records` joined to `expense_categories` for the range and add back the ones you treat
as non-cash. Keep depreciation in its own category so that add-back stays a category filter.

**Opex is accrual, not cash (DOC-12).** A row counts in the period of its `expense_date` whatever its `status`, so an unpaid
(`pending`) bill is already a cost — that is what makes the month comparable. Cash-out for the same rows is `status = 'paid'`
+ `payment_method`; `get_dashboard_stats().pending_expenses_amount` is the gap. Labor is the same shape: accrued from the payroll
period (any status), while `advance_deduction`/`pay_payroll` are the cash side.

```ts
const { data } = await supabase.rpc("get_pnl_report", { p_start: "2026-07-01", p_end: "2026-09-30" }); // quarter
const pnl = data?.[0];   // table-returning → array with one row
```
Errors: `INVALID_RANGE` (`p_end < p_start` or nulls). Pages: `/reports/pnl` (month/quarter cards), `/dashboard`.

### 5.10 `get_pnl_monthly(p_year int) → table (12 rows)`
`month (1–12)`, `month_start date`, `revenue`, `cogs_total`, `gross_profit`, `labor_cost`, `opex_total`, `net_profit` — one row per
month (zeros when empty), each computed with `get_pnl_report`. Feed directly to Recharts. Pages: `/reports/pnl` chart.

### 5.11 `get_dashboard_stats() → jsonb`
Single object, all numbers are JSON numbers (not strings). Keys:
| key | meaning |
|---|---|
| `as_of` (timestamptz) / `today` (date) / `month_start` (date) | evaluation time; local today; first day of current local month |
| `today_revenue`, `today_cogs`, `today_orders` | completed orders of local today |
| `month_revenue`, `month_cogs`, `month_gross_profit`, `month_labor_cost`, `month_opex`, `month_net_profit`, `month_order_count` | `get_pnl_report(month_start, today)` — `month_labor_cost` counts payroll periods of **any** status ending in the month (a `draft` period is the month-to-date estimate, D6/BL-06) |
| `low_stock_count` | active ingredients with `current_stock < min_alert_stock` |
| `total_supplier_debt` | Σ `suppliers.current_debt` |
| `overdue_debt` | Σ `purchase_orders.debt_amount` where `debt_amount > 0 and due_date < today` |
| `pending_expenses_amount`, `pending_expenses_count` | expense_records with `status = pending` |
```ts
const { data } = await supabase.rpc("get_dashboard_stats");  // data: DashboardStats (define the type from the keys above)
```
Pages: `/dashboard`. For lists (low-stock rows, overdue POs, top items) query `v_inventory_status`, `v_purchase_orders_summary`, `v_menu_engineering`.

### 5.12 `next_po_number(p_date date = local_today()) → text`, `next_order_number(p_date date = local_today()) → text`
Callable (granted) but **only for preview** (`PO-20260911-0003`); the number is assigned by the BEFORE INSERT trigger using an
advisory lock, so never pass a client-generated number. That lock is transaction-scoped: while a transaction that inserted an
order (or PO) is open, other inserts of the same kind wait for it — keep order/purchase transactions short (the RPCs are). The
`LIKE 'PO-yyyymmdd-%'` scan behind the counter is served by the `text_pattern_ops` indexes
`idx_purchase_orders_po_number_pattern` / `idx_orders_number_pattern` (SEC-13) — a plain btree cannot serve a prefix `LIKE` under the
`en_US.UTF-8` collation, so without them every order insert scanned the whole table while holding that lock. `app_timezone()`, `to_local_date(ts)`, `local_day_start(date)`, `app_setting_bool(key, default)`
are helper functions also exposed; `handle_new_user` is the auth trigger (do not call).
**Dates**: `public.local_today()` (= `to_local_date(now())`) is the restaurant's business day and replaces `current_date`
everywhere — the defaults of `purchase_orders.order_date`, `supplier_payments.payment_date`, `expense_records.expense_date`,
`timekeeping.work_date`, and every "overdue"/"today" comparison in the views and RPCs. On Supabase the session runs in UTC, so
`current_date` would be yesterday between 00:00 and 07:00 Vietnam time.

---

## 6. Views (all `security_invoker`; read with `.from("v_…")`)

### `v_recipe_costs` — one row per recipe line, live cost (`/menu/[id]` BOM editor)
`effective_quantity = round(quantity * (1 + waste_percent/100), 3)`; `component_cost = round(effective_quantity_raw * avg_cost_price, 2)`
(spec formula `Quantity * (1 + Waste%/100) * Avg_Cost_Price`). Includes ingredient code/name/category/`base_unit`/`avg_cost_price`.
Filter by `menu_item_id`. For live editing on the client, recompute the same formula from `avg_cost_price` while typing.

### `v_combo_items` — one row per combo child item (`/menu/[id]` Combo editor)
Detail view for combo items: `item_code`, `item_name`, `item_category`, `item_selling_price`, `quantity`, `item_ideal_cost`,
`line_cost = quantity * item_ideal_cost`, `line_selling_total = quantity * item_selling_price`, `item_missing_recipe`.
Filter by `combo_id`.

### `v_menu_item_costs` — one row per menu item (`/menu` list)
Single dishes: `ideal_cost = Σ component_cost` from `v_recipe_costs`.
Combos (`is_combo = true`): `ideal_cost = Σ (quantity * child_ideal_cost)` from `combo_items`.
`contribution_margin = selling_price - ideal_cost`,
`food_cost_pct = round(ideal_cost / selling_price * 100, 2)` (**null** when `selling_price = 0` → show "—"),
`ingredient_count`, `missing_recipe = (ingredient_count = 0)`. Badges: red `> 35`, yellow `30–35`, green otherwise (§7.10).

### `v_menu_engineering` — Kasavana-Smith matrix over the **last 30 days** (`now() - 30 days`, completed orders), active items only
- `qty_sold`, `revenue` (Σ line_total), `total_cm = Σ(qty*unit_price) - qty_sold * ideal_cost` (CM at current ideal cost).
- `avg_cm = total_cm / qty_sold` (items with no sales fall back to current `contribution_margin`).
- `popularity_share = qty_sold / Σ qty_sold`; `popularity_threshold = 0.7 / N` where **N = number of ACTIVE menu items** — the whole menu
  being analysed, not only the items that sold (BL-09; Kasavana-Smith's 70 % of the fair share). Deactivate what you no longer sell and the
  threshold rises for the rest. `benchmark_cm = Σ total_cm / Σ qty_sold` (weighted average CM per unit sold, **null** with no sales).
- `is_popular = qty_sold > 0 AND popularity_threshold IS NOT NULL AND popularity_share >= popularity_threshold`;
  `is_profitable = benchmark_cm IS NOT NULL AND avg_cm >= benchmark_cm`.
- `menu_class` is exactly the matrix of those two flags (BL-08): `star` (popular+profitable) · `plowhorse` (popular only) ·
  `puzzle` (profitable only) · `dog` (neither). The class can never contradict the flags.
  Edge case: with **zero sales** in the window there is no benchmark — `benchmark_cm` is null, nothing is popular or profitable and every
  item is `dog`. That means "no data", not "bad item": show an empty-state when `benchmark_cm is null`.
Popularity is measured in **units sold**, not revenue (DOC-06): the spec's "doanh số" is read as Kasavana-Smith's quantity-based
70 % rule, so a cheap high-runner can be popular and an expensive rarity cannot buy its way in. Profitability is per-unit CM
(`avg_cm`) against the weighted-average CM, also the Kasavana-Smith definition.
Scatter chart: x = `popularity_share`, y = `avg_cm`, reference lines at `popularity_threshold` and `benchmark_cm` (same for all rows).

### `v_inventory_status` — ingredients + supplier name (`/inventory`)
`stock_value = current_stock * avg_cost_price`, `is_below_min = current_stock < min_alert_stock` (red badge),
`stock_in_import_units = current_stock / conversion_factor`, `avg_cost_per_import_unit = avg_cost_price * conversion_factor`.
Filter `is_active`; order by `is_below_min desc, name`.

### `v_supplier_debt_summary` — one row per supplier (`/suppliers`)
`current_debt` (maintained column), `po_count`, `unpaid_po_count` (debt > 0), `total_purchased = Σ total_amount`, `total_paid = Σ paid_amount`,
`overdue_debt` = Σ debt of POs with `due_date < local_today()`, `overdue_po_count`, `next_due_date` = min due date among unpaid POs, `last_order_date`.

### `v_purchase_orders_summary` — PO list with supplier (`/purchases`)
All PO columns + `supplier_name`, `supplier_code`, `item_count`, `is_overdue = debt_amount > 0 and due_date < local_today()`,
`days_overdue` (0 when not overdue). Status badge from `payment_status`; red row when `is_overdue`.

### `v_daily_sales` — one row per local calendar day, completed orders only (`/dashboard`, `/reports/pnl` daily chart)
`order_count`, `revenue = Σ total_amount`, `discount_total`, `cogs = Σ total_cogs`, `gross_profit`, `gross_margin_pct` (null when no revenue),
`avg_order_value`. Filter `sales_date >= …`; days without orders are absent (fill zeros in the app).

---

## 7. App recipes (step by step)

Convention: Server Action validates with zod → calls RPC/table → `revalidatePath(...)` → `ok(data)` / `fail(msgFromCode)`.

### 7.1 Tạo phiếu nhập (with `paid_now`) — `/purchases/new`
1. Page loads `suppliers` (active) and `ingredients` (active, with `import_unit`, `conversion_factor`, `avg_cost_per_import_unit` from `v_inventory_status`).
2. Form rows: ingredient, quantity (import unit), unit_price (VND/import unit); client computes `line_total`, PO total, `debt = total - paid_now`;
   preview `due_date = order_date + payment_terms_days`.
3. Action: `rpc("create_purchase_order", {...})` → returns id. Map errors (§8).
4. `revalidatePath("/purchases")`, `/suppliers`, `/suppliers/[id]`, `/inventory`, `/inventory/transactions`, `/payments`, `/dashboard`; redirect `/purchases/[id]`.
5. Detail page reads `v_purchase_orders_summary` + `purchase_order_items` (+ `ingredients` join) + `supplier_payment_allocations` (with `supplier_payments`) for the payment history.
Correcting a line: `delete from purchase_order_items where id = …` then `insert` a new line (same trigger path). Editing quantities in place is rejected.

### 7.2 Trả nợ NCC — `/payments` (đích danh / trừ dần)
1. Form: supplier (from `v_supplier_debt_summary`, show `current_debt`), amount, date, method, reference, optional PO
   (list `v_purchase_orders_summary` where `supplier_id = X and debt_amount > 0`, show `debt_amount` as max).
2. Action: `rpc("record_supplier_payment", { p_purchase_order_id: poId ?? null, ... })`. Client-side max: PO `debt_amount` (đích danh) or `current_debt` (FIFO).
3. Reverse a mistake: `delete from supplier_payments where id = …` (debt and PO status restore automatically).
4. Revalidate `/payments`, `/suppliers`, `/suppliers/[id]`, `/purchases`, `/purchases/[id]`, `/dashboard`.

### 7.3 Bán hàng & hủy đơn — `/orders/new`, `/orders/[id]`
1. POS loads `v_menu_item_costs` where `is_active` (name, price, food_cost_pct badge). Cart = `[{menu_item_id, quantity}]`.
2. Action: `rpc("create_order", {...})` → id. `INSUFFICIENT_STOCK` message names the ingredient — surface it verbatim.
3. Cancel: `rpc("cancel_order", { p_order_id })` behind a `ConfirmDialog`. Revalidate `/orders`, `/orders/[id]`, `/inventory`, `/inventory/transactions`, `/menu/engineering`, `/reports/pnl`, `/dashboard`.
4. Detail: `orders` + `order_items` (`line_total`, `cogs_amount`, margin per line) + ledger rows `where reference_type = 'order_item' and reference_id in (...)`.

### 7.4 Kiểm kê & hao hụt — `/inventory/adjustments`
Stocktake form: list `v_inventory_status`, user enters counted stock (base units) per ingredient → one `rpc("record_stock_adjustment", { p_txn_type: "stocktake", p_quantity: counted })`
per changed row (skip unchanged). Waste form: `p_txn_type: "waste", p_quantity: lost > 0, p_note: reason`. Manual +/−: `adjustment` with signed delta.
Revalidate `/inventory`, `/inventory/[id]`, `/inventory/transactions`, `/reports/pnl`, `/dashboard`.

### 7.5 Vòng đời bảng lương — `/payroll`, `/payroll/[id]`
1. Create period: `insert into payroll_periods (name, period_start, period_end)` (status draft). Unique on dates (23505 → "Kỳ lương đã tồn tại").
2. `rpc("generate_payroll", { p_period_id })` → returns items; re-run anytime while draft after timekeeping changes.
3. Edit `bonus`, `tips`, `advance_deduction`, `penalty`, `note` via `update payroll_items` (draft only). `total_net_pay` updates itself.
4. `rpc("finalize_payroll")` → locked; now counted in P&L labor (by `period_end`). Reopen: `update payroll_periods set status='draft'`.
5. `rpc("pay_payroll", { p_period_id, p_method, p_paid_at })` → terminal. Revalidate `/payroll`, `/payroll/[id]`, `/employees/[id]`, `/reports/pnl`, `/dashboard`.

### 7.6 Chấm công — `/timekeeping`
Insert/upsert `timekeeping` `(employee_id, work_date, shift, check_in, check_out)` — omit `hours_worked` to let the DB derive it,
or send `hours_worked` directly (shift-based logging). Use `onConflict: "employee_id,work_date,shift"` for upsert. Revalidate `/timekeeping`, `/employees/[id]`, `/payroll/[id]` (draft periods).

### 7.7 Chi phí — `/expenses`, `/expenses/categories`
Plain CRUD on `expense_records` / `expense_categories`. Mark paid: `update … set status='paid', payment_method=…` (`paid_at` auto).
`expense_type` of the category decides P&L fixed vs variable. Revalidate `/expenses`, `/reports/pnl`, `/dashboard`.

### 7.8 P&L & dashboard — `/reports/pnl`, `/dashboard`
Month/quarter: `get_pnl_report(p_start, p_end)` (quarter = 3-month range). Yearly chart: `get_pnl_monthly(year)`. Daily trend: `v_daily_sales`.
Dashboard: `get_dashboard_stats()` + lists from `v_inventory_status` (`is_below_min`), `v_purchase_orders_summary` (`is_overdue`), `v_menu_engineering` (top `qty_sold`).

### 7.9 Cảnh báo tồn kho
`v_inventory_status.is_below_min` (red badge, `/inventory`); count = `get_dashboard_stats().low_stock_count`. Threshold is `min_alert_stock` in base units.

### 7.10 Food cost badges
From `v_menu_item_costs.food_cost_pct`: `> FOOD_COST_DANGER (35)` red, `≥ FOOD_COST_WARN (30)` yellow, else green; `null` (price 0) or `missing_recipe` → grey "Chưa có định lượng".
**Where the thresholds live (DOC-11):** both constants are app-side (`FOOD_COST_WARN = 30` / `FOOD_COST_DANGER = 35` in
`src/lib/format.ts`). The database stores only `app_settings.food_cost_target_pct` (35) — the red threshold — and **no SQL reads it**:
`v_menu_item_costs` / `v_menu_engineering` return the raw `food_cost_pct` and never colour a row. There is deliberately no
`food_cost_warn_pct` key. If the thresholds must become configurable, read `food_cost_target_pct` for red and derive/add the yellow
one in the app; keep the classification client-side so a settings change does not need a view rebuild.

---

## 8. Error codes (mã lỗi) → Vietnamese user messages

`error.message` = `'CODE: detail'`. Map by CODE (prefix before the first `:`); fall back to a generic message and log `detail`.

A few failures have **no** CODE because they come from a constraint, not a `raise`: a `CHECK` violation (§1.6) arrives as SQLSTATE `23514`
with the constraint name in `error.message` (e.g. `orders_subtotal_nonneg`), a duplicate key as `23505`. Show a generic
"Dữ liệu không hợp lệ" for those and log the constraint name.

| CODE | Raised when | Suggested message (vi) |
|---|---|---|
| `ALLOCATION_DELETE_NOT_ALLOWED` | DELETE of a `supplier_payment_allocations` row while its payment still exists | Không thể xóa dòng phân bổ. Hãy xóa phiếu chi để hoàn tác. |
| `ALLOCATION_EXCEEDS_PAYMENT` | sum(allocations of a payment) > `supplier_payments.amount` | Tổng phân bổ vượt quá số tiền của phiếu chi. |
| `ALLOCATION_UPDATE_NOT_ALLOWED` | UPDATE on `supplier_payment_allocations` | Không thể sửa phân bổ thanh toán. Hãy xóa và ghi lại phiếu chi. |
| `DISCOUNT_EXCEEDS_SUBTOTAL` | `create_order` discount > subtotal; UPDATE of `orders.discount` above the subtotal | Giảm giá vượt quá tổng tiền hàng. |
| `EXPENSE_INVALID` | expense saved as `paid` without `payment_method`, or with `amount` ≤ 0 | Chi phí đã thanh toán phải có hình thức thanh toán và số tiền lớn hơn 0. |
| `HOURS_REQUIRED` | timekeeping without hours and without both check-in/out | Cần nhập số giờ làm hoặc cả giờ vào và giờ ra. |
| `INGREDIENT_NOT_FOUND` | unknown `ingredient_id` (PO line, ledger, adjustment) | Không tìm thấy nguyên liệu. |
| `INSUFFICIENT_STOCK` | stock would go negative (sale, waste, stocktake, PO line delete) and `allow_negative_stock` = false | Không đủ tồn kho: {detail}. (detail names the ingredient, tồn, cần) |
| `INVALID_AMOUNT` | negative paid_now / paid_amount / discount / unit_price, payment ≤ 0 | Số tiền không hợp lệ. |
| `INVALID_CONVERSION` | PO line `conversion_factor <= 0` | Hệ số quy đổi phải lớn hơn 0. |
| `INVALID_QUANTITY` | quantity null/≤ 0 (PO line, order line), waste ≤ 0, adjustment = 0, stocktake < 0 | Số lượng không hợp lệ. |
| `INVALID_RANGE` | `get_pnl_report` with `p_end < p_start` | Khoảng thời gian không hợp lệ. |
| `INVALID_TXN_TYPE` | `record_stock_adjustment` with type other than waste/adjustment/stocktake | Loại giao dịch kho không hợp lệ. |
| `INVALID_TXN_DATE` | `record_stock_adjustment` with `p_txn_at` in the future | Ngày ghi nhận không được ở tương lai. |
| `INVALID_SETTING` | `app_settings` value fails validation (timezone, boolean, 0–100) | Giá trị cấu hình không hợp lệ. |
| `LEDGER_IMMUTABLE` | UPDATE/DELETE on `inventory_transactions` | Sổ kho không thể sửa hoặc xóa. Hãy tạo giao dịch điều chỉnh. |
| `LEDGER_MANUAL_FORBIDDEN` | direct INSERT into `inventory_transactions` with `purchase` / `sale` / `sale_reversal` | Không thể ghi tay dòng sổ kho này. Hãy dùng phiếu nhập, đơn hàng hoặc điều chỉnh kho. |
| `MENU_ITEM_INACTIVE` | `create_order` with an inactive item | Món "{detail}" đã ngừng bán. |
| `MENU_ITEM_NOT_FOUND` | `create_order` unknown `menu_item_id` | Không tìm thấy món ăn. |
| `ORDER_ALREADY_CANCELLED` | `cancel_order` on a cancelled order | Đơn hàng đã bị hủy trước đó. |
| `ORDER_CANCEL_IRREVERSIBLE` | UPDATE status cancelled → completed | Đơn đã hủy không thể khôi phục. Hãy tạo đơn mới. |
| `ORDER_CANCELLED` | inserting an `order_items` row into a cancelled order | Đơn hàng đã hủy, không thể thêm món. |
| `ORDER_DATE_LOCKED` | changing `orders.order_date` after creation without the manager/owner role | Chỉ Chủ/Quản lý mới được đổi ngày của đơn đã tạo. |
| `ORDER_ITEMS_IMMUTABLE` | UPDATE/DELETE on `order_items` (incl. deleting an order) | Không thể sửa dòng đơn hàng. Hãy hủy đơn và tạo lại. |
| `ORDER_ITEMS_REQUIRED` | `create_order` with empty items | Đơn hàng phải có ít nhất một món. |
| `ORDER_NOT_FOUND` | `cancel_order` / order line for unknown order | Không tìm thấy đơn hàng. |
| `PAYMENT_NOT_FOUND` | allocation references an unknown payment | Không tìm thấy phiếu chi. |
| `PAYMENT_EXCEEDS_DEBT` | FIFO payment > supplier's total outstanding | Số tiền thanh toán vượt quá tổng công nợ của NCC. |
| `PAYMENT_EXCEEDS_PO_DEBT` | đích danh payment (or `paid_now`) > that PO's debt | Số tiền thanh toán vượt quá công nợ còn lại của phiếu nhập. |
| `PERMISSION_DENIED` | delete/reopen reserved to owner/manager (payment, PO with payments, employee with timekeeping, `reopen_payroll`) | Bạn không có quyền thực hiện thao tác này (cần Chủ/Quản lý). |
| `PAYMENT_UPDATE_NOT_ALLOWED` | changing amount/supplier/PO of a payment | Không thể sửa phiếu chi. Hãy xóa và ghi lại. |
| `PAYROLL_NOT_FINALIZED` | paying a period that is not finalized | Cần chốt bảng lương trước khi chi trả. |
| `PAYROLL_NO_ITEMS` | finalizing a period without items | Chưa tính lương cho kỳ này. Hãy tính lương trước. |
| `PAYROLL_PAYMENT_METHOD_REQUIRED` | direct UPDATE finalized → paid without `payment_method` | Chọn hình thức chi lương trước khi đánh dấu đã trả. |
| `PAYROLL_PERIOD_LOCKED` | generate/finalize on non-draft; editing items of non-draft; **deleting a period that is not draft** | Kỳ lương đã chốt, không thể chỉnh sửa hoặc xóa. |
| `PAYROLL_PERIOD_NOT_FOUND` | unknown period id | Không tìm thấy kỳ lương. |
| `PAYROLL_PERIOD_PAID` | any change to a paid period / paying twice | Kỳ lương đã chi trả, không thể thay đổi. |
| `PAYROLL_PERIOD_OVERLAP` | a payroll period whose dates overlap an existing period | Kỳ lương bị trùng ngày với kỳ lương đã có. Hãy chọn khoảng ngày khác. |
| `NET_PAY_NEGATIVE` | payroll item where advance/penalty exceed the earnings | Thực lĩnh âm: tạm ứng hoặc phạt lớn hơn thu nhập. Hãy giảm tạm ứng hoặc phạt. |
| `PO_ITEMS_REQUIRED` | `create_purchase_order` with empty items | Phiếu nhập phải có ít nhất một dòng. |
| `PO_ITEM_DELETE_FORBIDDEN` | deleting a `purchase_order_items` row without the manager/owner role | Chỉ Chủ/Quản lý mới được xóa dòng phiếu nhập. |
| `PO_ITEM_UPDATE_NOT_ALLOWED` | UPDATE on `purchase_order_items` | Không thể sửa dòng nhập. Hãy xóa dòng và nhập lại. |
| `PO_NOT_FOUND` | payment references unknown PO | Không tìm thấy phiếu nhập. |
| `PO_SUPPLIER_LOCKED` | changing `purchase_orders.supplier_id` while payments/allocations exist | Phiếu nhập đã có thanh toán, không thể đổi nhà cung cấp. |
| `PO_SUPPLIER_MISMATCH` | payment PO belongs to another supplier | Phiếu nhập không thuộc nhà cung cấp đã chọn. |
| `PO_TOTAL_BELOW_PAID` | PO total would drop below paid amount (deleting a line of a paid PO) | Tổng phiếu nhập không thể nhỏ hơn số tiền đã thanh toán. |
| `SEED_BLOCKED` | `supabase/seed.sql` run on a database that already has real `auth.users` (demo seed truncates everything) | Không thể chạy dữ liệu mẫu trên cơ sở dữ liệu đang có người dùng thật. |
| `SUPPLIER_NOT_FOUND` | unknown supplier (PO, payment) | Không tìm thấy nhà cung cấp. |

Native Postgres errors to map too (`error.code`): `23505` unique (mã/số phiếu/kỳ lương trùng → "Dữ liệu đã tồn tại"),
`23503` FK (xóa bản ghi đang được sử dụng → "Không thể xóa: dữ liệu đang được sử dụng"), `23514` check constraint ("Giá trị không hợp lệ"),
`42501` permission denied (ghi vào cột do DB tự quản, hoặc chưa đăng nhập) → "Không thể ghi trực tiếp giá trị này; hãy dùng chức năng nghiệp vụ tương ứng".

---

## 9. `app_settings` keys

| key | default (jsonb) | used by |
|---|---|---|
| `allow_negative_stock` | `false` | ledger insert & PO line delete: when `true`, stock may go below 0 instead of `INSUFFICIENT_STOCK` (seed enables it temporarily) |
| `timezone` | `"Asia/Ho_Chi_Minh"` | `app_timezone()` → day bucketing of orders (`v_daily_sales`, P&L, dashboard, `order_number` date) |
| `food_cost_target_pct` | `35` | app-side **red** badge threshold; validated 0–100 by the settings trigger but **read by no SQL** (§7.10). The yellow threshold (30) has no DB key — it is `FOOD_COST_WARN` in `src/lib/format.ts` |
| `restaurant_name` | `"Nhà hàng Phố Việt"` | header / print |
| `currency` | `"VND"` | display only |

Read: `select key, value from app_settings`; booleans may be stored as JSON boolean or string (`app_setting_bool` accepts both).
Write: `upsert({ key, value })` — changing `timezone` re-buckets historical reports; do it before go-live only.
