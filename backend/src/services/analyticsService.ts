/**
 * Analytics Service
 *
 * Provides verification funnel, rejection breakdown, fraud patterns,
 * and processing time analytics.
 */

import { supabase } from '@/config/database.js';
import { VerificationStatus } from '@idswyft/shared';

// PostgREST defaults to 1000 rows max. We raise this for analytics
// aggregations that need the full dataset. For true scale, these should
// become SQL RPCs — this guard prevents silent truncation in the interim.
const ANALYTICS_ROW_LIMIT = 10000;

/**
 * Batch an `.in()` query into chunks to avoid exceeding PostgREST URL
 * length limits. Returns the concatenated results from all chunks.
 */
async function batchedIn<T>(
  table: string,
  selectCols: string,
  filterCol: string,
  ids: string[],
  extraFilters?: (q: any) => any,
): Promise<T[]> {
  const CHUNK_SIZE = 200;
  const results: T[] = [];

  for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
    const chunk = ids.slice(i, i + CHUNK_SIZE);
    let query = supabase
      .from(table)
      .select(selectCols)
      .in(filterCol, chunk)
      .limit(ANALYTICS_ROW_LIMIT);

    if (extraFilters) {
      query = extraFilters(query);
    }

    const { data, error } = await query;
    if (!error && data) {
      results.push(...(data as T[]));
    }
  }

  return results;
}

export interface FunnelStep {
  step: string;
  count: number;
  percentage: number;
}

export interface RejectionBreakdown {
  reason: string;
  count: number;
  percentage: number;
}

export interface FraudPattern {
  pattern: string;
  count: number;
  detail: string;
}

export interface PeriodFilter {
  start_date: string;
  end_date: string;
}

export function getDefaultPeriod(): PeriodFilter {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 7); // Last 7 days (matches activity log retention)
  return {
    start_date: start.toISOString(),
    end_date: end.toISOString(),
  };
}

/**
 * Get conversion funnel: how many verifications reach each step.
 *
 * Uses verification_contexts (session state) to determine actual pipeline
 * progress rather than relying on the coarse DB status column, which can't
 * distinguish front_uploaded from back_uploaded (both are 'processing').
 */
export async function getConversionFunnel(
  period?: PeriodFilter,
  developerId?: string,
): Promise<FunnelStep[]> {
  const p = period || getDefaultPeriod();

  // Query verification_contexts to inspect actual session state
  let reqQuery = supabase
    .from('verification_requests')
    .select('id')
    .gte('created_at', p.start_date)
    .lte('created_at', p.end_date)
    .limit(ANALYTICS_ROW_LIMIT);

  if (developerId) {
    reqQuery = reqQuery.eq('developer_id', developerId);
  }

  const { data: requests, error: reqError } = await reqQuery;
  if (reqError || !requests) return [];

  const total = requests.length;
  if (total === 0) return [];

  const ids = requests.map((r: any) => r.id);

  // Fetch session contexts for these verifications (batched to avoid URL limits)
  const contexts = await batchedIn<any>(
    'verification_contexts',
    'verification_id, context',
    'verification_id',
    ids,
  );

  if (contexts.length === 0) return [];

  // Parse each context and determine which funnel stages were reached
  const stageCounts = {
    initialized: total, // all requests reached this stage
    front_uploaded: 0,
    back_uploaded: 0,
    live_captured: 0,
    completed: 0,
  };

  for (const row of contexts) {
    const ctx = typeof (row as any).context === 'string'
      ? JSON.parse((row as any).context)
      : (row as any).context;

    if (ctx?.front_extraction) stageCounts.front_uploaded++;
    if (ctx?.back_extraction) stageCounts.back_uploaded++;
    if (ctx?.face_match || ctx?.live_capture) stageCounts.live_captured++;
    // `current_step` in verification_contexts is the internal session
    // state string (e.g. 'COMPLETE'), NOT the numeric step index used
    // in HTTP responses. Only sessions that reached COMPLETE count as
    // completed; HARD_REJECTED sessions did not finish the pipeline.
    if (ctx?.current_step === VerificationStatus.COMPLETE) {
      stageCounts.completed++;
    }
  }

  return Object.entries(stageCounts).map(([step, count]) => ({
    step,
    count,
    percentage: Math.round((count / total) * 100),
  }));
}

/**
 * Get rejection breakdown by reason.
 * When developerId is provided, only considers verifications owned by that developer.
 */
