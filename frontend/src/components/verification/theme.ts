import type { PageBuilderConfig } from './types'

// Maps the page-builder fontFamily choice to a CSS font stack.
// (Verbatim from UserVerificationPage's PB_FONT_MAP.)
export const PB_FONT_MAP: Record<PageBuilderConfig['fontFamily'], string> = {
  'dm-sans': '"DM Sans", system-ui, sans-serif',
  'inter': '"Inter", system-ui, sans-serif',
  'system': 'system-ui, -apple-system, sans-serif',
}

/**
 * Map a (possibly partial) page-builder config to the global CSS-variable
 * overrides the verification pages theme from. Only fields that are set are
 * returned, so unset fields fall back to the global defaults in index.css.
 *
 * Used by BOTH the real pages (to theme the applicant flow) and the Page
 * Builder preview (so the preview reflects the same theme). `--mono` is left
 * untouched to preserve the monospace accents.
 */
export function resolveThemeVars(config: Partial<PageBuilderConfig>): Record<string, string> {
  const vars: Record<string, string> = {}
  if (config.backgroundColor) vars['--paper'] = config.backgroundColor
  if (config.textColor) vars['--ink'] = config.textColor
  if (config.cardBackgroundColor) vars['--panel'] = config.cardBackgroundColor
  if (config.accentColor) {
    vars['--accent'] = config.accentColor
    vars['--accent-ink'] = config.accentColor
  }
  if (config.mutedTextColor) {
    vars['--mid'] = config.mutedTextColor
    vars['--soft'] = config.mutedTextColor
  }
  if (config.borderColor) {
    vars['--rule'] = config.borderColor
    vars['--rule-strong'] = config.borderColor
  }
  if (config.fontFamily && PB_FONT_MAP[config.fontFamily]) {
    vars['--sans'] = PB_FONT_MAP[config.fontFamily]
  }
  return vars
}
