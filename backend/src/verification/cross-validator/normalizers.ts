/**
 * Per-field normalizers for cross-validation.
 * Each function takes a raw value and returns a normalized string or null.
 */

// Common alpha-2 → alpha-3 country code mapping (80+ entries for all priority regions)
const COUNTRY_MAP: Record<string, string> = {
  // English-speaking
  US: 'USA', GB: 'GBR', CA: 'CAN', AU: 'AUS', NZ: 'NZL', IE: 'IRL',
  // EU core
  DE: 'DEU', FR: 'FRA', IT: 'ITA', ES: 'ESP', NL: 'NLD', BE: 'BEL',
  AT: 'AUT', CH: 'CHE', PT: 'PRT', GR: 'GRC', LU: 'LUX', MT: 'MLT',
  CY: 'CYP',
  // EU / Nordics
  SE: 'SWE', NO: 'NOR', DK: 'DNK', FI: 'FIN',
  // EU / Eastern
  PL: 'POL', CZ: 'CZE', HU: 'HUN', RO: 'ROU', BG: 'BGR', HR: 'HRV',
  SK: 'SVK', SI: 'SVN', LT: 'LTU', LV: 'LVA', EE: 'EST',
  // Latin America
  BR: 'BRA', MX: 'MEX', AR: 'ARG', CL: 'CHL', CO: 'COL', PE: 'PER',
  VE: 'VEN', EC: 'ECU', UY: 'URY', PY: 'PRY', BO: 'BOL',
  // Asia-Pacific
  JP: 'JPN', CN: 'CHN', IN: 'IND', KR: 'KOR', SG: 'SGP', PH: 'PHL',
  TH: 'THA', MY: 'MYS', ID: 'IDN', VN: 'VNM', TW: 'TWN', HK: 'HKG',
  MM: 'MMR', KH: 'KHM', LA: 'LAO', BN: 'BRN',
  // Middle East / Africa
  AE: 'ARE', SA: 'SAU', IL: 'ISR', TR: 'TUR', EG: 'EGY',
  ZA: 'ZAF', NG: 'NGA', KE: 'KEN', GH: 'GHA', TZ: 'TZA',
  // Other
  RU: 'RUS', UA: 'UKR', PK: 'PAK', BD: 'BGD',
  // MRZ single-letter codes
  D: 'DEU',
};

// Alpha-3 → alpha-2 reverse lookup (also handles MRZ single-letter codes like 'D' for Germany)
const REVERSE_COUNTRY_MAP: Record<string, string> = Object.fromEntries(
  Object.entries(COUNTRY_MAP).filter(([k]) => k.length === 2).map(([k, v]) => [v, k])
);
// MRZ single-letter country codes (e.g., 'D' = Germany in MRZ issuingState)
for (const [k, v] of Object.entries(COUNTRY_MAP)) {
  if (k.length === 1) REVERSE_COUNTRY_MAP[k] = REVERSE_COUNTRY_MAP[v] || k;
}

/**
 * Convert ISO alpha-3 country code to alpha-2.
 * Canonical implementation — also re-exported from mrz.ts.
 */
export function alpha3ToAlpha2(alpha3: string | null): string | null {
  if (!alpha3) return null;
  const upper = alpha3.toUpperCase().replace(/</g, '').trim();
  return REVERSE_COUNTRY_MAP[upper] ?? null;
}

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
 *
 * @param dateHint - Optional hint for ambiguous dates (e.g., 01/02/2020):
 *   - 'DMY': 01 = day, 02 = month (European convention)
 *   - 'MDY': 01 = month, 02 = day (US convention, default)
 *   - 'YMD': year-month-day (Asian convention)
 */
export function normalizeDate(value: unknown, dateHint?: 'DMY' | 'MDY' | 'YMD'): string | null {
  if (value == null) return null;
  const str = String(value).trim();
  if (!str) return null;

  // Already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    return isValidDate(str) ? str : null;
  }

  // Two-part date with separator: XX/XX/XXXX
  const slashMatch = str.match(/^(\d{1,4})[/\-.](\d{1,2})[/\-.](\d{2,4})$/);
  if (slashMatch) {
    let [, p1, p2, p3] = slashMatch;

    // 4-digit first part = YYYY-MM-DD
    if (p1.length === 4) {
      const result = `${p1}-${p2.padStart(2, '0')}-${p3.padStart(2, '0')}`;
      return isValidDate(result) ? result : null;
    }

    // Expand 2-digit year — position depends on hint
    if (dateHint === 'YMD' && p1.length === 2) {
      const yy = parseInt(p1);
      p1 = String(yy > 30 ? 1900 + yy : 2000 + yy);
    } else if (p3.length === 2) {
      const yy = parseInt(p3);
      p3 = String(yy > 30 ? 1900 + yy : 2000 + yy);
    }

    // Determine format: use explicit hint, or disambiguate
    let hint = dateHint;
    if (!hint) {
      const n1 = parseInt(p1);
      // If first part > 12, it can't be a month — must be DD/MM/YYYY
      if (n1 > 12) hint = 'DMY';
      else hint = 'MDY'; // Default US convention for ambiguous dates
    }

    let result: string;
    switch (hint) {
      case 'DMY':
        result = `${p3}-${p2.padStart(2, '0')}-${p1.padStart(2, '0')}`;
        break;
      case 'YMD':
        result = `${p1}-${p2.padStart(2, '0')}-${p3.padStart(2, '0')}`;
        break;
      case 'MDY':
      default:
        result = `${p3}-${p1.padStart(2, '0')}-${p2.padStart(2, '0')}`;
        break;
    }
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

  // MMDDYYYY (8-digit US format) — only when hint is MDY or default
  if (/^\d{8}$/.test(str) && (!dateHint || dateHint === 'MDY')) {
    const mm = str.slice(0, 2);
    const dd = str.slice(2, 4);
    const yyyy = str.slice(4, 8);
    const result = `${yyyy}-${mm}-${dd}`;
    return isValidDate(result) ? result : null;
  }

  // DDMMYYYY (8-digit European format) — when hint is DMY
  if (/^\d{8}$/.test(str) && dateHint === 'DMY') {
    const dd = str.slice(0, 2);
    const mm = str.slice(2, 4);
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
