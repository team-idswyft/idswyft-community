import express, { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { body, validationResult } from 'express-validator';
import validator from 'validator';
import { supabase } from '@/config/database.js';
import config from '@/config/index.js';
import { generateAdminToken, generateDeveloperToken, generateRegistrationToken, verifyRegistrationToken, generateAPIKey, authenticateJWT } from '@/middleware/auth.js';
import { catchAsync, ValidationError, AuthenticationError } from '@/middleware/errorHandler.js';
import { TotpService } from '@/services/totpService.js';
import { createAndSendOtp, verifyOtp } from '@/services/otpService.js';
import * as githubOAuth from '@/services/githubOAuthService.js';
import { Developer } from '@/types/index.js';
import { logger } from '@/utils/logger.js';
import { generateToken } from '@/middleware/csrf.js';

// Rate limiter for OTP verify: 10 attempts per 15 minutes per IP
const otpVerifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { message: 'Too many verification attempts. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const router = express.Router();

// GET /api/auth/csrf-token — frontend calls this before any admin mutation
router.get('/csrf-token', catchAsync(async (req: Request, res: Response) => {
  const token = generateToken(req, res);
  res.json({ csrfToken: token });
}));

// Admin login
router.post('/admin/login',
  [
    body('email')
      .isEmail()
      .withMessage('Valid email is required'),
    body('password')
      .notEmpty()
      .withMessage('Password is required')
      .isLength({ min: 8 })
      .withMessage('Password must be at least 8 characters'),
  ],
  catchAsync(async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError('Validation failed', 'multiple', errors.array());
    }
    
    const { email, password } = req.body;
    
    // Get admin user
    const { data: adminUser, error } = await supabase
      .from('admin_users')
      .select('*')
      .eq('email', email)
      .single();
    
    if (error || !adminUser) {
      logger.warn('Admin login attempt with invalid email', { email });
      throw new AuthenticationError('Invalid credentials');
    }
    
    // Check password
    const isValidPassword = await bcrypt.compare(password, adminUser.password_hash);
    if (!isValidPassword) {
      logger.warn('Admin login attempt with invalid password', { 
        email,
        adminId: adminUser.id 
      });
      throw new AuthenticationError('Invalid credentials');
    }
    
    // If TOTP is enabled, require a TOTP token in the same request
    if (adminUser.totp_enabled) {
      const { totp_token } = req.body;
      if (!totp_token) {
        // Return 401 so the client knows to prompt for a TOTP code.
        // Using 401 (not 200) avoids leaking that the password was correct
        // before the second factor is verified.
        return res.status(401).json({ requires_totp: true });
      }
      const totp = new TotpService();
      if (!totp.verifyToken(totp_token, adminUser.totp_secret)) {
        throw new AuthenticationError('Invalid 2FA token');
      }
    }

    // Generate token
    const token = generateAdminToken(adminUser);

    logger.info('Admin user logged in', {
      adminId: adminUser.id,
      email: adminUser.email,
      role: adminUser.role
    });

    res.json({
      token,
      user: {
        id: adminUser.id,
        email: adminUser.email,
        role: adminUser.role
      }
    });
  })
);

// Shared email validation
const emailValidation = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Valid email is required'),
];

// ─── OTP Flow ──────────────────────────────────────────────────────────────────

// POST /api/auth/developer/otp/send — send a 6-digit code to the email
router.post('/developer/otp/send',
  emailValidation,
  catchAsync(async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError('Validation failed', 'multiple', errors.array());
    }

    const { email } = req.body;

    // Always return success to prevent email enumeration
    await createAndSendOtp(email);

    res.json({ message: 'If this email is valid, a verification code has been sent.' });
  })
);

