import { supabase } from '@/config/database.js';
import type { SessionState } from '@idswyft/shared';

/** Save session state to verification_contexts table */
export async function saveSessionState(verificationId: string, state: Readonly<SessionState>): Promise<void> {
  // Strip biometric data (GDPR Article 9) — embeddings only needed in-memory for face match
  const sanitized: any = JSON.parse(JSON.stringify(state));
  if (sanitized.front_extraction) sanitized.front_extraction.face_embedding = null;
  if (sanitized.live_capture) sanitized.live_capture.face_embedding = null;

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
