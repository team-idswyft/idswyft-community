import { describe, it, expect } from 'vitest';
import { buildDemoCredential } from './CredentialStep';

// Decode a base64url string back to a JSON object so tests can
// inspect the JWT parts without depending on any external VC library.
function base64UrlDecode(input: string): any {
  const padded = input + '='.repeat((4 - (input.length % 4)) % 4);
  const base64 = padded.replace(/-/g, '+').replace(/_/g, '/');
  return JSON.parse(Buffer.from(base64, 'base64').toString('utf-8'));
}

describe('buildDemoCredential', () => {
  const TEST_VERIFICATION_ID = 'ver_test_12345';

  it('returns an object with jwt, jti, and expires_at fields', () => {
    const result = buildDemoCredential(TEST_VERIFICATION_ID);
    expect(typeof result.jwt).toBe('string');
    expect(typeof result.jti).toBe('string');
    expect(typeof result.expires_at).toBe('string');
  });

  it('produces a JWT with exactly three non-empty dot-separated parts', () => {
    const { jwt } = buildDemoCredential(TEST_VERIFICATION_ID);
    const parts = jwt.split('.');
    expect(parts).toHaveLength(3);
    expect(parts[0].length).toBeGreaterThan(0);
    expect(parts[1].length).toBeGreaterThan(0);
    expect(parts[2].length).toBeGreaterThan(0);
  });

  it('encodes the JWT header with EdDSA alg and demo-key kid', () => {
    const { jwt } = buildDemoCredential(TEST_VERIFICATION_ID);
    const header = base64UrlDecode(jwt.split('.')[0]);
    expect(header).toEqual({
      alg: 'EdDSA',
      typ: 'JWT',
      kid: 'did:web:idswyft.app#demo-key',
    });
  });

  it('encodes a W3C VC payload with the expected structure', () => {
    const { jwt } = buildDemoCredential(TEST_VERIFICATION_ID);
    const payload = base64UrlDecode(jwt.split('.')[1]);
    expect(payload.iss).toBe('did:web:idswyft.app');
    expect(payload.vc['@context']).toContain('https://www.w3.org/2018/credentials/v1');
    expect(payload.vc.type).toEqual(['VerifiableCredential', 'IdentityCredential']);
    expect(payload.vc.issuer).toBe('did:web:idswyft.app');
    expect(typeof payload.vc.issuanceDate).toBe('string');
  });

  it('passes verificationId through to credentialSubject', () => {
    const { jwt } = buildDemoCredential(TEST_VERIFICATION_ID);
    const payload = base64UrlDecode(jwt.split('.')[1]);
    expect(payload.vc.credentialSubject.verificationId).toBe(TEST_VERIFICATION_ID);
  });

  it('marks credentialSubject with demo: true flag', () => {
    const { jwt } = buildDemoCredential(TEST_VERIFICATION_ID);
    const payload = base64UrlDecode(jwt.split('.')[1]);
    expect(payload.vc.credentialSubject.demo).toBe(true);
  });

  it('populates credentialSubject with hardcoded demo PII placeholders', () => {
    const { jwt } = buildDemoCredential(TEST_VERIFICATION_ID);
    const payload = base64UrlDecode(jwt.split('.')[1]);
    expect(payload.vc.credentialSubject.fullName).toBe('DEMO HOLDER');
    expect(payload.vc.credentialSubject.dateOfBirth).toBe('1990-01-01');
    expect(payload.vc.credentialSubject.issuingCountry).toBe('USA');
    expect(payload.vc.credentialSubject.documentType).toBe('drivers_license');
    expect(payload.vc.credentialSubject.verified).toBe(true);
  });

  it('generates a jti that is a spec-compliant UUID v4 prefixed with urn:uuid:', () => {
    const { jti } = buildDemoCredential(TEST_VERIFICATION_ID);
    // UUID v4: 8-4-4-4-12, version nibble = 4, variant nibble in {8,9,a,b}
    expect(jti).toMatch(
      /^urn:uuid:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });

  it('uses did:example: for the subject ID and mirrors it into credentialSubject.id', () => {
    const { jwt } = buildDemoCredential(TEST_VERIFICATION_ID);
    const payload = base64UrlDecode(jwt.split('.')[1]);
    expect(payload.sub).toMatch(/^did:example:demo-/);
    expect(payload.vc.credentialSubject.id).toBe(payload.sub);
  });

  it('sets exp exactly one year after iat and makes nbf equal to iat', () => {
    const { jwt } = buildDemoCredential(TEST_VERIFICATION_ID);
    const payload = base64UrlDecode(jwt.split('.')[1]);
    const ONE_YEAR_SECONDS = 365 * 24 * 60 * 60;
    expect(payload.exp - payload.iat).toBe(ONE_YEAR_SECONDS);
    expect(payload.nbf).toBe(payload.iat);
  });

  it('returns expires_at as a valid ISO 8601 string matching payload.exp', () => {
    const { jwt, expires_at } = buildDemoCredential(TEST_VERIFICATION_ID);
    const payload = base64UrlDecode(jwt.split('.')[1]);
    const expiresDate = new Date(expires_at);
    expect(Number.isNaN(expiresDate.getTime())).toBe(false);
    expect(Math.floor(expiresDate.getTime() / 1000)).toBe(payload.exp);
  });

  it('uses the hardcoded, clearly-marked demo signature', () => {
    const { jwt } = buildDemoCredential(TEST_VERIFICATION_ID);
    const signature = jwt.split('.')[2];
    expect(signature).toBe('DEMO_SIGNATURE_NOT_VALID_FOR_REAL_VERIFICATION');
  });

  it('generates unique jti and sub values across invocations', () => {
    const jtis = new Set<string>();
    const subs = new Set<string>();
    for (let i = 0; i < 20; i++) {
      const { jwt, jti } = buildDemoCredential(TEST_VERIFICATION_ID);
      const payload = base64UrlDecode(jwt.split('.')[1]);
      jtis.add(jti);
      subs.add(payload.sub);
    }
    expect(jtis.size).toBe(20);
    expect(subs.size).toBe(20);
  });

  it('produces base64url-encoded parts with no padding or non-url-safe chars', () => {
    const { jwt } = buildDemoCredential(TEST_VERIFICATION_ID);
    const [headerPart, payloadPart] = jwt.split('.');
    // No padding
    expect(headerPart).not.toContain('=');
    expect(payloadPart).not.toContain('=');
    // Only url-safe base64 alphabet
    expect(headerPart).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(payloadPart).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('round-trips unicode verificationId cleanly through base64url encoding', () => {
    const unicodeId = 'ver_日本_測試_🔐';
    const { jwt } = buildDemoCredential(unicodeId);
    const payload = base64UrlDecode(jwt.split('.')[1]);
    expect(payload.vc.credentialSubject.verificationId).toBe(unicodeId);
  });

  it('uses present-time iat (within a few seconds of now)', () => {
    const before = Math.floor(Date.now() / 1000);
    const { jwt } = buildDemoCredential(TEST_VERIFICATION_ID);
    const after = Math.floor(Date.now() / 1000);
    const payload = base64UrlDecode(jwt.split('.')[1]);
    expect(payload.iat).toBeGreaterThanOrEqual(before);
    expect(payload.iat).toBeLessThanOrEqual(after);
  });
});
