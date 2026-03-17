import { Router } from 'express';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { vaasSupabase } from '../config/database.js';
import config from '../config/index.js';
import { VaasApiResponse, VaasLoginRequest, VaasLoginResponse } from '../types/index.js';
import { validateLoginRequest } from '../middleware/validation.js';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth.js';

const ACCESS_TOKEN_EXPIRY = '1h';
const REFRESH_TOKEN_EXPIRY_DAYS = 7;
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

/** Domain-separated key for refresh token HMAC (derived from jwtSecret). */
const REFRESH_HMAC_KEY = crypto.createHmac('sha256', config.jwtSecret).update('vaas-refresh-token-domain').digest();

/** Hash a refresh token for DB storage/lookup. */
function hashRefreshToken(token: string): string {
  return crypto.createHmac('sha256', REFRESH_HMAC_KEY).update(token).digest('hex');
}

/** Generate a cryptographically random refresh token and its HMAC-SHA256 hash. */
function generateRefreshToken(): { token: string; hash: string } {
  const token = crypto.randomBytes(48).toString('hex');
  return { token, hash: hashRefreshToken(token) };
}

const router = Router();

// Admin login
router.post('/login', validateLoginRequest, async (req, res) => {
  try {
    const { email, password, organization_slug }: VaasLoginRequest = req.body;
    
    // Build query to find admin (include lockout fields)
    let query = vaasSupabase
      .from('vaas_admins')
      .select(`
        id,
        organization_id,
        email,
        password_hash,
        first_name,
        last_name,
        role,
        permissions,
        status,
        email_verified,
        login_count,
        failed_login_attempts,
        locked_until,
        vaas_organizations!inner(
          id,
          name,
          slug,
          subscription_tier,
          billing_status,
          settings,
          branding
        )
      `)
      .eq('email', email)
      .eq('status', 'active');
    
    // If organization slug provided, filter by it
    if (organization_slug) {
      query = query.eq('vaas_organizations.slug', organization_slug);
    }
    
    const { data: admin, error } = await query.single();
    
    if (error || !admin) {
      const response: VaasApiResponse = {
        success: false,
        error: {
          code: 'INVALID_CREDENTIALS',
          message: 'Invalid email or password'
        }
      };
      
      return res.status(401).json(response);
    }
    
    // Check if organization is active
    if ((admin.vaas_organizations as any).billing_status === 'suspended' || (admin.vaas_organizations as any).billing_status === 'cancelled') {
      const response: VaasApiResponse = {
        success: false,
        error: {
          code: 'ORGANIZATION_SUSPENDED',
          message: 'Organization account is suspended. Please contact support.'
        }
      };

      return res.status(403).json(response);
    }

    // Check account lockout BEFORE bcrypt (avoids timing oracle)
    if ((admin as any).locked_until && new Date((admin as any).locked_until) > new Date()) {
      const response: VaasApiResponse = {
        success: false,
        error: {
          code: 'ACCOUNT_LOCKED',
          message: 'Account temporarily locked due to too many failed attempts. Please try again later.'
        }
      };
      return res.status(423).json(response);
    }

    // Verify password
    const passwordMatch = await bcrypt.compare(password, (admin as any).password_hash);
    if (!passwordMatch) {
      // Increment failed attempts; lock if threshold exceeded
      const attempts = ((admin as any).failed_login_attempts || 0) + 1;
      const lockUpdate: Record<string, any> = { failed_login_attempts: attempts };
      if (attempts >= MAX_FAILED_ATTEMPTS) {
        lockUpdate.locked_until = new Date(Date.now() + LOCKOUT_MINUTES * 60_000).toISOString();
      }
      await vaasSupabase
        .from('vaas_admins')
        .update(lockUpdate)
        .eq('id', admin.id);

      const response: VaasApiResponse = {
        success: false,
        error: {
          code: 'INVALID_CREDENTIALS',
          message: 'Invalid email or password'
        }
      };

      return res.status(401).json(response);
    }
    
    // Check email verification
    if (!admin.email_verified) {
      const response: VaasApiResponse = {
        success: false,
        error: {
          code: 'EMAIL_NOT_VERIFIED',
          message: 'Please verify your email address before logging in'
        }
      };
      
      return res.status(403).json(response);
    }
    
    // Generate short-lived access token (1h)
    const token = jwt.sign(
      {
        admin_id: admin.id,
        organization_id: admin.organization_id,
        role: admin.role
      },
      config.jwtSecret,
      { expiresIn: ACCESS_TOKEN_EXPIRY }
    );

    // Generate refresh token and store hash in DB
    const { token: refreshToken, hash: refreshHash } = generateRefreshToken();
    const refreshExpiresAt = new Date(Date.now() + REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

    // Update login stats, reset lockout, and store refresh token (parallel)
    await Promise.all([
      vaasSupabase
        .from('vaas_admins')
        .update({
          last_login_at: new Date().toISOString(),
          login_count: (admin.login_count || 0) + 1,
          failed_login_attempts: 0,
          locked_until: null,
        })
        .eq('id', admin.id),
      vaasSupabase
        .from('vaas_refresh_tokens')
        .insert({
          admin_id: admin.id,
          token_hash: refreshHash,
          expires_at: refreshExpiresAt.toISOString(),
        }),
    ]);

    // Prepare response
    const loginResponse: VaasLoginResponse = {
      token,
      refresh_token: refreshToken,
      admin: {
        id: admin.id,
        organization_id: admin.organization_id,
        email: admin.email,
        first_name: admin.first_name,
        last_name: admin.last_name,
        role: admin.role,
        permissions: admin.permissions,
        status: admin.status,
        email_verified: admin.email_verified,
        email_verified_at: (admin as any).email_verified_at,
        last_login_at: (admin as any).last_login_at,
        login_count: (admin as any).login_count,
        created_at: (admin as any).created_at,
        updated_at: (admin as any).updated_at
      },
      organization: admin.vaas_organizations as any,
      expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString() // 1h
    };

    const response: VaasApiResponse<VaasLoginResponse> = {
      success: true,
      data: loginResponse
    };

    res.json(response);
  } catch (error: any) {
    const response: VaasApiResponse = {
      success: false,
      error: {
        code: 'LOGIN_FAILED',
        message: 'Login failed. Please try again.'
      }
    };
    
    res.status(500).json(response);
  }
});

// Admin logout — deletes refresh token for server-side session invalidation
router.post('/logout', requireAuth, async (req: AuthenticatedRequest, res) => {
  const { refresh_token } = req.body;

  if (refresh_token) {
    const hash = hashRefreshToken(refresh_token);
    await vaasSupabase
      .from('vaas_refresh_tokens')
      .delete()
      .eq('token_hash', hash)
      .eq('admin_id', req.admin!.id);
  } else {
    // If no refresh token provided, delete all refresh tokens for this admin
    await vaasSupabase
      .from('vaas_refresh_tokens')
      .delete()
      .eq('admin_id', req.admin!.id);
  }

  const response: VaasApiResponse = {
    success: true,
    data: { message: 'Logged out successfully' }
  };

  res.json(response);
});

// Refresh access token using a valid refresh token
router.post('/refresh', async (req, res) => {
  try {
    const { refresh_token } = req.body;

    if (!refresh_token) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'refresh_token is required' }
      } as VaasApiResponse);
    }

    // Hash the provided token and look it up
    const hash = hashRefreshToken(refresh_token);

    const { data: tokenRow, error: lookupErr } = await vaasSupabase
      .from('vaas_refresh_tokens')
      .select('id, admin_id, expires_at')
      .eq('token_hash', hash)
      .single();

    if (lookupErr || !tokenRow) {
      return res.status(401).json({
        success: false,
        error: { code: 'INVALID_REFRESH_TOKEN', message: 'Invalid or expired refresh token' }
      } as VaasApiResponse);
    }

    // Check expiry
    if (new Date(tokenRow.expires_at) <= new Date()) {
      // Clean up expired token
      await vaasSupabase.from('vaas_refresh_tokens').delete().eq('id', tokenRow.id);
      return res.status(401).json({
        success: false,
        error: { code: 'REFRESH_TOKEN_EXPIRED', message: 'Refresh token has expired' }
      } as VaasApiResponse);
    }

    // Fetch admin to build new access token
    const { data: admin, error: adminErr } = await vaasSupabase
      .from('vaas_admins')
      .select('id, organization_id, role, status')
      .eq('id', tokenRow.admin_id)
      .eq('status', 'active')
      .single();

    if (adminErr || !admin) {
      await vaasSupabase.from('vaas_refresh_tokens').delete().eq('id', tokenRow.id);
      return res.status(401).json({
        success: false,
        error: { code: 'ADMIN_NOT_FOUND', message: 'Admin account not found or inactive' }
      } as VaasApiResponse);
    }

    // Rotate: atomically consume old token, then issue new one.
    // If delete returns 0 rows, another request already consumed it — possible replay.
    const { data: deleted } = await vaasSupabase
      .from('vaas_refresh_tokens')
      .delete()
      .eq('id', tokenRow.id)
      .select('id');

    if (!deleted || deleted.length === 0) {
      // Token reuse detected — revoke ALL tokens for this admin (RFC 6749 §10.4)
      await vaasSupabase.from('vaas_refresh_tokens').delete().eq('admin_id', tokenRow.admin_id);
      return res.status(401).json({
        success: false,
        error: { code: 'REFRESH_TOKEN_REUSED', message: 'Refresh token has already been used. All sessions revoked.' }
      } as VaasApiResponse);
    }

    const { token: newRefreshToken, hash: newHash } = generateRefreshToken();
    const newExpiresAt = new Date(Date.now() + REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

    await vaasSupabase.from('vaas_refresh_tokens').insert({
      admin_id: admin.id,
      token_hash: newHash,
      expires_at: newExpiresAt.toISOString(),
    });

    // Issue new access token
    const newAccessToken = jwt.sign(
      { admin_id: admin.id, organization_id: admin.organization_id, role: admin.role },
      config.jwtSecret,
      { expiresIn: ACCESS_TOKEN_EXPIRY }
    );

    res.json({
      success: true,
      data: {
        token: newAccessToken,
        refresh_token: newRefreshToken,
        expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      }
    } as VaasApiResponse);
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: { code: 'REFRESH_FAILED', message: 'Token refresh failed' }
    } as VaasApiResponse);
  }
});

