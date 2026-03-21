/**
 * Platform Analytics Service
 *
 * Provides cross-org analytics for the platform admin dashboard:
 * summary stats, verification trends, org health, and webhook delivery health.
 * All queries use the Supabase JS client with JS-side aggregation (same pattern
 * as platformProviderMetrics.ts).
 */

import { vaasSupabase } from '../config/database.js';

// Supabase JS returns max 1,000 rows by default. Analytics queries need all
// rows for accurate aggregation, so we set an explicit high limit and warn
// operators if the result set hits it (indicating potential truncation).
const QUERY_ROW_LIMIT = 10_000;

function warnIfTruncated(label: string, count: number): void {
  if (count >= QUERY_ROW_LIMIT) {
    console.warn(`[Analytics] ${label} returned ${count} rows (limit ${QUERY_ROW_LIMIT}) — results may be truncated`);
  }
}

// ── Types ────────────────────────────────────────────────────────────────────

export interface SummaryStats {
  total_verifications: number;
  success_rate: number;
  active_organizations: number;
  unread_alerts: number;
  prev_total_verifications: number;
  prev_success_rate: number;
}

export interface TrendPoint {
  day: string;
  verified: number;
  failed: number;
  manual_review: number;
  pending: number;
  total: number;
}

export interface OrgHealthRow {
  org_id: string;
  org_name: string;
  slug: string;
  subscription_tier: string;
  billing_status: string;
  verification_count: number;
  success_rate: number;
  webhook_total: number;
  webhook_success_rate: number;
}

export interface WebhookHealthRow {
  org_id: string;
  org_name: string;
  delivered: number;
  failed: number;
  total: number;
  failure_rate: number;
}

// ── Service ──────────────────────────────────────────────────────────────────

export class PlatformAnalyticsService {
  private static instance: PlatformAnalyticsService;

  static getInstance(): PlatformAnalyticsService {
    if (!PlatformAnalyticsService.instance) {
      PlatformAnalyticsService.instance = new PlatformAnalyticsService();
    }
    return PlatformAnalyticsService.instance;
  }

  /**
   * Summary stats for the dashboard stat cards.
   * Computes current-period and previous-period (30 days each) in parallel.
   */
  async getSummaryStats(): Promise<SummaryStats> {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 86_400_000).toISOString();
    const sixtyDaysAgo = new Date(now.getTime() - 60 * 86_400_000).toISOString();

    const [
      currentSessions,
      prevSessions,
      activeOrgs,
      unreadAlerts,
    ] = await Promise.all([
      // Current 30-day sessions
      vaasSupabase
        .from('vaas_verification_sessions')
        .select('status')
        .gte('created_at', thirtyDaysAgo)
        .limit(QUERY_ROW_LIMIT),

      // Previous 30-day sessions (for delta comparison)
      vaasSupabase
        .from('vaas_verification_sessions')
        .select('status')
        .gte('created_at', sixtyDaysAgo)
        .lt('created_at', thirtyDaysAgo)
        .limit(QUERY_ROW_LIMIT),

      // Active organizations
      vaasSupabase
        .from('vaas_organizations')
        .select('id', { count: 'exact', head: true })
        .eq('billing_status', 'active'),

      // Unread platform notifications
      vaasSupabase
        .from('platform_notifications')
        .select('id', { count: 'exact', head: true })
        .eq('read', false),
    ]);

    if (currentSessions.error) console.error('[Analytics] getSummaryStats currentSessions error:', currentSessions.error.message);
    if (prevSessions.error) console.error('[Analytics] getSummaryStats prevSessions error:', prevSessions.error.message);
    if (activeOrgs.error) console.error('[Analytics] getSummaryStats activeOrgs error:', activeOrgs.error.message);
    if (unreadAlerts.error) console.error('[Analytics] getSummaryStats unreadAlerts error:', unreadAlerts.error.message);

    const currentData = currentSessions.data || [];
    const prevData = prevSessions.data || [];
    warnIfTruncated('getSummaryStats/current', currentData.length);
    warnIfTruncated('getSummaryStats/prev', prevData.length);

