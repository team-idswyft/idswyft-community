import axios, { AxiosInstance, AxiosError } from 'axios';

export interface ApiError {
  message: string;
  fields?: { field: string; message: string }[];
  correlationId?: string;
  retryAfter?: number;
  status?: number;
}

export class RetryAfterError extends Error {
  retryAfter: number;
  constructor(retryAfter: number) {
    super(`Rate limited. Retry after ${retryAfter} seconds.`);
    this.name = 'RetryAfterError';
    this.retryAfter = retryAfter;
  }
}

export function createApiClient(
  baseURL: string,
  options?: { sandbox?: boolean }
): AxiosInstance {
  const instance = axios.create({ baseURL, withCredentials: true });

  // ── Request: sandbox header ──────────────────────────────────────
  // No CSRF needed: the backend uses JWT (Authorization: Bearer), not cookie
  // sessions — CSRF attacks cannot read/set the Authorization header.
  instance.interceptors.request.use((config) => {
    if (options?.sandbox) {
      config.headers['X-Sandbox-Mode'] = 'true';
    }
    return config;
  });

  // ── Response: normalise errors ───────────────────────────────────
  instance.interceptors.response.use(
    (res) => res,
    (error: AxiosError<any>) => {
      if (error.response?.status === 429) {
        const raw = parseInt(
          (error.response.headers['retry-after'] as string) ?? '60',
          10
        );
        const after = Number.isFinite(raw) ? raw : 60;
        return Promise.reject(new RetryAfterError(after));
      }

      const body = error.response?.data;
      const apiError: ApiError = {
        message:
          body?.message ??
          body?.error?.message ??
          'An unexpected error occurred',
        fields: body?.errors ?? undefined,
        correlationId: body?.error?.correlationId ?? undefined,
        status: error.response?.status,
      };
      return Promise.reject(apiError);
    }
  );

  return instance;
}
