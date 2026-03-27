import { API_BASE_URL } from '../config/api'

let _token = ''

/** Fetch a CSRF token from the backend (sets the CSRF cookie too). */
export async function fetchCsrfToken(): Promise<string> {
  try {
    const res = await fetch(`${API_BASE_URL}/api/auth/csrf-token`, { credentials: 'include' })
    if (!res.ok) return ''
    const data = await res.json()
    _token = data.csrfToken || ''
    return _token
  } catch {
    return ''
  }
}

/** Return the cached CSRF token (call fetchCsrfToken first). */
export function getCsrfToken(): string {
  return _token
}

/** Clear cached token (call on logout). */
export function clearCsrfToken(): void {
  _token = ''
}

/** Spread into fetch headers for mutation requests. */
export function csrfHeader(): Record<string, string> {
  return _token ? { 'X-CSRF-Token': _token } : {}
}
