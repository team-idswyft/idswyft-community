/**
 * LLM Field Extractor — Vision-based fallback for low-confidence OCR fields.
 *
 * When PaddleOCR heuristic extraction produces low-confidence or empty fields,
 * this module sends the document image to the developer's configured LLM provider
 * (OpenAI GPT-4o Vision, Anthropic Claude Vision, or a custom endpoint) for
 * structured extraction.
 *
 * Developers configure their own API key and provider choice in the portal.
 * The platform never stores plaintext keys — they're AES-256-GCM encrypted at rest.
 */

import { OCRData } from '../../types/index.js';
import { logger } from '@/utils/logger.js';

// ── Developer LLM Configuration ─────────────────────────────

export interface LLMProviderConfig {
  provider: 'openai' | 'anthropic' | 'custom';
  apiKey: string;
  endpointUrl?: string;
}

// ── Types ───────────────────────────────────────────────────

export interface LLMExtractionRequest {
  imageBuffer: Buffer;
  documentType: 'drivers_license' | 'passport' | 'national_id' | string;
  fieldsNeeded: string[];
  ocrContext?: string;
  llmConfig: LLMProviderConfig;
}

const FIELD_DESCRIPTIONS: Record<string, string> = {
  name:            'Full legal name (first + middle + last)',
  date_of_birth:   'Date of birth in YYYY-MM-DD format',
  document_number: 'Document / license number',
  expiration_date: 'Expiration date in YYYY-MM-DD format',
  address:         'Full mailing address',
  sex:             'Sex (M or F)',
};

const CONFIDENCE_THRESHOLD = 0.6;

/** Confidence score assigned to LLM-extracted fields (high but not 1.0, since
 *  LLM extraction is accurate but not infallible — distinguishes from verified sources). */
const LLM_EXTRACTION_CONFIDENCE = 0.92;

/** Maximum time to wait for an LLM API response before aborting. */
const LLM_REQUEST_TIMEOUT_MS = 30_000;

// ── MIME detection ──────────────────────────────────────────

function detectMimeType(buffer: Buffer): string {
  if (buffer[0] === 0xFF && buffer[1] === 0xD8) return 'image/jpeg';
  if (buffer[0] === 0x89 && buffer[1] === 0x50) return 'image/png';
  if (buffer[0] === 0x52 && buffer[1] === 0x49) return 'image/webp';
  return 'image/jpeg';
}

// ── Prompt builder ──────────────────────────────────────────

function buildPrompt(documentType: string, fieldsNeeded: string[], ocrContext?: string): string {
  const fieldList = fieldsNeeded
    .filter(f => f in FIELD_DESCRIPTIONS)
    .map(f => `- "${f}": ${FIELD_DESCRIPTIONS[f]}`)
    .join('\n');

  return `You are an expert document reader. Extract the following fields from this ${documentType.replace(/_/g, ' ')} image.

Fields to extract:
${fieldList}

Rules:
- Return ONLY a JSON object with the requested field names as keys
- For dates, use YYYY-MM-DD format (e.g., 1990-05-15)
- For names, use the full name exactly as printed (uppercase if that's how it appears)
- For document numbers, include all characters exactly as shown
- For sex, return only "M" or "F"
- If a field is not visible or unreadable, use null for that field
- Do NOT add any fields beyond what was requested
- Be extremely precise with characters -- accuracy is critical${ocrContext ? `\n\nFor reference, OCR text recognition produced this raw text (may have extraction errors):\n${ocrContext.slice(0, 500)}` : ''}`;
}

// ── Provider-specific callers ───────────────────────────────

async function callOpenAI(
  config: LLMProviderConfig,
  base64Image: string,
  mimeType: string,
  prompt: string,
): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), LLM_REQUEST_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            {
              type: 'image_url',
              image_url: { url: `data:${mimeType};base64,${base64Image}`, detail: 'high' },
            },
          ],
        }],
        max_tokens: 500,
        temperature: 0.1,
      }),
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(`OpenAI API error (${response.status}): ${JSON.stringify(error)}`);
  }

  const result = await response.json() as any;
  return result.choices?.[0]?.message?.content ?? '';
}

async function callAnthropic(
  config: LLMProviderConfig,
  base64Image: string,
  mimeType: string,
  prompt: string,
): Promise<string> {
  // Anthropic uses media_type for their image format
  const mediaType = mimeType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), LLM_REQUEST_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'x-api-key': config.apiKey,
        'content-type': 'application/json',
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 500,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: mediaType, data: base64Image },
            },
            { type: 'text', text: prompt },
          ],
        }],
      }),
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(`Anthropic API error (${response.status}): ${JSON.stringify(error)}`);
  }

  const result = await response.json() as any;
  // Anthropic returns content as an array of content blocks
  const textBlock = result.content?.find((b: any) => b.type === 'text');
  return textBlock?.text ?? '';
}

