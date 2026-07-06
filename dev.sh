#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

export DATABASE_URL="postgresql://ksc:ksc_dev_pw@localhost:5432/ksc_mgmt"

# ─── Ensure postgres container is running ────────────────────────────────────
if ! docker compose ps postgres | grep -q "healthy\|running"; then
  echo "▶ Starting postgres..."
  docker compose up -d postgres
  echo -n "  Waiting for postgres to be ready"
  until docker compose exec -T postgres pg_isready -U ksc -d ksc_mgmt &>/dev/null; do
    echo -n "."
    sleep 1
  done
  echo " ready."
fi

# ─── Push schema + seed (only if DB is empty) ─────────────────────────────────
ROW_COUNT=$(docker compose exec -T postgres psql -U ksc -d ksc_mgmt -tAc \
  "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public';" 2>/dev/null || echo 0)

if [ "$ROW_COUNT" -lt "5" ]; then
  echo "▶ DB is empty — pushing schema..."
  pnpm --filter @ksc/db exec prisma db push --skip-generate
  echo "▶ Seeding catalogs..."
  pnpm --filter @ksc/db exec tsx src/seed.ts
fi

# ─── Start API + Web in parallel ─────────────────────────────────────────────
echo ""
echo "▶ Starting dev servers..."
echo "  API  → http://localhost:3001"
echo "  Web  → http://localhost:5173"
echo ""

# Use concurrently if available, otherwise two background processes
if command -v concurrently &>/dev/null; then
  concurrently \
    --names "api,web" \
    --prefix-colors "blue,green" \
    "pnpm --filter @ksc/api dev" \
    "pnpm --filter @ksc/web dev"
else
  trap 'kill $(jobs -p) 2>/dev/null; exit 0' INT TERM

  pnpm --filter @ksc/api dev &
  API_PID=$!

  pnpm --filter @ksc/web dev &
  WEB_PID=$!

  wait $API_PID $WEB_PID
fi
