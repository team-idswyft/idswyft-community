import { TrendingUp, TrendingDown, type LucideIcon } from 'lucide-react';
import { cardSurface, statNumber, sectionLabel } from '../../styles/tokens';

interface StatCardWithTrendProps {
  label: string;
  value: string | number;
  icon: LucideIcon;
  iconClass: string;
  iconColor: string;
  delta?: number | null;
  deltaLabel?: string;
  invertDelta?: boolean;
  animationDelay?: number;
}

/**
 * Stat card with an optional trend delta arrow.
 * Green up / red down by default; invertDelta flips the semantic
 * (e.g. "failure rate" going up is bad).
 */
export default function StatCardWithTrend({
  label,
  value,
  icon: Icon,
  iconClass,
  iconColor,
  delta,
  deltaLabel,
  invertDelta = false,
  animationDelay = 0,
}: StatCardWithTrendProps) {
  const showDelta = delta != null && delta !== 0;
  const isPositive = invertDelta ? delta! < 0 : delta! > 0;

  return (
    <div
      className={`${cardSurface} p-5 hover-lift animate-slide-in-up`}
      style={{ animationDelay: `${animationDelay}ms` }}
    >
      <div className="flex items-center gap-4">
        <div className={iconClass}>
          <Icon className={`h-5 w-5 ${iconColor}`} />
        </div>
        <div className="min-w-0">
          <div className={statNumber}>
            {typeof value === 'number' ? value.toLocaleString() : value}
          </div>
          <div className={sectionLabel}>{label}</div>
          {showDelta && (
            <div className={`flex items-center gap-1 mt-1 font-mono text-[0.65rem] ${isPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
              {isPositive
                ? <TrendingUp className="h-3 w-3" />
                : <TrendingDown className="h-3 w-3" />}
              <span>
                {delta! > 0 ? '+' : ''}{delta!.toFixed(1)}%
                {deltaLabel ? ` ${deltaLabel}` : ''}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
