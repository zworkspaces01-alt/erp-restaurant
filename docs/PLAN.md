# Restaurant ERP — Kế hoạch triển khai (Implementation Plan)

Ngày lập: 2026-09-12 · Cập nhật: 2026-09-12 (sau Phase 0). Spec gốc: `docs/restaurant_erp_prompt.md` (yêu cầu *báo cáo kiểm soát nguyên liệu hàng ngày* và Next.js 16+).
Hợp đồng kỹ thuật: `docs/ARCHITECTURE.md` · `docs/DATABASE.md` · `docs/DATABASE.generated.md`. Kết quả review DB: `docs/db-review-findings.json`.

Tài liệu này là **lộ trình duy nhất** để đưa dự án từ trạng thái hiện tại (khung đã có, app chưa chạy được) đến bản v1 chạy thật.
Mỗi phase có deliverable + tiêu chí hoàn thành (DoD). Làm tuần tự; không nhảy phase khi DoD chưa đạt.

---

## 0. Hiện trạng đã kiểm chứng (2026-09-12)

| Hạng mục | Trạng thái | Ghi chú |
|---|---|---|
| Stack | ✅ Next 15.5.25 · React 19.1 · TS strict · Tailwind v4 · shadcn (radix-nova) · TanStack Table 8 · Recharts 3 · RHF + Zod 3 · @supabase/ssr | Spec gốc yêu cầu **Next 16+** → xem Phase 1.5 |
| Migration DB | ✅ `supabase/migrations/20260911000000_init.sql` (2.086 dòng): 19 bảng, 7 view, 11 RPC + helper, ~20 trigger, RLS mọi bảng | Đã áp lên Supabase local (cổng 544xx) kèm seed (47 nguyên liệu, 1.000 đơn, user demo) |
| SQL tests | ✅ `npm run db:test` **và** `npm run db:test:real` xanh 100% (5 file) | Sửa ở Phase 0: test set cả 2 dạng JWT claim |
| Review DB | ⚠️ 59 findings; **đợt hardening đã áp** (mục 17a + GRANTS của migration) xử lý phần lớn nhóm SEC | Còn lại xử lý ở Phase 2 — xem §2.3 |
| Typecheck app | ❌ **106 lỗi** `tsc --noEmit` | Toàn bộ là **lệch schema**: app viết theo tên bảng/cột/RPC khác với migration (xem §2) |
| Lint | ✅ sạch | |
| Build | ❌ `next build` sẽ fail vì `ignoreBuildErrors: false` | Tự hết khi Phase 1 xong |
| Pages | ⚠️ 24 trang có; **thiếu 6 trang chi tiết** theo route map + trang báo cáo ngày + settings | Phase 3 |
| E2E | ⚠️ Playwright smoke 18 route + auth setup đã viết, chưa từng chạy xanh | Phase 5 |
| Git | ✅ Đã `git init` + commit baseline | Phase 0 xong |
| Môi trường | ✅ Docker: Supabase local (API 54421, DB 54422, Studio 54423), `erp-pg` 54329 cho db:test | `.env.local` đã trỏ local |

**Kết luận**: tầng DB là phần chắc nhất (có test, có docs, có review). Tầng app được viết song song theo một schema "tưởng tượng" nên không khớp.
→ **Quyết định nền tảng: DB là nguồn sự thật (source of truth). Sửa app theo DB, không sửa DB theo app** — trừ những thứ DB thật sự thiếu (xem Phase 2).

---

## 1. Nguyên tắc làm việc (áp dụng cho mọi phase)

1. **Trước go-live**: `…_init.sql` vẫn là file duy nhất được sửa (dự án chưa phát hành; `db:test` dựng lại DB từ đầu mỗi lần, `npx supabase db reset` áp lại local).
   **Sau go-live (Phase 6)**: đóng băng file init, mọi thay đổi = migration mới `2026MMDDhhmmss_<ten>.sql`.
2. Sau mỗi thay đổi DB, đủ 4 bước: test trong `supabase/tests/` → `npm run db:test` **và** `npm run db:test:real` xanh → `npm run db:types` + `npm run db:doc` → cập nhật `docs/DATABASE.md`.
3. Mọi mutation nghiệp vụ nhiều bước đi qua **RPC** (không tự cộng kho/công nợ ở app). CRUD master data đi qua `.from()`.
4. Server Action: validate zod → gọi Supabase → map lỗi `CODE: detail` sang tiếng Việt (§8 DATABASE.md) → `revalidatePath` → `ok()/fail()`.
5. Không `any`, không `@ts-ignore`. Cổng chất lượng trước khi coi một việc là xong: `npm run check` (typecheck + lint + db:test).
6. Không đổi version thư viện ngoài Phase 1.5.
7. Text UI tiếng Việt có dấu; tiền `formatVND`; ngày `formatDate`.

---

## 2. Bảng ánh xạ lệch schema (app → DB) — tài liệu tham chiếu cho Phase 1

