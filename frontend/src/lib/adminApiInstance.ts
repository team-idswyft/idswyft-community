import { createApiClient } from './apiClient';
import { API_BASE_URL, shouldUseSandbox } from '../config/api';

export const adminApi = createApiClient(`${API_BASE_URL}/api/v1`, {
  sandbox: shouldUseSandbox(),
});

// Auth is handled via httpOnly cookie (set by server, sent automatically via withCredentials)

/**
 * Try to exchange a developer JWT for an admin JWT.
 * Returns true if successful (admin cookie set by server via httpOnly).
 */
export async function tryEscalateDeveloperToken(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE_URL}/api/auth/admin/escalate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
    });
    if (!res.ok) return false;
    // Admin cookie is set by the server via httpOnly cookie
    return true;
  } catch {
    return false;
  }
}

export async function exportUserData(userId: string): Promise<void> {
  const response = await adminApi.get(`/users/${userId}/data-export`, {
    responseType: 'blob',
  });
  const url = URL.createObjectURL(response.data as Blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `user-data-${userId}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function deleteUserData(userId: string): Promise<void> {
  await adminApi.delete(`/users/${userId}/data`);
}
