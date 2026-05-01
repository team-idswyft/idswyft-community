import { AppConfig } from '../types/index.js';

export const config: AppConfig = {
  port: parseInt(process.env.PORT || '3001'),
  nodeEnv: process.env.NODE_ENV || 'development',
  corsOrigins: [
    ...new Set([
      ...(process.env.CORS_ORIGINS?.split(',').map(s => s.trim()) || ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:5175', 'http://localhost:5176', 'http://localhost:3000']),
      // Always allow production, staging, and Docker self-hosted origins
      'http://localhost',
      'https://idswyft.app',
      'https://www.idswyft.app',
      'https://staging.idswyft.app',
    ]),
  ],
  railwayAllowedOrigins: process.env.RAILWAY_ALLOWED_ORIGINS?.split(',').map(s => s.trim()).filter(Boolean) ?? [],
  jwtSecret: process.env.JWT_SECRET || 'your-super-secret-jwt-key',
  apiKeySecret: process.env.API_KEY_SECRET || 'your-api-key-encryption-secret',
  serviceToken: process.env.SERVICE_TOKEN || 'your-service-to-service-token',
  encryptionKey: process.env.ENCRYPTION_KEY || 'your-32-character-encryption-key',
  
  database: {
    url: process.env.DATABASE_URL || 'postgresql://postgres:password@localhost:5432/idswyft'
  },
  
  supabase: {
    url: process.env.SUPABASE_URL || '',
    anonKey: process.env.SUPABASE_ANON_KEY || '',
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
    storageBucket: process.env.SUPABASE_STORAGE_BUCKET || 'identity-documents',
    vaasBucket: process.env.SUPABASE_VAAS_BUCKET || 'vaas-documents',
    demoBucket: process.env.SUPABASE_DEMO_BUCKET || 'demo-documents',
  },
  
  storage: {
    provider: (process.env.STORAGE_PROVIDER as 'supabase' | 'local' | 's3') || 'supabase',
    // Absolute base URL for public-asset paths returned by storePublicAsset.
    // Set this in cloud deployments where the frontend and API live on
    // different origins (e.g. www.idswyft.app vs api.idswyft.app) so
    // <img src> resolves to the API host and not the frontend host.
    // Leave unset for community/self-host where nginx proxies /api/* to the
    // backend on the same origin — relative URLs work as-is there.
    publicAssetBaseUrl: process.env.PUBLIC_ASSET_BASE_URL || '',
    awsAccessKey: process.env.AWS_ACCESS_KEY_ID,
    awsSecretKey: process.env.AWS_SECRET_ACCESS_KEY,
    awsRegion: process.env.AWS_REGION || 'us-east-1',
    awsS3Bucket: process.env.AWS_S3_BUCKET,
    // Envelope encryption for the local provider. When true, new file writes
    // are AES-256-GCM encrypted under ENCRYPTION_KEY (envelope-wrapped per file).
    // Read path always handles a mixed population — pre-encryption files
    // pass through as-is, encrypted files decrypt. See storageCrypto.ts.
    encryption: process.env.STORAGE_ENCRYPTION === 'true',
    // Optional previous master key, used during key rotation. When set, the
    // read path tries this key as a fallback after the current ENCRYPTION_KEY.
    encryptionKeyPrevious: process.env.ENCRYPTION_KEY_PREVIOUS,
  },
  
  ocr: {
    tesseractPath: process.env.TESSERACT_PATH || '/usr/bin/tesseract'
  },
  
  externalApis: {
    persona: process.env.PERSONA_API_KEY ? {
      apiKey: process.env.PERSONA_API_KEY,
      templateId: process.env.PERSONA_TEMPLATE_ID || ''
    } : undefined,
    onfido: process.env.ONFIDO_API_KEY ? {
      apiKey: process.env.ONFIDO_API_KEY,
      webhookToken: process.env.ONFIDO_WEBHOOK_TOKEN || ''
    } : undefined
  },
  
  rateLimiting: {
    enabled: process.env.RATE_LIMIT_ENABLED !== 'false', // default true; set false for self-hosted
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '3600000'), // 1 hour
    maxRequestsPerUser: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS_PER_USER || '5'),
    maxRequestsPerDev: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS_PER_DEV || '1000')
  },
  
  webhooks: {
    retryAttempts: parseInt(process.env.WEBHOOK_RETRY_ATTEMPTS || '3'),
    timeoutMs: parseInt(process.env.WEBHOOK_TIMEOUT_MS || '5000')
  },
  
  compliance: {
    dataRetentionDays: parseInt(process.env.DATA_RETENTION_DAYS || '90'),
    gdprCompliance: process.env.GDPR_COMPLIANCE === 'true'
  },
  
  sandbox: {
    enabled: process.env.SANDBOX_MODE === 'true',
    mockVerification: process.env.ENABLE_MOCK_VERIFICATION === 'true',
    mockDelayMs: parseInt(process.env.MOCK_VERIFICATION_DELAY_MS || '2000'),
    retentionHours: parseInt(process.env.SANDBOX_RETENTION_HOURS || '24'),
  },

  providers: {
    ocr: (process.env.OCR_PROVIDER ?? 'auto') as 'tesseract' | 'openai' | 'azure' | 'aws-textract' | 'auto',
    face: (process.env.FACE_PROVIDER ?? 'tensorflow') as 'tensorflow' | 'aws-rekognition' | 'custom',
    liveness: (process.env.LIVENESS_PROVIDER ?? 'enhanced-heuristic') as 'enhanced-heuristic' | 'custom',
    customOcrEndpoint: process.env.CUSTOM_OCR_ENDPOINT,
    customFaceEndpoint: process.env.CUSTOM_FACE_ENDPOINT,
  },

  email: {
    resendApiKey: process.env.RESEND_API_KEY || '',
    fromAddress: process.env.EMAIL_FROM || 'Idswyft <team@mail.idswyft.app>',
  },

  github: {
    clientId: process.env.GITHUB_CLIENT_ID || '',
    clientSecret: process.env.GITHUB_CLIENT_SECRET || '',
    redirectUri: process.env.GITHUB_REDIRECT_URI || 'https://www.idswyft.app/developer',
  }
};

