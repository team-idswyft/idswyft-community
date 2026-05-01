import express, { Request, Response } from 'express';
import crypto from 'crypto';
import { catchAsync, ValidationError } from '@/middleware/errorHandler.js';
import { AuthenticationError } from '@/middleware/errorHandler.js';
import { hashHandoffToken } from '@/middleware/auth.js';
import { supabase } from '@/config/database.js';
import { logger } from '@/utils/logger.js';
import config from '@/config/index.js';
import { basicRateLimit } from '@/middleware/rateLimit.js';
import { resolvePublicAssetUrl } from '@/services/storage.js';

const router = express.Router();

// POST /api/verify/handoff/create — desktop creates a session, returns token
// Accepts either api_key in body OR X-Session-Token header for session-based auth.
router.post('/create', basicRateLimit, catchAsync(async (req: Request, res: Response) => {
  const { api_key, user_id, source, verification_id } = req.body;
  const sessionToken = req.headers['x-session-token'] as string | undefined;

  // Validate verification_id format if provided (UUID)
  if (verification_id && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(verification_id)) {
    throw new ValidationError('Invalid verification_id format', 'verification_id', verification_id);
  }

  let resolvedApiKeyId: string;
  let resolvedUserId: string;

  if (sessionToken) {
    // Session token auth — resolve api_key_id from the verification request
    if (!/^[0-9a-f]{64}$/.test(sessionToken)) {
      throw new AuthenticationError('Invalid session token format');
    }

    const stHash = hashHandoffToken(sessionToken);
    const { data: verification, error: verError } = await supabase
      .from('verification_requests')
      .select('id, developer_id, user_id, session_token_expires_at, session_api_key_id')
      .eq('session_token_hash', stHash)
      .single();

    if (verError || !verification) {
      throw new AuthenticationError('Invalid session token');
    }
    if (!verification.session_token_expires_at || new Date(verification.session_token_expires_at) < new Date()) {
      throw new AuthenticationError('Session token has expired');
    }

    // Use the exact API key that was used during initialization
    if (!verification.session_api_key_id) {
      throw new AuthenticationError('No API key associated with this session');
    }

    resolvedApiKeyId = verification.session_api_key_id;
    resolvedUserId = user_id || verification.user_id;
  } else {
    // Traditional api_key auth
    if (!api_key || !user_id) {
      throw new ValidationError('api_key and user_id are required', 'body', req.body);
    }

    const keyHash = crypto
      .createHmac('sha256', config.apiKeySecret)
      .update(api_key)
      .digest('hex');

    const { data: apiKeyRecord, error: keyError } = await supabase
      .from('api_keys')
      .select('id, developer_id, is_active, expires_at')
      .eq('key_hash', keyHash)
      .eq('is_active', true)
      .single();

    if (keyError || !apiKeyRecord) {
      throw new AuthenticationError('Invalid API key');
    }

    if (apiKeyRecord.expires_at && new Date(apiKeyRecord.expires_at) < new Date()) {
      throw new AuthenticationError('API key has expired');
    }

    resolvedApiKeyId = apiKeyRecord.id;
    resolvedUserId = user_id;
  }

  const validSource = ['api', 'vaas', 'demo'].includes(source) ? source : 'api';
  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashHandoffToken(token);
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes

  const { error } = await supabase
    .from('mobile_handoff_sessions')
    .insert({
      token: tokenHash,
      api_key_id: resolvedApiKeyId,
      user_id: resolvedUserId,
      source: validSource,
      expires_at: expiresAt.toISOString(),
      ...(verification_id && { verification_id }),
    });

  if (error) {
    logger.error('Failed to create handoff session', {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });
    throw new Error(`Failed to create handoff session: ${error.message}`);
  }

  // Return the raw token — only the hash is stored
  res.status(201).json({ token, expires_at: expiresAt.toISOString() });
}));

// GET /api/verify/handoff/:token/session — mobile fetches session + branding
router.get('/:token/session', catchAsync(async (req: Request, res: Response) => {
  const { token } = req.params;

  if (!/^[0-9a-f]{64}$/.test(token)) {
    return res.status(404).json({ error: 'Session not found' });
  }

  const tokenHash = hashHandoffToken(token);

  // Fetch session (flat query — no nested joins for PgClient compatibility)
  const { data, error } = await supabase
    .from('mobile_handoff_sessions')
    .select('user_id, source, status, expires_at, api_key_id, verification_id')
    .eq('token', tokenHash)
    .single();

  if (error || !data) {
    return res.status(404).json({ error: 'Session not found' });
  }

  if (new Date(data.expires_at) < new Date()) {
    const { error: expireError } = await supabase
      .from('mobile_handoff_sessions')
      .update({ status: 'expired' })
      .eq('token', tokenHash);
    if (expireError) {
      logger.warn('Failed to mark handoff session as expired', { error: expireError });
    }
    return res.status(410).json({ error: 'Session expired' });
  }

  if (data.status !== 'pending') {
    return res.status(409).json({ error: 'Session already used' });
  }

  // Resolve branding via separate lookups (avoids 2-level nested join)
  let branding = null;
  if (data.api_key_id) {
    const { data: apiKey } = await supabase
      .from('api_keys')
      .select('developer_id')
      .eq('id', data.api_key_id)
      .single();

    if (apiKey?.developer_id) {
      const { data: dev } = await supabase
        .from('developers')
        .select('branding_logo_url, branding_accent_color, branding_company_name, company')
        .eq('id', apiKey.developer_id)
        .single();

      if (dev) {
        branding = {
          logo_url: resolvePublicAssetUrl(dev.branding_logo_url),
          accent_color: dev.branding_accent_color || null,
          company_name: dev.branding_company_name || dev.company || null,
        };
      }
    }
  }

  res.json({
    user_id: data.user_id,
    source: data.source || 'api',
    branding,
    ...(data.verification_id && { verification_id: data.verification_id }),
  });
}));

