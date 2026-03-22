export const theme = {
  bg: '#080c14',
  surface: '#0b0f19',
  border: 'rgba(255,255,255,0.07)',
  borderHover: 'rgba(255,255,255,0.12)',
  text: '#e2e8f0',
  muted: '#64748b',
  mutedDark: '#475569',
  cyan: '#22d3ee',
  green: '#34d399',
  yellow: '#fbbf24',
  red: '#f87171',
  sans: '"DM Sans", system-ui, sans-serif',
  mono: '"IBM Plex Mono", monospace',
} as const;

export const statusColors = {
  operational: { dot: '#34d399', text: '#34d399', bg: 'rgba(52,211,153,0.06)', border: 'rgba(52,211,153,0.18)' },
  degraded: { dot: '#fbbf24', text: '#fbbf24', bg: 'rgba(251,191,36,0.06)', border: 'rgba(251,191,36,0.18)' },
  down: { dot: '#f87171', text: '#f87171', bg: 'rgba(248,113,113,0.06)', border: 'rgba(248,113,113,0.18)' },
  'no-data': { dot: '#374151', text: '#475569', bg: 'transparent', border: 'transparent' },
} as const;

export const severityColors = {
  minor: { text: '#fbbf24', bg: 'rgba(251,191,36,0.1)' },
  major: { text: '#fb923c', bg: 'rgba(251,146,60,0.1)' },
  critical: { text: '#f87171', bg: 'rgba(248,113,113,0.1)' },
} as const;

export const bannerLabels: Record<string, string> = {
  operational: 'All Systems Operational',
  degraded: 'Experiencing Issues',
  down: 'Major Outage',
};
