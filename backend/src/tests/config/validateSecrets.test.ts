import { describe, it, expect } from 'vitest';
import { validateSecrets } from '../../config/validateSecrets.js';

// Valid secrets that pass all length checks (32+ chars each)
const VALID_JWT = 'a-real-random-jwt-secret-here-padded!!';
const VALID_API_KEY = 'a-real-api-key-secret-that-is-long-enough!!';
const VALID_ENCRYPTION = '12345678901234567890123456789012';
const VALID_SERVICE = 'a-real-service-token-that-is-long-enough!!';

describe('validateSecrets', () => {
  it('throws if JWT_SECRET is default placeholder', () => {
    expect(() => validateSecrets({
      jwtSecret: 'your-super-secret-jwt-key',
      apiKeySecret: VALID_API_KEY,
      encryptionKey: VALID_ENCRYPTION,
      serviceToken: VALID_SERVICE,
    })).toThrow('JWT_SECRET must be changed from the default value');
  });

  it('throws if API_KEY_SECRET is default placeholder', () => {
    expect(() => validateSecrets({
      jwtSecret: VALID_JWT,
      apiKeySecret: 'your-api-key-encryption-secret',
      encryptionKey: VALID_ENCRYPTION,
      serviceToken: VALID_SERVICE,
    })).toThrow('API_KEY_SECRET must be changed from the default value');
  });

  it('throws if ENCRYPTION_KEY is too short', () => {
    expect(() => validateSecrets({
      jwtSecret: VALID_JWT,
      apiKeySecret: VALID_API_KEY,
      encryptionKey: 'too-short',
      serviceToken: VALID_SERVICE,
    })).toThrow('ENCRYPTION_KEY must be at least 32 bytes');
  });

  it('throws if API_KEY_SECRET is too short', () => {
    expect(() => validateSecrets({
      jwtSecret: VALID_JWT,
      apiKeySecret: 'short',
      encryptionKey: VALID_ENCRYPTION,
      serviceToken: VALID_SERVICE,
    })).toThrow('API_KEY_SECRET must be at least 32 characters');
  });

  it('throws if SERVICE_TOKEN is too short', () => {
    expect(() => validateSecrets({
      jwtSecret: VALID_JWT,
      apiKeySecret: VALID_API_KEY,
      encryptionKey: VALID_ENCRYPTION,
      serviceToken: 'short',
    })).toThrow('SERVICE_TOKEN must be at least 32 characters');
  });

  it('passes with valid secrets', () => {
    expect(() => validateSecrets({
      jwtSecret: VALID_JWT,
      apiKeySecret: VALID_API_KEY,
      encryptionKey: VALID_ENCRYPTION,
      serviceToken: VALID_SERVICE,
    })).not.toThrow();
  });
});
