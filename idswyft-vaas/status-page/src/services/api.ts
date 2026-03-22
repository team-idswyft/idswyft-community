const API_BASE = import.meta.env.VITE_STATUS_API_URL || 'http://localhost:3003';

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  if (!json.success) throw new Error(json.error?.message || 'API error');
  return json.data;
}

export interface ServiceStatus {
  id: string;
  name: string;
  status: 'operational' | 'degraded' | 'down';
  latency_ms: number;
}

export interface StatusResponse {
  overall: 'operational' | 'degraded' | 'down';
  services: ServiceStatus[];
  checked_at: string;
}

export interface DailySummary {
  day: string;
  service: string;
  total: number;
  operational: number;
  degraded: number;
  down_count: number;
}

export interface Incident {
  id: string;
  title: string;
  status: 'investigating' | 'identified' | 'monitoring' | 'resolved';
  severity: 'minor' | 'major' | 'critical';
  affected_services: string[];
  created_at: string;
  resolved_at: string | null;
  updates?: IncidentUpdate[];
}

export interface IncidentUpdate {
  id: string;
  message: string;
  status: string | null;
  created_at: string;
}

export const statusApi = {
  getStatus: () => fetchJson<StatusResponse>('/api/status'),
  getHistory: (days = 30) => fetchJson<DailySummary[]>(`/api/status/history?days=${days}`),
  getIncidents: () => fetchJson<Incident[]>('/api/incidents'),
  getIncident: (id: string) => fetchJson<Incident & { updates: IncidentUpdate[] }>(`/api/incidents/${id}`),
};
