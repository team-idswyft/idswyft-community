import { API_BASE_URL } from '../config/api';

export interface OperatorBlock {
  email: string;
  api_key_id: string;
  key_prefix: string;
  service_label: string;
  service_product: string;
  service_environment: string;
}

export interface DashboardProfile {
  scope?: 'developer' | 'service-operator';
  operator?: OperatorBlock;
  data?: any;
}

export type ProfileResult =
  | { authed: false }
  | { authed: true; isOperator: boolean; operator: OperatorBlock | null; raw: DashboardProfile };

export function deriveIsOperator(profile: DashboardProfile): boolean {
  return !!profile.operator;
}

export async function fetchDashboardProfile(): Promise<ProfileResult> {
  const res = await fetch(`${API_BASE_URL}/api/developer/profile`, { credentials: 'include' });
  if (!res.ok) return { authed: false };
  const raw = (await res.json()) as DashboardProfile;
  const isOperator = deriveIsOperator(raw);
  return { authed: true, isOperator, operator: isOperator ? raw.operator! : null, raw };
}
