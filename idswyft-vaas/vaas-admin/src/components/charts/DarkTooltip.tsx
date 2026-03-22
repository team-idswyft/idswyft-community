interface DarkTooltipProps {
  active?: boolean;
  payload?: Array<{ name?: string; value?: number | string; color?: string }>;
  label?: string | number;
}

export default function DarkTooltip({ active, payload, label }: DarkTooltipProps) {
  if (!active || !payload?.length) return null;

  return (
    <div className="rounded-lg border border-white/10 bg-slate-800 px-3 py-2 shadow-xl">
      <p className="mb-1 text-xs font-medium text-slate-300">{label}</p>
      {payload.map((entry, i) => (
        <p key={i} className="text-xs" style={{ color: entry.color }}>
          {entry.name}: <span className="font-mono font-semibold">{entry.value}</span>
        </p>
      ))}
    </div>
  );
}
