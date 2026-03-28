/**
 * Unit tests for Idswyft JavaScript SDK (v3 — v2 API)
 */

import { IdswyftSDK, IdswyftError } from '../src/index';
import axios from 'axios';

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('IdswyftSDK', () => {
  let sdk: IdswyftSDK;

  beforeEach(() => {
    sdk = new IdswyftSDK({
      apiKey: 'test-api-key',
      baseURL: 'https://api.test.idswyft.app',
      sandbox: true
    });

    // Reset mocks
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with provided config', () => {
      expect(sdk['config'].apiKey).toBe('test-api-key');
      expect(sdk['config'].baseURL).toBe('https://api.test.idswyft.app');
      expect(sdk['config'].sandbox).toBe(true);
      expect(sdk['config'].timeout).toBe(30000);
    });

    it('should use default values when not provided', () => {
      const defaultSDK = new IdswyftSDK({ apiKey: 'test-key' });

      expect(defaultSDK['config'].baseURL).toBe('https://api.idswyft.app');
      expect(defaultSDK['config'].timeout).toBe(30000);
      expect(defaultSDK['config'].sandbox).toBe(false);
    });

    it('should throw error if API key is missing', () => {
      expect(() => {
        new IdswyftSDK({ apiKey: '' });
      }).toThrow('API key is required');
    });
  });

  describe('startVerification', () => {
    it('should initialize a new verification session', async () => {
      const mockResponse = {
        data: {
          success: true,
          verification_id: 'verif_123',
          status: 'AWAITING_FRONT',
          current_step: 1,
          total_steps: 5,
          message: 'Verification initialized successfully'
        }
      };

      mockedAxios.create.mockReturnValue({
        post: jest.fn().mockResolvedValue(mockResponse),
        interceptors: {
          response: { use: jest.fn() }
        }
      } as any);

      const result = await sdk.startVerification({
        user_id: 'user-123',
        document_type: 'drivers_license',
      });

      expect(result).toEqual(mockResponse.data);
      expect(result.verification_id).toBe('verif_123');
      expect(result.status).toBe('AWAITING_FRONT');
    });
  });

  describe('uploadFrontDocument', () => {
    it('should upload front document with verification_id in URL path', async () => {
      const mockResponse = {
        data: {
          success: true,
          verification_id: 'verif_123',
          status: 'AWAITING_BACK',
          current_step: 2,
          document_id: 'doc_front_456',
          ocr_data: {
            full_name: 'JOHN DOE',
            date_of_birth: '1990-01-15',
            id_number: 'D1234567',
          },
          rejection_reason: null,
          message: 'Front document processed successfully'
        }
      };

      mockedAxios.create.mockReturnValue({
        post: jest.fn().mockResolvedValue(mockResponse),
        interceptors: {
          response: { use: jest.fn() }
        }
      } as any);

      const testBuffer = Buffer.from('test image data');

      const result = await sdk.uploadFrontDocument(
        'verif_123',
        testBuffer,
        'drivers_license'
      );

      expect(result).toEqual(mockResponse.data);
      expect(result.ocr_data?.full_name).toBe('JOHN DOE');
    });
  });

  describe('uploadBackDocument', () => {
    it('should upload back document using "document" field name', async () => {
      const mockResponse = {
        data: {
          success: true,
          verification_id: 'verif_123',
          status: 'AWAITING_LIVE',
          current_step: 3,
          document_id: 'doc_back_789',
          barcode_data: {
            first_name: 'JOHN',
            last_name: 'DOE',
            date_of_birth: '19900115',
          },
          documents_match: true,
          cross_validation_results: {
            verdict: 'PASS',
            has_critical_failure: false,
            score: 0.95,
            failures: [],
          },
          message: 'Back document processed'
        }
      };

      mockedAxios.create.mockReturnValue({
        post: jest.fn().mockResolvedValue(mockResponse),
        interceptors: {
          response: { use: jest.fn() }
        }
      } as any);

      const testBuffer = Buffer.from('test back image data');

      const result = await sdk.uploadBackDocument(
        'verif_123',
        testBuffer,
        'drivers_license'
      );

      expect(result).toEqual(mockResponse.data);
      expect(result.documents_match).toBe(true);
      expect(result.cross_validation_results?.verdict).toBe('PASS');
    });
  });

  describe('uploadSelfie', () => {
    it('should upload selfie as multipart with "selfie" field', async () => {
      const mockResponse = {
        data: {
          success: true,
          verification_id: 'verif_123',
          status: 'COMPLETE',
          current_step: 5,
          selfie_id: 'selfie_abc',
          face_match_results: {
            passed: true,
            score: 0.92,
            distance: 0.35,
          },
          liveness_results: {
            liveness_passed: true,
            liveness_score: 0.94,
          },
          final_result: 'verified',
          message: 'Verification complete'
        }
      };

      mockedAxios.create.mockReturnValue({
        post: jest.fn().mockResolvedValue(mockResponse),
        interceptors: {
          response: { use: jest.fn() }
        }
      } as any);

      const testBuffer = Buffer.from('test selfie data');

      const result = await sdk.uploadSelfie('verif_123', testBuffer);

      expect(result).toEqual(mockResponse.data);
      expect(result.face_match_results?.passed).toBe(true);
      expect(result.final_result).toBe('verified');
    });
  });

  describe('getCrossValidation', () => {
    it('should retrieve cross-validation results', async () => {
      const mockResponse = {
        data: {
          success: true,
          verification_id: 'verif_123',
          status: 'AWAITING_LIVE',
          current_step: 3,
          documents_match: true,
          cross_validation_results: {
            verdict: 'PASS',
            has_critical_failure: false,
            score: 0.95,
            failures: [],
          },
        }
      };

      mockedAxios.create.mockReturnValue({
        post: jest.fn().mockResolvedValue(mockResponse),
        interceptors: {
          response: { use: jest.fn() }
        }
      } as any);

      const result = await sdk.getCrossValidation('verif_123');

      expect(result.cross_validation_results?.verdict).toBe('PASS');
    });
  });

  describe('getVerificationStatus', () => {
    it('should get full verification status', async () => {
      const mockResponse = {
        data: {
          success: true,
          verification_id: 'verif_123',
          status: 'COMPLETE',
          current_step: 5,
          total_steps: 5,
          front_document_uploaded: true,
          back_document_uploaded: true,
          live_capture_uploaded: true,
          final_result: 'verified',
          created_at: '2024-01-01T12:00:00Z',
          updated_at: '2024-01-01T12:05:00Z',
        }
      };

      mockedAxios.create.mockReturnValue({
        get: jest.fn().mockResolvedValue(mockResponse),
        interceptors: {
          response: { use: jest.fn() }
        }
      } as any);

      const result = await sdk.getVerificationStatus('verif_123');

      expect(result.status).toBe('COMPLETE');
      expect(result.final_result).toBe('verified');
      expect(result.front_document_uploaded).toBe(true);
    });
  });

  describe('developer management', () => {
    it('should create API key', async () => {
      const mockResponse = {
        data: {
          api_key: 'ik_test_123...',
          key_id: 'key_abc123'
        }
      };

      mockedAxios.create.mockReturnValue({
        post: jest.fn().mockResolvedValue(mockResponse),
        interceptors: {
          response: { use: jest.fn() }
        }
      } as any);

      const result = await sdk.createApiKey({
        name: 'Test Key',
        environment: 'sandbox'
      });

      expect(result).toEqual(mockResponse.data);
    });

    it('should list API keys', async () => {
      const mockResponse = {
        data: {
          api_keys: [{
            id: 'key_123',
            name: 'Test Key',
            key_prefix: 'ik_',
            environment: 'sandbox',
            is_active: true
          }]
        }
      };

      mockedAxios.create.mockReturnValue({
        get: jest.fn().mockResolvedValue(mockResponse),
        interceptors: {
          response: { use: jest.fn() }
        }
      } as any);

      const result = await sdk.listApiKeys();

      expect(result).toEqual(mockResponse.data);
    });
  });

  describe('webhook management', () => {
    it('should register webhook', async () => {
      const mockResponse = {
        data: {
          webhook: {
            id: 'hook_123',
            url: 'https://example.com/webhook',
            events: ['verification.completed'],
            is_active: true
          }
        }
      };

      mockedAxios.create.mockReturnValue({
        post: jest.fn().mockResolvedValue(mockResponse),
        interceptors: {
          response: { use: jest.fn() }
        }
      } as any);

      const result = await sdk.registerWebhook({
        url: 'https://example.com/webhook',
        events: ['verification.completed']
      });

      expect(result).toEqual(mockResponse.data);
    });
  });

  describe('webhook signature verification', () => {
    it('should verify valid webhook signatures', () => {
      const payload = '{"verification_id":"test","status":"COMPLETE"}';
      const secret = 'webhook-secret';

      const crypto = require('crypto');
      const signature = 'sha256=' + crypto
        .createHmac('sha256', secret)
        .update(payload)
        .digest('hex');

      const isValid = IdswyftSDK.verifyWebhookSignature(payload, signature, secret);
      expect(isValid).toBe(true);
    });

    it('should reject invalid webhook signatures', () => {
      const payload = '{"verification_id":"test","status":"COMPLETE"}';
      const secret = 'webhook-secret';
      const invalidSignature = 'sha256=invalid';

      const isValid = IdswyftSDK.verifyWebhookSignature(payload, invalidSignature, secret);
      expect(isValid).toBe(false);
    });

    it('should handle empty inputs gracefully', () => {
      const isValid = IdswyftSDK.verifyWebhookSignature('', '', '');
      expect(isValid).toBe(false);
    });
  });

  describe('error handling', () => {
    it('should create IdswyftError with correct properties', () => {
      const error = new IdswyftError('Test error', 400, 'test_code', { field: 'test' });

      expect(error.message).toBe('Test error');
      expect(error.statusCode).toBe(400);
      expect(error.code).toBe('test_code');
      expect(error.details).toEqual({ field: 'test' });
      expect(error.name).toBe('IdswyftError');
    });
  });
});
