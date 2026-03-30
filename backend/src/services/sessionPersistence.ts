import { supabase } from '@/config/database.js';
import { VerificationStatus } from '@idswyft/shared';
import type { SessionState } from '@idswyft/shared';

/** Save session state to verification_contexts table */
export async function saveSessionState(verificationId: string, state: Readonly<SessionState>): Promise<void> {
  // Strip biometric data (GDPR Article 9) — embeddings must not persist permanently.
  // Only strip once verification is terminal (COMPLETE/HARD_REJECTED) — the front
  // embedding is needed by the face match step which runs in a later HTTP request.
  const sanitized: any = JSON.parse(JSON.stringify(state));
  const isTerminal = state.current_step === VerificationStatus.COMPLETE
    || state.current_step === VerificationStatus.HARD_REJECTED;
  if (isTerminal) {
    if (sanitized.front_extraction) sanitized.front_extraction.face_embedding = null;
    if (sanitized.live_capture) sanitized.live_capture.face_embedding = null;
  }

  const context = {
    verification_id: verificationId,
    context: JSON.stringify(sanitized),
    updated_at: new Date().toISOString(),
  };

  await supabase
    .from('verification_contexts')
    .upsert(context, { onConflict: 'verification_id' });
}

/** Load session state from verification_contexts table */
export async function loadSessionState(verificationId: string): Promise<SessionState | null> {
  const { data } = await supabase
    .from('verification_contexts')
    .select('context')
    .eq('verification_id', verificationId)
    .single();

  if (!data?.context) return null;
  return typeof data.context === 'string' ? JSON.parse(data.context) : data.context;
}
