import { useState, useRef } from 'react';

// ── Types ────────────────────────────────────────────────────────────────────

export type DayStatus = 'operational' | 'degraded' | 'down' | 'no-data';

export interface UptimeDayData {
  day: string;       // ISO date string (YYYY-MM-DD)
  status: DayStatus;
}

interface Props {
  data: UptimeDayData[];
  /** Label above the bar (e.g. "Overall Uptime" or a service name) */
  label?: string;
}

// ── Status colors ────────────────────────────────────────────────────────────

const BAR_COLOR: Record<DayStatus, string> = {
  operational: '#34d399',
  degraded:    '#fbbf24',
  down:        '#f87171',
  'no-data':   '#374151',
};

const STATUS_LABEL: Record<DayStatus, string> = {
  operational: 'Operational',
  degraded:    'Degraded',
  down:        'Outage',
  'no-data':   'No data',
};

// ── Component ────────────────────────────────────────────────────────────────

export function UptimeBar({ data, label }: Props) {
  const [tooltip, setTooltip] = useState<{ x: number; y: number; day: string; status: DayStatus } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleMouseEnter = (e: React.MouseEvent, day: string, status: DayStatus) => {
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    setTooltip({
      x: rect.left + rect.width / 2,
      y: rect.top - 8,
      day,
      status,
    });
  };

  const handleMouseLeave = () => setTooltip(null);

  // Format date for tooltip: "Mar 17, 2026"
  const formatDate = (iso: string) => {
    const d = new Date(iso + 'T00:00:00');
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      {label && (
        <div style={{
          fontSize: 12,
          fontWeight: 500,
          color: '#94a3b8',
          marginBottom: 8,
          fontFamily: '"IBM Plex Mono", monospace',
        }}>
          {label}
        </div>
      )}

      {/* Bar grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${data.length}, 1fr)`,
        gap: 2,
        height: 32,
      }}>
        {data.map((d, i) => (
          <div
            key={d.day || i}
            style={{
              backgroundColor: BAR_COLOR[d.status],
              borderRadius: 2,
              cursor: 'pointer',
              transition: 'opacity 0.15s',
              opacity: tooltip && tooltip.day !== d.day ? 0.5 : 1,
            }}
            onMouseEnter={(e) => handleMouseEnter(e, d.day, d.status)}
            onMouseLeave={handleMouseLeave}
          />
        ))}
      </div>

      {/* Range labels */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        marginTop: 6,
        fontSize: 11,
        color: '#475569',
        fontFamily: '"IBM Plex Mono", monospace',
      }}>
        <span>{data.length} days ago</span>
        <span>Today</span>
      </div>

      {/* Tooltip (fixed position to avoid clipping) */}
      {tooltip && (
        <div style={{
          position: 'fixed',
          left: tooltip.x,
          top: tooltip.y,
          transform: 'translate(-50%, -100%)',
          background: '#1e293b',
          border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 8,
          padding: '8px 12px',
          zIndex: 9999,
          pointerEvents: 'none',
          whiteSpace: 'nowrap',
          boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
        }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#e2e8f0', marginBottom: 2 }}>
            {formatDate(tooltip.day)}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              backgroundColor: BAR_COLOR[tooltip.status],
              flexShrink: 0,
            }} />
            <span style={{ fontSize: 11, color: BAR_COLOR[tooltip.status], fontWeight: 500 }}>
              {STATUS_LABEL[tooltip.status]}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
