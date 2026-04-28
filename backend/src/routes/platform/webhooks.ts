/**
 * Platform webhook endpoints (register, list, delete, rotate).
 *
 * CLOUD-ONLY. Stripped from community mirror via .community-ignore.
 * Mounted at /api/platform/webhooks via dynamic import in server.ts.
 *
 * Auth: X-Platform-Service-Token (same as the service-keys router).
 *
 * Purpose: register webhooks against the SHADOW developer rows that
 * own service keys (e.g. service+gatepass@idswyft.app). Verifications
 * driven by isk_* keys have verification_requests.developer_id set to
 * the shadow developer, so webhook lookup
 * (getActiveWebhooksForDeveloper) needs webhook rows under that same
 * shadow developer's UUID — otherwise no webhooks fire.
 *
 * The actual webhook delivery (signing, retry, audit log via
 * webhook_deliveries) is the existing webhookService.sendWebhook
 * machinery. This router only manages the webhook registration
 * lifecycle.
 *
 * Endpoints:
 *   POST   /                  → register a new webhook (one-time plaintext secret return)
 *   GET    /                  → list webhooks for service products
 *   POST   /:id/rotate        → rotate signing secret (returns new plaintext)
 *   DELETE /:id               → delete webhook (hard delete; existing deliveries kept via FK)
 */

import { Router, Request, Response } from 'express';
import { body, param, validationResult } from 'express-validator';
import crypto from 'crypto';
import { supabase } from '@/config/database.js';
import { logger } from '@/utils/logger.js';
import {
  catchAsync,
  ValidationError,
  NotFoundError,
} from '../../middleware/errorHandler.js';
import { authenticatePlatformServiceToken } from '../../middleware/platformAuth.js';
import { validateWebhookUrl } from '@/utils/validateUrl.js';
import { WEBHOOK_EVENT_NAMES } from '@/constants/webhookEvents.js';

const router = Router();

router.use(authenticatePlatformServiceToken);

const SERVICE_PRODUCTS = ['gatepass', 'idswyft-internal'] as const;
type ServiceProduct = (typeof SERVICE_PRODUCTS)[number];

const SHADOW_DEVELOPER_EMAIL: Record<ServiceProduct, string> = {
  gatepass: 'service+gatepass@idswyft.app',
  'idswyft-internal': 'service+internal@idswyft.app',
};

async function resolveShadowDeveloperId(product: ServiceProduct): Promise<string> {
  const { data, error } = await supabase
    .from('developers')
    .select('id')
    .eq('email', SHADOW_DEVELOPER_EMAIL[product])
    .single();

  if (error || !data) {
    logger.error('Shadow developer row missing for platform webhook', { product, error });
    throw new Error(`Shadow developer for service_product=${product} not found. Run migration 58.`);
  }
  return data.id as string;
}

/**
 * Set of shadow developer UUIDs, populated lazily on first use. Used to
 * gate rotate/delete so platform endpoints can only manage webhooks owned
 * by the known shadow rows — not by any real developer who happens to
 * have an email starting with "service+".
 */
let shadowDeveloperIds: Set<string> | null = null;

