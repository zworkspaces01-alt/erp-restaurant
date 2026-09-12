# Restaurant ERP — Architecture Contract

Mọi agent/dev làm việc trong repo này PHẢI tuân theo tài liệu này. Spec nghiệp vụ gốc: `docs/restaurant_erp_prompt.md`. Tham chiếu schema DB: `docs/DATABASE.md` (do tầng DB sinh ra).

## 1. Stack đã cài (không đổi version)
- Next.js **15.5** (App Router, Server Components, Server Actions, Turbopack), React **19.1**, TypeScript strict, **không dùng `any`**.
- Tailwind **v4** (CSS-first config trong `src/app/globals.css`, không có tailwind.config). Dark mode bằng class `.dark` (next-themes).
- shadcn/ui style `radix-nova`: components trong `src/components/ui/*` import từ package `radix-ui` (không phải `@radix-ui/react-*`). `cn` từ `@/lib/utils`.
  - Có sẵn: alert, avatar, badge, button, calendar, card, checkbox, command, dialog, dropdown-menu, field, input, input-group, label, popover, progress, scroll-area, select, separator, sheet, skeleton, sonner, switch, table, tabs, textarea, tooltip.
  - **KHÔNG có `@/components/ui/form`**. Form dùng `react-hook-form` (`useForm`, `Controller`/`register`) + `zodResolver` từ `@hookform/resolvers/zod` + `Label`/`Input`/`Select`... Hiển thị lỗi bằng `<p className="text-sm text-destructive">`.
  - Thêm component mới: `npx shadcn@latest add -y <name>` (chỉ khi thật cần; ưu tiên dùng những gì có sẵn).
- `@tanstack/react-table` **v8**, `recharts` **3.x**, `zod` **3.x**, `react-hook-form` 7, `lucide-react`, `date-fns` 4 (locale `vi`), `sonner` (toast), `next-themes`.
- Supabase: `@supabase/ssr` + `@supabase/supabase-js`. Clients:
  - Server Components / Server Actions: `const supabase = await createClient()` từ `@/lib/supabase/server`.
  - Client Components: `createClient()` từ `@/lib/supabase/client` (hạn chế; ưu tiên Server Components + Server Actions).
  - Admin/service-role (seed script, không dùng trong request path): `@/lib/supabase/admin`.
  - Types: `Database` từ `@/types/database` (sinh bởi `npm run db:types`), domain types + zod schemas từ `@/types/restaurant`.
- Auth: Supabase email/password. `src/middleware.ts` chặn mọi route trừ `/login`, `/auth/*`. Seed tạo user demo `admin@restaurant.local` / `Admin@123`.

## 2. Cấu trúc thư mục
```
src/app/layout.tsx                      Root: ThemeProvider + Toaster, lang="vi"
src/app/login/page.tsx                  Đăng nhập
src/app/(dashboard)/layout.tsx          Sidebar + Header (responsive, dark/light)
src/app/(dashboard)/<module>/...        Pages (Server Components; async params: `const { id } = await params`)
src/server-actions/<module>.actions.ts  "use server"; mọi mutation + revalidatePath; trả ActionResult<T> (từ @/types/actions)
src/lib/queries/<module>.ts             Hàm đọc dữ liệu dùng chung cho pages (server-only)
src/components/<module>/*               Components riêng của module (client nếu cần "use client")
src/components/shared/*                 DataTable, PageHeader, StatCard, StatusBadge, ConfirmDialog, EmptyState, FormError...
src/components/layout/*                 Sidebar, Header, ThemeToggle, nav config
src/lib/format.ts                       formatVND, formatVNDCompact, formatNumber, formatPercent, formatDate, formatDateTime, formatMonth, todayISO, FOOD_COST_WARN(30)/FOOD_COST_DANGER(35)
src/types/actions.ts                    ActionResult<T>, ok(), fail()
supabase/migrations/*.sql               Migration (chạy trên Supabase SQL editor hoặc supabase db push)
supabase/seed.sql                       Dữ liệu mẫu
supabase/tests/*.sql                    SQL smoke tests (DO $$ ... RAISE EXCEPTION ... $$)
scripts/db-test.sh                      Chạy migration+seed+tests trên Docker Postgres (xem header file)
```

