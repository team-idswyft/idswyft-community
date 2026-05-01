import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/config/database.js', () => ({
  supabase: {},
  connectDB: vi.fn(),
}));

const mockConfig: any = {
  storage: { publicAssetBaseUrl: '' },
  encryptionKey: 'test-encryption-key-32chars!!!!!',
};
vi.mock('@/config/index.js', () => ({
  config: mockConfig,
  default: mockConfig,
}));

vi.mock('@/utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const { resolvePublicAssetUrl } = await import('../storage.js');

describe('resolvePublicAssetUrl', () => {
  beforeEach(() => {
    mockConfig.storage.publicAssetBaseUrl = '';
  });

  it('returns null for null/undefined/empty input', () => {
    expect(resolvePublicAssetUrl(null)).toBeNull();
    expect(resolvePublicAssetUrl(undefined)).toBeNull();
    expect(resolvePublicAssetUrl('')).toBeNull();
  });

  it('passes absolute https URLs through unchanged', () => {
    mockConfig.storage.publicAssetBaseUrl = 'https://api.idswyft.app';
    expect(resolvePublicAssetUrl('https://avatars.githubusercontent.com/u/123')).toBe(
      'https://avatars.githubusercontent.com/u/123',
    );
    expect(resolvePublicAssetUrl('https://kcjugatpfhccjroyliku.supabase.co/storage/v1/object/public/avatars/foo.png')).toBe(
      'https://kcjugatpfhccjroyliku.supabase.co/storage/v1/object/public/avatars/foo.png',
    );
  });

  it('passes absolute http URLs through unchanged', () => {
    mockConfig.storage.publicAssetBaseUrl = 'https://api.idswyft.app';
    expect(resolvePublicAssetUrl('http://example.com/logo.png')).toBe('http://example.com/logo.png');
  });

  it('returns relative URLs as-is when publicAssetBaseUrl is unset (community/self-host)', () => {
    mockConfig.storage.publicAssetBaseUrl = '';
    expect(resolvePublicAssetUrl('/api/public/assets/avatars/dev-id.png')).toBe(
      '/api/public/assets/avatars/dev-id.png',
    );
  });

  it('prepends base URL to relative paths when publicAssetBaseUrl is set (cloud)', () => {
    mockConfig.storage.publicAssetBaseUrl = 'https://api.idswyft.app';
    expect(resolvePublicAssetUrl('/api/public/assets/avatars/dev-id.png')).toBe(
      'https://api.idswyft.app/api/public/assets/avatars/dev-id.png',
    );
    expect(resolvePublicAssetUrl('/api/public/assets/branding/logo.jpg')).toBe(
      'https://api.idswyft.app/api/public/assets/branding/logo.jpg',
    );
  });

  it('strips trailing slash from base URL to avoid double slash', () => {
    mockConfig.storage.publicAssetBaseUrl = 'https://api.idswyft.app/';
    expect(resolvePublicAssetUrl('/api/public/assets/avatars/x.png')).toBe(
      'https://api.idswyft.app/api/public/assets/avatars/x.png',
    );
  });

  it('strips multiple trailing slashes', () => {
    mockConfig.storage.publicAssetBaseUrl = 'https://api.idswyft.app///';
    expect(resolvePublicAssetUrl('/api/public/assets/avatars/x.png')).toBe(
      'https://api.idswyft.app/api/public/assets/avatars/x.png',
    );
  });

  it('case-insensitive on http/https detection', () => {
    mockConfig.storage.publicAssetBaseUrl = 'https://api.idswyft.app';
    expect(resolvePublicAssetUrl('HTTPS://example.com/x.png')).toBe('HTTPS://example.com/x.png');
    expect(resolvePublicAssetUrl('Http://example.com/x.png')).toBe('Http://example.com/x.png');
  });
});
