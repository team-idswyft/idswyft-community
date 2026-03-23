/**
 * Select Parser — Nested Relation Resolution
 *
 * Parses Supabase-style select strings that include nested relationships,
 * e.g. "*, documents(*), selfies(*)" or "*, developer:developers(*)".
 *
 * Uses a 2-pass approach:
 *   Pass 1: Query the main table with non-nested columns only
 *   Pass 2: For each nested relation, run a secondary query and merge results
 *
 * This is simpler and more reliable than trying to build complex JOINs.
 */

import type { Pool } from 'pg';

/**
 * FK registry: maps parent_table → { relation_alias → { table, fkColumn, fkOn, isSingle } }
 *
 * Conventions:
 * - Colon syntax (developer:developers(*)) → single-object join (isSingle: true)
 * - No colon (documents(*)) → array join (isSingle: false)
 * - fkOn: 'child' means FK lives on the child table (child.fk → parent.id)
 * - fkOn: 'parent' means FK lives on the parent table (parent.fk → child.id)
 */
interface FKEntry {
  table: string;
  fkColumn: string;
  /** Which side holds the FK: 'child' = child table references parent, 'parent' = parent references child */
  fkOn: 'child' | 'parent';
  /** If true, return a single object instead of an array */
  isSingle: boolean;
}

const FK_REGISTRY: Record<string, Record<string, FKEntry>> = {
  api_keys: {
    developer: {
      table: 'developers',
      fkColumn: 'developer_id',
      fkOn: 'parent', // api_keys.developer_id → developers.id
      isSingle: true,
    },
  },
  verification_requests: {
    documents: {
      table: 'documents',
      fkColumn: 'verification_request_id',
      fkOn: 'child', // documents.verification_request_id → verification_requests.id
      isSingle: false,
    },
    selfies: {
      table: 'selfies',
      fkColumn: 'verification_request_id',
      fkOn: 'child', // selfies.verification_request_id → verification_requests.id
      isSingle: false,
    },
    user: {
      table: 'users',
      fkColumn: 'user_id',
      fkOn: 'parent', // verification_requests.user_id → users.id
      isSingle: true,
    },
    developer: {
      table: 'developers',
      fkColumn: 'developer_id',
      fkOn: 'parent', // verification_requests.developer_id → developers.id
      isSingle: true,
    },
  },
  webhook_deliveries: {
    webhook: {
      table: 'webhooks',
      fkColumn: 'webhook_id',
      fkOn: 'parent', // webhook_deliveries.webhook_id → webhooks.id
      isSingle: true,
    },
  },
  webhooks: {
    api_key: {
      table: 'api_keys',
      fkColumn: 'api_key_id',
      fkOn: 'parent', // webhooks.api_key_id → api_keys.id
      isSingle: true,
    },
  },
};

/** Parsed relation from a select string */
export interface ParsedRelation {
  /** The alias used in the result object (e.g. "developer", "documents") */
  alias: string;
  /** The actual table name to query */
  table: string;
  /** Columns to select from the related table (* or comma-separated) */
  columns: string;
  /** FK metadata */
  fk: FKEntry;
}

export interface ParsedSelect {
  /** Columns to select from the main table (with nested parts stripped) */
  mainColumns: string;
  /** Nested relations to resolve in pass 2 */
  relations: ParsedRelation[];
}

/**
 * Parse a Supabase-style select string into main columns + nested relations.
 *
 * Examples:
 *   "*"                                  → { mainColumns: "*", relations: [] }
 *   "*, documents(*)"                    → { mainColumns: "*", relations: [{ alias: "documents", ... }] }
 *   "*, developer:developers(*)"         → { mainColumns: "*", relations: [{ alias: "developer", ... }] }
 *   "id, documents(file_path)"           → { mainColumns: "id", relations: [{ alias: "documents", cols: "file_path" }] }
 */
