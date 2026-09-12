# Restaurant ERP — Hệ thống quản trị nhà hàng toàn diện

ERP F&B khép kín: **Nhập hàng NCC → Kho & hao hụt → Định lượng món (BOM) & Food Cost realtime → Trừ kho khi bán → Công nợ gối đầu → Nhân sự & bảng lương → Chi phí vận hành → Báo cáo P&L**.

Spec nghiệp vụ gốc: [docs/restaurant_erp_prompt.md](docs/restaurant_erp_prompt.md) · Kiến trúc: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) · Schema DB: [docs/DATABASE.md](docs/DATABASE.md)

## Stack
Next.js 15 (App Router, Server Actions, React 19) · TypeScript strict · Supabase (PostgreSQL + RLS + Triggers + RPC) · Tailwind v4 + shadcn/ui · TanStack Table v8 · Recharts · React Hook Form + Zod.

## Chạy nhanh với Supabase Cloud
1. Tạo project tại https://supabase.com, mở **SQL Editor** và chạy lần lượt:
   - `supabase/migrations/20260911000000_init.sql` (bảng, trigger, view, RPC, RLS)
   - `supabase/seed.sql` (dữ liệu mẫu + tài khoản demo)
2. Sao chép `.env.example` → `.env.local`, điền `NEXT_PUBLIC_SUPABASE_URL` và `NEXT_PUBLIC_SUPABASE_ANON_KEY` (Project Settings → API).
3. Cài và chạy:
   ```bash
   npm install
   npm run dev
   ```
4. Mở http://localhost:3000 và đăng nhập bằng tài khoản demo **admin@restaurant.local / Admin@123**.

## Chạy hoàn toàn local (Supabase CLI + Docker)
Cần Docker Desktop. Cấu hình trong `supabase/config.toml` dùng dải cổng **544xx** để không đụng project Supabase local khác.
```bash
npx supabase start          # kéo image, tạo DB, tự chạy migrations + seed.sql
npx supabase status         # lấy API URL (http://127.0.0.1:54421) và anon key
```
Điền vào `.env.local`:
```
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54421
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key từ supabase status>
```
Rồi `npm run dev`. Studio: http://127.0.0.1:54423. Reset dữ liệu: `npx supabase db reset`.

## Scripts
| Lệnh | Ý nghĩa |
|---|---|
| `npm run dev` | Chạy dev server (Turbopack) |
| `npm run build` / `npm start` | Build & chạy production |
| `npm run typecheck` | `tsc --noEmit` (strict, không `any`) |
| `npm run lint` | ESLint |
| `npm run db:test` | Chạy migration + seed + SQL tests trên Postgres Docker (`erp-pg`, cổng 54329) |
| `npm run db:test:real` | Như trên nhưng trên DB `postgres` của image Supabase (schema `auth` thật) |
| `npm run db:types` | Sinh `src/types/database.ts` từ DB Docker |
| `npm run db:types:remote` | Sinh types từ project cloud (`SUPABASE_PROJECT_ID`) |

Khởi động Postgres Docker cho `db:test` (một lần):
```bash
docker run -d --name erp-pg -p 54329:5432 -e POSTGRES_PASSWORD=postgres public.ecr.aws/supabase/postgres:17.6.1.158
```

## Cấu trúc
```
src/app/(dashboard)/<module>/     Trang theo module (inventory, menu, suppliers, purchases, payments, orders, employees, timekeeping, payroll, expenses, reports)
src/server-actions/<module>.actions.ts   Server Actions (mutations + revalidatePath)
src/lib/queries/<module>.ts       Truy vấn đọc dữ liệu (server)
src/components/<module>/          UI theo module · src/components/shared: DataTable, PageHeader, StatCard, StatusBadge...
src/types/restaurant.ts           Domain types, enum labels, zod schemas, helper tính toán
src/types/database.ts             Types sinh từ Supabase
supabase/migrations · seed.sql · tests/   SQL
```

## Nghiệp vụ cốt lõi (tự động hóa bằng trigger/RPC trong Postgres)
- **Nhập kho** (`create_purchase_order`): quy đổi đơn vị nhập → đơn vị cơ sở, cộng kho, tính lại **giá vốn bình quân gia quyền**, ghi sổ kho, tăng công nợ NCC, hạn thanh toán theo điều khoản gối đầu.
- **Trả nợ NCC** (`record_supplier_payment`): đích danh PO hoặc trừ dần FIFO theo hạn nợ; tự cấn trừ `current_debt`.
- **Bán hàng** (`create_order`): trừ kho theo định lượng × (1 + hao hụt %), chốt COGS thực tế tại thời điểm bán; hủy đơn hoàn kho.
- **Food cost realtime**: view `v_menu_item_costs` (ideal cost, CM, Food Cost %), `v_menu_engineering` (STAR / PLOWHORSE / PUZZLE / DOG, 30 ngày).
- **Lương**: `generate_payroll` (FT theo ngày công, PT theo giờ), `finalize_payroll`, `pay_payroll`.
- **P&L**: `get_pnl_report(start, end)`, `get_pnl_monthly(year)`, `get_dashboard_stats()`.