export default config;

// Validate secrets at startup — throws in production if placeholder values are present
import { validateSecrets } from './validateSecrets.js';

if (process.env.NODE_ENV === 'production') {
  validateSecrets({
    jwtSecret: config.jwtSecret,
    apiKeySecret: config.apiKeySecret,
    encryptionKey: config.encryptionKey,
    serviceToken: config.serviceToken,
  });
}

// Hard guard: STORAGE_ENCRYPTION=true with the default placeholder ENCRYPTION_KEY
// would encrypt files under a public-string key (the placeholder appears
// verbatim in this file and the README). Fail-fast at startup regardless of
// NODE_ENV so this misconfiguration can't slip through dev → staging → prod.
if (config.storage.encryption) {
  const placeholderKeys = [
    'your-32-character-encryption-key',
    'change-this-32-char-encrypt-key!',
  ];
  if (placeholderKeys.includes(config.encryptionKey) || !process.env.ENCRYPTION_KEY) {
    throw new Error(
      'STORAGE_ENCRYPTION=true requires ENCRYPTION_KEY to be set to a real value (not the default placeholder). ' +
      'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))" — ' +
      'then set it as the ENCRYPTION_KEY env var.'
    );
  }
  if (Buffer.byteLength(config.encryptionKey, 'utf8') < 32) {
    throw new Error(
      `STORAGE_ENCRYPTION=true requires ENCRYPTION_KEY to be at least 32 bytes (got ${Buffer.byteLength(config.encryptionKey, 'utf8')}).`
    );
  }
}