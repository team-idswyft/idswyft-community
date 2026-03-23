/**
 * Batch Verification Service
 *
 * Creates and processes batch verification jobs for enterprise
 * onboarding scenarios (migrating thousands of existing users).
 * Processes items with controlled concurrency, reusing the same
 * verification pipeline as single verifications.
 */

import { supabase } from '@/config/database.js';
import { logger } from '@/utils/logger.js';

// ─── Types ───────────────────────────────────────────────

export interface BatchItemInput {
  user_id: string;
  document_type?: string;
  front_document_url?: string;
  back_document_url?: string;
  selfie_url?: string;
  metadata?: Record<string, any>;
}

export interface BatchJob {
  id: string;
  developer_id: string;
  status: 'pending' | 'processing' | 'completed' | 'cancelled' | 'failed';
  total_items: number;
  processed_items: number;
  succeeded_items: number;
  failed_items: number;
  created_at: string;
  completed_at: string | null;
}

export interface BatchItem {
  id: string;
  batch_id: string;
  user_id: string | null;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  verification_id: string | null;
  error: string | null;
  input_data: BatchItemInput;
  created_at: string;
}

export interface BatchResult {
  item_id: string;
  user_id: string | null;
  status: string;
  verification_id: string | null;
  error: string | null;
}

// ─── Constants ───────────────────────────────────────────

const MAX_CONCURRENT = 5;
const MAX_BATCH_SIZE = 1000;

// Track active processing to support cancellation
const activeBatches = new Set<string>();

// ─── Service Functions ───────────────────────────────────

/**
 * Create a new batch job with items.
 */
export async function createBatch(
  developerId: string,
  items: BatchItemInput[],
): Promise<BatchJob> {
  if (items.length === 0) {
    throw new Error('Batch must contain at least one item');
  }
  if (items.length > MAX_BATCH_SIZE) {
    throw new Error(`Batch size cannot exceed ${MAX_BATCH_SIZE} items`);
  }

  // Validate items
  for (let i = 0; i < items.length; i++) {
    if (!items[i].user_id) {
      throw new Error(`Item ${i} missing required field: user_id`);
    }
  }

  // Create batch job
  const { data: job, error: jobError } = await supabase
    .from('batch_jobs')
    .insert({
      developer_id: developerId,
      status: 'pending',
      total_items: items.length,
      processed_items: 0,
      succeeded_items: 0,
      failed_items: 0,
    })
    .select()
    .single();

  if (jobError || !job) {
    logger.error('Failed to create batch job:', jobError);
    throw new Error('Failed to create batch job');
  }

  // Create batch items
  const batchItems = items.map(item => ({
    batch_id: job.id,
    user_id: item.user_id,
    status: 'pending',
    input_data: item,
  }));

  const { error: itemsError } = await supabase
    .from('batch_items')
    .insert(batchItems);

  if (itemsError) {
    logger.error('Failed to create batch items:', itemsError);
    // Clean up the job
    await supabase.from('batch_jobs').delete().eq('id', job.id);
    throw new Error('Failed to create batch items');
  }

  return job as BatchJob;
}

/**
 * Process a batch job. Runs items with controlled concurrency.
 * This is designed to be called asynchronously (fire-and-forget).
 *
 * @param batchId - The batch job ID
 * @param processItem - Callback that processes a single item and returns the verification_id
 */
