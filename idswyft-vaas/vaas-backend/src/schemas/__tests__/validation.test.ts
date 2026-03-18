import { describe, it, expect, vi } from 'vitest';
import { validateBody } from '../validate.js';
import { loginSchema, forgotPasswordSchema, resetPasswordSchema, changePasswordSchema } from '../auth.schema.js';
import { startVerificationSchema, livenessDataSchema, resultSchema } from '../verification.schema.js';
import { webhookConfigSchema } from '../webhook.schema.js';
import { createOrganizationSchema, enterpriseSignupSchema } from '../organization.schema.js';

// ─── Helpers ─────────────────────────────────────

function mockReq(body: any) {
  return { body } as any;
}
function mockRes() {
  const res: any = { status: vi.fn().mockReturnThis(), json: vi.fn() };
  return res;
}
const next = vi.fn();

// ─── validateBody middleware ─────────────────────

describe('validateBody middleware', () => {
  it('calls next and strips unknown fields on valid input', () => {
    const middleware = validateBody(loginSchema);
    const req = mockReq({ email: 'a@b.com', password: 'pass123', extra_field: 'should be stripped' });
    const res = mockRes();
    next.mockClear();

    middleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.body).toEqual({ email: 'a@b.com', password: 'pass123' });
    expect(req.body.extra_field).toBeUndefined();
  });

  it('returns 400 with structured error on invalid input', () => {
    const middleware = validateBody(loginSchema);
    const req = mockReq({ email: 'not-an-email' });
    const res = mockRes();
    next.mockClear();

    middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({ code: 'VALIDATION_ERROR' }),
      })
    );
    expect(next).not.toHaveBeenCalled();
  });
});

// ─── Auth schemas ────────────────────────────────

describe('auth schemas', () => {
  it('loginSchema accepts valid input', () => {
    const result = loginSchema.safeParse({ email: 'test@example.com', password: 'secret' });
    expect(result.success).toBe(true);
  });

  it('loginSchema rejects empty password', () => {
    const result = loginSchema.safeParse({ email: 'test@example.com', password: '' });
    expect(result.success).toBe(false);
  });

  it('forgotPasswordSchema includes organization_slug', () => {
    const result = forgotPasswordSchema.safeParse({ email: 'a@b.com', organization_slug: 'acme' });
    expect(result.success).toBe(true);
    expect(result.data!.organization_slug).toBe('acme');
  });

  it('resetPasswordSchema requires min 8-char password', () => {
    expect(resetPasswordSchema.safeParse({ token: 'tok', new_password: '1234567' }).success).toBe(false);
    expect(resetPasswordSchema.safeParse({ token: 'tok', new_password: '12345678' }).success).toBe(true);
  });

  it('changePasswordSchema validates both fields', () => {
    const result = changePasswordSchema.safeParse({ current_password: 'old', new_password: 'newpassword' });
    expect(result.success).toBe(true);
  });
});

// ─── Verification schemas ────────────────────────

describe('verification schemas', () => {
  it('startVerificationSchema requires email or phone', () => {
    const noContact = startVerificationSchema.safeParse({ end_user: { first_name: 'John' } });
    expect(noContact.success).toBe(false);

    const withEmail = startVerificationSchema.safeParse({ end_user: { email: 'j@x.com' } });
    expect(withEmail.success).toBe(true);
  });

  it('startVerificationSchema passes metadata and issuing_country through', () => {
    const result = startVerificationSchema.safeParse({
      end_user: { email: 'j@x.com', metadata: { source: 'api' } },
      issuing_country: 'US',
    });
    expect(result.success).toBe(true);
    expect(result.data!.end_user.metadata).toEqual({ source: 'api' });
    expect(result.data!.issuing_country).toBe('US');
  });

  it('startVerificationSchema rejects invalid issuing_country length', () => {
    const result = startVerificationSchema.safeParse({
      end_user: { email: 'j@x.com' },
      issuing_country: 'USA',
    });
    expect(result.success).toBe(false);
  });

  it('livenessDataSchema enforces 100KB limit', () => {
    const bigPayload = { data: 'x'.repeat(100_001) };
    const result = livenessDataSchema.safeParse(bigPayload);
    expect(result.success).toBe(false);
  });

  it('resultSchema accepts valid result', () => {
    const result = resultSchema.safeParse({
      final_result: 'verified',
      confidence_score: 0.95,
    });
    expect(result.success).toBe(true);
  });

  it('resultSchema accepts liveness_score and liveness_passed field names', () => {
    const result = resultSchema.safeParse({
      final_result: 'verified',
      liveness_results: {
        liveness_score: 0.88,
        liveness_passed: true,
      },
    });
    expect(result.success).toBe(true);
    expect(result.data!.liveness_results!.liveness_score).toBe(0.88);
    expect(result.data!.liveness_results!.liveness_passed).toBe(true);
  });

  it('resultSchema rejects invalid final_result enum', () => {
    const result = resultSchema.safeParse({ final_result: 'unknown_status' });
    expect(result.success).toBe(false);
  });
});

// ─── Webhook schema ──────────────────────────────

describe('webhook schema', () => {
  it('accepts valid config', () => {
    const result = webhookConfigSchema.safeParse({
      url: 'https://hooks.example.com/webhook',
      events: ['verification.completed'],
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid event type', () => {
    const result = webhookConfigSchema.safeParse({
      url: 'https://hooks.example.com/webhook',
      events: ['not.a.real.event'],
    });
    expect(result.success).toBe(false);
  });

  it('requires at least one event', () => {
    const result = webhookConfigSchema.safeParse({
      url: 'https://hooks.example.com/webhook',
      events: [],
    });
    expect(result.success).toBe(false);
  });

  it('uses "enabled" field name (not is_active)', () => {
    const result = webhookConfigSchema.safeParse({
      url: 'https://hooks.example.com/webhook',
      events: ['verification.started'],
      enabled: false,
    });
    expect(result.success).toBe(true);
    expect(result.data!.enabled).toBe(false);
  });
});

// ─── Organization schemas ────────────────────────

describe('organization schemas', () => {
  it('createOrganizationSchema validates required fields', () => {
    const result = createOrganizationSchema.safeParse({
      name: 'Acme Corp',
      contact_email: 'contact@acme.com',
      admin_email: 'admin@acme.com',
      admin_password: 'securepass',
    });
    expect(result.success).toBe(true);
  });

  it('enterpriseSignupSchema rejects free email providers', () => {
    const result = enterpriseSignupSchema.safeParse({
      firstName: 'John',
      lastName: 'Doe',
      email: 'john@gmail.com',
      company: 'Acme Corp',
      jobTitle: 'CEO',
      estimatedVolume: '1-1000',
      useCase: 'We need to verify user identities for our platform',
    });
    expect(result.success).toBe(false);
  });

  it('enterpriseSignupSchema accepts business email', () => {
    const result = enterpriseSignupSchema.safeParse({
      firstName: 'John',
      lastName: 'Doe',
      email: 'john@acmecorp.com',
      company: 'Acme Corp',
      jobTitle: 'CEO',
      estimatedVolume: '1-1000',
      useCase: 'We need to verify user identities for our platform',
    });
    expect(result.success).toBe(true);
  });
});
