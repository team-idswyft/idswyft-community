/**
 * Validates and builds a redirect URL with verification result query params.
 * Only allows http: and https: protocols to prevent open redirect / XSS attacks.
 */

export function isValidRedirectUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

export function sanitizeRedirectUrl(raw: string): string {
  return isValidRedirectUrl(raw) ? raw : '';
}

export function buildRedirectUrl(
  url: string,
  result: { verification_id?: string; status?: string; user_id?: string },
): string {
  try {
    const u = new URL(url);
    if (result.verification_id) u.searchParams.set('verification_id', result.verification_id);
    if (result.status) u.searchParams.set('status', result.status);
    if (result.user_id) u.searchParams.set('user_id', result.user_id);
    return u.toString();
  } catch {
    // Fallback for relative or malformed URLs
    const sep = url.includes('?') ? '&' : '?';
    const params = new URLSearchParams();
    if (result.verification_id) params.set('verification_id', result.verification_id);
    if (result.status) params.set('status', result.status);
    if (result.user_id) params.set('user_id', result.user_id);
    return url + sep + params.toString();
  }
}
