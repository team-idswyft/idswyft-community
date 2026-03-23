/**
 * Edition configuration — controls Community vs Cloud behavior.
 *
 * Set via VITE_EDITION env var at build time:
 *   - "community" (default): Self-hosted, Dev Portal is the root
 *   - "cloud": Managed by Idswyft, marketing site is the root
 *
 * Vite replaces import.meta.env values at build time, enabling
 * dead code elimination for unused edition paths.
 */

export type Edition = 'community' | 'cloud'

export const EDITION: Edition =
  (import.meta.env.VITE_EDITION as Edition) || 'community'

export const isCommunity = EDITION === 'community'
export const isCloud = EDITION === 'cloud'
