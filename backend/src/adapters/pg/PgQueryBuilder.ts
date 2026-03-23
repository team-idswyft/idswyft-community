/**
 * PgQueryBuilder — Chainable Supabase-compatible query builder backed by pg.Pool
 *
 * Mimics the @supabase/supabase-js client's chainable API:
 *   supabase.from('table').select('*').eq('col', val).order('created_at', { ascending: false })
 *
 * Collects query state via chained method calls, then executes parameterized SQL
 * when awaited (via the `.then()` thenable protocol).
 *
 * Returns { data, error, count } matching Supabase's response shape.
 */

import type { Pool } from 'pg';
import { parseOrFilter, parseNotFilter } from './filterParser.js';
import { parseSelect, resolveRelations, type ParsedRelation } from './selectParser.js';

export interface SupabaseResponse<T = any> {
  data: T | null;
  error: { message: string; code?: string } | null;
  count?: number | null;
}

type Operation = 'select' | 'insert' | 'update' | 'delete' | 'upsert';

interface FilterEntry {
  type: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'is' | 'not' | 'or';
  column: string;
  value: unknown;
  /** For .not(): the operator */
  operator?: string;
}

interface OrderEntry {
  column: string;
  ascending: boolean;
}

export class PgQueryBuilder {
  private pool: Pool;
  private tableName: string;
  private operation: Operation = 'select';
  private selectColumns: string = '*';
  private selectOptions: { count?: string; head?: boolean } = {};
  private filters: FilterEntry[] = [];
  private orders: OrderEntry[] = [];
  private limitCount: number | null = null;
  private rangeFrom: number | null = null;
  private rangeTo: number | null = null;
  private useSingle: boolean = false;
  private insertData: Record<string, unknown> | Record<string, unknown>[] | null = null;
  private updateData: Record<string, unknown> | null = null;
  private upsertConflict: string | null = null;
  private relations: ParsedRelation[] = [];

  constructor(pool: Pool, tableName: string) {
    this.pool = pool;
    this.tableName = tableName;
  }

  // ─── Operations ────────────────────────────────────────────

  select(columns?: string, options?: { count?: string; head?: boolean }): this {
    // In Supabase's API, .select() after .insert()/.update()/.upsert() means
    // "return these columns from the mutation" — it does NOT change to a SELECT.
    // Our mutations already use RETURNING *, so this is a no-op for mutations.
    if (this.operation === 'insert' || this.operation === 'update' || this.operation === 'upsert') {
      if (options) this.selectOptions = options;
      return this;
    }

    this.operation = 'select';
    if (columns) this.selectColumns = columns;
    if (options) this.selectOptions = options;

    // Parse for nested relations
    const parsed = parseSelect(this.selectColumns, this.tableName);
    this.selectColumns = parsed.mainColumns;
    this.relations = parsed.relations;

    return this;
  }

  insert(data: Record<string, unknown> | Record<string, unknown>[]): this {
    this.operation = 'insert';
    this.insertData = data;
    return this;
  }

  update(data: Record<string, unknown>): this {
    this.operation = 'update';
    this.updateData = data;
    return this;
  }

  delete(): this {
    this.operation = 'delete';
    return this;
  }

  upsert(data: Record<string, unknown> | Record<string, unknown>[], options?: { onConflict?: string }): this {
    this.operation = 'upsert';
    this.insertData = data;
    this.upsertConflict = options?.onConflict || null;
    return this;
  }

  // ─── Filters ───────────────────────────────────────────────

  eq(column: string, value: unknown): this {
    this.filters.push({ type: 'eq', column, value });
    return this;
  }

  neq(column: string, value: unknown): this {
    this.filters.push({ type: 'neq', column, value });
    return this;
  }

  gt(column: string, value: unknown): this {
    this.filters.push({ type: 'gt', column, value });
    return this;
  }

  gte(column: string, value: unknown): this {
    this.filters.push({ type: 'gte', column, value });
    return this;
  }

  lt(column: string, value: unknown): this {
    this.filters.push({ type: 'lt', column, value });
    return this;
  }

  lte(column: string, value: unknown): this {
    this.filters.push({ type: 'lte', column, value });
    return this;
  }

  in(column: string, values: unknown[]): this {
    this.filters.push({ type: 'in', column, value: values });
    return this;
  }

  is(column: string, value: unknown): this {
    this.filters.push({ type: 'is', column, value });
    return this;
  }

  not(column: string, operator: string, value: unknown): this {
    this.filters.push({ type: 'not', column, value, operator });
    return this;
  }

  or(filterStr: string): this {
    this.filters.push({ type: 'or', column: '', value: filterStr });
    return this;
  }

  // ─── Modifiers ─────────────────────────────────────────────

  order(column: string, options?: { ascending?: boolean }): this {
    this.orders.push({ column, ascending: options?.ascending ?? true });
    return this;
  }

  limit(n: number): this {
    this.limitCount = n;
    return this;
  }

