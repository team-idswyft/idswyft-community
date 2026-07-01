/**
 * Service-operator OTP login (Phase 2).
 *
 * CLOUD-ONLY. Stripped from the community mirror via .community-ignore.
 *
 * A human bound to a service key (api_keys.operator_email, set at mint via the
 * platform CLI) logs in by email OTP and receives an api_key_id-scoped session
 * (idswyft-service-operator JWT in the idswyft_token cookie). Phase 3+ scopes
 * the developer dashboard and admin review queue to req.operatorKeyId.
 *
 * Endpoints (mounted at /api/auth):
 *   POST /service-operator/otp/send    → email a 6-digit code
 *   POST /service-operator/otp/verify  → 0 keys: 401; 1 key: set cookie; >1: selection token + list
 *   POST /service-operator/otp/select  → selection token + chosen api_key_id → set cookie
 */

import express, { Request, Response } from 'express';
import { body } from 'express-validator';
import rateLimit from 'express-rate-limit';
import { supabase } from '@/config/database.js';
import { catchAsync, AuthenticationError } from '@/middleware/errorHandler.js';
import { validate } from '@/middleware/validate.js';
import { logger } from '@/utils/logger.js';
import { createAndSendOtp, verifyOtp } from '@/services/otpService.js';
import {
  generateServiceOperatorToken,
  generateServiceOperatorSelectionToken,
  verifyServiceOperatorSelectionToken,
} from '@/middleware/auth.js';

const router = express.Router();

// Mirrors the limiters + cookie setter in routes/auth.ts (kept local so this
// module stays self-contained and independently testable).
const otpSendLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { message: 'Too many code requests. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});
const otpVerifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { message: 'Too many verification attempts. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

function setAuthCookie(res: Response, token: string, maxAge = 7 * 24 * 60 * 60 * 1000): void {
  res.cookie('idswyft_token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge,
    path: '/',
  });
}

const emailValidation = [
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
];

interface OperatorKeyRow {
  id: string;
  service_product: string | null;
  service_environment: string | null;
  service_label: string | null;
  developer_id: string;
}

// Build the per-key public payload returned to the picker / on login.
function publicKey(k: OperatorKeyRow) {
  return {
    api_key_id: k.id,
    service_product: k.service_product,
    service_environment: k.service_environment,
    service_label: k.service_label,
  };
}

// POST /service-operator/otp/send
router.post('/service-operator/otp/send',
  otpSendLimiter,
  emailValidation,
  validate,
  catchAsync(async (req: Request, res: Response) => {
    const { email } = req.body;
    const result = await createAndSendOtp(email);
    res.json({
      message: 'If this email operates a service key, a verification code has been sent.',
      ...(result.code && { code: result.code, self_hosted: true }),
    });
  }),
);

// POST /service-operator/otp/verify
router.post('/service-operator/otp/verify',
  otpVerifyLimiter,
  [
    ...emailValidation,
    body('code').isString().isLength({ min: 6, max: 6 }).isNumeric()
      .withMessage('6-digit numeric code is required'),
  ],
  validate,
  catchAsync(async (req: Request, res: Response) => {
    const { email, code } = req.body;
    const result = await verifyOtp(email, code);
    if (!result.valid) {
      throw new AuthenticationError(result.reason || 'Invalid code');
    }

    const { data: keys, error } = await supabase
      .from('api_keys')
      .select('id, service_product, service_environment, service_label, developer_id')
      .eq('operator_email', email)
      .eq('is_service', true)
      .eq('is_active', true);

    if (error) {
      logger.error('Failed to resolve operator service keys', { error });
      throw new Error('Failed to resolve service keys');
    }
    const rows = (keys ?? []) as OperatorKeyRow[];
    if (rows.length === 0) {
      throw new AuthenticationError('No service access for this email');
    }

    if (rows.length === 1) {
      const k = rows[0];
      const token = generateServiceOperatorToken({
        apiKeyId: k.id, email, developerId: k.developer_id,
        serviceProduct: k.service_product, serviceEnvironment: k.service_environment,
      });
      setAuthCookie(res, token);
      logger.info('Service operator logged in', { operatorEmail: email, apiKeyId: k.id });
      return res.json({ scope: 'service-operator', operator: { email, ...publicKey(k) } });
    }

    // Multiple keys → picker
    const selectionToken = generateServiceOperatorSelectionToken(email);
    res.json({
      selection_required: true,
      selection_token: selectionToken,
      keys: rows.map(publicKey),
    });
  }),
);

// POST /service-operator/otp/select
router.post('/service-operator/otp/select',
  otpVerifyLimiter,
  [
    body('selection_token').isString().notEmpty().withMessage('selection_token is required'),
    body('api_key_id').isUUID().withMessage('api_key_id must be a valid UUID'),
  ],
  validate,
  catchAsync(async (req: Request, res: Response) => {
    const { selection_token, api_key_id } = req.body;

    let email: string;
    try {
      email = verifyServiceOperatorSelectionToken(selection_token);
    } catch {
      throw new AuthenticationError('Invalid or expired selection token');
    }

    const { data: k, error } = await supabase
      .from('api_keys')
      .select('id, service_product, service_environment, service_label, developer_id')
      .eq('id', api_key_id)
      .eq('operator_email', email)
      .eq('is_service', true)
      .eq('is_active', true)
      .single();

    if (error || !k) {
      throw new AuthenticationError('Service key not found for this operator');
    }

    const key = k as OperatorKeyRow;
    const token = generateServiceOperatorToken({
      apiKeyId: key.id, email, developerId: key.developer_id,
      serviceProduct: key.service_product, serviceEnvironment: key.service_environment,
    });
    setAuthCookie(res, token);
    logger.info('Service operator selected key + logged in', { operatorEmail: email, apiKeyId: key.id });
    res.json({ scope: 'service-operator', operator: { email, ...publicKey(key) } });
  }),
);

export default router;
