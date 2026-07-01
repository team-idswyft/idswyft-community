/**
 * Operator OTP auth module — service-operator login (send / verify / select).
 *
 * Maps the three /api/auth/service-operator/otp/* endpoints to typed
 * discriminated-union results. Mirrors the CSRF + credentials pattern used
 * by the developer AuthGate (csrfHeader() + credentials: 'include').
 *
 * Backend key-list shape (publicKey() helper in serviceOperatorAuth.ts):
 *   { api_key_id, service_product, service_environment, service_label }
 * NOTE: no `id` or `key_prefix` fields — brief assumed them but backend differs.
 */

import { API_BASE_URL } from '../config/api';
import { csrfHeader } from './csrf';

const BASE = `${API_BASE_URL}/api/auth/service-operator/otp`;

/** One entry in the multi-key picker list (mirrors backend publicKey() shape). */
export interface OperatorKeyOption {
  api_key_id: string;
  service_product: string | null;
  service_environment: string | null;
  service_label: string | null;
}

/**
 * Discriminated union returned by verifyOperatorOtp:
 *   authed   — single key; cookie was set server-side
 *   select   — multiple keys; consumer must call selectOperatorKey
 *   no-key   — 0 active keys for email, or invalid/expired OTP (both 401)
 */
export type VerifyResult =
  | { status: 'authed' }
  | { status: 'select'; selectionToken: string; keys: OperatorKeyOption[] }
  | { status: 'no-key'; message: string };

/** POST /api/auth/service-operator/otp/send */
export async function sendOperatorOtp(
  email: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const res = await fetch(`${BASE}/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...csrfHeader() },
      credentials: 'include',
      body: JSON.stringify({ email }),
    });
    const data = await res.json();
    if (!res.ok) return { ok: false, message: data.message || 'Failed to send code' };
    return { ok: true };
  } catch {
    return { ok: false, message: 'Network error' };
  }
}

/**
 * POST /api/auth/service-operator/otp/verify
 *
 * 401 → no-key (covers both "no active key" and invalid OTP — both are AuthenticationError)
 * 200 with selection_token → select (multiple keys, token + keys list)
 * 200 without selection_token → authed (single key, cookie already set)
 */
export async function verifyOperatorOtp(email: string, code: string): Promise<VerifyResult> {
  const res = await fetch(`${BASE}/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...csrfHeader() },
    credentials: 'include',
    body: JSON.stringify({ email, code }),
  });
  const data = await res.json();

  if (!res.ok) {
    return { status: 'no-key', message: data.message || data.error || 'No service access' };
  }

  if (data.selection_token) {
    return {
      status: 'select',
      selectionToken: data.selection_token,
      keys: data.keys as OperatorKeyOption[],
    };
  }

  return { status: 'authed' };
}

/**
 * POST /api/auth/service-operator/otp/select
 * Body: { selection_token, api_key_id } (snake_case — matches backend validator)
 */
export async function selectOperatorKey(
  selectionToken: string,
  apiKeyId: string,
): Promise<{ ok: boolean; message?: string }> {
  try {
    const res = await fetch(`${BASE}/select`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...csrfHeader() },
      credentials: 'include',
      body: JSON.stringify({ selection_token: selectionToken, api_key_id: apiKeyId }),
    });
    const data = await res.json();
    if (!res.ok) return { ok: false, message: data.message || 'Selection failed' };
    return { ok: true };
  } catch {
    return { ok: false, message: 'Network error' };
  }
}
