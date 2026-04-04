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

// Get the production URL for documentation
export const getDocumentationApiUrl = () => {
  if (import.meta.env.DEV) {
    return 'https://api.idswyft.app';
  }
  return API_BASE_URL || 'https://api.idswyft.app';
};

if (import.meta.env.DEV) {
  console.log('🔧 API Base URL:', API_BASE_URL || '(same-origin via Vite proxy)');
  console.log('🔧 Sandbox Mode:', shouldUseSandbox());
}
