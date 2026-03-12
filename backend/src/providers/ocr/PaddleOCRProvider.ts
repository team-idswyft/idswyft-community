import {
  PaddleOcrService,
  type PaddleOcrResult,
  type RecognitionResult,
} from 'ppu-paddle-ocr';
import { OCRProvider } from '../types.js';
import { OCRData } from '../../types/index.js';
import { logger } from '@/utils/logger.js';

/**
 * PaddleOCR-based provider using ppu-paddle-ocr (ONNX Runtime, pure Node.js).
 *
 * Advantages over TesseractProvider:
 *  - Structured line-level results with bounding boxes (not raw-text regex)
 *  - Per-item confidence scores (not hardcoded)
 *  - ~218 ms inference vs Tesseract's 1-3 s
 *  - No Python / native compilation dependency
 */
export class PaddleOCRProvider implements OCRProvider {
  readonly name = 'paddle';

  private service: PaddleOcrService | null = null;
  private initPromise: Promise<void> | null = null;

  // ── Lifecycle ────────────────────────────────────────

  /** Lazy-init: first call loads ONNX models (~2 s), subsequent calls reuse. */
  private async ensureInitialized(): Promise<PaddleOcrService> {
    if (this.service) return this.service;

    if (!this.initPromise) {
      this.initPromise = (async () => {
        logger.info('PaddleOCRProvider: initializing ONNX models…');
        const svc = new PaddleOcrService({
          debugging: { verbose: false },
        });
        await svc.initialize();
        this.service = svc;
        logger.info('PaddleOCRProvider: ready');
      })();
    }

    await this.initPromise;
    return this.service!;
  }

  // ── OCRProvider interface ────────────────────────────

  async processDocument(buffer: Buffer, documentType: string): Promise<OCRData> {
    const svc = await this.ensureInitialized();

    // PaddleOcrService.recognize() expects ArrayBuffer, not Node Buffer.
    // Use Uint8Array copy to guarantee a plain ArrayBuffer.
    const arrayBuffer = new Uint8Array(buffer).buffer;
    const result: PaddleOcrResult = await svc.recognize(arrayBuffer);

    const ocrData: OCRData = {
      raw_text: result.text,
      confidence_scores: {},
    };

    switch (documentType) {
      case 'passport':
        this.extractPassportData(result.lines, ocrData);
        break;
      case 'drivers_license':
        this.extractDriversLicenseData(result.lines, ocrData);
        break;
      case 'national_id':
        this.extractNationalIdData(result.lines, ocrData);
        break;
      default:
        this.extractGenericData(result.lines, ocrData);
    }

    return ocrData;
  }

  // ── Field extraction (line-based) ───────────────────

  /**
   * Each "line" from PaddleOCR is an array of RecognitionResult items
   * that sit on the same horizontal band.  We join them into a single
   * string per line, then look for label→value patterns.
   */

  private extractPassportData(lines: RecognitionResult[][], ocrData: OCRData): void {
    const flatLines = this.flattenLines(lines);

    this.findField(flatLines, [/name/i, /surname/i, /given\s*names?/i], (value, conf) => {
      ocrData.name = value;
      ocrData.confidence_scores!.name = conf;
    });

    this.findDateField(flatLines, [/date\s*of\s*birth/i, /birth/i, /dob/i], (value, conf) => {
      ocrData.date_of_birth = value;
      ocrData.confidence_scores!.date_of_birth = conf;
    });

    this.findField(flatLines, [/passport\s*no/i, /document\s*no/i, /number/i], (value, conf) => {
      const cleaned = value.replace(/\s+/g, '');
      if (/^[A-Z0-9]{6,9}$/i.test(cleaned)) {
        ocrData.document_number = cleaned;
        ocrData.confidence_scores!.document_number = conf;
      }
    });

    this.findDateField(flatLines, [/date\s*of\s*expiry/i, /expiry/i, /expires/i, /exp/i], (value, conf) => {
      ocrData.expiration_date = value;
      ocrData.confidence_scores!.expiration_date = conf;
    });

    this.findField(flatLines, [/nationality/i, /country/i], (value, conf) => {
      ocrData.nationality = value;
      ocrData.confidence_scores!.nationality = conf;
    });
  }