## 3. Route map (labels tiếng Việt)
| Route | Nội dung | Module owner |
|---|---|---|
| `/dashboard` | Tổng quan: KPI hôm nay/tháng, mini P&L, cảnh báo tồn kho, công nợ đến hạn, top món | reports |
| `/inventory` | Danh sách nguyên liệu: tồn, đơn vị, giá vốn BQ, badge cảnh báo dưới min | inventory |
| `/inventory/[id]` | Chi tiết nguyên liệu + lịch sử giao dịch kho | inventory |
| `/inventory/transactions` | Sổ kho toàn bộ (lọc theo loại/ngày/nguyên liệu) | inventory |
| `/inventory/adjustments` | Kiểm kê (stocktake) & ghi nhận hao hụt/hủy | inventory |
| `/menu` | Món ăn: giá bán, ideal cost, CM, Food Cost % + badge | menu |
| `/menu/[id]` | Editor định lượng (BOM) tính Food Cost realtime | menu |
| `/menu/engineering` | Ma trận Menu Engineering 30 ngày (scatter + bảng) | menu |
| `/suppliers` | NCC + công nợ hiện tại, điều khoản | purchasing |
| `/suppliers/[id]` | Chi tiết NCC: PO, thanh toán, lịch sử | purchasing |
| `/purchases` | Danh sách phiếu nhập (trạng thái thanh toán, hạn nợ) | purchasing |
| `/purchases/new` | Form tạo phiếu nhập + bảng items tự tính | purchasing |
| `/purchases/[id]` | Chi tiết phiếu nhập | purchasing |
| `/payments` | Sổ quỹ trả nợ NCC + form thanh toán (đích danh PO / trừ dần) | purchasing |
| `/orders` | Đơn bán hàng | sales |
| `/orders/new` | Tạo đơn bán (POS đơn giản) → trừ kho tự động | sales |
| `/orders/[id]` | Chi tiết đơn + COGS thực tế | sales |
| `/employees` | Nhân viên (FT/PT) | hr |
| `/employees/[id]` | Hồ sơ + chấm công + lịch sử lương | hr |
| `/timekeeping` | Chấm công theo ngày/ca | hr |
| `/payroll` | Kỳ lương | hr |
| `/payroll/[id]` | Bảng lương chi tiết: tính, chỉnh thưởng/phạt/tạm ứng, chốt, chi trả | hr |
| `/expenses` | Chi phí vận hành (hóa đơn, trạng thái, hình thức) | expenses |
| `/expenses/categories` | Danh mục chi phí | expenses |
| `/reports/pnl` | Báo cáo P&L theo tháng/quý + biểu đồ Recharts | reports |

## 4. Quy ước code
- Server Action: `"use server"` đầu file; validate input bằng zod schema từ `@/types/restaurant`; gọi Supabase (RPC cho nghiệp vụ nhiều bước); `revalidatePath` các route liên quan; trả `ok(data)` / `fail(message, fieldErrors)`. Không throw ra ngoài.
- Page: Server Component async, đọc dữ liệu qua `src/lib/queries/<module>.ts`, truyền xuống client components. Dùng `notFound()` khi thiếu record.
- Client component nhận props đã serialize (không truyền Date object; dùng ISO string).
- Bảng lớn: `DataTable` shared (TanStack v8) có sort, filter, search, phân trang.
- Badge: đỏ khi Food Cost > 35% hoặc tồn kho < min; vàng 30–35%; xanh khi đã thanh toán / đạt chuẩn.
- Tiền tệ: luôn `formatVND`. Số: `formatNumber`. Ngày: `formatDate`.
- UI text tiếng Việt có dấu. Không hardcode màu ngoài token Tailwind/shadcn (dùng `text-destructive`, `bg-emerald-500/15 text-emerald-700 dark:text-emerald-400`, v.v.).
- Không dùng `any`, không `@ts-ignore`. `npm run typecheck` và `npm run lint` phải sạch.
