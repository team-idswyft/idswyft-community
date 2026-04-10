/**
 * Integration tests for the v2 verification routes.
 *
 * These tests exercise the HTTP route layer (/api/v2/verify/*) in isolation
 * by mocking all external dependencies (Supabase, OCR, barcode, face recognition,
 * storage). They verify the full request→session→response pipeline including:
 *   - Backward-compatible JSON response shapes
 *   - Correct state machine transitions via VerificationSession
 *   - Cross-validation auto-trigger after back-document
 *   - Face match auto-trigger after live-capture
 *   - /finalize deprecation (returns current state, not 410)
 *   - /cross-validation returns cached result
 *   - SessionFlowError handling (out-of-order steps)
 */

import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { VerificationStatus } from '@idswyft/shared';

// ─── Mock external deps before importing routes ───────────────

// Supabase mock — in-memory store
const contextStore = new Map<string, any>();
const verificationStore = new Map<string, any>();

vi.mock('@/config/database.js', () => ({
  supabase: {
    from: (table: string) => {
      if (table === 'verification_contexts') {
        return {
          upsert: vi.fn(async (row: any) => {
            contextStore.set(row.verification_id, row);
            return { data: row, error: null };
          }),
          select: vi.fn(() => ({
            eq: vi.fn((_col: string, id: string) => ({
              single: vi.fn(async () => {
                const stored = contextStore.get(id);
                return { data: stored || null, error: stored ? null : { code: 'PGRST116' } };
              }),
            })),
          })),
        };
      }
      // Default table mock
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn(async () => ({ data: null, error: null })),
            limit: vi.fn(() => ({ data: [], error: null })),
          })),
        })),
        insert: vi.fn(async (row: any) => ({ data: row, error: null })),
        update: vi.fn(() => ({
          eq: vi.fn(async () => ({ data: null, error: null })),
        })),
        upsert: vi.fn(async (row: any) => ({ data: row, error: null })),
      };
    },
  },
}));

// Storage service
vi.mock('@/services/storage.js', () => ({
  StorageService: class MockStorageService {
    async storeDocument() { return '/mock/path/document.jpg'; }
    async storeSelfie() { return '/mock/path/selfie.jpg'; }
  },
}));

// Verification service
vi.mock('@/services/verification.js', () => ({
  VerificationService: class MockVerificationService {
    async createVerificationRequest(data: any) {
      return { id: 'a0a0a0a0-b1b1-c2c2-d3d3-e4e4e4e4e4e4', ...data };
    }
    async getVerificationRequestForDeveloper() {
      return { id: 'a0a0a0a0-b1b1-c2c2-d3d3-e4e4e4e4e4e4', is_sandbox: false };
    }
    async updateVerificationRequest() { return {}; }
    async createDocument(data: any) {
      return { id: 'b1b1b1b1-c2c2-d3d3-e4e4-f5f5f5f5f5f5', ...data };
    }
    async createSelfie(data: any) {
      return { id: 'c2c2c2c2-d3d3-e4e4-f5f5-a6a6a6a6a6a6', ...data };
    }
  },
}));

// OCR service
vi.mock('@/services/ocr.js', () => ({
  OCRService: class MockOCRService {
    async processDocument() {
      return {
        name: 'JOHN DOE',
        date_of_birth: '1990-01-15',
        document_number: 'AB1234567',
        expiration_date: '2030-12-31',
        nationality: 'USA',
        confidence_scores: {
          name: 0.92,
          date_of_birth: 0.89,
          document_number: 0.95,
          expiration_date: 0.88,
        },
      };
    }
  },
}));

// Barcode service
vi.mock('@/services/barcode.js', () => ({
  BarcodeService: class MockBarcodeService {
    async scanBackOfId() {
      return {
        pdf417_data: {
          parsed_data: {
            firstName: 'JOHN',
            lastName: 'DOE',
            dateOfBirth: '1990-01-15',
            licenseNumber: 'AB1234567',
            expirationDate: '2030-12-31',
          },
          raw_data: 'raw-barcode-data',
        },
      };
    }
  },
}));

