/**
 * Lightweight migration runner for the main Idswyft backend.
 *
 * Usage:  npx tsx src/scripts/migrate.ts
 *    or:  npm run migrate
 *
 * How it works:
 *   1. Connects to Postgres via DATABASE_URL
 *   2. Creates a `_migrations` tracking table if it doesn't exist
 *   3. Reads all .sql files from ../../supabase/migrations/
 *   4. Runs any that haven't been applied yet (in sorted order)
 *   5. Records each successful migration in `_migrations`
 *
 * Set DATABASE_URL in .env — grab it from Supabase Dashboard:
 *   Settings > Database > Connection string (URI)
 */

import pg from 'pg';
import { readdirSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env
dotenv.config({ path: join(__dirname, '../../.env') });

// ── Config ──────────────────────────────────────────────────────────────────
if (!process.env.DATABASE_URL) {
  console.error(
    '❌ DATABASE_URL is not set.\n' +
    '\n' +
    '   Get it from Supabase Dashboard:\n' +
    '   Settings → Database → Connection string (URI)\n' +
    '\n' +
    '   It looks like:\n' +
    '   postgresql://postgres:PASSWORD@db.kcjugatpfhccjroyliku.supabase.co:5432/postgres\n' +
    '\n' +
    '   Add it to backend/.env:\n' +
    '   DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@db.kcjugatpfhccjroyliku.supabase.co:5432/postgres'
  );
  process.exit(1);
}
const DATABASE_URL: string = process.env.DATABASE_URL;

const MIGRATIONS_DIR = process.env.MIGRATIONS_DIR || join(__dirname, '../../../supabase/migrations');

// ── Main ────────────────────────────────────────────────────────────────────
async function main() {
  // Only use SSL for cloud-hosted Postgres (e.g. Supabase)
  const useSSL = DATABASE_URL.includes('supabase.co') || process.env.DB_SSL === 'true';
  const client = new pg.Client({
    connectionString: DATABASE_URL,
    ...(useSSL ? { ssl: { rejectUnauthorized: false } } : {}),
  });

  // Postgres advisory lock key — fixed integer specific to Idswyft's
  // migration runner. Two concurrent invocations of `npm run migrate`
  // (e.g. two Railway replicas redeploying simultaneously) will serialize:
  // the second waits on pg_advisory_lock until the first releases. Without
  // this, both could try to apply the same SQL file, racing on the
  // INSERT INTO _migrations and producing partial / undefined state.
  //
  // Picked from a deterministic 32-bit hash of "idswyft-migrations" so any
  // future migration runner with the same key serializes correctly with
  // this one. NOT shared with other advisory locks elsewhere in the app.
  const ADVISORY_LOCK_KEY = 0x1d59f73b;   // 491,517,755

  try {
    await client.connect();
    console.log('✅ Connected to database');

    // Acquire the advisory lock BEFORE doing any migration work. This call
    // blocks if another runner holds the lock, so concurrent invocations
    // serialize naturally rather than racing. The lock is automatically
    // released when the session ends (`client.end()` in the finally block),
    // so a crashed runner doesn't leave the lock held — Postgres ties
    // session-level advisory locks to the connection lifetime.
    console.log(`🔒 Acquiring migration advisory lock (key ${ADVISORY_LOCK_KEY})...`);
    await client.query('SELECT pg_advisory_lock($1)', [ADVISORY_LOCK_KEY]);
    console.log('🔒 Lock acquired');

    // Ensure tracking table exists, with RLS locked down at the same time.
    // RLS + service_role-only policy match the pattern from migration 57
    // for every other public.* table, and pre-empts the Supabase lint
    // "RLS Disabled in Public" warning on fresh databases. service_role
    // bypasses RLS, so the runner itself is unaffected.
    await client.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        name TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ DEFAULT NOW()
      );
      ALTER TABLE _migrations ENABLE ROW LEVEL SECURITY;
      DROP POLICY IF EXISTS service_role_all_migrations ON _migrations;
      CREATE POLICY service_role_all_migrations
        ON _migrations FOR ALL TO service_role USING (true) WITH CHECK (true);
      REVOKE ALL ON _migrations FROM anon;
      REVOKE ALL ON _migrations FROM authenticated;
    `);

    // Get already-applied migrations
    const { rows: applied } = await client.query('SELECT name FROM _migrations ORDER BY name');
    const appliedSet = new Set(applied.map((r: { name: string }) => r.name));

    // Get all .sql files sorted
    const files = readdirSync(MIGRATIONS_DIR)
      .filter(f => f.endsWith('.sql'))
      .sort();

    // In Docker (community edition), skip migrations that fail due to missing
    // prerequisites rather than blocking the server from starting.
    const lenient = process.env.MIGRATIONS_LENIENT === 'true';

    // Run pending migrations
    let ranCount = 0;
    let skippedCount = 0;
    for (const file of files) {
      if (appliedSet.has(file)) {
        console.log(`  ⏭️  ${file} (already applied)`);
        continue;
      }

      const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
      console.log(`  ▶️  Running ${file}...`);

      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('INSERT INTO _migrations (name) VALUES ($1)', [file]);
        await client.query('COMMIT');
        console.log(`  ✅ ${file}`);
        ranCount++;
      } catch (err: any) {
        await client.query('ROLLBACK');
        if (lenient) {
          console.warn(`  ⚠️  ${file} skipped: ${err.message}`);
          skippedCount++;
        } else {
          console.error(`  ❌ ${file} FAILED: ${err.message}`);
          process.exit(1);
        }
      }
    }

    if (ranCount === 0 && skippedCount === 0) {
      console.log('\n✅ Database is up to date — no pending migrations');
    } else {
      console.log(`\n✅ Applied ${ranCount} migration(s)${skippedCount > 0 ? `, skipped ${skippedCount}` : ''}`);
    }
  } finally {
    await client.end();
  }
}

main().catch(err => {
  console.error('❌ Migration failed:', err.message);
  process.exit(1);
});
