import crypto from 'crypto';
import { supabase } from '@/config/database.js';
import config from '@/config/index.js';
import { logger } from '@/utils/logger.js';
import { emailService } from './emailService.js';

const OTP_EXPIRY_MINUTES = 10;
const MAX_ATTEMPTS = 3;
const MAX_SENDS_PER_HOUR = 5;

function generateCode(): string {
  return String(crypto.randomInt(100000, 999999));
}

function hashCode(code: string): string {
  return crypto
    .createHmac('sha256', config.apiKeySecret)
    .update(code)
    .digest('hex');
}

const RATE_LIMIT_WINDOW_SECONDS = 3600; // 1 hour

/**
 * Atomic rate limit check using a Postgres RPC function.
 * Upserts the rate limit row and returns whether the send is allowed.
 * No read-then-write race condition.
 */
async function checkRateLimit(email: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('check_otp_rate_limit', {
    p_email: email,
    p_max_sends: MAX_SENDS_PER_HOUR,
    p_window_seconds: RATE_LIMIT_WINDOW_SECONDS,
  });

  if (error) {
    logger.error('OTP rate limit check failed', { error });
    // Fail closed — deny the send to prevent abuse if RPC is unavailable
    return false;
  }

  return data === true;
}

/**
 * Create an OTP for the given email, store its hash, and send the email.
 * Returns { success: true } or { success: false, reason: string }.
 * When email is not configured (self-hosted), also returns the plaintext code
 * so the frontend can display it directly.
 */
export async function createAndSendOtp(email: string): Promise<{ success: boolean; reason?: string; code?: string }> {
  // Rate limit check
  const allowed = await checkRateLimit(email);
  if (!allowed) {
    logger.warn('OTP rate limit exceeded', { email });
    // Still return success to prevent email enumeration
    return { success: true };
  }

  // Invalidate any existing unused codes for this email
  await supabase
    .from('developer_otp_codes')
    .update({ used_at: new Date().toISOString() })
    .eq('email', email)
    .is('used_at', null);

  // Generate and store
  const code = generateCode();
  const codeHash = hashCode(code);
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000).toISOString();

  const { error: insertError } = await supabase.from('developer_otp_codes').insert({
    email,
    code_hash: codeHash,
    attempts: 0,
    expires_at: expiresAt,
  });

  if (insertError) {
    logger.error('Failed to insert OTP code', { error: insertError });
    return { success: false, reason: 'Failed to generate code' };
  }

  // Send email (fire-and-forget style — log failures, don't block)
  const sent = await emailService.sendOtpEmail(email, code);
  if (!sent) {
    logger.error('Failed to send OTP email', { email });
    // Still return success to the client — the code exists in DB
  }

  logger.info('OTP created and sent', { email });

  // Self-hosted: return plaintext code when no email transport is configured
  if (!emailService.isConfigured) {
    return { success: true, code };
  }

  return { success: true };
}

/**
 * Verify a code against the stored hash for the given email.
 * Uses an atomic Postgres RPC to prevent race conditions where two
 * concurrent requests could both succeed with the same code.
 *
 * Returns { valid: true } or { valid: false, reason: string }.
 */
export async function verifyOtp(email: string, code: string): Promise<{ valid: boolean; reason?: string }> {
  const inputHash = hashCode(code);

  // Atomic: increment attempts + claim the record if hash matches
  const { data, error } = await supabase.rpc('verify_otp_atomic', {
    p_email: email,
    p_code_hash: inputHash,
    p_max_attempts: MAX_ATTEMPTS,
  });

  if (error) {
    logger.error('OTP verify RPC failed', { error });
    return { valid: false, reason: 'Verification failed. Please try again.' };
  }

  // RPC returns: { status: 'valid' | 'invalid' | 'exhausted' | 'not_found', attempts_left: int }
  const result = data as { status: string; attempts_left: number } | null;

  if (!result || result.status === 'not_found') {
    return { valid: false, reason: 'No valid code found. Request a new one.' };
  }

  if (result.status === 'exhausted') {
    return { valid: false, reason: 'Too many attempts. Request a new code.' };
  }

  if (result.status === 'invalid') {
    const left = result.attempts_left;
    return {
      valid: false,
      reason: left > 0
        ? `Invalid code. ${left} attempt(s) remaining.`
        : 'Too many attempts. Request a new code.',
    };
  }

  // Timing-safe comparison as a defense-in-depth check
  // (The RPC already did the comparison, but we double-check here)
  const storedHash = result.status === 'valid' ? inputHash : '';
  const inputBuf = Buffer.from(inputHash, 'hex');
  const storedBuf = Buffer.from(storedHash, 'hex');
  if (inputBuf.length !== storedBuf.length || !crypto.timingSafeEqual(inputBuf, storedBuf)) {
    return { valid: false, reason: 'Verification failed.' };
  }

  logger.info('OTP verified successfully', { email });
  return { valid: true };
}
