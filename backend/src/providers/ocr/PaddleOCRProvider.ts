import {
  PaddleOcrService,
  type PaddleOcrResult,
  type RecognitionResult,
} from 'ppu-paddle-ocr';
import { OCRProvider } from '../types.js';
import { OCRData } from '../../types/index.js';
import { logger } from '@/utils/logger.js';
import { getCountryFormat, INTERNATIONAL_HEADER_NOISE } from './internationalIdFormats.js';
import type { CountryDocFormat } from './internationalIdFormats.js';
import { STATE_DL_FORMATS } from './dlFormats.js';
import { findLowConfidenceFields, extractFieldsWithLLM, mergeLLMResults } from './LLMFieldExtractor.js';
import type { LLMProviderConfig } from './LLMFieldExtractor.js';

// ── Types ─────────────────────────────────────────────────────

interface FlatLine {
  text:       string;
  confidence: number;
  y:          number;   // vertical center of bounding box
  x:          number;   // horizontal left edge
  width:      number;   // bounding box width
}

// ── Month-name lookup for date parsing ────────────────────────

const MONTH_NAMES: Record<string, string> = {
  JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06',
  JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12',
};

/** Parse a month-name date like "1 JAN 1981" or "12 August 1990" → YYYY-MM-DD */
function parseMonthNameDate(text: string): string | null {
  const m = text.match(/(\d{1,2})\s+(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\w*\s+(\d{4})/i);
  if (m) {
    const day = m[1].padStart(2, '0');
    const month = MONTH_NAMES[m[2].slice(0, 3).toUpperCase()];
    if (month) return `${m[3]}-${month}-${day}`;
  }
  // Also handle "JAN 1 1981" (month-first)
  const m2 = text.match(/(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\w*\s+(\d{1,2}),?\s+(\d{4})/i);
  if (m2) {
    const day = m2[2].padStart(2, '0');
    const month = MONTH_NAMES[m2[1].slice(0, 3).toUpperCase()];
    if (month) return `${m2[3]}-${month}-${day}`;
  }
  return null;
}

// ── Specimen / noise label filter ─────────────────────────────

const SPECIMEN_LABELS = /\b(EXEMPLAR|SPECIMEN|MUSTER|MOD[ÈE]LE|MODELO|MUESTRA|ESEMPIO|EKSEMPLAR|ESIMERKKIKAPPALE|WZÓR)\b/i;

// ── Constants ─────────────────────────────────────────────────

const HEADER_NOISE = new Set([
  'driver license', 'drivers license', "driver's license",
  'driver licence', 'drivers licence', 'identification card',
  'id card', 'identity card', 'passport', 'national id',
  'real id', 'department of motor vehicles', 'dmv',
  'not for federal identification', 'federal limits apply',
  'not for federal purposes', 'not for federal identification purposes',
  'commercial driver license', 'cdl',
  // International header noise
  ...INTERNATIONAL_HEADER_NOISE,
]);

const US_STATES = new Set([
  'alabama','alaska','arizona','arkansas','california','colorado',
  'connecticut','delaware','florida','georgia','hawaii','idaho',
  'illinois','indiana','iowa','kansas','kentucky','louisiana',
  'maine','maryland','massachusetts','michigan','minnesota',
  'mississippi','missouri','montana','nebraska','nevada',
  'new hampshire','new jersey','new mexico','new york',
  'north carolina','north dakota','ohio','oklahoma','oregon',
  'pennsylvania','rhode island','south carolina','south dakota',
  'tennessee','texas','utah','vermont','virginia','washington',
  'west virginia','wisconsin','wyoming','district of columbia',
]);

const DL_FIELD_TOKENS = new Set([
  'hgt','ht','wt','sex','hair','eyes','eye','dob','exp','iss',
  'end','rstr','rest','class','endorsements','restr','restrictions',
  'halt','hait','hal','hai','hgi','hg','sek','sox',
  'blk','brn','blu','grn','hzl','gry','none','organ','donor',
  'veteran','vet','dd','4d','4a','4b','4c','1','2','3','f','m','n',
]);

// Re-export STATE_DL_FORMATS from shared module for backward compatibility
export { STATE_DL_FORMATS } from './dlFormats.js';

// AAMVA field codes found in OCR'd text from PDF417 zones or raw text
const AAMVA_CODES: Record<string, keyof OCRData> = {
  DCS: 'name',
  DAC: 'name',
  DAD: 'name',
  DBB: 'date_of_birth',
  DBA: 'expiration_date',
  DAQ: 'document_number',
  DAG: 'address',
  DAJ: 'address',
  DAK: 'address',
  DBC: 'sex',
};

// ── Utilities ─────────────────────────────────────────────────

/** Normalise any date string to YYYY-MM-DD */
export function standardizeDateFormat(raw: string): string {
  const cleaned = raw.replace(/[^\d\/\-\.]/g, '');
  const parts   = cleaned.split(/[\/\-\.]/);
  if (parts.length !== 3) return raw;
  if (parts.some(p => !p || !/^\d+$/.test(p))) return raw;

  let [p1, p2, p3] = parts;

  // Two-digit year
  if (p3.length === 2) {
    const yr = parseInt(p3, 10);
    p3 = yr > 30 ? `19${p3}` : `20${p3}`;
  }

  // If first part > 12 → DD/MM/YYYY
  return parseInt(p1, 10) > 12
    ? `${p3}-${p2.padStart(2,'0')}-${p1.padStart(2,'0')}`
    : `${p3}-${p1.padStart(2,'0')}-${p2.padStart(2,'0')}`;
}

/**
 * Disambiguate an expiry date when MM/DD vs DD/MM is ambiguous.
 * If both parts ≤ 12 (e.g., "01/02/2028"), try both interpretations:
 *   MM/DD → 2028-01-02
 *   DD/MM → 2028-02-01
 * Prefer the interpretation that yields a future date. If both are
 * future or both are past, default to MM/DD (US convention).
 */
function disambiguateExpiryDate(dateYMD: string): string {
  const m = dateYMD.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return dateYMD;

  const [, year, a, b] = m;
  const aNum = parseInt(a, 10);
  const bNum = parseInt(b, 10);

  // Only ambiguous when both could be month (1-12) and day (1-31)
  if (aNum > 12 || bNum > 12) return dateYMD;
  // If they're the same, no ambiguity
  if (aNum === bNum) return dateYMD;

  const now = Date.now();
  const asMMDD = new Date(`${year}-${a}-${b}`).getTime();
  const asDDMM = new Date(`${year}-${b}-${a}`).getTime();

  // Prefer interpretation that yields a future date
  const mmddFuture = asMMDD > now;
  const ddmmFuture = asDDMM > now;

  if (mmddFuture && !ddmmFuture) return dateYMD;               // MM/DD is future, keep it
  if (ddmmFuture && !mmddFuture) return `${year}-${b}-${a}`;   // DD/MM is future, swap
  return dateYMD;                                                // Both same — default MM/DD
}

/** Parse AAMVA compact date MMDDYYYY or MMDDYY → YYYY-MM-DD */
function parseAamvaDate(s: string): string | null {
  const m8 = s.match(/^(\d{2})(\d{2})(\d{4})$/);
  if (m8) return `${m8[3]}-${m8[1]}-${m8[2]}`;
  const m6 = s.match(/^(\d{2})(\d{2})(\d{2})$/);
  if (m6) {
    const yr = parseInt(m6[3], 10);
    const y4 = yr > 30 ? `19${m6[3]}` : `20${m6[3]}`;
    return `${y4}-${m6[1]}-${m6[2]}`;
  }
  return null;
}

/** Extract ALL date strings from text (numeric and month-name formats) */
function findAllDates(text: string): string[] {
  const results: string[] = [];
  // Numeric dates: DD/MM/YYYY etc.
  const re = /(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const norm = standardizeDateFormat(m[0]);
    if (norm) results.push(norm);
  }
  // Month-name dates: "1 JAN 1981", "JAN 1, 1981"
  const mnRe = /(\d{1,2})\s+(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\w*\s+(\d{4})/gi;
  while ((m = mnRe.exec(text)) !== null) {
    const parsed = parseMonthNameDate(m[0]);
    if (parsed) results.push(parsed);
  }
  const mnRe2 = /(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\w*\s+(\d{1,2}),?\s+(\d{4})/gi;
  while ((m = mnRe2.exec(text)) !== null) {
    const parsed = parseMonthNameDate(m[0]);
    if (parsed) results.push(parsed);
  }
  return results;
}

/** True if text is a document header or state name */
function isHeaderNoise(text: string): boolean {
  const lower = text.toLowerCase().trim();
  if (HEADER_NOISE.has(lower)) return true;
  if (US_STATES.has(lower))    return true;
  // Substring check: catches OCR-merged noise like "NORTHUSA DRIVER LICENSE CAROLINA"
  for (const phrase of HEADER_NOISE) {
    if (lower.includes(phrase)) return true;
  }
  // Compound noise: check if text is made entirely of known noise words
  // (handles OCR-merged tokens by also checking if each word STARTS WITH a noise word)
  const noiseWords = new Set([
    'north','south','west','east','new','rhode','district','of',
    'carolina','dakota','virginia','hampshire','jersey','mexico',
    'york','island','columbia','usa','state','driver','drivers',
    'license','licence','identification','card','id','real',
    'department','motor','vehicles','commercial',
    // Federal / REAL ID phrases split across OCR lines
    'federal','not','for','purposes','limits','apply',
  ]);
  const words = lower.split(/\s+/);
  return words.length > 0 && words.every(w =>
    noiseWords.has(w) || [...noiseWords].some(nw => w.startsWith(nw) && w.length <= nw.length + 4)
  );
}

/** Strip DL field-label tokens from an extracted name */
function sanitizeName(name: string): string {
  const tokens  = name.split(/\s+/).filter(Boolean);
  const cleaned = tokens.filter(t => {
    const lower = t.toLowerCase();
    if (DL_FIELD_TOKENS.has(lower)) return false;
    if (t.length === 1 && !/^[A-Z]$/.test(t)) return false;
    // Remove standalone numbers (AAMVA field markers like "1", "2", "3")
    if (/^\d+$/.test(t))           return false;
    return true;
  });
  return cleaned.length === 0 ? name : cleaned.join(' ');
}

/** Score how likely a string is a real person name (0–1) */
function nameScore(text: string): number {
  const t = text.trim();
  if (t.length < 2)                               return 0;
  if (isHeaderNoise(t))                           return 0;
  if (/\d{3,}/.test(t))                           return 0;  // contains long number
  if (/[:\/<>@#$%^&*=+]/.test(t))                 return 0;  // special chars
  if (/^(class|iss|exp|dob|sex|hgt|wt)\b/i.test(t)) return 0;

  let score = 0;
  // All caps alphabetic with spaces/hyphens/apostrophes — classic DL name
  if (/^[A-Z][A-Z\s\-']+$/.test(t))              score += 0.5;
  // Contains at least two "words" that look like name tokens
  const words = t.split(/\s+/).filter(w => w.length >= 2);
  if (words.length >= 2)                          score += 0.3;
  if (words.length === 1 && t.length >= 3)        score += 0.1;
  // Title case is also valid for some DLs
  if (/^[A-Z][a-z]/.test(t))                     score += 0.1;
  return Math.min(score, 1);
}

// ── Provider ──────────────────────────────────────────────────

export class PaddleOCRProvider implements OCRProvider {
  readonly name = 'paddle';

  private service:     PaddleOcrService | null = null;
  private initPromise: Promise<void>     | null = null;

  private async ensureInitialized(): Promise<PaddleOcrService> {
    if (this.service) return this.service;
    if (!this.initPromise) {
      this.initPromise = (async () => {
        logger.info('PaddleOCRProvider: initializing ONNX models…');
        const svc = new PaddleOcrService({ debugging: { verbose: false } });
        await svc.initialize();
        this.service = svc;
        logger.info('PaddleOCRProvider: ready');
      })();
    }
    await this.initPromise;
    return this.service!;
  }

  async processDocument(buffer: Buffer, documentType: string, issuingCountry?: string, llmConfig?: LLMProviderConfig): Promise<OCRData> {
    const svc         = await this.ensureInitialized();
    const arrayBuffer = new Uint8Array(buffer).buffer;
    const result: PaddleOcrResult = await svc.recognize(arrayBuffer);

    const ocrData: OCRData = {
      raw_text:          result.text,
      confidence_scores: {},
    };

    // Country-aware routing: use international extraction for non-US countries
    const country = issuingCountry?.toUpperCase();
    const countryFormat = country ? getCountryFormat(country, documentType) : null;

    if (country && country !== 'US' && countryFormat) {
      this.extractInternationalDocument(result.lines, ocrData, countryFormat, country);
    } else {
      // Default extraction (US or unknown country)
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
    }

    // Set issuing_country on OCR data if provided
    if (country) ocrData.issuing_country = country;

    // LLM fallback: re-extract low-confidence or empty fields via developer's LLM provider
    if (llmConfig) {
      const lowFields = findLowConfidenceFields(ocrData);
      if (lowFields.length > 0) {
        try {
          const llmResult = await extractFieldsWithLLM({
            imageBuffer: buffer,
            documentType,
            fieldsNeeded: lowFields,
            ocrContext: ocrData.raw_text,
            llmConfig,
          });
          mergeLLMResults(ocrData, llmResult);
          logger.info('PaddleOCRProvider: LLM fallback applied', {
            provider: llmConfig.provider,
            fieldsRequested: lowFields,
            fieldsExtracted: Object.keys(llmResult),
          });
        } catch (err) {
          logger.warn('PaddleOCRProvider: LLM fallback failed', {
            provider: llmConfig.provider,
            error: err instanceof Error ? err.message : 'Unknown',
          });
        }
      }
    }

    logger.info('PaddleOCRProvider: extraction result', {
      documentType,
      issuingCountry: country,
      fields: Object.keys(ocrData).filter(k => k !== 'raw_text' && k !== 'confidence_scores'),
      ocrData,
    });

    return ocrData;
  }

  // ── Flatten with spatial metadata ─────────────────────────

  /**
   * Flatten PaddleOCR lines into FlatLine objects that preserve
   * vertical position (y), horizontal position (x), and width.
   *
   * Uses the `box: { x, y, width, height }` property from RecognitionResult.
   */
  private flattenLines(lines: RecognitionResult[][]): FlatLine[] {
    return lines
      .map((lineItems): FlatLine | null => {
        if (lineItems.length === 0) return null;

        // Sort items left-to-right within the line
        const sorted = [...lineItems].sort((a, b) => {
          const ax = a.box?.x ?? 0;
          const bx = b.box?.x ?? 0;
          return ax - bx;
        });

        const texts:    string[] = [];
        let   totalConf          = 0;
        let   minX               = Infinity;
        let   maxX               = 0;
        let   sumY               = 0;

        for (const item of sorted) {
          texts.push(item.text);
          totalConf += item.confidence;

          const bb = item.box;
          if (bb) {
            minX = Math.min(minX, bb.x);
            maxX = Math.max(maxX, bb.x + bb.width);
            sumY += bb.y + bb.height / 2; // vertical center
          }
        }

        return {
          text:       texts.join(' '),
          confidence: totalConf / sorted.length,
          y:          sumY / sorted.length,
          x:          minX === Infinity ? 0 : minX,
          width:      maxX - (minX === Infinity ? 0 : minX),
        };
      })
      .filter((l): l is FlatLine => l !== null)
      .sort((a, b) => a.y - b.y);  // sort top-to-bottom
  }

  // ── AAMVA raw text extraction ──────────────────────────────

  /**
   * Some DL scanners partially OCR the PDF417 barcode zone at the
   * bottom of the card. If AAMVA field codes appear in raw_text,
   * extract them directly — far more reliable than layout parsing.
   */
  private tryExtractAamva(rawText: string, ocrData: OCRData): boolean {
    // Must contain at least 3 known AAMVA codes to be considered valid
    const codeMatches = Object.keys(AAMVA_CODES).filter(c =>
      rawText.includes(c)
    );
    if (codeMatches.length < 3) return false;

    let lastName  = '';
    let firstName = '';
    let middleName = '';

    const lines = rawText.split(/[\n\r]+/);
    for (const line of lines) {
      const code  = line.slice(0, 3).toUpperCase();
      const value = line.slice(3).trim();
      if (!value) continue;

      switch (code) {
        case 'DCS': lastName   = value; break;
        case 'DAC': firstName  = value; break;
        case 'DAD': middleName = value; break;
        case 'DBB':
          ocrData.date_of_birth    = parseAamvaDate(value) ?? standardizeDateFormat(value);
          ocrData.confidence_scores!.date_of_birth = 0.99;
          break;
        case 'DBA':
          ocrData.expiration_date  = parseAamvaDate(value) ?? standardizeDateFormat(value);
          ocrData.confidence_scores!.expiration_date = 0.99;
          break;
        case 'DAQ':
          ocrData.document_number  = value;
          ocrData.confidence_scores!.document_number = 0.99;
          break;
        case 'DAG':
          ocrData.address          = value;
          ocrData.confidence_scores!.address = 0.99;
          break;
        case 'DBC':
          ocrData.sex              = value === '1' ? 'M' : value === '2' ? 'F' : value;
          ocrData.confidence_scores!.sex = 0.99;
          break;
      }
    }

    if (firstName || lastName) {
      const parts = [firstName, middleName, lastName].filter(Boolean);
      ocrData.name = parts.join(' ');
      ocrData.confidence_scores!.name = 0.99;
    }

    return !!(ocrData.name || ocrData.document_number);
  }

  // ── Driver License extraction ──────────────────────────────

  private extractDriversLicenseData(
    lines:   RecognitionResult[][],
    ocrData: OCRData,
  ): void {

    // Step 0: Try AAMVA extraction first (most reliable)
    if (ocrData.raw_text && this.tryExtractAamva(ocrData.raw_text, ocrData)) {
      logger.info('PaddleOCRProvider: AAMVA codes found — used direct extraction');
      // Still continue to fill any missing fields via layout parsing
    }

    const flatLines = this.flattenLines(lines);

    logger.info('PaddleOCR DL extraction — raw lines', {
      lineCount: flatLines.length,
      lines: flatLines.map((l, i) =>
        `[${i}] y=${Math.round(l.y)} x=${Math.round(l.x)} (${l.confidence.toFixed(2)}) "${l.text}"`
      ),
    });

    // Step 1: Build a label→line index map for fast lookup
    const labelMap = this.buildLabelMap(flatLines);

    // Step 2: Extract each field using label map + fallbacks
    if (!ocrData.document_number) {
      ocrData.document_number = this.extractDlNumber(flatLines, labelMap) ?? undefined;
      if (ocrData.document_number)
        ocrData.confidence_scores!.document_number =
          labelMap.get('dl_number')?.confidence ?? 0.8;
    }

    if (!ocrData.name) {
      const nameResult = this.extractName(flatLines, labelMap);
      if (nameResult) {
        ocrData.name = nameResult.value;
        ocrData.confidence_scores!.name = nameResult.confidence;
      }
    }

    if (!ocrData.date_of_birth) {
      const dob = this.extractDobFromLines(flatLines, labelMap);
      if (dob) {
        ocrData.date_of_birth = dob.value;
        ocrData.confidence_scores!.date_of_birth = dob.confidence;
      }
    }

    if (!ocrData.expiration_date) {
      const exp = this.extractExpiryFromLines(flatLines, labelMap);
      if (exp) {
        ocrData.expiration_date = disambiguateExpiryDate(exp.value);
        ocrData.confidence_scores!.expiration_date = exp.confidence;
      }
    }

    if (!ocrData.address) {
      const addr = this.extractAddress(flatLines, labelMap);
      if (addr) {
        ocrData.address = addr.value;
        ocrData.confidence_scores!.address = addr.confidence;
      }
    }

    this.extractPhysicalDescriptors(flatLines, ocrData);
  }

  // ── Label map ─────────────────────────────────────────────

  /**
   * Build a map from semantic label names to the FlatLine that contains them.
   * This separates "find the label" from "extract the value" so each extractor
   * doesn't re-scan the whole line array.
   */
  private buildLabelMap(lines: FlatLine[]): Map<string, FlatLine & { lineIndex: number }> {
    const map = new Map<string, FlatLine & { lineIndex: number }>();

    const labelPatterns: Array<[string, RegExp]> = [
      ['dl_number',   /(?:4d\b|DLn?\b|DL\s*(?:NO\.?|#)|LIC(?:ENSE)?\s*(?:NO\.?|NUMBER|#)|OL\s*NO\.?|OPERATOR\s*(?:LICENSE|LIC)\s*(?:NO|#)?|PERMIT\s*NO|CUSTOMER\s*ID|CID\b|ID\s*NO\.?|ID(?=\s*\d)|(?:^|\s)I(?=\d{3}\s*\d{3}))/i],
      ['last_name',   /\b(?:LN|LAST\s*NAME|FAMILY\s*NAME|SURNAME)\b/i],
      ['first_name',  /\b(?:FN|FIRST\s*NAME|GIVEN\s*NAME)\b/i],
      ['full_name',   /\b(?:FULL\s*)?NAME\b/i],
      ['dob',         /(?:\bD[O0]B\b|D[O0]B(?=\d)|DATE\s*OF\s*BIRTH|BIRTH\s*DATE|\bBORN\b|3\s+DATE)/i],
      ['expiry',      /\b(?:EXP(?:IRY|IRES)?|EXPIRATION|VALID\s*UNTIL|4b\b)\b/i],
      ['issued',      /\b(?:ISS(?:UED)?|ISSUE\s*DATE|4a\b)\b/i],
      ['address',     /\bADDR(?:ESS)?\b|^8\s+\d{1,5}\s+[A-Z]/i],
      ['sex',         /\bSEX\b/i],
      ['height',      /\b(?:HEIGHT|HGT|HT)\b/i],
      ['eyes',        /\bEYES?\b/i],
      ['hair',        /\bHAIR\b/i],
      ['class',       /\bCLASS\b/i],
    ];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      for (const [key, pattern] of labelPatterns) {
        if (!map.has(key) && pattern.test(line.text)) {
          map.set(key, { ...line, lineIndex: i });
        }
      }
    }

    return map;
  }

  // ── DL Number extraction ───────────────────────────────────

  private extractDlNumber(
    lines:    FlatLine[],
    labelMap: Map<string, FlatLine & { lineIndex: number }>,
  ): string | null {

    // Strategy A: From labeled line
    const labelLine = labelMap.get('dl_number');
    if (labelLine) {
      // Try space-separated digit groups first (e.g., "DLN: 99 999 999")
      // Note: skip looksLikeDate for spaced values — dates never have internal spaces
      const spacedM = labelLine.text.match(
        /(?:4d\s*)?(?:DLn?|DL\s*(?:NO\.?|#?)|LIC(?:ENSE)?\s*(?:NO\.?|#?)|OL\s*NO\.?)\s*[:\s]*(\d[\d\s]{5,18}\d)\b/i,
      );
      if (spacedM && /\s/.test(spacedM[1])) {
        // Strip AAMVA field markers from both ends of the digit groups
        const groups = spacedM[1].trim().split(/\s+/);
        // Leading 1-2 digit groups are element IDs (e.g., "11" in "11 000046688716")
        while (groups.length > 1 && groups[0].length <= 2 && groups[1].length >= 5) {
          groups.shift();
        }
        // Trailing single-digit groups are field markers (e.g., "9" for vehicle class)
        while (groups.length > 1 && groups[groups.length - 1].length === 1) {
          groups.pop();
        }
        const cleaned = groups.join('');
        if (cleaned.length >= 5 && cleaned.length <= 15) {
          return cleaned;
        }
      }

      // Try full alphanumeric DL number after label (handles states with
      // letter prefix/suffix: CA, NJ, WI, ID, VT, ME, MO, etc.)
      const fullAlphaM = labelLine.text.match(
        /(?:4d\s*)?(?:DLn?|DL\s*(?:NO\.?|#?)|LIC(?:ENSE)?\s*(?:NO\.?|#?)|OL\s*NO\.?)\s*([A-Z]{0,3}\d[\dA-Z]{4,14})\b/i,
      );
      if (fullAlphaM) {
        const cleaned = fullAlphaM[1].replace(/[\s\-]/g, '');
        if (/\d/.test(cleaned) && cleaned.length >= 5 && cleaned.length <= 15
            && !this.looksLikeDate(cleaned)) {
          return cleaned;
        }
      }

      // Fallback: strip optional class letter + capture digits only.
      // Handles NC-style "4d DLN C 000099112233 9Class C" where C is a vehicle class.
      const digitsOnlyM = labelLine.text.match(
        /(?:4d\s*)?(?:DLn?|DL\s*#?|LIC\s*#?)\s*[A-Z]?\s*(\d{6,15})/i,
      );
      if (digitsOnlyM) return digitsOnlyM[1].replace(/[\s\-]/g, '');

      // Try "ID" prefix followed by spaced digits: "ID793 398 654" → "793398654"
      const idPrefixM = labelLine.text.match(
        /\bID\s*((?:\d[\d\s]{5,16}\d))/i,
      );
      if (idPrefixM) {
        const cleaned = idPrefixM[1].replace(/[\s\-]/g, '');
        if (cleaned.length >= 7 && cleaned.length <= 15) return cleaned;
      }

      // Also try "ID NO." style and other labeled patterns
      // NOTE: LICENSE must come BEFORE LIC — regex alternation picks the first match,
      // and LIC\s*#? would match just "Lic" from "License" if tried first.
      const candidate = this.valueAfterLabel(
        labelLine.text,
        /(?:LICENSE\s*(?:NO\.?|NUMBER|#)|OL\s*NO\.?|ID\s*NO\.?|ID(?=\s*\d)|4d|DLn?|DL\s*(?:NO\.?|#?)|LIC\s*(?:NO\.?|#?))/i,
      );
      const dlNum = this.parseDlNumber(candidate ?? labelLine.text);
      if (dlNum) return dlNum;

      // Try the next line
      const nextLine = lines[labelLine.lineIndex + 1];
      if (nextLine) {
        const dlNum2 = this.parseDlNumber(nextLine.text);
        if (dlNum2) return dlNum2;
      }
    }

    // Strategy B: Regex scan for DL number patterns across all lines
    // Ordered from most specific to least to minimize false positives.
    const DL_PATTERNS = [
      // Washington: WDL prefix (current post-2018 format)
      /\b(WDL[A-Z0-9]{9,12})\b/i,
      // New Hampshire current: NHL/NHN/NHV + 8 digits
      /\b(NH[LNV]\d{8})\b/,
      // Idaho: 2 letters + 6 digits + 1 letter (e.g., AB123456C)
      /\b([A-Z]{2}\d{6}[A-Z])\b/,
      // New Hampshire legacy: 2 digits + 3 letters + 5 digits (e.g., 12ABC45678)
      /\b(\d{2}[A-Z]{3}\d{5})\b/,
      // Iowa mixed: 3 digits + 2 letters + 4 digits (e.g., 123AB4567)
      /\b(\d{3}[A-Z]{2}\d{4})\b/,
      // Missouri mixed: 3 digits + 1 letter + 6 digits (e.g., 123A456789)
      /\b(\d{3}[A-Z]\d{6})\b/,
      // Kansas alternating: letter-digit-letter-digit-letter (e.g., K1A2B)
      /\b([A-Z]\d[A-Z]\d[A-Z])\b/,
      // Nevada X-prefix: X + 8 digits (non-citizen temporary)
      /\b(X\d{8})\b/,
      // Missouri R-suffix: letter + 6 digits + R (e.g., A123456R)
      /\b([A-Z]\d{6}R)\b/,
      // Letter(s) + digits: 1-3 letters + 6-14 digits (CA, FL, IL, MI, MN, MD, WI,
      //   MA, VA, ND 3L+6D, NJ 1L+14D, etc.)
      /\b([A-Z]{1,3}\d{6,14})\b/,
      // Digits + trailing letter(s): ME 7D+1L, VT 7D+A, MO 8D+2L / 9D+1L
      /\b(\d{7,9}[A-Z]{1,2})\b/,
      // Pure digits 7-14 (expanded for MT 13-14 digit, NV 12 digit, plus NC, NY, PA, TX, etc.)
      /\b(\d{7,14})\b/,
      // Spaced digit groups: "793 398 654" → "793398654" (NY and other states)
      /\b(\d{3}\s+\d{3}\s+\d{3})\b/,
      // Colorado: ##-###-####
      /\b(\d{2}-\d{3}-\d{4})\b/,
      // New York: ###-###-###
      /\b(\d{3}-\d{3}-\d{3})\b/,
      // "ID" or "I" (OCR misread) prefix + spaced digits: "I793 398 654" or "ID793 398 654"
      /\bI[D]?\s*(\d[\d\s]{5,16}\d)\b/i,
    ];

    // Scan with priority: lines containing DL-related labels get tried first
    const DL_LABEL_RE = /\b(?:4d|DLn?|DL\s*(?:NO\.?|#)|LIC(?:ENSE)?\s*(?:NO\.?|#)|OL\s*NO)\b/i;
    const priorityLines = lines.filter(l => DL_LABEL_RE.test(l.text));
    const otherLines = lines.filter(l => !DL_LABEL_RE.test(l.text));

    for (const line of [...priorityLines, ...otherLines]) {
      // Skip lines that are clearly dates or names
      if (/\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}/.test(line.text)) continue;
      if (isHeaderNoise(line.text)) continue;

      for (const pattern of DL_PATTERNS) {
        const m = line.text.match(pattern);
        if (m) {
          const candidate = m[1].replace(/[\s]/g, '');
          if (!this.looksLikeDate(candidate) && !isHeaderNoise(candidate)) {
            return candidate;
          }
        }
      }
    }

    return null;
  }

  private parseDlNumber(text: string): string | null {
    const cleaned = text.trim();
    // Remove leading label if still attached
    // NOTE: LICENSE must come BEFORE LIC to avoid partial "Lic" match
    const withoutLabel = cleaned.replace(
      /^(?:LICENSE\s*(?:NO\.?|NUMBER|#)|OL\s*NO\.?|ID\s*NO\.?|ID(?=\s*\d)|4d|DLn?|DL\s*(?:NO\.?|#?)|LIC\s*(?:NO\.?|#?))\s*/i, ''
    ).trim();

    // Try matching spaced digit groups first: "793 398 654" → "793398654"
    const spacedM = withoutLabel.match(/^(\d[\d\s]{5,16}\d)/);
    if (spacedM) {
      // Strip AAMVA field markers from both ends
      const groups = spacedM[1].trim().split(/\s+/);
      while (groups.length > 1 && groups[0].length <= 2 && groups[1].length >= 5) {
        groups.shift();
      }
      while (groups.length > 1 && groups[groups.length - 1].length === 1) {
        groups.pop();
      }
      const collapsed = groups.join('');
      if (collapsed.length >= 6 && collapsed.length <= 15 && !this.looksLikeDate(collapsed)) {
        return collapsed;
      }
    }

    // Must be alphanumeric, 5–15 chars, no date-like pattern
    // (lowered from 6 to 5 to support Kansas alternating format: K1A2B)
    const m = withoutLabel.match(/^([A-Z0-9\-]{5,15})/i);
    if (!m) return null;
    let candidate = m[1].replace(/\-/g, '');
    if (this.looksLikeDate(candidate)) return null;
    if (isHeaderNoise(candidate))      return null;
    // A DL number must contain at least one digit — reject pure-alpha like "Expires"
    if (!/\d/.test(candidate))         return null;

    // Boundary absorption fix: if the text immediately after the match starts with
    // an uppercase letter (suggesting an AAMVA field like "9FRANKLIN" or "1SMITH"),
    // and the last digit of our candidate could be the AAMVA field marker, trim it.
    const afterMatch = withoutLabel.slice(m[0].length);
    if (/^[A-Z]/i.test(afterMatch) && /\d$/.test(candidate) && candidate.length > 5) {
      candidate = candidate.slice(0, -1);
    }

    return candidate.length >= 5 ? candidate : null;
  }

  private looksLikeDate(s: string): boolean {
    return /^\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}$/.test(s)
      || /^\d{8}$/.test(s); // MMDDYYYY compact
  }

  // ── Name extraction ────────────────────────────────────────

  private extractName(
    lines:    FlatLine[],
    labelMap: Map<string, FlatLine & { lineIndex: number }>,
  ): { value: string; confidence: number } | null {

    // Strategy A: LN + FN labels (California style)
    const lnLine = labelMap.get('last_name');
    const fnLine = labelMap.get('first_name');
    if (lnLine || fnLine) {
      const lastName  = lnLine ? this.extractNameFromLine(lnLine, lines, /\b(?:LN|LAST\s*NAME|FAMILY\s*NAME|SURNAME)\b/i) : '';
      const firstName = fnLine ? this.extractNameFromLine(fnLine, lines, /\b(?:FN|FIRST\s*NAME|GIVEN\s*NAME)\b/i) : '';
      if (lastName || firstName) {
        const full = sanitizeName([firstName, lastName].filter(Boolean).join(' '));
        if (nameScore(full) > 0.3) {
          return {
            value:      full,
            confidence: Math.max(lnLine?.confidence ?? 0, fnLine?.confidence ?? 0),
          };
        }
      }
    }

    // Strategy B: Full name / Name label
    const fullNameLine = labelMap.get('full_name');
    if (fullNameLine) {
      const afterLabel = this.valueAfterLabel(fullNameLine.text, /(?:FULL\s*)?NAME/i);
      let candidateIdx = fullNameLine.lineIndex;
      let candidate = afterLabel;
      if (!candidate) {
        candidate = this.nextLineText(lines, fullNameLine.lineIndex);
        candidateIdx = fullNameLine.lineIndex + 1;
      }
      if (candidate) {
        // Check if the next line is also part of the name (multi-line: surname + given names)
        const nextLine = lines[candidateIdx + 1];
        if (nextLine && !isHeaderNoise(nextLine.text) && !/\d{3,}/.test(nextLine.text) &&
            nameScore(nextLine.text.replace(/^[12]\s*/, '')) > 0.3) {
          const nextName = sanitizeName(nextLine.text.replace(/^[12]\s*/, ''));
          const currName = sanitizeName(candidate);
          // Single word likely surname → put given names first
          const isSurnameFirst = currName.split(/\s+/).length === 1 && nextName.split(/\s+/).length >= 1;
          const combined = isSurnameFirst
            ? sanitizeName(`${nextName} ${currName}`)
            : sanitizeName(`${currName} ${nextName}`);
          if (nameScore(combined) > 0.3) {
            return { value: combined, confidence: fullNameLine.confidence };
          }
        }

        // Handle "LAST, FIRST MIDDLE" comma format
        const commaM = candidate.match(/^([A-Z'\-]+),\s*(.+)$/i);
        const full   = commaM
          ? sanitizeName(`${commaM[2].trim()} ${commaM[1].trim()}`)
          : sanitizeName(candidate);
        if (nameScore(full) > 0.3) {
          return { value: full, confidence: fullNameLine.confidence };
        }
      }
    }

    // Strategy C: AAMVA field number prefixes ("1MARTINEZ", "2ELENA")
    // Relaxed regex: allows commas (Jr/Sr suffixes) and periods in name text.
    const AAMVA_NAME_RE = /^[12]\s*([A-Z][A-Z'\-,.\s]+)$/;
    for (const line of lines) {
      const m = line.text.match(AAMVA_NAME_RE);
      if (m && nameScore(m[1].replace(/[,.]/g, '')) > 0.4) {
        const isLast  = line.text.startsWith('1');
        const partner = lines.find(l =>
          l !== line &&
          l.y > line.y - 5 && l.y < line.y + 60 &&
          l.text.match(isLast ? /^2\s*[A-Z]/ : /^1\s*[A-Z]/)
        );
        if (partner) {
          const partnerM = partner.text.match(AAMVA_NAME_RE);
          const parts = isLast
            ? [partnerM?.[1]?.trim(), m[1].trim()]
            : [m[1].trim(), partnerM?.[1]?.trim()];
          const full = sanitizeName(parts.filter(Boolean).join(' '));
          if (nameScore(full) > 0.4) {
            return {
              value:      full,
              confidence: (line.confidence + (partner?.confidence ?? 0)) / 2,
            };
          }
        }

        // No numbered partner found — check adjacent non-prefixed line (e.g., "TANAKA" above "2 KENJI HIRO")
        const lineIdx = lines.indexOf(line);
        const adjacentIdx = isLast ? lineIdx + 1 : lineIdx - 1;
        const adjacent = lines[adjacentIdx];
        if (adjacent && !isHeaderNoise(adjacent.text) && !/\d/.test(adjacent.text) &&
            nameScore(adjacent.text) > 0.2) {
          const parts = isLast
            ? [adjacent.text.trim(), m[1].trim()]  // first from adjacent, last from current
            : [m[1].trim(), adjacent.text.trim()];  // first from current, last from adjacent
          const full = sanitizeName(parts.join(' '));
          if (nameScore(full) > 0.4) {
            return {
              value:      full,
              confidence: (line.confidence + adjacent.confidence) / 2,
            };
          }
        }

        // Single name line with AAMVA prefix
        const full = sanitizeName(m[1].trim());
        if (nameScore(full) > 0.4) {
          return { value: full, confidence: line.confidence };
        }
      }
    }

    // Strategy C.2: Standalone AAMVA prefix ("1" or "2" alone on its own line)
    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].text.trim();
      if (trimmed !== '1' && trimmed !== '2') continue;
      const isLastPrefix = trimmed === '1';

      // Find the name value on adjacent line (above or below the standalone prefix)
      let nameValue: string | null = null;
      let nameConf = 0;
      for (const adj of [lines[i - 1], lines[i + 1]]) {
        if (!adj) continue;
        const adjText = adj.text.trim();
        if (/^[12]\s/.test(adjText) || /^[12]$/.test(adjText)) continue;
        if (isHeaderNoise(adjText) || /\d{3,}/.test(adjText)) continue;
        if (/^[A-Z][A-Z'\-\s]+$/.test(adjText) && nameScore(adjText) > 0.3) {
          nameValue = adjText;
          nameConf = adj.confidence;
          break;
        }
      }
      if (!nameValue) continue;

      // Look for the numbered partner (e.g., "2 JANICE" when current is standalone "1")
      const partnerPrefix = isLastPrefix ? /^2\s*([A-Z][A-Z'\-,.\s]+)$/ : /^1\s*([A-Z][A-Z'\-,.\s]+)$/;
      const partner = lines.find(l => partnerPrefix.test(l.text));
      if (partner) {
        const partnerM = partner.text.match(partnerPrefix);
        if (partnerM) {
          const parts = isLastPrefix
            ? [partnerM[1].trim(), nameValue]   // given names + surname
            : [nameValue, partnerM[1].trim()];  // given names + surname
          const full = sanitizeName(parts.join(' '));
          if (nameScore(full) > 0.4) {
            return { value: full, confidence: (nameConf + partner.confidence) / 2 };
          }
        }
      }

      // No partner — use just this name
      const full = sanitizeName(nameValue);
      if (nameScore(full) > 0.4) {
        return { value: full, confidence: nameConf };
      }
    }

    // Strategy D: Positional — UPPERCASE name lines in the upper half of the card
    const allYs = lines.map(l => l.y);
    const minY  = Math.min(...allYs);
    const maxY  = Math.max(...allYs);
    // When all lines share the same y (e.g., test mocks or flat OCR), skip y-filter
    const ySpread = maxY - minY;
    const topThreshold = ySpread > 5 ? maxY * 0.5 : Infinity;

    const candidates = lines
      .filter(l => {
        if (l.y > topThreshold)              return false;
        if (isHeaderNoise(l.text))           return false;
        if (/\d{3,}/.test(l.text))           return false;
        if (/[:\-]/.test(l.text))            return false;
        if (/^class\b/i.test(l.text))        return false;
        return nameScore(l.text) > 0.4;
      })
      .sort((a, b) => b.y - a.y);

    if (candidates.length > 0) {
      // Try to combine adjacent candidate pairs (last name + first name on consecutive lines)
      // DL pattern: single-word last name line followed by multi-word first name line
      if (candidates.length >= 2) {
        let bestCombined: { value: string; confidence: number } | null = null;
        for (let ci = 0; ci < candidates.length; ci++) {
          const cand = candidates[ci];
          const candIdx = lines.indexOf(cand);

          // Check PREVIOUS line (last name above first name)
          const prev = candIdx > 0 ? lines[candIdx - 1] : null;
          if (prev && !isHeaderNoise(prev.text) && !/\d{3,}/.test(prev.text) &&
              nameScore(prev.text) > 0.2) {
            const combined = sanitizeName(`${sanitizeName(cand.text.trim())} ${prev.text.trim()}`);
            if (nameScore(combined) > 0.5 &&
                (!bestCombined || nameScore(combined) > nameScore(bestCombined.value))) {
              bestCombined = {
                value:      combined,
                confidence: (cand.confidence + prev.confidence) / 2,
              };
            }
          }

          // Check NEXT line (first name above last name)
          const next = candIdx + 1 < lines.length ? lines[candIdx + 1] : null;
          if (next && !isHeaderNoise(next.text) && !/\d{3,}/.test(next.text) &&
              nameScore(next.text) > 0.2) {
            const combined = sanitizeName(`${next.text.trim()} ${sanitizeName(cand.text.trim())}`);
            if (nameScore(combined) > 0.5 &&
                (!bestCombined || nameScore(combined) > nameScore(bestCombined.value))) {
              bestCombined = {
                value:      combined,
                confidence: (cand.confidence + next.confidence) / 2,
              };
            }
          }
        }
        if (bestCombined) return bestCombined;
      }

      // Single best candidate
      const best = candidates.sort((a, b) => nameScore(b.text) - nameScore(a.text))[0];
      const cleaned = sanitizeName(best.text.trim());
      if (nameScore(cleaned) > 0.4) {
        return { value: cleaned, confidence: best.confidence };
      }
    }

    return null;
  }

  private extractNameFromLine(
    labelLine:  FlatLine & { lineIndex: number },
    lines:      FlatLine[],
    labelRegex: RegExp,
  ): string {
    const afterLabel = this.valueAfterLabel(labelLine.text, labelRegex);
    if (afterLabel && nameScore(afterLabel) > 0.2) return afterLabel.trim();

    const nextText = this.nextLineText(lines, labelLine.lineIndex);
    if (nextText && nameScore(nextText) > 0.2) return nextText.trim();

    return '';
  }

  // ── DOB extraction ─────────────────────────────────────────

  private extractDobFromLines(
    lines:    FlatLine[],
    labelMap: Map<string, FlatLine & { lineIndex: number }>,
  ): { value: string; confidence: number } | null {

    const dobLabelLine = labelMap.get('dob');

    // Strategy A: Value on same line as DOB label
    if (dobLabelLine) {
      // Handle both "DOB 09/29/1979" and "DOB09/29/1979" (no space)
      const afterLabel = this.valueAfterLabel(dobLabelLine.text, /(?:\bDOB\b|DOB(?=\d)|DATE\s*OF\s*BIRTH|BIRTH\s*DATE|\bBORN\b)/i);
      if (afterLabel) {
        const dates = findAllDates(afterLabel);
        if (dates.length > 0) {
          return { value: dates[0], confidence: dobLabelLine.confidence };
        }
      }

      // Strategy B: Next line after DOB label
      const nextText = this.nextLineText(lines, dobLabelLine.lineIndex);
      if (nextText) {
        const dates = findAllDates(nextText);
        if (dates.length > 0) {
          return { value: dates[0], confidence: dobLabelLine.confidence };
        }
      }
    }

    // Strategy C: Look for lines where DOB label + date on same row
    for (const line of lines) {
      if (!/D[O0]B/i.test(line.text)) continue;
      const allDates = findAllDates(line.text);
      if (allDates.length >= 1) {
        return { value: allDates[0], confidence: line.confidence };
      }
    }

    // Strategy D: Scan for a date preceded by a DOB-like label (with or without separator)
    for (const line of lines) {
      const m = line.text.match(/(?:D[O0]B|BIRTH|BORN)[:\s]*(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/i);
      if (m) {
        return {
          value:      standardizeDateFormat(m[1]),
          confidence: line.confidence,
        };
      }
    }

    return null;
  }

  // ── Expiry extraction ──────────────────────────────────────

  private extractExpiryFromLines(
    lines:    FlatLine[],
    labelMap: Map<string, FlatLine & { lineIndex: number }>,
  ): { value: string; confidence: number } | null {

    const expLabelLine = labelMap.get('expiry');

    if (expLabelLine) {
      const afterLabel = this.valueAfterLabel(
        expLabelLine.text,
        /\b(?:EXP(?:IRY|IRES)?|EXPIRATION|VALID\s*UNTIL)\b/i,
      );
      if (afterLabel) {
        const dates = findAllDates(afterLabel);
        if (dates.length > 0) {
          // If multiple dates (issue + expiry on same line), take the LAST
          return {
            value:      dates[dates.length - 1],
            confidence: expLabelLine.confidence,
          };
        }
      }

      const nextText = this.nextLineText(lines, expLabelLine.lineIndex);
      if (nextText) {
        const dates = findAllDates(nextText);
        if (dates.length > 0) {
          return { value: dates[dates.length - 1], confidence: expLabelLine.confidence };
        }
      }
    }

    // Look for lines with both issue + expiry dates
    for (const line of lines) {
      if (!/\b(?:EXP|EXPIR)/i.test(line.text)) continue;
      const allDates = findAllDates(line.text);
      if (allDates.length >= 2) {
        const sorted = allDates.sort();
        return { value: sorted[sorted.length - 1], confidence: line.confidence };
      }
      if (allDates.length === 1) {
        return { value: allDates[0], confidence: line.confidence };
      }
    }

    // Fallback: scan for explicit EXP label + date
    for (const line of lines) {
      const m = line.text.match(/EXP(?:IRY|IRES)?[:\s]+(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/i);
      if (m) {
        return {
          value:      standardizeDateFormat(m[1]),
          confidence: line.confidence,
        };
      }
    }

    return null;
  }

  // ── Address extraction ─────────────────────────────────────

  private extractAddress(
    lines:    FlatLine[],
    labelMap: Map<string, FlatLine & { lineIndex: number }>,
  ): { value: string; confidence: number } | null {
    // City/state pattern: "CITY ST 12345" or "CITY, ST 12345" (with optional AAMVA prefix, leading whitespace)
    const CITY_STATE_RE = /[A-Z][A-Z\s]+,?\s+[A-Z]{2}[,\s]+\d{5}/;
    const normalizeAddr = (s: string) =>
      s.replace(/^[89]\s+/, '')        // strip AAMVA "8"/"9" prefix from city line
       .replace(/,/g, ' ')
       .replace(/\s+/g, ' ')
       .trim();

    // Helper: look up to 3 lines ahead from startIdx for a city/state line
    // (handles APT/UNIT lines between street and city)
    const findCityLine = (startIdx: number): string | null => {
      for (let offset = 1; offset <= 3 && startIdx + offset < lines.length; offset++) {
        const candidate = lines[startIdx + offset].text.trim().replace(/^[89]\s+/, '');
        if (CITY_STATE_RE.test(candidate)) return candidate;
      }
      return null;
    };

    // Strategy A: Label-based ("Address: value" or AAMVA "8 street...")
    const labelLine = labelMap.get('address');
    if (labelLine) {
      // Try text-based label first ("Address: value")
      const afterLabel = this.valueAfterLabel(labelLine.text, /\bADDR(?:ESS)?\b/i);
      if (afterLabel && afterLabel.length > 5) {
        let address = afterLabel;
        const city = findCityLine(labelLine.lineIndex);
        if (city) address += ' ' + city;
        return { value: normalizeAddr(address), confidence: labelLine.confidence };
      }

      // Try AAMVA "8" prefix: strip "8 " and use remaining as street
      const aamvaM = labelLine.text.match(/^8\s+(.+)/);
      if (aamvaM) {
        const aamvaVal = aamvaM[1].trim();
        // If value after "8" is just a label ("Address", "Address R"), look at next line instead
        const isLabel = /\baddr(?:ess)?\b/i.test(aamvaVal);
        if (!isLabel && aamvaVal.length > 5) {
          let address = aamvaVal;
          const city = findCityLine(labelLine.lineIndex);
          if (city) address += ' ' + city;
          return { value: normalizeAddr(address), confidence: labelLine.confidence };
        }
        // AAMVA "8 Address" label — value is on next line(s)
        if (isLabel) {
          const streetLine = lines[labelLine.lineIndex + 1];
          if (streetLine && streetLine.text.trim().length > 5) {
            let address = streetLine.text.trim();
            const city = findCityLine(labelLine.lineIndex + 1);
            if (city) address += ' ' + city;
            return { value: normalizeAddr(address), confidence: streetLine.confidence };
          }
        }
      }

      // Value on next line
      const nextText = this.nextLineText(lines, labelLine.lineIndex);
      if (nextText && nextText.length > 5) {
        let address = nextText;
        const city = findCityLine(labelLine.lineIndex + 1);
        if (city) address += ' ' + city;
        return { value: normalizeAddr(address), confidence: labelLine.confidence };
      }
    }

    // Strategy B: Line matching street address pattern
    const STREET_SUFFIXES = /\b(?:ST(?:REET)?|AVE(?:NUE)?|BLVD|BOULEVARD|DR(?:IVE)?|RD|ROAD|LN|LANE|WAY|CT|COURT|PL(?:ACE)?|TER(?:RACE)?|CIR(?:CLE)?|HWY|HIGHWAY|PKWY|PARKWAY|SQ(?:UARE)?|TPKE|TURNPIKE|TRL|TRAIL)\b/i;
    const addrLines: FlatLine[] = [];

    for (const line of lines) {
      // Match normal "123 MAIN ST" or strip AAMVA "8" prefix first
      const text = line.text.replace(/^8\s+/, '');
      if (/^\d{1,5}\s+[A-Z]/.test(text) && STREET_SUFFIXES.test(text)) {
        addrLines.push(line);
      }
    }

    if (addrLines.length === 0) return null;

    // Try to join multi-line addresses (city/state line follows street line)
    const firstLine = addrLines[0];
    const firstIdx  = lines.indexOf(firstLine);

    let address = firstLine.text.replace(/^8\s+/, '');
    const city = findCityLine(firstIdx);
    if (city) address += ' ' + city;

    return { value: normalizeAddr(address), confidence: firstLine.confidence };
  }

  // ── Physical descriptors ───────────────────────────────────

  private extractPhysicalDescriptors(lines: FlatLine[], ocrData: OCRData): void {
    for (const line of lines) {
      const text = line.text;

      // Sex — look for SEX/GENDER label + M/F value
      if (!ocrData.sex) {
        const sexM = text.match(/\b(?:SEX|GENDER)\s*[:\s]\s*([MF])\b/i)
          ?? text.match(/\bSEX\s+([MF])\b/i);
        if (sexM) {
          ocrData.sex = sexM[1].toUpperCase();
          ocrData.confidence_scores!.sex = line.confidence;
        }
      }

      // Height — "5'-09"", "5'9"", "5-09", "509"
      if (!ocrData.height) {
        const htM = text.match(/(?:HGT|HT|HEIGHT)\s*[:\s]*(\d\s*['′\-]\s*\d{1,2}["″]?)/i)
          ?? text.match(/\b(\d['′]\s*-?\s*\d{2}["″]?)\b/);
        if (htM) {
          ocrData.height = htM[1].replace(/\s+/g, '');
          ocrData.confidence_scores!.height = line.confidence;
        }
      }

      // Eye color
      if (!ocrData.eye_color) {
        const eyeM = text.match(/\bEYES?\s*[:\s]*([A-Z]{2,4})\b/i);
        if (eyeM && !DL_FIELD_TOKENS.has(eyeM[1].toLowerCase())) {
          ocrData.eye_color = eyeM[1].toUpperCase();
          ocrData.confidence_scores!.eye_color = line.confidence;
        }
      }
    }

    // Second pass: cross-line sex — label on one line, M/F value on next
    if (!ocrData.sex) {
      for (let i = 0; i < lines.length - 1; i++) {
        if (/\b(?:SEX|GENDER)\b/i.test(lines[i].text)) {
          const nextText = lines[i + 1].text;
          const m = nextText.match(/^\s*([MF])\b/i);
          if (m) {
            ocrData.sex = m[1].toUpperCase();
            ocrData.confidence_scores!.sex = lines[i + 1].confidence;
            break;
          }
        }
      }
    }
  }

  // ── Shared helpers ─────────────────────────────────────────

  /** Check if a value looks like a label fragment, noise, or non-name text */
  private isLabelOrNoise(value: string): boolean {
    const v = value.trim();
    // Pure numbers or very short
    if (/^\d+$/.test(v) || v.length < 2) return true;
    // Starts with "/" (bilingual label remnant like "/surname")
    if (v.startsWith('/')) return true;
    // Known label fragments
    if (/\b(surname|given\s*name|first\s*name|last\s*name|family\s*name|date\s*of\s*birth|nationality|passport|card\s*no|document|expiry|number)\b/i.test(v)) return true;
    // Passport/card field markers (e.g., "***" or "* text *")
    if (/^\*+/.test(v)) return true;
    return false;
  }

  /** Extract text appearing after a label match on the same line */
  private valueAfterLabel(text: string, labelRegex: RegExp): string | null {
    const m = text.match(labelRegex);
    if (!m) return null;
    const after = text.slice(m.index! + m[0].length).replace(/^[\s:\-\.]+/, '').trim();
    return after.length > 0 ? after : null;
  }

  /** Get the text of the line at index + 1 */
  private nextLineText(lines: FlatLine[], idx: number): string | null {
    if (idx + 1 >= lines.length) return null;
    const t = lines[idx + 1].text.trim();
    return t.length > 0 ? t : null;
  }

  // ── Passport / National ID / Generic ──────────────────────

  private extractPassportData(lines: RecognitionResult[][], ocrData: OCRData): void {
    const flatLines = this.flattenLines(lines);

    // Extract name: try separate surname + given name, then fall back
    {
      let surname = '';
      let givenName = '';
      let nameConf = 0;
      this.findField(flatLines, [/surname/i, /family\s*name/i, /last\s*name/i], (value, conf) => {
        if (!isHeaderNoise(value) && !SPECIMEN_LABELS.test(value) && !this.isLabelOrNoise(value)) {
          surname = value;
          nameConf = Math.max(nameConf, conf);
          return; // accepted
        }
        return false; // rejected — keep searching
      });
      this.findField(flatLines, [/given\s*names?/i, /first\s*name/i, /forename/i], (value, conf) => {
        if (!isHeaderNoise(value) && !SPECIMEN_LABELS.test(value) && !this.isLabelOrNoise(value)) {
          givenName = value;
          nameConf = Math.max(nameConf, conf);
          return; // accepted
        }
        return false; // rejected — keep searching
      });

      if (surname || givenName) {
        // Clean each name part: remove leading digits, single-char noise words
        const cleanName = (s: string) =>
          s.replace(/^\d+\s+/, '')  // leading digits ("3 HAPPY" → "HAPPY")
           .split(/\s+/)
           .filter(w => w.length > 1 || /^[A-Z]$/i.test(w) && false) // remove single chars
           .join(' ');
        const cleanedGiven = cleanName(givenName);
        const cleanedSurname = cleanName(surname);
        ocrData.name = [cleanedGiven, cleanedSurname].filter(Boolean).join(' ');
        ocrData.confidence_scores!.name = nameConf;
      } else {
        // Fall back to generic name pattern
        this.findField(flatLines, [/name/i], (value, conf) => {
          if (!isHeaderNoise(value) && !SPECIMEN_LABELS.test(value) && !this.isLabelOrNoise(value)) {
            ocrData.name = value;
            ocrData.confidence_scores!.name = conf;
            return;
          }
          return false;
        });
      }
    }

    this.findDateField(flatLines, [/date\s*of\s*birth/i, /birth/i, /dob/i], (value, conf) => {
      ocrData.date_of_birth = value;
      ocrData.confidence_scores!.date_of_birth = conf;
    });

    this.findField(flatLines, [/passport\s*no/i, /card\s*no/i, /document\s*no/i, /number/i], (value, conf) => {
      const cleaned = value.replace(/\s+/g, '');
      // Passport: 9 alphanumeric; Passport card: letter + 8 digits
      if (/^[A-Z0-9]{6,9}$/i.test(cleaned) || /^[A-Z]\d{8}$/i.test(cleaned)) {
        ocrData.document_number = cleaned;
        ocrData.confidence_scores!.document_number = conf;
      }
    });

    // Fallback: scan for passport card number (letter + 8 digits) if not found
    if (!ocrData.document_number) {
      for (const line of flatLines) {
        const m = line.text.match(/\b([A-Z]\d{8})\b/);
        if (m) {
          ocrData.document_number = m[1];
          ocrData.confidence_scores!.document_number = line.confidence;
          break;
        }
      }
    }

    this.findLastDateField(flatLines, [/date\s*of\s*expiry/i, /expiry/i, /expires/i, /exp/i], (value, conf) => {
      ocrData.expiration_date = disambiguateExpiryDate(value);
      ocrData.confidence_scores!.expiration_date = conf;
    });

    this.findField(flatLines, [/nationality/i], (value, conf) => {
      // Filter out values that look like labels or noise
      const cleaned = value.replace(/^\*+\s*/, '').trim();
      if (cleaned.length >= 2 && !this.isLabelOrNoise(cleaned) && !/\*/.test(cleaned)) {
        // If value contains mixed content (e.g., "USA C03005988"), take only the alpha part
        const alphaOnly = cleaned.match(/^([A-Z]{2,})\b/i);
        ocrData.nationality = alphaOnly ? alphaOnly[1] : cleaned;
        ocrData.confidence_scores!.nationality = conf;
        return;
      }
      return false;
    });

    // Extract sex from passport/passport card
    if (!ocrData.sex) {
      // Try same-line first
      for (const line of flatLines) {
        const sexM = line.text.match(/\b(?:SEX|GENDER)\s*[:\s\/]\s*([MF])\b/i)
          ?? line.text.match(/\bSEX\s+([MF])\b/i);
        if (sexM) {
          ocrData.sex = sexM[1].toUpperCase();
          ocrData.confidence_scores!.sex = line.confidence;
          break;
        }
      }
      // Fallback: "Sex" label on one line, M/F at start of next line
      if (!ocrData.sex) {
        for (let i = 0; i < flatLines.length; i++) {
          if (/\bSEX\b/i.test(flatLines[i].text) && i + 1 < flatLines.length) {
            const nextM = flatLines[i + 1].text.match(/^([MF])\b/);
            if (nextM) {
              ocrData.sex = nextM[1].toUpperCase();
              ocrData.confidence_scores!.sex = flatLines[i + 1].confidence;
              break;
            }
          }
        }
      }
    }
  }

  private extractNationalIdData(lines: RecognitionResult[][], ocrData: OCRData): void {
    const flatLines = this.flattenLines(lines);
    const fullText  = flatLines.map(l => l.text).join(' ');

    if (/driver\s*license|driver'?s?\s*lic/i.test(fullText) || /\bDLn?\b/i.test(fullText)) {
      return this.extractDriversLicenseData(lines, ocrData);
    }

    this.findField(flatLines, [/full\s*name/i, /\bname\b/i], (value, conf) => {
      if (!isHeaderNoise(value)) {
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
    this.findDateField(flatLines, [/expiry/i, /expires/i, /valid\s*until/i, /\bexp\b/i], (value, conf) => {
      ocrData.expiration_date = disambiguateExpiryDate(value);
      ocrData.confidence_scores!.expiration_date = conf;
    });

    this.findField(flatLines, [/issued\s*by/i, /issuing\s*authority/i, /authority/i], (value, conf) => {
      ocrData.issuing_authority = value;
      ocrData.confidence_scores!.issuing_authority = conf;
    });
  }

  /**
   * International document extraction using country-specific format registry.
   * Uses localized field labels from the format definition.
   */
  private extractInternationalDocument(
    lines: RecognitionResult[][],
    ocrData: OCRData,
    format: CountryDocFormat,
    country: string,
  ): void {
    const flatLines = this.flattenLines(lines);
    const labels = format.field_labels;

    logger.info('PaddleOCR international extraction', {
      country,
      documentType: format.type,
      dateFormat: format.date_format,
      lineCount: flatLines.length,
    });

    // EU DL numbered-field format: use specialized parser
    if (this.isEUDriversLicense(flatLines, format)) {
      this.extractEUDriversLicenseData(flatLines, ocrData, format);
      ocrData.issuing_country = country;
      return;
    }

    // Extract name: try separate surname + given name, then fall back to combined label
    {
      let surname = '';
      let givenName = '';
      let nameConf = 0;
      // Filter patterns by their regex source to split surname vs given
      // Use word-boundary-aware matching to avoid "mbiemri" matching the "emri" given filter
      const surnamePatterns = labels.name.filter(p => /surname|family|last|appell|cognom|nachnam|achternaam|^mbiemri/i.test(p.source));
      const givenPatterns = labels.name.filter(p => /given|first|prénom|vornam|voornaam|^emri$/i.test(p.source));

      if (surnamePatterns.length > 0) {
        this.findField(flatLines, surnamePatterns, (value, conf) => {
          if (!isHeaderNoise(value) && !SPECIMEN_LABELS.test(value) && !this.isLabelOrNoise(value)) {
            surname = value;
            nameConf = Math.max(nameConf, conf);
            return; // accepted
          }
          return false; // rejected — keep searching
        });
      }
      if (givenPatterns.length > 0) {
        this.findField(flatLines, givenPatterns, (value, conf) => {
          if (!isHeaderNoise(value) && !SPECIMEN_LABELS.test(value) && !this.isLabelOrNoise(value)) {
            givenName = value;
            nameConf = Math.max(nameConf, conf);
            return; // accepted
          }
          return false; // rejected — keep searching
        });
      }

      if (surname || givenName) {
        ocrData.name = [givenName, surname].filter(Boolean).join(' ');
        ocrData.confidence_scores!.name = nameConf;
      } else {
        // Fall back to combined name patterns
        this.findField(flatLines, labels.name, (value, conf) => {
          if (!isHeaderNoise(value) && !SPECIMEN_LABELS.test(value) && !this.isLabelOrNoise(value)) {
            ocrData.name = value;
            ocrData.confidence_scores!.name = conf;
            return;
          }
          return false;
        });
      }
    }

    // Extract date of birth with country date format hint
    this.findDateField(flatLines, labels.date_of_birth, (value, conf) => {
      ocrData.date_of_birth = this.normalizeDateWithHint(value, format.date_format);
      ocrData.confidence_scores!.date_of_birth = conf;
    });

    // Extract ID number
    this.findField(flatLines, labels.id_number, (value, conf) => {
      const cleaned = value.replace(/\s+/g, '');
      if (/^[A-Z0-9\-]{4,15}$/i.test(cleaned) && !this.isLabelOrNoise(cleaned) && /\d/.test(cleaned)) {
        ocrData.document_number = cleaned;
        ocrData.confidence_scores!.document_number = conf;
        return;
      }
      // Try to extract an ID-like token from the value (handles concatenated text)
      const idM = value.match(/\b([A-Z]\d{7,12}[A-Z0-9]?)\b/i) ?? value.match(/\b(\d{6,12})\b/);
      if (idM) {
        ocrData.document_number = idM[1];
        ocrData.confidence_scores!.document_number = conf * 0.9;
        return;
      }
      return false;
    });

    // Extract expiry date — use findLastDateField to disambiguate issue vs expiry
    this.findLastDateField(flatLines, labels.expiry_date, (value, conf) => {
      ocrData.expiration_date = this.normalizeDateWithHint(value, format.date_format);
      ocrData.confidence_scores!.expiration_date = conf;
    });

    // Extract nationality
    this.findField(flatLines, labels.nationality, (value, conf) => {
      let cleaned = value.replace(/^\*+\s*/, '').replace(/\s*\*+$/, '').trim();
      // Strip trailing numbers/IDs (e.g., "Shqiptare/Albanian 200000907" → "Shqiptare/Albanian")
      cleaned = cleaned.replace(/\s+\d{5,}$/, '').trim();
      // For bilingual values like "Shqiptare/Albanian", take the English part (after /)
      const slashParts = cleaned.split('/');
      if (slashParts.length === 2 && slashParts[1].trim().length >= 2) {
        cleaned = slashParts[1].trim();
      }
      if (cleaned.length >= 2 && cleaned.length <= 30 && !this.isLabelOrNoise(cleaned)) {
        ocrData.nationality = cleaned;
        ocrData.confidence_scores!.nationality = conf;
        return;
      }
      return false;
    });

    // Extract address
    this.findField(flatLines, labels.address, (value, conf) => {
      ocrData.address = value;
      ocrData.confidence_scores!.address = conf;
    });

    // Extract issuing authority
    this.findField(flatLines, labels.issuing_authority, (value, conf) => {
      ocrData.issuing_authority = value;
      ocrData.confidence_scores!.issuing_authority = conf;
    });

    // Extract sex
    if (!ocrData.sex) {
      for (const line of flatLines) {
        const sexM = line.text.match(/\b(?:SEX|GENDER|GJINIA|SEXE|GESCHLECHT|SESSO)\s*[:\s\/]\s*([MFmf])\b/i)
          ?? line.text.match(/\b(?:SEX|GJINIA)\s+([MF])\b/i);
        if (sexM) {
          ocrData.sex = sexM[1].toUpperCase();
          ocrData.confidence_scores!.sex = line.confidence;
          break;
        }
      }
    }

    ocrData.issuing_country = country;
  }

  /**
   * Normalize date with a format hint (DMY, MDY, YMD).
   * Resolves ambiguous dates like 01/02/2020 using the country's convention.
   */
  private normalizeDateWithHint(dateStr: string, hint: 'DMY' | 'MDY' | 'YMD'): string {
    // Handle month-name dates first (e.g., "1 JAN 1981")
    const monthNameResult = parseMonthNameDate(dateStr);
    if (monthNameResult) return monthNameResult;

    const m = dateStr.match(/(\d{1,4})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})/);
    if (!m) return dateStr;

    let [, p1, p2, p3] = m;

    // If p1 is 4 digits, it's YYYY-MM-DD regardless of hint
    if (p1.length === 4) return `${p1}-${p2.padStart(2, '0')}-${p3.padStart(2, '0')}`;

    // Expand 2-digit year — position depends on hint
    if (hint === 'YMD' && p1.length === 2) {
      const yy = parseInt(p1);
      p1 = String(yy > 30 ? 1900 + yy : 2000 + yy);
    } else if (p3.length === 2) {
      const yy = parseInt(p3);
      p3 = String(yy > 30 ? 1900 + yy : 2000 + yy);
    }

    switch (hint) {
      case 'DMY': return `${p3}-${p2.padStart(2, '0')}-${p1.padStart(2, '0')}`;
      case 'MDY': return `${p3}-${p1.padStart(2, '0')}-${p2.padStart(2, '0')}`;
      case 'YMD': return `${p1}-${p2.padStart(2, '0')}-${p3.padStart(2, '0')}`;
    }
  }

  // ── EU Driving License numbered-field extraction ────────────

  private static EU_DL_HEADER = /FÜHRERSCHEIN|F(?:Ü|U)HRERSCHEIN|PERMIS\s*DE\s*CONDUIRE|DRIVING\s*LICEN[CS]E|PATENTE|RIJBEWIJS|CARTA\s*DE\s*CONDU[CÇ][AÃ]O|PERMISO\s*DE\s*CONDUCIR|KÖRKORT|AJOKORTTI|PRAWO\s*JAZDY|ŘIDIČSKÝ\s*PRŮKAZ|VODIČSKÝ\s*PREUKAZ/i;

  /** Detect whether the document is an EU-style numbered driving license */
  private isEUDriversLicense(flatLines: FlatLine[], format: CountryDocFormat): boolean {
    if (format.type !== 'drivers_license') return false;
    const fullText = flatLines.map(l => l.text).join(' ');
    // Check for EU DL header keywords
    if (PaddleOCRProvider.EU_DL_HEADER.test(fullText)) return true;
    // Check for numbered field pattern: at least 2 lines starting with "N." or "Na."
    let numberedCount = 0;
    for (const line of flatLines) {
      if (/^\s*(\d[abc]?)[\.\s]\s*.+/.test(line.text)) numberedCount++;
    }
    return numberedCount >= 3;
  }

  /**
   * Extract fields from EU DL using numbered field prefixes (1., 2., 3., 4a., 4b., 5.)
   * per EU Directive 2006/126/EC.
   */
  private extractEUDriversLicenseData(
    flatLines: FlatLine[],
    ocrData: OCRData,
    format: CountryDocFormat,
  ): void {
    const fields = new Map<string, string>();

    for (const line of flatLines) {
      // Match patterns like "1. Mustermann", "4b. 01.01.2030", "4b 01.01.2030", "3 12.08.64"
      // Try anchored match first (most reliable)
      const m = line.text.match(/^\s*(\d[abc]?)[\.\s]\s*(.+)/);
      if (m) {
        const fieldNum = m[1].toLowerCase();
        const value = m[2].trim();
        if (!fields.has(fieldNum) && value.length > 0) {
          fields.set(fieldNum, value);
        }
      }
      // Also try mid-line match for field 1 (surname) — handles specimen watermarks like "***** * 1 Mustermann 20"
      if (!fields.has('1')) {
        const m1 = line.text.match(/\b1[\.\s]\s*([A-Z][A-Za-zÀ-ÖØ-öø-ÿ\-'\s]+)/);
        if (m1) {
          const val = m1[1].trim();
          if (val.length >= 2 && !SPECIMEN_LABELS.test(val)) {
            fields.set('1', val);
          }
        }
      }
    }

    logger.info('EU DL numbered fields extracted', { fields: Object.fromEntries(fields) });

    // Helper: strip trailing date patterns and numbers from name values
    const stripTrailingNoise = (s: string) =>
      s.replace(/\s+\d{1,2}[\.\-\/]\d{1,2}[\.\-\/]\d{2,4}.*$/, '')  // trailing dates
       .replace(/\s+\d{2,}$/, '')                                     // trailing numbers
       .trim();

    // 1. Surname + 2. Given name → combined name
    const surname = stripTrailingNoise(fields.get('1') ?? '');
    const givenName = stripTrailingNoise(fields.get('2') ?? '');
    if (surname || givenName) {
      const name = [givenName, surname].filter(Boolean).join(' ');
      if (!SPECIMEN_LABELS.test(name)) {
        ocrData.name = name;
        ocrData.confidence_scores!.name = 0.9;
      }
    }

    // 3. Date of birth — extract just the date portion
    const dobRaw = fields.get('3');
    if (dobRaw) {
      const dob = this.normalizeDateWithHint(dobRaw, format.date_format)
        ?? this.extractDate(dobRaw);
      if (dob) {
        ocrData.date_of_birth = dob;
        ocrData.confidence_scores!.date_of_birth = 0.9;
      }
    }

    // 4b. Expiry date — extract date, and also look for license number after it
    const expiryRaw = fields.get('4b');
    if (expiryRaw) {
      const expiry = this.normalizeDateWithHint(expiryRaw, format.date_format)
        ?? this.extractDate(expiryRaw);
      if (expiry) {
        ocrData.expiration_date = expiry;
        ocrData.confidence_scores!.expiration_date = 0.9;
      }
    }

    // 4c. Issuing authority
    const authority = fields.get('4c');
    if (authority) {
      ocrData.issuing_authority = authority;
      ocrData.confidence_scores!.issuing_authority = 0.9;
    }

    // 5. License number
    const licNum = fields.get('5');
    if (licNum) {
      const cleaned = licNum.replace(/\s+/g, '');
      if (/^[A-Z0-9]{4,20}$/i.test(cleaned)) {
        ocrData.document_number = cleaned;
        ocrData.confidence_scores!.document_number = 0.9;
      }
    }

    // Fallback: if no field 5. found, try to extract license number from 4b line
    // (OCR often concatenates "4b.21.01.30 B072RRE2I55" as one line)
    if (!ocrData.document_number && expiryRaw) {
      // Look for alphanumeric token after the date in field 4b
      const afterDate = expiryRaw.replace(/^\d{1,2}[\.\-\/]\d{1,2}[\.\-\/]\d{2,4}\s*/, '');
      const docM = afterDate.match(/\b([A-Z0-9]{6,15})\b/i);
      if (docM && /[A-Z]/i.test(docM[1]) && /\d/.test(docM[1])) {
        ocrData.document_number = docM[1];
        ocrData.confidence_scores!.document_number = 0.85;
      }
    }

    // 9. Vehicle categories (informational, not stored but could be useful)
    // Additional: sex field if present in text
    for (const line of flatLines) {
      if (!ocrData.sex) {
        const sexM = line.text.match(/\b(?:SEX|GESCHLECHT|SEXE)\s*[:\s]\s*([MFmf])\b/i)
          ?? line.text.match(/\b([MF])\s*$/);
        if (sexM) {
          ocrData.sex = sexM[1].toUpperCase();
          ocrData.confidence_scores!.sex = 0.85;
        }
      }
    }
  }

  private extractGenericData(lines: RecognitionResult[][], ocrData: OCRData): void {
    const flatLines = this.flattenLines(lines);

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
      ocrData.expiration_date = disambiguateExpiryDate(value);
      ocrData.confidence_scores!.expiration_date = conf;
    });
  }

  // ── Shared field finders (used by passport/national_id/generic) ──

  private findField(
    lines:    Array<{ text: string; confidence: number }>,
    patterns: RegExp[],
    onMatch:  (value: string, confidence: number) => boolean | void,
  ): void {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      for (const pattern of patterns) {
        const match = line.text.match(pattern);
        if (!match) continue;

        const parts = line.text.split(/[:\-]\s*/);
        if (parts.length >= 2) {
          const value = parts.slice(1).join(':').trim();
          if (value.length > 0 && onMatch(value, line.confidence) !== false) return;
        }

        const afterLabel = line.text.slice(match.index! + match[0].length).trim();
        if (afterLabel.length > 0 && onMatch(afterLabel, line.confidence) !== false) return;

        // Try next line, then one more if the first was rejected
        for (let offset = 1; offset <= 2 && i + offset < lines.length; offset++) {
          const nextLine = lines[i + offset];
          if (nextLine.text.trim().length > 0 &&
              onMatch(nextLine.text.trim(), nextLine.confidence) !== false) return;
        }
      }
    }
  }

  private findDateField(
    lines:    Array<{ text: string; confidence: number }>,
    patterns: RegExp[],
    onMatch:  (value: string, confidence: number) => void,
  ): void {
    this.findField(lines, patterns, (value, conf) => {
      const dateStr = this.extractDate(value);
      if (dateStr) { onMatch(dateStr, conf); return; }
      return false;
    });
  }

  private extractDate(text: string): string | null {
    // Try month-name dates first (e.g., "1 JAN 1981")
    const monthName = parseMonthNameDate(text);
    if (monthName) return monthName;
    // Numeric dates (e.g., "01/01/1981")
    const m = text.match(/(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})/);
    return m ? standardizeDateFormat(m[0]) : null;
  }

  /**
   * Like findDateField(), but picks the LAST date found in the matched region.
   * Useful for expiry extraction where issue and expiry dates may appear
   * side-by-side on the same line or adjacent lines.
   */
  private findLastDateField(
    lines:    Array<{ text: string; confidence: number }>,
    patterns: RegExp[],
    onMatch:  (value: string, confidence: number) => void,
  ): void {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      for (const pattern of patterns) {
        const match = line.text.match(pattern);
        if (!match) continue;

        // Collect dates from the matched line + the next line
        const textToSearch = line.text.slice(match.index! + match[0].length);
        const nextText = (i + 1 < lines.length) ? lines[i + 1].text : '';
        const combined = textToSearch + ' ' + nextText;

        const dates = findAllDates(combined);
        if (dates.length > 0) {
          // Pick the last (chronologically latest) date
          const sorted = [...dates].sort();
          onMatch(sorted[sorted.length - 1], line.confidence);
          return;
        }
      }
    }
  }
}
