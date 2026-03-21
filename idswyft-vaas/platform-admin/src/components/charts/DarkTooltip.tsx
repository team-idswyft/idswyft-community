import type { TooltipProps } from 'recharts';

/**
 * Shared dark-themed tooltip for all recharts charts.
 * Matches the platform-admin glassmorphism aesthetic.
 */
export default function DarkTooltip({ active, payload, label }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null;

  return (
    <div className="bg-slate-800 border border-white/10 rounded-lg px-3 py-2 shadow-xl">
      <p className="font-mono text-[0.65rem] text-slate-400 mb-1">{label}</p>
      {payload.map((entry) => (
        <p
          key={entry.name}
          className="font-mono text-xs"
          style={{ color: entry.color }}
        >
          {entry.name}: {typeof entry.value === 'number' ? entry.value.toLocaleString() : entry.value}
        </p>
      ))}
    </div>
  );
}
