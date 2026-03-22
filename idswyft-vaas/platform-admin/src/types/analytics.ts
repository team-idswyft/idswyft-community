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