export async function processBatch(
  batchId: string,
  processItem: (item: BatchItemInput) => Promise<string>,
): Promise<void> {
  activeBatches.add(batchId);

  // Mark job as processing
  await supabase.from('batch_jobs').update({ status: 'processing' }).eq('id', batchId);

  // Fetch all pending items
  const { data: items, error } = await supabase
    .from('batch_items')
    .select('*')
    .eq('batch_id', batchId)
    .eq('status', 'pending')
    .order('created_at', { ascending: true });

  if (error || !items) {
    logger.error(`Batch ${batchId}: failed to fetch items`, error);
    await supabase.from('batch_jobs').update({ status: 'failed' }).eq('id', batchId);
    activeBatches.delete(batchId);
    return;
  }

  let processed = 0;
  let succeeded = 0;
  let failed = 0;

  // Process in chunks of MAX_CONCURRENT
  for (let i = 0; i < items.length; i += MAX_CONCURRENT) {
    // Check for cancellation
    if (!activeBatches.has(batchId)) {
      // Mark remaining items as cancelled
      const remainingIds = items.slice(i).map((it: any) => it.id);
      if (remainingIds.length > 0) {
        await supabase.from('batch_items').update({ status: 'cancelled' }).in('id', remainingIds);
      }
      break;
    }

    const chunk = items.slice(i, i + MAX_CONCURRENT);

    const results = await Promise.allSettled(
      chunk.map(async (item: any) => {
        // Mark item as processing
        await supabase.from('batch_items').update({ status: 'processing' }).eq('id', item.id);

        try {
          const verificationId = await processItem(item.input_data);

          await supabase.from('batch_items').update({
            status: 'completed',
            verification_id: verificationId,
          }).eq('id', item.id);

          return { success: true };
        } catch (err: any) {
          await supabase.from('batch_items').update({
            status: 'failed',
            error: err.message || 'Unknown error',
          }).eq('id', item.id);

          return { success: false };
        }
      }),
    );

    for (const result of results) {
      processed++;
      if (result.status === 'fulfilled' && result.value.success) {
        succeeded++;
      } else {
        failed++;
      }
    }

    // Update progress
    await supabase.from('batch_jobs').update({
      processed_items: processed,
      succeeded_items: succeeded,
      failed_items: failed,
    }).eq('id', batchId);
  }

  // Mark job as completed (or cancelled)
  const finalStatus = activeBatches.has(batchId) ? 'completed' : 'cancelled';
  await supabase.from('batch_jobs').update({
    status: finalStatus,
    processed_items: processed,
    succeeded_items: succeeded,
    failed_items: failed,
    completed_at: new Date().toISOString(),
  }).eq('id', batchId);

  activeBatches.delete(batchId);
}

/**
 * Get batch job status.
 */
export async function getBatchStatus(
  batchId: string,
  developerId: string,
): Promise<BatchJob | null> {
  const { data, error } = await supabase
    .from('batch_jobs')
    .select('*')
    .eq('id', batchId)
    .eq('developer_id', developerId)
    .single();

  if (error || !data) return null;
  return data as BatchJob;
}

/**
 * Get batch results (individual item outcomes).
 */
export async function getBatchResults(
  batchId: string,
  developerId: string,
): Promise<BatchResult[]> {
  // Verify ownership
  const job = await getBatchStatus(batchId, developerId);
  if (!job) return [];

  const { data, error } = await supabase
    .from('batch_items')
    .select('id, user_id, status, verification_id, error')
    .eq('batch_id', batchId)
    .order('created_at', { ascending: true });

  if (error || !data) return [];

  return data.map((item: any) => ({
    item_id: item.id,
    user_id: item.user_id,
    status: item.status,
    verification_id: item.verification_id,
    error: item.error,
  }));
}

/**
 * Cancel a batch job. Items already completed are unaffected.
 */
export async function cancelBatch(
  batchId: string,
  developerId: string,
): Promise<boolean> {
  const job = await getBatchStatus(batchId, developerId);
  if (!job) return false;
  if (job.status === 'completed' || job.status === 'cancelled') return false;

  // Remove from active set — processBatch loop will notice
  activeBatches.delete(batchId);

  // If not yet started, mark directly
  if (job.status === 'pending') {
    await supabase.from('batch_jobs').update({
      status: 'cancelled',
      completed_at: new Date().toISOString(),
    }).eq('id', batchId);

    await supabase.from('batch_items').update({
      status: 'cancelled',
    }).eq('batch_id', batchId).eq('status', 'pending');
  }

  return true;
}

/**
 * List batch jobs for a developer.
 */
export async function listBatches(
  developerId: string,
  page: number = 1,
  limit: number = 20,
): Promise<{ jobs: BatchJob[]; total: number }> {
  const offset = (page - 1) * limit;

  const { data, error } = await supabase
    .from('batch_jobs')
    .select('*')
    .eq('developer_id', developerId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  const { count } = await supabase
    .from('batch_jobs')
    .select('*', { count: 'exact', head: true })
    .eq('developer_id', developerId);

  if (error || !data) return { jobs: [], total: 0 };

  return {
    jobs: data as BatchJob[],
    total: count || 0,
  };
}
