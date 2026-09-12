# DB fix log (append-only; one line per finding: id | fixed/rejected/deferred | what/why)

NOTE 2026-09-12: a previous SEC fixer run was interrupted after inserting a "hardening" section (helper functions + delete guards) before the GRANTS section of the migration; its GRANTS rewrite (revokes for anon / column-level privileges) was NOT applied. Check for existing objects (grep -n current_user_role / is_manager / hardening) before adding, and do not duplicate them.

## 2026-09-12 — group SEC (verified by full test run: 327 PASS, 0 FAIL)
Applied in migration sections `17a. SECURITY HARDENING` and `18. GRANTS`:
- SEC-01 | fixed | Maintained columns (ingredients.current_stock/avg_cost_price, suppliers.current_debt, purchase_orders.total_amount/paid_amount/payment_status/po_number, orders.subtotal/total_amount/total_cogs/order_number/status, order_items.cogs_amount, payroll_periods.status/finalized_at/paid_at/total_net_pay/payment_method) revoked from `authenticated` with column-level INSERT/UPDATE grants on everything else; trigger fns + mutating RPCs are SECURITY DEFINER (40 of 48 public functions). Verified: authenticated UPDATE on those columns raises insufficient_privilege while normal columns stay writable.
- SEC-02, SEC-07, SEC-08 | fixed | BEFORE DELETE guards: payroll_periods (draft only -> PAYROLL_PERIOD_LOCKED), supplier_payments (manager/owner), purchase_orders with paid_amount>0 (manager/owner), employees with timekeeping (manager/owner). Helpers `current_user_role()` / `is_manager()`. New RPC `reopen_payroll(uuid)` (finalized -> draft; paid stays paid).
- SEC-03 | fixed | TRUNCATE/TRIGGER/REFERENCES revoked from anon + authenticated.
- SEC-04, SEC-05 | fixed | anon and PUBLIC hold nothing in schema public (tables, sequences, functions + default privileges). RPC EXECUTE granted to authenticated + service_role only; trg_* and handle_new_user get no EXECUTE.
- SEC-06 | fixed | profiles.role not updatable by the owner of the row (column-level revoke).
- SEC-10 | fixed | app_settings validation trigger (timezone must exist in pg_timezone_names, allow_negative_stock boolean, food_cost_target_pct 0..100) -> INVALID_SETTING.
- SEC-12 | fixed | created_by stamped from auth.uid() (client value ignored).
- Tests: supabase/tests/05_rls.sql updated — anon is now denied at the privilege level (no longer "0 rows"), fixture captures the menu item id before switching role, ingredient count assertion made robust.
- SEC-09, SEC-11, SEC-13, SEC-14, SEC-15, SEC-16 | open | handed to the follow-up run.

2026-09-12 (phiên kế hoạch):
- Xác nhận đợt hardening ĐÃ hoàn tất trong migration: mục 17a (helper role, guard xóa payroll/payment/PO/employee, validate app_settings, stamp created_by, chuyển trigger+RPC sang SECURITY DEFINER) và mục 18 GRANTS (revoke anon/public, bỏ TRUNCATE/TRIGGER/REFERENCES, column-level privileges cho cột MAINTAINED). Ghi chú "GRANTS chưa áp" ở đầu file này đã lỗi thời.
- TEST-01 | fixed | `supabase/tests/05_rls.sql` đỏ ở `auth_uid_from_claims` trên `db:test:real`: image supabase/postgres trần ship auth.uid() kiểu cũ chỉ đọc `request.jwt.claim.sub`, còn test set `request.jwt.claims`. Test nay set CẢ HAI dạng claim → `db:test` và `db:test:real` đều xanh.
- Sinh lại src/types/database.ts và docs/DATABASE.generated.md theo migration hiện tại (thêm reopen_payroll, current_user_role, is_manager).
- Findings còn lại (T-01 phân bổ thanh toán, BL-04/T-06 kỳ lương chồng ngày, SEC-09/T-10 check tiền lương, BL-01 WAC khi xóa dòng PO, BL-02 nhân viên nghỉ giữa kỳ, T-09/BL-07 múi giờ, DOC-07 hao hụt lùi ngày, SEC-13 index, SEC-15/T-16, SEC-16 seed guard, DOC-04 khấu hao) → xếp vào Phase 2 của docs/PLAN.md.