Cột bên trái là tên **app đang dùng sai**, bên phải là tên **thật trong DB** (từ `src/types/database.ts`).

### 2.1 Bảng & cột
| Module | App đang dùng | DB thật | Ghi chú |
|---|---|---|---|
| suppliers | `payment_terms` enum `cod/net_7/net_15/net_30` | `payment_terms_days` int (0/7/15/30) | Giữ select có nhãn, map sang số ngày |
| suppliers | `notes` | `note`, thêm `contact_name`, `tax_code`, `is_active` | |
| ingredients | `notes` | `note`, `default_supplier_id`, `is_active` | Trang danh sách đọc `v_inventory_status` (có `is_below_min`, `stock_value`, `stock_in_import_units`) |
| inventory | bảng `inventory_adjustments` | **không tồn tại** → `inventory_transactions` lọc `txn_type in ('waste','adjustment','stocktake')` | `old_stock = stock_after - quantity`, `new_stock = stock_after`, `difference = quantity`, `reason = note`, `adjustment_type = txn_type` |
| inventory | `quantity_change` / `transaction_type` / `total_value` / `notes` | `quantity` / `txn_type` / `total_cost` / `note` (+ `unit_cost`, `stock_after`, `reference_type`, `reference_id`) | |
| inventory | RPC `create_inventory_adjustment` | `record_stock_adjustment(p_ingredient_id, p_txn_type, p_quantity, p_note)` | Ý nghĩa `p_quantity` theo loại: waste = số mất (>0), adjustment = delta có dấu, stocktake = số **đếm được** |
| inventory | `adjustmentSchema.adjustment_type: stocktake/waste/spoilage/return` | `stocktake/waste/adjustment` | Bỏ spoilage/return |
| menu | `v_menu_item_costs.menu_item_id`, `food_cost_percent` | `id`, `food_cost_pct` | |
| recipes | `notes` | `note` | Editor đọc `v_recipe_costs` (đã có `effective_quantity`, `component_cost`) |
| menu engineering | `bcg_category` (`STAR…`) / `total_sold` / `unit_margin` / `total_revenue` / `total_margin` / `avg_popularity` / `avg_unit_margin` / `menu_item_id` | `menu_class` (`star/plowhorse/puzzle/dog`) / `qty_sold` / `avg_cm` / `revenue` / `total_cm` / `popularity_threshold` (trục x = `popularity_share`) / `benchmark_cm` / `id` | `BCG_CATEGORY_LABELS` đổi key sang chữ thường |
| orders | status `pending/completed/cancelled`; payment `card` | status `completed/cancelled`; payment `cash/bank_transfer` | Bỏ `pending` và `card` |
| orders | RPC `create_order({p_table_number, p_items, p_payment_method, p_notes})` → `{order_id}` | `create_order({p_items, p_table_number, p_discount, p_payment_method, p_note, p_order_date?})` → **uuid string** | Thêm ô giảm giá |
| purchases | items `import_quantity/import_unit/import_unit_price` | `quantity/unit/unit_price` (+ `conversion_factor`) | |
| purchases | RPC `p_paid_amount`, `notes` → `{purchase_order_id}` | `p_paid_now`, `p_paid_method`, `p_due_date`, `p_invoice_number`, `p_note` → **uuid string** | Danh sách đọc `v_purchase_orders_summary` |
| payments | RPC `p_payment_method`, `p_notes` → `{payment_id}` | `p_method`, `p_note`, `p_reference` → **uuid string** | |
| payments | cột `payment_number`, `payment_method`, `notes` | không có `payment_number`; `method`, `note`, `reference` | Hiển thị mã = ngày + NCC hoặc 8 ký tự đầu id; supplier options từ `v_supplier_debt_summary` |
| employees | `role`, `status: active/inactive`, `hire_date` | `position`, `is_active` boolean, `start_date` (+ `end_date`, `hourly_rate`, `standard_days_per_month`, `bank_account`) | PT bắt buộc nhập `hourly_rate` |
| timekeeping | `status: present/half_day/absent/leave`, `notes` | **không có status**; `shift` text tự do, `check_in`, `check_out`, `hours_worked` (tự tính nếu null), `note` | Upsert `onConflict: "employee_id,work_date,shift"` |
| payroll | `period_name/start_date/end_date/total_salary` | `name/period_start/period_end/total_net_pay` | items: `base_pay, allowance, bonus, tips, advance_deduction, penalty, net_pay, total_days, total_hours, is_paid` |
| expenses | `expense_categories.code` | không có (`name, description, expense_type, is_active`) | |
| expenses | `expense_records.description` | `title` (+ `note`, `vendor`, `invoice_number`, `attachment_url`) | |
| reports | `get_pnl_report({p_start_date,p_end_date})` → object | `{p_start, p_end}` → **mảng 1 dòng** (`data[0]`) với `revenue, cogs_sales, cogs_waste, cogs_total, gross_profit, gross_margin_pct, labor_cost, opex_fixed, opex_variable, opex_total, net_profit, net_margin_pct, order_count, avg_order_value` | |
| reports | view `v_daily_ingredient_usage` | **chưa có** | Tạo ở Phase 2 (yêu cầu mới của spec) |
| dashboard | `.filter("current_stock","lte","min_alert_stock")` | **bug**: so sánh với chuỗi "min_alert_stock" → dùng `v_inventory_status.eq("is_below_min", true)` | |
| dashboard | keys `today_gross_profit`, `overdue_po_count` | `get_dashboard_stats()` trả: `today_revenue, today_cogs, today_orders, month_revenue, month_cogs, month_gross_profit, month_labor_cost, month_opex, month_net_profit, month_order_count, low_stock_count, total_supplier_debt, overdue_debt, pending_expenses_amount, pending_expenses_count, today, month_start, as_of` | Quá hạn: `v_purchase_orders_summary.is_overdue` |

