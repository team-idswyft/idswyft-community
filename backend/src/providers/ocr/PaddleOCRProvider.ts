import {
  PaddleOcrService,
  type PaddleOcrResult,
  type RecognitionResult,
} from 'ppu-paddle-ocr';
import { OCRProvider } from '../types.js';
import { OCRData } from '../../types/index.js';
import { logger } from '@/utils/logger.js';

// ── Types ─────────────────────────────────────────────────────

interface FlatLine {
  text:       string;
  confidence: number;
  y:          number;   // vertical center of bounding box
  x:          number;   // horizontal left edge
  width:      number;   // bounding box width
}

// ── Constants ─────────────────────────────────────────────────

const HEADER_NOISE = new Set([
  'driver license', 'drivers license', "driver's license",
  'driver licence', 'drivers licence', 'identification card',
  'id card', 'identity card', 'passport', 'national id',
  'real id', 'department of motor vehicles', 'dmv',
  'not for federal identification', 'federal limits apply',
  'not for federal purposes', 'not for federal identification purposes',
  'commercial driver license', 'cdl',
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

// ── US State DL Number Formats (reference) ───────────────────
// Comprehensive map of all 50 states + DC DL number formats.
// Used for documentation and optional post-extraction validation.
// Sources: NTSI, AAMVA, state DMV sites, usdl-regex (GitHub).
export const STATE_DL_FORMATS: Record<string, { regex: RegExp; description: string }> = {
  AL: { regex: /^[0-9]{1,8}$/,                                         description: '1-8 digits' },
  AK: { regex: /^[0-9]{1,7}$/,                                         description: '1-7 digits' },
  AZ: { regex: /^([A-Z][0-9]{8}|[0-9]{9})$/,                           description: '1L+8D or 9D' },
  AR: { regex: /^[0-9]{4,9}$/,                                         description: '4-9 digits' },
  CA: { regex: /^[A-Z][0-9]{7}$/,                                      description: '1L+7D' },
  CO: { regex: /^([0-9]{9}|[A-Z][0-9]{3,6}|[A-Z]{2}[0-9]{2,5})$/,     description: '9D or 1L+3-6D or 2L+2-5D' },
  CT: { regex: /^[0-9]{9}$/,                                           description: '9D' },
  DE: { regex: /^[0-9]{1,7}$/,                                         description: '1-7D' },
  FL: { regex: /^[A-Z][0-9]{12}$/,                                     description: '1L+12D' },
  GA: { regex: /^[0-9]{7,9}$/,                                         description: '7-9D' },
  HI: { regex: /^([A-Z][0-9]{8}|[0-9]{9})$/,                           description: '1L+8D or 9D' },
  ID: { regex: /^([A-Z]{2}[0-9]{6}[A-Z]|[0-9]{9})$/,                   description: '2L+6D+1L or 9D' },
  IL: { regex: /^[A-Z][0-9]{11,12}$/,                                  description: '1L+11-12D' },
  IN: { regex: /^([A-Z][0-9]{9}|[0-9]{9,10})$/,                        description: '1L+9D or 9-10D' },
  IA: { regex: /^([0-9]{9}|[0-9]{3}[A-Z]{2}[0-9]{4})$/,                description: '9D or 3D+2L+4D' },
  KS: { regex: /^(K[0-9]{8}|[A-Z][0-9][A-Z][0-9][A-Z]|[0-9]{9})$/,    description: 'K+8D or L-D-L-D-L or 9D' },
  KY: { regex: /^([A-Z][0-9]{8,9}|[0-9]{9})$/,                         description: '1L+8-9D or 9D' },
  LA: { regex: /^[0-9]{1,9}$/,                                         description: '1-9D' },
  ME: { regex: /^([0-9]{7}|[0-9]{7}[A-Z]|[0-9]{8})$/,                  description: '7D or 7D+1L or 8D' },
  MD: { regex: /^[A-Z][0-9]{12}$/,                                     description: '1L+12D' },
  MA: { regex: /^([A-Z][0-9]{8}|[0-9]{9})$/,                           description: '1L+8D or 9D' },
  MI: { regex: /^[A-Z][0-9]{10,12}$/,                                  description: '1L+10-12D' },
  MN: { regex: /^[A-Z][0-9]{12}$/,                                     description: '1L+12D' },
  MS: { regex: /^[0-9]{9}$/,                                           description: '9D' },
  MO: { regex: /^([A-Z][0-9]{5,9}|[A-Z][0-9]{6}R|[0-9]{8}[A-Z]{2}|[0-9]{9}[A-Z]?|[0-9]{3}[A-Z][0-9]{6})$/, description: 'complex — many legacy formats' },
  MT: { regex: /^([A-Z][0-9]{8}|[0-9]{9}|[0-9]{13,14})$/,              description: '1L+8D or 9D or 13-14D' },
  NE: { regex: /^[A-Z][0-9]{6,8}$/,                                    description: '1L+6-8D' },
  NV: { regex: /^([0-9]{9,10}|[0-9]{12}|X[0-9]{8})$/,                  description: '9-10D or 12D or X+8D' },
  NH: { regex: /^([0-9]{2}[A-Z]{3}[0-9]{5}|NH[LNV][0-9]{8})$/,         description: '2D+3L+5D (legacy) or NHL/NHN/NHV+8D' },
  NJ: { regex: /^[A-Z][0-9]{14}$/,                                     description: '1L+14D' },
  NM: { regex: /^[0-9]{8,9}$/,                                         description: '8-9D' },
  NY: { regex: /^([0-9]{9}|[A-Z][0-9]{7}|[0-9]{16}|[0-9]{8})$/,        description: '9D or 1L+7D or 16D or 8D' },
  NC: { regex: /^[0-9]{1,12}$/,                                        description: '1-12D' },
  ND: { regex: /^([A-Z]{3}[0-9]{6}|[0-9]{9})$/,                        description: '3L+6D or 9D' },
  OH: { regex: /^([A-Z][0-9]{4,8}|[A-Z]{2}[0-9]{3,7}|[0-9]{8})$/,     description: '1L+4-8D or 2L+3-7D or 8D' },
  OK: { regex: /^([A-Z][0-9]{9}|[0-9]{9})$/,                           description: '1L+9D or 9D' },
  OR: { regex: /^[0-9]{1,9}$/,                                         description: '1-9D (commonly 7)' },
  PA: { regex: /^[0-9]{8}$/,                                           description: '8D' },
  RI: { regex: /^([0-9]{7}|[A-Z][0-9]{6})$/,                           description: '7D or 1L+6D' },
  SC: { regex: /^[0-9]{5,11}$/,                                        description: '5-11D' },
  SD: { regex: /^([0-9]{6,10}|[0-9]{12})$/,                            description: '6-10D or 12D' },
  TN: { regex: /^[0-9]{7,9}$/,                                         description: '7-9D' },
  TX: { regex: /^[0-9]{7,8}$/,                                         description: '7-8D' },
  UT: { regex: /^[0-9]{4,10}$/,                                        description: '4-10D' },
  VT: { regex: /^([0-9]{8}|[0-9]{7}A)$/,                               description: '8D or 7D+A' },
  VA: { regex: /^([A-Z][0-9]{8,11}|[0-9]{9})$/,                        description: '1L+8-11D or 9D' },
  WA: { regex: /^(WDL[A-Z0-9]{9}|[A-Z*]{1,7}[A-Z0-9*]{5,11})$/,       description: 'WDL+9 (current) or 12-char name-encoded (legacy)' },
  WV: { regex: /^([0-9]{7}|[A-Z]{1,2}[0-9]{5,6})$/,                    description: '7D or 1-2L+5-6D' },
  WI: { regex: /^[A-Z][0-9]{13}$/,                                     description: '1L+13D' },
  WY: { regex: /^[0-9]{9,10}$/,                                        description: '9-10D' },
  DC: { regex: /^([0-9]{7}|[0-9]{9})$/,                                description: '7D or 9D' },
};

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

/** Extract ALL date strings from text */
function findAllDates(text: string): string[] {
  const results: string[] = [];
  const re = /(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const norm = standardizeDateFormat(m[0]);
    if (norm) results.push(norm);
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
    if (t.length === 1)             return false;
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

  async processDocument(buffer: Buffer, documentType: string): Promise<OCRData> {
    const svc         = await this.ensureInitialized();
    const arrayBuffer = new Uint8Array(buffer).buffer;
    const result: PaddleOcrResult = await svc.recognize(arrayBuffer);

    const ocrData: OCRData = {
      raw_text:          result.text,
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

    logger.info('PaddleOCRProvider: extraction result', {
      documentType,
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
        ocrData.expiration_date = exp.value;
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
      ['dl_number',   /(?:4d\b|DLn?\b|DL\s*#|LIC\s*#|LICENSE\s*(?:NO|NUMBER|#)|OPERATOR\s*(?:LICENSE|LIC)\s*(?:NO|#)?|PERMIT\s*NO|CUSTOMER\s*ID|CID\b|ID\s*NO|ID(?=\s*\d)|(?:^|\s)I(?=\d{3}\s*\d{3}))/i],
      ['last_name',   /\b(?:LN|LAST\s*NAME|FAMILY\s*NAME|SURNAME)\b/i],
      ['first_name',  /\b(?:FN|FIRST\s*NAME|GIVEN\s*NAME)\b/i],
      ['full_name',   /\b(?:FULL\s*)?NAME\b/i],
      ['dob',         /(?:\bDOB\b|DOB(?=\d)|DATE\s*OF\s*BIRTH|BIRTH\s*DATE|\bBORN\b|3\s+DATE)/i],
      ['expiry',      /\b(?:EXP(?:IRY|IRES)?|EXPIRATION|VALID\s*UNTIL|4b\b)\b/i],
      ['issued',      /\b(?:ISS(?:UED)?|ISSUE\s*DATE|4a\b)\b/i],
      ['address',     /\bADDR(?:ESS)?\b/i],
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
      // Try full alphanumeric DL number after label (handles states with
      // letter prefix/suffix: CA, NJ, WI, ID, VT, ME, MO, etc.)
      const fullAlphaM = labelLine.text.match(
        /(?:4d\s*)?(?:DLn?|DL\s*#?|LIC\s*#?)\s*([A-Z]{0,3}\d[\dA-Z]{4,14})\b/i,
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
        /(?:LICENSE\s*(?:NO|NUMBER|#)|ID\s*NO\.?|ID(?=\s*\d)|4d|DLn?|DL\s*#?|LIC\s*#?)/i,
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

    // Scan with priority: lines containing "4d" or "DL" label get tried first
    const priorityLines = lines.filter(l =>
      /\b(?:4d|DLn?|DL\s*#|LIC\s*#)\b/i.test(l.text)
    );
    const otherLines = lines.filter(l =>
      !/\b(?:4d|DLn?|DL\s*#|LIC\s*#)\b/i.test(l.text)
    );

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
      /^(?:LICENSE\s*(?:NO|NUMBER|#)|ID\s*NO\.?|ID(?=\s*\d)|4d|DLn?|DL\s*#?|LIC\s*#?)\s*/i, ''
    ).trim();

    // Try matching spaced digit groups first: "793 398 654" → "793398654"
    const spacedM = withoutLabel.match(/^(\d[\d\s]{5,16}\d)/);
    if (spacedM) {
      const collapsed = spacedM[1].replace(/\s/g, '');
      if (collapsed.length >= 6 && collapsed.length <= 15 && !this.looksLikeDate(collapsed)) {
        return collapsed;
      }
    }

    // Must be alphanumeric, 5–15 chars, no date-like pattern
    // (lowered from 6 to 5 to support Kansas alternating format: K1A2B)
    const m = withoutLabel.match(/^([A-Z0-9\-]{5,15})/i);
    if (!m) return null;
    const candidate = m[1].replace(/\-/g, '');
    if (this.looksLikeDate(candidate)) return null;
    if (isHeaderNoise(candidate))      return null;
    // A DL number must contain at least one digit — reject pure-alpha like "Expires"
    if (!/\d/.test(candidate))         return null;
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
      const candidate = this.valueAfterLabel(fullNameLine.text, /(?:FULL\s*)?NAME/i)
        ?? this.nextLineText(lines, fullNameLine.lineIndex);
      if (candidate) {
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
    for (const line of lines) {
      const m = line.text.match(/^[12]\s*([A-Z][A-Z'\-\s]+)$/);
      if (m && nameScore(m[1]) > 0.4) {
        const isLast  = line.text.startsWith('1');
        const partner = lines.find(l =>
          l.y > line.y - 5 && l.y < line.y + 60 &&
          l.text.match(isLast ? /^2\s*[A-Z]/ : /^1\s*[A-Z]/)
        );
        if (partner) {
          const partnerM = partner.text.match(/^[12]\s*([A-Z][A-Z'\-\s]+)$/);
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
      if (!/DOB/i.test(line.text)) continue;
      const allDates = findAllDates(line.text);
      if (allDates.length >= 1) {
        return { value: allDates[0], confidence: line.confidence };
      }
    }

    // Strategy D: Scan for a date preceded by a DOB-like label (with or without separator)
    for (const line of lines) {
      const m = line.text.match(/(?:DOB|BIRTH|BORN)[:\s]*(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/i);
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
    // Strategy A: Label-based ("Address: value")
    const labelLine = labelMap.get('address');
    if (labelLine) {
      const afterLabel = this.valueAfterLabel(labelLine.text, /\bADDR(?:ESS)?\b/i);
      if (afterLabel && afterLabel.length > 5) {
        return { value: afterLabel.replace(/\s+/g, ' ').trim(), confidence: labelLine.confidence };
      }
      const nextText = this.nextLineText(lines, labelLine.lineIndex);
      if (nextText && nextText.length > 5) {
        return { value: nextText.replace(/\s+/g, ' ').trim(), confidence: labelLine.confidence };
      }
    }

    // Strategy B: Line matching street address pattern
    const STREET_SUFFIXES = /\b(?:ST|AVE|BLVD|DR|RD|LN|WAY|CT|PL|TER|CIR|HWY|PKWY|SQ)\b/i;
    const addrLines: FlatLine[] = [];

    for (const line of lines) {
      if (/^\d{1,5}\s+[A-Z]/.test(line.text) && STREET_SUFFIXES.test(line.text)) {
        addrLines.push(line);
      }
    }

    if (addrLines.length === 0) return null;

    // Try to join multi-line addresses (city/state line follows street line)
    const firstLine = addrLines[0];
    const firstIdx  = lines.indexOf(firstLine);
    const cityLine  = lines[firstIdx + 1];

    let address = firstLine.text;
    if (cityLine && /^[A-Z][A-Z\s]+,?\s+[A-Z]{2}\s+\d{5}/.test(cityLine.text)) {
      address += ', ' + cityLine.text;
    }

    return { value: address.replace(/\s+/g, ' ').trim(), confidence: firstLine.confidence };
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
  }

  // ── Shared helpers ─────────────────────────────────────────

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

    this.findField(flatLines, [/name/i, /surname/i, /given\s*names?/i], (value, conf) => {
      if (!isHeaderNoise(value)) {
        ocrData.name = value;
        ocrData.confidence_scores!.name = conf;
      }
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
      ocrData.expiration_date = value;
      ocrData.confidence_scores!.expiration_date = conf;
    });

    this.findField(flatLines, [/issued\s*by/i, /issuing\s*authority/i, /authority/i], (value, conf) => {
      ocrData.issuing_authority = value;
      ocrData.confidence_scores!.issuing_authority = conf;
    });
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
      ocrData.expiration_date = value;
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

        if (i + 1 < lines.length) {
          const nextLine = lines[i + 1];
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
    const m = text.match(/(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})/);
    return m ? standardizeDateFormat(m[0]) : null;
  }
}
