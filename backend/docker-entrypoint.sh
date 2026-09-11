#!/bin/sh
set -e

# ── Auto-migrate ──────────────────────────────────────
# Run pending database migrations before starting the API.
# Migration SQL files are bind-mounted from supabase/migrations/
# into /app/migrations/ by docker-compose.yml.
# ──────────────────────────────────────────────────────

if [ -d "${MIGRATIONS_DIR:-/app/migrations}" ]; then
  echo "Running database migrations..."
  node dist/scripts/migrate.js
else
  echo "No migrations directory found at ${MIGRATIONS_DIR:-/app/migrations} — skipping auto-migrate"
fi

# ── Start API server ─────────────────────────────────
echo "Starting Idswyft API..."
exec node dist/server.js
