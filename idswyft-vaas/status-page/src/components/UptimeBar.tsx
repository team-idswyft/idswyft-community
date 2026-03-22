import { useState } from 'react';
import { statusColors, theme } from '../theme';

export type DayStatus = 'operational' | 'degraded' | 'down' | 'no-data';

export interface UptimeDayData {
  day: string;
  status: DayStatus;
}

const barLabel: Record<DayStatus, string> = {
  operational: 'Operational',
  degraded: 'Degraded',
  down: 'Outage',
  'no-data': 'No data',
};

interface Props {
  data: UptimeDayData[];
}

export function UptimeBar({ data }: Props) {
  const [tooltip, setTooltip] = useState<{ x: number; y: number; day: string; status: DayStatus } | null>(null);

  const handleMouseEnter = (e: React.MouseEvent, day: string, status: DayStatus) => {
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    setTooltip({ x: rect.left + rect.width / 2, y: rect.top - 8, day, status });
  };

  return (
    <div style={{ position: 'relative' }}>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${data.length}, 1fr)`, gap: 2, height: 24 }}>
        {data.map((d, i) => (
          <div
            key={d.day || i}
            style={{
              backgroundColor: statusColors[d.status].dot,
              borderRadius: 2,
              cursor: 'pointer',
              transition: 'opacity 0.15s',
              opacity: tooltip && tooltip.day !== d.day ? 0.5 : 1,
            }}
            onMouseEnter={(e) => handleMouseEnter(e, d.day, d.status)}
            onMouseLeave={() => setTooltip(null)}
          />
        ))}
      </div>
      {tooltip && (
        <div style={{
          position: 'fixed', left: tooltip.x, top: tooltip.y,
          transform: 'translate(-50%, -100%)',
          background: '#1e293b', border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 8, padding: '8px 12px', zIndex: 9999,
          pointerEvents: 'none', whiteSpace: 'nowrap',
          boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
        }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: theme.text, marginBottom: 2 }}>
            {new Date(tooltip.day + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: statusColors[tooltip.status].dot }} />
            <span style={{ fontSize: 11, color: statusColors[tooltip.status].text, fontWeight: 500 }}>
              {barLabel[tooltip.status]}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
