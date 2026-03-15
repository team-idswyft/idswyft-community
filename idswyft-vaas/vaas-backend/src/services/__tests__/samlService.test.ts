import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock database before imports
vi.mock('../../config/database.js', () => ({
  vaasSupabase: {
    from: vi.fn(),
  },
}));

// Mock @node-saml/node-saml — must use class (not arrow fn) because code calls `new SAML(...)`
vi.mock('@node-saml/node-saml', () => ({
  SAML: class MockSAML {
    constructor(_opts: any) {}
    async getAuthorizeUrlAsync() {
      return 'https://idp.example.com/sso?SAMLRequest=encoded';
    }
    async validatePostResponseAsync() {
      return {
        profile: {
          nameID: 'user@example.com',
          email: 'user@example.com',
          firstName: 'Jane',
          lastName: 'Doe',
        },
      };
    }
  },
}));

import {
  getOrganizationSAMLConfig,
  getOrganizationSAMLConfigById,
  generateAuthRequest,
  processCallback,
  generateSPMetadata,
  upsertSSOConfig,
  deleteSSOConfig,
} from '../samlService.js';
import { vaasSupabase } from '../../config/database.js';

// ─── Helpers ─────────────────────────────────────────────

const mockSSOConfig = {
  id: 'sso-1',
  organization_id: 'org-1',
  idp_entity_id: 'https://idp.example.com',
  idp_sso_url: 'https://idp.example.com/sso',
  idp_certificate: 'MIIC...cert...',
  attribute_mapping: { email: 'email', first_name: 'firstName', last_name: 'lastName' },
  is_enabled: true,
  created_at: '2024-01-01T00:00:00Z',
};

function mockChain(result: { data: any; error: any }) {
  return {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue(result),
        }),
        single: vi.fn().mockResolvedValue(result),
      }),
    }),
  };
}

// ─── Tests ───────────────────────────────────────────────

