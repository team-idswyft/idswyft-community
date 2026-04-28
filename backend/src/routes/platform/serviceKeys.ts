/**
 * Platform service-key endpoints (mint, list, rotate, revoke).
 *
 * CLOUD-ONLY. This file is stripped from the community mirror via
 * .community-ignore. The mounting in server.ts uses dynamic import +
 * try/catch so community builds skip the registration silently.
 *
 * Auth: X-Platform-Service-Token header (validated by
 * authenticatePlatformServiceToken). Typically called by vaas-backend
 * proxying for the platform-admin UI; the token never reaches the
 * browser.
 *
 * Endpoints (mounted at /api/platform/api-keys/service):
 *   POST   /                  → mint a new isk_* key (one-time plaintext return)
 *   GET    /                  → list all service keys (metadata only)
 *   POST   /:id/rotate        → mint a new key + revoke old (one-time plaintext return)
 *   DELETE /:id               → revoke (is_active=false, revoked_at=now())
 *
 * Spec: docs/features/2026-27-04-idswyft-service-key
 */

import { Router, Request, Response } from 'express';
import { body, param, validationResult } from 'express-validator';
import { supabase } from '@/config/database.js';
import { logger } from '@/utils/logger.js';
import { generatePrefixedAPIKey } from '../../middleware/auth.js';
import {
  catchAsync,
  ValidationError,
  NotFoundError,
} from '../../middleware/errorHandler.js';
import { authenticatePlatformServiceToken } from '../../middleware/platformAuth.js';

const router = Router();

// All endpoints require platform service token auth
router.use(authenticatePlatformServiceToken);

const SERVICE_PRODUCTS = ['gatepass', 'idswyft-internal'] as const;
const SERVICE_ENVIRONMENTS = ['production', 'staging', 'development'] as const;

type ServiceProduct = (typeof SERVICE_PRODUCTS)[number];
type ServiceEnvironment = (typeof SERVICE_ENVIRONMENTS)[number];

const SHADOW_DEVELOPER_EMAIL: Record<ServiceProduct, string> = {
  gatepass: 'service+gatepass@idswyft.app',
  'idswyft-internal': 'service+internal@idswyft.app',
};

/**
 * Look up the shadow developer ID for a given service_product.
 * Throws if the shadow row is missing (migration 58 didn't run, or
 * row was manually deleted).
 */
async function resolveShadowDeveloperId(
  product: ServiceProduct,
): Promise<string> {
  const email = SHADOW_DEVELOPER_EMAIL[product];
  const { data, error } = await supabase
    .from('developers')
    .select('id')
    .eq('email', email)
    .single();

  if (error || !data) {
    logger.error('Shadow developer row missing — has migration 58 run?', {
      product,
      email,
      error,
    });
    throw new Error(
      `Shadow developer for service_product=${product} not found. Run migration 58.`,
    );
  }
  return data.id as string;
}

function validate(req: Request): void {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const arr = errors.array();
    const msg = arr.map((e: any) => e.msg).join('; ');
    const first = arr[0] as any;
    throw new ValidationError(msg, first?.path ?? 'unknown', first?.value);
  }
}

/**
 * POST /api/platform/api-keys/service
 * Mint a new service key.
 *
 * Body:
 *   service_product: 'gatepass' | 'idswyft-internal'
 *   service_environment: 'production' | 'staging' | 'development'
 *   label: string (3-100 chars, human-readable)
 *
 * Returns the plaintext key ONCE. Only the hash is stored.
 */
router.post(
  '/',
  [
    body('service_product')
      .isIn(SERVICE_PRODUCTS as readonly string[])
      .withMessage(
        `service_product must be one of: ${SERVICE_PRODUCTS.join(', ')}`,
      ),
    body('service_environment')
      .isIn(SERVICE_ENVIRONMENTS as readonly string[])
      .withMessage(
        `service_environment must be one of: ${SERVICE_ENVIRONMENTS.join(', ')}`,
      ),
    body('label')
      .isString()
      .isLength({ min: 3, max: 100 })
      .withMessage('label must be 3-100 characters'),
  ],
  catchAsync(async (req: Request, res: Response) => {
    validate(req);

    const product = req.body.service_product as ServiceProduct;
    const environment = req.body.service_environment as ServiceEnvironment;
    const label = req.body.label as string;

    const shadowDeveloperId = await resolveShadowDeveloperId(product);
    const { key, hash, prefix } = generatePrefixedAPIKey('isk');

    const { data, error } = await supabase
      .from('api_keys')
      .insert({
        developer_id: shadowDeveloperId,
        key_hash: hash,
        key_prefix: prefix,
        name: label, // existing column; reuse for human-readable name
        is_sandbox: false,
        is_active: true,
        is_service: true,
        service_product: product,
        service_environment: environment,
        service_label: label,
      })
      .select('id, key_prefix, service_product, service_environment, service_label, created_at')
      .single();

    if (error || !data) {
      logger.error('Failed to insert service key', { error });
      throw new Error('Failed to mint service key');
    }

    logger.info('Service key minted', {
      id: data.id,
      product,
      environment,
      label,
    });

    res.status(201).json({
      id: data.id,
      key, // ONE-TIME PLAINTEXT
      key_prefix: data.key_prefix,
      service_product: data.service_product,
      service_environment: data.service_environment,
      service_label: data.service_label,
      created_at: data.created_at,
      warning:
        'This is the only time the plaintext key will be shown. Store it now in your secrets vault.',
    });
  }),
);

