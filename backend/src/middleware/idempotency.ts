import { Request, Response, NextFunction } from 'express';
import { supabase } from '@/config/database.js';
import { catchAsync } from './errorHandler.js';

/**
 * Idempotency middleware for verification endpoints.
 *
 * Clients include an `Idempotency-Key` header (any unique string — typically
 * a UUIDv4 generated per-request client-side). If a prior response was stored
 * for that (developer, key) pair within 24 hours, the stored response is
 * returned immediately. Otherwise the request proceeds and the outgoing
 * response is captured and stored.
 *
 * This prevents duplicate verification records / state changes when a client
 * retries a request because of a network timeout or transient server error.
 *
 * Wired onto:
 *   - POST /verify/initialize        (new session creation)
 *   - POST /verify/:id/front-document
 *   - POST /verify/:id/back-document
 *   - POST /verify/:id/live-capture
 *
 * Headers accepted (case-insensitive):
 *   - `Idempotency-Key`  — RFC draft and Stripe convention
 *   - `X-Idempotency-Key` — older de-facto form
 *
 * The middleware is a no-op when no key is supplied or the request is not
 * authenticated as a developer (e.g. handoff/session token paths). Callers
 * who want idempotency must opt in by sending the header.
 */
export const idempotencyMiddleware = catchAsync(async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  // Accept both the RFC-draft `Idempotency-Key` and the older `X-Idempotency-Key`.
  const idempotencyKey = (
    (req.headers['idempotency-key'] as string | undefined) ??
    (req.headers['x-idempotency-key'] as string | undefined)
  );

  // No key or no authenticated developer → skip (middleware is harmless no-op)
  if (!idempotencyKey || !(req as any).developer) return next();

  const developerId = (req as any).developer.id;

  // Look up a non-expired response for this (key, developer) pair
  const { data: existing } = await supabase
    .from('idempotency_keys')
    .select('response_status, response_body')
    .eq('key', idempotencyKey)
    .eq('developer_id', developerId)
    .gt('expires_at', new Date().toISOString())
    .single();

  if (existing) {
    // Replay the cached response — no new verification created.
    // Mark via header so observability can distinguish replays from fresh
    // requests when triaging duplicate-looking traffic.
    res.setHeader('Idempotent-Replayed', 'true');
    return res.status(existing.response_status).json(existing.response_body);
  }

  // Intercept res.json() to save the first response asynchronously.
  // The `then(null, () => {})` form is non-blocking — storage failures
  // don't break the request (the user gets a response either way; the
  // worst case is a duplicate on retry rather than a hard error here).
  const originalJson = res.json.bind(res);
  res.json = function (body: any) {
    supabase
      .from('idempotency_keys')
      .insert({
        key: idempotencyKey,
        developer_id: developerId,
        response_status: res.statusCode,
        response_body: body,
      })
      .then(null, () => {});

    return originalJson(body);
  };

  next();
});
