import { verifyAsync, hashes } from '@noble/ed25519';
import { sha512 } from '@noble/hashes/sha2.js';

// noble/ed25519 v3+ requires explicit sha512 hash registration
hashes.sha512 = sha512;

export interface VerificationResult {
  valid: boolean;
  header: Record<string, unknown> | null;
  payload: Record<string, unknown> | null;
  claims: Record<string, unknown> | null;
  issuer: string | null;
  expiresAt: Date | null;
  expired: boolean;
  error?: string;
  didResolved: boolean;
}

// In-memory DID document cache
const didCache = new Map<string, { doc: any; fetchedAt: number }>();
const DID_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function base64urlDecode(str: string): Uint8Array {
  // Pad base64url to standard base64
  const padded = str.replace(/-/g, '+').replace(/_/g, '/');
  const padding = (4 - (padded.length % 4)) % 4;
  const b64 = padded + '='.repeat(padding);
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function decodeJwtSegment(segment: string): Record<string, unknown> | null {
  try {
    const bytes = base64urlDecode(segment);
    const text = new TextDecoder().decode(bytes);
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * Convert a did:web identifier to its HTTPS URL for the DID document.
 * did:web:api.idswyft.app → https://api.idswyft.app/.well-known/did.json
 * did:web:example.com:path:to → https://example.com/path/to/did.json
 */
function didWebToUrl(did: string): string | null {
  if (!did.startsWith('did:web:')) return null;
  const domainPath = did.slice('did:web:'.length);
  const decoded = decodeURIComponent(domainPath);
  const parts = decoded.split(':');
  const host = parts[0];
  const pathSegments = parts.slice(1);
  if (pathSegments.length === 0) {
    return `https://${host}/.well-known/did.json`;
  }
  return `https://${host}/${pathSegments.join('/')}/did.json`;
}

async function fetchDIDDocument(did: string): Promise<any> {
  const now = Date.now();

  // Evict stale cache entries
  for (const [key, val] of didCache) {
    if (now - val.fetchedAt >= DID_CACHE_TTL) didCache.delete(key);
  }

  // Check cache
  const cached = didCache.get(did);
  if (cached) return cached.doc;

  const url = didWebToUrl(did);
  if (!url) {
    throw new Error(`Unsupported DID method: ${did}. Only did:web is supported.`);
  }

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to resolve DID document: HTTP ${res.status}`);
  }

  const doc = await res.json();
  didCache.set(did, { doc, fetchedAt: now });
  return doc;
}

function extractPublicKey(didDoc: any, kid?: string): Uint8Array {
  const methods = didDoc.verificationMethod;
  if (!Array.isArray(methods) || methods.length === 0) {
    throw new Error('No verification methods in DID document');
  }

  let method;
  if (kid) {
    // Match by kid from JWT header
    method = methods.find((m: any) => m.id === kid);
    if (!method) {
      throw new Error(`Verification method not found for kid: ${kid}`);
    }
  } else {
    // Fallback: find first Ed25519 key
    method = methods.find(
      (m: any) =>
        m.publicKeyJwk?.crv === 'Ed25519' ||
        m.type === 'JsonWebKey2020',
    );
  }

  if (!method?.publicKeyJwk?.x) {
    throw new Error('No Ed25519 public key found in DID document');
  }

  return base64urlDecode(method.publicKeyJwk.x);
}

/**
 * Verify a JWT-VC entirely client-side using Ed25519.
 *
 * Steps:
 * 1. Split JWT into header.payload.signature
 * 2. Decode header — confirm alg: "EdDSA"
 * 3. Decode payload — extract iss (issuer DID), vc.credentialSubject, exp
 * 4. Resolve DID: did:web:X → https://X/.well-known/did.json
 * 5. Extract Ed25519 public key from verificationMethod
 * 6. Verify signature over header.payload using ed25519.verify()
 * 7. Check expiration
 */
export async function verifyCredential(
  jwt: string,
  onStage?: (stage: string) => void,
): Promise<VerificationResult> {
  onStage?.('DECODING JWT...');

  const parts = jwt.trim().split('.');
  if (parts.length !== 3) {
    return {
      valid: false, header: null, payload: null, claims: null,
      issuer: null, expiresAt: null, expired: false, didResolved: false,
      error: 'Invalid JWT format — expected 3 dot-separated segments',
    };
  }

  const [headerB64, payloadB64, signatureB64] = parts;

  // Decode header
  const header = decodeJwtSegment(headerB64);
  if (!header) {
    return {
      valid: false, header: null, payload: null, claims: null,
      issuer: null, expiresAt: null, expired: false, didResolved: false,
      error: 'Failed to decode JWT header',
    };
  }

  if (header.alg !== 'EdDSA') {
    return {
      valid: false, header, payload: null, claims: null,
      issuer: null, expiresAt: null, expired: false, didResolved: false,
      error: `Unsupported algorithm: ${header.alg} (expected EdDSA)`,
    };
  }

  // Decode payload
  const payload = decodeJwtSegment(payloadB64);
  if (!payload) {
    return {
      valid: false, header, payload: null, claims: null,
      issuer: null, expiresAt: null, expired: false, didResolved: false,
      error: 'Failed to decode JWT payload',
    };
  }

  const issuer = (payload.iss as string) || null;
  const vc = payload.vc as any;
  const claims = vc?.credentialSubject || null;
  const exp = payload.exp as number | undefined;
  const expiresAt = exp ? new Date(exp * 1000) : null;
  const expired = expiresAt ? expiresAt < new Date() : false;

  // Resolve DID and get public key
  if (!issuer) {
    return {
      valid: false, header, payload, claims, issuer, expiresAt, expired, didResolved: false,
      error: 'No issuer (iss) claim in JWT',
    };
  }

  onStage?.('RESOLVING DID DOCUMENT...');

  let publicKey: Uint8Array;
  let didResolved = false;
  try {
    const didDoc = await fetchDIDDocument(issuer);
    didResolved = true;
    publicKey = extractPublicKey(didDoc, header.kid as string | undefined);
  } catch (err) {
    return {
      valid: false, header, payload, claims, issuer, expiresAt, expired, didResolved,
      error: `DID resolution failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  onStage?.('VERIFYING ED25519 SIGNATURE...');

  // Verify Ed25519 signature
  // The message is the raw bytes of "header.payload" (base64url encoded, not decoded)
  const message = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
  const signature = base64urlDecode(signatureB64);

  try {
    const isValid = await verifyAsync(signature, message, publicKey);
    return {
      valid: isValid && !expired,
      header, payload, claims, issuer, expiresAt, expired, didResolved,
      error: !isValid
        ? 'Ed25519 signature verification failed'
        : expired
          ? 'Signature is valid but credential has expired'
          : undefined,
    };
  } catch (err) {
    return {
      valid: false, header, payload, claims, issuer, expiresAt, expired, didResolved,
      error: `Signature verification error: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
