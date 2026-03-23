/**
 * PostgREST Filter Parser
 *
 * Translates PostgREST-style filter strings (used by Supabase's .or() method)
 * into parameterized SQL WHERE clauses.
 *
 * Example:
 *   "name.ilike.%search%,email.ilike.%search%"
 *   → { sql: '(name ILIKE $1 OR email ILIKE $2)', params: ['%search%', '%search%'] }
 */

/** Map of PostgREST operator names to SQL operators */
const OP_MAP: Record<string, string> = {
  eq: '=',
  neq: '!=',
  gt: '>',
  gte: '>=',
  lt: '<',
  lte: '<=',
  like: 'LIKE',
  ilike: 'ILIKE',
  is: 'IS',
  cs: '@>',
  in: 'IN',
};

interface ParsedFilter {
  sql: string;
  params: unknown[];
}

/**
 * Parse a single PostgREST filter token like "name.ilike.%search%"
 * into a SQL fragment with parameterized values.
 */
function parseSingleFilter(
  token: string,
  paramOffset: number
): ParsedFilter {
  // Split on first two dots: column.operator.value
  // Value may contain dots (e.g., IP addresses, decimals)
  const firstDot = token.indexOf('.');
  if (firstDot === -1) {
    return { sql: token, params: [] };
  }

  const column = token.substring(0, firstDot);
  const rest = token.substring(firstDot + 1);

  const secondDot = rest.indexOf('.');
  if (secondDot === -1) {
    return { sql: token, params: [] };
  }

  const operator = rest.substring(0, secondDot);
  const value = rest.substring(secondDot + 1);

  const sqlOp = OP_MAP[operator];
  if (!sqlOp) {
    return { sql: token, params: [] };
  }

  // IS operator: IS NULL / IS NOT NULL — no parameter needed
  if (operator === 'is') {
    const isVal = value.toLowerCase();
    if (isVal === 'null') {
      return { sql: `${column} IS NULL`, params: [] };
    }
    if (isVal === 'true') {
      return { sql: `${column} IS TRUE`, params: [] };
    }
    if (isVal === 'false') {
      return { sql: `${column} IS FALSE`, params: [] };
    }
    return { sql: `${column} IS NULL`, params: [] };
  }

  // IN operator: value like "(val1,val2,val3)"
  if (operator === 'in') {
    const inner = value.replace(/^\(/, '').replace(/\)$/, '');
    const items = inner.split(',').map(v => v.replace(/^"|"$/g, ''));
    const placeholders = items.map((_, i) => `$${paramOffset + i + 1}`);
    return {
      sql: `${column} IN (${placeholders.join(', ')})`,
      params: items,
    };
  }

  // CS (contains / @>) operator: value like "{eventType}"
  if (operator === 'cs') {
    // Array containment: events @> ARRAY['value']
    const inner = value.replace(/^\{/, '').replace(/\}$/, '');
    return {
      sql: `${column} @> ARRAY[$${paramOffset + 1}]::text[]`,
      params: [inner],
    };
  }

  // Standard operators: =, !=, >, >=, <, <=, LIKE, ILIKE
  return {
    sql: `${column} ${sqlOp} $${paramOffset + 1}`,
    params: [value],
  };
}

/**
 * Split a PostgREST OR filter string on commas, respecting parentheses.
 *
 * "name.ilike.%s%,events.cs.{val},status.in.(a,b,c)"
 * → ["name.ilike.%s%", "events.cs.{val}", "status.in.(a,b,c)"]
 */
function splitOrTokens(filterStr: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let parenDepth = 0;
  let braceDepth = 0;

  for (const ch of filterStr) {
    if (ch === '(') parenDepth++;
    else if (ch === ')') parenDepth--;
    else if (ch === '{') braceDepth++;
    else if (ch === '}') braceDepth--;

    if (ch === ',' && parenDepth === 0 && braceDepth === 0) {
      tokens.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }

  if (current.trim()) {
    tokens.push(current.trim());
  }

  return tokens;
}

/**
 * Parse a PostgREST .or() filter string into a SQL WHERE clause.
 *
 * @param filterStr - PostgREST filter string, e.g. "name.ilike.%s%,email.ilike.%s%"
 * @param paramOffset - Starting parameter index (for $N placeholders)
 * @returns Parsed SQL fragment and parameters
 */
export function parseOrFilter(
  filterStr: string,
  paramOffset: number
): ParsedFilter {
  const tokens = splitOrTokens(filterStr);
  const parts: string[] = [];
  const allParams: unknown[] = [];

  for (const token of tokens) {
    const parsed = parseSingleFilter(token, paramOffset + allParams.length);
    parts.push(parsed.sql);
    allParams.push(...parsed.params);
  }

  return {
    sql: `(${parts.join(' OR ')})`,
    params: allParams,
  };
}

/**
 * Parse a .not() filter into SQL.
 *
 * .not('col', 'is', null)         → "col IS NOT NULL"
 * .not('col', 'in', '("a","b")') → "col NOT IN ($1, $2)"
 * .not('col', 'eq', 'val')       → "NOT (col = $1)"
 */
export function parseNotFilter(
  column: string,
  operator: string,
  value: unknown,
  paramOffset: number
): ParsedFilter {
  if (operator === 'is') {
    if (value === null || String(value).toLowerCase() === 'null') {
      return { sql: `${column} IS NOT NULL`, params: [] };
    }
    return { sql: `${column} IS NOT ${String(value).toUpperCase()}`, params: [] };
  }

  if (operator === 'in') {
    // Value is a string like '("a","b","c")'
    const str = String(value);
    const inner = str.replace(/^\(/, '').replace(/\)$/, '');
    const items = inner.split(',').map(v => v.replace(/^"|"$/g, ''));
    const placeholders = items.map((_, i) => `$${paramOffset + i + 1}`);
    return {
      sql: `${column} NOT IN (${placeholders.join(', ')})`,
      params: items,
    };
  }

  // Generic NOT wrapper
  const sqlOp = OP_MAP[operator] || '=';
  return {
    sql: `NOT (${column} ${sqlOp} $${paramOffset + 1})`,
    params: [value],
  };
}