// Get current admin info
router.get('/me', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    if (!req.admin) {
      const response: VaasApiResponse = {
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required'
        }
      };
      
      return res.status(401).json(response);
    }
    
    // Get full admin details with organization
    const { data: admin, error } = await vaasSupabase
      .from('vaas_admins')
      .select(`
        id,
        organization_id,
        email,
        first_name,
        last_name,
        role,
        permissions,
        status,
        email_verified,
        email_verified_at,
        last_login_at,
        login_count,
        created_at,
        updated_at,
        vaas_organizations!inner(
          id,
          name,
          slug,
          subscription_tier,
          billing_status,
          settings,
          branding,
          contact_email,
          created_at,
          updated_at
        )
      `)
      .eq('id', req.admin.id)
      .single();
      
    if (error || !admin) {
      const response: VaasApiResponse = {
        success: false,
        error: {
          code: 'ADMIN_NOT_FOUND',
          message: 'Admin not found'
        }
      };
      
      return res.status(404).json(response);
    }
    
    // Remove sensitive data
    const { password_hash, ...adminData } = admin as any;

    const superAdminEmails = (config.superAdminEmails || '').split(',').map((e: string) => e.trim());
    const isSuperAdmin = superAdminEmails.includes(adminData.email);

    const response: VaasApiResponse = {
      success: true,
      data: {
        admin: { ...adminData, is_super_admin: isSuperAdmin },
        organization: admin.vaas_organizations
      }
    };
    
    res.json(response);
  } catch (error: any) {
    const response: VaasApiResponse = {
      success: false,
      error: {
        code: 'FETCH_ADMIN_FAILED',
        message: error.message
      }
    };
    
    res.status(500).json(response);
  }
});

