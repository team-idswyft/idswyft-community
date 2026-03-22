import { theme } from '../theme';
import { IncidentCard } from './IncidentCard';
import type { Incident } from '../services/api';

interface Props {
  incidents: Incident[];
}

export function IncidentList({ incidents }: Props) {
  const active = incidents.filter((i) => i.status !== 'resolved');
  const resolved = incidents.filter((i) => i.status === 'resolved');

  return (
    <div>
      {active.length > 0 && (
        <div style={{ marginBottom: 32 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, color: theme.text, marginBottom: 12 }}>
            Active Incidents
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {active.map((inc) => <IncidentCard key={inc.id} incident={inc} />)}
          </div>
        </div>
      )}

      {resolved.length > 0 && (
        <div>
          <h2 style={{ fontSize: 16, fontWeight: 600, color: theme.text, marginBottom: 12 }}>
            Past Incidents
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {resolved.map((inc) => <IncidentCard key={inc.id} incident={inc} />)}
          </div>
        </div>
      )}

      {incidents.length === 0 && (
        <div style={{
          textAlign: 'center', padding: '32px 0',
          fontSize: 14, color: theme.muted,
        }}>
          No incidents reported in the last 90 days
        </div>
      )}
    </div>
  );
}
