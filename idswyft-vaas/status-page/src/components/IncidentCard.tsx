import { useState } from 'react';
import { theme, severityColors } from '../theme';
import { statusApi } from '../services/api';
import type { Incident, IncidentUpdate } from '../services/api';

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

const statusLabels: Record<string, string> = {
  investigating: 'Investigating',
  identified: 'Identified',
  monitoring: 'Monitoring',
  resolved: 'Resolved',
};

interface Props {
  incident: Incident;
}

export function IncidentCard({ incident }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [updates, setUpdates] = useState<IncidentUpdate[]>([]);
  const [loading, setLoading] = useState(false);
  const sev = severityColors[incident.severity];

  const handleToggle = async () => {
    if (!expanded && updates.length === 0) {
      setLoading(true);
      try {
        const data = await statusApi.getIncident(incident.id);
        setUpdates(data.updates || []);
      } catch {
        /* ignore */
      }
      setLoading(false);
    }
    setExpanded(!expanded);
  };

  return (
    <div style={{
      border: `1px solid ${theme.border}`, borderRadius: 12,
      padding: '16px 20px', background: theme.surface, cursor: 'pointer',
    }} onClick={handleToggle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{
            fontSize: 11, fontWeight: 600, fontFamily: theme.mono,
            padding: '2px 8px', borderRadius: 6,
            color: sev.text, background: sev.bg,
          }}>
            {incident.severity}
          </span>
          <span style={{ fontSize: 14, fontWeight: 600, color: theme.text }}>{incident.title}</span>
        </div>
        <span style={{ fontSize: 12, color: theme.muted, fontFamily: theme.mono }}>
          {relativeTime(incident.created_at)}
        </span>
      </div>
      <div style={{ marginTop: 6, fontSize: 12, color: theme.muted }}>
        {statusLabels[incident.status]} &middot; {incident.affected_services.join(', ')}
      </div>
      {expanded && (
        <div style={{ marginTop: 16, borderTop: `1px solid ${theme.border}`, paddingTop: 12 }}>
          {loading && <div style={{ fontSize: 12, color: theme.muted }}>Loading...</div>}
          {updates.map((u) => (
            <div key={u.id} style={{ marginBottom: 12, paddingLeft: 12, borderLeft: `2px solid ${theme.border}` }}>
              <div style={{ fontSize: 11, color: theme.muted, fontFamily: theme.mono }}>
                {new Date(u.created_at).toLocaleString()}
                {u.status && <span style={{ marginLeft: 8, color: theme.cyan }}>&rarr; {u.status}</span>}
              </div>
              <div style={{ fontSize: 13, color: theme.text, marginTop: 4 }}>{u.message}</div>
            </div>
          ))}
          {!loading && updates.length === 0 && (
            <div style={{ fontSize: 12, color: theme.muted }}>No updates yet</div>
          )}
        </div>
      )}
    </div>
  );
}