// Request password reset
router.post('/forgot-password', async (req, res) => {
  try {
    const { email, organization_slug } = req.body;
    
    if (!email) {
      const response: VaasApiResponse = {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Email is required'
        }
      };
      
      return res.status(400).json(response);
    }
    
    // Find admin
    let query = vaasSupabase
      .from('vaas_admins')
      .select(`
        id,
        email,
        first_name,
        vaas_organizations!inner(
          id,
          name,
          slug
        )
      `)
      .eq('email', email)
      .eq('status', 'active');
      
    if (organization_slug) {
      query = query.eq('vaas_organizations.slug', organization_slug);
    }
    
    const { data: admin, error } = await query.single();
    
    // Always return success to prevent email enumeration
    const response: VaasApiResponse = {
      success: true,
      data: { 
        message: 'If an account with that email exists, a password reset link has been sent.' 
      }
    };
    
    if (!error && admin) {
      // Generate password reset token
      const resetToken = jwt.sign(
        { admin_id: admin.id, email: admin.email },
        config.jwtSecret,
        { expiresIn: '1h' }
      );
      
      // TODO: Send password reset email
      // For now, just log the reset URL (in production, send via email service)
      console.log(`Password reset URL for ${admin.email}: ${config.frontendUrl}/reset-password?token=${resetToken}`);
    }
    
    res.json(response);
  } catch (error: any) {
    const response: VaasApiResponse = {
      success: true,
      data: { 
        message: 'If an account with that email exists, a password reset link has been sent.' 
      }
    };
    
    res.status(200).json(response);
  }
});

