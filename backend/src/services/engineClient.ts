/**
 * Engine Client — HTTP client for the Engine Worker microservice.
 *
 * Calls the engine worker's extraction endpoints via HTTP, sending image
 * buffers as multipart/form-data and receiving typed extraction results.
 *
 * If ENGINE_URL is not set, the client is disabled and callers should
 * fall back to local extraction (backward compatibility for dev mode).
 *
 * Reliability layer (added 2026-04 per audit S2.5):
 *   - 2 retries on transient failure (3 attempts total)
 *   - exponential backoff: 500ms, 1000ms
 *   - no retry on 4xx (engine deliberately rejected input)
 *   - circuit breaker opens after 5 consecutive failures, auto-recovers
 *     after 30s. Open state fails fast in <1ms with a clear error.
 */

import { logger } from '@/utils/logger.js';
import type { FrontExtractionResult, BackExtractionResult, LiveCaptureResult, LLMProviderConfig, HeadTurnLivenessMetadata } from '@idswyft/shared';
import type { OCRData } from '@/types/index.js';

const ENGINE_URL = process.env.ENGINE_URL || '';
const ENGINE_TIMEOUT = parseInt(process.env.ENGINE_TIMEOUT || '60000'); // 60s default

// ─── Retry / circuit breaker config ─────────────────────────────
const MAX_ATTEMPTS = 3;
// Backoff is configurable via env so tests can use 1ms instead of 500/1000ms.
// Production should leave this unset to use the audit-recommended defaults.
const BACKOFF_BASE_MS = parseInt(process.env.ENGINE_BACKOFF_BASE_MS || '500');
// IMPORTANT: this counts every retryable PHYSICAL ATTEMPT against the engine,
// not logical request-failure events. A single fully-failing logical request
// fires 3 physical attempts (1 initial + 2 retries), so 2 fully-failing
// requests = 6 attempts → trips the breaker partway through the second.
// This is intentional: the breaker protects the engine from amplified retry
// traffic, so attempt-count is the right metric. The name kept for backward
// compat across observability tooling that may key off it.
const BREAKER_FAILURE_THRESHOLD = 5;
const BREAKER_OPEN_MS = parseInt(process.env.ENGINE_BREAKER_OPEN_MS || '30000');

/** Whether the engine worker is configured (ENGINE_URL is set). */
export function isEngineEnabled(): boolean {
  return ENGINE_URL.length > 0;
}

// ─── Typed error so retry logic can branch on retryability ──────
export class EngineError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly retryable: boolean,
  ) {
    super(message);
    this.name = 'EngineError';
  }
}

/** Thrown when the circuit breaker is open and we're failing fast. */
export class EngineCircuitOpenError extends Error {
  constructor(reopensAt: number) {
    super(`Engine circuit breaker is open; auto-recovers at ${new Date(reopensAt).toISOString()}`);
    this.name = 'EngineCircuitOpenError';
  }
}

// ─── Circuit breaker state (module-level singleton) ─────────────
interface BreakerState {
  consecutiveFailures: number;
  openedAt: number | null;
}

const breaker: BreakerState = {
  consecutiveFailures: 0,
  openedAt: null,
};

function breakerIsOpen(): boolean {
  if (breaker.openedAt === null) return false;
  if (Date.now() - breaker.openedAt > BREAKER_OPEN_MS) {
    // Half-open: clear timestamp so the next call is allowed through.
    // consecutiveFailures stays elevated; if the probe fails it'll reopen
    // immediately, if it succeeds breakerOnSuccess will clear the count.
    breaker.openedAt = null;
    return false;
  }
  return true;
}

function breakerOnSuccess(): void {
  if (breaker.consecutiveFailures > 0 || breaker.openedAt !== null) {
    logger.info('Engine circuit breaker: success, resetting', {
      previousFailures: breaker.consecutiveFailures,
    });
  }
  breaker.consecutiveFailures = 0;
  breaker.openedAt = null;
}

function breakerOnFailure(): void {
  breaker.consecutiveFailures++;
  if (breaker.consecutiveFailures >= BREAKER_FAILURE_THRESHOLD && breaker.openedAt === null) {
    breaker.openedAt = Date.now();
    logger.warn('Engine circuit breaker: opening', {
      consecutiveFailures: breaker.consecutiveFailures,
      durationMs: BREAKER_OPEN_MS,
    });
  }
}

/**
 * Reset breaker state. Exported only for tests — production code should not
 * call this; the breaker auto-recovers via its half-open path.
 *
 * Hard-guarded against accidental production calls via NODE_ENV check —
 * the function is exported (so tests across files can use it) but throws
 * if invoked outside test mode. Prevents the breaker from being defeated
 * by a route handler accidentally importing it.
 */
export function _resetBreakerForTests(): void {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('_resetBreakerForTests cannot be called in production');
  }
  breaker.consecutiveFailures = 0;
  breaker.openedAt = null;
}

/** Inspect breaker state. Exported for tests and observability. */
export function getBreakerState(): Readonly<BreakerState> {
  return { ...breaker };
}

/**
 * Single attempt: build the multipart request, send via fetch, parse JSON.
 * Throws EngineError on protocol/HTTP errors with retryability marked.
 * Throws plain Error for fundamental failures (e.g. invalid response shape).
 */
