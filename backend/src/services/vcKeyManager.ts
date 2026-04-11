import { EdDSASigner, hexToBytes, bytesToHex } from 'did-jwt';
import * as ed25519 from '@noble/ed25519';
import { sha512 } from '@noble/hashes/sha512';

// noble/ed25519 v2+ requires explicit sha512 hash registration
ed25519.hashes.sha512 = sha512 as any;

const VC_ISSUER_DID = process.env.VC_ISSUER_DID || 'did:web:api.idswyft.app';
const VC_ISSUER_PRIVATE_KEY = process.env.VC_ISSUER_PRIVATE_KEY || '';

/**
 * Returns the issuer DID string (did:web:...).
 */
export function getIssuerDID(): string {
  return VC_ISSUER_DID;
}

/**
 * Returns an EdDSA signer for JWT signing using the configured private key.
 * The private key is a 32-byte Ed25519 seed stored as 64 hex chars.
 */
export function getIssuerSigner(): ReturnType<typeof EdDSASigner> {
  if (!VC_ISSUER_PRIVATE_KEY) {
    throw new Error('VC_ISSUER_PRIVATE_KEY is not configured');
  }
  const privateKeyBytes = hexToBytes(VC_ISSUER_PRIVATE_KEY);
  return EdDSASigner(privateKeyBytes);
}

/**
 * Derives the Ed25519 public key from the private seed and returns it
 * as a JWK for inclusion in the DID document.
 */
export function getPublicKeyJWK(): { kty: string; crv: string; x: string } {
  if (!VC_ISSUER_PRIVATE_KEY) {
    throw new Error('VC_ISSUER_PRIVATE_KEY is not configured');
  }
  const privateKeyBytes = hexToBytes(VC_ISSUER_PRIVATE_KEY);
  const publicKeyBytes = ed25519.getPublicKey(privateKeyBytes);
  const x = Buffer.from(publicKeyBytes).toString('base64url');
  return { kty: 'OKP', crv: 'Ed25519', x };
}

/**
 * Returns the Ed25519 public key as raw hex (for logging / diagnostics).
 */
export function getPublicKeyHex(): string {
  if (!VC_ISSUER_PRIVATE_KEY) {
    throw new Error('VC_ISSUER_PRIVATE_KEY is not configured');
  }
  const privateKeyBytes = hexToBytes(VC_ISSUER_PRIVATE_KEY);
  const publicKeyBytes = ed25519.getPublicKey(privateKeyBytes);
  return bytesToHex(publicKeyBytes);
}

/**
 * Utility: generate a fresh Ed25519 key pair for initial setup.
 * Returns hex-encoded seed (private) and public key.
 */
export function generateKeyPair(): { privateKeyHex: string; publicKeyHex: string } {
  const seed = ed25519.utils.randomSecretKey();
  const publicKey = ed25519.getPublicKey(seed);
  return {
    privateKeyHex: bytesToHex(seed),
    publicKeyHex: bytesToHex(publicKey),
  };
}

/**
 * Returns true if a VC issuer private key is configured.
 */
export function isVCConfigured(): boolean {
  return VC_ISSUER_PRIVATE_KEY.length === 64;
}