### 2.2 `src/types/restaurant.ts` cần viết lại
- Bỏ `PAYMENT_TERMS` enum → `PAYMENT_TERMS_DAYS = [0, 7, 15, 30]` + labels. Bỏ `ORDER_STATUSES.pending`, `TIMEKEEPING_STATUSES`, `card`.
- Mọi zod schema dùng đúng tên cột DB. Thêm: `DashboardStats`, `PnlReport`, `PnlMonthlyRow`, `MenuClass` types; `ERROR_MESSAGES` map theo §8 DATABASE.md.
- Helper thuần (test được bằng unit test): `recipeLineCost(qty, wastePct, avgCost)`, `poLineTotal`, `poDebt(total, paidNow)`, `dueDate(orderDate, termsDays)`, `foodCostTone(pct)`, `payrollPreview(...)`.

### 2.3 Findings DB **đã xử lý** trong đợt hardening (mục 17a + 18 GRANTS của migration)
Kiểm chứng bằng `npm run db:test:real` xanh + đọc lại migration. Không làm lại ở Phase 2.

| Finding | Cách xử lý đã áp |
|---|---|
| SEC-04, DOC-09 | `revoke all on all functions … from anon, public` + default privileges; chỉ `authenticated`/`service_role` có EXECUTE; trigger function và `handle_new_user` không cấp cho ai |
| SEC-05 | `revoke all on all tables/sequences … from anon, public` — anon không còn quyền nào, RLS không phải lớp chắn duy nhất |
| SEC-03 | `revoke truncate, trigger, references … from anon, authenticated` — không TRUNCATE được để lách trigger append-only |
| SEC-01, T-03, SEC-06 | **Column-level privileges**: `authenticated` mất UPDATE/INSERT trên cột MAINTAINED (`current_stock`, `avg_cost_price`, `current_debt`, PO `total/paid/payment_status/po_number`, orders `subtotal/total_amount/total_cogs/order_number/status`, `order_items.cogs_amount`, payroll `status/finalized_at/paid_at/total_net_pay/payment_method`, `profiles.role`). Mọi trigger function + RPC ghi các cột này chuyển sang `security definer set search_path = public` |
| T-07 | Hệ quả của trên: `update payroll_periods set status=…` trực tiếp bị chặn ở tầng quyền → chỉ đổi trạng thái qua RPC |
| SEC-02, T-05, DOC-08 | `trg_payroll_periods_before_delete`: chỉ kỳ `draft` mới xóa được (`PAYROLL_PERIOD_LOCKED`) |
| SEC-08 | `trg_supplier_payments_before_delete`: chỉ `owner/manager` xóa được phiếu chi |
| SEC-07 | `trg_employees_before_delete`: nhân viên đã có chấm công chỉ `owner/manager` xóa được |
| SEC-10 | `trg_app_settings_validate`: chặn timezone sai, `allow_negative_stock` không phải boolean, `food_cost_target_pct` ngoài 0–100, tên/tiền tệ rỗng |
| SEC-12 | `trg_set_created_by`: `created_by` luôn lấy từ JWT trên 6 bảng, bỏ qua giá trị client gửi |
| DOC-10 (một phần) | Helper `current_user_role()` / `is_manager()` đã có và được dùng trong các guard xóa. Policy RLS vẫn là "authenticated full access" — phần policy theo role còn lại ở Phase 2 |
| Mới | RPC `reopen_payroll(p_period_id)`: mở lại kỳ `finalized → draft` (owner/manager; kỳ `paid` không mở lại được) |

**Hệ quả cần nhớ khi code app**: RPC nghiệp vụ giờ là `SECURITY DEFINER` (không còn invoker) — RLS không áp bên trong, lớp chặn là quyền EXECUTE + `auth.uid()`. App **bắt buộc** gọi RPC bằng session đã đăng nhập. Ghi thẳng vào cột MAINTAINED nay sẽ lỗi `permission denied`, không còn âm thầm hỏng dữ liệu.