async function callEngineOnce<T>(
  endpoint: string,
  fileBuffer: Buffer,
  metadata: Record<string, string>,
  filename: string,
): Promise<T> {
  const url = `${ENGINE_URL}${endpoint}`;

  const formData = new FormData();
  formData.append('file', new Blob([new Uint8Array(fileBuffer)]), filename);
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
      // 4xx = engine deliberately rejected input → not retryable.
      // 5xx = engine had an internal failure → retryable.
      const retryable = response.status >= 500;
      throw new EngineError(
        `Engine returned ${response.status}: ${body}`,
        response.status,
        retryable,
      );
    }

    const json = (await response.json()) as { success: boolean; result: T; error?: string; message?: string };
    if (!json.success) {
      // Engine returned 200 but indicated logical failure. Treat as 4xx-like:
      // not retryable (the engine looked at the input and said no).
      throw new EngineError(
        `Engine extraction failed: ${json.message || json.error || 'Unknown'}`,
        200,
        false,
      );
    }

    return json.result;
  } catch (error) {
    // Map AbortError (timeout) and network errors to retryable EngineError.
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new EngineError(
        `Engine request timed out after ${ENGINE_TIMEOUT}ms: ${endpoint}`,
        0,
        true,
      );
    }
    if (error instanceof EngineError) {
      throw error;
    }
    // fetch() throws TypeError on network failures (DNS, refused, reset).
    if (error instanceof TypeError) {
      throw new EngineError(
        `Engine network error: ${error.message}`,
        0,
        true,
      );
    }
    // Anything else — most commonly SyntaxError from response.json() when
    // the engine returns non-JSON (gateway 502 HTML, mid-deploy connection
    // reset that returns a partial body). The retry loop catches plain
    // Error instances as retryable by default — same effect as if we
    // marked them explicitly. Documented here so the behavior is clear:
    // unknown error types DEFAULT TO RETRYABLE because most real-world
    // unknown errors during an engine call are transient.
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

/** Sleep helper — no setTimeout in promise constructors per lint convention. */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Top-level call: applies the circuit breaker and retry policy around
 * callEngineOnce. All extract* helpers route through this.
 */
async function callEngine<T>(
  endpoint: string,
  fileBuffer: Buffer,
  metadata: Record<string, string>,
  filename = 'image.jpg',
): Promise<T> {
  if (breakerIsOpen()) {
    throw new EngineCircuitOpenError(breaker.openedAt! + BREAKER_OPEN_MS);
  }

  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const result = await callEngineOnce<T>(endpoint, fileBuffer, metadata, filename);
      breakerOnSuccess();
      return result;
    } catch (error) {
      lastError = error as Error;

      // Non-retryable errors (4xx, logical failure): break out immediately
      // and don't count this against the breaker (the input was bad, not
      // the engine).
      if (error instanceof EngineError && !error.retryable) {
        throw error;
      }

      // Retryable failure: count it against the breaker and either retry
      // or give up.
      breakerOnFailure();

      if (attempt < MAX_ATTEMPTS) {
        const backoff = BACKOFF_BASE_MS * Math.pow(2, attempt - 1);
        logger.warn('Engine call failed, retrying', {
          endpoint,
          attempt,
          maxAttempts: MAX_ATTEMPTS,
          backoffMs: backoff,
          error: (error as Error).message,
        });
        await sleep(backoff);
      }
    }
  }

  // All retries exhausted.
  throw lastError ?? new Error('Engine call failed without a captured error');
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

/**
 * Run OCR-only extraction via the engine worker (no face/tamper/MRZ).
 * Used for address verification and other utility document flows.
 */
export async function extractOCR(
  imageBuffer: Buffer,
  documentType: string,
): Promise<OCRData> {
  logger.info('Calling engine: /extract/ocr', { documentType });
  return callEngine<OCRData>('/extract/ocr', imageBuffer, { document_type: documentType });
}

/** Voice enrollment result from engine */
export interface VoiceEnrollResult {
  speaker_embedding: number[];
  embedding_dimension: number;
}

/** Voice verification result from engine */
export interface VoiceVerifyResult {
  speaker_embedding: number[];
  embedding_dimension: number;
  transcription: string;
}

/**
 * Extract speaker embedding from audio for voice enrollment.
 */
export async function extractVoiceEnroll(audioBuffer: Buffer): Promise<VoiceEnrollResult> {
  logger.info('Calling engine: /extract/voice-enroll');
  return callEngine<VoiceEnrollResult>('/extract/voice-enroll', audioBuffer, {}, 'audio.webm');
}

/**
 * Extract speaker embedding + transcription from audio for voice verification.
 */
export async function extractVoiceVerify(audioBuffer: Buffer): Promise<VoiceVerifyResult> {
  logger.info('Calling engine: /extract/voice-verify');
  return callEngine<VoiceVerifyResult>('/extract/voice-verify', audioBuffer, {}, 'audio.webm');
}

export const engineClient = {
  isEnabled: isEngineEnabled,
  extractFront,
  extractBack,
  extractLive,
  extractOCR,
  extractVoiceEnroll,
  extractVoiceVerify,
};

export default engineClient;
