import express, { Request, Response } from 'express';
import { body } from 'express-validator';
import { supabase } from '@/config/database.js';
import { catchAsync, ValidationError } from '@/middleware/errorHandler.js';
import { validate } from '@/middleware/validate.js';
import { logger } from '@/utils/logger.js';
import rateLimit from 'express-rate-limit';
import { createAndSendOtp } from '@/services/otpService.js';

const router = express.Router();

// Rate limiting for developer registration
const registrationRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // limit each IP to 5 registration attempts per windowMs
  message: {
    error: 'Too many registration attempts from this IP, please try again later.',
    retryAfter: 15 * 60 * 1000
  },
  standardHeaders: true,
  legacyHeaders: false
});


// Register as developer
router.post('/register',
  registrationRateLimit,
  [
    body('email')
      .isEmail()
      .normalizeEmail()
      .withMessage('Valid email is required'),
    body('name')
      .trim()
      .escape()
      .isLength({ min: 2, max: 100 })
      .withMessage('Name must be between 2 and 100 characters'),
    body('company')
      .optional()
      .trim()
      .escape()
      .isLength({ max: 100 })
      .withMessage('Company name must be less than 100 characters'),
    body('webhook_url')
      .optional()
      .isURL({ protocols: ['https'] })
      .withMessage('Webhook URL must be a valid HTTPS URL')
  ],
  validate,
  catchAsync(async (req: Request, res: Response) => {
    const { email, name, company, webhook_url } = req.body;

    // Check if developer already exists
    const { data: existingDev, error: checkError } = await supabase
      .from('developers')
      .select('id')
      .eq('email', email)
      .single();

    // If no error and data exists, developer already exists
    if (existingDev && !checkError) {
      throw new ValidationError('Developer with this email already exists', 'email', email);
    }

    // Create developer (unverified — must complete OTP to activate)
    const { data: developer, error } = await supabase
      .from('developers')
      .insert({
        email,
        name,
        company,
        webhook_url,
        is_verified: false
      })
      .select('*')
      .single();

    if (error) {
      logger.error('Database error:', error);

      // Handle specific duplicate email error
      if (error.code === '23505' && error.details?.includes('email')) {
        throw new ValidationError('Developer with this email already exists', 'email', email);
      }

      throw new Error('Failed to create developer account');
    }

    // Send OTP for email verification (API key generated post-OTP-verify login)
    const result = await createAndSendOtp(email);

    logger.info('New developer registered (pending OTP verification)', {
      developerId: developer.id,
      email: developer.email,
      company: developer.company,
    });

    res.status(201).json({
      developer: {
        id: developer.id,
        email: developer.email,
        name: developer.name,
        company: developer.company,
        is_verified: developer.is_verified,
        created_at: developer.created_at
      },
      message: 'Verification email sent. Complete email verification to activate your account.',
      ...(result.code && { code: result.code }),
    });
  })
);

export default router;
