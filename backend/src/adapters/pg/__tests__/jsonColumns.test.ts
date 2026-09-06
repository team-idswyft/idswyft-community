import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Pool } from 'pg';
import { jsonColumnsOf, clearJsonColumnCache, serializeColumnValue } from '../jsonColumns.js';
import { PgQueryBuilder } from '../PgQueryBuilder.js';

function fakePool(jsonColumns: string[], onQuery?: (sql: string, params: unknown[]) => void): Pool {
  return {
    query: vi.fn(async (sql: string, params: unknown[] = []) => {
      if (sql.includes('information_schema.columns')) {
        return { rows: jsonColumns.map(column_name => ({ column_name })) };
      }
      onQuery?.(sql, params);
      return { rows: [{ id: 'row-1' }] };
    }),
  } as unknown as Pool;
}

beforeEach(() => {
  clearJsonColumnCache();
});

describe('serializeColumnValue', () => {
  it('stringifies an array bound for a jsonb column', () => {
    const flags = [{ type: 'face_lsh', hamming_distance: 0 }];
    expect(serializeColumnValue('duplicate_flags', flags, new Set(['duplicate_flags'])))
      .toBe(JSON.stringify(flags));
  });

  it('leaves a text[] column as a native array', () => {
    expect(serializeColumnValue('events', ['verification.completed'], new Set(['duplicate_flags'])))
      .toEqual(['verification.completed']);
  });

  it('stringifies arrays of objects even without catalog knowledge', () => {
    // No Postgres array type holds bare objects, so this shape can only be JSON.
    expect(serializeColumnValue('unknown_column', [{ a: 1 }], new Set()))
      .toBe('[{"a":1}]');
  });

  it('passes non-array values through untouched', () => {
    expect(serializeColumnValue('addons', { aml_screening: false }, new Set(['addons'])))
      .toEqual({ aml_screening: false });
    expect(serializeColumnValue('status', 'verified', new Set())).toBe('verified');
    expect(serializeColumnValue('addons', null, new Set(['addons']))).toBeNull();
  });
});

describe('jsonColumnsOf', () => {
  it('reads the catalog once per table', async () => {
    const pool = fakePool(['duplicate_flags']);
    await jsonColumnsOf(pool, 'verification_requests');
    await jsonColumnsOf(pool, 'verification_requests');
    expect(pool.query).toHaveBeenCalledTimes(1);
  });

  it('degrades to an empty set when the catalog is unreachable', async () => {
    const pool = { query: vi.fn(async () => { throw new Error('no catalog'); }) } as unknown as Pool;
    await expect(jsonColumnsOf(pool, 'verification_requests')).resolves.toEqual(new Set());
  });
});

describe('PgQueryBuilder json handling', () => {
  it('sends duplicate_flags as JSON text on update', async () => {
    const seen: { sql: string; params: unknown[] }[] = [];
    const pool = fakePool(['duplicate_flags'], (sql, params) => seen.push({ sql, params }));
    const flags = [{ verification_request_id: 'v-1', hamming_distance: 0 }];

    await new PgQueryBuilder(pool, 'verification_requests')
      .update({ duplicate_flags: flags })
      .eq('id', 'v-1');

    expect(seen).toHaveLength(1);
    expect(seen[0].sql).toContain('UPDATE verification_requests');
    expect(seen[0].params[0]).toBe(JSON.stringify(flags));
  });

  it('sends a text[] column as an array on insert', async () => {
    const seen: { sql: string; params: unknown[] }[] = [];
    const pool = fakePool([], (sql, params) => seen.push({ sql, params }));

    await new PgQueryBuilder(pool, 'webhooks')
      .insert({ events: ['verification.completed', 'verification.failed'] });

    expect(seen[0].params[0]).toEqual(['verification.completed', 'verification.failed']);
  });
});