// POST /api/auth/developer/otp/verify — verify the 6-digit code
router.post('/developer/otp/verify',
  otpVerifyLimiter,
  [
    ...emailValidation,
    body('code')
      .isString()
      .isLength({ min: 6, max: 6 })
      .isNumeric()
      .withMessage('6-digit numeric code is required'),
  ],
  catchAsync(async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError('Validation failed', 'multiple', errors.array());
    }

    const { email, code } = req.body;
    const result = await verifyOtp(email, code);

    if (!result.valid) {
      throw new AuthenticationError(result.reason || 'Invalid code');
    }

    // Check if this email belongs to an existing developer
    const { data: developer } = await supabase
      .from('developers')
      .select('*')
      .eq('email', email)
      .eq('is_verified', true)
      .single();

    if (developer) {
      // Existing developer — issue a session token
      const token = generateDeveloperToken(developer);
      logger.info('Developer logged in via OTP', { developerId: developer.id, email });

      return res.json({
        token,
        developer: {
          id: developer.id,
          email: developer.email,
          name: developer.name,
          company: developer.company,
          is_verified: developer.is_verified,
          created_at: developer.created_at,
        },
        is_new: false,
      });
    }

    // New email — issue a short-lived registration token
    const registrationToken = generateRegistrationToken(email);
    logger.info('New developer OTP verified, registration token issued', { email });

    res.json({
      registration_token: registrationToken,
      is_new: true,
    });
  })
);

// POST /api/auth/developer/otp/complete-registration — create account after OTP
router.post('/developer/otp/complete-registration',
  [
    body('registration_token').isString().notEmpty().withMessage('Registration token is required'),
    body('name').isString().trim().isLength({ min: 1 }).withMessage('Name is required'),
    body('company').optional().isString().trim(),
  ],
  catchAsync(async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError('Validation failed', 'multiple', errors.array());
    }

    const { registration_token, name, company } = req.body;

    // Verify the registration token
    let email: string;
    try {
      email = verifyRegistrationToken(registration_token);
    } catch {
      throw new AuthenticationError('Registration token is invalid or expired. Please start over.');
    }

    // Check if account was already created (race condition guard)
    const { data: existing } = await supabase
      .from('developers')
      .select('id')
      .eq('email', email)
      .single();

    if (existing) {
      throw new ValidationError('An account with this email already exists', 'email', email);
    }

    // Create developer
    const { data: developer, error: createError } = await supabase
      .from('developers')
      .insert({ email, name, company: company || null, is_verified: true })
      .select('*')
      .single();

    if (createError) {
      if (createError.code === '23505') {
        throw new ValidationError('An account with this email already exists', 'email', email);
      }
      logger.error('Developer creation failed', { error: createError });
      throw new Error('Failed to create developer account');
    }

    // Create initial API key
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

    // Generate session token
    const token = generateDeveloperToken(developer);

    logger.info('New developer registered via OTP', {
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
      is_new: true,
    });
  })
);

// ─── GitHub OAuth ──────────────────────────────────────────────────────────────