Mã lỗi mới cần map tiếng Việt: `PERMISSION_DENIED` → "Bạn không có quyền thực hiện thao tác này (cần Chủ/Quản lý)", `INVALID_SETTING` → "Giá trị cấu hình không hợp lệ".

---

## 3. Lộ trình theo phase

### Phase 0 — Nền tảng & cổng chất lượng — ✅ **XONG 2026-09-12**
1. ✅ `git init` + commit baseline (`.env.local` không bị commit, chỉ `.env.example`).
2. ✅ `package.json`: thêm `check` (typecheck + lint + db:test) và `db:doc`.
3. ✅ Sửa test RLS đỏ: nguyên nhân **không phải grants** (migration đã revoke đúng) mà do image `supabase/postgres` trần ship `auth.uid()` kiểu cũ chỉ đọc `request.jwt.claim.sub`, trong khi test set `request.jwt.claims`. `supabase/tests/05_rls.sql` giờ set **cả hai dạng claim** → `db:test` và `db:test:real` xanh 100%.
4. ✅ `CLAUDE.md` ở root: hợp đồng làm việc, lệnh, 10 luật bất di bất dịch.
5. ✅ Gộp spec về một bản `docs/restaurant_erp_prompt.md` (bỏ bản trùng ở root, README đã trỏ đúng).
6. ✅ Sinh lại `src/types/database.ts` + `docs/DATABASE.generated.md` theo migration mới nhất (có `reopen_payroll`, `current_user_role`, `is_manager`).

### Phase 1 — Đồng bộ app với DB: về 0 lỗi typecheck (≈ 1–1.5 ngày)
Làm theo module, mỗi module một commit, dùng bảng §2 làm checklist. Thứ tự (từ ít phụ thuộc → nhiều):
1. **Nền**: viết lại `src/types/restaurant.ts` (§2.2); tạo `src/lib/errors.ts` (`mapDbError(error): string` xử lý `CODE: detail`, `23505/23503/23514`); `src/lib/queries/*` chỉ trả về kiểu suy ra từ `Database` (không `as` ép kiểu thủ công trừ RPC jsonb có type riêng).
2. **Suppliers / Purchases / Payments**: `payment_terms_days`; form PO dùng `quantity/unit_price`, `p_paid_now/p_paid_method`, preview `due_date`; list đọc `v_purchase_orders_summary`, `v_supplier_debt_summary`.
3. **Inventory**: list đọc `v_inventory_status`; trang sổ kho và kiểm kê đọc `inventory_transactions`; dialog điều chỉnh gọi `record_stock_adjustment` với 3 loại + giải thích nghĩa của số lượng theo loại.
4. **Menu**: `food_cost_pct`, `id`; recipe editor đọc `v_recipe_costs`, tính realtime bằng `recipeLineCost`; menu engineering map cột mới, scatter x=`popularity_share`, y=`avg_cm`, reference line `popularity_threshold` & `benchmark_cm`; empty-state khi không có đơn 30 ngày.
5. **Orders**: bỏ pending/card; thêm giảm giá; RPC trả uuid; hiển thị `INSUFFICIENT_STOCK` nguyên văn tên nguyên liệu.
6. **HR**: employees (`position`, `is_active`, `hourly_rate`…); timekeeping (bỏ status, dùng ca + giờ hoặc check-in/out, upsert); payroll (`name/period_start/period_end/total_net_pay`).
7. **Expenses**: `title/note/vendor/invoice_number`; categories bỏ `code`.
8. **Reports / Dashboard**: `get_pnl_report` `p_start/p_end` + `data[0]`; `get_pnl_monthly`; dashboard sửa bug low-stock, đúng keys stats; **tạm gỡ** bảng "tiêu hao nguyên liệu" khỏi `/reports/pnl` (sẽ thành trang riêng ở Phase 3 sau khi có view ở Phase 2).
9. Chạy `npm run check` + `npm run build` + `npm run dev` mở từng route của `e2e/smoke.spec.ts` bằng tay (hoặc chạy `npm run e2e` nếu Supabase local đang chạy).

**DoD**: `tsc` 0 lỗi, lint sạch, `next build` thành công, 18 route smoke mở được với dữ liệu seed không lỗi console.

