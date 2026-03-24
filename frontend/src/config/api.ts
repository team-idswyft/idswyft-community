// API Configuration
// Determines the base URL for all API calls. The resolution order:
//   1. Explicit VITE_API_URL override (custom deployments)
//   2. Production build → '' (same-origin; nginx proxies /api/ to backend)
//   3. Dev server on LAN IP → same origin (Vite proxy)
//   4. Dev server on localhost → hit backend directly at :3001
const _getApiBaseUrl = (): string => {
  // Explicit override — custom deployments can point the frontend at any API origin
  if (import.meta.env.VITE_API_URL) return import.meta.env.VITE_API_URL;

  // Production build (Docker/nginx) — same-origin; nginx proxies /api/ to backend
  if (!import.meta.env.DEV) return '';

  // Vite dev server on a LAN IP (e.g. phone testing) — proxy through Vite
  const h = window.location.hostname;
  if (h !== 'localhost' && h !== '127.0.0.1') {
    return `${window.location.protocol}//${window.location.host}`;
  }

  // Vite dev server on localhost — hit backend directly
  return 'http://localhost:3001';
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
  // This ensures that sandbox API keys work properly in development
  const isLocalDevelopment = API_BASE_URL.includes('localhost') || API_BASE_URL.includes('127.0.0.1');
  if (isLocalDevelopment) {
    return true;
  }
  
  // In production, check the environment or default to false
  return false;
};

// Get the production URL for documentation (remove localhost for docs)
export const getDocumentationApiUrl = () => {
  if (API_BASE_URL.includes('localhost')) {
    return 'https://api.idswyft.app';
  }
  return API_BASE_URL;
};

if (import.meta.env.DEV) {
  console.log('🔧 API Base URL:', API_BASE_URL);
  console.log('🔧 Sandbox Mode:', shouldUseSandbox());
}
