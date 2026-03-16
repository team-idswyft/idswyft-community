import { AppConfig } from '../types/index.js';

export const config: AppConfig = {
  port: parseInt(process.env.PORT || '3001'),
  nodeEnv: process.env.NODE_ENV || 'development',
  corsOrigins: process.env.CORS_ORIGINS?.split(',') || ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:5175', 'http://localhost:5176', 'http://localhost:3000'],
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
    awsAccessKey: process.env.AWS_ACCESS_KEY_ID,
    awsSecretKey: process.env.AWS_SECRET_ACCESS_KEY,
    awsRegion: process.env.AWS_REGION || 'us-east-1',
    awsS3Bucket: process.env.AWS_S3_BUCKET
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
    liveness: (process.env.LIVENESS_PROVIDER ?? 'heuristic') as 'heuristic' | 'custom',
    customOcrEndpoint: process.env.CUSTOM_OCR_ENDPOINT,
    customFaceEndpoint: process.env.CUSTOM_FACE_ENDPOINT,
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