export async function getGateRejectionBreakdown(
  period?: PeriodFilter,
  developerId?: string,
): Promise<RejectionBreakdown[]> {
  const p = period || getDefaultPeriod();

  if (developerId) {
    // Scope to developer's verifications first
    const { data: requests, error: reqError } = await supabase
      .from('verification_requests')
      .select('id')
      .eq('developer_id', developerId)
      .gte('created_at', p.start_date)
      .lte('created_at', p.end_date)
      .limit(ANALYTICS_ROW_LIMIT);

    if (reqError || !requests || requests.length === 0) return [];

    const ids = requests.map((r: any) => r.id);

    const data = await batchedIn<any>(
      'verification_contexts',
      'context',
      'verification_id',
      ids,
    );

    return parseRejections(data);
  }

  // Global (admin) path — no developer filter
  const { data, error } = await supabase
    .from('verification_contexts')
    .select('context')
    .gte('updated_at', p.start_date)
    .lte('updated_at', p.end_date)
    .limit(ANALYTICS_ROW_LIMIT);

  if (error || !data) return [];

  return parseRejections(data);
}

function parseRejections(data: any[]): RejectionBreakdown[] {
  const rejectionCounts: Record<string, number> = {};
  let totalRejections = 0;

  for (const row of data) {
    const context = typeof (row as any).context === 'string'
      ? JSON.parse((row as any).context)
      : (row as any).context;

    if (context?.rejection_reason) {
      rejectionCounts[context.rejection_reason] = (rejectionCounts[context.rejection_reason] || 0) + 1;
      totalRejections++;
    }
  }

  if (totalRejections === 0) return [];

  return Object.entries(rejectionCounts)
    .map(([reason, count]) => ({
      reason,
      count,
      percentage: Math.round((count / totalRejections) * 100),
    }))
    .sort((a, b) => b.count - a.count);
}

/**
 * Get fraud pattern indicators.
 */
export async function getFraudPatterns(
  period?: PeriodFilter,
): Promise<FraudPattern[]> {
  const p = period || getDefaultPeriod();
  const patterns: FraudPattern[] = [];

  // Pattern 1: Repeated failures (same user_id with multiple failed verifications)
  const { data: failedData } = await supabase
    .from('verification_requests')
    .select('user_id')
    .eq('status', 'failed')
    .gte('created_at', p.start_date)
    .lte('created_at', p.end_date);

  if (failedData) {
    const userFailCounts: Record<string, number> = {};
    for (const row of failedData) {
      const uid = (row as any).user_id;
      if (uid) userFailCounts[uid] = (userFailCounts[uid] || 0) + 1;
    }
    const repeatFailers = Object.values(userFailCounts).filter(c => c >= 3).length;
    if (repeatFailers > 0) {
      patterns.push({
        pattern: 'repeated_failures',
        count: repeatFailers,
        detail: `${repeatFailers} user(s) with 3+ failed verification attempts`,
      });
    }
  }

  // Pattern 2: High volume in short period (velocity).
  // Intentionally uses a fixed 1-hour window regardless of the period parameter.
  // Velocity anomalies are always about "right now" — a 30-day window would
  // dilute burst detection and miss real-time bot activity.
  const { count: recentCount } = await supabase
    .from('verification_requests')
    .select('*', { count: 'exact', head: true })
    .gte('created_at', new Date(Date.now() - 3600000).toISOString());

  if (recentCount && recentCount > 100) {
    patterns.push({
      pattern: 'high_velocity',
      count: recentCount,
      detail: `${recentCount} verifications in the last hour`,
    });
  }

  return patterns;
}

/**
 * Get risk score distribution across verifications.
 */
export async function getRiskDistribution(
  period?: PeriodFilter,
): Promise<{ level: string; count: number; percentage: number }[]> {
  const p = period || getDefaultPeriod();

  const { data, error } = await supabase
    .from('verification_risk_scores')
    .select('risk_level')
    .gte('computed_at', p.start_date)
    .lte('computed_at', p.end_date);

  if (error || !data || data.length === 0) return [];

  const counts: Record<string, number> = { low: 0, medium: 0, high: 0, critical: 0 };
  for (const row of data) {
    const level = (row as any).risk_level || 'unknown';
    counts[level] = (counts[level] || 0) + 1;
  }

  const total = data.length;
  return Object.entries(counts)
    .filter(([, count]) => count > 0)
    .map(([level, count]) => ({
      level,
      count,
      percentage: Math.round((count / total) * 100),
    }));
}

