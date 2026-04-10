import type { FlatLine } from '../types.js';
import { parseMonthNameDate, standardizeDateFormat, findAllDates } from '../utils/dateUtils.js';

/**
 * Abstract base class for document extractors.
 * Provides shared helpers used by passport, national ID, international, and generic extractors.
 */
export abstract class BaseExtractor {

  /** Check if a value looks like a label fragment, noise, or non-name text */
  protected isLabelOrNoise(value: string): boolean {
    const v = value.trim();
    // Pure numbers or very short
    if (/^\d+$/.test(v) || v.length < 2) return true;
    // Starts with "/" (bilingual label remnant like "/surname")
    if (v.startsWith('/')) return true;
    // Known label fragments (English + common European + Haitian Creole)
    if (/\b(surname|given\s*name|first\s*name|last\s*name|family\s*name|date\s*of\s*birth|nationality|passport|card\s*no|document|expiry|number)\b/i.test(v)) return true;
    if (/\b(date\s*de\s*naissance|lieu\s*de\s*naissance|date\s*d'?\s*expiration|date\s*d'?\s*[eé]mission|num[eé]ro\s*de\s*carte|nationalit[eé]|pr[eé]nom)(?![A-Za-z])/i.test(v)) return true;
    if (/\b(kat\s*la\s*f[eè]t|kat\s*la\s*fini|dat\s*(?:ou\s*)?f[eè]t|kote\s*(?:ou\s*)?f[eè]t|nimewo\s*kat|nimewo\s*idantifikasyon|nasyonalite|siyati\s*m[eè]t)\b/i.test(v)) return true;
    // Passport/card field markers (e.g., "***" or "* text *")
    if (/^\*+/.test(v)) return true;
    return false;
  }

  /**
   * Strip trailing label noise from a value. Common OCR artifact when two labels
   * share a visual line: "DELAIRE Date de Naissance: /Dat.ou fet" → "DELAIRE".
   * Covers English + French + Haitian Creole label prefixes.
   *
   * NOTE: Only multi-word label phrases are included — generic single-word English
   * tokens (nationality/expiry/address) were deliberately omitted to avoid
   * truncating legitimate values that happen to contain those words.
   */
  protected stripTrailingLabelNoise(value: string): string {
    const labelStart = /\s+(?:date\s*de\s*naissance|lieu\s*de\s*naissance|date\s*d'?\s*expiration|date\s*d'?\s*[eé]mission|num[eé]ro\s*de\s*carte|nationalit[eé]|nasyonalite|dat\s*(?:ou\s*)?f[eè]t|kat\s*la\s*f[eè]t|kat\s*la\s*fini|kote\s*(?:ou\s*)?f[eè]t|nimewo\s*kat|nimewo\s*idantifikasyon|signature|siyati\s*m[eè]t|date\s*of\s*birth|date\s*of\s*expiry)(?![A-Za-z]).*$/i;
    return value.replace(labelStart, '').trim();
  }

  /**
   * Strip leading label noise from a value. Common OCR artifact when the value
   * line bleeds into the label line: "Nom/ Siyati Haitien / Ayisyen" → "Haitien / Ayisyen".
   * Handles compound bilingual labels (French / Kreyòl, French / English, etc.).
   *
   * Each keyword in the group uses a trailing (?![A-Za-z]) lookahead to prevent
   * stripping prefixes from legitimate values like "Nomadic" or "Nameplate".
   * NOTE: Plain \b cannot be used here because JavaScript's \b is ASCII-only —
   * it fails after non-ASCII chars like é (e.g., /nationalit[eé]\b/ won't match
   * "nationalité" because \b doesn't see é as a word character).
   */
  protected stripLeadingLabelNoise(value: string): string {
    // Compound labels with optional slash separator (bilingual docs)
    const compoundLabel = /^\s*(?:nom|pr[eé]nom|non|siyati|sexe|s[eè]ks|nationalit[eé]|nasyonalite|date|dat|lieu|kote|num[eé]ro|nimewo|signature|surname|given\s*name|name|dob)(?![A-Za-z])(?:\s*\/\s*(?:nom|pr[eé]nom|non|siyati|sexe|s[eè]ks|nationalit[eé]|nasyonalite|date|dat|lieu|kote|num[eé]ro|nimewo|signature|surname|given\s*name|name|dob)(?![A-Za-z]))*\s*[:\-]?\s*/i;
    return value.replace(compoundLabel, '').trim();
  }