async function callCustomEndpoint(
  config: LLMProviderConfig,
  base64Image: string,
  mimeType: string,
  prompt: string,
): Promise<string> {
  if (!config.endpointUrl) throw new Error('Custom endpoint URL not configured');

  // Custom endpoints use OpenAI-compatible chat completions format
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), LLM_REQUEST_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(config.endpointUrl, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            {
              type: 'image_url',
              image_url: { url: `data:${mimeType};base64,${base64Image}`, detail: 'high' },
            },
          ],
        }],
        max_tokens: 500,
        temperature: 0.1,
      }),
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(`Custom LLM error (${response.status}): ${JSON.stringify(error)}`);
  }

  const result = await response.json() as any;
  // Try OpenAI-compatible format first, then raw text
  return result.choices?.[0]?.message?.content
    ?? result.content?.[0]?.text
    ?? result.text
    ?? '';
}

// ── Core extraction ─────────────────────────────────────────

export async function extractFieldsWithLLM(req: LLMExtractionRequest): Promise<Partial<OCRData>> {
  const { llmConfig } = req;

  const fieldList = req.fieldsNeeded.filter(f => f in FIELD_DESCRIPTIONS);
  if (fieldList.length === 0) return {};

  const prompt = buildPrompt(req.documentType, fieldList, req.ocrContext);
  const base64Image = req.imageBuffer.toString('base64');
  const mimeType = detectMimeType(req.imageBuffer);

  logger.info('LLMFieldExtractor: requesting extraction', {
    provider: llmConfig.provider,
    fieldsNeeded: req.fieldsNeeded,
    documentType: req.documentType,
  });

  let content: string;
  switch (llmConfig.provider) {
    case 'openai':
      content = await callOpenAI(llmConfig, base64Image, mimeType, prompt);
      break;
    case 'anthropic':
      content = await callAnthropic(llmConfig, base64Image, mimeType, prompt);
      break;
    case 'custom':
      content = await callCustomEndpoint(llmConfig, base64Image, mimeType, prompt);
      break;
    default:
      throw new Error(`Unsupported LLM provider: ${llmConfig.provider}`);
  }

  return parseResponse(content, fieldList);
}

function parseResponse(content: string, fieldsNeeded: string[]): Partial<OCRData> {
  try {
    const cleaned = content.trim()
      .replace(/^```json\n?/, '')
      .replace(/^```\n?/, '')
      .replace(/```$/, '');

    const parsed = JSON.parse(cleaned);
    const result: Partial<OCRData> = {};

    for (const field of fieldsNeeded) {
      const value = parsed[field];
      if (value != null && value !== '' && typeof value === 'string') {
        (result as any)[field] = value;
      }
    }

    logger.info('LLMFieldExtractor: extracted fields', {
      requested: fieldsNeeded,
      extracted: Object.keys(result),
    });

    return result;
  } catch (error) {
    logger.warn('LLMFieldExtractor: failed to parse response', {
      error: error instanceof Error ? error.message : 'Unknown',
      content: content.slice(0, 200),
    });
    return {};
  }
}

// ── Integration helpers ─────────────────────────────────────

/**
 * Identify low-confidence or empty fields that need LLM fallback.
 */
export function findLowConfidenceFields(ocrData: OCRData): string[] {
  const scores = ocrData.confidence_scores ?? {};
  const lowFields: string[] = [];

  for (const field of Object.keys(FIELD_DESCRIPTIONS)) {
    const value = (ocrData as any)[field];
    const confidence = scores[field] ?? 0;

    if (!value || value === '' || confidence < CONFIDENCE_THRESHOLD) {
      lowFields.push(field);
    }
  }

  return lowFields;
}

/**
 * Merge LLM results into OCR data, only overriding low-confidence fields.
 */
export function mergeLLMResults(ocrData: OCRData, llmResult: Partial<OCRData>): void {
  const scores = ocrData.confidence_scores ?? {};

  for (const [field, value] of Object.entries(llmResult)) {
    if (!value) continue;
    const currentConf = scores[field] ?? 0;
    const currentValue = (ocrData as any)[field];

    if (!currentValue || currentValue === '' || currentConf < CONFIDENCE_THRESHOLD) {
      (ocrData as any)[field] = value;
      ocrData.confidence_scores![field] = LLM_EXTRACTION_CONFIDENCE;
    }
  }
}
