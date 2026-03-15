/**
 * Address Normalizer
 *
 * Normalizes address strings for comparison across different document formats.
 * Handles abbreviations, punctuation, whitespace, and common variations.
 */

// ─── Common abbreviation mappings ────────────────────────

const STREET_ABBREVIATIONS: Record<string, string> = {
  'street': 'st',
  'avenue': 'ave',
  'boulevard': 'blvd',
  'drive': 'dr',
  'lane': 'ln',
  'road': 'rd',
  'court': 'ct',
  'place': 'pl',
  'circle': 'cir',
  'terrace': 'ter',
  'highway': 'hwy',
  'parkway': 'pkwy',
  'apartment': 'apt',
  'suite': 'ste',
  'building': 'bldg',
  'floor': 'fl',
  'unit': 'unit',
  'number': 'no',
  'north': 'n',
  'south': 's',
  'east': 'e',
  'west': 'w',
  'northeast': 'ne',
  'northwest': 'nw',
  'southeast': 'se',
  'southwest': 'sw',
};

// Reverse map: abbreviation → canonical form (the abbreviation itself)
const REVERSE_ABBREVIATIONS: Record<string, string> = {};
for (const [full, abbr] of Object.entries(STREET_ABBREVIATIONS)) {
  REVERSE_ABBREVIATIONS[full] = abbr;
  REVERSE_ABBREVIATIONS[abbr] = abbr; // Ensure abbreviation maps to itself
}

/**
 * Normalize an address string for comparison.
 *
 * Strips punctuation, collapses whitespace, lowercases,
 * and converts common street/direction words to abbreviations.
 */
export function normalizeAddress(address: string): string {
  if (!address) return '';

  let normalized = address
    .toLowerCase()
    .replace(/[.,#\-\/\\()]/g, ' ') // Replace punctuation with space
    .replace(/\s+/g, ' ')           // Collapse whitespace
    .trim();

  // Replace full words with their abbreviations
  const tokens = normalized.split(' ');
  const normalizedTokens = tokens.map(token => REVERSE_ABBREVIATIONS[token] || token);

  return normalizedTokens.join(' ');
}

/**
 * Extract structured address components from a raw address string.
 * Best-effort extraction — not all components may be found.
 */
export interface AddressComponents {
  streetNumber?: string;
  streetName?: string;
  unit?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
  raw: string;
}

/**
 * Parse an address string into components.
 *
 * Handles common formats:
 * - "123 Main St, Apt 4, Springfield, IL 62704"
 * - "123 Main Street Springfield IL 62704 US"
 */
export function parseAddress(address: string): AddressComponents {
  if (!address) return { raw: '' };

  const result: AddressComponents = { raw: address };

  // Extract postal/zip code (US 5-digit or 5+4, UK, CA, etc.)
  const postalMatch = address.match(/\b(\d{5}(?:-\d{4})?)\b/) // US ZIP
    || address.match(/\b([A-Z]\d[A-Z]\s?\d[A-Z]\d)\b/i)      // Canadian
    || address.match(/\b([A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2})\b/i); // UK
  if (postalMatch) {
    result.postalCode = postalMatch[1].replace(/\s/g, '');
  }

  // Extract unit/apt number
  const unitMatch = address.match(/\b(?:apt|suite|ste|unit|#)\s*(\w+)/i);
  if (unitMatch) {
    result.unit = unitMatch[1];
  }

  // Extract leading street number
  const streetNumMatch = address.match(/^\s*(\d+)\s/);
  if (streetNumMatch) {
    result.streetNumber = streetNumMatch[1];
  }

  // US state abbreviation (2 uppercase letters before ZIP)
  const stateMatch = address.match(/\b([A-Z]{2})\s+\d{5}/);
  if (stateMatch) {
    result.state = stateMatch[1];
  }

  return result;
}

/**
 * Extract the name portion from a proof-of-address document's OCR text.
 *
 * Utility bills and bank statements typically have the account holder's
 * name in the first few lines. This tries common patterns.
 */
export function extractNameFromAddressDoc(rawText: string): string | null {
  if (!rawText) return null;

  const lines = rawText.split('\n').map(l => l.trim()).filter(Boolean);

  // Skip header lines (company name, "Statement", dates, account numbers)
  // Look for lines that look like a person's name (2-4 capitalized words, no numbers)
  for (const line of lines.slice(0, 10)) {
    // Skip lines with numbers (account numbers, dates, amounts)
    if (/\d{3,}/.test(line)) continue;
    // Skip common header words
    if (/^(statement|invoice|bill|account|date|page|period|total)/i.test(line)) continue;
    // Skip company-like names (ALL CAPS with "CO", "INC", "LLC", "UTILITY", etc.)
    if (/\b(CO|INC|LLC|LTD|CORP|UTILITY|ELECTRIC|GAS|WATER|BANK|INSURANCE)\b/i.test(line)
        && line === line.toUpperCase()) continue;
    // A name-like line: 2-4 words, mostly letters, mixed case (not all-caps header)
    const words = line.split(/\s+/).filter(Boolean);
    if (words.length >= 2 && words.length <= 5) {
      const allAlpha = words.every(w => /^[a-zA-Z\-'.]+$/.test(w));
      if (allAlpha) return line;
    }
  }

  return null;
}