/**
 * GET /api/platform/api-keys/service
 * List all service keys (metadata only — no plaintext, no hash).
 */
router.get(
  '/',
  catchAsync(async (_req: Request, res: Response) => {
    const { data, error } = await supabase
      .from('api_keys')
      .select(
        'id, key_prefix, service_product, service_environment, service_label, is_active, last_used_at, created_at, revoked_at',
      )
      .eq('is_service', true)
      .order('created_at', { ascending: false });

    if (error) {
      logger.error('Failed to list service keys', { error });
      throw new Error('Failed to list service keys');
    }

    res.json({
      keys: data ?? [],
      count: data?.length ?? 0,
    });
  }),
);

/**
 * POST /api/platform/api-keys/service/:id/rotate
 * Mint a new isk_* with the same product/environment/label as the
 * existing key, then revoke the old one. Returns the new plaintext.
 */
router.post(
  '/:id/rotate',
  [param('id').isUUID().withMessage('id must be a UUID')],
  catchAsync(async (req: Request, res: Response) => {
    validate(req);
    const oldId = req.params.id;

    const { data: existing, error: lookupErr } = await supabase
      .from('api_keys')
      .select('id, developer_id, service_product, service_environment, service_label')
      .eq('id', oldId)
      .eq('is_service', true)
      .single();

    if (lookupErr || !existing) {
      throw new NotFoundError(`Service key ${oldId} not found`);
    }

    const { key, hash, prefix } = generatePrefixedAPIKey('isk');

    // Insert new key
    const { data: newKey, error: insertErr } = await supabase
      .from('api_keys')
      .insert({
        developer_id: existing.developer_id,
        key_hash: hash,
        key_prefix: prefix,
        name: existing.service_label,
        is_sandbox: false,
        is_active: true,
        is_service: true,
        service_product: existing.service_product,
        service_environment: existing.service_environment,
        service_label: existing.service_label,
      })
      .select('id, key_prefix, service_product, service_environment, service_label, created_at')
      .single();

    if (insertErr || !newKey) {
      logger.error('Failed to insert rotated service key', { insertErr });
      throw new Error('Rotation failed at insert step');
    }

    // Revoke old key
    const { error: revokeErr } = await supabase
      .from('api_keys')
      .update({
        is_active: false,
        revoked_at: new Date().toISOString(),
        revoked_reason: `Rotated to ${newKey.id}`,
      })
      .eq('id', oldId);

    if (revokeErr) {
      logger.error('Failed to revoke old service key during rotation', {
        oldId,
        newKeyId: newKey.id,
        revokeErr,
      });
      // The new key is live but the old one is still active.
      // Operator must manually revoke. Return 207 to signal partial success.
      res.status(207).json({
        id: newKey.id,
        key,
        warning:
          `Rotation partially succeeded: new key issued but old key (${oldId}) failed to revoke. Manually revoke it.`,
      });
      return;
    }

    logger.info('Service key rotated', { oldId, newId: newKey.id });

    res.status(200).json({
      id: newKey.id,
      key, // ONE-TIME PLAINTEXT
      key_prefix: newKey.key_prefix,
      service_product: newKey.service_product,
      service_environment: newKey.service_environment,
      service_label: newKey.service_label,
      created_at: newKey.created_at,
      revoked_old_id: oldId,
      warning:
        'This is the only time the plaintext key will be shown. Store it now.',
    });
  }),
);

/**
 * DELETE /api/platform/api-keys/service/:id
 * Revoke a service key. Sets is_active=false and revoked_at=now().
 */
router.delete(
  '/:id',
  [param('id').isUUID().withMessage('id must be a UUID')],
  catchAsync(async (req: Request, res: Response) => {
    validate(req);

    const { data, error } = await supabase
      .from('api_keys')
      .update({
        is_active: false,
        revoked_at: new Date().toISOString(),
        revoked_reason: 'Revoked via platform admin',
      })
      .eq('id', req.params.id)
      .eq('is_service', true)
      .select('id')
      .single();

    if (error || !data) {
      throw new NotFoundError(`Service key ${req.params.id} not found`);
    }

    logger.info('Service key revoked', { id: req.params.id });
    res.status(204).send();
  }),
);

export default router;
