import express, { Request, Response } from 'express';
import { getIssuerDID, getPublicKeyJWK, isVCConfigured } from '@/services/vcKeyManager.js';

const router = express.Router();

/**
 * GET /.well-known/did.json
 * Public DID document for did:web resolution.
 * Resolvers fetch https://api.idswyft.app/.well-known/did.json
 * when resolving did:web:api.idswyft.app.
 */
router.get('/did.json', (req: Request, res: Response) => {
  if (!isVCConfigured()) {
    return res.status(404).json({ error: 'DID document not available — VC not configured' });
  }

  const did = getIssuerDID();
  const publicKeyJwk = getPublicKeyJWK();

  res.setHeader('Content-Type', 'application/did+json');
  res.setHeader('Cache-Control', 'public, max-age=3600');

  res.json({
    '@context': [
      'https://www.w3.org/ns/did/v1',
      'https://w3id.org/security/suites/jws-2020/v1',
    ],
    id: did,
    verificationMethod: [
      {
        id: `${did}#key-1`,
        type: 'JsonWebKey2020',
        controller: did,
        publicKeyJwk,
      },
    ],
    authentication: [`${did}#key-1`],
    assertionMethod: [`${did}#key-1`],
  });
});

export default router;
