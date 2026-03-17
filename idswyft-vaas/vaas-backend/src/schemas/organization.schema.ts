import { z } from 'zod';

const slugRegex = /^[a-z0-9][a-z0-9-]{1,98}[a-z0-9]$/;

export const createOrganizationSchema = z.object({
  name: z.string().min(2, 'Organization name must be at least 2 characters').max(255),
  slug: z.string().regex(slugRegex, 'Slug must be 3-100 chars, lowercase letters, numbers, and hyphens').optional(),
  contact_email: z.string().email('Valid contact email is required'),
  admin_email: z.string().email('Valid admin email is required'),
  admin_password: z.string().min(8, 'Admin password must be at least 8 characters'),
  subscription_tier: z.enum(['starter', 'professional', 'enterprise']).optional(),
});

export const updateOrganizationSchema = z.object({
  name: z.string().min(2).max(255).optional(),
  contact_email: z.string().email().optional(),
  contact_phone: z.string().max(50).optional(),
  support_email: z.string().email().optional(),
  branding: z.object({
    company_name: z.string().max(255).optional(),
    logo_url: z.string().url().optional().or(z.literal('')),
    favicon_url: z.string().url().optional().or(z.literal('')),
    primary_color: z.string().max(20).optional(),
    welcome_message: z.string().max(2000).optional(),
    success_message: z.string().max(2000).optional(),
    custom_css: z.string().max(10000).optional(),
    email_banner_url: z.string().url().optional().or(z.literal('')),
    portal_background_url: z.string().url().optional().or(z.literal('')),
  }).optional(),
  settings: z.record(z.unknown()).optional(),
  // Owner/super_admin-only fields (access enforced in route handler)
  subscription_tier: z.enum(['starter', 'professional', 'enterprise']).optional(),
  billing_status: z.enum(['active', 'past_due', 'cancelled', 'trialing']).optional(),
  stripe_customer_id: z.string().max(100).optional(),
});

export const enterpriseSignupSchema = z.object({
  firstName: z.string().min(1, 'First name is required').max(255),
  lastName: z.string().min(1, 'Last name is required').max(255),
  email: z.string().email('Valid business email is required').refine(
    (email) => {
      const freeProviders = ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'aol.com', 'icloud.com'];
      const domain = email.split('@')[1]?.toLowerCase();
      return !freeProviders.includes(domain);
    },
    { message: 'Please use a business email address' }
  ),
  phone: z.string().optional(),
  company: z.string().min(2, 'Company name must be at least 2 characters').max(255),
  jobTitle: z.string().min(1, 'Job title is required').max(255),
  estimatedVolume: z.enum(['1-1000', '1000-10000', '10000-50000', '50000+']),
  useCase: z.string().min(10, 'Use case description must be at least 10 characters').max(5000),
});
