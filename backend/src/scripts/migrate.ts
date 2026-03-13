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
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
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

const MIGRATIONS_DIR = join(__dirname, '../../../supabase/migrations');

// ── Main ────────────────────────────────────────────────────────────────────
async function main() {
  const client = new pg.Client({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  try {
    await client.connect();
    console.log('✅ Connected to database');

    // Ensure tracking table exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        name TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // Get already-applied migrations
    const { rows: applied } = await client.query('SELECT name FROM _migrations ORDER BY name');
    const appliedSet = new Set(applied.map(r => r.name));

    // Get all .sql files sorted
    const files = readdirSync(MIGRATIONS_DIR)
      .filter(f => f.endsWith('.sql'))
      .sort();

    // Run pending migrations
    let ranCount = 0;
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
        console.error(`  ❌ ${file} FAILED: ${err.message}`);
        process.exit(1);
      }
    }

    if (ranCount === 0) {
      console.log('\n✅ Database is up to date — no pending migrations');
    } else {
      console.log(`\n✅ Applied ${ranCount} migration(s) successfully`);
    }
  } finally {
    await client.end();
  }
}

main().catch(err => {
  console.error('❌ Migration failed:', err.message);
  process.exit(1);
});
