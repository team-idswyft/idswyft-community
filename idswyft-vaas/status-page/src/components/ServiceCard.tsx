import { theme, statusColors } from '../theme';
import { UptimeBar } from './UptimeBar';
import type { UptimeDayData } from './UptimeBar';
import type { ServiceStatus } from '../services/api';

interface Props {
  service: ServiceStatus;
  uptimeData: UptimeDayData[];
  uptimePercent: string | null;
}

export function ServiceCard({ service, uptimeData, uptimePercent }: Props) {
  const colors = statusColors[service.status];
  return (
    <div style={{
      border: `1px solid ${theme.border}`, borderRadius: 12,
      padding: 16, background: theme.surface,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: theme.text }}>{service.name}</span>
        <span style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: colors.dot }} />
      </div>
      <UptimeBar data={uptimeData} />
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
        {uptimePercent && (
          <span style={{ fontSize: 12, fontFamily: theme.mono, color: theme.green }}>{uptimePercent}%</span>
        )}
        <span style={{ fontSize: 12, fontFamily: theme.mono, color: theme.muted }}>
          {service.latency_ms > 0 ? `${service.latency_ms}ms` : '\u2014'}
        </span>
      </div>
    </div>
  );
}
