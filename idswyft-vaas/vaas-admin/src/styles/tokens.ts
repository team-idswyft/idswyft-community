// ─── Portal design tokens ────────────────────────────────────────────────────
// Single source of truth for the developer-portal aesthetic.
// IBM Plex Mono for headings/labels/data, DM Sans (default sans) for body text.

/** Tiny uppercase monospace label — section headers, table headers */
export const sectionLabel = 'font-mono text-[0.65rem] font-semibold uppercase tracking-[0.08em] text-slate-500';

/** Large monospace number — stat card values */
export const statNumber = 'font-mono text-2xl font-bold';

/** Monospace extra-small — IDs, timestamps, IPs, secondary data */
export const monoXs = 'font-mono text-xs';

/** Monospace small — emails, keys, primary data cells */
export const monoSm = 'font-mono text-sm';

/** Uppercase monospace pill — status badges */
export const statusPill = 'font-mono text-[0.65rem] font-semibold tracking-[0.06em] uppercase px-2 py-0.5 rounded-full border';

/** Glassmorphism card surface */
export const cardSurface = 'bg-slate-900/60 border border-white/10 rounded-xl';

/** Table header cell — matches sectionLabel but with padding */
export const tableHeaderClass = 'px-5 py-3 text-left font-mono text-[0.65rem] font-semibold uppercase tracking-[0.08em] text-slate-500';

/** Detail panel inside modals */
export const infoPanel = 'bg-slate-800/50 rounded-lg p-4 space-y-3';

/** Status-based accent colors (left border + pill styling) */
export const statusAccent: Record<string, { border: string; pill: string }> = {
  // general statuses
  active:     { border: 'border-l-emerald-400', pill: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' },
  inactive:   { border: 'border-l-slate-400',   pill: 'bg-slate-500/15 text-slate-300 border-slate-500/30' },
  pending:    { border: 'border-l-amber-400',   pill: 'bg-amber-500/15 text-amber-300 border-amber-500/30' },
  suspended:  { border: 'border-l-rose-400',    pill: 'bg-rose-500/15 text-rose-300 border-rose-500/30' },
  locked:     { border: 'border-l-orange-400',  pill: 'bg-orange-500/15 text-orange-300 border-orange-500/30' },

  // verification statuses
  verified:       { border: 'border-l-emerald-400', pill: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' },
  failed:         { border: 'border-l-rose-400',    pill: 'bg-rose-500/15 text-rose-300 border-rose-500/30' },
  manual_review:  { border: 'border-l-amber-400',   pill: 'bg-amber-500/15 text-amber-300 border-amber-500/30' },
  expired:        { border: 'border-l-slate-400',   pill: 'bg-slate-500/15 text-slate-300 border-slate-500/30' },

  // webhook / API key statuses
  enabled:   { border: 'border-l-emerald-400', pill: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' },
  disabled:  { border: 'border-l-slate-400',   pill: 'bg-slate-500/15 text-slate-300 border-slate-500/30' },
  revoked:   { border: 'border-l-rose-400',    pill: 'bg-rose-500/15 text-rose-300 border-rose-500/30' },

  // severity / log levels
  info:     { border: 'border-l-sky-400',    pill: 'bg-sky-500/15 text-sky-300 border-sky-500/30' },
  warning:  { border: 'border-l-amber-400',  pill: 'bg-amber-500/15 text-amber-300 border-amber-500/30' },
  error:    { border: 'border-l-rose-400',   pill: 'bg-rose-500/15 text-rose-300 border-rose-500/30' },
  critical: { border: 'border-l-red-400',    pill: 'bg-red-500/15 text-red-300 border-red-500/30' },
  low:      { border: 'border-l-sky-400',    pill: 'bg-sky-500/15 text-sky-300 border-sky-500/30' },
  medium:   { border: 'border-l-amber-400',  pill: 'bg-amber-500/15 text-amber-300 border-amber-500/30' },
  high:     { border: 'border-l-orange-400', pill: 'bg-orange-500/15 text-orange-300 border-orange-500/30' },

  // environments
  sandbox:    { border: 'border-l-amber-400',   pill: 'bg-amber-500/15 text-amber-300 border-amber-500/30' },
  production: { border: 'border-l-emerald-400', pill: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' },
  live:       { border: 'border-l-emerald-400', pill: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' },
  test:       { border: 'border-l-amber-400',   pill: 'bg-amber-500/15 text-amber-300 border-amber-500/30' },

  // billing
  paid:      { border: 'border-l-emerald-400', pill: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' },
  unpaid:    { border: 'border-l-rose-400',    pill: 'bg-rose-500/15 text-rose-300 border-rose-500/30' },
  overdue:   { border: 'border-l-red-400',     pill: 'bg-red-500/15 text-red-300 border-red-500/30' },
  cancelled: { border: 'border-l-slate-400',   pill: 'bg-slate-500/15 text-slate-300 border-slate-500/30' },
  trialing:  { border: 'border-l-sky-400',     pill: 'bg-sky-500/15 text-sky-300 border-sky-500/30' },

  // webhook health
  healthy:   { border: 'border-l-emerald-400', pill: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' },
  degraded:  { border: 'border-l-amber-400',   pill: 'bg-amber-500/15 text-amber-300 border-amber-500/30' },
  unhealthy: { border: 'border-l-rose-400',    pill: 'bg-rose-500/15 text-rose-300 border-rose-500/30' },

  // generic fallback
  success: { border: 'border-l-emerald-400', pill: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' },
  default: { border: 'border-l-slate-400',   pill: 'bg-slate-500/15 text-slate-300 border-slate-500/30' },
};

/** Safe lookup — falls back to `default` accent */
export function getStatusAccent(status: string): { border: string; pill: string } {
  return statusAccent[status?.toLowerCase()] || statusAccent.default;
}
