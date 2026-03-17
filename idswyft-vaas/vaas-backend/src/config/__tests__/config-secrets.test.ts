import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

describe('config startup secret validation', () => {
  const ORIG_ENV = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    // Restore original env
    Object.keys(process.env).forEach((k) => {
      if (!(k in ORIG_ENV)) delete process.env[k];
    });
    Object.assign(process.env, ORIG_ENV);
  });

  it('throws when VAAS_JWT_SECRET is missing in production', async () => {
    process.env.NODE_ENV = 'production';
    delete process.env.VAAS_JWT_SECRET;
    process.env.VAAS_API_KEY_SECRET = 'some-secret-value';
    process.env.IDSWYFT_WEBHOOK_SECRET = 'some-webhook-secret';

    await expect(import('../index.js')).rejects.toThrow(/VAAS_JWT_SECRET/);
  });

  it('throws when VAAS_API_KEY_SECRET is missing in production', async () => {
    process.env.NODE_ENV = 'production';
    process.env.VAAS_JWT_SECRET = 'some-jwt-secret';
    delete process.env.VAAS_API_KEY_SECRET;
    process.env.IDSWYFT_WEBHOOK_SECRET = 'some-webhook-secret';

    await expect(import('../index.js')).rejects.toThrow(/VAAS_API_KEY_SECRET/);
  });

  it('does NOT throw when all secrets are set in production', async () => {
    process.env.NODE_ENV = 'production';
    process.env.VAAS_JWT_SECRET = 'prod-jwt-secret-value';
    process.env.VAAS_API_KEY_SECRET = 'prod-api-key-secret-value';
    process.env.IDSWYFT_WEBHOOK_SECRET = 'prod-webhook-secret-value';

    await expect(import('../index.js')).resolves.toBeDefined();
  });

  it('does NOT throw when secrets are missing in development', async () => {
    process.env.NODE_ENV = 'development';
    delete process.env.VAAS_JWT_SECRET;
    delete process.env.VAAS_API_KEY_SECRET;
    delete process.env.IDSWYFT_WEBHOOK_SECRET;

    await expect(import('../index.js')).resolves.toBeDefined();
  });

  it('throws when VAAS_JWT_SECRET is empty string in production', async () => {
    process.env.NODE_ENV = 'production';
    process.env.VAAS_JWT_SECRET = '';
    process.env.VAAS_API_KEY_SECRET = 'some-secret-value';
    process.env.IDSWYFT_WEBHOOK_SECRET = 'some-webhook-secret';
    await expect(import('../index.js')).rejects.toThrow(/VAAS_JWT_SECRET/);
  });

  it('throws when IDSWYFT_WEBHOOK_SECRET is missing in production', async () => {
    process.env.NODE_ENV = 'production';
    process.env.VAAS_JWT_SECRET = 'some-jwt-secret';
    process.env.VAAS_API_KEY_SECRET = 'some-api-key-secret';
    delete process.env.IDSWYFT_WEBHOOK_SECRET;

    await expect(import('../index.js')).rejects.toThrow(/IDSWYFT_WEBHOOK_SECRET/);
  });
});
