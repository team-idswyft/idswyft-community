/**
 * Maps ISO 3166-1 alpha-2 country codes to the primary OCR language/script
 * needed for document recognition.
 *
 * PaddleOCR's default model handles Latin-script languages well.
 * Non-Latin scripts require separate recognition models + character dictionaries
 * (see ppu-paddle-ocr-models repository).
 *
 * Script categories:
 * - 'latin'     — default model handles these (English, French, German, Spanish, etc.)
 * - 'cyrillic'  — Russian, Ukrainian, Bulgarian, Serbian, etc.
 * - 'arabic'    — Arabic, Farsi, Urdu (RTL scripts)
 * - 'cjk'       — Chinese, Japanese, Korean
 * - 'devanagari'— Hindi, Marathi, Nepali
 * - 'thai'      — Thai script
 */

export type OCRScript = 'latin' | 'cyrillic' | 'arabic' | 'cjk' | 'devanagari' | 'thai';

/** Country → primary document script mapping */
const COUNTRY_SCRIPT_MAP: Record<string, OCRScript> = {
  // Latin-script countries (covered by default PaddleOCR model)
  US: 'latin', GB: 'latin', CA: 'latin', AU: 'latin', NZ: 'latin',
  IE: 'latin', DE: 'latin', FR: 'latin', ES: 'latin', IT: 'latin',
  PT: 'latin', NL: 'latin', BE: 'latin', AT: 'latin', CH: 'latin',
  SE: 'latin', NO: 'latin', DK: 'latin', FI: 'latin', PL: 'latin',
  CZ: 'latin', SK: 'latin', HU: 'latin', RO: 'latin', HR: 'latin',
  SI: 'latin', EE: 'latin', LV: 'latin', LT: 'latin', MT: 'latin',
  MX: 'latin', BR: 'latin', AR: 'latin', CO: 'latin', CL: 'latin',
  PE: 'latin', VE: 'latin', HT: 'latin', PH: 'latin', ID: 'latin', MY: 'latin',
  TR: 'latin', ZA: 'latin', NG: 'latin', KE: 'latin', GH: 'latin',

  // Cyrillic-script countries
  RU: 'cyrillic', UA: 'cyrillic', BY: 'cyrillic', BG: 'cyrillic',
  RS: 'cyrillic', MK: 'cyrillic', KZ: 'cyrillic', KG: 'cyrillic',
  MN: 'cyrillic',

  // Arabic-script countries
  SA: 'arabic', AE: 'arabic', EG: 'arabic', IQ: 'arabic',
  MA: 'arabic', DZ: 'arabic', TN: 'arabic', JO: 'arabic',
  LB: 'arabic', KW: 'arabic', QA: 'arabic', BH: 'arabic',
  OM: 'arabic', YE: 'arabic', LY: 'arabic', SD: 'arabic',
  IR: 'arabic', PK: 'arabic',

  // CJK countries
  CN: 'cjk', TW: 'cjk', HK: 'cjk', JP: 'cjk', KR: 'cjk',

  // Devanagari-script countries
  IN: 'devanagari', NP: 'devanagari',

  // Thai
  TH: 'thai',
};

/**
 * Get the primary script for a country's identity documents.
 * Returns 'latin' as default (the most widely supported script).
 */
export function getDocumentScript(countryCode: string): OCRScript {
  return COUNTRY_SCRIPT_MAP[countryCode.toUpperCase()] ?? 'latin';
}

/**
 * Check whether the default PaddleOCR model supports this country's documents.
 * Latin-script documents work out of the box. Others need additional models.
 */
export function isDefaultModelSupported(countryCode: string): boolean {
  return getDocumentScript(countryCode) === 'latin';
}

/**
 * PaddleOCR recognition model identifiers for each script.
 * These map to the model files in the ppu-paddle-ocr-models repository.
 * When the developer hasn't configured custom models, only 'latin' is available.
 */
export const SCRIPT_MODEL_IDS: Record<OCRScript, string> = {
  latin: 'en_PP-OCRv4_rec',
  cyrillic: 'cyrillic_PP-OCRv3_rec',
  arabic: 'arabic_PP-OCRv3_rec',
  cjk: 'ch_PP-OCRv4_rec',
  devanagari: 'devanagari_PP-OCRv3_rec',
  thai: 'thai_PP-OCRv3_rec',
};