// ─── Developer Analytics ─────────────────────────────────────

export interface DailyVolume {
  date: string;
  total: number;
  verified: number;
  failed: number;
  success_rate: number;
}

export interface DailyLatency {
  date: string;
  p50: number;
  p95: number;
}

export interface DailyWebhooks {
  date: string;
  delivered: number;
  failed: number;
}

/**
 * Daily verification volume bucketed by date.
 */
export async function getDailyVerificationVolume(
  period?: PeriodFilter,
  developerId?: string,
): Promise<DailyVolume[]> {
  const p = period || getDefaultPeriod();

  let query = supabase
    .from('verification_requests')
    .select('created_at, status')
    .gte('created_at', p.start_date)
    .lte('created_at', p.end_date)
    .limit(ANALYTICS_ROW_LIMIT);

  if (developerId) {
    query = query.eq('developer_id', developerId);
  }

  const { data, error } = await query;
  if (error || !data) return [];

  const buckets: Record<string, { total: number; verified: number; failed: number }> = {};

  for (const row of data) {
    const date = (row as any).created_at?.slice(0, 10);
    if (!date) continue;
    if (!buckets[date]) buckets[date] = { total: 0, verified: 0, failed: 0 };
    buckets[date].total++;
    if ((row as any).status === 'verified') buckets[date].verified++;
    if ((row as any).status === 'failed') buckets[date].failed++;
  }

  return Object.entries(buckets)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, b]) => ({
      date,
      total: b.total,
      verified: b.verified,
      failed: b.failed,
      success_rate: b.total > 0 ? Math.round((b.verified / b.total) * 1000) / 10 : 0,
    }));
}

/**
 * Daily P50/P95 API response times from api_activity_logs.
 */
export async function getDailyResponseTimes(
  period?: PeriodFilter,
  developerId?: string,
): Promise<DailyLatency[]> {
  const p = period || getDefaultPeriod();

  let query = supabase
    .from('api_activity_logs')
    .select('timestamp, response_time_ms')
    .gte('timestamp', p.start_date)
    .lte('timestamp', p.end_date)
    .limit(ANALYTICS_ROW_LIMIT);

  if (developerId) {
    query = query.eq('developer_id', developerId);
  }

  const { data, error } = await query;
  if (error || !data) return [];

  const buckets: Record<string, number[]> = {};

  for (const row of data) {
    const date = (row as any).timestamp?.slice(0, 10);
    if (!date) continue;
    if (!buckets[date]) buckets[date] = [];
    buckets[date].push((row as any).response_time_ms);
  }

  return Object.entries(buckets)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, times]) => {
      times.sort((a, b) => a - b);
      const p50Idx = Math.max(Math.ceil(times.length * 0.5) - 1, 0);
      const p95Idx = Math.max(Math.ceil(times.length * 0.95) - 1, 0);
      return {
        date,
        p50: times[p50Idx] ?? 0,
        p95: times[p95Idx] ?? 0,
      };
    });
}

/**
 * Daily webhook delivery counts (delivered vs failed).
 */
export async function getDailyWebhookDeliveries(
  period?: PeriodFilter,
  developerId?: string,
): Promise<DailyWebhooks[]> {
  if (!developerId) return [];

  const p = period || getDefaultPeriod();

  // Get developer's webhook IDs
  const { data: webhooks, error: whError } = await supabase
    .from('webhooks')
    .select('id')
    .eq('developer_id', developerId);

  if (whError || !webhooks || webhooks.length === 0) return [];

  const webhookIds = webhooks.map((w: any) => w.id);

  const { data, error } = await supabase
    .from('webhook_deliveries')
    .select('created_at, status')
    .in('webhook_id', webhookIds)
    .gte('created_at', p.start_date)
    .lte('created_at', p.end_date)
    .limit(ANALYTICS_ROW_LIMIT);

  if (error || !data) return [];

  const buckets: Record<string, { delivered: number; failed: number }> = {};

  for (const row of data) {
    const date = (row as any).created_at?.slice(0, 10);
    if (!date) continue;
    if (!buckets[date]) buckets[date] = { delivered: 0, failed: 0 };
    if ((row as any).status === 'delivered') buckets[date].delivered++;
    else if ((row as any).status === 'failed') buckets[date].failed++;
  }

  return Object.entries(buckets)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, b]) => ({
      date,
      delivered: b.delivered,
      failed: b.failed,
    }));
}
