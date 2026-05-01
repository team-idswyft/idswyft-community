import express, { Request, Response } from 'express';
import { body, param } from 'express-validator';
import multer from 'multer';
import path from 'path';
import { supabase } from '@/config/database.js';
import { authenticateDeveloperJWT } from '@/middleware/auth.js';
import { catchAsync, ValidationError, NotFoundError, AuthenticationError } from '@/middleware/errorHandler.js';
import { validate } from '@/middleware/validate.js';
import { logger } from '@/utils/logger.js';
import rateLimit from 'express-rate-limit';
import { config } from '@/config/index.js';
import { emailService } from '@/services/emailService.js';
import { StorageService, resolvePublicAssetUrl } from '@/services/storage.js';

const router = express.Router();

// Rate limiting for API key operations
const apiKeyRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 50, // limit each IP to 50 API key operations per minute (increased for development)
  message: {
    error: 'Too many API key operations, please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false
});

// Delete developer account (GDPR compliant)
router.delete('/account',
  apiKeyRateLimit,
  authenticateDeveloperJWT,
  [
    body('confirm_email')
      .isEmail()
      .normalizeEmail()
      .withMessage('You must confirm your email to delete your account'),
  ],
  validate,
  catchAsync(async (req: Request, res: Response) => {
    const developer = req.developer;
    if (!developer) {
      throw new AuthenticationError('Developer authentication required');
    }

    const { confirm_email } = req.body;
    if (confirm_email !== developer.email) {
      throw new ValidationError(
        'Email does not match your account email',
        'confirm_email',
        confirm_email
      );
    }

    // CASCADE handles api_keys, webhooks, webhook_deliveries,
    // verification_requests, documents, selfies
    const { error } = await supabase
      .from('developers')
      .delete()
      .eq('id', developer.id);

    if (error) {
      logger.error('Failed to delete developer account:', error);
      throw new Error('Failed to delete account');
    }

    logger.info('Developer account deleted', {
      developerId: developer.id,
      email: developer.email,
    });

    res.json({ message: 'Account deleted' });
  })
);

// ─── Developer Profile ─────────────────────────────────────────────────────

const avatarUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 }, // 2 MB
  fileFilter: (_req, file, cb) => {
    if (['image/jpeg', 'image/png'].includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only JPEG and PNG images are allowed'));
    }
  },
});

// GET /api/developer/profile — return authenticated developer's record
router.get('/profile',
  authenticateDeveloperJWT,
  catchAsync(async (req: Request, res: Response) => {
    const developer = req.developer;
    if (!developer) throw new AuthenticationError('Developer authentication required');

    res.json({
      success: true,
      data: {
        id: developer.id,
        email: developer.email,
        name: developer.name,
        company: developer.company || null,
        avatar_url: resolvePublicAssetUrl(developer.avatar_url),
        created_at: developer.created_at,
      },
    });
  })
);

// PUT /api/developer/profile — update name, company
router.put('/profile',
  authenticateDeveloperJWT,
  [
    body('name')
      .trim()
      .escape()
      .isLength({ min: 2, max: 100 })
      .withMessage('Name must be between 2 and 100 characters'),
    body('company')
      .optional({ nullable: true })
      .trim()
      .escape()
      .isLength({ max: 100 })
      .withMessage('Company name must be less than 100 characters'),
  ],
  validate,
  catchAsync(async (req: Request, res: Response) => {
    const developer = req.developer;
    if (!developer) throw new AuthenticationError('Developer authentication required');

    const { name, company } = req.body;

    const { data: updated, error } = await supabase
      .from('developers')
      .update({ name, company: company || null })
      .eq('id', developer.id)
      .select('id, email, name, company, avatar_url, created_at')
      .single();

    if (error) {
      logger.error('Failed to update developer profile:', error);
      throw new Error('Failed to update profile');
    }

    res.json({
      success: true,
      data: {
        ...updated,
        avatar_url: resolvePublicAssetUrl((updated as any).avatar_url),
      },
    });
  })
);

// POST /api/developer/avatar — upload avatar image
router.post('/avatar',
  authenticateDeveloperJWT,
  (avatarUpload.single('file') as any),
  catchAsync(async (req: Request, res: Response) => {
    const developer = req.developer;
    if (!developer) throw new AuthenticationError('Developer authentication required');

    const file = (req as any).file;
    if (!file) throw new ValidationError('No file uploaded', 'file', null);

    // Validate magic bytes — prevent spoofed Content-Type
    const buf = file.buffer;
    const isJpeg = buf[0] === 0xFF && buf[1] === 0xD8;
    const isPng = buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47;
    if (!isJpeg && !isPng) {
      throw new ValidationError('File content does not match a valid JPEG or PNG image', 'file', null);
    }

    const ext = path.extname(file.originalname) || (file.mimetype === 'image/png' ? '.png' : '.jpeg');
    const fileName = `${developer.id}${ext}`;

    const storageService = new StorageService();
    const avatarUrl = await storageService.storePublicAsset(file.buffer, 'avatars', fileName, file.mimetype);

    // Update developer record
    await supabase
      .from('developers')
      .update({ avatar_url: avatarUrl })
      .eq('id', developer.id);

    logger.info('Developer avatar updated', { developerId: developer.id });

    res.json({ success: true, data: { avatar_url: resolvePublicAssetUrl(avatarUrl) } });
  })
);

// ─── Branding Logo Upload ────────────────────────────────────────────────────

