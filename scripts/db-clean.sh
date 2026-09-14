#!/usr/bin/env bash
# Clear all mock business data from the target database.
# Preserves: Admin account, restaurant settings, and standard expense categories.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CONTAINER="${PG_CONTAINER:-supabase_db_Restaurant_ERP}"

echo "==> Đang xóa toàn bộ mock data, giữ lại Admin và Cấu hình..."

if [ -n "${DATABASE_URL:-}" ]; then
  echo "==> Đang chạy qua DATABASE_URL..."
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -X < "$ROOT/supabase/clean.sql"
elif docker ps --format '{{.Names}}' | grep -q "^${CONTAINER}$"; then
  echo "==> Đang chạy qua Docker container: $CONTAINER..."
  docker exec -i "$CONTAINER" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q -X < "$ROOT/supabase/clean.sql"
elif docker ps --format '{{.Names}}' | grep -q "^erp-pg$"; then
  echo "==> Đang chạy qua Docker container: erp-pg..."
  docker exec -i erp-pg psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q -X < "$ROOT/supabase/clean.sql"
else
  echo "Không tìm thấy database đang chạy (Docker hoặc DATABASE_URL). Vui lòng khởi động Supabase hoặc truyền DATABASE_URL." >&2
  exit 1
fi

echo "==> ĐÃ XÓA SẠCH MOCK DATA THÀNH CÔNG!"
echo "Database sẵn sàng để nhập dữ liệu thật."