### Phase 1.5 — Nâng cấp Next.js 16 (≈ 0.5 ngày) — *theo yêu cầu spec gốc*
Làm **ngay sau** Phase 1 (code còn nhỏ, typecheck đang xanh nên dễ soi lỗi do upgrade).
1. `npx @next/codemod@latest upgrade latest` (Next 16 + React 19.2 + `eslint-config-next` 16).
2. Đổi `src/middleware.ts` → `src/proxy.ts` (Next 16 đổi tên middleware thành proxy); giữ logic `updateSession`.
3. Kiểm tra: `next.config.ts` (Turbopack mặc định), async `params/cookies` (đã await sẵn), `revalidatePath` vẫn hoạt động, shadcn/radix render OK.
4. Cập nhật `docs/ARCHITECTURE.md` §1 (version) + README.
**Điều kiện dừng**: nếu quá 0.5 ngày chưa xanh → revert về 15.5, ghi lý do vào ARCHITECTURE.md, xin ý kiến trước khi thử lại. (Quyết định #1 ở §5.)

**DoD**: `npm run check` + `next build` xanh trên Next 16; smoke routes mở được.

### Phase 2 — Gia cố DB phần còn lại + báo cáo ngày (≈ 1.5–2 ngày)
Sửa tiếp trong `…_init.sql` (xem nguyên tắc §1.1). Mỗi thay đổi có test mới trong `supabase/tests/06_hardening.sql` và `07_daily_report.sql`.

**2A. Bảo mật & toàn vẹn — phần CÒN LẠI** (những gì đã xong xem §2.3)
| ID | Việc |
|---|---|
| T-01 | Trigger trên `supplier_payment_allocations` INSERT: Σ allocation ≤ `payment.amount`, PO cùng supplier, amount ≤ debt còn lại |
| BL-04 / T-06 | `create extension btree_gist`; `alter table payroll_periods add constraint no_overlap exclude using gist (daterange(period_start, period_end, '[]') with &&)` → lỗi `PAYROLL_PERIOD_OVERLAP` |
| SEC-09 / T-10 | Check ≥ 0 cho các cột tiền của `payroll_items`; `net_pay ≥ 0` (raise `PAYROLL_NEGATIVE_NET`) |
| BL-02 | `generate_payroll`: điều kiện đủ = `start_date <= period_end and coalesce(end_date,'infinity') >= period_start` (không phụ thuộc `is_active`) |
| DOC-01 / T-15 | Thêm `app_settings.ft_payroll_mode` = `'fixed'` (mặc định: FT nhận đủ lương tháng + phụ cấp) hoặc `'prorate'` (như hiện tại). (Quyết định #2) |
| BL-05 / T-11 | `trg_orders_before`: `discount <= subtotal`; cấm insert `order_items` vào đơn `cancelled` |
| DOC-07 / BL-11 | `record_stock_adjustment` thêm `p_txn_at timestamptz default now()` → ghi `created_at = p_txn_at` (cho phép ghi hao hụt lùi ngày, không quá hôm nay) |
| BL-01 | `trg_po_items_after_delete`: tính lại WAC ngược khi tồn sau xóa > 0: `(stock*avg − qty*cost)/(stock − qty)`, chặn âm |
| T-09 / BL-07 | Thay `current_date` bằng `to_local_date(now())` ở default ngày PO/payment/expense và các so sánh quá hạn trong `v_purchase_orders_summary`, `v_supplier_debt_summary`, `get_dashboard_stats` |
| SEC-15 / T-16 | `expense_categories.updated_at` + trigger; expense `paid` bắt buộc `payment_method`; `amount > 0`; PO không có dòng nào thì không tạo được bằng insert trực tiếp |
| DOC-10 | Nốt phần còn lại: policy **DELETE** theo role trên `expense_records`, `purchase_orders` (hiện mới chặn PO đã có thanh toán); UI ẩn nút xóa với `staff`; đọc role qua `current_user_role()` trong layout |
| SEC-16 | Seed: abort nếu `current_setting('app.seed_allowed', true) <> 'on'` (db-test.sh và `supabase start` set biến này); không bao giờ chạy seed lên cloud |

Giữ nguyên (ghi rõ vào DATABASE.md là *by design*): DOC-03, DOC-05/BL-06 (labor chỉ tính kỳ đã chốt; dashboard thêm dòng "ước tính lương kỳ nháp"), DOC-12 (P&L tính dồn tích kể cả pending; UI có toggle "chỉ đã thanh toán"), DOC-04 (thêm cờ `expense_categories.is_depreciation` → báo cáo hiện thêm dòng EBITDA = net + khấu hao), T-08/BL-12 (adjustment không vào COGS, báo cáo hiện riêng), BL-13/SEC-11, T-14, SEC-13 (thêm index `text_pattern_ops` cho `order_number`, `po_number`).

**2B. Báo cáo kiểm soát nguyên liệu hàng ngày (yêu cầu mới của spec)**
- View `v_daily_menu_sales`: theo `to_local_date(orders.order_date)` × `menu_item_id` (đơn completed): `qty_sold, revenue, cogs, contribution_margin`.
- View `v_daily_ingredient_usage`: theo ngày × nguyên liệu từ `inventory_transactions`: `qty_sold_usage` (−Σ sale + sale_reversal), `cost_sold_usage`, `qty_waste`, `cost_waste`, `qty_purchased`, `cost_purchased`, `qty_adjust`, `closing_stock` (stock_after của dòng cuối ngày), `opening_stock = closing − Σ quantity`.
- View `v_daily_recipe_theoretical`: Σ `qty_sold × recipes.quantity × (1 + waste%)` theo ngày × nguyên liệu với **định lượng hiện tại** → so với `qty_sold_usage` để phát hiện lệch định lượng.
- RPC `get_daily_control_report(p_date date) → jsonb`: `{ summary: {revenue, order_count, cogs_sales, cogs_waste, gross_profit, gross_margin_pct, opex_day, labor_day_estimate, net_profit_day}, items: [...v_daily_menu_sales], ingredients: [...usage + theoretical + is_below_min], waste: [...ledger waste rows] }`. `labor_day_estimate` = Σ giờ chấm công × `hourly_rate` (PT) + `base_salary/standard_days` cho FT có chấm công hôm đó.
- Index hỗ trợ: `inventory_transactions (created_at, ingredient_id)`, `orders (order_date) where status='completed'`.
- Test `07_daily_report.sql`: tạo 1 đơn 2 món → kiểm tra usage = Σ định lượng × (1+waste), cost = usage × avg_cost, summary.revenue = tổng đơn.

**2C. Sau migration**: `npm run db:test` + `db:test:real` → `npm run db:types` → `npm run db:doc` → cập nhật DATABASE.md (§4 trigger, §5 RPC thêm `get_daily_control_report`, §6 view, §8 mã lỗi mới: `PAYROLL_PERIOD_OVERLAP`, `PAYROLL_NEGATIVE_NET`) → `npx supabase db reset` local → typecheck app (kỳ vọng vài lỗi do type mới, sửa ngay).

**DoD**: tests 01–07 xanh trên cả `db:test` và `db:test:real`; findings high = 0, medium còn lại đều có dòng "by design" trong DATABASE.md; app typecheck xanh với types mới.

### Phase 3 — Hoàn thiện các trang còn thiếu (≈ 2–3 ngày)
Mỗi trang: Server Component đọc qua `src/lib/queries/<module>.ts`, client components trong `src/components/<module>/`, actions trong `src/server-actions/<module>.actions.ts`, `notFound()` khi thiếu record, `generateMetadata` tiêu đề tiếng Việt.

| Route | Nội dung | Nguồn dữ liệu | Actions |
|---|---|---|---|
| `/inventory/[id]` | Thẻ thông tin (tồn theo base + import unit, WAC, giá trị tồn, NCC mặc định, badge dưới min); tab "Sổ kho" (DataTable lọc theo nguyên liệu, theo loại/ngày); tab "Dùng trong món" | `v_inventory_status`, `inventory_transactions`, `v_recipe_costs` | sửa nguyên liệu, bật/tắt, dialog hao hụt/điều chỉnh/kiểm kê (có ngày) |
| `/suppliers/[id]` | Thông tin + điều khoản; KPI công nợ/quá hạn/hạn gần nhất; tab PO; tab Thanh toán (kèm phân bổ) | `v_supplier_debt_summary`, `v_purchase_orders_summary`, `supplier_payments` + `supplier_payment_allocations` | sửa NCC, "Thanh toán" mở dialog prefill (FIFO hoặc chọn PO) |
| `/purchases/[id]` | Header PO (số, ngày, hạn, trạng thái, tổng/đã trả/còn nợ); bảng dòng nhập (quy đổi base, đơn giá/base); lịch sử thanh toán | `v_purchase_orders_summary`, `purchase_order_items` + `ingredients`, allocations | trả đích danh PO; sửa `invoice_number/note/due_date`; sửa dòng = xóa + thêm dòng (theo §1.4 DATABASE.md); xóa PO (chỉ khi chưa có thanh toán, ConfirmDialog); nút in |
| `/orders/[id]` | Header; dòng món (giá, SL, thành tiền, COGS, CM, CM%); sổ kho đã trừ (reference_type = order_item) | `orders`, `order_items`, `inventory_transactions` | hủy đơn (ConfirmDialog, hoàn kho) |
| `/employees/[id]` | Hồ sơ; chấm công 30 ngày; lịch sử lương | `employees`, `timekeeping`, `payroll_items` + `payroll_periods` | sửa, nghỉ việc (`is_active=false` + `end_date`) |
| `/payroll/[id]` | Stepper Nháp → Đã chốt → Đã chi; bảng lương **chỉnh inline** thưởng/tips/tạm ứng/phạt/ghi chú khi draft; tổng; KPI | `payroll_periods`, `payroll_items` + `employees` | `generate_payroll`, `finalize_payroll`, mở lại (draft), `pay_payroll` (dialog phương thức + ngày), xuất CSV/in |
| `/reports/daily` **(mới)** | Chọn ngày; 5 stat card (doanh thu, số đơn, COGS, lãi gộp, lãi ròng ngày); bảng "Món đã bán" (SL, doanh thu, vốn, CM); bảng "Nguyên liệu tiêu hao" (xuất theo món, lý thuyết theo định lượng hiện tại, lệch, tiền vốn, tồn cuối ngày, badge dưới min); bảng hao hụt trong ngày; dòng ước tính nhân công + chi phí ngày | `get_daily_control_report` | — (link sang `/orders/[id]`, `/inventory/[id]`) |
| `/settings` **(mới)** | Tên nhà hàng, múi giờ, cho phép âm kho, ngưỡng food cost; hồ sơ cá nhân | `app_settings`, `profiles` | upsert settings (owner), cập nhật `full_name` |

Bổ sung nav (`nav-config.ts`): "Báo cáo" thành nhóm con: P&L, Kiểm soát ngày; thêm "Cài đặt" cuối sidebar. Dashboard: thêm card "Hôm nay" link sang `/reports/daily`, card "Ước tính lương kỳ nháp".

**DoD**: mọi route trong ARCHITECTURE §3 + 2 route mới tồn tại, không lỗi console; e2e smoke mở rộng danh sách route (kèm 1 id lấy từ seed).

### Phase 4 — Hoàn thiện UX theo spec §4 (≈ 1 ngày)
- Audit tất cả bảng lớn → dùng `DataTable` shared (sort, filter, search, phân trang); server-side phân trang cho `orders` và `inventory_transactions` (seed 1.000 đơn; dùng `.range()` + `count: "exact"`).
- Badge: đỏ Food Cost > 35 % / tồn < min / PO quá hạn; vàng 30–35 %; xanh đã thanh toán; xám "Chưa có định lượng".
- Trạng thái loading (skeleton), empty-state, error boundary từng module; toast success/error thống nhất qua `useAction`.
- Form: mọi ô số dùng `inputMode="decimal"`, lỗi zod hiện dưới ô; ConfirmDialog cho mọi hành động không đảo ngược (hủy đơn, xóa PO, chốt/chi lương, xóa thanh toán).
- Responsive: sidebar sheet trên mobile (đã có), bảng cuộn ngang trong container, POS `/orders/new` dùng được trên tablet.
- Dark/light: kiểm tra Recharts (màu từ CSS token), badge, bảng.
- In ấn: `print:` styles cho `/purchases/[id]`, `/payroll/[id]`, `/reports/daily`.

**DoD**: checklist §4 spec tick hết; kiểm tra bằng tay ở 3 khổ màn hình + 2 theme.

### Phase 5 — Kiểm thử & chất lượng (≈ 1–1.5 ngày)
- **SQL** (đã có 01–07): bổ sung case biên: WAC khi tồn = 0, xóa dòng PO đã trả một phần (`PO_TOTAL_BELOW_PAID`), FIFO nhiều PO, đơn với món không có định lượng (COGS 0 + cảnh báo), kỳ lương chồng ngày, nhân viên nghỉ giữa kỳ.
- **Unit (vitest)**: `format.ts`, `errors.ts`, helper tính toán §2.2, `isNavActive`.
- **E2E (Playwright)**, chạy trên Supabase local đã `db reset`: (1) đăng nhập; (2) tạo PO → tồn tăng + WAC đổi + công nợ NCC tăng; (3) trả nợ FIFO → PO chuyển partial/paid; (4) tạo đơn → tồn giảm → chi tiết đơn có COGS; (5) hủy đơn → tồn hoàn; (6) sửa định lượng → food cost badge đổi; (7) chấm công → tạo kỳ → tính → chốt → chi; (8) tạo chi phí → đánh dấu đã trả → P&L tháng đổi; (9) `/reports/daily` hiện đơn vừa tạo; (10) `staff` không thấy nút xóa.
- CI (GitHub Actions, nếu có remote): job `check` (typecheck+lint+vitest), job `db` (Postgres service image `supabase/postgres` + `scripts/db-test.sh`), job `e2e` (supabase CLI start + playwright) — có thể để sau khi có repo remote.

**DoD**: `npm run check`, `npm test`, `npm run e2e` xanh từ trạng thái `npx supabase db reset`.

### Phase 6 — Triển khai & bàn giao (≈ 0.5 ngày)
1. Supabase Cloud: tạo project → `npx supabase link --project-ref …` → `npx supabase db push` (chỉ migrations, **không seed**) → tạo user owner qua Dashboard → set `profiles.role = 'owner'`.
2. Vercel: import repo, env `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (không đưa `SERVICE_ROLE_KEY` lên client), `next build` phải xanh.
3. Supabase: bật PITR/backup, tắt signup public (chỉ owner tạo user), Auth email template tiếng Việt.
4. Nhập liệu ban đầu: file CSV mẫu + trang import đơn giản cho nguyên liệu / NCC / món / định lượng (hoặc hướng dẫn nhập qua Studio) — làm tối thiểu: script `scripts/import-csv.ts` dùng service role chạy local.
5. Cập nhật README (deploy, tài khoản, quy trình vận hành hằng ngày: nhập hàng → bán → cuối ngày xem `/reports/daily` → kiểm kê cuối tuần → cuối tháng chốt lương + P&L).

**DoD**: URL production đăng nhập được, luồng nhập hàng → bán → báo cáo ngày chạy trên cloud.

### Backlog v1.1+ (không làm trong v1)
- Hủy (void) thanh toán/PO thay vì xóa cứng, có bút toán đảo + audit log (SEC-08, SEC-12).
- Đính kèm hóa đơn chi phí lên Supabase Storage (bucket `expense-attachments`, cột `attachment_url` đã có).
- Phân quyền chi tiết theo module cho `staff`; nhiều chi nhánh; tích hợp POS/thanh toán QR; đơn hàng `pending` (bàn đang mở) nếu vận hành cần.
- Cảnh báo tự động (email/Zalo) tồn kho dưới min, PO đến hạn.

---

## 4. Lịch & ước lượng

| Phase | Nội dung | Ước lượng |
|---|---|---|
| 0 | Git, cổng chất lượng, fix RLS test, CLAUDE.md | ✅ xong |
| 1 | Về 0 lỗi typecheck, build xanh | 1–1.5 ngày |
| 1.5 | Next.js 16 | 0.5 ngày (có điều kiện dừng) |
| 2 | Migration gia cố + báo cáo ngày + docs | 1.5–2 ngày |
| 3 | 8 trang còn thiếu | 2–3 ngày |
| 4 | UX theo spec | 1 ngày |
| 5 | Test SQL/unit/e2e | 1–1.5 ngày |
| 6 | Deploy, import dữ liệu, bàn giao | 0.5 ngày |
| **Tổng còn lại** | | **≈ 8–10 ngày công** (1 dev + Claude Code) |

Mốc kiểm tra với chủ dự án: sau Phase 1 (app chạy được với seed), sau Phase 3 (đủ màn hình), sau Phase 5 (sẵn sàng deploy).

---

## 5. Quyết định cần chốt trước khi vào phase liên quan

| # | Câu hỏi | Ảnh hưởng | Đề xuất |
|---|---|---|---|
| 1 | Nâng lên Next.js 16 (spec gốc) hay ở lại 15.5 (ARCHITECTURE hiện tại)? | Phase 1.5 | **Nâng**, ngay sau Phase 1, có điều kiện dừng 0.5 ngày |
| 2 | Lương full-time: cố định theo tháng, hay chia theo ngày công chấm được? | Phase 2 (`ft_payroll_mode`) | **Cố định** mặc định; trừ theo ngày vắng khi có chấm công vắng (v1.1); giữ `prorate` làm tùy chọn |
| 3 | Chi phí nhân công trong P&L tháng đang chạy: chỉ kỳ đã chốt, hay tính cả kỳ nháp? | Phase 2 | Giữ **chỉ kỳ đã chốt** trong P&L; dashboard hiển thị thêm "ước tính kỳ nháp" |
| 4 | Lợi nhuận ròng vs EBITDA (khấu hao)? | Phase 2 | Hiện **cả hai**: Net profit + dòng EBITDA nhờ cờ `is_depreciation` trên danh mục chi phí |
| 5 | P&L tính chi phí `pending` (dồn tích) hay chỉ `paid` (tiền mặt)? | Phase 2/3 | **Dồn tích** mặc định (đúng kế toán), UI có toggle "chỉ đã thanh toán" |
| 6 | Ai được xóa thanh toán / PO / kỳ lương? | Phase 2 (policy theo role) | Chỉ **owner/manager**; staff chỉ tạo và xem |
| 7 | Có cần trạng thái đơn `pending` (bàn đang mở, chưa thanh toán) không? | Phase 3 `/orders/new` | **Chưa** trong v1 (spec chỉ cần trừ kho khi bán); ghi backlog |

Nếu không có phản hồi, thực hiện theo cột "Đề xuất".

---

## 6. Definition of Done chung (áp dụng cho từng PR/commit)
- [ ] `npm run check` xanh (typecheck + lint + db:test); từ Phase 5 thêm `npm test`.
- [ ] Không ghi trực tiếp vào cột MAINTAINED (§1.3 DATABASE.md); nghiệp vụ nhiều bước qua RPC.
- [ ] Lỗi DB được map sang tiếng Việt qua `src/lib/errors.ts`; không hiện `error.message` thô.
- [ ] `revalidatePath` đúng danh sách route trong DATABASE.md §7.
- [ ] Trang mới có: loading, empty-state, xử lý `notFound`, tiêu đề tiếng Việt, responsive, dark mode.
- [ ] Thay đổi DB đi kèm: migration mới + test SQL + `db:types` + `db:doc` + cập nhật DATABASE.md.
- [ ] Commit message theo module: `feat(purchases): …`, `fix(db): …`, `docs: …`.