  range(from: number, to: number): this {
    this.rangeFrom = from;
    this.rangeTo = to;
    return this;
  }

  single(): this {
    this.useSingle = true;
    return this;
  }

  // ─── Execution ─────────────────────────────────────────────

  /**
   * Build and execute the SQL query.
   * This is also called implicitly when the builder is awaited.
   */
  async execute(): Promise<SupabaseResponse> {
    try {
      switch (this.operation) {
        case 'select':
          return await this.executeSelect();
        case 'insert':
          return await this.executeInsert();
        case 'update':
          return await this.executeUpdate();
        case 'delete':
          return await this.executeDelete();
        case 'upsert':
          return await this.executeUpsert();
        default:
          return { data: null, error: { message: `Unknown operation: ${this.operation}` } };
      }
    } catch (err: any) {
      return {
        data: null,
        error: { message: err.message || 'Database query failed', code: err.code },
      };
    }
  }

  /**
   * Thenable — makes the builder awaitable.
   * `await supabase.from('x').select('*')` calls this automatically.
   */
  then<TResult1 = SupabaseResponse, TResult2 = never>(
    onfulfilled?: ((value: SupabaseResponse) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }

  // ─── SQL Builders ──────────────────────────────────────────

  private async executeSelect(): Promise<SupabaseResponse> {
    const params: unknown[] = [];
    const isCountOnly = this.selectOptions.head === true;
    const wantCount = this.selectOptions.count === 'exact';

    // Build main SELECT
    let sql: string;
    if (isCountOnly) {
      sql = `SELECT COUNT(*) as count FROM ${this.tableName}`;
    } else {
      sql = `SELECT ${this.selectColumns} FROM ${this.tableName}`;
    }

    // WHERE clause
    const whereClause = this.buildWhere(params);
    if (whereClause) {
      sql += ` WHERE ${whereClause}`;
    }

    // ORDER BY
    if (this.orders.length > 0 && !isCountOnly) {
      const orderParts = this.orders.map(
        o => `${o.column} ${o.ascending ? 'ASC' : 'DESC'}`
      );
      sql += ` ORDER BY ${orderParts.join(', ')}`;
    }

    // LIMIT / OFFSET (range) — parameterized for defense-in-depth
    if (!isCountOnly) {
      if (this.rangeFrom !== null && this.rangeTo !== null) {
        const cnt = this.rangeTo - this.rangeFrom + 1;
        params.push(cnt);
        sql += ` LIMIT $${params.length}`;
        params.push(this.rangeFrom);
        sql += ` OFFSET $${params.length}`;
      } else if (this.limitCount !== null) {
        params.push(this.limitCount);
        sql += ` LIMIT $${params.length}`;
      }
    }

    const result = await this.pool.query(sql, params);

    if (isCountOnly) {
      const count = parseInt(result.rows[0]?.count ?? '0', 10);
      return { data: null, error: null, count };
    }

    let rows = result.rows;

    // Resolve nested relations (pass 2)
    if (this.relations.length > 0) {
      rows = await resolveRelations(this.pool, rows, this.relations);
    }

    // Count query (separate) if wantCount and not head-only
    let count: number | null = null;
    if (wantCount) {
      const countSql = `SELECT COUNT(*) as count FROM ${this.tableName}${whereClause ? ` WHERE ${whereClause}` : ''}`;
      const countResult = await this.pool.query(countSql, params);
      count = parseInt(countResult.rows[0]?.count ?? '0', 10);
    }

    if (this.useSingle) {
      if (rows.length === 0) {
        return { data: null, error: { message: 'Row not found', code: 'PGRST116' }, count };
      }
      return { data: rows[0], error: null, count };
    }

    return { data: rows, error: null, count };
  }

  private async executeInsert(): Promise<SupabaseResponse> {
    if (!this.insertData) {
      return { data: null, error: { message: 'No data provided for insert' } };
    }

    const rows = Array.isArray(this.insertData) ? this.insertData : [this.insertData];
    if (rows.length === 0) {
      return { data: [], error: null };
    }

    const columns = Object.keys(rows[0]);
    const params: unknown[] = [];
    const valueSets: string[] = [];

    for (const row of rows) {
      const placeholders: string[] = [];
      for (const col of columns) {
        params.push(row[col] ?? null);
        placeholders.push(`$${params.length}`);
      }
      valueSets.push(`(${placeholders.join(', ')})`);
    }

    const quotedCols = columns.map(c => `"${c}"`).join(', ');
    const sql = `INSERT INTO ${this.tableName} (${quotedCols}) VALUES ${valueSets.join(', ')} RETURNING *`;

    const result = await this.pool.query(sql, params);

    if (this.useSingle) {
      return { data: result.rows[0] || null, error: null };
    }

    return { data: Array.isArray(this.insertData) ? result.rows : result.rows[0] || null, error: null };
  }

  private async executeUpdate(): Promise<SupabaseResponse> {
    if (!this.updateData) {
      return { data: null, error: { message: 'No data provided for update' } };
    }

    const params: unknown[] = [];
    const setClauses: string[] = [];

    for (const [key, value] of Object.entries(this.updateData)) {
      params.push(value ?? null);
      setClauses.push(`"${key}" = $${params.length}`);
    }

    let sql = `UPDATE ${this.tableName} SET ${setClauses.join(', ')}`;

    const whereClause = this.buildWhere(params);
    if (whereClause) {
      sql += ` WHERE ${whereClause}`;
    }

    sql += ' RETURNING *';

    const result = await this.pool.query(sql, params);

    if (this.useSingle) {
      return { data: result.rows[0] || null, error: null };
    }

    return { data: result.rows, error: null };
  }

  private async executeDelete(): Promise<SupabaseResponse> {
    const params: unknown[] = [];
    let sql = `DELETE FROM ${this.tableName}`;

    const whereClause = this.buildWhere(params);
    if (whereClause) {
      sql += ` WHERE ${whereClause}`;
    }

    sql += ' RETURNING *';

    const result = await this.pool.query(sql, params);
    return { data: result.rows, error: null };
  }

  private async executeUpsert(): Promise<SupabaseResponse> {
    if (!this.insertData) {
      return { data: null, error: { message: 'No data provided for upsert' } };
    }

    const rows = Array.isArray(this.insertData) ? this.insertData : [this.insertData];
    if (rows.length === 0) {
      return { data: [], error: null };
    }

    const columns = Object.keys(rows[0]);
    const params: unknown[] = [];
    const valueSets: string[] = [];

    for (const row of rows) {
      const placeholders: string[] = [];
      for (const col of columns) {
        params.push(row[col] ?? null);
        placeholders.push(`$${params.length}`);
      }
      valueSets.push(`(${placeholders.join(', ')})`);
    }

    const quotedCols = columns.map(c => `"${c}"`).join(', ');
    const conflictCol = this.upsertConflict || 'id';

    // Build SET clause for the ON CONFLICT update (exclude the conflict column)
    const updateCols = columns.filter(c => c !== conflictCol);
    const setClauses = updateCols.map(c => `"${c}" = EXCLUDED."${c}"`);

    let sql: string;
    if (setClauses.length > 0) {
      sql = `INSERT INTO ${this.tableName} (${quotedCols}) VALUES ${valueSets.join(', ')} ON CONFLICT ("${conflictCol}") DO UPDATE SET ${setClauses.join(', ')} RETURNING *`;
    } else {
      sql = `INSERT INTO ${this.tableName} (${quotedCols}) VALUES ${valueSets.join(', ')} ON CONFLICT ("${conflictCol}") DO NOTHING RETURNING *`;
    }

    const result = await this.pool.query(sql, params);

    if (this.useSingle) {
      return { data: result.rows[0] || null, error: null };
    }

    return { data: Array.isArray(this.insertData) ? result.rows : result.rows[0] || null, error: null };
  }

  // ─── WHERE clause builder ─────────────────────────────────

  private buildWhere(params: unknown[]): string {
    if (this.filters.length === 0) return '';

    const conditions: string[] = [];

    for (const filter of this.filters) {
      switch (filter.type) {
        case 'eq':
          params.push(filter.value);
          conditions.push(`${filter.column} = $${params.length}`);
          break;

        case 'neq':
          params.push(filter.value);
          conditions.push(`${filter.column} != $${params.length}`);
          break;

        case 'gt':
          params.push(filter.value);
          conditions.push(`${filter.column} > $${params.length}`);
          break;

        case 'gte':
          params.push(filter.value);
          conditions.push(`${filter.column} >= $${params.length}`);
          break;

        case 'lt':
          params.push(filter.value);
          conditions.push(`${filter.column} < $${params.length}`);
          break;

        case 'lte':
          params.push(filter.value);
          conditions.push(`${filter.column} <= $${params.length}`);
          break;

        case 'in': {
          const arr = filter.value as unknown[];
          if (arr.length === 0) {
            conditions.push('FALSE');
          } else {
            const placeholders = arr.map(v => {
              params.push(v);
              return `$${params.length}`;
            });
            conditions.push(`${filter.column} IN (${placeholders.join(', ')})`);
          }
          break;
        }

        case 'is':
          if (filter.value === null) {
            conditions.push(`${filter.column} IS NULL`);
          } else if (filter.value === true) {
            conditions.push(`${filter.column} IS TRUE`);
          } else if (filter.value === false) {
            conditions.push(`${filter.column} IS FALSE`);
          } else {
            conditions.push(`${filter.column} IS NULL`);
          }
          break;

        case 'not': {
          const parsed = parseNotFilter(
            filter.column,
            filter.operator || 'eq',
            filter.value,
            params.length
          );
          conditions.push(parsed.sql);
          params.push(...parsed.params);
          break;
        }

        case 'or': {
          const parsed = parseOrFilter(String(filter.value), params.length);
          conditions.push(parsed.sql);
          params.push(...parsed.params);
          break;
        }
      }
    }

    return conditions.join(' AND ');
  }
}