  /** Extract text appearing after a label match on the same line */
  protected valueAfterLabel(text: string, labelRegex: RegExp): string | null {
    const m = text.match(labelRegex);
    if (!m) return null;
    const after = text.slice(m.index! + m[0].length).replace(/^[\s:\-\.]+/, '').trim();
    return after.length > 0 ? after : null;
  }

  /** Get the text of the line at index + 1 */
  protected nextLineText(lines: FlatLine[], idx: number): string | null {
    if (idx + 1 >= lines.length) return null;
    const t = lines[idx + 1].text.trim();
    return t.length > 0 ? t : null;
  }

  /**
   * Scan lines for a label matching one of the patterns, then extract the value.
   * onMatch returns false to reject and keep searching.
   */
  protected findField(
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

  /**
   * Like findField, but extracts and normalizes a date value.
   * @param hint - Optional country date-format hint for ambiguous dates.
   */
  protected findDateField(
    lines:    Array<{ text: string; confidence: number }>,
    patterns: RegExp[],
    onMatch:  (value: string, confidence: number) => void,
    hint?:    'DMY' | 'MDY' | 'YMD',
  ): void {
    this.findField(lines, patterns, (value, conf) => {
      const dateStr = this.extractDate(value, hint);
      if (dateStr) { onMatch(dateStr, conf); return; }
      return false;
    });
  }

  /**
   * Extract a single date from text (month-name or numeric).
   * @param hint - Optional country date-format hint for ambiguous dates.
   */
  protected extractDate(text: string, hint?: 'DMY' | 'MDY' | 'YMD'): string | null {
    // Try month-name dates first (e.g., "1 JAN 1981")
    const monthName = parseMonthNameDate(text);
    if (monthName) return monthName;
    // Numeric dates (e.g., "01/01/1981")
    const m = text.match(/(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})/);
    return m ? standardizeDateFormat(m[0], hint) : null;
  }

  /**
   * Like findDateField(), but picks the LAST date found in the matched region.
   * Useful for expiry extraction where issue and expiry dates may appear
   * side-by-side on the same line or adjacent lines.
   *
   * @param hint - Optional country date-format hint (DMY/MDY/YMD). When provided,
   *   ambiguous dates like "06-02-2028" are interpreted according to the hint
   *   instead of falling back to the p1>12 heuristic.
   * @param options - Optional config:
   *   - windowSize: number of following lines to include in the search (default 1).
   *     Set to 2 for multi-column bilingual layouts where dates sit below a
   *     two-line stacked label header, e.g.:
   *       "Date d'émission / Date d'expiration"
   *       "Dat kat la fet  Dat kat la fini"
   *       "07-02-2018      06-02-2028"
   */
  protected findLastDateField(
    lines:    Array<{ text: string; confidence: number }>,
    patterns: RegExp[],
    onMatch:  (value: string, confidence: number) => void,
    hint?:    'DMY' | 'MDY' | 'YMD',
    options?: { windowSize?: 1 | 2 },
  ): void {
    const windowSize = options?.windowSize ?? 1;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      for (const pattern of patterns) {
        const match = line.text.match(pattern);
        if (!match) continue;

        // Collect dates from the matched line + up to N following lines.
        const textToSearch = line.text.slice(match.index! + match[0].length);
        const next1 = (i + 1 < lines.length) ? lines[i + 1].text : '';
        const next2 = (windowSize >= 2 && i + 2 < lines.length) ? lines[i + 2].text : '';
        const combined = textToSearch + ' ' + next1 + ' ' + next2;

        const dates = findAllDates(combined, hint);
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
