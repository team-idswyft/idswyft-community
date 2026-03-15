/**
 * Analytics Service
 *
 * Provides verification funnel, rejection breakdown, fraud patterns,
 * and processing time analytics.
 */

import { supabase } from '@/config/database.js';

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

function getDefaultPeriod(): PeriodFilter {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 30); // Last 30 days
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
    .lte('created_at', p.end_date);

  if (developerId) {
    reqQuery = reqQuery.eq('developer_id', developerId);
  }

  const { data: requests, error: reqError } = await reqQuery;
  if (reqError || !requests) return [];

  const total = requests.length;
  if (total === 0) return [];

  const ids = requests.map((r: any) => r.id);

  // Fetch session contexts for these verifications
  const { data: contexts, error: ctxError } = await supabase
    .from('verification_contexts')
    .select('verification_id, context')
    .in('verification_id', ids);

  if (ctxError || !contexts) return [];

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
    if (ctx?.current_step === 5 /* COMPLETE */ || ctx?.current_step === 6 /* HARD_REJECTED but completed pipeline */) {
      // Only count truly completed verifications (verified or manual_review)
      if (ctx?.current_step === 5) stageCounts.completed++;
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
 */
export async function getGateRejectionBreakdown(
  period?: PeriodFilter,
): Promise<RejectionBreakdown[]> {
  const p = period || getDefaultPeriod();

  const { data, error } = await supabase
    .from('verification_contexts')
    .select('context')
    .gte('updated_at', p.start_date)
    .lte('updated_at', p.end_date);

  if (error || !data) return [];

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