// POST /api/developer/branding/logo — upload branding logo image
router.post('/branding/logo',
  authenticateDeveloperJWT,
  (avatarUpload.single('file') as any),
  catchAsync(async (req: Request, res: Response) => {
    const developer = req.developer;
    if (!developer) throw new AuthenticationError('Developer authentication required');

    const file = (req as any).file;
    if (!file) throw new ValidationError('No file uploaded', 'file', null);

    // Validate magic bytes — prevent spoofed Content-Type
    const buf = file.buffer;
    const isJpeg = buf[0] === 0xFF && buf[1] === 0xD8;
    const isPng = buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47;
    if (!isJpeg && !isPng) {
      throw new ValidationError('File content does not match a valid JPEG or PNG image', 'file', null);
    }

    const ext = path.extname(file.originalname) || (file.mimetype === 'image/png' ? '.png' : '.jpeg');
    const fileName = `${developer.id}_logo${ext}`;

    const storageService = new StorageService();
    const logoUrl = await storageService.storePublicAsset(file.buffer, 'branding', fileName, file.mimetype);

    // Update developer record
    await supabase
      .from('developers')
      .update({ branding_logo_url: logoUrl })
      .eq('id', developer.id);

    logger.info('Developer branding logo updated', { developerId: developer.id });

    res.json({ success: true, data: { logo_url: resolvePublicAssetUrl(logoUrl) } });
  })
);

// ─── Reviewer Management ────────────────────────────────────────────────────

// POST /api/developer/reviewers/invite — invite a reviewer or org admin
router.post('/reviewers/invite',
  authenticateDeveloperJWT,
  [
    body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
    body('name').optional().trim().escape().isLength({ max: 100 }).withMessage('Name must be less than 100 characters'),
    body('role').optional().isIn(['reviewer', 'admin']).withMessage('Role must be reviewer or admin'),
  ],
  validate,
  catchAsync(async (req: Request, res: Response) => {
    const developer = req.developer;
    if (!developer) throw new AuthenticationError('Developer authentication required');

    const { email, name } = req.body;
    const role = req.body.role || 'reviewer';

    // Check if reviewer already exists for this developer
    const { data: existing } = await supabase
      .from('verification_reviewers')
      .select('id, status')
      .eq('developer_id', developer.id)
      .eq('email', email)
      .single();

    let reviewer;

    if (existing) {
      if (existing.status === 'revoked') {
        // Reactivate revoked reviewer
        const { data, error } = await supabase
          .from('verification_reviewers')
          .update({ status: 'invited', name: name || undefined, role, invited_at: new Date().toISOString() })
          .eq('id', existing.id)
          .select('*')
          .single();
        if (error) throw new Error('Failed to reactivate reviewer');
        reviewer = data;
      } else {
        throw new ValidationError('Reviewer with this email already exists', 'email', email);
      }
    } else {
      const { data, error } = await supabase
        .from('verification_reviewers')
        .insert({ developer_id: developer.id, email, name: name || null, role })
        .select('*')
        .single();
      if (error) throw new Error('Failed to invite reviewer');
      reviewer = data;
    }

    // Send invitation email (best-effort)
    const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const loginUrl = `${process.env.FRONTEND_URL || 'https://idswyft.app'}/admin/login`;
    const safeName = name ? esc(name) : '';
    const safeDevName = esc(developer.name || developer.email);
    const roleLabel = role === 'admin' ? 'Organization Admin' : 'Reviewer';
    const subject = `You've been invited as ${roleLabel} on Idswyft`;
    const html = `<p>Hi${safeName ? ` ${safeName}` : ''},</p>
<p><strong>${safeDevName}</strong> has invited you as <strong>${roleLabel}</strong> to manage identity verifications on Idswyft.</p>
<p>To get started, visit: <a href="${loginUrl}">${loginUrl}</a></p>
<p>Enter your email address and use the one-time code sent to you to sign in.</p>
<p>&mdash; Idswyft</p>`;
    const text = `Hi${name ? ` ${name}` : ''},\n\n${developer.name || developer.email} has invited you as ${roleLabel} on Idswyft.\n\nVisit ${loginUrl} to sign in with your email.\n\n— Idswyft`;

    emailService.sendEmail({ to: email, subject, html, text }).catch(err => {
      logger.error('Failed to send reviewer invitation email', { email, error: err });
    });

    logger.info('Reviewer invited', { developerId: developer.id, reviewerEmail: email, role });

    res.status(201).json({ reviewer });
  })
);

// GET /api/developer/reviewers — list all reviewers for this developer
router.get('/reviewers',
  authenticateDeveloperJWT,
  catchAsync(async (req: Request, res: Response) => {
    const developer = req.developer;
    if (!developer) throw new AuthenticationError('Developer authentication required');

    const { data: reviewers, error } = await supabase
      .from('verification_reviewers')
      .select('*')
      .eq('developer_id', developer.id)
      .order('invited_at', { ascending: false });

    if (error) throw new Error('Failed to list reviewers');

    res.json({ reviewers: reviewers || [] });
  })
);

// DELETE /api/developer/reviewers/:id — revoke a reviewer
router.delete('/reviewers/:id',
  authenticateDeveloperJWT,
  [param('id').isUUID().withMessage('Invalid reviewer ID format')],
  validate,
  catchAsync(async (req: Request, res: Response) => {
    const developer = req.developer;
    if (!developer) throw new AuthenticationError('Developer authentication required');

    const { data: reviewer, error } = await supabase
      .from('verification_reviewers')
      .update({ status: 'revoked' })
      .eq('id', req.params.id)
      .eq('developer_id', developer.id)
      .select('id, email')
      .single();

    if (error || !reviewer) throw new NotFoundError('Reviewer not found');

    logger.info('Reviewer revoked', { developerId: developer.id, reviewerId: reviewer.id });

    res.json({ message: 'Reviewer access revoked', reviewer });
  })
);

export default router;