export function parseSelect(
  selectStr: string,
  tableName: string
): ParsedSelect {
  const relations: ParsedRelation[] = [];
  const mainParts: string[] = [];

  // Normalize whitespace
  const normalized = selectStr.replace(/\s+/g, ' ').trim();

  // Split by comma at top level (respecting parentheses)
  const tokens = splitTopLevel(normalized);

  for (const token of tokens) {
    const trimmed = token.trim();

    // Check for nested relation: something(columns) or alias:table(columns)
    // Also handles PostgREST FK hints: alias:table!fk_column(columns)
    // Strip the !hint before matching — it's only a PostgREST routing directive
    const cleaned = trimmed.replace(/!\w+/, '');
    const nestedMatch = cleaned.match(/^(\w+)(?::(\w+))?\(([^)]*)\)$/);
    if (nestedMatch) {
      const [, nameOrAlias, tablePart, cols] = nestedMatch;
      const alias = nameOrAlias;
      const relTable = tablePart || nameOrAlias;

      // Look up FK registry
      const tableRegistry = FK_REGISTRY[tableName];
      if (tableRegistry && tableRegistry[alias]) {
        relations.push({
          alias,
          table: relTable,
          columns: cols || '*',
          fk: tableRegistry[alias],
        });
      } else {
        // Fallback: assume child-side FK with convention table_id
        relations.push({
          alias,
          table: relTable,
          columns: cols || '*',
          fk: {
            table: relTable,
            fkColumn: `${tableName.replace(/s$/, '')}_id`,
            fkOn: 'child',
            isSingle: !!tablePart, // colon syntax = single
          },
        });
      }
    } else {
      mainParts.push(trimmed);
    }
  }

  return {
    mainColumns: mainParts.join(', ') || '*',
    relations,
  };
}

/**
 * Resolve nested relations for a set of main-table rows.
 *
 * For each relation, runs a secondary query and merges results
 * into the parent rows.
 */
export async function resolveRelations(
  pool: Pool,
  rows: Record<string, unknown>[],
  relations: ParsedRelation[]
): Promise<Record<string, unknown>[]> {
  if (relations.length === 0 || rows.length === 0) {
    return rows;
  }

  for (const rel of relations) {
    if (rel.fk.fkOn === 'child') {
      // Child table has FK pointing to parent (e.g. documents.verification_request_id)
      const parentIds = rows.map(r => r.id).filter(Boolean);
      if (parentIds.length === 0) continue;

      const placeholders = parentIds.map((_, i) => `$${i + 1}`).join(', ');
      const cols = rel.columns === '*' ? '*' : rel.columns;
      const sql = `SELECT ${cols} FROM ${rel.table} WHERE ${rel.fk.fkColumn} IN (${placeholders})`;

      const { rows: childRows } = await pool.query(sql, parentIds);

      // Group by FK column
      const grouped = new Map<string, Record<string, unknown>[]>();
      for (const child of childRows) {
        const key = String(child[rel.fk.fkColumn]);
        if (!grouped.has(key)) grouped.set(key, []);
        grouped.get(key)!.push(child);
      }

      // Merge into parent rows
      for (const row of rows) {
        const key = String(row.id);
        const children = grouped.get(key) || [];
        (row as any)[rel.alias] = rel.fk.isSingle ? (children[0] || null) : children;
      }
    } else {
      // Parent table has FK pointing to child (e.g. api_keys.developer_id → developers.id)
      const fkValues = rows.map(r => r[rel.fk.fkColumn]).filter(v => v != null);
      if (fkValues.length === 0) {
        // No FK values — set null/empty
        for (const row of rows) {
          (row as any)[rel.alias] = rel.fk.isSingle ? null : [];
        }
        continue;
      }

      const uniqueFks = [...new Set(fkValues.map(String))];
      const placeholders = uniqueFks.map((_, i) => `$${i + 1}`).join(', ');
      const cols = rel.columns === '*' ? '*' : rel.columns;
      const sql = `SELECT ${cols} FROM ${rel.table} WHERE id IN (${placeholders})`;

      const { rows: relatedRows } = await pool.query(sql, uniqueFks);

      // Index by id
      const indexed = new Map<string, Record<string, unknown>>();
      for (const related of relatedRows) {
        indexed.set(String(related.id), related);
      }

      // Merge into parent rows
      for (const row of rows) {
        const fkVal = row[rel.fk.fkColumn];
        const related = fkVal != null ? indexed.get(String(fkVal)) : undefined;
        (row as any)[rel.alias] = rel.fk.isSingle ? (related || null) : (related ? [related] : []);
      }
    }
  }

  return rows;
}

/**
 * Split a string by commas at the top level (not inside parentheses).
 */
function splitTopLevel(str: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let depth = 0;

  for (const ch of str) {
    if (ch === '(') depth++;
    else if (ch === ')') depth--;

    if (ch === ',' && depth === 0) {
      tokens.push(current);
      current = '';
    } else {
      current += ch;
    }
  }

  if (current.trim()) {
    tokens.push(current);
  }

  return tokens;
}
