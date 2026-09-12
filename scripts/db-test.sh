#!/usr/bin/env bash
# Apply migrations + seed + SQL tests against the local Docker Postgres.
#
#   scripts/db-test.sh                # throwaway DB "erp_test" with a Supabase auth shim
#   scripts/db-test.sh my_db          # any other throwaway DB name (parallel-safe)
#   scripts/db-test.sh postgres       # the image's real "postgres" DB (real auth schema) — final gate
#
# Env: PG_CONTAINER (default erp-pg), SKIP_SEED=1, SKIP_TESTS=1
set -euo pipefail

DB_NAME="${1:-erp_test}"
CONTAINER="${PG_CONTAINER:-erp-pg}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

psql_db() { # psql_db <db> [args...]  (stdin is forwarded)
  local db="$1"; shift
  docker exec -i -e PGPASSWORD=postgres "$CONTAINER" \
    psql -U postgres -h 127.0.0.1 -d "$db" -v ON_ERROR_STOP=1 -q -X "$@"
}

if ! docker exec "$CONTAINER" pg_isready -U postgres -h 127.0.0.1 >/dev/null 2>&1; then
  echo "Postgres container '$CONTAINER' is not ready. Start it with:" >&2
  echo "  docker run -d --name erp-pg -p 54329:5432 -e POSTGRES_PASSWORD=postgres public.ecr.aws/supabase/postgres:17.6.1.158" >&2
  exit 1
fi

echo "==> Resetting database: $DB_NAME"
if [ "$DB_NAME" = "postgres" ]; then
  psql_db postgres <<'SQL'
    drop schema if exists public cascade;
    create schema public;
    grant usage, create on schema public to postgres;
    grant usage on schema public to anon, authenticated, service_role;
    alter default privileges in schema public grant all on tables to postgres, anon, authenticated, service_role;
    alter default privileges in schema public grant all on functions to postgres, anon, authenticated, service_role;
    alter default privileges in schema public grant all on sequences to postgres, anon, authenticated, service_role;
    -- the bare supabase/postgres image ships the pre-GoTrue auth schema (no auth.identities)
    do $$ begin
      if to_regclass('auth.identities') is not null then delete from auth.identities; end if;
      delete from auth.users;
    end $$;
SQL
else
  psql_db postgres -c "drop database if exists \"$DB_NAME\" with (force);" -c "create database \"$DB_NAME\";"
  psql_db "$DB_NAME" < "$ROOT/scripts/db-shim.sql"
fi

for f in "$ROOT"/supabase/migrations/*.sql; do
  [ -e "$f" ] || { echo "No migrations found" >&2; exit 1; }
  echo "==> Migration: $(basename "$f")"
  psql_db "$DB_NAME" < "$f"
done

if [ "${SKIP_SEED:-0}" != "1" ] && [ -e "$ROOT/supabase/seed.sql" ]; then
  echo "==> Seed: supabase/seed.sql"
  psql_db "$DB_NAME" < "$ROOT/supabase/seed.sql"
fi

if [ "${SKIP_TESTS:-0}" != "1" ]; then
  for f in "$ROOT"/supabase/tests/*.sql; do
    [ -e "$f" ] || continue
    echo "==> Test: $(basename "$f")"
    psql_db "$DB_NAME" < "$f"
  done
fi

echo "==> OK ($DB_NAME)"
