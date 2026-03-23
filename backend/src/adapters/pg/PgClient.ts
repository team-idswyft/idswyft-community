/**
 * PgClient — Drop-in Supabase client replacement backed by pg.Pool
 *
 * Exports the same API surface as @supabase/supabase-js's `SupabaseClient`:
 *   - .from(table)     → PgQueryBuilder (chainable)
 *   - .rpc(fn, args)   → SELECT * FROM fn($1, $2, ...)
 *   - .storage         → no-op (Community Edition uses local/S3 storage)
 *   - .channel()       → no-op (Community Edition uses webhooks)
 *   - .removeChannel() → no-op
 *   - .auth            → minimal no-op (health check compatibility)
 *
 * Only database.ts knows whether it's using PgClient or the real Supabase client.
 * All 37+ service/route files import `{ supabase }` unchanged.
 */

import pg from 'pg';
import { PgQueryBuilder } from './PgQueryBuilder.js';

const { Pool } = pg;

// Override pg's default type parsers so timestamp columns return ISO strings
// instead of Date objects — matching Supabase's behavior.
// OID 1114 = timestamp, OID 1184 = timestamptz
pg.types.setTypeParser(1114, (val: string) => val);
pg.types.setTypeParser(1184, (val: string) => val);

export class PgClient {
  public pool: pg.Pool;

  constructor(connectionString: string) {
    this.pool = new Pool({
      connectionString,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    });
  }

  /**
   * Start a chainable query on a table — the core entry point.
   * Usage: pgClient.from('developers').select('*').eq('id', id).single()
   */
  from(table: string): PgQueryBuilder {
    return new PgQueryBuilder(this.pool, table);
  }

  /**
   * Call a PostgreSQL function (stored procedure / RPC).
   *
   * Maps to: SELECT * FROM function_name($1, $2, ...)
   *
   * Special cases:
   * - exec_sql / exec: Direct SQL execution (setup scripts only)
   */
  async rpc(
    functionName: string,
    args?: Record<string, unknown>
  ): Promise<{ data: any; error: { message: string; code?: string } | null }> {
    try {
      // Special case: exec_sql / exec — direct SQL execution for setup scripts
      // Some callers pass { sql: '...' }, others pass { query: '...' }
      if (functionName === 'exec_sql' || functionName === 'exec') {
        const sql = (args?.sql ?? args?.query) as string;
        if (!sql) {
          return { data: null, error: { message: 'No SQL provided for exec' } };
        }
        await this.pool.query(sql);
        return { data: null, error: null };
      }

      // Standard RPC: SELECT * FROM func(named_arg1 => $1, named_arg2 => $2, ...)
      if (!args || Object.keys(args).length === 0) {
        const result = await this.pool.query(`SELECT * FROM ${functionName}()`);
        return { data: result.rows[0] ?? null, error: null };
      }

      const argNames = Object.keys(args);
      const argValues = Object.values(args);
      const paramList = argNames.map((name, i) => `${name} => $${i + 1}`).join(', ');
      const sql = `SELECT * FROM ${functionName}(${paramList})`;

      const result = await this.pool.query(sql, argValues);

      // RPC functions typically return a single value or JSONB
      const row = result.rows[0];
      if (!row) {
        return { data: null, error: null };
      }

      // If the function returns a single column, unwrap it
      const keys = Object.keys(row);
      if (keys.length === 1) {
        return { data: row[keys[0]], error: null };
      }

      return { data: row, error: null };
    } catch (err: any) {
      return {
        data: null,
        error: { message: err.message || 'RPC call failed', code: err.code },
      };
    }
  }

  /**
   * Storage — no-op for Community Edition.
   * Community uses STORAGE_PROVIDER=local or s3.
   * These methods exist only to prevent runtime errors if accidentally called.
   */
  get storage() {
    return {
      from: (_bucket: string) => ({
        upload: async () => {
          throw new Error('Supabase Storage not available in Community Edition. Set STORAGE_PROVIDER=local or s3.');
        },
        download: async () => {
          throw new Error('Supabase Storage not available in Community Edition. Set STORAGE_PROVIDER=local or s3.');
        },
        createSignedUrl: async () => {
          throw new Error('Supabase Storage not available in Community Edition. Set STORAGE_PROVIDER=local or s3.');
        },
        getPublicUrl: (_path: string) => ({
          data: { publicUrl: '' },
        }),
        remove: async () => {
          throw new Error('Supabase Storage not available in Community Edition. Set STORAGE_PROVIDER=local or s3.');
        },
        list: async () => {
          throw new Error('Supabase Storage not available in Community Edition. Set STORAGE_PROVIDER=local or s3.');
        },
      }),
      createBucket: async () => {
        // No-op — community edition doesn't need Supabase buckets
        return { error: null };
      },
    };
  }

  /**
   * Realtime channels — no-op for Community Edition.
   * Community users use webhooks for status updates.
   */
  channel(_name: string) {
    return {
      send: async () => 'ok' as const,
      on: () => ({
        subscribe: () => ({}),
      }),
      subscribe: () => ({}),
    };
  }

  removeChannel(_channel: any): void {
    // No-op
  }

  /**
   * Auth — minimal no-op for health check compatibility.
   * The connectDB() function calls supabase.auth.getUser() as a health check.
   * In community mode we use pool.query('SELECT 1') instead, but this prevents
   * errors if auth is accessed elsewhere.
   */
  get auth() {
    return {
      getUser: async () => ({
        data: { user: null },
        error: { message: 'Auth not available in Community Edition' },
      }),
    };
  }

  /**
   * Gracefully close the connection pool.
   */
  async end(): Promise<void> {
    await this.pool.end();
  }
}
