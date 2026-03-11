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

  private extractDriversLicenseData(lines: RecognitionResult[][], ocrData: OCRData): void {
    const flatLines = this.flattenLines(lines);

    // Name — multiple label patterns common on DL
    this.findField(flatLines, [/full\s*name/i, /\bname\b/i, /\bfn\b/i, /\bln\b/i], (value, conf) => {
      if (value.length > 3) {
        ocrData.name = value.replace(/\s+/g, ' ');
        ocrData.confidence_scores!.name = conf;
      }
    });

    this.findDateField(flatLines, [/dob/i, /date\s*of\s*birth/i, /birth/i, /born/i], (value, conf) => {
      ocrData.date_of_birth = value;
      ocrData.confidence_scores!.date_of_birth = conf;
    });

    this.findField(flatLines, [/license\s*no/i, /driver\s*license/i, /\bdl\b/i, /\bid\b/i, /number/i], (value, conf) => {
      const cleaned = value.replace(/\s+/g, '');
      // Must look like a license number (alphanumeric 6-15), not a date
      if (/^[A-Z0-9\-]{6,15}$/i.test(cleaned) && !/\d{2}[\/\-\.]\d{2}/.test(cleaned)) {
        ocrData.document_number = cleaned;
        ocrData.confidence_scores!.document_number = conf;
      }
    });

    this.findDateField(flatLines, [/expires/i, /expiry/i, /exp\b/i, /valid\s*until/i], (value, conf) => {
      ocrData.expiration_date = value;
      ocrData.confidence_scores!.expiration_date = conf;
    });

    this.findField(flatLines, [/address/i, /addr/i], (value, conf) => {
      if (value.length > 5) {
        ocrData.address = value.replace(/\s+/g, ' ');
        ocrData.confidence_scores!.address = conf;
      }
    });

    this.findField(flatLines, [/sex/i, /gender/i], (value, conf) => {
      const letter = value.match(/^[MF]/i);
      if (letter) {
        ocrData.sex = letter[0].toUpperCase();
        ocrData.confidence_scores!.sex = conf;
      }
    });

    this.findField(flatLines, [/height/i, /hgt/i, /\bht\b/i], (value, conf) => {
      ocrData.height = value.trim();
      ocrData.confidence_scores!.height = conf;
    });

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

    this.findField(flatLines, [/full\s*name/i, /\bname\b/i], (value, conf) => {
      ocrData.name = value;
      ocrData.confidence_scores!.name = conf;
    });

    this.findDateField(flatLines, [/dob/i, /date\s*of\s*birth/i, /born/i], (value, conf) => {
      ocrData.date_of_birth = value;
      ocrData.confidence_scores!.date_of_birth = conf;
    });

    this.findField(flatLines, [/id\s*no/i, /national\s*id/i, /identity/i], (value, conf) => {
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

    this.findDateField(flatLines, [/expiry/i, /expires/i, /valid\s*until/i], (value, conf) => {
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

  /** Pull a date out of arbitrary text and standardise to YYYY-MM-DD. */
  private extractDate(text: string): string | null {
    const m = text.match(/(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})/);
    if (!m) return null;
    return standardizeDateFormat(m[0]);
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