// Reset password with token
router.post('/reset-password', async (req, res) => {
  try {
    const { token, new_password } = req.body;
    
    if (!token || !new_password) {
      const response: VaasApiResponse = {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Token and new password are required'
        }
      };
      
      return res.status(400).json(response);
    }
    
    if (new_password.length < 8) {
      const response: VaasApiResponse = {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Password must be at least 8 characters'
        }
      };
      
      return res.status(400).json(response);
    }
    
    // Verify reset token
    const decoded = jwt.verify(token, config.jwtSecret) as any;
    
    // Hash new password
    const passwordHash = await bcrypt.hash(new_password, 12);
    
    // Update password, clear lockout, and revoke all refresh tokens
    const [{ error }] = await Promise.all([
      vaasSupabase
        .from('vaas_admins')
        .update({
          password_hash: passwordHash,
          failed_login_attempts: 0,
          locked_until: null,
        })
        .eq('id', decoded.admin_id)
        .eq('email', decoded.email),
      vaasSupabase
        .from('vaas_refresh_tokens')
        .delete()
        .eq('admin_id', decoded.admin_id),
    ]);

    if (error) {
      throw new Error('Failed to update password');
    }
    
    const response: VaasApiResponse = {
      success: true,
      data: { message: 'Password reset successfully' }
    };
    
    res.json(response);
  } catch (error: any) {
    const response: VaasApiResponse = {
      success: false,
      error: {
        code: 'PASSWORD_RESET_FAILED',
        message: 'Invalid or expired reset token'
      }
    };
    
    res.status(400).json(response);
  }
});

// Email verification endpoint
router.get('/verify-email', async (req, res) => {
  try {
    const { token } = req.query;
    
    if (!token || typeof token !== 'string') {
      const response: VaasApiResponse = {
        success: false,
        error: {
          code: 'INVALID_TOKEN',
          message: 'Verification token is required'
        }
      };
      
      return res.status(400).json(response);
    }
    
    // Verify JWT token
    const decoded = jwt.verify(token, config.jwtSecret) as any;

    if (!decoded.email || decoded.type !== 'email_verification') {
      throw new Error('Invalid token payload');
    }

    // Update admin email_verified status — match by admin_id if present, otherwise by email
    const query = vaasSupabase
      .from('vaas_admins')
      .update({ email_verified: true, email_verified_at: new Date().toISOString() });

    if (decoded.admin_id) {
      query.eq('id', decoded.admin_id).eq('email', decoded.email);
    } else {
      query.eq('email', decoded.email);
    }

    const { error } = await query;

    if (error) {
      throw new Error('Failed to verify email');
    }
    
    const response: VaasApiResponse = {
      success: true,
      data: {
        message: 'Email verified successfully',
        email: decoded.email
      }
    };
    
    res.json(response);
  } catch (error: any) {
    const response: VaasApiResponse = {
      success: false,
      error: {
        code: 'EMAIL_VERIFICATION_FAILED',
        message: 'Invalid or expired verification token'
      }
    };
    
    res.status(400).json(response);
  }
});

export default router;