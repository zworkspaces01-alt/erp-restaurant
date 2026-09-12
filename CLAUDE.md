# CLAUDE.md — luật làm việc trong repo này

ERP nhà hàng (Next.js + Supabase). Tiếng Việt cho mọi text UI, commit message và tài liệu.

## Đọc trước khi code
| Tài liệu | Nội dung |
|---|---|
| `docs/PLAN.md` | **Lộ trình đang chạy** — phase, việc còn lại, quyết định đã chốt. Cập nhật khi xong một phase. |
| `docs/ARCHITECTURE.md` | Stack, cấu trúc thư mục, route map, quy ước code |
| `docs/DATABASE.md` | Hợp đồng DB: bảng, trigger, RPC, view, mã lỗi, app_settings |
| `docs/DATABASE.generated.md` | Tham chiếu cột/index/policy sinh tự động — **không sửa tay** |
| `docs/restaurant_erp_prompt.md` | Spec nghiệp vụ gốc |
| `docs/db-fix-log.md` | Nhật ký xử lý finding DB (append-only) |

## Lệnh
```bash
npm run dev            # dev server (Turbopack)
npm run check          # CỔNG CHẤT LƯỢNG: typecheck + lint + db:test
npm run db:test        # migration + seed + supabase/tests/*.sql trên DB throwaway (shim auth)
npm run db:test:real   # như trên nhưng trên DB postgres của image Supabase — gate cuối
npm run db:types       # sinh src/types/database.ts từ erp-pg (chạy db:test:real trước)
npm run db:doc         # sinh docs/DATABASE.generated.md
npm run e2e            # Playwright (cần Supabase local chạy)
```
Postgres cho test: container `erp-pg` cổng **54329**. Supabase local: API **54421**, DB **54422**, Studio **54423**.
(Project khác trên máy đang giữ dải 5432x — không dùng dải đó.)

## Luật bất di bất dịch
1. **DB là nguồn sự thật.** App sai schema thì sửa app, không sửa DB. Chỉ đổi DB khi DB thật sự thiếu chức năng.
2. **Trước go-live**: vẫn sửa trực tiếp `supabase/migrations/20260911000000_init.sql` (dự án chưa phát hành, `db:test` dựng lại DB từ đầu mỗi lần).
   **Sau go-live**: chỉ thêm migration mới `2026MMDDhhmmss_<ten>.sql`, không đụng file cũ.
3. Đổi DB → bắt buộc đủ 4 bước: viết test trong `supabase/tests/` → `npm run db:test && npm run db:test:real` xanh → `npm run db:types` + `npm run db:doc` → cập nhật `docs/DATABASE.md`.
4. **Không bao giờ ghi tay vào cột MAINTAINED** (`ingredients.current_stock/avg_cost_price`, `suppliers.current_debt`, `purchase_orders.total_amount/paid_amount/payment_status`, `orders.subtotal/total_amount/total_cogs`, `payroll_periods.total_net_pay/status`…). DB đã revoke quyền UPDATE các cột này của role `authenticated`. Nghiệp vụ nhiều bước đi qua RPC (`docs/DATABASE.md` §5).
5. **TypeScript strict, không `any`, không `@ts-ignore`.** `npm run check` phải xanh trước khi coi việc là xong.
6. Server Action: `"use server"` → validate zod (`@/types/restaurant`) → gọi Supabase → map lỗi qua `src/lib/errors.ts` → `revalidatePath` (danh sách route ở `docs/DATABASE.md` §7) → trả `ok()/fail()`. Không throw ra ngoài.
7. Page là Server Component, đọc dữ liệu qua `src/lib/queries/<module>.ts`. Client component chỉ nhận props đã serialize.
8. Lỗi DB dạng `CODE: detail` → luôn hiển thị tiếng Việt theo bảng `docs/DATABASE.md` §8, không hiện `error.message` thô.
9. Tiền `formatVND`, số `formatNumber`, ngày `formatDate` (`src/lib/format.ts`). Badge: đỏ food cost > 35% / tồn < min / PO quá hạn, vàng 30–35%, xanh đã thanh toán.
10. Không đổi version thư viện ngoài phase nâng cấp đã ghi trong `docs/PLAN.md`.

## Commit
Theo module, tiếng Việt: `feat(purchases): …`, `fix(db): …`, `docs: …`, `chore: …`.
Không commit `.env.local`. `.env.example` là file mẫu duy nhất được commit.
