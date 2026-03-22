export interface ServiceCheck {
  id: string;
  service: string;
  status: 'operational' | 'degraded' | 'down';
  latency_ms: number;
  details: string | null;
  checked_at: string;
}

export interface Incident {
  id: string;
  title: string;
  status: 'investigating' | 'identified' | 'monitoring' | 'resolved';
  severity: 'minor' | 'major' | 'critical';
  affected_services: string[];
  created_at: string;
  resolved_at: string | null;
  created_by: string | null;
  updates?: IncidentUpdate[];
}

export interface IncidentUpdate {
  id: string;
  incident_id: string;
  message: string;
  status: string | null;
  created_at: string;
  created_by: string | null;
}

export interface MonitoredService {
  id: string;
  name: string;
  healthUrl: string;
}

export interface DailySummary {
  day: string;
  service: string;
  total: number;
  operational: number;
  degraded: number;
  down_count: number;
}

export type OverallStatus = 'operational' | 'degraded' | 'down';

export interface StatusResponse {
  overall: OverallStatus;
  services: { id: string; name: string; status: OverallStatus; latency_ms: number }[];
  checked_at: string;
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: { code: string; message: string };
}
