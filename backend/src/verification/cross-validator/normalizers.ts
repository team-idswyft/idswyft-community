/**
 * Per-field normalizers for cross-validation.
 * Each function takes a raw value and returns a normalized string or null.
 */

// Common alpha-2 → alpha-3 country code mapping
const COUNTRY_MAP: Record<string, string> = {
  US: 'USA', GB: 'GBR', DE: 'DEU', FR: 'FRA', IT: 'ITA', ES: 'ESP',
  CA: 'CAN', AU: 'AUS', JP: 'JPN', CN: 'CHN', IN: 'IND', BR: 'BRA',
  MX: 'MEX', KR: 'KOR', NL: 'NLD', SE: 'SWE', NO: 'NOR', DK: 'DNK',
  FI: 'FIN', PL: 'POL', AT: 'AUT', CH: 'CHE', BE: 'BEL', IE: 'IRL',
  PT: 'PRT', GR: 'GRC', NZ: 'NZL', SG: 'SGP', HK: 'HKG', TW: 'TWN',
  PH: 'PHL', TH: 'THA', MY: 'MYS', ID: 'IDN', ZA: 'ZAF', AE: 'ARE',
  SA: 'SAU', EG: 'EGY', NG: 'NGA', KE: 'KEN', AR: 'ARG', CL: 'CHL',
  CO: 'COL', PE: 'PER', RU: 'RUS', UA: 'UKR', RO: 'ROU', CZ: 'CZE',
  HU: 'HUN', IL: 'ISR', TR: 'TUR', PK: 'PAK', BD: 'BGD', VN: 'VNM',
  // MRZ single-letter codes
  D: 'DEU',
};

/**
 * Normalize an ID number: strip whitespace, special chars, uppercase.
 */
export function normalizeIdNumber(value: unknown): string | null {
  if (value == null) return null;
  const str = String(value).trim();
  if (!str) return null;
  return str.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
}

/**
 * Normalize a person's name: uppercase, strip diacritics, remove special chars,
 * collapse whitespace, replace MRZ fillers (<<) with spaces.
 */
export function normalizeName(value: unknown): string | null {
  if (value == null) return null;
  const str = String(value).trim();
  if (!str) return null;

  return str
    // Replace MRZ filler << with space
    .replace(/<<+/g, ' ')
    // Strip diacritics
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    // Remove non-alphanumeric except spaces
    .replace(/[^A-Z0-9 ]/g, '')
    // Collapse multiple spaces
    .replace(/\s+/g, ' ')
    .trim() || null;
}

/**
 * Normalize a date to YYYY-MM-DD format.
 * Handles: YYYY-MM-DD, DD/MM/YYYY, DD-MM-YYYY, YYMMDD (MRZ), MMDDYYYY.
 */
export function normalizeDate(value: unknown): string | null {
  if (value == null) return null;
  const str = String(value).trim();
  if (!str) return null;

  // Already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    return isValidDate(str) ? str : null;
  }

  // DD/MM/YYYY or DD-MM-YYYY
  const slashMatch = str.match(/^(\d{2})[/-](\d{2})[/-](\d{4})$/);
  if (slashMatch) {
    const [, dd, mm, yyyy] = slashMatch;
    const result = `${yyyy}-${mm}-${dd}`;
    return isValidDate(result) ? result : null;
  }

  // YYMMDD (MRZ 6-digit format)
  if (/^\d{6}$/.test(str)) {
    const yy = parseInt(str.slice(0, 2), 10);
    const mm = str.slice(2, 4);
    const dd = str.slice(4, 6);
    // MRZ convention: 00-49 → 2000s, 50-99 → 1900s
    const yyyy = yy < 50 ? 2000 + yy : 1900 + yy;
    const result = `${yyyy}-${mm}-${dd}`;
    return isValidDate(result) ? result : null;
  }

  // MMDDYYYY (8-digit US format)
  if (/^\d{8}$/.test(str)) {
    const mm = str.slice(0, 2);
    const dd = str.slice(2, 4);
    const yyyy = str.slice(4, 8);
    const result = `${yyyy}-${mm}-${dd}`;
    return isValidDate(result) ? result : null;
  }

  return null;
}

/**
 * Normalize nationality: convert alpha-2 to alpha-3, uppercase.
 */
export function normalizeNationality(value: unknown): string | null {
  if (value == null) return null;
  const str = String(value).trim().toUpperCase();
  if (!str) return null;

  // If it's already alpha-3, return as-is
  if (str.length === 3 && /^[A-Z]{3}$/.test(str)) return str;

  // Try alpha-2 → alpha-3 mapping
  if (COUNTRY_MAP[str]) return COUNTRY_MAP[str];

  return null;
}

/**
 * Generic normalizer: lowercase, strip non-alphanumeric.
 */
export function normalizeGeneric(value: unknown): string | null {
  if (value == null) return null;
  const str = String(value).trim();
  if (!str) return null;
  return str.toLowerCase().replace(/[^a-z0-9]/g, '') || null;
}

/** Validates a YYYY-MM-DD date string */
function isValidDate(dateStr: string): boolean {
  const [yyyy, mm, dd] = dateStr.split('-').map(Number);
  const d = new Date(yyyy, mm - 1, dd);
  return d.getFullYear() === yyyy && d.getMonth() === mm - 1 && d.getDate() === dd;
}