    const totalVerifications = currentData.length;
    const verifiedCount = currentData.filter(s => s.status === 'verified').length;
    const successRate = totalVerifications > 0
      ? Math.round((verifiedCount / totalVerifications) * 10000) / 100
      : 0;

    const prevTotal = prevData.length;
    const prevVerified = prevData.filter(s => s.status === 'verified').length;
    const prevSuccessRate = prevTotal > 0
      ? Math.round((prevVerified / prevTotal) * 10000) / 100
      : 0;

    return {
      total_verifications: totalVerifications,
      success_rate: successRate,
      active_organizations: activeOrgs.count ?? 0,
      unread_alerts: unreadAlerts.count ?? 0,
      prev_total_verifications: prevTotal,
      prev_success_rate: prevSuccessRate,
    };
  }

  /**
   * Daily verification trend bucketed by status.
   * Pads missing days with zeroes for a continuous line chart.
   */
  async getVerificationTrend(days: number = 30, orgId?: string): Promise<TrendPoint[]> {
    const since = new Date(Date.now() - days * 86_400_000).toISOString();

    let query = vaasSupabase
      .from('vaas_verification_sessions')
      .select('status, created_at')
      .gte('created_at', since)
      .limit(QUERY_ROW_LIMIT);

    if (orgId) {
      query = query.eq('organization_id', orgId);
    }

    const { data: sessions, error } = await query;

    if (error) {
      console.error('[Analytics] getVerificationTrend error:', error.message);
      return [];
    }
    warnIfTruncated('getVerificationTrend', (sessions || []).length);

    // Bucket by day
    const buckets = new Map<string, { verified: number; failed: number; manual_review: number; pending: number }>();

    for (const s of sessions || []) {
      const day = s.created_at.substring(0, 10); // YYYY-MM-DD
      if (!buckets.has(day)) {
        buckets.set(day, { verified: 0, failed: 0, manual_review: 0, pending: 0 });
      }
      const bucket = buckets.get(day)!;
      const status = s.status as keyof typeof bucket;
      if (status in bucket) {
        bucket[status]++;
      }
    }

    // Pad missing days
    const result: TrendPoint[] = [];
    const startDate = new Date(Date.now() - days * 86_400_000);
    for (let i = 0; i <= days; i++) {
      const d = new Date(startDate.getTime() + i * 86_400_000);
      const day = d.toISOString().substring(0, 10);
      const b = buckets.get(day) || { verified: 0, failed: 0, manual_review: 0, pending: 0 };
      result.push({
        day,
        ...b,
        total: b.verified + b.failed + b.manual_review + b.pending,
      });
    }

    return result;
  }

  /**
   * Org health: top orgs by verification volume with success rate and webhook health.
   */
  async getOrgHealth(limit: number = 10): Promise<OrgHealthRow[]> {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000).toISOString();
    const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();

    const [orgsResult, sessionsResult, deliveriesResult] = await Promise.all([
      // All orgs
      vaasSupabase
        .from('vaas_organizations')
        .select('id, name, slug, subscription_tier, billing_status'),

      // Sessions in last 30 days
      vaasSupabase
        .from('vaas_verification_sessions')
        .select('organization_id, status')
        .gte('created_at', thirtyDaysAgo)
        .limit(QUERY_ROW_LIMIT),

      // Webhook deliveries in last 7 days
      vaasSupabase
        .from('vaas_webhook_deliveries')
        .select('organization_id, status')
        .gte('created_at', sevenDaysAgo)
        .limit(QUERY_ROW_LIMIT),
    ]);

    if (orgsResult.error) console.error('[Analytics] getOrgHealth orgs error:', orgsResult.error.message);
    if (sessionsResult.error) console.error('[Analytics] getOrgHealth sessions error:', sessionsResult.error.message);
    if (deliveriesResult.error) console.error('[Analytics] getOrgHealth deliveries error:', deliveriesResult.error.message);

    const orgs = orgsResult.data || [];
    const sessions = sessionsResult.data || [];
    const deliveries = deliveriesResult.data || [];
    warnIfTruncated('getOrgHealth/sessions', sessions.length);
    warnIfTruncated('getOrgHealth/deliveries', deliveries.length);

    // Aggregate sessions per org
    const sessionsByOrg = new Map<string, { total: number; verified: number }>();
    for (const s of sessions) {
      const entry = sessionsByOrg.get(s.organization_id) || { total: 0, verified: 0 };
      entry.total++;
      if (s.status === 'verified') entry.verified++;
      sessionsByOrg.set(s.organization_id, entry);
    }

    // Aggregate deliveries per org
    const deliveriesByOrg = new Map<string, { total: number; delivered: number }>();
    for (const d of deliveries) {
      const entry = deliveriesByOrg.get(d.organization_id) || { total: 0, delivered: 0 };
      entry.total++;
      if (d.status === 'delivered') entry.delivered++;
      deliveriesByOrg.set(d.organization_id, entry);
    }

    // Build result rows
    const rows: OrgHealthRow[] = orgs.map(org => {
      const sData = sessionsByOrg.get(org.id) || { total: 0, verified: 0 };
      const dData = deliveriesByOrg.get(org.id) || { total: 0, delivered: 0 };

      return {
        org_id: org.id,
        org_name: org.name,
        slug: org.slug,
        subscription_tier: org.subscription_tier,
        billing_status: org.billing_status,
        verification_count: sData.total,
        success_rate: sData.total > 0
          ? Math.round((sData.verified / sData.total) * 10000) / 100
          : 0,
        webhook_total: dData.total,
        webhook_success_rate: dData.total > 0
          ? Math.round((dData.delivered / dData.total) * 10000) / 100
          : 0,
      };
    });

    // Sort by verification volume desc, take top N
    rows.sort((a, b) => b.verification_count - a.verification_count);
    return rows.slice(0, limit);
  }

  /**
   * Webhook delivery health per org over the given period.
   */
  async getWebhookHealth(days: number = 7): Promise<WebhookHealthRow[]> {
    const since = new Date(Date.now() - days * 86_400_000).toISOString();

    const [deliveriesResult, orgsResult] = await Promise.all([
      vaasSupabase
        .from('vaas_webhook_deliveries')
        .select('organization_id, status')
        .gte('created_at', since)
        .limit(QUERY_ROW_LIMIT),

      vaasSupabase
        .from('vaas_organizations')
        .select('id, name'),
    ]);

    if (deliveriesResult.error) console.error('[Analytics] getWebhookHealth deliveries error:', deliveriesResult.error.message);
    if (orgsResult.error) console.error('[Analytics] getWebhookHealth orgs error:', orgsResult.error.message);

    const deliveries = deliveriesResult.data || [];
    warnIfTruncated('getWebhookHealth/deliveries', deliveries.length);
    const orgMap = new Map<string, string>();
    for (const org of orgsResult.data || []) {
      orgMap.set(org.id, org.name);
    }

    // Aggregate per org
    const byOrg = new Map<string, { delivered: number; failed: number }>();
    for (const d of deliveries) {
      const entry = byOrg.get(d.organization_id) || { delivered: 0, failed: 0 };
      if (d.status === 'delivered') {
        entry.delivered++;
      } else {
        entry.failed++;
      }
      byOrg.set(d.organization_id, entry);
    }

    const rows: WebhookHealthRow[] = [];
    for (const [orgId, counts] of byOrg) {
      const total = counts.delivered + counts.failed;
      rows.push({
        org_id: orgId,
        org_name: orgMap.get(orgId) || 'Unknown',
        delivered: counts.delivered,
        failed: counts.failed,
        total,
        failure_rate: total > 0
          ? Math.round((counts.failed / total) * 10000) / 100
          : 0,
      });
    }

    // Sort by total volume desc
    rows.sort((a, b) => b.total - a.total);
    return rows;
  }
}

export const platformAnalyticsService = PlatformAnalyticsService.getInstance();