// PATCH /api/verify/handoff/:token/link — mobile links verification_id to session
router.patch('/:token/link', catchAsync(async (req: Request, res: Response) => {
  const { token } = req.params;
  const { verification_id } = req.body;

  if (!/^[0-9a-f]{64}$/.test(token)) {
    return res.status(404).json({ error: 'Session not found' });
  }

  if (!verification_id || typeof verification_id !== 'string') {
    throw new ValidationError('verification_id is required', 'verification_id', verification_id);
  }

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(verification_id)) {
    throw new ValidationError('Invalid verification_id format', 'verification_id', verification_id);
  }

  const tokenHash = hashHandoffToken(token);

  const { data: updated, error } = await supabase
    .from('mobile_handoff_sessions')
    .update({ verification_id })
    .eq('token', tokenHash)
    .eq('status', 'pending')
    .select('id');

  if (error) {
    logger.error('Failed to link verification_id to handoff session', error);
    throw new Error('Failed to link verification_id');
  }

  if (!updated || updated.length === 0) {
    return res.status(404).json({ error: 'Session not found or already completed' });
  }

  res.json({ success: true });
}));

// PATCH /api/verify/handoff/:token/complete — mobile reports completion
router.patch('/:token/complete', catchAsync(async (req: Request, res: Response) => {
  const { token } = req.params;

  if (!/^[0-9a-f]{64}$/.test(token)) {
    return res.status(404).json({ error: 'Session not found' });
  }

  const { status, result } = req.body;

  if (!status || !['completed', 'failed'].includes(status)) {
    throw new ValidationError('status must be completed or failed', 'status', status);
  }

  // Validate result shape and size
  if (result != null) {
    if (typeof result !== 'object' || Array.isArray(result)) {
      throw new ValidationError('result must be a plain object', 'result', result);
    }
    if (Buffer.byteLength(JSON.stringify(result), 'utf8') > 4096) {
      throw new ValidationError('result payload too large (max 4096 bytes)', 'result', result);
    }
  }

  const tokenHash = hashHandoffToken(token);

  // First verify the session exists and hasn't expired
  const { data: session, error: fetchError } = await supabase
    .from('mobile_handoff_sessions')
    .select('status, expires_at')
    .eq('token', tokenHash)
    .single();

  if (fetchError || !session) {
    return res.status(404).json({ error: 'Session not found' });
  }

  if (new Date(session.expires_at) < new Date()) {
    return res.status(410).json({ error: 'Session expired' });
  }

  // Atomic update — only succeeds if status is still 'pending'
  const { data: updated, error } = await supabase
    .from('mobile_handoff_sessions')
    .update({ status, result: result ?? null })
    .eq('token', tokenHash)
    .eq('status', 'pending')
    .select('id');

  if (error) {
    logger.error('Failed to complete handoff session', error);
    throw new Error('Failed to update session');
  }

  if (!updated || updated.length === 0) {
    return res.status(409).json({ error: 'Session already completed' });
  }

  res.json({ success: true });
}));

// GET /api/verify/handoff/:token/status — desktop polls for completion
router.get('/:token/status', catchAsync(async (req: Request, res: Response) => {
  const { token } = req.params;

  if (!/^[0-9a-f]{64}$/.test(token)) {
    return res.status(404).json({ error: 'Session not found' });
  }

  const tokenHash = hashHandoffToken(token);

  const { data, error } = await supabase
    .from('mobile_handoff_sessions')
    .select('status, result, expires_at, verification_id')
    .eq('token', tokenHash)
    .single();

  if (error || !data) {
    return res.status(404).json({ error: 'Session not found' });
  }

  if (new Date(data.expires_at) < new Date()) {
    const { error: expireError } = await supabase
      .from('mobile_handoff_sessions')
      .update({ status: 'expired' })
      .eq('token', tokenHash);
    if (expireError) {
      logger.warn('Failed to mark handoff session as expired', { error: expireError });
    }
    return res.status(410).json({ error: 'Session expired' });
  }

  res.json({
    status: data.status,
    ...(data.verification_id && { verification_id: data.verification_id }),
    ...(data.status !== 'pending' && { result: data.result }),
  });
}));

export default router;
