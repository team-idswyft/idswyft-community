import { Router, Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import rateLimit from 'express-rate-limit';
import { supabase } from '@/config/database.js';
import { generateDeveloperToken, generateAPIKey } from '@/middleware/auth.js';
import { catchAsync, ValidationError, AuthorizationError } from '@/middleware/errorHandler.js';
import { logger } from '@/utils/logger.js';

const router = Router();

const setupRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { status: 'error', message: 'Too many setup attempts. Try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// In-memory cache: once setup is complete (needs_setup === false), the result
// is permanent — no need to hit the database on every poll. Resets to null on
// POST /initialize so the next GET reflects the new state.
let setupCompleteCache: boolean | null = null;

// GET /api/setup/status — check if first-run setup is needed (no auth)
router.get('/status', catchAsync(async (_req: Request, res: Response) => {
  // If we already know setup is done, skip the DB query
  if (setupCompleteCache === true) {
    return res.json({ needs_setup: false });
  }

  const { count, error } = await supabase
    .from('developers')
    .select('*', { count: 'exact', head: true });

  if (error) {
    logger.error('Setup status check failed', { error });
    throw new Error('Failed to check setup status');
  }

  const needsSetup = (count ?? 0) === 0;
  if (!needsSetup) setupCompleteCache = true;

  res.json({ needs_setup: needsSetup });
}));

// POST /api/setup/initialize — create first developer account (no auth, first-run only)
router.post('/initialize',
  setupRateLimit,
  [
    body('name').isString().trim().escape().isLength({ min: 2, max: 100 }).withMessage('Name must be between 2 and 100 characters'),
    body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
    body('company').optional().isString().trim().escape().isLength({ max: 100 }).withMessage('Company name must be less than 100 characters'),
  ],
  catchAsync(async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError('Validation failed', 'multiple', errors.array());
    }

    // First-run guard: only works when zero developers exist
    const { count, error: countError } = await supabase
      .from('developers')
      .select('*', { count: 'exact', head: true });

    if (countError) {
      logger.error('Setup guard check failed', { error: countError });
      throw new Error('Failed to verify setup eligibility');
    }

    if ((count ?? 0) > 0) {
      throw new AuthorizationError('Setup already completed. Use the normal sign-in flow.');
    }

    const { name, email, company } = req.body;

    // Create developer with is_verified: true (server owner, no OTP needed)
    const { data: developer, error: createError } = await supabase
      .from('developers')
      .insert({ email, name, company: company || null, is_verified: true })
      .select('*')
      .single();

    if (createError) {
      // Race condition: another request created a developer first
      if (createError.code === '23505') {
        throw new AuthorizationError('Setup already completed. Use the normal sign-in flow.');
      }
      logger.error('Developer creation failed during setup', { error: createError });
      throw new Error('Failed to create developer account');
    }

    // Create initial API key (same pattern as developer registration)
    const { key, hash, prefix } = generateAPIKey();
    const isProductionEnv = process.env.NODE_ENV === 'production';

    const { data: apiKey, error: keyError } = await supabase
      .from('api_keys')
      .insert({
        developer_id: developer.id,
        key_hash: hash,
        key_prefix: prefix,
        name: 'Default API Key',
        is_sandbox: !isProductionEnv,
      })
      .select('id, name, is_sandbox, created_at')
      .single();

    if (keyError) {
      logger.warn('API key creation failed during setup', { error: keyError, developerId: developer.id });
    }

    // Generate session token
    const token = generateDeveloperToken(developer);
    res.cookie('idswyft_token', token, {
      httpOnly: true, secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict', maxAge: 7 * 24 * 60 * 60 * 1000, path: '/',
    });

    // Mark setup as complete so GET /status skips the DB from now on
    setupCompleteCache = true;

    logger.info('First developer created via setup wizard', {
      developerId: developer.id,
      email,
      apiKeyId: apiKey?.id,
    });

    res.status(201).json({
      token,
      developer: {
        id: developer.id,
        email: developer.email,
        name: developer.name,
        company: developer.company,
        is_verified: developer.is_verified,
        created_at: developer.created_at,
      },
      api_key: apiKey && !keyError ? {
        key,
        id: apiKey.id,
        name: apiKey.name,
        is_sandbox: apiKey.is_sandbox,
        created_at: apiKey.created_at,
      } : undefined,
      ...(keyError ? { warning: 'API key creation failed. You can create one from the Developer Portal.' } : {}),
    });
  })
);

export default router;
