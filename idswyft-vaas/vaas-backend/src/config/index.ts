import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables manually for Railway/Docker compatibility
// Skip in test environments — tests control process.env directly via vi.stubEnv / delete
if (!process.env.VITEST) try {
  const envPath = join(__dirname, '../../.env');
  const envFile = readFileSync(envPath, 'utf8');
  envFile
    .split('\n')
    .filter(line => line && !line.startsWith('#') && line.includes('='))
    .forEach(line => {
      const [key, ...valueParts] = line.split('=');
      if (key && valueParts.length > 0 && !process.env[key.trim()]) {
        const value = valueParts.join('=').trim();
        process.env[key.trim()] = value;
      }
    });
  console.log('✅ VaaS environment variables loaded');
} catch (error: unknown) {
  console.warn('⚠️ Could not load .env file, using defaults');
}

export const config = {
  // Server
  port: parseInt(process.env.VAAS_PORT || '3002'),
  nodeEnv: process.env.NODE_ENV || 'development',
  
  // CORS Origins
  corsOrigins: process.env.VAAS_CORS_ORIGINS?.split(',') || [
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:5173',
    'https://app.idswyft.app',
    'https://platform.idswyft.app',
    'https://customer.idswyft.app',
    'https://enterprise.idswyft.app'
  ],
  
  // VaaS Database (separate from main Idswyft)
  vaasDatabase: {
    url: process.env.VAAS_SUPABASE_URL || '',
    serviceRoleKey: process.env.VAAS_SUPABASE_SERVICE_ROLE_KEY || '',
    anonKey: process.env.VAAS_SUPABASE_ANON_KEY || ''
  },
  
  // Main Idswyft API Integration
  idswyftApi: {
    baseUrl: process.env.IDSWYFT_API_URL || 'https://api.idswyft.app',
    serviceToken: process.env.IDSWYFT_SERVICE_TOKEN || '', // Service-to-service auth
    timeout: parseInt(process.env.IDSWYFT_API_TIMEOUT || '30000')
  },
  
  // Security secrets — MUST be set in production; throw at startup if missing
  jwtSecret: (() => {
    const secret = process.env.VAAS_JWT_SECRET;
    if (!secret && process.env.NODE_ENV === 'production') {
      throw new Error(
        'VAAS_JWT_SECRET environment variable must be set in production'
      );
    }
    return secret || 'vaas-super-secret-jwt-key';
  })(),
  apiKeySecret: (() => {
    const secret = process.env.VAAS_API_KEY_SECRET;
    if (!secret && process.env.NODE_ENV === 'production') {
      throw new Error(
        'VAAS_API_KEY_SECRET environment variable must be set in production'
      );
    }
    return secret || 'vaas-api-key-encryption-secret';
  })(),
  superAdminEmails: process.env.VAAS_SUPER_ADMIN_EMAILS || '',
  
  // Frontend URLs
  frontendUrl: process.env.VAAS_FRONTEND_URL || 'https://app.idswyft.app',
  
  // Rate Limiting
  rateLimiting: {
    windowMs: parseInt(process.env.VAAS_RATE_LIMIT_WINDOW_MS || '3600000'), // 1 hour
    maxRequestsPerOrg: parseInt(process.env.VAAS_RATE_LIMIT_MAX_REQUESTS_PER_ORG || '1000'),
    maxRequestsPerUser: parseInt(process.env.VAAS_RATE_LIMIT_MAX_REQUESTS_PER_USER || '100')
  },
  
  // Billing & Payments
  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY || '',
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',
    publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || ''
  },
  
  // Pricing Tiers
  pricing: {
    starter: {
      monthlyFee: 29900, // $299.00 in cents
      perVerificationFee: 200, // $2.00 in cents
      monthlyIncluded: 500
    },
    professional: {
      monthlyFee: 79900, // $799.00 in cents
      perVerificationFee: 150, // $1.50 in cents
      monthlyIncluded: 2000
    },
    enterprise: {
      monthlyFee: 249900, // $2499.00 in cents
      perVerificationFee: 100, // $1.00 in cents
      monthlyIncluded: -1 // Unlimited
    }
  },
  
  // File Storage
  storage: {
    provider: process.env.VAAS_STORAGE_PROVIDER || 'local', // 'local', 's3', 'supabase'
    maxFileSize: parseInt(process.env.VAAS_MAX_FILE_SIZE || '10485760'), // 10MB
    allowedTypes: process.env.VAAS_ALLOWED_FILE_TYPES?.split(',') || [
      'image/jpeg',
      'image/jpg', 
      'image/png',
      'application/pdf'
    ]
  },
  
  // Email (for notifications)
  email: {
    provider: process.env.EMAIL_PROVIDER || 'smtp',
    fromAddress: process.env.EMAIL_FROM || 'noreply@mail.idswyft.app',
    smtpHost: process.env.SMTP_HOST,
    smtpPort: parseInt(process.env.SMTP_PORT || '587'),
    smtpUser: process.env.SMTP_USER,
    smtpPass: process.env.SMTP_PASS
  },
  
  // Feature Flags
  features: {
    webhooksEnabled: process.env.VAAS_WEBHOOKS_ENABLED !== 'false',
    billingEnabled: process.env.VAAS_BILLING_ENABLED !== 'false',
    analyticsEnabled: process.env.VAAS_ANALYTICS_ENABLED !== 'false',
    customDomains: process.env.VAAS_CUSTOM_DOMAINS_ENABLED === 'true'
  },
  
  // Monitoring
  monitoring: {
    sentryDsn: process.env.SENTRY_DSN || '',
    logLevel: process.env.LOG_LEVEL || 'info'
  }
};

export default config;