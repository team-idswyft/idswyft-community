#!/bin/sh
set -e

# ── Auto-migrate ──────────────────────────────────────
# Run pending database migrations before starting the API.
# Migration SQL files are bind-mounted from supabase/migrations/
# into /app/migrations/ by docker-compose.yml.
# ──────────────────────────────────────────────────────

if [ -d "${MIGRATIONS_DIR:-/app/migrations}" ]; then
  echo "Running database migrations..."
  # Never let migrations abort startup. A missing DATABASE_URL or a failed
  # migration must not crash the API — it connects to the DB via SUPABASE_URL,
  # not DATABASE_URL, so the API can serve even when the migration runner has no
  # connection string. Log the failure and start the server anyway.
  if node dist/scripts/migrate.js; then
    echo "Migrations complete."
  else
    echo "WARNING: auto-migrate did not complete (exit $?). Starting server anyway."
  fi
else
  echo "No migrations directory found at ${MIGRATIONS_DIR:-/app/migrations} — skipping auto-migrate"
fi

# ── Start API server ─────────────────────────────────
echo "Starting Idswyft API..."
exec node dist/server.js