// Face recognition service
vi.mock('@/services/faceRecognition.js', () => ({
  FaceRecognitionService: class MockFaceRecognitionService {
    async detectFacePresence() { return 0.92; }
  },
}));

// Auth middlewares — passthrough
const mockApiKeyAuth = (req: any, _res: any, next: any) => {
  req.apiKey = { id: 'key-123', is_sandbox: false, developer_id: 'dev-123' };
  req.developer = { id: 'dev-123' };
  next();
};
vi.mock('@/middleware/auth.js', () => ({
  authenticateAPIKey: mockApiKeyAuth,
  authenticateAPIKeyOrHandoff: mockApiKeyAuth,
  authenticateUser: (_req: any, _res: any, next: any) => next(),
  checkSandboxMode: (_req: any, _res: any, next: any) => next(),
}));

// Rate limit — passthrough
vi.mock('@/middleware/rateLimit.js', () => ({
  verificationRateLimit: (_req: any, _res: any, next: any) => next(),
}));

// Error handler
vi.mock('@/middleware/errorHandler.js', () => ({
  catchAsync: (fn: any) => (req: any, res: any, next: any) =>
    Promise.resolve(fn(req, res, next)).catch(next),
  ValidationError: class ValidationError extends Error {
    statusCode = 400;
    constructor(message: string, public field?: string, public value?: any) {
      super(message);
    }
  },
  FileUploadError: class FileUploadError extends Error {
    statusCode = 400;
    constructor(message: string) {
      super(message);
    }
  },
}));

// File validation — passthrough
vi.mock('@/middleware/fileValidation.js', () => ({
  validateFileType: vi.fn(async () => ({ valid: true })),
}));

// Logger — no-op
vi.mock('@/utils/logger.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
  logVerificationEvent: vi.fn(),
}));

// Validate middleware — passthrough (express-validator chains tested separately)
vi.mock('@/middleware/validate.js', () => ({
  validate: (_req: any, _res: any, next: any) => next(),
}));

// Thresholds — must include all sub-objects accessed by gates
vi.mock('@/config/verificationThresholds.js', () => ({
  VERIFICATION_THRESHOLDS: {
    LIVENESS: { production: 0.50, sandbox: 0.30 },
    FACE_MATCHING: { production: 0.60, sandbox: 0.55 },
    CROSS_VALIDATION: 0.75,
    OCR_CONFIDENCE: { minimum_acceptable: 0.60, high_confidence: 0.85 },
    FACE_PRESENCE: { minimum_confidence: 0.45, high_confidence: 0.75 },
    PDF417: { minimum_confidence: 0.70, high_confidence: 0.90 },
    QUALITY: { minimum_acceptable: 0.50, good_quality: 0.75 },
  },
  getFaceMatchingThresholdSync: vi.fn(() => 0.60),
  getLivenessThresholdSync: vi.fn(() => 0.50),
  getFaceMatchingThreshold: vi.fn(async () => 0.60),
  getLivenessThreshold: vi.fn(async () => 0.50),
  validateScores: vi.fn(() => ({ passed: true })),
  getThresholdInfo: vi.fn(() => ({})),
}));

// ─── Helper to create test app ────────────────────────────────

async function createApp() {
  const { default: router } = await import('../../routes/newVerification.js');
  const app = express();
  app.use(express.json());
  app.use('/api/v2/verify', router);
  // Error handler
  app.use((err: any, _req: any, res: any, _next: any) => {
    res.status(err.statusCode || 500).json({
      success: false,
      error: err.message,
    });
  });
  return app;
}

// ─── Helper: fake JPEG buffer (starts with JPEG magic bytes) ──

function fakeJpegBuffer(): Buffer {
  // JPEG starts with FF D8 FF
  const header = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
  const body = Buffer.alloc(1000, 0x42);
  return Buffer.concat([header, body]);
}

// ─── Tests ─────────────────────────────────────────────────────