async function getShadowDeveloperIds(): Promise<Set<string>> {
  if (shadowDeveloperIds) return shadowDeveloperIds;

  const emails = Object.values(SHADOW_DEVELOPER_EMAIL);
  const { data, error } = await supabase
    .from('developers')
    .select('id, email')
    .in('email', emails);

  if (error || !data) {
    logger.error('Failed to resolve shadow developer IDs', { error });
    // Fail closed: empty set means rotate/delete reject everything until
    // the lookup succeeds.
    return new Set();
  }
  shadowDeveloperIds = new Set(data.map((row: any) => row.id as string));
  return shadowDeveloperIds;
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

function generateSigningSecret(): string {
  return `whsec_${crypto.randomBytes(24).toString('hex')}`;
}

function maskSecret(secret: string): string {
  if (!secret || secret.length < 14) return '***';
  return `${secret.slice(0, 6)}${'*'.repeat(8)}${secret.slice(-4)}`;
}

/**
 * POST /api/platform/webhooks
 *
 * Body:
 *   service_product: 'gatepass' | 'idswyft-internal'
 *   url: HTTPS URL (SSRF-validated)
 *   events?: string[] (default: all WEBHOOK_EVENT_NAMES)
 *   is_sandbox?: boolean (default false)
 *
 * Returns the plaintext signing secret ONCE.
 */
router.post(
  '/',
  [
    body('service_product')
      .isIn(SERVICE_PRODUCTS as readonly string[])
      .withMessage(`service_product must be one of: ${SERVICE_PRODUCTS.join(', ')}`),
    body('url')
      .isString()
      // HTTPS-only — mirrors backend/src/routes/developer/webhooks.ts. Webhook
      // payloads carry HMAC signatures over PII fragments (OCR data); plaintext
      // HTTP would leak content even with the signature intact.
      .isURL({ protocols: ['https'], require_protocol: true })
      .withMessage('url must be a valid https URL'),
    body('events')
      .optional()
      .isArray()
      .withMessage('events must be an array of strings'),
    body('is_sandbox').optional().isBoolean(),
  ],
  catchAsync(async (req: Request, res: Response) => {
    validate(req);

    const product = req.body.service_product as ServiceProduct;
    const url = req.body.url as string;
    const events: string[] | undefined = req.body.events;
    const isSandbox: boolean = !!req.body.is_sandbox;

    // SSRF protection — same validator the dev-portal flow uses
    try {
      validateWebhookUrl(url);
    } catch (err: any) {
      throw new ValidationError(err.message, 'url', url);
    }

    // Validate events against the catalog
    if (events && events.length > 0) {
      const invalid = events.filter((e) => !WEBHOOK_EVENT_NAMES.includes(e));
      if (invalid.length > 0) {
        throw new ValidationError(
          `Invalid webhook events: ${invalid.join(', ')}. Valid: ${WEBHOOK_EVENT_NAMES.join(', ')}`,
          'events',
          invalid,
        );
      }
    }

    const shadowDeveloperId = await resolveShadowDeveloperId(product);

    // Duplicate guard: same URL + sandbox + shadow developer
    const { data: existing } = await supabase
      .from('webhooks')
      .select('id')
      .eq('developer_id', shadowDeveloperId)
      .eq('url', url)
      .eq('is_sandbox', isSandbox)
      .is('api_key_id', null)
      .single();

    if (existing) {
      throw new ValidationError(
        `Webhook already exists for service_product=${product}, url=${url}, is_sandbox=${isSandbox}`,
        'url',
        url,
      );
    }

    const secret = generateSigningSecret();

    const { data, error } = await supabase
      .from('webhooks')
      .insert({
        developer_id: shadowDeveloperId,
        url,
        is_sandbox: isSandbox,
        events: events && events.length > 0 ? events : WEBHOOK_EVENT_NAMES,
        secret_key: secret,
        is_active: true,
      })
      .select('id, url, is_sandbox, is_active, created_at, events')
      .single();

    if (error || !data) {
      logger.error('Failed to insert platform webhook', { error });
      throw new Error('Failed to register platform webhook');
    }

    logger.info('Platform webhook registered', {
      id: data.id,
      service_product: product,
      url,
      is_sandbox: isSandbox,
    });

    res.status(201).json({
      id: data.id,
      service_product: product,
      url: data.url,
      events: data.events,
      is_sandbox: data.is_sandbox,
      is_active: data.is_active,
      created_at: data.created_at,
      signing_secret: secret, // ONE-TIME PLAINTEXT
      warning:
        'This is the only time the plaintext signing secret will be shown. Store it now in your secrets vault.',
    });
  }),
);

/**
 * GET /api/platform/webhooks
 *
 * Optional query: ?service_product=gatepass to filter
 *
 * Returns metadata for webhooks registered on shadow developers.
 * Signing secrets are masked (first 6 + middle stars + last 4).
 */
router.get(
  '/',
  catchAsync(async (req: Request, res: Response) => {
    const productFilter = (req.query.service_product as string | undefined) ?? null;

    if (productFilter && !SERVICE_PRODUCTS.includes(productFilter as ServiceProduct)) {
      throw new ValidationError(
        `service_product must be one of: ${SERVICE_PRODUCTS.join(', ')}`,
        'service_product',
        productFilter,
      );
    }

    // Build the developer_id IN(...) list — only shadow developers' UUIDs
    const shadowEmails = productFilter
      ? [SHADOW_DEVELOPER_EMAIL[productFilter as ServiceProduct]]
      : Object.values(SHADOW_DEVELOPER_EMAIL);

    const { data: shadowRows, error: shadowErr } = await supabase
      .from('developers')
      .select('id, email')
      .in('email', shadowEmails);

    if (shadowErr) {
      logger.error('Failed to look up shadow developers', { error: shadowErr });
      throw new Error('Failed to list webhooks');
    }
    if (!shadowRows || shadowRows.length === 0) {
      return res.json({ webhooks: [], count: 0 });
    }

    // Map each developer_id back to its service_product so we can decorate the response
    const productByDevId = new Map<string, ServiceProduct>();
    for (const row of shadowRows) {
      const product = (Object.entries(SHADOW_DEVELOPER_EMAIL).find(
        ([, email]) => email === row.email,
      )?.[0] ?? 'idswyft-internal') as ServiceProduct;
      productByDevId.set(row.id, product);
    }

    const { data, error } = await supabase
      .from('webhooks')
      .select('id, developer_id, url, is_sandbox, is_active, events, secret_key, created_at')
      .in('developer_id', Array.from(productByDevId.keys()))
      .order('created_at', { ascending: false });

    if (error) {
      logger.error('Failed to list platform webhooks', { error });
      throw new Error('Failed to list webhooks');
    }

    const webhooks = (data ?? []).map((w: any) => ({
      id: w.id,
      service_product: productByDevId.get(w.developer_id) ?? 'unknown',
      url: w.url,
      events: w.events,
      is_sandbox: w.is_sandbox,
      is_active: w.is_active,
      created_at: w.created_at,
      signing_secret_masked: maskSecret(w.secret_key ?? ''),
    }));

    res.json({ webhooks, count: webhooks.length });
  }),
);

/**
 * POST /api/platform/webhooks/:id/rotate
 * Generates a new signing secret, updates the row, returns the new plaintext.
 * Old secret is INVALIDATED IMMEDIATELY — coordinate with consumer before rotating.
 */
router.post(
  '/:id/rotate',
  [param('id').isUUID().withMessage('id must be a UUID')],
  catchAsync(async (req: Request, res: Response) => {
    validate(req);

    // Confirm webhook exists + belongs to a shadow developer
    const { data: existing, error: lookupErr } = await supabase
      .from('webhooks')
      .select('id, developer_id, url')
      .eq('id', req.params.id)
      .single();

    if (lookupErr || !existing) {
      throw new NotFoundError(`Webhook ${req.params.id} not found`);
    }

    // Gate: only manage webhooks owned by known shadow developer UUIDs.
    // Email-prefix matching would also accept a real developer who happened
    // to register with email like "service+app@idswyft.app".
    const shadowIds = await getShadowDeveloperIds();
    if (!shadowIds.has(existing.developer_id)) {
      throw new ValidationError(
        'This endpoint only manages webhooks on shadow developer rows. Use /api/developer/webhooks for developer webhooks.',
        'id',
        req.params.id,
      );
    }

    const newSecret = generateSigningSecret();

    const { error } = await supabase
      .from('webhooks')
      .update({ secret_key: newSecret })
      .eq('id', req.params.id);

    if (error) {
      logger.error('Failed to rotate platform webhook secret', { error });
      throw new Error('Failed to rotate webhook secret');
    }

    logger.info('Platform webhook secret rotated', { id: req.params.id });

    res.status(200).json({
      id: req.params.id,
      signing_secret: newSecret,
      warning:
        'This is the only time the new signing secret will be shown. Update the consumer immediately — old secret is INVALID NOW (no overlap window).',
    });
  }),
);

/**
 * DELETE /api/platform/webhooks/:id
 * Hard delete. Existing webhook_deliveries rows reference this via FK ON DELETE
 * SET NULL, so historical delivery audit trail is preserved.
 */
router.delete(
  '/:id',
  [param('id').isUUID().withMessage('id must be a UUID')],
  catchAsync(async (req: Request, res: Response) => {
    validate(req);

    // Verify it's a platform webhook (shadow developer) before deleting
    const { data: existing, error: lookupErr } = await supabase
      .from('webhooks')
      .select('id, developer_id')
      .eq('id', req.params.id)
      .single();

    if (lookupErr || !existing) {
      throw new NotFoundError(`Webhook ${req.params.id} not found`);
    }

    // Gate: only delete webhooks owned by known shadow developer UUIDs.
    const shadowIds = await getShadowDeveloperIds();
    if (!shadowIds.has(existing.developer_id)) {
      throw new ValidationError(
        'This endpoint only manages webhooks on shadow developer rows. Use /api/developer/webhooks for developer webhooks.',
        'id',
        req.params.id,
      );
    }

    const { error } = await supabase.from('webhooks').delete().eq('id', req.params.id);

    if (error) {
      logger.error('Failed to delete platform webhook', { error });
      throw new Error('Failed to delete webhook');
    }

    logger.info('Platform webhook deleted', { id: req.params.id });
    res.status(204).send();
  }),
);

export default router;
