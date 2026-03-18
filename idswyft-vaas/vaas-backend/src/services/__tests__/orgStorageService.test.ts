import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock database module — required because database.ts throws at import time
// when env vars are absent (see CLAUDE.md known quirks)
vi.mock('../../config/database.js', () => ({
  vaasSupabase: {
    from: vi.fn(),
    storage: {
      from: vi.fn(),
      createBucket: vi.fn(),
    },
  },
}));

// Mock @aws-sdk/client-s3 — S3Client must be a function expression (not arrow)
// so it can be invoked with `new`
vi.mock('@aws-sdk/client-s3', () => {
  const mockSend = vi.fn().mockResolvedValue({});
  return {
    S3Client: vi.fn().mockImplementation(function (this: any) {
      this.send = mockSend;
    }),
    PutObjectCommand: vi.fn(),
    GetObjectCommand: vi.fn(),
    DeleteObjectCommand: vi.fn(),
  };
});

// Mock @aws-sdk/s3-request-presigner
vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: vi.fn().mockResolvedValue('https://s3.example.com/signed-url'),
}));

// Mock @supabase/supabase-js createClient for org Supabase
vi.mock('@supabase/supabase-js', async () => {
  const actual = await vi.importActual('@supabase/supabase-js');
  return {
    ...actual as any,
    createClient: vi.fn().mockReturnValue({
      storage: {
        from: vi.fn().mockReturnValue({
          upload: vi.fn().mockResolvedValue({ error: null }),
          createSignedUrl: vi.fn().mockResolvedValue({
            data: { signedUrl: 'https://org-supabase.example.com/signed-url' },
          }),
          remove: vi.fn().mockResolvedValue({ error: null }),
        }),
      },
    }),
  };
});

import { orgStorageService, decodePath } from '../orgStorageService.js';
import { vaasSupabase } from '../../config/database.js';

// ─── Helpers ──────────────────────────────────────────────────────

function mockOrgSettings(settings: Record<string, any>) {
  (vaasSupabase.from as ReturnType<typeof vi.fn>).mockReturnValue({
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: { storage_settings: settings },
          error: null,
        }),
      }),
    }),
  });
}

function mockStorageUpload(result: { error: any } = { error: null }) {
  (vaasSupabase.storage.from as ReturnType<typeof vi.fn>).mockReturnValue({
    upload: vi.fn().mockResolvedValue(result),
    createSignedUrl: vi.fn().mockResolvedValue({
      data: { signedUrl: 'https://supabase.example.com/signed-url' },
    }),
    remove: vi.fn().mockResolvedValue({ error: null }),
  });
}

function mockCreateBucket(result: { error: any } = { error: null }) {
  (vaasSupabase.storage.createBucket as ReturnType<typeof vi.fn>).mockResolvedValue(result);
}

// ─── Tests ────────────────────────────────────────────────────────

describe('decodePath', () => {
  it('decodes default prefixed path', () => {
    const result = decodePath('default:org-abc/session/front/file.jpg');
    expect(result.provider).toBe('default');
    expect(result.path).toBe('org-abc/session/front/file.jpg');
  });

  it('decodes s3 prefixed path', () => {
    const result = decodePath('s3:org-abc/session/front/file.jpg');
    expect(result.provider).toBe('s3');
    expect(result.path).toBe('org-abc/session/front/file.jpg');
  });

  it('decodes supabase prefixed path', () => {
    const result = decodePath('supabase:org-abc/session/front/file.jpg');
    expect(result.provider).toBe('supabase');
    expect(result.path).toBe('org-abc/session/front/file.jpg');
  });

  it('decodes legacy temp:// paths', () => {
    const result = decodePath('temp://session-123/front/file.jpg');
    expect(result.provider).toBe('temp');
    expect(result.path).toBe('session-123/front/file.jpg');
  });

  it('falls back to default for unprefixed paths', () => {
    const result = decodePath('org-abc/session/front/file.jpg');
    expect(result.provider).toBe('default');
    expect(result.path).toBe('org-abc/session/front/file.jpg');
  });
});

