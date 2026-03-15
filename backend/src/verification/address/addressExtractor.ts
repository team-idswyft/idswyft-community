/**
 * Address Extractor
 *
 * OCR-based extraction of address and name data from proof-of-address
 * documents (utility bills, bank statements, tax documents).
 *
 * Uses the existing OCR pipeline (PaddleOCR/Tesseract) and applies
 * address-specific post-processing to extract structured data.
 */

import { OCRService } from '../../services/ocr.js';
import { extractNameFromAddressDoc, parseAddress, type AddressComponents } from './addressNormalizer.js';

// ─── Types ───────────────────────────────────────────────

export type AddressDocumentType = 'utility_bill' | 'bank_statement' | 'tax_document';

export interface AddressExtractionResult {
  /** Name found on the document */
  name: string | null;
  /** Full address string from OCR */
  address: string | null;
  /** Parsed address components */
  components: AddressComponents;
  /** Document date (issue date or statement date) */
  document_date: string | null;
  /** Overall OCR confidence for the address document */
  confidence: number;
  /** Raw OCR text */
  raw_text: string;
}

// ─── Date extraction patterns ────────────────────────────

const DATE_PATTERNS = [
  // "January 15, 2024", "Jan 15, 2024"
  /\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2},?\s+\d{4}\b/i,
  // "15/01/2024", "01-15-2024", "2024-01-15"
  /\b\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}\b/,
  /\b\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2}\b/,
];

/**
 * Extract date from OCR text.
 * Returns the first date-like string found in the first 15 lines.
 */
function extractDate(rawText: string): string | null {
  const lines = rawText.split('\n').slice(0, 15);
  const text = lines.join(' ');

  for (const pattern of DATE_PATTERNS) {
    const match = text.match(pattern);
    if (match) return match[0];
  }
  return null;
}

// ─── Address extraction ──────────────────────────────────

/**
 * Extract address from OCR text.
 *
 * Looks for lines containing street numbers, postal codes, or
 * common address keywords following a name line.
 */
function extractAddressFromText(rawText: string): string | null {
  if (!rawText) return null;

  const lines = rawText.split('\n').map(l => l.trim()).filter(Boolean);

  // Strategy 1: Find lines with postal codes
  for (let i = 0; i < lines.length && i < 15; i++) {
    const line = lines[i];
    // Line contains a postal/zip code
    if (/\b\d{5}(?:-\d{4})?\b/.test(line) || /\b[A-Z]\d[A-Z]\s?\d[A-Z]\d\b/i.test(line)) {
      // Collect this line and preceding lines that look like address parts
      const addressLines: string[] = [];
      // Look back up to 3 lines for street address
      for (let j = Math.max(0, i - 3); j <= i; j++) {
        const candidate = lines[j];
        // Skip obvious non-address lines
        if (/^(statement|invoice|bill|account|page|total|date|period)/i.test(candidate)) continue;
        addressLines.push(candidate);
      }
      if (addressLines.length > 0) return addressLines.join(', ');
    }
  }

  // Strategy 2: Find lines starting with a street number
  for (let i = 0; i < lines.length && i < 15; i++) {
    const line = lines[i];
    if (/^\d+\s+\w/.test(line) && /\b(st|ave|blvd|dr|ln|rd|ct|way|street|avenue|road|drive)\b/i.test(line)) {
      // Grab this line and the next (city/state/zip often on next line)
      const parts = [line];
      if (i + 1 < lines.length) parts.push(lines[i + 1]);
      return parts.join(', ');
    }
  }

  return null;
}

// ─── Main extraction function ────────────────────────────

const ocrService = new OCRService();

/**
 * Extract address verification data from a proof-of-address document.
 *
 * @param documentPath - Path to the uploaded document image
 * @param documentId - Document ID for tracking
 * @param documentType - Type of address document
 */
export async function extractAddressDocument(
  documentPath: string,
  documentId: string,
  documentType: AddressDocumentType,
): Promise<AddressExtractionResult> {
  // Run OCR on the document (reuses existing pipeline)
  const ocrData = await ocrService.processDocument(documentId, documentPath, documentType);

  const rawText = ocrData.raw_text || '';

  // Extract name from the document
  const name = ocrData.name || extractNameFromAddressDoc(rawText);

  // Extract address — use OCR-extracted address if available, else parse from raw text
  const address = ocrData.address || extractAddressFromText(rawText);

  // Parse address into components
  const components = parseAddress(address || '');

  // Extract document date
  const documentDate = extractDate(rawText);

  // Compute confidence from OCR scores
  const scores = ocrData.confidence_scores || {};
  const scoreValues = Object.values(scores).filter(v => typeof v === 'number');
  const confidence = scoreValues.length > 0
    ? scoreValues.reduce((sum, v) => sum + v, 0) / scoreValues.length
    : 0.5;

  return {
    name,
    address,
    components,
    document_date: documentDate,
    confidence,
    raw_text: rawText,
  };
}
