import { createVerifiableCredentialJwt } from 'did-jwt-vc';
import type { CredentialPayload, Issuer } from 'did-jwt-vc';
import crypto from 'node:crypto';
import { supabase } from '@/config/database.js';
import { loadSessionState } from '@/verification/statusReader.js';
import { getIssuerDID, getIssuerSigner, isVCConfigured } from './vcKeyManager.js';

const VC_TTL_DAYS = parseInt(process.env.VC_CREDENTIAL_TTL_DAYS || '730', 10);

export interface IssuedCredential {
  jwt: string;
  jti: string;
  expiresAt: Date;
}

/**
 * Issue a W3C Verifiable Credential (JWT-VC) for a completed verification.
 *
 * Claims are mapped from the verification session state:
 *   - front_extraction.ocr.full_name → name
 *   - front_extraction.ocr.date_of_birth → dateOfBirth
 *   - front_extraction.ocr.nationality → nationality
 *   - front_extraction.ocr.detected_document_type → documentType
 *   - face_match.similarity_score → faceMatchScore
 *   - completed_at → verifiedAt
 */
export async function issueIdentityCredential(
  verificationId: string,
  developerId: string,
): Promise<IssuedCredential> {
  if (!isVCConfigured()) {
    throw new Error('Verifiable Credentials are not configured — VC_ISSUER_PRIVATE_KEY is missing');
  }

  // Check if a credential was already issued for this verification
  const { data: existing } = await supabase
    .from('verifiable_credentials')
    .select('credential_jti')
    .eq('verification_request_id', verificationId)
    .eq('developer_id', developerId)
    .is('revoked_at', null)
    .maybeSingle();

  if (existing) {
    throw new Error('A credential has already been issued for this verification');
  }

  // Load session state
  const state = await loadSessionState(verificationId);
  if (!state) {
    throw new Error('Verification session not found');
  }
  if (state.current_step !== 'COMPLETE') {
    throw new Error('Credential can only be issued for completed verifications');
  }

  // Ensure this is a verified result (not manual_review or failed)
  const needsReview = state.cross_validation?.verdict === 'REVIEW'
    || !!state.face_match?.skipped_reason;
  if (needsReview) {
    throw new Error('Credential cannot be issued for verifications in manual review');
  }

  const ocr = state.front_extraction?.ocr;
  if (!ocr?.full_name) {
    throw new Error('Verification is missing required OCR data for credential issuance');
  }

  const jti = `urn:uuid:${crypto.randomUUID()}`;
  const issuedAt = new Date();
  const expiresAt = new Date(issuedAt);
  expiresAt.setDate(expiresAt.getDate() + VC_TTL_DAYS);

  const issuerDid = getIssuerDID();

  const credentialPayload: CredentialPayload = {
    '@context': ['https://www.w3.org/2018/credentials/v1'],
    type: ['VerifiableCredential', 'IdentityCredential'],
    id: jti,
    issuer: { id: issuerDid },
    issuanceDate: issuedAt.toISOString(),
    expirationDate: expiresAt.toISOString(),
    credentialSubject: {
      name: ocr.full_name,
      dateOfBirth: ocr.date_of_birth,
      nationality: ocr.nationality || undefined,
      documentType: (ocr as any).detected_document_type || undefined,
      faceMatchScore: state.face_match?.similarity_score ?? undefined,
      verifiedAt: state.completed_at || issuedAt.toISOString(),
    },
  };

  const issuer: Issuer = {
    did: issuerDid,
    signer: getIssuerSigner(),
    alg: 'EdDSA',
  };

  const jwt = await createVerifiableCredentialJwt(credentialPayload, issuer);

  // Persist credential reference
  await supabase.from('verifiable_credentials').insert({
    verification_request_id: verificationId,
    developer_id: developerId,
    credential_jti: jti,
    issued_at: issuedAt.toISOString(),
    expires_at: expiresAt.toISOString(),
  });

  return { jwt, jti, expiresAt };
}

/**
 * Revoke a previously issued credential by JTI.
 */
export async function revokeCredential(
  jti: string,
  developerId: string,
  reason?: string,
): Promise<void> {
  const { data } = await supabase
    .from('verifiable_credentials')
    .select('id, revoked_at')
    .eq('credential_jti', jti)
    .eq('developer_id', developerId)
    .maybeSingle();

  if (!data) {
    throw new Error('Credential not found');
  }
  if (data.revoked_at) {
    throw new Error('Credential is already revoked');
  }

  await supabase
    .from('verifiable_credentials')
    .update({
      revoked_at: new Date().toISOString(),
      revocation_reason: reason || null,
    })
    .eq('id', data.id);
}

/**
 * Check if a credential is active (not revoked, not expired).
 * This is a public endpoint — no auth required.
 */
export async function checkCredentialStatus(jti: string): Promise<{
  active: boolean;
  reason?: string;
}> {
  const { data } = await supabase
    .from('verifiable_credentials')
    .select('revoked_at, revocation_reason, expires_at')
    .eq('credential_jti', jti)
    .maybeSingle();

  if (!data) {
    return { active: false, reason: 'not_found' };
  }

  if (data.revoked_at) {
    return { active: false, reason: 'revoked' };
  }

  if (new Date(data.expires_at) < new Date()) {
    return { active: false, reason: 'expired' };
  }

  return { active: true };
}
