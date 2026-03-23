/**
 * Realtime Service
 *
 * Broadcasts verification status changes via Supabase Realtime channels.
 * Subscribers (customer portal, SDK) can listen for updates instead of polling.
 *
 * Uses Supabase Realtime broadcast (not Postgres Changes) because:
 * 1. Broadcast doesn't require RLS policy changes
 * 2. Payload is fully controlled (we send exactly what consumers need)
 * 3. Works with existing service-role key
 */

import { supabase } from '@/config/database.js';
import { logger } from '@/utils/logger.js';

export interface StatusChangePayload {
  verification_id: string;
  status: string;
  current_step: number;
  final_result: string | null;
  rejection_reason: string | null;
  timestamp: string;
}

/**
 * Broadcast a verification status change to all subscribers.
 *
 * Channel name: `verification:{verification_id}`
 * Event: `status_change`
 *
 * This is fire-and-forget — broadcast failures are logged but never
 * block the verification flow.
 */
export async function broadcastStatusChange(
  verificationId: string,
  status: string,
  currentStep: number,
  finalResult: string | null = null,
  rejectionReason: string | null = null,
): Promise<void> {
  try {
    const channel = supabase.channel(`verification:${verificationId}`);

    const payload: StatusChangePayload = {
      verification_id: verificationId,
      status,
      current_step: currentStep,
      final_result: finalResult,
      rejection_reason: rejectionReason,
      timestamp: new Date().toISOString(),
    };

    await channel.send({
      type: 'broadcast',
      event: 'status_change',
      payload,
    });

    // Clean up the channel after sending
    supabase.removeChannel(channel);
  } catch (err) {
    logger.warn('Realtime broadcast failed (non-blocking):', err);
  }
}

/**
 * Subscribe to verification status changes.
 * Returns an unsubscribe function for cleanup.
 *
 * Used by the customer portal and SDK to receive push updates.
 */
export function subscribeToVerification(
  verificationId: string,
  onStatusChange: (payload: StatusChangePayload) => void,
): { unsubscribe: () => void } {
  const channel = supabase
    .channel(`verification:${verificationId}`)
    .on('broadcast', { event: 'status_change' }, (message: any) => {
      onStatusChange(message.payload as StatusChangePayload);
    })
    .subscribe();

  return {
    unsubscribe: () => {
      supabase.removeChannel(channel);
    },
  };
}
