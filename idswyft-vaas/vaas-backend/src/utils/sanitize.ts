/**
 * Escape Postgres ILIKE metacharacters so user input is treated literally.
 * Also strips PostgREST structural characters (comma, period, parentheses, quotes)
 * that could break `.or()` filter expressions.
 */
export function escapePostgrestValue(raw: string): string {
  // 1. Escape ILIKE metacharacters
  let escaped = raw.replace(/[\\%_]/g, '\\$&');
  // 2. Strip PostgREST structural chars that could inject extra filter clauses
  escaped = escaped.replace(/[,.()"]/g, '');
  return escaped;
}
