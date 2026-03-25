// ── Month-name lookup for date parsing ────────────────────────

const MONTH_NAMES: Record<string, string> = {
  JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06',
  JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12',
};

/** Parse a month-name date like "1 JAN 1981" or "12 August 1990" → YYYY-MM-DD */
export function parseMonthNameDate(text: string): string | null {
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
export function disambiguateExpiryDate(dateYMD: string): string {
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
export function parseAamvaDate(s: string): string | null {
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
export function findAllDates(text: string): string[] {
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