  // ── Noise filters ──────────────────────────────────
  // Words/phrases that appear on DL headers but are NOT personal data.

  /** Document header strings — never a person's name */
  private static readonly HEADER_NOISE = new Set([
    'driver license', 'drivers license', "driver's license",
    'driver licence', 'drivers licence',
    'identification card', 'id card', 'identity card',
    'passport', 'national id', 'real id',
    'department of motor vehicles', 'dmv',
    'not for federal identification',
    'federal limits apply',
  ]);

  /** US state names — they appear on DL headers, never as person names */
  private static readonly US_STATES = new Set([
    'alabama', 'alaska', 'arizona', 'arkansas', 'california',
    'colorado', 'connecticut', 'delaware', 'florida', 'georgia',
    'hawaii', 'idaho', 'illinois', 'indiana', 'iowa',
    'kansas', 'kentucky', 'louisiana', 'maine', 'maryland',
    'massachusetts', 'michigan', 'minnesota', 'mississippi', 'missouri',
    'montana', 'nebraska', 'nevada', 'new hampshire', 'new jersey',
    'new mexico', 'new york', 'north carolina', 'north dakota', 'ohio',
    'oklahoma', 'oregon', 'pennsylvania', 'rhode island', 'south carolina',
    'south dakota', 'tennessee', 'texas', 'utah', 'vermont',
    'virginia', 'washington', 'west virginia', 'wisconsin', 'wyoming',
    'district of columbia',
  ]);

  /** Check if text is a document header / state name — not personal data */
  private isHeaderNoise(text: string): boolean {
    const lower = text.toLowerCase().trim();
    if (PaddleOCRProvider.HEADER_NOISE.has(lower)) return true;
    if (PaddleOCRProvider.US_STATES.has(lower)) return true;
    // Compound noise: "NORTH CAROLINA", "NORTHUSA DRIVER LICENSE CAROLINA"
    // Check if the text is made up entirely of state fragments + header words
    const words = lower.split(/\s+/);
    const noiseWords = new Set([
      'north', 'south', 'west', 'new', 'rhode', 'district', 'of',
      'carolina', 'dakota', 'virginia', 'hampshire', 'jersey', 'mexico',
      'york', 'island', 'columbia', 'usa', 'state',
      'driver', 'drivers', 'license', 'licence', 'identification',
      'card', 'id', 'real', 'department', 'motor', 'vehicles',
    ]);
    if (words.length > 0 && words.every(w => noiseWords.has(w))) return true;
    return false;
  }