describe('samlService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getOrganizationSAMLConfig', () => {
    it('returns null when organization not found', async () => {
      (vaasSupabase.from as ReturnType<typeof vi.fn>).mockReturnValue(
        mockChain({ data: null, error: { message: 'not found' } }),
      );

      const result = await getOrganizationSAMLConfig('nonexistent-org');
      expect(result).toBeNull();
    });

    it('returns config when org and SSO config exist', async () => {
      let callCount = 0;
      (vaasSupabase.from as ReturnType<typeof vi.fn>).mockImplementation((table: string) => {
        callCount++;
        if (table === 'vaas_organizations') {
          return mockChain({ data: { id: 'org-1', name: 'Acme Corp' }, error: null });
        }
        // organization_sso_configs
        return mockChain({ data: mockSSOConfig, error: null });
      });

      const result = await getOrganizationSAMLConfig('acme');
      expect(result).not.toBeNull();
      expect(result!.organization_id).toBe('org-1');
      expect(result!.org_name).toBe('Acme Corp');
    });

    it('returns null when SSO config not found for org', async () => {
      (vaasSupabase.from as ReturnType<typeof vi.fn>).mockImplementation((table: string) => {
        if (table === 'vaas_organizations') {
          return mockChain({ data: { id: 'org-1', name: 'Acme Corp' }, error: null });
        }
        return mockChain({ data: null, error: { message: 'not found' } });
      });

      const result = await getOrganizationSAMLConfig('acme');
      expect(result).toBeNull();
    });
  });

  describe('getOrganizationSAMLConfigById', () => {
    it('returns config for valid org ID', async () => {
      (vaasSupabase.from as ReturnType<typeof vi.fn>).mockReturnValue(
        mockChain({ data: mockSSOConfig, error: null }),
      );

      const result = await getOrganizationSAMLConfigById('org-1');
      expect(result).not.toBeNull();
      expect(result!.idp_entity_id).toBe('https://idp.example.com');
    });

    it('returns null when no config exists', async () => {
      (vaasSupabase.from as ReturnType<typeof vi.fn>).mockReturnValue(
        mockChain({ data: null, error: { message: 'not found' } }),
      );

      const result = await getOrganizationSAMLConfigById('org-none');
      expect(result).toBeNull();
    });
  });

  describe('generateAuthRequest', () => {
    it('returns redirect URL for valid org with SSO enabled', async () => {
      (vaasSupabase.from as ReturnType<typeof vi.fn>).mockImplementation((table: string) => {
        if (table === 'vaas_organizations') {
          return mockChain({ data: { id: 'org-1', name: 'Acme' }, error: null });
        }
        return mockChain({ data: mockSSOConfig, error: null });
      });

      const result = await generateAuthRequest('acme');
      expect(result).not.toBeNull();
      expect(result!.redirectUrl).toContain('https://idp.example.com');
      expect(result!.requestId).toMatch(/^saml_\d+$/);
    });

    it('returns null when org has no SSO config', async () => {
      (vaasSupabase.from as ReturnType<typeof vi.fn>).mockReturnValue(
        mockChain({ data: null, error: { message: 'not found' } }),
      );

      const result = await generateAuthRequest('no-sso-org');
      expect(result).toBeNull();
    });
  });

  describe('processCallback', () => {
    it('extracts profile from valid SAML response', async () => {
      (vaasSupabase.from as ReturnType<typeof vi.fn>).mockReturnValue(
        mockChain({ data: mockSSOConfig, error: null }),
      );

      const result = await processCallback('base64SAMLResponse', 'org-1');
      expect(result).not.toBeNull();
      expect(result!.email).toBe('user@example.com');
      expect(result!.first_name).toBe('Jane');
      expect(result!.last_name).toBe('Doe');
      expect(result!.name_id).toBe('user@example.com');
    });

    it('returns null when SSO config not found', async () => {
      (vaasSupabase.from as ReturnType<typeof vi.fn>).mockReturnValue(
        mockChain({ data: null, error: { message: 'not found' } }),
      );

      const result = await processCallback('base64SAMLResponse', 'invalid-org');
      expect(result).toBeNull();
    });
  });

  describe('generateSPMetadata', () => {
    it('returns valid XML with entity ID and ACS URL', () => {
      const xml = generateSPMetadata('org-1');
      expect(xml).toContain('EntityDescriptor');
      expect(xml).toContain('AssertionConsumerService');
      expect(xml).toContain('urn:oasis:names:tc:SAML:2.0:protocol');
      expect(xml).toContain('emailAddress');
    });

    it('includes organization info', () => {
      const xml = generateSPMetadata('org-1');
      expect(xml).toContain('Idswyft');
      expect(xml).toContain('idswyft.app');
    });
  });

  describe('upsertSSOConfig', () => {
    it('creates new SSO config via upsert', async () => {
      const mockUpsert = {
        upsert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: mockSSOConfig, error: null }),
          }),
        }),
      };
      (vaasSupabase.from as ReturnType<typeof vi.fn>).mockReturnValue(mockUpsert);

      const result = await upsertSSOConfig('org-1', {
        idp_entity_id: 'https://idp.example.com',
        idp_sso_url: 'https://idp.example.com/sso',
        idp_certificate: 'MIIC...cert...',
      });

      expect(result).not.toBeNull();
      expect(result!.idp_entity_id).toBe('https://idp.example.com');
      expect(mockUpsert.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          organization_id: 'org-1',
          idp_entity_id: 'https://idp.example.com',
        }),
        { onConflict: 'organization_id' },
      );
    });

    it('returns null on database error', async () => {
      const mockUpsert = {
        upsert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: null, error: { message: 'db error' } }),
          }),
        }),
      };
      (vaasSupabase.from as ReturnType<typeof vi.fn>).mockReturnValue(mockUpsert);

      const result = await upsertSSOConfig('org-1', {
        idp_entity_id: 'x',
        idp_sso_url: 'x',
        idp_certificate: 'x',
      });
      expect(result).toBeNull();
    });
  });

  describe('deleteSSOConfig', () => {
    it('returns true on successful deletion', async () => {
      const mockDelete = {
        delete: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      };
      (vaasSupabase.from as ReturnType<typeof vi.fn>).mockReturnValue(mockDelete);

      const result = await deleteSSOConfig('org-1');
      expect(result).toBe(true);
    });

    it('returns false on database error', async () => {
      const mockDelete = {
        delete: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: { message: 'db error' } }),
        }),
      };
      (vaasSupabase.from as ReturnType<typeof vi.fn>).mockReturnValue(mockDelete);

      const result = await deleteSSOConfig('org-1');
      expect(result).toBe(false);
    });
  });
});
