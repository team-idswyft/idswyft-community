import { Router } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { vaasSupabase } from '../config/database.js';
import config from '../config/index.js';
import { VaasApiResponse, VaasLoginRequest, VaasLoginResponse } from '../types/index.js';
import { validateLoginRequest } from '../middleware/validation.js';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth.js';

const router = Router();

// Admin login
router.post('/login', validateLoginRequest, async (req, res) => {
  try {
    const { email, password, organization_slug }: VaasLoginRequest = req.body;
    
    // Build query to find admin
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
    
    // Verify password
    const passwordMatch = await bcrypt.compare(password, (admin as any).password_hash);
    if (!passwordMatch) {
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
    
    // Generate JWT token
    const token = jwt.sign(
      {
        admin_id: admin.id,
        organization_id: admin.organization_id,
        role: admin.role
      },
      config.jwtSecret,
      { expiresIn: '24h' }
    );
    
    // Update login stats
    await vaasSupabase
      .from('vaas_admins')
      .update({
        last_login_at: new Date().toISOString(),
        login_count: (admin.login_count || 0) + 1
      })
      .eq('id', admin.id);
    
    // Prepare response
    const loginResponse: VaasLoginResponse = {
      token,
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
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
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

// Admin logout
router.post('/logout', requireAuth, async (req: AuthenticatedRequest, res) => {
  // Note: JWT tokens are stateless, so we can't invalidate them server-side
  // In production, you might want to implement token blacklisting
  // For now, the client should just delete the token
  
  const response: VaasApiResponse = {
    success: true,
    data: { message: 'Logged out successfully' }
  };
  
  res.json(response);
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
    
    // Update password
    const { error } = await vaasSupabase
      .from('vaas_admins')
      .update({ password_hash: passwordHash })
      .eq('id', decoded.admin_id)
      .eq('email', decoded.email);
      
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