// POST /api/auth/developer/github/callback — exchange GitHub code for session
router.post('/developer/github/callback',
  [
    body('code').isString().matches(/^[a-f0-9]{10,40}$/).withMessage('Invalid GitHub authorization code'),
  ],
  catchAsync(async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError('Validation failed', 'multiple', errors.array());
    }

    if (!config.github.clientId || !config.github.clientSecret) {
      throw new AuthenticationError('GitHub authentication is not configured');
    }

    const { code } = req.body;

    // Exchange code for access token
    const accessToken = await githubOAuth.exchangeCodeForToken(code);

    // Fetch GitHub profile + emails
    const ghUser = await githubOAuth.getGitHubUser(accessToken);

    // Verify email is present (getGitHubUser throws if not, but guard explicitly)
    if (!ghUser.email) {
      throw new AuthenticationError('No verified email found on your GitHub account');
    }

    // Normalize GitHub email to match express-validator's normalizeEmail() behaviour
    ghUser.email = ghUser.email.toLowerCase().trim();

    // Try to find developer by github_id first, then by email
    let developer: Developer | null = null;
    let isNew = false;

    const { data: byGithubId } = await supabase
      .from('developers')
      .select('*')
      .eq('github_id', ghUser.id)
      .single();

    if (byGithubId) {
      developer = byGithubId as Developer;
      // Update avatar if changed
      if (ghUser.avatar_url && ghUser.avatar_url !== developer.avatar_url) {
        await supabase.from('developers').update({ avatar_url: ghUser.avatar_url }).eq('id', developer.id);
      }
    } else {
      // Try by email
      const { data: byEmail } = await supabase
        .from('developers')
        .select('*')
        .eq('email', ghUser.email)
        .eq('is_verified', true)
        .single();

      if (byEmail) {
        // Link GitHub to existing account
        developer = byEmail as Developer;
        await supabase.from('developers')
          .update({ github_id: ghUser.id, avatar_url: ghUser.avatar_url })
          .eq('id', developer.id);
      } else {
        // Auto-register new developer via GitHub
        const { data: newDev, error: createError } = await supabase
          .from('developers')
          .insert({
            email: ghUser.email,
            name: ghUser.name || ghUser.login,
            company: ghUser.company || null,
            github_id: ghUser.id,
            avatar_url: ghUser.avatar_url,
            is_verified: true,
          })
          .select('*')
          .single();

        if (createError) {
          // Handle race condition: another request created the account concurrently
          if (createError.code === '23505') {
            const { data: existing } = await supabase
              .from('developers')
              .select('*')
              .eq('email', ghUser.email)
              .single();
            if (existing) {
              developer = existing as Developer;
              await supabase.from('developers')
                .update({ github_id: ghUser.id, avatar_url: ghUser.avatar_url })
                .eq('id', developer.id);
              // Fall through to existing-developer login below
            } else {
              throw new Error('Failed to create developer account');
            }
          } else {
            logger.error('GitHub auto-registration failed', { error: createError });
            throw new Error('Failed to create developer account');
          }
        } else if (newDev) {
          developer = newDev as Developer;
          isNew = true;

          // Create initial API key for new GitHub users
          const { key, hash, prefix } = generateAPIKey();
          const isProductionEnv = process.env.NODE_ENV === 'production';

          const { data: apiKey } = await supabase
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

          logger.info('New developer registered via GitHub', {
            developerId: developer.id,
            email: ghUser.email,
            githubId: ghUser.id,
            apiKeyId: apiKey?.id,
          });

          const token = generateDeveloperToken(developer);
          return res.status(201).json({
            token,
            developer: {
              id: developer.id,
              email: developer.email,
              name: developer.name,
              company: developer.company,
              is_verified: developer.is_verified,
              avatar_url: developer.avatar_url,
              created_at: developer.created_at,
            },
            api_key: apiKey ? { key, id: apiKey.id, name: apiKey.name, is_sandbox: apiKey.is_sandbox, created_at: apiKey.created_at } : undefined,
            is_new: true,
          });
        }
      }
    }

    // Existing developer login
    if (!developer) {
      throw new Error('Failed to resolve developer account');
    }
    const token = generateDeveloperToken(developer);
    logger.info('Developer logged in via GitHub', { developerId: developer.id, githubId: ghUser.id });

    res.json({
      token,
      developer: {
        id: developer.id,
        email: developer.email,
        name: developer.name,
        company: developer.company,
        is_verified: developer.is_verified,
        avatar_url: developer.avatar_url,
        created_at: developer.created_at,
      },
      is_new: isNew,
    });
  })
);

// GET /api/auth/developer/github/url — return the GitHub OAuth URL
router.get('/developer/github/url',
  catchAsync(async (req: Request, res: Response) => {
    if (!config.github.clientId) {
      return res.json({ url: null, configured: false });
    }

    const state = req.query.state as string || '';
    const url = githubOAuth.getAuthorizationUrl(state);
    res.json({ url, configured: true });
  })
);

// POST /api/auth/totp/setup — generate and store TOTP secret, return QR code
router.post('/totp/setup',
  authenticateJWT,
  catchAsync(async (req: Request, res: Response) => {
    const user = (req as any).user;
    const totp = new TotpService();
    const secret = totp.generateSecret();
    const qrCode = await totp.generateQrCode(user.email, secret);

    // Store the unverified secret; totp_enabled stays false until /totp/verify succeeds
    await supabase.from('admin_users')
      .update({ totp_secret: secret, totp_enabled: false })
      .eq('id', user.id);

    res.json({ qrCode, secret });
  })
);

// POST /api/auth/totp/verify — verify first token, enable TOTP for this account
router.post('/totp/verify',
  authenticateJWT,
  catchAsync(async (req: Request, res: Response) => {
    const { token } = req.body;
    const user = (req as any).user;

    const { data: admin } = await supabase.from('admin_users')
      .select('totp_secret')
      .eq('id', user.id)
      .single();

    if (!admin?.totp_secret) {
      throw new ValidationError('TOTP setup not started', 'token', token);
    }

    const totp = new TotpService();
    if (!totp.verifyToken(token, admin.totp_secret)) {
      throw new ValidationError('Invalid TOTP token', 'token', token);
    }

    await supabase.from('admin_users')
      .update({ totp_enabled: true, totp_verified_at: new Date().toISOString() })
      .eq('id', user.id);

    res.json({ message: '2FA enabled successfully' });
  })
);

export default router;