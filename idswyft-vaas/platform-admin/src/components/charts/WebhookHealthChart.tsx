import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  Legend,
} from 'recharts';
import DarkTooltip from './DarkTooltip';
import { cardSurface, sectionLabel } from '../../styles/tokens';

interface WebhookHealthRow {
  org_id: string;
  org_name: string;
  delivered: number;
  failed: number;
  total: number;
  failure_rate: number;
}

interface WebhookHealthChartProps {
  data: WebhookHealthRow[];
}

const COLORS = {
  delivered: '#34d399', // emerald-400
  failed: '#fb7185',   // rose-400
};

const FAILURE_THRESHOLD = 10; // highlight orgs with >10% failure

export default function WebhookHealthChart({ data }: WebhookHealthChartProps) {
  if (data.length === 0) {
    return (
      <div className={`${cardSurface} p-5`}>
        <p className={`${sectionLabel} mb-4`}>Webhook Delivery Health (Last 7 days)</p>
        <div className="flex items-center justify-center h-[200px] text-slate-500 font-mono text-xs">
          No webhook deliveries in this period
        </div>
      </div>
    );
  }

  return (
    <div className={`${cardSurface} p-5`}>
      <p className={`${sectionLabel} mb-4`}>Webhook Delivery Health (Last 7 days)</p>

      <div style={{ height: Math.max(180, data.length * 40 + 40) }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            layout="vertical"
            margin={{ top: 4, right: 20, left: 0, bottom: 0 }}
          >
            <XAxis
              type="number"
              tick={{ fill: '#64748b', fontSize: 10, fontFamily: 'IBM Plex Mono, monospace' }}
              axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
              tickLine={false}
              allowDecimals={false}
            />
            <YAxis
              type="category"
              dataKey="org_name"
              width={120}
              tick={{ fill: '#94a3b8', fontSize: 11, fontFamily: 'IBM Plex Mono, monospace' }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip content={<DarkTooltip />} />
            <Legend
              wrapperStyle={{ fontSize: 11, fontFamily: 'IBM Plex Mono, monospace' }}
              iconType="circle"
              iconSize={8}
            />
            <Bar dataKey="delivered" stackId="a" name="Delivered" fill={COLORS.delivered} radius={[0, 0, 0, 0]}>
              {data.map((entry) => (
                <Cell
                  key={entry.org_id}
                  fill={entry.failure_rate > FAILURE_THRESHOLD ? '#059669' : COLORS.delivered}
                />
              ))}
            </Bar>
            <Bar dataKey="failed" stackId="a" name="Failed" fill={COLORS.failed} radius={[0, 4, 4, 0]}>
              {data.map((entry) => (
                <Cell
                  key={entry.org_id}
                  fill={entry.failure_rate > FAILURE_THRESHOLD ? '#e11d48' : COLORS.failed}
                  opacity={entry.failure_rate > FAILURE_THRESHOLD ? 1 : 0.7}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Highlight warning for high-failure orgs */}
      {data.some(d => d.failure_rate > FAILURE_THRESHOLD) && (
        <p className="mt-3 font-mono text-[0.65rem] text-rose-400/80">
          Orgs with &gt;{FAILURE_THRESHOLD}% failure rate are highlighted with stronger colors
        </p>
      )}
    </div>
  );
}
