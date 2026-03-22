import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import DarkTooltip from './DarkTooltip';
import { cardSurface, sectionLabel } from '../../styles/tokens';
import type { TrendPoint } from '../../types/analytics';

interface VerificationTrendChartProps {
  data: TrendPoint[];
  days: number;
  loading?: boolean;
  onDaysChange: (days: number) => void;
}

const STATUS_COLORS = {
  verified: '#34d399',      // emerald-400
  failed: '#fb7185',        // rose-400
  manual_review: '#fbbf24', // amber-400
  pending: '#94a3b8',       // slate-400
};

const DAY_OPTIONS = [7, 30, 90] as const;

export default function VerificationTrendChart({ data, days, loading, onDaysChange }: VerificationTrendChartProps) {
  return (
    <div className={`${cardSurface} p-5 relative`}>
      {loading && (
        <div className="absolute inset-0 bg-slate-900/50 rounded-xl z-10 flex items-center justify-center">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-cyan-400" />
        </div>
      )}
      <div className="flex items-center justify-between mb-4">
        <p className={sectionLabel}>Verification Volume</p>
        <div className="flex gap-1">
          {DAY_OPTIONS.map((d) => (
            <button
              key={d}
              onClick={() => onDaysChange(d)}
              className={`px-2.5 py-1 rounded font-mono text-[0.65rem] transition-colors ${
                days === d
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                  : 'text-slate-500 hover:text-slate-300 border border-transparent'
              }`}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      <div className="h-[280px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
            <defs>
              {Object.entries(STATUS_COLORS).map(([key, color]) => (
                <linearGradient key={key} id={`grad-${key}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={color} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={color} stopOpacity={0.02} />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis
              dataKey="day"
              tick={{ fill: '#64748b', fontSize: 10, fontFamily: 'IBM Plex Mono, monospace' }}
              tickFormatter={(v: string) => {
                const d = new Date(v);
                return `${d.getMonth() + 1}/${d.getDate()}`;
              }}
              axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: '#64748b', fontSize: 10, fontFamily: 'IBM Plex Mono, monospace' }}
              axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
              tickLine={false}
              allowDecimals={false}
            />
            <Tooltip content={<DarkTooltip />} />
            <Legend
              wrapperStyle={{ fontSize: 11, fontFamily: 'IBM Plex Mono, monospace' }}
              iconType="circle"
              iconSize={8}
            />
            <Area
              type="monotone"
              dataKey="verified"
              stackId="1"
              stroke={STATUS_COLORS.verified}
              fill={`url(#grad-verified)`}
              strokeWidth={1.5}
              name="Verified"
            />
            <Area
              type="monotone"
              dataKey="failed"
              stackId="1"
              stroke={STATUS_COLORS.failed}
              fill={`url(#grad-failed)`}
              strokeWidth={1.5}
              name="Failed"
            />
            <Area
              type="monotone"
              dataKey="manual_review"
              stackId="1"
              stroke={STATUS_COLORS.manual_review}
              fill={`url(#grad-manual_review)`}
              strokeWidth={1.5}
              name="Manual Review"
            />
            <Area
              type="monotone"
              dataKey="pending"
              stackId="1"
              stroke={STATUS_COLORS.pending}
              fill={`url(#grad-pending)`}
              strokeWidth={1.5}
              name="Pending"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
