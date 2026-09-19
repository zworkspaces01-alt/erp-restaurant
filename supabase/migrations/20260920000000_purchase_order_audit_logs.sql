-- Migration: Bảng nhật ký kiểm toán sửa xóa phiếu nhập kho & phục vụ khôi phục (restore)
-- Cho phép lưu lịch sử sửa đổi, thêm/xóa dòng hàng, lưu snapshot khi xóa và khôi phục phiếu đã xóa

create table if not exists public.purchase_order_audit_logs (
  id uuid primary key default gen_random_uuid(),
  purchase_order_id uuid,                                  -- có thể null sau khi phiếu bị xóa
  po_number text not null,
  supplier_id uuid,
  supplier_name text,
  action text not null check (action in ('created', 'updated', 'line_added', 'line_deleted', 'deleted', 'restored')),
  performed_by uuid references auth.users (id) on delete set null,
  performed_by_name text,
  details jsonb default '{}'::jsonb,                       -- tóm tắt các trường thay đổi (from, to, diff)
  snapshot jsonb,                                          -- toàn bộ thông tin PO và các items tại thời điểm xóa
  is_restored boolean not null default false,              -- true nếu phiếu đã xóa này đã được khôi phục
  created_at timestamptz not null default now()
);

create index if not exists idx_po_audit_po_id on public.purchase_order_audit_logs (purchase_order_id);
create index if not exists idx_po_audit_po_number on public.purchase_order_audit_logs (po_number);
create index if not exists idx_po_audit_action on public.purchase_order_audit_logs (action);
create index if not exists idx_po_audit_created_at on public.purchase_order_audit_logs (created_at desc);

-- RLS
alter table public.purchase_order_audit_logs enable row level security;

create policy "Authenticated users can view audit logs"
  on public.purchase_order_audit_logs
  for select
  to authenticated
  using (true);

create policy "Authenticated users can insert audit logs"
  on public.purchase_order_audit_logs
  for insert
  to authenticated
  with check (true);

create policy "Authenticated users can update audit logs"
  on public.purchase_order_audit_logs
  for update
  to authenticated
  using (true);
