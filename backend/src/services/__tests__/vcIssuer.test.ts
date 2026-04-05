/**
 * Unit tests for the Verifiable Credentials issuer service.
 *
 * Tests cover:
 * - Key manager: key generation, signer creation, DID document shape
 * - VC issuer: credential issuance, claims mapping, rejection of non-verified sessions
 * - Revocation and status checks
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ──────────────────────────────────────────────────

vi.mock('@/config/database.js', () => ({
  supabase: {
    from: vi.fn(),
  },
  connectDB: vi.fn(),
}));

vi.mock('@/utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// Mock env vars before importing modules that read them at top-level
const TEST_PRIVATE_KEY = 'a'.repeat(64); // 32 bytes of 0xaa

vi.stubEnv('VC_ISSUER_PRIVATE_KEY', TEST_PRIVATE_KEY);
vi.stubEnv('VC_ISSUER_DID', 'did:web:test.example.com');
vi.stubEnv('VC_CREDENTIAL_TTL_DAYS', '365');

// ─── Imports ────────────────────────────────────────────────

import { supabase } from '@/config/database.js';

// Helper to build chainable supabase mock
function mockSupabaseChain(returnData: any = null, returnError: any = null) {
  const chain: any = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: returnData, error: returnError }),
    single: vi.fn().mockResolvedValue({ data: returnData, error: returnError }),
  };
  return chain;
}

// ─── Key Manager Tests ──────────────────────────────────────

describe('vcKeyManager', () => {
  it('returns the configured issuer DID', async () => {
    const { getIssuerDID } = await import('../vcKeyManager.js');
    expect(getIssuerDID()).toBe('did:web:test.example.com');
  });

  it('creates an EdDSA signer from the private key', async () => {
    const { getIssuerSigner } = await import('../vcKeyManager.js');
    const signer = getIssuerSigner();
    expect(typeof signer).toBe('function');
  });

  it('exports the public key in JWK format', async () => {
    const { getPublicKeyJWK } = await import('../vcKeyManager.js');
    const jwk = getPublicKeyJWK();
    expect(jwk.kty).toBe('OKP');
    expect(jwk.crv).toBe('Ed25519');
    expect(typeof jwk.x).toBe('string');
    // base64url public key for Ed25519 should be 43 or 44 chars
    expect(jwk.x.length).toBeGreaterThanOrEqual(40);
  });

  it('returns consistent public key for same private key', async () => {
    const { getPublicKeyHex } = await import('../vcKeyManager.js');
    const hex1 = getPublicKeyHex();
    const hex2 = getPublicKeyHex();
    expect(hex1).toBe(hex2);
    expect(hex1.length).toBe(64); // 32 bytes in hex
  });

  it('generates a fresh key pair', async () => {
    const { generateKeyPair } = await import('../vcKeyManager.js');
    const kp = generateKeyPair();
    expect(kp.privateKeyHex.length).toBe(64);
    expect(kp.publicKeyHex.length).toBe(64);
    // Different random key each time
    const kp2 = generateKeyPair();
    expect(kp.privateKeyHex).not.toBe(kp2.privateKeyHex);
  });

  it('reports VC as configured when key is 64 chars', async () => {
    const { isVCConfigured } = await import('../vcKeyManager.js');
    expect(isVCConfigured()).toBe(true);
  });
});

// ─── VC Issuer Tests ────────────────────────────────────────

describe('vcIssuer', () => {
  // Mock session state for a completed verification
  const mockSessionState = {
    session_id: 'test-session',
    current_step: 'COMPLETE',
    issuing_country: 'US',
    rejection_reason: null,
    rejection_detail: null,
    front_extraction: {
      ocr: {
        full_name: 'Jane Doe',
        date_of_birth: '1990-01-15',
        id_number: 'D1234567',
        expiry_date: '2030-12-31',
        nationality: 'US',
        detected_document_type: 'drivers_license',
      },
      face_embedding: [0.1, 0.2],
      face_confidence: 0.95,
      ocr_confidence: 0.88,
      mrz_from_front: null,
      authenticity: { score: 0.92, flags: [], isAuthentic: true },
    },
    back_extraction: null,
    cross_validation: { verdict: 'PASS', score: 0.95, has_critical_failure: false, failures: [] },
    face_match: { similarity_score: 0.92, passed: true, threshold_used: 0.65 },
    liveness: { passed: true, score: 0.98 },
    deepfake_check: null,
    aml_screening: null,
    created_at: '2026-04-01T00:00:00Z',
    updated_at: '2026-04-01T00:01:00Z',
    completed_at: '2026-04-01T00:01:00Z',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects issuance for non-completed verifications', async () => {
    // Mock: no existing credential
    const chain1 = mockSupabaseChain(null);
    // Mock: load session state — non-complete
    const chain2 = mockSupabaseChain({ context: { ...mockSessionState, current_step: 'AWAITING_FRONT' } });

    (supabase.from as any)
      .mockReturnValueOnce(chain1) // verifiable_credentials check
      .mockReturnValueOnce(chain2); // verification_contexts

    const { issueIdentityCredential } = await import('../vcIssuer.js');
    await expect(issueIdentityCredential('ver-1', 'dev-1'))
      .rejects.toThrow('Credential can only be issued for completed verifications');
  });

  it('rejects issuance for manual_review verifications', async () => {
    const chain1 = mockSupabaseChain(null);
    const reviewState = {
      ...mockSessionState,
      cross_validation: { verdict: 'REVIEW', score: 0.80, has_critical_failure: false, failures: [] },
    };
    const chain2 = mockSupabaseChain({ context: reviewState });

    (supabase.from as any)
      .mockReturnValueOnce(chain1)
      .mockReturnValueOnce(chain2);

    const { issueIdentityCredential } = await import('../vcIssuer.js');
    await expect(issueIdentityCredential('ver-1', 'dev-1'))
      .rejects.toThrow('manual review');
  });

  it('rejects if credential already issued', async () => {
    const chain1 = mockSupabaseChain({ credential_jti: 'urn:uuid:existing' });

    (supabase.from as any).mockReturnValueOnce(chain1);

    const { issueIdentityCredential } = await import('../vcIssuer.js');
    await expect(issueIdentityCredential('ver-1', 'dev-1'))
      .rejects.toThrow('already been issued');
  });

  it('issues a valid JWT-VC for a completed verification', async () => {
    // 1. No existing credential
    const chain1 = mockSupabaseChain(null);
    // 2. Session state
    const chain2 = mockSupabaseChain({ context: mockSessionState });
    // 3. Insert credential record
    const chain3 = mockSupabaseChain(null);

    (supabase.from as any)
      .mockReturnValueOnce(chain1)
      .mockReturnValueOnce(chain2)
      .mockReturnValueOnce(chain3);

    const { issueIdentityCredential } = await import('../vcIssuer.js');
    const result = await issueIdentityCredential('ver-1', 'dev-1');

    expect(result.jwt).toBeTruthy();
    expect(typeof result.jwt).toBe('string');
    // JWT has 3 parts separated by dots
    expect(result.jwt.split('.').length).toBe(3);
    expect(result.jti).toMatch(/^urn:uuid:/);
    expect(result.expiresAt).toBeInstanceOf(Date);
    // TTL should be ~365 days from now
    const daysDiff = (result.expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
    expect(daysDiff).toBeGreaterThan(360);
    expect(daysDiff).toBeLessThan(370);
  });

  it('JWT payload contains correct claims', async () => {
    const chain1 = mockSupabaseChain(null);
    const chain2 = mockSupabaseChain({ context: mockSessionState });
    const chain3 = mockSupabaseChain(null);

    (supabase.from as any)
      .mockReturnValueOnce(chain1)
      .mockReturnValueOnce(chain2)
      .mockReturnValueOnce(chain3);

    const { issueIdentityCredential } = await import('../vcIssuer.js');
    const result = await issueIdentityCredential('ver-1', 'dev-1');

    // Decode JWT payload (base64url)
    const payloadB64 = result.jwt.split('.')[1];
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString());

    // Check VC claims
    expect(payload.vc).toBeDefined();
    expect(payload.vc.type).toContain('VerifiableCredential');
    expect(payload.vc.type).toContain('IdentityCredential');
    expect(payload.vc.credentialSubject.name).toBe('Jane Doe');
    expect(payload.vc.credentialSubject.dateOfBirth).toBe('1990-01-15');
    expect(payload.vc.credentialSubject.nationality).toBe('US');
    expect(payload.vc.credentialSubject.documentType).toBe('drivers_license');
    expect(payload.vc.credentialSubject.faceMatchScore).toBe(0.92);

    // Check issuer
    expect(payload.iss).toBe('did:web:test.example.com');

    // Check algorithm in header
    const headerB64 = result.jwt.split('.')[0];
    const header = JSON.parse(Buffer.from(headerB64, 'base64url').toString());
    expect(header.alg).toBe('EdDSA');
  });
});

// ─── Revocation Tests ───────────────────────────────────────

describe('revokeCredential', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('revokes an active credential', async () => {
    const chain1 = mockSupabaseChain({ id: 'vc-id', revoked_at: null });
    const chain2 = mockSupabaseChain(null);

    (supabase.from as any)
      .mockReturnValueOnce(chain1)
      .mockReturnValueOnce(chain2);

    const { revokeCredential } = await import('../vcIssuer.js');
    await expect(revokeCredential('urn:uuid:test', 'dev-1', 'no longer needed'))
      .resolves.toBeUndefined();
  });

  it('throws if credential not found', async () => {
    const chain1 = mockSupabaseChain(null);
    (supabase.from as any).mockReturnValueOnce(chain1);

    const { revokeCredential } = await import('../vcIssuer.js');
    await expect(revokeCredential('urn:uuid:nonexistent', 'dev-1'))
      .rejects.toThrow('not found');
  });

  it('throws if credential already revoked', async () => {
    const chain1 = mockSupabaseChain({ id: 'vc-id', revoked_at: '2026-01-01T00:00:00Z' });
    (supabase.from as any).mockReturnValueOnce(chain1);

    const { revokeCredential } = await import('../vcIssuer.js');
    await expect(revokeCredential('urn:uuid:test', 'dev-1'))
      .rejects.toThrow('already revoked');
  });
});

// ─── Status Check Tests ─────────────────────────────────────

describe('checkCredentialStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns active for valid credential', async () => {
    const futureDate = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
    const chain1 = mockSupabaseChain({ revoked_at: null, revocation_reason: null, expires_at: futureDate });
    (supabase.from as any).mockReturnValueOnce(chain1);

    const { checkCredentialStatus } = await import('../vcIssuer.js');
    const status = await checkCredentialStatus('urn:uuid:active');
    expect(status.active).toBe(true);
  });

  it('returns inactive for revoked credential', async () => {
    const chain1 = mockSupabaseChain({ revoked_at: '2026-01-01', revocation_reason: 'test', expires_at: '2028-01-01' });
    (supabase.from as any).mockReturnValueOnce(chain1);

    const { checkCredentialStatus } = await import('../vcIssuer.js');
    const status = await checkCredentialStatus('urn:uuid:revoked');
    expect(status.active).toBe(false);
    expect(status.reason).toBe('revoked');
  });

  it('returns inactive for expired credential', async () => {
    const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const chain1 = mockSupabaseChain({ revoked_at: null, revocation_reason: null, expires_at: pastDate });
    (supabase.from as any).mockReturnValueOnce(chain1);

    const { checkCredentialStatus } = await import('../vcIssuer.js');
    const status = await checkCredentialStatus('urn:uuid:expired');
    expect(status.active).toBe(false);
    expect(status.reason).toBe('expired');
  });

  it('returns inactive for unknown JTI', async () => {
    const chain1 = mockSupabaseChain(null);
    (supabase.from as any).mockReturnValueOnce(chain1);

    const { checkCredentialStatus } = await import('../vcIssuer.js');
    const status = await checkCredentialStatus('urn:uuid:unknown');
    expect(status.active).toBe(false);
    expect(status.reason).toBe('not_found');
  });
});
