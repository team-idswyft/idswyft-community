/**
 * Velocity Analysis Service
 *
 * Detects fraud patterns by analyzing verification frequency and timing:
 * - IP velocity: Too many verifications from the same IP in a time window
 * - User velocity: Too many verifications from the same user in 24 hours
 * - Step timing: Suspiciously fast step completion (bot detection)
 *
 * Results feed into risk scoring as a weighted signal (0.08).
 * High-velocity sessions route to manual_review, never hard-reject.
 */

import { supabase } from '@/config/database.js';
import { logger } from '@/utils/logger.js';
import type { VelocityAnalysisResult, VelocityFlag } from '@idswyft/shared';

// ── Thresholds (deterministic, not configurable at runtime) ──────────
const THRESHOLDS = {
  /** Max verifications from same IP in 1 hour before flagging */
  IP_1H_MAX: 5,
  /** Max verifications from same IP in 24 hours before flagging */
  IP_24H_MAX: 10,
  /** Max verifications from same user in 24 hours before flagging */
  USER_24H_MAX: 3,
  /** Minimum step duration in ms — anything faster is bot-like */
  MIN_STEP_DURATION_MS: 2000,
} as const;

// ── Flag scores (highest wins — not cumulative) ─────────────────────
const FLAG_SCORES: Record<VelocityFlag, number> = {
  bot_like_timing: 80,
  rapid_ip_reuse: 70,
  burst_activity: 50,
  high_user_frequency: 40,
};

/**
 * Analyze velocity signals for a verification session.
 *
 * Queries recent verification history and step timing to detect
 * fraud patterns. Returns a score (0-100) and list of flags.
 *
 * @param developerId - Developer who owns this verification
 * @param userId - End-user being verified
 * @param clientIp - IP address captured at initialization
 * @param verificationId - Current verification (excluded from counts)
 * @param stepTimestamps - JSONB of step completion times
 */
export async function analyzeVelocity(
  developerId: string,
  userId: string | null,
  clientIp: string | null,
  verificationId: string,
  stepTimestamps?: Record<string, string> | null,
): Promise<VelocityAnalysisResult> {
  const flags: VelocityFlag[] = [];
  let ipCount1h = 0;
  let ipCount24h = 0;
  let userCount24h = 0;

  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
  const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

  // ── IP velocity queries ──────────────────────────────────────────
  if (clientIp) {
    try {
      // Same IP in last 1 hour (excluding current verification and sandbox)
      const { count: count1h } = await supabase
        .from('verification_requests')
        .select('id', { count: 'exact', head: true })
        .eq('client_ip', clientIp)
        .eq('developer_id', developerId)
        .eq('is_sandbox', false)
        .neq('id', verificationId)
        .gte('created_at', oneHourAgo);

      ipCount1h = count1h ?? 0;

      // Same IP in last 24 hours
      const { count: count24h } = await supabase
        .from('verification_requests')
        .select('id', { count: 'exact', head: true })
        .eq('client_ip', clientIp)
        .eq('developer_id', developerId)
        .eq('is_sandbox', false)
        .neq('id', verificationId)
        .gte('created_at', twentyFourHoursAgo);

      ipCount24h = count24h ?? 0;
    } catch (err) {
      logger.warn('Velocity: IP query failed', { verificationId, error: err instanceof Error ? err.message : 'Unknown' });
    }
  }

  // ── User velocity query ──────────────────────────────────────────
  if (userId) {
    try {
      const { count } = await supabase
        .from('verification_requests')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('developer_id', developerId)
        .eq('is_sandbox', false)
        .neq('id', verificationId)
        .gte('created_at', twentyFourHoursAgo);

      userCount24h = count ?? 0;
    } catch (err) {
      logger.warn('Velocity: user query failed', { verificationId, error: err instanceof Error ? err.message : 'Unknown' });
    }
  }

  // ── Step timing analysis ─────────────────────────────────────────
  let avgStepDurationMs: number | null = null;
  let fastestStepMs: number | null = null;

  if (stepTimestamps && Object.keys(stepTimestamps).length >= 2) {
    const times = Object.values(stepTimestamps)
      .map(t => new Date(t).getTime())
      .filter(t => !isNaN(t))
      .sort((a, b) => a - b);

    if (times.length >= 2) {
      const durations: number[] = [];
      for (let i = 1; i < times.length; i++) {
        durations.push(times[i] - times[i - 1]);
      }
      avgStepDurationMs = Math.round(durations.reduce((a, b) => a + b, 0) / durations.length);
      fastestStepMs = Math.min(...durations);
    }
  }

  // ── Flag evaluation ──────────────────────────────────────────────
  if (ipCount1h > THRESHOLDS.IP_1H_MAX) {
    flags.push('rapid_ip_reuse');
  }
  if (ipCount24h > THRESHOLDS.IP_24H_MAX) {
    flags.push('burst_activity');
  }
  if (userCount24h > THRESHOLDS.USER_24H_MAX) {
    flags.push('high_user_frequency');
  }
  if (fastestStepMs != null && fastestStepMs < THRESHOLDS.MIN_STEP_DURATION_MS) {
    flags.push('bot_like_timing');
  }

  // Score = highest individual flag score (not cumulative)
  const score = flags.length > 0
    ? Math.max(...flags.map(f => FLAG_SCORES[f]))
    : 0;

  return {
    ip_verifications_1h: ipCount1h,
    ip_verifications_24h: ipCount24h,
    user_verifications_24h: userCount24h,
    avg_step_duration_ms: avgStepDurationMs,
    fastest_step_ms: fastestStepMs,
    flags,
    score,
  };
}
