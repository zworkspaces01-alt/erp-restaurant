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
