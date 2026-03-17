import { z } from 'zod';

const phoneRegex = /^\+?[1-9]\d{1,14}$/;

export const startVerificationSchema = z.object({
  end_user: z.object({
    email: z.string().email().optional(),
    phone: z.string().regex(phoneRegex, 'Valid phone format required').optional(),
    first_name: z.string().max(255).optional(),
    last_name: z.string().max(255).optional(),
    external_id: z.string().max(255).optional(),
    metadata: z.record(z.unknown()).optional(),
  }).refine(
    (u) => u.email || u.phone,
    { message: 'Either email or phone is required', path: ['email'] }
  ),
  issuing_country: z.string().length(2).optional(),
  settings: z.object({
    callback_url: z.string().url().optional(),
    success_redirect_url: z.string().url().optional(),
    failure_redirect_url: z.string().url().optional(),
    require_liveness: z.boolean().optional(),
    require_back_of_id: z.boolean().optional(),
  }).optional(),
});

/** Liveness data schema (previously inline in public.ts). */
export const livenessDataSchema = z.object({
  challenge_id: z.string().max(256).optional(),
  frames: z.array(z.object({
    timestamp: z.number().optional(),
    data: z.string().max(10_000).optional(),
  }).passthrough()).max(30).optional(),
  confidence: z.number().min(0).max(1).optional(),
  passed: z.boolean().optional(),
  metadata: z.record(z.unknown()).optional(),
}).passthrough().refine(
  (data) => JSON.stringify(data).length <= 100_000,
  { message: 'Liveness data payload must be under 100KB' }
);

/** Result reporting schema (previously inline in public.ts). */
export const resultSchema = z.object({
  final_result: z.enum(['verified', 'failed', 'manual_review']),
  confidence_score: z.number().min(0).max(1).optional(),
  face_match_results: z.object({
    similarity_score: z.number().min(0).max(1).optional(),
    score: z.number().min(0).max(1).optional(),
    matched: z.boolean().optional(),
  }).passthrough().optional(),
  liveness_results: z.object({
    confidence: z.number().min(0).max(1).optional(),
    passed: z.boolean().optional(),
  }).passthrough().optional(),
  ocr_data: z.record(z.unknown()).optional(),
  cross_validation_results: z.record(z.unknown()).optional(),
  failure_reason: z.string().max(1000).optional(),
  manual_review_reason: z.string().max(1000).optional(),
});
