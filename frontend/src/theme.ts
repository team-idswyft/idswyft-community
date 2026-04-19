// frontend/src/theme.ts — v2 design tokens (technical editorial aesthetic)

// ─── Light mode tokens (default) ───
const light = {
  paper:      '#f7f6f3',
  ink:        '#0b0b0d',
  mid:        '#6b6b70',
  soft:       '#9a9a9f',
  rule:       '#e4e2dc',
  ruleStrong: '#d4d1c8',
  panel:      '#ffffff',
  accent:     '#00d4d4',
  accentInk:  '#007a7a',
  accentSoft: 'rgba(0,240,255,0.08)',
  flag:       'oklch(0.68 0.17 28)',
  flagSoft:   'oklch(0.95 0.04 28)',
} as const;

// ─── Dark mode tokens ───
const dark = {
  paper:      '#0b0b0d',
  ink:        '#f2f1ec',
  mid:        '#8a8a90',
  soft:       '#5a5a60',
  rule:       '#1e1e22',
  ruleStrong: '#2a2a30',
  panel:      '#111114',
  accent:     '#00F0FF',
  accentInk:  '#66f7ff',
  accentSoft: 'rgba(0,240,255,0.1)',
  flag:       'oklch(0.76 0.18 28)',
  flagSoft:   'oklch(0.24 0.06 28)',
} as const;

// ─── Shared (mode-independent) tokens ───
export const C = {
  // Semantic aliases — dark mode defaults (most pages render dark)
  bg:           dark.paper,
  panel:        dark.panel,
  sidebar:      dark.panel,
  surface:      '#141417',
  surfaceHover: '#1a1a1e',
  border:       dark.rule,
  borderStrong: dark.ruleStrong,

  // Accent (green)
  cyan:         dark.accent,       // keep alias for components that reference C.cyan
  cyanDim:      dark.accentSoft,
  cyanBorder:   'rgba(0,240,255,0.25)',
  accent:       dark.accent,
  accentInk:    dark.accentInk,
  accentSoft:   dark.accentSoft,

  // Semantic status colors
  green:        '#34d399',
  greenDim:     'rgba(52,211,153,0.1)',
  red:          '#f87171',
  redDim:       'rgba(248,113,113,0.1)',
  blue:         '#60a5fa',
  blueDim:      'rgba(96,165,250,0.12)',
  amber:        '#fbbf24',
  amberDim:     'rgba(251,191,36,0.1)',
  orange:       '#fb923c',
  orangeDim:    'rgba(251,146,60,0.1)',
  purple:       '#a78bfa',
  purpleDim:    'rgba(167,139,250,0.1)',

  // Typography
  text:         dark.ink,
  muted:        dark.mid,
  dim:          dark.soft,
  code:         '#86efac',
  codeBg:       '#0e0e10',

  // Font stacks
  mono:         '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace',
  sans:         '"Geist", "Inter", -apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif',

  // Light/dark mode sets (for components that need explicit mode tokens)
  light,
  dark,
} as const;

export type ColorTokens = typeof C;

/** Inject Geist + JetBrains Mono from Google Fonts once per page. */
export function injectFonts() {
  const id = 'idswyft-fonts';
  if (document.getElementById(id)) return;
  const link = document.createElement('link');
  link.id = id;
  link.rel = 'stylesheet';
  link.href =
    'https://fonts.googleapis.com/css2?family=Geist:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap';
  document.head.appendChild(link);
}

/** Get the current theme from <html> data-theme attribute */
export function getTheme(): 'light' | 'dark' {
  return (document.documentElement.getAttribute('data-theme') as 'light' | 'dark') || 'dark';
}

/** Toggle theme between light and dark */
export function toggleTheme(): 'light' | 'dark' {
  const current = getTheme();
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('idswyft-theme', next);
  return next;
}

/** Initialize theme from localStorage or default to dark */
export function initTheme() {
  const stored = localStorage.getItem('idswyft-theme') as 'light' | 'dark' | null;
  document.documentElement.setAttribute('data-theme', stored || 'dark');
}
