/**
 * Engine Client — HTTP client for the Engine Worker microservice.
 *
 * Calls the engine worker's extraction endpoints via HTTP, sending image
 * buffers as multipart/form-data and receiving typed extraction results.
 *
 * If ENGINE_URL is not set, the client is disabled and callers should
 * fall back to local extraction (backward compatibility for dev mode).
 */

import { logger } from '@/utils/logger.js';
import type { FrontExtractionResult, BackExtractionResult, LiveCaptureResult } from '@/verification/models/types.js';
import type { LLMProviderConfig } from '@/providers/ocr/LLMFieldExtractor.js';
import type { HeadTurnLivenessMetadata } from '@/verification/models/headTurnLivenessSchema.js';

const ENGINE_URL = process.env.ENGINE_URL || '';
const ENGINE_TIMEOUT = parseInt(process.env.ENGINE_TIMEOUT || '60000'); // 60s default

/** Whether the engine worker is configured (ENGINE_URL is set). */
export function isEngineEnabled(): boolean {
  return ENGINE_URL.length > 0;
}

/**
 * Send a multipart request to the engine worker.
 * Uses native fetch + FormData (Node 18+).
 */
async function callEngine<T>(
  endpoint: string,
  imageBuffer: Buffer,
  metadata: Record<string, string>,
): Promise<T> {
  const url = `${ENGINE_URL}${endpoint}`;

  // Build multipart/form-data using native Blob/FormData
  const formData = new FormData();
  formData.append('file', new Blob([new Uint8Array(imageBuffer)]), 'image.jpg');

  for (const [key, value] of Object.entries(metadata)) {
    if (value !== undefined && value !== null) {
      formData.append(key, value);
    }
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ENGINE_TIMEOUT);

  try {
    const response = await fetch(url, {
      method: 'POST',
      body: formData,
      signal: controller.signal,
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Engine returned ${response.status}: ${body}`);
    }

    const json = await response.json() as { success: boolean; result: T; error?: string; message?: string };
    if (!json.success) {
      throw new Error(`Engine extraction failed: ${json.message || json.error || 'Unknown'}`);
    }

    return json.result;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error(`Engine request timed out after ${ENGINE_TIMEOUT}ms: ${endpoint}`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Extract front document data via the engine worker.
 */
export async function extractFront(
  imageBuffer: Buffer,
  opts: {
    documentId: string;
    documentType: string;
    issuingCountry?: string;
    verificationId?: string;
    llmConfig?: LLMProviderConfig;
  },
): Promise<FrontExtractionResult> {
  logger.info('Calling engine: /extract/front', {
    documentId: opts.documentId,
    documentType: opts.documentType,
    issuingCountry: opts.issuingCountry,
  });

  const metadata: Record<string, string> = {
    document_id: opts.documentId,
    document_type: opts.documentType,
  };
  if (opts.issuingCountry) metadata.issuing_country = opts.issuingCountry;
  if (opts.verificationId) metadata.verification_id = opts.verificationId;
  if (opts.llmConfig) metadata.llm_config = JSON.stringify(opts.llmConfig);

  return callEngine<FrontExtractionResult>('/extract/front', imageBuffer, metadata);
}

/**
 * Extract back document data via the engine worker.
 */
export async function extractBack(imageBuffer: Buffer): Promise<BackExtractionResult> {
  logger.info('Calling engine: /extract/back');
  return callEngine<BackExtractionResult>('/extract/back', imageBuffer, {});
}

/**
 * Extract live capture data via the engine worker.
 */
export async function extractLive(
  selfieBuffer: Buffer,
  opts: {
    isSandbox: boolean;
    headTurnMetadata?: HeadTurnLivenessMetadata;
  },
): Promise<LiveCaptureResult> {
  logger.info('Calling engine: /extract/live', {
    isSandbox: opts.isSandbox,
    hasHeadTurn: !!opts.headTurnMetadata,
  });

  const metadata: Record<string, string> = {
    is_sandbox: String(opts.isSandbox),
  };
  if (opts.headTurnMetadata) {
    metadata.head_turn_metadata = JSON.stringify(opts.headTurnMetadata);
  }

  return callEngine<LiveCaptureResult>('/extract/live', selfieBuffer, metadata);
}

export const engineClient = {
  isEnabled: isEngineEnabled,
  extractFront,
  extractBack,
  extractLive,
};

export default engineClient;