  private extractDriversLicenseData(lines: RecognitionResult[][], ocrData: OCRData): void {
    const flatLines = this.flattenLines(lines);

    // Debug: log all flattened lines for diagnostics
    logger.info('PaddleOCR DL extraction — raw lines', {
      lineCount: flatLines.length,
      lines: flatLines.map((l, i) => `[${i}] (${l.confidence.toFixed(2)}) "${l.text}"`),
    });

    // ── DL number ──
    // US DLs use varied labels: "DLn", "DL", "License No", "LIC#", etc.
    // PaddleOCR may merge adjacent fields: "4d DLN C 000048787175 9Class C"
    // So we allow optional letters/spaces between the DL label and the digits.
    let dlNumberLineIndex = -1;
    for (let i = 0; i < flatLines.length; i++) {
      const m = flatLines[i].text.match(/(?:DLn?|DL\s*#?|LIC\s*#?)\s*[A-Z]?\s*([0-9]{6,15})/i);
      if (m) {
        ocrData.document_number = m[1];
        ocrData.confidence_scores!.document_number = flatLines[i].confidence;
        dlNumberLineIndex = i;
        break;
      }
    }

    // Fallback: try label-based extraction
    // Note: avoid matching bare "driver license" header — it grabs the next line as value (e.g. "CAROLINA").
    // Only match patterns that specifically indicate a number field.
    if (!ocrData.document_number) {
      this.findField(flatLines, [/license\s*no/i, /license\s*#/i, /lic\s*no/i, /\bnumber\b/i], (value, conf) => {
        const cleaned = value.replace(/\s+/g, '');
        if (/^[A-Z0-9\-]{6,15}$/i.test(cleaned) && !/\d{2}[\/\-\.]\d{2}/.test(cleaned) && !this.isHeaderNoise(cleaned)) {
          ocrData.document_number = cleaned;
          ocrData.confidence_scores!.document_number = conf;
        }
      });
      if (ocrData.document_number) {
        dlNumberLineIndex = flatLines.findIndex(l => ocrData.document_number && l.text.includes(ocrData.document_number));
      }
    }

    // ── Name ──
    // First try labeled patterns
    this.findField(flatLines, [/full\s*name/i, /\bname\b/i, /\bfn\b/i, /\bln\b/i], (value, conf) => {
      if (value.length > 3 && !this.isHeaderNoise(value)) {
        ocrData.name = value.replace(/\s+/g, ' ');
        ocrData.confidence_scores!.name = conf;
      }
    });

    // Fallback for US DLs: name lines are UPPERCASE-only, appear after the DL number
    // and before address/DOB lines. Typically 1-2 lines of just a name (last, then first).
    if (!ocrData.name) {
      const nameLines: string[] = [];
      let nameConf = 0;
      let nameCount = 0;
      const startIdx = dlNumberLineIndex >= 0 ? dlNumberLineIndex + 1 : 0;

      for (let i = startIdx; i < flatLines.length && i < startIdx + 4; i++) {
        // Strip leading field numbers common on US DLs (e.g. "2OBED" → "OBED", "1LORISSON" → "LORISSON")
        const text = flatLines[i].text.trim().replace(/^\d{1,2}\s*/, '');
        // Skip lines that look like class designations or labels
        if (/^class\b/i.test(text)) continue;
        if (/[:\-]/.test(text)) break; // label line — stop
        // Address lines: digits in the middle/end (e.g. "84020 TRYON PARK RD") — stop
        if (/\d{3,}/.test(text)) break;
        // Skip document headers and state names
        if (this.isHeaderNoise(text)) continue;
        // UPPERCASE text that looks like a name (letters, spaces, hyphens, apostrophes)
        if (/^[A-Z][A-Z\s\-']+$/.test(text) && text.length >= 2) {
          nameLines.push(text);
          nameConf += flatLines[i].confidence;
          nameCount++;
        }
      }

      if (nameLines.length > 0) {
        // US DLs typically show LAST then FIRST — join as "FIRST LAST"
        ocrData.name = nameLines.length > 1
          ? nameLines.slice(1).join(' ') + ' ' + nameLines[0]
          : nameLines[0];
        ocrData.confidence_scores!.name = nameConf / nameCount;
      }
    }

    // ── Date of birth ──
    this.findDateField(flatLines, [/dob/i, /date\s*of\s*birth/i, /birth/i, /born/i], (value, conf) => {
      ocrData.date_of_birth = value;
      ocrData.confidence_scores!.date_of_birth = conf;
    });

    // ── Expiry date ──
    // For US DLs, "Exp" often appears on a label line with the actual date on the next line.
    // When multiple dates appear on the same line, the LAST one is typically the expiry.
    this.findLastDateField(flatLines, [/expires/i, /expiry/i, /\bexp\b/i, /valid\s*until/i], (value, conf) => {
      ocrData.expiration_date = value;
      ocrData.confidence_scores!.expiration_date = conf;
    });

    // ── Address ──
    this.findField(flatLines, [/address/i, /addr/i], (value, conf) => {
      if (value.length > 5) {
        ocrData.address = value.replace(/\s+/g, ' ');
        ocrData.confidence_scores!.address = conf;
      }
    });

    // ── Sex ──
    this.findField(flatLines, [/sex/i, /gender/i], (value, conf) => {
      const letter = value.match(/^[MF]/i);
      if (letter) {
        ocrData.sex = letter[0].toUpperCase();
        ocrData.confidence_scores!.sex = conf;
      }
    });

    // ── Height ──
    this.findField(flatLines, [/height/i, /hgt/i, /\bht\b/i], (value, conf) => {
      // Clean: extract just the measurement (e.g. "5'-09"" from "5'-09" BLK")
      const heightMatch = value.match(/\d['′]\s*-?\s*\d{1,2}"?/);
      ocrData.height = heightMatch ? heightMatch[0] : value.trim();
      ocrData.confidence_scores!.height = conf;
    });

    // ── Eye color ──
    this.findField(flatLines, [/eyes?/i, /eye\s*color/i], (value, conf) => {
      const color = value.match(/^[A-Z]{2,4}/i);
      if (color) {
        ocrData.eye_color = color[0].toUpperCase();
        ocrData.confidence_scores!.eye_color = conf;
      }
    });
  }

  private extractNationalIdData(lines: RecognitionResult[][], ocrData: OCRData): void {
    const flatLines = this.flattenLines(lines);

    // Check if this is actually a driver's license mislabeled as national_id
    const fullText = flatLines.map(l => l.text).join(' ');
    if (/driver\s*license|driver'?s?\s*lic/i.test(fullText) || /\bDLn?\b/i.test(fullText)) {
      return this.extractDriversLicenseData(lines, ocrData);
    }

    this.findField(flatLines, [/full\s*name/i, /\bname\b/i], (value, conf) => {
      if (!this.isHeaderNoise(value)) {
        ocrData.name = value;
        ocrData.confidence_scores!.name = conf;
      }
    });

    this.findDateField(flatLines, [/dob/i, /date\s*of\s*birth/i, /born/i], (value, conf) => {
      ocrData.date_of_birth = value;
      ocrData.confidence_scores!.date_of_birth = conf;
    });

    this.findField(flatLines, [/id\s*no/i, /national\s*id/i, /identity/i, /\bdln?\b/i], (value, conf) => {
      const cleaned = value.replace(/\s+/g, '');
      if (/^[A-Z0-9\-]{6,20}$/i.test(cleaned)) {
        ocrData.document_number = cleaned;
        ocrData.confidence_scores!.document_number = conf;
      }
    });

    this.findField(flatLines, [/issued\s*by/i, /authority/i, /department/i], (value, conf) => {
      ocrData.issuing_authority = value.trim();
      ocrData.confidence_scores!.issuing_authority = conf;
    });

    this.findDateField(flatLines, [/expiry/i, /expires/i, /valid\s*until/i, /\bexp\b/i], (value, conf) => {
      ocrData.expiration_date = value;
      ocrData.confidence_scores!.expiration_date = conf;
    });
  }

  private extractGenericData(lines: RecognitionResult[][], ocrData: OCRData): void {
    const flatLines = this.flattenLines(lines);

    // Try common labels across any document type
    this.findField(flatLines, [/\bname\b/i], (value, conf) => {
      ocrData.name = value;
      ocrData.confidence_scores!.name = conf;
    });

    this.findDateField(flatLines, [/dob/i, /date\s*of\s*birth/i, /birth/i], (value, conf) => {
      ocrData.date_of_birth = value;
      ocrData.confidence_scores!.date_of_birth = conf;
    });

    this.findField(flatLines, [/\bnumber\b/i, /\bno\b/i, /\bid\b/i], (value, conf) => {
      const cleaned = value.replace(/\s+/g, '');
      if (/^[A-Z0-9\-]{4,20}$/i.test(cleaned)) {
        ocrData.document_number = cleaned;
        ocrData.confidence_scores!.document_number = conf;
      }
    });

    this.findDateField(flatLines, [/expiry/i, /expires/i, /exp/i], (value, conf) => {
      ocrData.expiration_date = value;
      ocrData.confidence_scores!.expiration_date = conf;
    });
  }

  // ── Helpers ─────────────────────────────────────────

  /**
   * Flatten PaddleOCR's lines (RecognitionResult[][]) into an
   * array of { text, confidence } per visual line.
   */
  private flattenLines(lines: RecognitionResult[][]): Array<{ text: string; confidence: number }> {
    return lines.map((lineItems) => {
      const texts: string[] = [];
      let totalConf = 0;

      for (const item of lineItems) {
        texts.push(item.text);
        totalConf += item.confidence;
      }

      return {
        text: texts.join(' '),
        confidence: lineItems.length > 0 ? totalConf / lineItems.length : 0,
      };
    });
  }

  /**
   * Search lines for a label matching one of `patterns`, then extract
   * the value portion (text after the label on the same line, or the
   * entire next line if no value follows the label).
   */
  private findField(
    lines: Array<{ text: string; confidence: number }>,
    patterns: RegExp[],
    onMatch: (value: string, confidence: number) => void,
  ): void {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      for (const pattern of patterns) {
        if (!pattern.test(line.text)) continue;

        // Try to split at the label to get the value portion
        const parts = line.text.split(/[:\-]\s*/);
        if (parts.length >= 2) {
          // Value is everything after the first colon/dash
          const value = parts.slice(1).join(':').trim();
          if (value.length > 0) {
            onMatch(value, line.confidence);
            return;
          }
        }

        // Label was the whole line — try the next line as the value
        if (i + 1 < lines.length) {
          const nextLine = lines[i + 1];
          if (nextLine.text.trim().length > 0) {
            onMatch(nextLine.text.trim(), nextLine.confidence);
            return;
          }
        }
      }
    }
  }

  /**
   * Like findField but also finds standalone date patterns on lines
   * and standardises the date format.
   */
  private findDateField(
    lines: Array<{ text: string; confidence: number }>,
    patterns: RegExp[],
    onMatch: (value: string, confidence: number) => void,
  ): void {
    this.findField(lines, patterns, (value, conf) => {
      const dateStr = this.extractDate(value);
      if (dateStr) onMatch(dateStr, conf);
    });
  }

  /**
   * Like findDateField but extracts the LAST date on the matched line/next-line.
   * Useful for US DLs where issue date and expiry date appear on the same line
   * (e.g. "08/14/2025 09/29/2033"), and expiry is the last one.
   */
  private findLastDateField(
    lines: Array<{ text: string; confidence: number }>,
    patterns: RegExp[],
    onMatch: (value: string, confidence: number) => void,
  ): void {
    this.findField(lines, patterns, (value, conf) => {
      const dateStr = this.extractLastDate(value);
      if (dateStr) onMatch(dateStr, conf);
    });
  }

  /** Pull a date out of arbitrary text and standardise to YYYY-MM-DD. */
  private extractDate(text: string): string | null {
    const m = text.match(/(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})/);
    if (!m) return null;
    return standardizeDateFormat(m[0]);
  }

  /** Pull the LAST date from text (for lines with multiple dates). */
  private extractLastDate(text: string): string | null {
    const matches = [...text.matchAll(/(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})/g)];
    if (matches.length === 0) return null;
    return standardizeDateFormat(matches[matches.length - 1][0]);
  }
}

// ── Shared utility ────────────────────────────────────

/** Normalise a date string like "02/15/90" → "YYYY-MM-DD". */
export function standardizeDateFormat(dateStr: string): string {
  const cleaned = dateStr.replace(/[^\d\/\-\.]/g, '');
  const parts = cleaned.split(/[\/\-\.]/);
  if (parts.length !== 3 || parts.some((p) => p.length === 0 || !/^\d+$/.test(p))) return dateStr;

  let [part1, part2, part3] = parts;

  // Two-digit year → four-digit
  if (part3.length === 2) {
    const year = parseInt(part3);
    part3 = year > 30 ? `19${part3}` : `20${part3}`;
  }

  // If first part > 12, assume DD/MM/YYYY (European)
  if (parseInt(part1) > 12) {
    return `${part3}-${part2.padStart(2, '0')}-${part1.padStart(2, '0')}`;
  }

  // Otherwise assume MM/DD/YYYY (US)
  return `${part3}-${part1.padStart(2, '0')}-${part2.padStart(2, '0')}`;
}