describe('OrgStorageService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset cache between tests
    orgStorageService.invalidateCache('org-1');
    orgStorageService.invalidateCache('org-2');
  });

  describe('storeDocument', () => {
    it('stores to default Supabase when storage_type is default', async () => {
      mockOrgSettings({ storage_type: 'default', config: {} });
      mockStorageUpload();

      const result = await orgStorageService.storeDocument(
        'org-1',
        Buffer.from('test'),
        'document.jpg',
        'image/jpeg',
        'session-abc',
        'front'
      );

      expect(result).toMatch(/^default:org-org-1\/session-abc\/front\//);
      expect(result).toMatch(/\.jpg$/);
      expect(vaasSupabase.storage.from).toHaveBeenCalledWith('vaas-documents');
    });

    it('stores to S3 when storage_type is s3', async () => {
      mockOrgSettings({
        storage_type: 's3',
        config: {
          s3_bucket: 'my-bucket',
          s3_region: 'us-west-2',
          s3_access_key: 'AKID',
          s3_secret_key: 'SECRET',
        },
      });

      const { PutObjectCommand } = await import('@aws-sdk/client-s3');

      const result = await orgStorageService.storeDocument(
        'org-1',
        Buffer.from('test'),
        'document.png',
        'image/png',
        'session-def',
        'back'
      );

      expect(result).toMatch(/^s3:org-org-1\/session-def\/back\//);
      expect(result).toMatch(/\.png$/);
      expect(PutObjectCommand).toHaveBeenCalled();
    });

    it('stores to org Supabase when storage_type is supabase', async () => {
      mockOrgSettings({
        storage_type: 'supabase',
        config: {
          supabase_url: 'https://org.supabase.co',
          supabase_service_key: 'org-key',
          supabase_bucket: 'org-docs',
        },
      });

      const result = await orgStorageService.storeDocument(
        'org-2',
        Buffer.from('test'),
        'id-card.pdf',
        'application/pdf',
        'session-ghi',
        'front'
      );

      expect(result).toMatch(/^supabase:org-org-2\/session-ghi\/front\//);
      expect(result).toMatch(/\.pdf$/);
    });

    it('throws for GCS storage type', async () => {
      mockOrgSettings({ storage_type: 'gcs', config: {} });

      await expect(
        orgStorageService.storeDocument('org-1', Buffer.from('test'), 'doc.jpg', 'image/jpeg', 'sess', 'front')
      ).rejects.toThrow('GCS storage is not yet supported');
    });

    it('rejects session IDs with path traversal', async () => {
      mockOrgSettings({ storage_type: 'default', config: {} });

      await expect(
        orgStorageService.storeDocument('org-1', Buffer.from('test'), 'doc.jpg', 'image/jpeg', '../etc', 'front')
      ).rejects.toThrow('Invalid sessionId');
    });

    it('rejects doc types with directory separators', async () => {
      mockOrgSettings({ storage_type: 'default', config: {} });

      await expect(
        orgStorageService.storeDocument('org-1', Buffer.from('test'), 'doc.jpg', 'image/jpeg', 'session', 'front/../../etc')
      ).rejects.toThrow('Invalid docType');
    });
  });

  describe('getFileUrl', () => {
    it('generates signed URL for default provider', async () => {
      mockOrgSettings({ storage_type: 'default', config: {} });
      mockStorageUpload();

      const url = await orgStorageService.getFileUrl('org-1', 'default:org-org-1/session/front/file.jpg');
      expect(url).toBe('https://supabase.example.com/signed-url');
    });

    it('generates presigned S3 URL', async () => {
      mockOrgSettings({
        storage_type: 's3',
        config: {
          s3_bucket: 'my-bucket',
          s3_region: 'us-west-2',
          s3_access_key: 'AKID',
          s3_secret_key: 'SECRET',
        },
      });

      const url = await orgStorageService.getFileUrl('org-1', 's3:org-org-1/session/front/file.jpg');
      expect(url).toBe('https://s3.example.com/signed-url');
    });

    it('throws for legacy temp:// paths', async () => {
      mockOrgSettings({ storage_type: 'default', config: {} });

      await expect(
        orgStorageService.getFileUrl('org-1', 'temp://session-123/front/file.jpg')
      ).rejects.toThrow('before file storage was configured');
    });

    it('rejects paths belonging to a different org', async () => {
      mockOrgSettings({ storage_type: 'default', config: {} });

      await expect(
        orgStorageService.getFileUrl('org-1', 'default:org-org-2/session/front/file.jpg')
      ).rejects.toThrow('does not belong to the requesting organization');
    });
  });

  describe('deleteFile', () => {
    it('silently handles temp:// paths', async () => {
      // Should not throw
      await orgStorageService.deleteFile('org-1', 'temp://session-123/front/file.jpg');
    });

    it('deletes from default Supabase', async () => {
      mockOrgSettings({ storage_type: 'default', config: {} });
      mockStorageUpload();

      await orgStorageService.deleteFile('org-1', 'default:org-org-1/session/front/file.jpg');
      expect(vaasSupabase.storage.from).toHaveBeenCalledWith('vaas-documents');
    });

    it('rejects paths belonging to a different org', async () => {
      mockOrgSettings({ storage_type: 'default', config: {} });

      await expect(
        orgStorageService.deleteFile('org-1', 'default:org-org-2/session/front/file.jpg')
      ).rejects.toThrow('does not belong to the requesting organization');
    });
  });

  describe('ensureDefaultBucket', () => {
    it('creates vaas-documents bucket', async () => {
      mockCreateBucket();

      await orgStorageService.ensureDefaultBucket();
      expect(vaasSupabase.storage.createBucket).toHaveBeenCalledWith('vaas-documents', { public: false });
    });

    it('ignores already-exists error', async () => {
      mockCreateBucket({ error: { message: 'Bucket already exists' } });

      // Should not throw
      await orgStorageService.ensureDefaultBucket();
    });
  });

  describe('cache', () => {
    it('caches settings after first call', async () => {
      mockOrgSettings({ storage_type: 'default', config: {} });
      mockStorageUpload();

      await orgStorageService.storeDocument('org-1', Buffer.from('a'), 'a.jpg', 'image/jpeg', 'sess1', 'front');
      await orgStorageService.storeDocument('org-1', Buffer.from('b'), 'b.jpg', 'image/jpeg', 'sess2', 'front');

      // vaasSupabase.from should be called once for settings lookup (first call only)
      // Second call reuses cached settings
      const fromCalls = (vaasSupabase.from as ReturnType<typeof vi.fn>).mock.calls;
      const settingsCalls = fromCalls.filter(
        (call: any[]) => call[0] === 'vaas_organizations'
      );
      expect(settingsCalls.length).toBe(1);
    });

    it('invalidateCache forces re-fetch', async () => {
      mockOrgSettings({ storage_type: 'default', config: {} });
      mockStorageUpload();

      await orgStorageService.storeDocument('org-1', Buffer.from('a'), 'a.jpg', 'image/jpeg', 'sess1', 'front');

      orgStorageService.invalidateCache('org-1');

      await orgStorageService.storeDocument('org-1', Buffer.from('b'), 'b.jpg', 'image/jpeg', 'sess2', 'front');

      const fromCalls = (vaasSupabase.from as ReturnType<typeof vi.fn>).mock.calls;
      const settingsCalls = fromCalls.filter(
        (call: any[]) => call[0] === 'vaas_organizations'
      );
      expect(settingsCalls.length).toBe(2);
    });
  });

  describe('secure filename', () => {
    it('generates unique filenames with correct extension', async () => {
      mockOrgSettings({ storage_type: 'default', config: {} });
      mockStorageUpload();

      const path1 = await orgStorageService.storeDocument(
        'org-1', Buffer.from('a'), 'photo.JPEG', 'image/jpeg', 'sess', 'front'
      );
      orgStorageService.invalidateCache('org-1');
      mockOrgSettings({ storage_type: 'default', config: {} });

      const path2 = await orgStorageService.storeDocument(
        'org-1', Buffer.from('b'), 'photo.JPEG', 'image/jpeg', 'sess', 'front'
      );

      // Paths should differ (different random bytes + timestamp)
      expect(path1).not.toBe(path2);
      // Both should end with .jpeg (lowercased)
      expect(path1).toMatch(/\.jpeg$/);
      expect(path2).toMatch(/\.jpeg$/);
    });
  });
});
