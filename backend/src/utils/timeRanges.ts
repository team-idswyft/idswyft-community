/**
 * Calendar-month range helpers for billing-style aggregations on
 * verification_requests. Used by /api/developer/stats and
 * /api/developer/analytics so they agree on what "this month" means.
 *
 * Server-local time. On Railway the runtime is UTC, so callers
 * effectively get UTC month boundaries — fine for billing/quota use.
 */

/**
 * First instant of the calendar month containing `now`. Use as the
 * lower bound (`gte`) when filtering rows for month-to-date totals.
 *
 * Pure: does not mutate `now`.
 */
export function getMonthStart(now: Date): Date {
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  start.setHours(0, 0, 0, 0);
  return start;
}

/**
 * First instant of the calendar month FOLLOWING `now`. Use as the
 * quota reset anchor — a request at 23:59 on the last day of the
 * month resets at the value returned here. Also serves as the upper
 * bound (`lt`) when filtering rows strictly within "this month".
 *
 * Pure: does not mutate `now`.
 */
export function getNextMonthStart(now: Date): Date {
  const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  next.setHours(0, 0, 0, 0);
  return next;
}
