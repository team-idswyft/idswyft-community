/**
 * Realtime Subscription Service
 *
 * Subscribes to Supabase Realtime broadcast channels for
 * push-based verification status updates, replacing polling.
 *
 * Falls back to polling if Realtime connection fails.
 */

import { createClient, RealtimeChannel } from '@supabase/supabase-js';

// ─── Configuration ───────────────────────────────────────

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

// ─── Types ───────────────────────────────────────────────

export interface StatusChangePayload {
  verification_id: string;
  status: string;
  current_step: number;
  final_result: string | null;
  rejection_reason: string | null;
  timestamp: string;
}

export interface RealtimeSubscription {
  /** Stop listening and clean up the channel */
  unsubscribe: () => void;
  /** Whether realtime is connected */
  isConnected: boolean;
}

// ─── Client ──────────────────────────────────────────────

let supabaseClient: ReturnType<typeof createClient> | null = null;

function getClient() {
  if (!supabaseClient && SUPABASE_URL && SUPABASE_ANON_KEY) {
    supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return supabaseClient;
}

/**
 * Check if Supabase Realtime is available (URL and key configured).
 */
export function isRealtimeAvailable(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
}

/**
 * Subscribe to status changes for a verification.
 *
 * @param verificationId - The verification to watch
 * @param onStatusChange - Callback for each status update
 * @param onError - Optional error callback (triggers fallback to polling)
 * @returns Subscription handle with unsubscribe()
 */
export function subscribeToVerification(
  verificationId: string,
  onStatusChange: (payload: StatusChangePayload) => void,
  onError?: (error: Error) => void,
): RealtimeSubscription {
  const client = getClient();
  if (!client) {
    onError?.(new Error('Supabase Realtime not configured'));
    return { unsubscribe: () => {}, isConnected: false };
  }

  let isConnected = false;
  let channel: RealtimeChannel | null = null;

  try {
    channel = client
      .channel(`verification:${verificationId}`)
      .on('broadcast', { event: 'status_change' }, (message) => {
        onStatusChange(message.payload as StatusChangePayload);
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          isConnected = true;
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          isConnected = false;
          onError?.(new Error(`Realtime channel ${status}`));
        }
      });
  } catch (err) {
    onError?.(err instanceof Error ? err : new Error('Realtime subscription failed'));
    return { unsubscribe: () => {}, isConnected: false };
  }

  return {
    get isConnected() { return isConnected; },
    unsubscribe: () => {
      if (channel && client) {
        client.removeChannel(channel);
      }
      isConnected = false;
    },
  };
}
