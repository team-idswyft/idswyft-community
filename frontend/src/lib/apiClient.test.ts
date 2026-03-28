import { describe, it, expect, vi, afterEach } from 'vitest';
import axios from 'axios';
import { createApiClient, RetryAfterError } from './apiClient';

// We need to test the interceptor logic. The cleanest approach without
// axios-mock-adapter is to test the interceptor handler functions directly
// by calling the instance's interceptors.

describe('createApiClient', () => {
  afterEach(() => vi.restoreAllMocks());

  it('retries CSRF fetch and injects X-CSRF-Token on POST requests', async () => {
    // Spy on axios.get to return a fake CSRF token
    const getSpy = vi.spyOn(axios, 'get').mockResolvedValue({ data: { csrfToken: 'test-csrf-token' } });

    const client = createApiClient('http://localhost:3001/api/v1');

    // Extract the request interceptor handler (index 0)
    // @ts-ignore - accessing internals for testing
    const requestHandler = client.interceptors.request.handlers[0]?.fulfilled;
    expect(requestHandler).toBeDefined();

    // Simulate a POST request config going through the interceptor
    const config: any = { method: 'post', headers: {} };
    const result = await requestHandler(config);

    // Should have fetched CSRF
    expect(getSpy).toHaveBeenCalledWith(
      'http://localhost:3001/api/auth/csrf-token',
      expect.objectContaining({ withCredentials: true })
    );
    // Should have injected the token
    expect(result.headers['X-CSRF-Token']).toBe('test-csrf-token');
  });

  it('reuses cached CSRF token on second mutating request (no duplicate fetch)', async () => {
    const getSpy = vi.spyOn(axios, 'get').mockResolvedValue({ data: { csrfToken: 'cached-token' } });

    const client = createApiClient('http://localhost:3001/api/v1');
    // @ts-ignore
    const requestHandler = client.interceptors.request.handlers[0]?.fulfilled;

    const config1: any = { method: 'post', headers: {} };
    const config2: any = { method: 'delete', headers: {} };

    // Fire both through the interceptor
    await requestHandler(config1);
    await requestHandler(config2);

    // axios.get should only have been called once despite two mutating requests
    expect(getSpy).toHaveBeenCalledTimes(1);
    expect(config2.headers['X-CSRF-Token']).toBe('cached-token');
  });

  it('does NOT inject X-CSRF-Token on GET requests', async () => {
    const getSpy = vi.spyOn(axios, 'get').mockResolvedValue({ data: { csrfToken: 'test-csrf-token' } });
    const client = createApiClient('http://localhost:3001/api/v1');

    // @ts-ignore
    const requestHandler = client.interceptors.request.handlers[0]?.fulfilled;
    const config: any = { method: 'get', headers: {} };
    const result = await requestHandler(config);

    expect(getSpy).not.toHaveBeenCalled();
    expect(result.headers['X-CSRF-Token']).toBeUndefined();
  });

  it('rejects with RetryAfterError on 429 response', async () => {
    const client = createApiClient('http://localhost:3001/api/v1');

    // @ts-ignore - accessing internals for testing
    const errorHandler = client.interceptors.response.handlers[0]?.rejected;
    expect(errorHandler).toBeDefined();

    const fakeError = {
      response: {
        status: 429,
        headers: { 'retry-after': '30' },
        data: {},
      },
    };

    await expect(errorHandler!(fakeError)).rejects.toBeInstanceOf(RetryAfterError);
  });

  it('normalises non-429 errors to ApiError shape', async () => {
    const client = createApiClient('http://localhost:3001/api/v1');

    // @ts-ignore
    const errorHandler = client.interceptors.response.handlers[0]?.rejected;

    const fakeError = {
      response: {
        status: 400,
        headers: {},
        data: {
          errors: [{ field: 'email', message: 'Invalid email' }],
          error: { correlationId: 'abc-123' },
          message: 'Validation failed',
        },
      },
    };

    await expect(errorHandler!(fakeError)).rejects.toMatchObject({
      message: 'Validation failed',
      fields: [{ field: 'email', message: 'Invalid email' }],
      correlationId: 'abc-123',
      status: 400,
    });
  });

  it('RetryAfterError carries retryAfter value', () => {
    const err = new RetryAfterError(30);
    expect(err).toBeInstanceOf(Error);
    expect(err.retryAfter).toBe(30);
    expect(err.name).toBe('RetryAfterError');
  });

  it('resets csrfFetch cache on CSRF fetch failure so next request retries', async () => {
    const getSpy = vi.spyOn(axios, 'get')
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce({ data: { csrfToken: 'retry-token' } });

    const client = createApiClient('http://localhost:3001/api/v1');
    // @ts-ignore
    const requestHandler = client.interceptors.request.handlers[0]?.fulfilled;

    const config1: any = { method: 'post', headers: {} };
    const config2: any = { method: 'post', headers: {} };

    // First request — CSRF fetch fails
    await expect(requestHandler(config1)).rejects.toThrow('Network error');

    // Second request — cache was reset, so it retries and succeeds
    const result = await requestHandler(config2);
    expect(result.headers['X-CSRF-Token']).toBe('retry-token');
    expect(getSpy).toHaveBeenCalledTimes(2);
  });
});