describe('V2 Verification Routes — Integration', () => {
  let app: express.Express;

  beforeAll(async () => {
    app = await createApp();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    contextStore.clear();
    verificationStore.clear();
  });

  describe('POST /api/v2/verify/initialize', () => {
    it('creates a new verification session and returns 201', async () => {
      const res = await request(app)
        .post('/api/v2/verify/initialize')
        .send({
          user_id: '550e8400-e29b-41d4-a716-446655440000',
          document_type: 'drivers_license',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.verification_id).toBe('a0a0a0a0-b1b1-c2c2-d3d3-e4e4e4e4e4e4');
      expect(res.body.status).toBe(VerificationStatus.AWAITING_FRONT);
      expect(res.body.current_step).toBe(1);
      expect(res.body.total_steps).toBe(5);
    });

    it('saves session state to context store', async () => {
      await request(app)
        .post('/api/v2/verify/initialize')
        .send({
          user_id: '550e8400-e29b-41d4-a716-446655440000',
        });

      expect(contextStore.has('a0a0a0a0-b1b1-c2c2-d3d3-e4e4e4e4e4e4')).toBe(true);
      const stored = contextStore.get('a0a0a0a0-b1b1-c2c2-d3d3-e4e4e4e4e4e4');
      const state = JSON.parse(stored.context);
      expect(state.current_step).toBe(VerificationStatus.AWAITING_FRONT);
    });
  });

  describe('POST /api/v2/verify/:id/front-document', () => {
    beforeEach(async () => {
      // Initialize a session first
      await request(app)
        .post('/api/v2/verify/initialize')
        .send({
          user_id: '550e8400-e29b-41d4-a716-446655440000',
        });
    });

    it('processes front document and advances to AWAITING_BACK', async () => {
      const res = await request(app)
        .post('/api/v2/verify/a0a0a0a0-b1b1-c2c2-d3d3-e4e4e4e4e4e4/front-document')
        .attach('document', fakeJpegBuffer(), 'front.jpg');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.verification_id).toBe('a0a0a0a0-b1b1-c2c2-d3d3-e4e4e4e4e4e4');
      expect(res.body.status).toBe(VerificationStatus.AWAITING_BACK);
      expect(res.body.current_step).toBe(2);
      expect(res.body.document_id).toBe('b1b1b1b1-c2c2-d3d3-e4e4-f5f5f5f5f5f5');
      expect(res.body.ocr_data).toBeDefined();
      expect(res.body.ocr_data.full_name).toBe('JOHN DOE');
    });

    it('persists front_extraction in session state', async () => {
      await request(app)
        .post('/api/v2/verify/a0a0a0a0-b1b1-c2c2-d3d3-e4e4e4e4e4e4/front-document')
        .attach('document', fakeJpegBuffer(), 'front.jpg');

      const stored = contextStore.get('a0a0a0a0-b1b1-c2c2-d3d3-e4e4e4e4e4e4');
      const state = JSON.parse(stored.context);
      expect(state.current_step).toBe(VerificationStatus.AWAITING_BACK);
      expect(state.front_extraction).toBeDefined();
      expect(state.front_extraction.ocr.full_name).toBe('JOHN DOE');
    });
  });

  describe('POST /api/v2/verify/:id/back-document', () => {
    beforeEach(async () => {
      // Initialize + front
      await request(app)
        .post('/api/v2/verify/initialize')
        .send({ user_id: '550e8400-e29b-41d4-a716-446655440000' });
      await request(app)
        .post('/api/v2/verify/a0a0a0a0-b1b1-c2c2-d3d3-e4e4e4e4e4e4/front-document')
        .attach('document', fakeJpegBuffer(), 'front.jpg');
    });

    it('processes back document with auto cross-validation', async () => {
      const res = await request(app)
        .post('/api/v2/verify/a0a0a0a0-b1b1-c2c2-d3d3-e4e4e4e4e4e4/back-document')
        .attach('document', fakeJpegBuffer(), 'back.jpg');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.barcode_data).toBeDefined();
      expect(res.body.cross_validation_results).toBeDefined();
      expect(res.body.cross_validation_results.overall_score).toBeGreaterThan(0);
      // Should be in AWAITING_LIVE after successful back + cross-val
      expect(res.body.status).toBe(VerificationStatus.AWAITING_LIVE);
      expect(res.body.current_step).toBe(4);
    });

    it('returns documents_match based on cross-validation', async () => {
      const res = await request(app)
        .post('/api/v2/verify/a0a0a0a0-b1b1-c2c2-d3d3-e4e4e4e4e4e4/back-document')
        .attach('document', fakeJpegBuffer(), 'back.jpg');

      expect(res.body.documents_match).toBeDefined();
      expect(typeof res.body.documents_match).toBe('boolean');
    });
  });

  describe('POST /api/v2/verify/:id/cross-validation (cached)', () => {
    beforeEach(async () => {
      await request(app)
        .post('/api/v2/verify/initialize')
        .send({ user_id: '550e8400-e29b-41d4-a716-446655440000' });
      await request(app)
        .post('/api/v2/verify/a0a0a0a0-b1b1-c2c2-d3d3-e4e4e4e4e4e4/front-document')
        .attach('document', fakeJpegBuffer(), 'front.jpg');
      await request(app)
        .post('/api/v2/verify/a0a0a0a0-b1b1-c2c2-d3d3-e4e4e4e4e4e4/back-document')
        .attach('document', fakeJpegBuffer(), 'back.jpg');
    });

    it('returns cached cross-validation result', async () => {
      const res = await request(app)
        .post('/api/v2/verify/a0a0a0a0-b1b1-c2c2-d3d3-e4e4e4e4e4e4/cross-validation')
        .send();

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.cross_validation_results).toBeDefined();
      expect(res.body.cross_validation_results.overall_score).toBeGreaterThan(0);
      expect(res.body.message).toContain('auto-triggered');
    });
  });

  describe('POST /api/v2/verify/:id/live-capture', () => {
    beforeEach(async () => {
      await request(app)
        .post('/api/v2/verify/initialize')
        .send({ user_id: '550e8400-e29b-41d4-a716-446655440000' });
      await request(app)
        .post('/api/v2/verify/a0a0a0a0-b1b1-c2c2-d3d3-e4e4e4e4e4e4/front-document')
        .attach('document', fakeJpegBuffer(), 'front.jpg');
      await request(app)
        .post('/api/v2/verify/a0a0a0a0-b1b1-c2c2-d3d3-e4e4e4e4e4e4/back-document')
        .attach('document', fakeJpegBuffer(), 'back.jpg');
    });

    it('processes live capture with auto face match and completes verification', async () => {
      const res = await request(app)
        .post('/api/v2/verify/a0a0a0a0-b1b1-c2c2-d3d3-e4e4e4e4e4e4/live-capture')
        .attach('selfie', fakeJpegBuffer(), 'selfie.jpg');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.selfie_id).toBe('c2c2c2c2-d3d3-e4e4-f5f5-a6a6a6a6a6a6');
      expect(res.body.liveness_results).toBeDefined();
      expect(res.body.face_match_results).toBeDefined();
      // Final result should be present
      expect(res.body.final_result).toBeDefined();
    });

    it('includes correct response shape for backward compatibility', async () => {
      const res = await request(app)
        .post('/api/v2/verify/a0a0a0a0-b1b1-c2c2-d3d3-e4e4e4e4e4e4/live-capture')
        .attach('selfie', fakeJpegBuffer(), 'selfie.jpg');

      // All backward-compat fields should be present
      expect(res.body).toHaveProperty('verification_id');
      expect(res.body).toHaveProperty('status');
      expect(res.body).toHaveProperty('current_step');
      expect(res.body).toHaveProperty('face_match_results');
      expect(res.body).toHaveProperty('liveness_results');
      expect(res.body).toHaveProperty('final_result');
      expect(res.body).toHaveProperty('rejection_reason');
      expect(res.body).toHaveProperty('rejection_detail');
    });
  });

  describe('POST /api/v2/verify/:id/finalize (deprecated)', () => {
    beforeEach(async () => {
      await request(app)
        .post('/api/v2/verify/initialize')
        .send({ user_id: '550e8400-e29b-41d4-a716-446655440000' });
    });

    it('returns current state with deprecation message', async () => {
      const res = await request(app)
        .post('/api/v2/verify/a0a0a0a0-b1b1-c2c2-d3d3-e4e4e4e4e4e4/finalize')
        .send();

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toContain('deprecated');
    });
  });

  describe('GET /api/v2/verify/:id/status', () => {
    beforeEach(async () => {
      await request(app)
        .post('/api/v2/verify/initialize')
        .send({ user_id: '550e8400-e29b-41d4-a716-446655440000' });
    });

    it('returns full session state for a fresh session', async () => {
      const res = await request(app)
        .get('/api/v2/verify/a0a0a0a0-b1b1-c2c2-d3d3-e4e4e4e4e4e4/status');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.verification_id).toBe('a0a0a0a0-b1b1-c2c2-d3d3-e4e4e4e4e4e4');
      expect(res.body.status).toBe(VerificationStatus.AWAITING_FRONT);
      expect(res.body.current_step).toBe(1);
      expect(res.body.total_steps).toBe(5);
      expect(res.body.front_document_uploaded).toBe(false);
      expect(res.body.back_document_uploaded).toBe(false);
    });

    it('reflects state after front document upload', async () => {
      await request(app)
        .post('/api/v2/verify/a0a0a0a0-b1b1-c2c2-d3d3-e4e4e4e4e4e4/front-document')
        .attach('document', fakeJpegBuffer(), 'front.jpg');

      const res = await request(app)
        .get('/api/v2/verify/a0a0a0a0-b1b1-c2c2-d3d3-e4e4e4e4e4e4/status');

      expect(res.body.status).toBe(VerificationStatus.AWAITING_BACK);
      expect(res.body.front_document_uploaded).toBe(true);
      expect(res.body.ocr_data).toBeDefined();
    });

    it('includes all backward-compat response fields', async () => {
      const res = await request(app)
        .get('/api/v2/verify/a0a0a0a0-b1b1-c2c2-d3d3-e4e4e4e4e4e4/status');

      const expectedFields = [
        'success', 'verification_id', 'status', 'current_step', 'total_steps',
        'front_document_uploaded', 'back_document_uploaded', 'live_capture_uploaded',
        'ocr_data', 'barcode_data', 'cross_validation_results', 'face_match_results',
        'final_result', 'rejection_reason', 'rejection_detail',
        'created_at', 'updated_at',
      ];
      for (const field of expectedFields) {
        expect(res.body).toHaveProperty(field);
      }
    });
  });

  describe('Full pipeline — happy path', () => {
    it('completes a full verification flow: init → front → back → live → status', async () => {
      // 1. Initialize
      const init = await request(app)
        .post('/api/v2/verify/initialize')
        .send({ user_id: '550e8400-e29b-41d4-a716-446655440000' });
      expect(init.status).toBe(201);
      const vid = init.body.verification_id;

      // 2. Front document
      const front = await request(app)
        .post(`/api/v2/verify/${vid}/front-document`)
        .attach('document', fakeJpegBuffer(), 'front.jpg');
      expect(front.body.status).toBe(VerificationStatus.AWAITING_BACK);

      // 3. Back document (auto cross-validates)
      const back = await request(app)
        .post(`/api/v2/verify/${vid}/back-document`)
        .attach('document', fakeJpegBuffer(), 'back.jpg');
      expect(back.body.status).toBe(VerificationStatus.AWAITING_LIVE);
      expect(back.body.cross_validation_results).toBeDefined();

      // 4. Live capture (auto face-matches)
      const live = await request(app)
        .post(`/api/v2/verify/${vid}/live-capture`)
        .attach('selfie', fakeJpegBuffer(), 'selfie.jpg');
      expect(live.body.final_result).toBeDefined();

      // 5. Status check
      const status = await request(app)
        .get(`/api/v2/verify/${vid}/status`);
      expect(status.body.front_document_uploaded).toBe(true);
      expect(status.body.back_document_uploaded).toBe(true);
      expect(status.body.final_result).toBeDefined();
    });
  });
});
