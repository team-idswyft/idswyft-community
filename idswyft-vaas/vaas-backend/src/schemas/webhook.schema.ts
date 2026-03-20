import { z } from 'zod';

const validWebhookEvents = [
  'verification.started',
  'verification.completed',
  'verification.failed',
  'verification.manual_review',
  'verification.approved',
  'verification.rejected',
  'verification.overridden',
  'verification.expired',
  'user.created',
  'user.updated',
  'billing.usage_updated',
  'billing.payment_failed',
] as const;

export const webhookConfigSchema = z.object({
  url: z.string().url('Valid webhook URL is required'),
  events: z.array(z.enum(validWebhookEvents))
    .min(1, 'At least one event type is required'),
  description: z.string().max(500).optional(),
  enabled: z.boolean().optional(),
});
