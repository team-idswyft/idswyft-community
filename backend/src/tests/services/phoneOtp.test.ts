import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock transitive dependencies ─────────────────────────────────────────────
vi.mock('@/utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('@/config/database.js', () => ({
  supabase: { from: vi.fn(), rpc: vi.fn() },
  connectDB: vi.fn(),
}));

const testConfig = {
  nodeEnv: 'test',
  apiKeySecret: 'test-secret-key-for-hmac',
  storage: { provider: 'local' },
  supabase: { storageBucket: 'identity-documents' },
  encryptionKey: 'test-encryption-key-32chars!!!!',
};
vi.mock('@/config/index.js', () => ({
  config: testConfig,
  default: testConfig,
}));

vi.mock('../../services/smsService.js', () => ({
  sendSmsOtp: vi.fn().mockResolvedValue(true),
  decryptSMSConfig: vi.fn(),
}));

import { supabase } from '@/config/database.js';

// Build a chainable supabase mock
const makeChainableMock = (resolveWith: any = { data: [], error: null }) => {
  const chain: any = {
    select: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(resolveWith),
  };
  chain.then = (resolve: any) => resolve(resolveWith);
  return chain;
};

describe('phoneOtpService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createAndSendPhoneOtp', () => {
    it('sends OTP via SMS when provider is configured', async () => {
      // Rate limit check passes
      (supabase.rpc as any).mockResolvedValueOnce({ data: true, error: null });
      // Invalidate previous codes
      (supabase.from as any).mockImplementationOnce(() => makeChainableMock());
      // Insert new code
      (supabase.from as any).mockImplementationOnce(() => makeChainableMock({ error: null }));

      const { createAndSendPhoneOtp } = await import('../../services/phoneOtpService.js');

      const smsConfig = {
        provider: 'twilio' as const,
        apiKey: 'ACxxxxxx',
        apiSecret: 'auth-token',
        phoneNumber: '+15551234567',
      };

      const result = await createAndSendPhoneOtp('vr-123', '+15559876543', smsConfig);

      expect(result.success).toBe(true);
      expect(result.code).toBeUndefined(); // code NOT returned when SMS is configured
    });

    it('returns failure when SMS delivery fails', async () => {
      (supabase.rpc as any).mockResolvedValueOnce({ data: true, error: null });
      (supabase.from as any).mockImplementationOnce(() => makeChainableMock());
      (supabase.from as any).mockImplementationOnce(() => makeChainableMock({ error: null }));

      // Mock SMS send to fail
      const { sendSmsOtp } = await import('../../services/smsService.js');
      (sendSmsOtp as any).mockResolvedValueOnce(false);

      const { createAndSendPhoneOtp } = await import('../../services/phoneOtpService.js');

      const smsConfig = {
        provider: 'twilio' as const,
        apiKey: 'ACxxxxxx',
        apiSecret: 'auth-token',
        phoneNumber: '+15551234567',
      };

      const result = await createAndSendPhoneOtp('vr-123', '+15559876543', smsConfig);

      expect(result.success).toBe(false);
      expect(result.reason).toContain('Failed to deliver SMS');
    });

    it('returns plaintext code when no SMS provider configured (self-hosted)', async () => {
      (supabase.rpc as any).mockResolvedValueOnce({ data: true, error: null });
      (supabase.from as any).mockImplementationOnce(() => makeChainableMock());
      (supabase.from as any).mockImplementationOnce(() => makeChainableMock({ error: null }));

      const { createAndSendPhoneOtp } = await import('../../services/phoneOtpService.js');

      const result = await createAndSendPhoneOtp('vr-123', '+15559876543', null);

      expect(result.success).toBe(true);
      expect(result.code).toBeDefined();
      expect(result.code).toMatch(/^\d{6}$/);
    });

    it('rejects when rate limit exceeded', async () => {
      (supabase.rpc as any).mockResolvedValueOnce({ data: false, error: null });

      const { createAndSendPhoneOtp } = await import('../../services/phoneOtpService.js');

      const result = await createAndSendPhoneOtp('vr-123', '+15559876543', null);

      expect(result.success).toBe(false);
      expect(result.reason).toContain('Too many');
    });

    it('handles DB insert failure', async () => {
      (supabase.rpc as any).mockResolvedValueOnce({ data: true, error: null });
      (supabase.from as any).mockImplementationOnce(() => makeChainableMock());
      (supabase.from as any).mockImplementationOnce(() =>
        makeChainableMock({ error: { message: 'insert failed' } })
      );

      const { createAndSendPhoneOtp } = await import('../../services/phoneOtpService.js');

      const result = await createAndSendPhoneOtp('vr-123', '+15559876543', null);

      expect(result.success).toBe(false);
      expect(result.reason).toContain('Failed to generate');
    });
  });

  describe('verifyPhoneOtp', () => {
    it('returns valid for correct code', async () => {
      (supabase.rpc as any).mockResolvedValueOnce({
        data: { status: 'valid', attempts_left: 2 },
        error: null,
      });

      const { verifyPhoneOtp } = await import('../../services/phoneOtpService.js');

      const result = await verifyPhoneOtp('vr-123', '123456');

      expect(result.valid).toBe(true);
      expect(supabase.rpc).toHaveBeenCalledWith('verify_phone_otp_atomic', expect.objectContaining({
        p_vr_id: 'vr-123',
        p_max_attempts: 3,
      }));
    });

    it('returns invalid with remaining attempts', async () => {
      (supabase.rpc as any).mockResolvedValueOnce({
        data: { status: 'invalid', attempts_left: 1 },
        error: null,
      });

      const { verifyPhoneOtp } = await import('../../services/phoneOtpService.js');

      const result = await verifyPhoneOtp('vr-123', '000000');

      expect(result.valid).toBe(false);
      expect(result.reason).toContain('1 attempt(s) remaining');
    });

    it('returns exhausted after max attempts', async () => {
      (supabase.rpc as any).mockResolvedValueOnce({
        data: { status: 'exhausted', attempts_left: 0 },
        error: null,
      });

      const { verifyPhoneOtp } = await import('../../services/phoneOtpService.js');

      const result = await verifyPhoneOtp('vr-123', '000000');

      expect(result.valid).toBe(false);
      expect(result.reason).toContain('Too many attempts');
    });

    it('returns not_found when no valid code exists', async () => {
      (supabase.rpc as any).mockResolvedValueOnce({
        data: { status: 'not_found', attempts_left: 0 },
        error: null,
      });

      const { verifyPhoneOtp } = await import('../../services/phoneOtpService.js');

      const result = await verifyPhoneOtp('vr-123', '123456');

      expect(result.valid).toBe(false);
      expect(result.reason).toContain('No valid code');
    });

    it('handles RPC failure gracefully', async () => {
      (supabase.rpc as any).mockResolvedValueOnce({
        data: null,
        error: { message: 'RPC unavailable' },
      });

      const { verifyPhoneOtp } = await import('../../services/phoneOtpService.js');

      const result = await verifyPhoneOtp('vr-123', '123456');

      expect(result.valid).toBe(false);
      expect(result.reason).toContain('Please try again');
    });
  });
});
