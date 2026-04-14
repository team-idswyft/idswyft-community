// API Configuration
// Determines the base URL for all API calls. The resolution order:
//   1. Explicit VITE_API_URL override (custom deployments)
//   2. Same-origin ('') — works for both production (nginx proxy) and dev (Vite proxy)
const _getApiBaseUrl = (): string => {
  // Explicit override — custom deployments can point the frontend at any API origin
  if (import.meta.env.VITE_API_URL) return import.meta.env.VITE_API_URL;

  // Same-origin for both production (nginx proxy) and dev (Vite proxy).
  // In dev, Vite's proxy config forwards /api/* to http://localhost:3001.
  // This keeps cookies same-origin and avoids cross-scheme issues when
  // basicSsl() serves the dev frontend over HTTPS.
  return '';
};
export const API_BASE_URL = _getApiBaseUrl();

/**
 * Build a URL object for API requests. Handles the case where API_BASE_URL
 * is '' (same-origin proxy) — the URL constructor needs an absolute URL,
 * so we use window.location.origin as the base.
 */
export const buildApiUrl = (path: string): URL =>
  new URL(`${API_BASE_URL}${path}`, window.location.origin);

// Determine if we should use sandbox mode
export const shouldUseSandbox = (_apiKey?: string) => {
  // First check explicit environment override
  const sandboxOverride = import.meta.env.VITE_SANDBOX_MODE;
  if (sandboxOverride !== undefined) {
    return sandboxOverride === 'true';
  }

  // For local development, always use sandbox mode
  if (import.meta.env.DEV) {
    return true;
  }

  // In production, check the environment or default to false
  return false;
};

// Get the production URL for documentation and code examples.
// In dev, always show the cloud URL (developers won't use localhost in real docs).
// In production, use the explicit override if set, otherwise use the current origin
// so that self-hosted community deployments show their own domain everywhere.
export const getDocumentationApiUrl = () => {
  if (import.meta.env.DEV) {
    return 'https://api.idswyft.app';
  }
  if (API_BASE_URL) return API_BASE_URL;
  return typeof window !== 'undefined' ? window.location.origin : 'https://api.idswyft.app';
};

// Get the site/frontend URL for documentation code examples (verification page,
// redirect URLs, etc). Distinct from getDocumentationApiUrl() because in cloud
// the API is at api.idswyft.app but the site is at idswyft.app. In community
// self-hosted, both are the same origin (nginx proxies /api/* to backend).
export const getDocumentationSiteUrl = () => {
  if (import.meta.env.DEV) {
    return 'https://idswyft.app';
  }
  return typeof window !== 'undefined' ? window.location.origin : 'https://idswyft.app';
};

if (import.meta.env.DEV) {
  console.log('🔧 API Base URL:', API_BASE_URL || '(same-origin via Vite proxy)');
  console.log('🔧 Sandbox Mode:', shouldUseSandbox());
}
