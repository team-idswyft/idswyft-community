/**
 * JSON column awareness for the pg adapter.
 *
 * node-pg serializes a JS array into a Postgres array literal (`{a,b}`), which
 * a json/jsonb column rejects with `invalid input syntax for type json`. That
 * is what silently dropped every `duplicate_flags` write: the flags were
 * computed, logged as detected, and then lost on the UPDATE.
 *
 * Plain objects are safe (node-pg JSON-stringifies them); only arrays need the
 * explicit conversion, and only when the target column really is json/jsonb —
 * `text[]` columns such as `webhooks.events` must keep the array literal.
 *
 * The catalog lookup runs once per table and is cached for the process.
 */

import type { Pool } from 'pg';

const cache = new Map<string, Promise<Set<string>>>();

const JSON_COLUMNS_SQL = `
  SELECT column_name
  FROM information_schema.columns
  WHERE table_name = $1
    AND table_schema = ANY (current_schemas(false))
    AND data_type IN ('json', 'jsonb')
`;

export async function jsonColumnsOf(pool: Pool, tableName: string): Promise<Set<string>> {
  const cached = cache.get(tableName);
  if (cached) return cached;

  const lookup = pool
    .query(JSON_COLUMNS_SQL, [tableName])
    .then(result => new Set<string>(result.rows.map((row: { column_name: string }) => row.column_name)))
    // An unreachable catalog must not break the write — the caller falls back
    // to the shape heuristic below.
    .catch(() => new Set<string>());

  cache.set(tableName, lookup);
  return lookup;
}

/** Test seam / operational escape hatch: forget the cached catalog reads. */
export function clearJsonColumnCache(): void {
  cache.clear();
}

/**
 * Serialize one column value for a parameterized statement.
 *
 * When the catalog says the column is json/jsonb, arrays are stringified. When
 * the catalog is unavailable, an array of objects is stringified anyway: no
 * Postgres array type holds bare objects, so that shape can only be JSON.
 */
export function serializeColumnValue(column: string, value: unknown, jsonColumns: Set<string>): unknown {
  if (!Array.isArray(value)) return value;
  if (jsonColumns.has(column)) return JSON.stringify(value);
  const holdsObjects = value.some(item => item !== null && typeof item === 'object');
  return holdsObjects ? JSON.stringify(value) : value;
}
