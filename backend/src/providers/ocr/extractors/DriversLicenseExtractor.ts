import type { OCRData } from '../../../types/index.js';
import type { FlatLine, LabelMapEntry, NameResult } from '../types.js';
import { logger } from '@/utils/logger.js';
import { BaseExtractor } from './BaseExtractor.js';
import { flattenLines } from '../utils/flattenLines.js';
import {
  standardizeDateFormat, disambiguateExpiryDate,
  parseAamvaDate, findAllDates,
} from '../utils/dateUtils.js';
import {
  isHeaderNoise, sanitizeName, reorderSuffix, nameScore,
  CandidateAccumulator,
} from '../utils/nameUtils.js';
import { DL_FIELD_TOKENS, NAME_SUFFIXES } from '../constants/noise.js';
import {
  AAMVA_CODES, AAMVA_NAME_RE, AAMVA_ALT_RE,
  LABEL_PATTERNS, DL_NUMBER_PATTERNS,
} from '../constants/aamva.js';

type RecognitionResult = any;

export class DriversLicenseExtractor extends BaseExtractor {

  extract(lines: RecognitionResult[][], ocrData: OCRData): void {
    // Step 0: Try AAMVA extraction first (most reliable)
    if (ocrData.raw_text && this.tryExtractAamva(ocrData.raw_text, ocrData)) {
      logger.info('PaddleOCRProvider: AAMVA codes found — used direct extraction');
      // Still continue to fill any missing fields via layout parsing
    }

    const flatLines = flattenLines(lines);

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
        ocrData.name = reorderSuffix(nameResult.value);
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

  private buildLabelMap(lines: FlatLine[]): Map<string, LabelMapEntry> {
    const map = new Map<string, LabelMapEntry>();

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      for (const [key, pattern] of LABEL_PATTERNS) {
        if (!map.has(key) && pattern.test(line.text)) {
          map.set(key, { ...line, lineIndex: i });
        }
      }
    }

    // For dl_number, prefer a line that has digits after the label over one
    // that merely contains "DL" in state name text (e.g. "GEORGIA DL USA GA")
    const dlEntry = map.get('dl_number');
    if (dlEntry && !/\d{5,}/.test(dlEntry.text)) {
      for (let i = dlEntry.lineIndex + 1; i < lines.length; i++) {
        const line = lines[i];
        if (LABEL_PATTERNS[0][1].test(line.text) && /\d{5,}/.test(line.text)) {
          map.set('dl_number', { ...line, lineIndex: i });
          break;
        }
      }
    }

    return map;
  }

  // ── AAMVA raw text extraction ──────────────────────────────

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

  // ── DL Number extraction ───────────────────────────────────

  private extractDlNumber(
    lines:    FlatLine[],
    labelMap: Map<string, LabelMapEntry>,
  ): string | null {

    // Strategy A: From labeled line
    const labelLine = labelMap.get('dl_number');
    if (labelLine) {
      // Try space-separated digit groups first (e.g., "DLN: 99 999 999")
      const spacedM = labelLine.text.match(
        /(?:4d\s*)?(?:DLn?|DL\s*(?:NO\.?|#?)|LIC(?:ENSE)?\.?\s*(?:NO\.?|#?)|OL\s*NO\.?)\s*[:\s]*(\d[\d\s]{5,18}\d)\b/i,
      );
      if (spacedM && /\s/.test(spacedM[1])) {
        const groups = spacedM[1].trim().split(/\s+/);
        while (groups.length > 1 && groups[0].length <= 2 && groups[1].length >= 5) {
          groups.shift();
        }
        while (groups.length > 1 && groups[groups.length - 1].length === 1) {
          groups.pop();
        }
        const cleaned = groups.join('');
        if (cleaned.length >= 5 && cleaned.length <= 15) {
          return cleaned;
        }
      }

      // Try full alphanumeric DL number after label
      const fullAlphaM = labelLine.text.match(
        /(?:4d\s*)?(?:DLn?|DL\s*(?:NO\.?|#?)|LIC(?:ENSE)?\.?\s*(?:NO\.?|#?)|OL\s*NO\.?)\s*([A-Z]{0,3}\d[\dA-Z]{4,14})\b/i,
      );
      if (fullAlphaM) {
        let cleaned = fullAlphaM[1].replace(/[\s\-]/g, '');
        // Strip AAMVA field suffix concatenated by OCR (e.g. "999999999DOB")
        const sfx = cleaned.match(
          /^([A-Z]{0,3}\d{6,})(?:DOB|SEX|CLASS|CLAS|EXP|ISS|HGT|WGT|EYES?|HAIR|DD|RESTR)/i,
        );
        if (sfx) cleaned = sfx[1];
        // Strip leading 'E' (AAMVA endorsements field label) bleeding into DL number
        // No US state uses E-prefix + 10+ digits as a DL number format
        if (/^E\d{10,}$/i.test(cleaned)) {
          cleaned = cleaned.slice(1);
        }
        if (/\d/.test(cleaned) && cleaned.length >= 5 && cleaned.length <= 15
            && !this.looksLikeDate(cleaned)) {
          return cleaned;
        }
      }

      // Try letter + hyphenated digits (FL "D123-456-83-789-0", IL "P142-4558-7924", MN "A123-456-789-123")
      const hyphenM = labelLine.text.match(
        /(?:4d\s*)?(?:DLn?|DL\s*(?:NO\.?|#?)|LIC(?:ENSE)?\.?\s*(?:NO\.?|#?))\s*[:\s]*([A-Z]\d{1,4}(?:-\d{1,4}){2,5})\b/i,
      );
      if (hyphenM) return hyphenM[1];

      // Try letter + spaced digit groups (MI "S 000 123 456 789")
      const letterSpacedM = labelLine.text.match(
        /(?:4d\s*)?(?:DLn?|DL\s*(?:NO\.?|#?)|LIC(?:ENSE)?\.?\s*(?:NO\.?|#?))\s*[:\s]*([A-Z]\s+\d{3}(?:\s+\d{3}){2,4})\b/i,
      );
      if (letterSpacedM) {
        return letterSpacedM[1].replace(/\s/g, '');
      }

      // Handle concatenated OCR: "DLN0000234578919Clas"
      const concatM = labelLine.text.match(
        /(?:4d\s*)?(?:DLn?|DL\s*(?:NO\.?|#?))\s*(\d{6,15})(?=[A-Za-z]{2,})/i,
      );
      if (concatM) {
        let digits = concatM[1];
        const afterPos = concatM.index! + concatM[0].length;
        const suffix = labelLine.text.slice(afterPos);
        const AAMVA_SUFFIX: Array<[RegExp, string]> = [
          [/^(?:Class|Clas)\b/i, '9'],
          [/^Sex\b/i,            '15'],
          [/^Eyes?\b/i,          '18'],
          [/^Hair\b/i,           '19'],
          [/^(?:Hgt|Height)\b/i, '16'],
          [/^Restr/i,            '12'],
          [/^DD\b/i,             '5'],
        ];
        for (const [re, id] of AAMVA_SUFFIX) {
          if (re.test(suffix) && digits.endsWith(id)) {
            digits = digits.slice(0, -id.length);
            break;
          }
        }
        if (digits.length >= 6 && digits.length <= 14 && !this.looksLikeDate(digits)) {
          return digits;
        }
      }

      // Fallback: strip optional class letter + capture digits only
      const digitsOnlyM = labelLine.text.match(
        /(?:4d\s*)?(?:DLn?|DL\s*#?|LIC\.?\s*#?)\s*[A-Z]?\s*(\d{6,15})/i,
      );
      if (digitsOnlyM) return digitsOnlyM[1].replace(/[\s\-]/g, '');

      // Fallback for "4d" AAMVA code when DL label is OCR'd wrong (e.g. "4d DI 12345678")
      const aamva4dM = labelLine.text.match(
        /\b4d\s+[A-Z]{1,3}\s+([A-Z]{0,3}\d{6,14})\b/i,
      );
      if (aamva4dM) {
        const cleaned4d = aamva4dM[1].replace(/[\s\-]/g, '');
        if (!this.looksLikeDate(cleaned4d)) return cleaned4d;
      }

      // Try "ID" prefix followed by spaced digits
      const idPrefixM = labelLine.text.match(
        /\bID\s*((?:\d[\d\s]{5,16}\d))/i,
      );
      if (idPrefixM) {
        const cleaned = idPrefixM[1].replace(/[\s\-]/g, '');
        if (cleaned.length >= 7 && cleaned.length <= 15) return cleaned;
      }

      // Also try "ID NO." style and other labeled patterns
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
    const DL_LABEL_RE = /(?:\b4d\b|DLn?(?:\b|(?=\d))|\bDL\s*(?:NO\.?|#)|\bLIC(?:ENSE)?\.?\s*(?:NO\.?|#)|\bOL\s*NO\b)/i;
    const priorityLines = lines.filter(l => DL_LABEL_RE.test(l.text));
    const otherLines = lines.filter(l => !DL_LABEL_RE.test(l.text));

    // Pre-scan: try hyphenated letter+digit pattern on ALL lines (including date-containing ones)
    // because hyphenated DL numbers like "D123-456-83-789-0" can contain date-like substrings
    const HYPHEN_DL_RE = /\b([A-Z]\d{1,4}(?:-\d{1,4}){2,5})\b/;
    for (const line of [...priorityLines, ...otherLines]) {
      if (isHeaderNoise(line.text)) continue;
      const hm = line.text.match(HYPHEN_DL_RE);
      if (hm) return hm[1];
    }

    for (const line of [...priorityLines, ...otherLines]) {
      if (/\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}/.test(line.text)) continue;
      if (isHeaderNoise(line.text)) continue;

      for (const pattern of DL_NUMBER_PATTERNS) {
        const m = line.text.match(pattern);
        if (m) {
          let candidate = m[1].replace(/[\s]/g, '');
          // Strip AAMVA field suffix concatenated by OCR (e.g. "999999999DOB")
          const suffixStrip = candidate.match(
            /^([A-Z]{0,3}\d{6,})(?:DOB|SEX|CLASS|CLAS|EXP|ISS|HGT|WGT|EYES?|HAIR|DD|RESTR)/i,
          );
          if (suffixStrip) candidate = suffixStrip[1];
          // Strip leading 'E' (AAMVA endorsements field label) bleeding into DL number
          // No US state uses E-prefix + 10+ digits as a DL number format
          if (/^E\d{10,}$/i.test(candidate)) {
            candidate = candidate.slice(1);
          }
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
    const withoutLabel = cleaned.replace(
      /^(?:LICENSE\s*(?:NO\.?|NUMBER|#)|OL\s*NO\.?|ID\s*NO\.?|ID(?=\s*\d)|4d|DLn?|DL\s*(?:NO\.?|#?)|LIC\s*(?:NO\.?|#?))\s*/i, ''
    ).trim();

    // Try matching spaced digit groups first
    const spacedM = withoutLabel.match(/^(\d[\d\s]{5,16}\d)/);
    if (spacedM) {
      const groups = spacedM[1].trim().split(/\s+/);
      while (groups.length > 1 && groups[0].length <= 2 && groups[1].length >= 5) {
        groups.shift();
      }
      while (groups.length > 1 && groups[groups.length - 1].length === 1) {
        groups.pop();
      }
      // Drop trailing short groups that bleed into a following date (e.g. "123456789 01/12/2017")
      const afterSpaced = withoutLabel.slice(spacedM[0].length);
      while (groups.length > 1 && groups[groups.length - 1].length <= 2 && /^[\/\-\.]/.test(afterSpaced)) {
        groups.pop();
      }
      const collapsed = groups.join('');
      if (collapsed.length >= 6 && collapsed.length <= 15 && !this.looksLikeDate(collapsed)) {
        return collapsed;
      }
    }

    // Must be alphanumeric, 5–15 chars, no date-like pattern
    const m = withoutLabel.match(/^([A-Z0-9\-]{5,15})/i);
    if (!m) return null;
    let candidate = m[1].replace(/\-/g, '');
    if (this.looksLikeDate(candidate)) return null;
    if (isHeaderNoise(candidate))      return null;
    if (!/\d/.test(candidate))         return null;

    // Boundary absorption fix
    const afterMatch = withoutLabel.slice(m[0].length);
    if (/^[A-Z]/i.test(afterMatch) && /\d$/.test(candidate) && candidate.length > 5) {
      candidate = candidate.slice(0, -1);
    }

    return candidate.length >= 5 ? candidate : null;
  }

  private looksLikeDate(s: string): boolean {
    if (/^\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}$/.test(s)) return true;
    // Only reject 8-digit numbers that look like valid MMDDYYYY or YYYYMMDD dates
    if (/^\d{8}$/.test(s)) {
      const mm1 = parseInt(s.slice(0, 2), 10);
      const dd1 = parseInt(s.slice(2, 4), 10);
      const yy1 = parseInt(s.slice(4, 8), 10);
      if (mm1 >= 1 && mm1 <= 12 && dd1 >= 1 && dd1 <= 31 && yy1 >= 1900 && yy1 <= 2099) return true;
      const yy2 = parseInt(s.slice(0, 4), 10);
      const mm2 = parseInt(s.slice(4, 6), 10);
      const dd2 = parseInt(s.slice(6, 8), 10);
      if (yy2 >= 1900 && yy2 <= 2099 && mm2 >= 1 && mm2 <= 12 && dd2 >= 1 && dd2 <= 31) return true;
      return false;
    }
    return false;
  }

  // ── Name extraction ────────────────────────────────────────

  private extractName(
    lines:    FlatLine[],
    labelMap: Map<string, LabelMapEntry>,
  ): NameResult | null {

    const acc = new CandidateAccumulator();

    // Strategy A: LN + FN labels (California style)
    const lnLine = labelMap.get('last_name');
    const fnLine = labelMap.get('first_name');
    // Skip Strategy A if label lines are AAMVA-prefixed AND contain real names (not labels)
    // (e.g. "01 LASTNAME" with actual name → skip; "2 GIVEN NAMES" with label → don't skip)
    // Only treat as label if content has explicit multi-word label phrases (with spaces)
    const LABEL_PHRASES = /^(?:LAST\s+NAME|FIRST\s+NAME|FAMILY\s+NAME|GIVEN\s+NAMES?|SURNAME|FULL\s+NAME|LN|FN)$/i;
    const isAamvaNameLine = (line: LabelMapEntry | undefined): boolean => {
      if (!line) return false;
      if (!/^\s*0?[12][.\s]/.test(line.text)) return false;
      const afterPrefix = line.text.replace(/^\s*0?[12][.\s]*/, '').trim();
      if (LABEL_PHRASES.test(afterPrefix)) return false; // Multi-word label, not a name
      return true;
    };
    const lnIsAamva = isAamvaNameLine(lnLine);
    const fnIsAamva = isAamvaNameLine(fnLine);
    if ((lnLine || fnLine) && !lnIsAamva && !fnIsAamva) {
      const lastName  = lnLine ? this.extractNameFromLine(lnLine, lines, /\b(?:LN|LAST\s*NAME|FAMILY\s*NAME|SURNAME)\b/i) : '';
      const firstName = fnLine ? this.extractNameFromLine(fnLine, lines, /\b(?:FN|FIRST\s*NAME|GIVEN\s*NAME)\b/i) : '';
      if (lastName || firstName) {
        const full = sanitizeName([firstName, lastName].filter(Boolean).join(' '));
        if (nameScore(full) > 0.3) {
          const result = acc.tryReturn({
            value:      full,
            confidence: Math.max(lnLine?.confidence ?? 0, fnLine?.confidence ?? 0),
          });
          if (result) return result;
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
        // Check if the next line is also part of the name (multi-line)
        const nextLine = lines[candidateIdx + 1];
        if (nextLine && !isHeaderNoise(nextLine.text) && !/\d{3,}/.test(nextLine.text) &&
            nameScore(nextLine.text.replace(/^[12]\s*/, '')) > 0.3) {
          const nextName = sanitizeName(nextLine.text.replace(/^[12]\s*/, ''));
          const currName = sanitizeName(candidate);
          const isSurnameFirst = currName.split(/\s+/).length === 1 && nextName.split(/\s+/).length >= 1;
          const combined = isSurnameFirst
            ? sanitizeName(`${nextName} ${currName}`)
            : sanitizeName(`${currName} ${nextName}`);
          if (nameScore(combined) > 0.3) {
            const result = acc.tryReturn({ value: combined, confidence: fullNameLine.confidence });
            if (result) return result;
          }
        }

        // Handle "LAST, FIRST MIDDLE" comma format
        const commaM = candidate.match(/^([A-Z'\-]+),\s*(.+)$/i);
        const full   = commaM
          ? sanitizeName(`${commaM[2].trim()} ${commaM[1].trim()}`)
          : sanitizeName(candidate);
        if (nameScore(full) > 0.3) {
          const result = acc.tryReturn({ value: full, confidence: fullNameLine.confidence });
          if (result) return result;
        }
      }
    }

    // Strategy C: AAMVA field number prefixes ("1MARTINEZ", "2ELENA")
    for (const line of lines) {
      let trimmedText = line.text.trimStart();
      let nameText: string | null = null;

      // Preprocessing: strip leading single noise char before AAMVA prefix (e.g. "S 1 SAMPLE")
      if (/^[A-Za-z]\s+0?[12]\s/.test(trimmedText)) {
        trimmedText = trimmedText.replace(/^[A-Za-z]\s+/, '');
      }
      // Preprocessing: strip trailing short noise containing lowercase (e.g. "2. JANICE St")
      // Preserve all-uppercase tokens (middle initials like "T" in "2 BRENDA T")
      {
        const trailingMatch = trimmedText.match(/\s+([A-Za-z]{1,3})\s*$/);
        if (trailingMatch && /[a-z]/.test(trailingMatch[1])) {
          trimmedText = trimmedText.slice(0, trailingMatch.index!);
        }
      }

      let prefixChar = trimmedText[0];
      // Handle zero-padded AAMVA prefix: "01..." → treat as '1', "02..." → treat as '2'
      if (prefixChar === '0' && /^0[12]/.test(trimmedText)) {
        prefixChar = trimmedText[1];
      }

      const m = trimmedText.match(AAMVA_NAME_RE);
      if (m) {
        nameText = m[1];
      } else {
        const altM = trimmedText.match(AAMVA_ALT_RE);
        if (altM && nameScore(altM[3].trim()) > 0.4) {
          nameText = altM[3].trim();
          prefixChar = altM[1];
        }
      }

      if (nameText && nameScore(nameText.replace(/[,.]/g, '')) > 0.4) {
        const isLast  = prefixChar === '1';
        // Apply same preprocessing to partner candidates as main line
        const preprocessLine = (t: string) => {
          let s = t.trimStart();
          if (/^[A-Za-z]\s+0?[12]\s/.test(s)) s = s.replace(/^[A-Za-z]\s+/, '');
          const tm = s.match(/\s+([A-Za-z]{1,3})\s*$/);
          if (tm && /[a-z]/.test(tm[1])) s = s.slice(0, tm.index!);
          return s;
        };
        const partner = lines.find(l =>
          l !== line &&
          l.y > line.y - 10 && l.y < line.y + 100 &&
          preprocessLine(l.text).match(isLast ? /^0?2[.\s]*[A-Z]/ : /^0?1[.\s]*[A-Z]/)
        );
        if (partner) {
          const partnerM = preprocessLine(partner.text).match(AAMVA_NAME_RE);
          const parts = isLast
            ? [partnerM?.[1]?.trim(), nameText!.trim()]
            : [nameText!.trim(), partnerM?.[1]?.trim()];
          let full = sanitizeName(parts.filter(Boolean).join(' '));

          // Check for middle name/suffix on adjacent line after the pair
          // (e.g. SD: "Ta MIDDLENAME, JR" where "Ta" is garbled AAMVA prefix)
          if (partnerM) {
            const pairIdxMax = Math.max(lines.indexOf(line), lines.indexOf(partner));
            for (let d = 1; d <= 2; d++) {
              const midLine = lines[pairIdxMax + d];
              if (!midLine) continue;
              // Skip address lines (AAMVA field 8) and lines with digits
              if (/^\s*8\s/.test(midLine.text)) break;
              if (/\d/.test(midLine.text.replace(/^[A-Za-z]{1,2}\s+/, ''))) break;
              // Strip garbled prefix (1-2 non-digit chars + space) and commas
              const midText = midLine.text.replace(/^[A-Za-z]{1,2}\s+/, '').replace(/,/g, '').trim();
              if (!midText || /\d{3,}/.test(midText)) break; // stop at address/numeric lines
              const midWords = midText.split(/\s+/).filter(w =>
                /^[A-Z][A-Z]+$/.test(w) || NAME_SUFFIXES.has(w.toUpperCase())
              );
              if (midWords.length > 0 && midWords.every(w => !isHeaderNoise(w) && !DL_FIELD_TOKENS.has(w.toLowerCase()))) {
                // Insert middle name(s) between FN and LN, suffix at end
                const midNames = midWords.filter(w => !NAME_SUFFIXES.has(w.toUpperCase()));
                const midSuffixes = midWords.filter(w => NAME_SUFFIXES.has(w.toUpperCase()));
                const firstName = isLast ? partnerM[1].trim() : nameText!.trim();
                const lastName = isLast ? nameText!.trim() : partnerM[1].trim();
                full = sanitizeName([firstName, ...midNames, lastName, ...midSuffixes].join(' '));
                break;
              }
            }
          }

          if (nameScore(full) > 0.4) {
            if (partnerM) {
              return { value: full, confidence: (line.confidence + partner.confidence) / 2 };
            }
            const result = acc.tryReturn({
              value: full, confidence: (line.confidence + partner.confidence) / 2,
            });
            if (result) return result;
          }
        }

        // No numbered partner found — check nearby non-prefixed lines (±3)
        const lineIdx = lines.indexOf(line);
        for (let d = 1; d <= 3; d++) {
          const adjacentIdx = isLast ? lineIdx + d : lineIdx - d;
          const adjacent = lines[adjacentIdx];
          if (!adjacent) continue;
          if (isHeaderNoise(adjacent.text) || /\d/.test(adjacent.text)) continue;
          if (nameScore(adjacent.text) <= 0.2) continue;
          const parts = isLast
            ? [adjacent.text.trim(), nameText!.trim()]
            : [nameText!.trim(), adjacent.text.trim()];
          const full = sanitizeName(parts.join(' '));
          if (nameScore(full) > 0.4) {
            return {
              value:      full,
              confidence: (line.confidence + adjacent.confidence) / 2,
            };
          }
        }

        // Extract missing partner name from DL header/number blob lines
        // (e.g. NV: "U 4dDL NO. 1234567890 SAMPLE 3 DOB 10/27/1969")
        const DL_BLOB_KW = /(?:DL|DRIVER|LICENSE|IDENTIFICATION|DOB|EXP|ISS|CLASS)/i;
        for (const blobLine of lines) {
          if (blobLine === line) continue;
          if (!DL_BLOB_KW.test(blobLine.text)) continue;
          // Extract uppercase words that look like names from the blob
          // Use matchAll to get word positions for context checking
          const blobWordRe = /\b([A-Z]{3,})\b/g;
          let blobWordMatch: RegExpExecArray | null;
          while ((blobWordMatch = blobWordRe.exec(blobLine.text)) !== null) {
            const word = blobWordMatch[1];
            const wordStart = blobWordMatch.index;
            const wordEnd = wordStart + word.length;
            // Skip words adjacent to hyphens/digits (part of doc numbers like "SAM-67-1234")
            const charBefore = wordStart > 0 ? blobLine.text[wordStart - 1] : ' ';
            const charAfter = wordEnd < blobLine.text.length ? blobLine.text[wordEnd] : ' ';
            if (/[\d\-]/.test(charBefore) || /[\d\-]/.test(charAfter)) continue;
            if (isHeaderNoise(word) || DL_FIELD_TOKENS.has(word.toLowerCase())) continue;
            if (/^(?:DRIVER|LICENSE|IDENTIFICATION|LICENCE|STATE|DEPARTMENT|CARD|MOTOR|VEHICLE|PERMIT|NONE|ORGAN|DONOR|VETERAN|USA)$/i.test(word)) continue;
            if (nameScore(word) > 0) {
              const parts = isLast
                ? [word, nameText!.trim()]
                : [nameText!.trim(), word];
              const combined = sanitizeName(parts.join(' '));
              if (nameScore(combined) > 0.4 && combined.split(/\s+/).length >= 2) {
                return { value: combined, confidence: (line.confidence + blobLine.confidence) / 2 };
              }
            }
          }
        }

        // Single name line with AAMVA prefix
        const full = sanitizeName(nameText!.trim());
        if (nameScore(full) > 0.4) {
          const result = acc.tryReturn({ value: full, confidence: line.confidence });
          if (result) return result;
        }
      }
    }

    // Strategy C.2: Standalone AAMVA prefix ("1" or "2" alone on its own line)
    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].text.trim();
      if (!/^0?[12]$/.test(trimmed)) continue;
      const isLastPrefix = trimmed === '1' || trimmed === '01';

      let nameValue: string | null = null;
      let nameConf = 0;
      for (let d = 1; d <= 3 && !nameValue; d++) {
        // Prefer the line AFTER the prefix (name follows its AAMVA number on the DL)
        const candidates = isLastPrefix
          ? [lines[i + d], lines[i - d]]
          : [lines[i + d], lines[i - d]];
        for (const adj of candidates) {
          if (!adj) continue;
          const adjText = adj.text.trim();
          if (/^0?[12]\s/.test(adjText) || /^0?[12]$/.test(adjText)) continue;
          if (isHeaderNoise(adjText) || /\d{3,}/.test(adjText)) continue;
          if (/^[A-Z][A-Z'\-\s]+$/.test(adjText) && nameScore(adjText) > 0.3) {
            nameValue = adjText;
            nameConf = adj.confidence;
            break;
          }
        }
      }
      if (!nameValue) continue;

      const partnerPrefix = isLastPrefix ? /^0?2\s*([A-Z][A-Z'\-,.\s]+)$/ : /^0?1\s*([A-Z][A-Z'\-,.\s]+)$/;
      const partner = lines.find(l => partnerPrefix.test(l.text));
      if (partner) {
        const partnerM = partner.text.match(partnerPrefix);
        if (partnerM) {
          const parts = isLastPrefix
            ? [partnerM[1].trim(), nameValue]
            : [nameValue, partnerM[1].trim()];
          const full = sanitizeName(parts.join(' '));
          if (nameScore(full) > 0.4) {
            return { value: full, confidence: (nameConf + partner.confidence) / 2 };
          }
        }
      }

      // No AAMVA partner — check nearby non-prefixed name lines (e.g. AK: "SAMPLECARD")
      const stIdx = i;
      for (let d = 1; d <= 3; d++) {
        // Search in the opposite direction from where nameValue was found
        for (const nearIdx of [stIdx - d, stIdx + d]) {
          if (nearIdx < 0 || nearIdx >= lines.length) continue;
          const near = lines[nearIdx];
          const nearText = near.text.trim();
          if (nearText === nameValue) continue;
          if (/^0?[12](\s|$)/.test(nearText)) continue; // skip AAMVA-prefixed lines
          if (isHeaderNoise(nearText) || /\d{3,}/.test(nearText)) continue;
          if (nameScore(nearText) <= 0.2) continue;
          if (!/^[A-Z][A-Z'\-\s]+$/.test(nearText)) continue;
          const parts = isLastPrefix
            ? [nearText, nameValue]
            : [nameValue, nearText];
          const combined = sanitizeName(parts.join(' '));
          if (nameScore(combined) > 0.4 && combined.split(/\s+/).length >= 2) {
            return { value: combined, confidence: (nameConf + near.confidence) / 2 };
          }
        }
      }

      const full = sanitizeName(nameValue);
      if (nameScore(full) > 0.4) {
        const result = acc.tryReturn({ value: full, confidence: nameConf });
        if (result) return result;
      }
    }

    // Strategy C.5: Embedded AAMVA in blob lines (WA, VT, MT)
    for (const line of lines) {
      if (line.text.length < 60) continue;
      const lastM = line.text.match(/\b0?1\s*([A-Z][A-Z'\-]+)\b/);
      const firstM = line.text.match(/\b0?2\s*([A-Z][A-Z'\-\s]*[A-Z])\b/);
      if (lastM && firstM) {
        const lastName = sanitizeName(lastM[1].trim());
        const firstName = sanitizeName(firstM[1].trim());
        if (nameScore(lastName) > 0.2 && nameScore(firstName) > 0.2) {
          const full = `${firstName} ${lastName}`;
          if (nameScore(full) > 0.4) {
            return { value: full, confidence: line.confidence };
          }
        }
      }
    }

    // Strategy D: Positional — UPPERCASE name lines in the upper half of the card
    const allYs = lines.map(l => l.y);
    const minY  = Math.min(...allYs);
    const maxY  = Math.max(...allYs);
    const ySpread = maxY - minY;
    const topThreshold = ySpread > 5 ? maxY * 0.65 : Infinity;

    const candidates = lines
      .filter(l => {
        if (l.text.trim().length < 3)        return false;
        if (l.y > topThreshold)              return false;
        if (isHeaderNoise(l.text))           return false;
        if (/\d{3,}/.test(l.text))           return false;
        if (/[:\-]/.test(l.text))            return false;
        if (/^class\b/i.test(l.text))        return false;
        if (/\b(?:street|st|ave|blvd|rd|dr|ln|ct|apt|ste|hwy|way|pkwy)\b/i.test(l.text)) return false;
        // Sanitize before scoring — removes trailing digits/noise (e.g., "MICHELLE, MARIE D 8" → "MICHELLE MARIE D")
        return nameScore(sanitizeName(l.text.trim())) > 0.4;
      })
      .sort((a, b) => b.y - a.y);

    if (candidates.length > 0) {
      // Try to combine adjacent candidate pairs
      if (candidates.length >= 2) {
        let bestCombined: NameResult | null = null;
        for (let ci = 0; ci < candidates.length; ci++) {
          const cand = candidates[ci];
          const candIdx = lines.indexOf(cand);

          for (const delta of [-1, -2, 1, 2]) {
            const nearIdx = candIdx + delta;
            if (nearIdx < 0 || nearIdx >= lines.length) continue;
            const near = lines[nearIdx];
            if (!near || isHeaderNoise(near.text) || /\d{3,}/.test(near.text)) continue;
            if (nameScore(near.text) <= 0.2) continue;
            const combined = near.y > cand.y
              ? sanitizeName(`${sanitizeName(near.text.trim())} ${sanitizeName(cand.text.trim())}`)
              : sanitizeName(`${sanitizeName(cand.text.trim())} ${sanitizeName(near.text.trim())}`);
            if (nameScore(combined) > 0.5 &&
                (!bestCombined || nameScore(combined) > nameScore(bestCombined.value))) {
              bestCombined = {
                value:      combined,
                confidence: (cand.confidence + near.confidence) / 2,
              };
            }
          }
        }
        // Three-line name assembly
        let bestTriplet: NameResult | null = null;
        for (let ci = 0; ci < candidates.length; ci++) {
          const cand = candidates[ci];
          const candIdx = lines.indexOf(cand);
          for (const [d1, d2] of [[-2, -1], [-1, 1], [1, 2]] as const) {
            const idx1 = candIdx + d1;
            const idx2 = candIdx + d2;
            if (idx1 < 0 || idx1 >= lines.length) continue;
            if (idx2 < 0 || idx2 >= lines.length) continue;
            const l1 = lines[idx1];
            const l2 = lines[idx2];
            if (!l1 || !l2) continue;
            if (isHeaderNoise(l1.text) || isHeaderNoise(l2.text)) continue;
            if (/\d{3,}/.test(l1.text) || /\d{3,}/.test(l2.text)) continue;
            if (/^\s*[89]\s/.test(l1.text) || /^\s*[89]\s/.test(l2.text)) continue;
            if (/\b(?:street|st|ave|blvd|rd|dr|ln|ct|apt|ste|hwy|way|pkwy)\b/i.test(l1.text)) continue;
            if (/\b(?:street|st|ave|blvd|rd|dr|ln|ct|apt|ste|hwy|way|pkwy)\b/i.test(l2.text)) continue;
            const t1 = sanitizeName(l1.text.replace(/^[12]+\s*/, '').trim());
            const t2 = sanitizeName(l2.text.replace(/^[12]+\s*/, '').trim());
            const tc = sanitizeName(cand.text.replace(/^[12]+\s*/, '').trim());
            if (!t1 || !t2 || !tc) continue;
            if (nameScore(t1) <= 0.2 || nameScore(t2) <= 0.2) continue;
            const sorted = [
              { text: tc, y: cand.y },
              { text: t1, y: l1.y },
              { text: t2, y: l2.y },
            ].sort((a, b) => a.y - b.y);
            const combined = sanitizeName(`${sorted[1].text} ${sorted[2].text} ${sorted[0].text}`);
            if (nameScore(combined) > 0.5 && combined.split(/\s+/).length >= 3) {
              if (!bestTriplet || nameScore(combined) > nameScore(bestTriplet.value)) {
                bestTriplet = {
                  value:      combined,
                  confidence: (cand.confidence + l1.confidence + l2.confidence) / 3,
                };
              }
            }
          }
        }
        if (bestTriplet) return bestTriplet;
        if (bestCombined) return bestCombined;
      }

      // Single best candidate
      const best = candidates.sort((a, b) => nameScore(b.text) - nameScore(a.text))[0];
      const cleaned = sanitizeName(best.text.trim());
      if (nameScore(cleaned) > 0.4) {
        // If there's a single-word fallback (likely LN from Strategy A), combine with this FN
        if (acc.fallback && acc.fallback.value.split(/\s+/).length === 1 &&
            !cleaned.toLowerCase().includes(acc.fallback.value.toLowerCase())) {
          const combined = `${cleaned} ${acc.fallback.value}`;
          if (nameScore(combined) > 0.4) {
            return { value: combined, confidence: (best.confidence + acc.fallback.confidence) / 2 };
          }
        }
        const result = acc.tryReturn({ value: cleaned, confidence: best.confidence });
        if (result) return result;
      }
    }

    // Partial name completion
    if (acc.fallback && acc.fallback.value.split(/\s+/).length === 1) {
      const singleWord = acc.fallback.value;
      const sourceLine = lines.find(l =>
        sanitizeName(l.text.replace(/^[12]+\s*/, '')).includes(singleWord)
      );
      if (sourceLine) {
        const sourceIdx = lines.indexOf(sourceLine);
        for (const delta of [-1, 1, -2, 2, -3, 3]) {
          const nearIdx = sourceIdx + delta;
          if (nearIdx < 0 || nearIdx >= lines.length) continue;
          const near = lines[nearIdx];
          if (!near) continue;
          const nearText = sanitizeName(near.text.replace(/^[12]+\s*/, '').trim());
          if (!nearText || nearText === singleWord) continue;
          if (isHeaderNoise(nearText) || /\d{3,}/.test(nearText)) continue;
          if (nameScore(nearText) <= 0.2) continue;
          const combined = near.y > sourceLine.y
            ? `${nearText} ${singleWord}`
            : `${singleWord} ${nearText}`;
          if (nameScore(combined) > 0.5) {
            return { value: combined, confidence: (acc.fallback!.confidence + near.confidence) / 2 };
          }
        }

        // Second pass: extract leading name from blob lines
        for (const delta of [-1, 1, -2, 2]) {
          const nearIdx = sourceIdx + delta;
          if (nearIdx < 0 || nearIdx >= lines.length) continue;
          const near = lines[nearIdx];
          if (!near) continue;
          const aamvaM = near.text.match(/^\s*([12])\s*/);
          const stripped = near.text.replace(/^\s*[12]\s*/, '').trim();
          const namePartM = stripped.match(/^([A-Z][A-Z'\-\s]*?)(?:\s+(?:8\s|\d{2,}|[A-Z]{1,2}\s+\d))/);
          if (!namePartM) continue;
          const namePart = sanitizeName(namePartM[1].trim());
          if (!namePart || namePart === singleWord) continue;
          if (isHeaderNoise(namePart) || nameScore(namePart) <= 0.2) continue;
          let combined: string;
          if (aamvaM && aamvaM[1] === '2') {
            combined = `${namePart} ${singleWord}`;
          } else if (aamvaM && aamvaM[1] === '1') {
            combined = `${singleWord} ${namePart}`;
          } else {
            // No AAMVA hint — try both orders, pick higher nameScore
            const opt1 = `${singleWord} ${namePart}`;
            const opt2 = `${namePart} ${singleWord}`;
            combined = nameScore(opt1) >= nameScore(opt2) ? opt1 : opt2;
          }
          if (nameScore(combined) > 0.4) {
            return { value: combined, confidence: (acc.fallback!.confidence + near.confidence) / 2 };
          }
        }
      }
    }

    // Strategy E: Extract name appended to header line (e.g. NV: "NEVADA DRIVER LICENSE SMITH")
    if (!acc.fallback || acc.fallback.value.split(/\s+/).length < 2) {
      const HEADER_KW = /^(?:DRIVER|LICENSE|IDENTIFICATION|LICENCE|STATE|DEPARTMENT|CARD|MOTOR|VEHICLE|PERMIT)$/i;
      for (const line of lines) {
        const text = line.text.trim();
        const headerMatch = text.match(
          /^(?:.*(?:DRIVER|LICENSE|IDENTIFICATION|LICENCE|STATE|DEPARTMENT).*?)\s+([A-Z][A-Z]{2,})$/
        );
        if (headerMatch) {
          const candidate = headerMatch[1];
          if (!isHeaderNoise(candidate) && !HEADER_KW.test(candidate) &&
              !DL_FIELD_TOKENS.has(candidate.toLowerCase()) && nameScore(candidate) > 0) {
            const result = acc.tryReturn({ value: candidate, confidence: line.confidence });
            if (result) return result;
          }
        }
      }
    }

    return acc.fallback;
  }

  private extractNameFromLine(
    labelLine:  LabelMapEntry,
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
    labelMap: Map<string, LabelMapEntry>,
  ): NameResult | null {

    const dobLabelLine = labelMap.get('dob');

    // Strategy A: Value on same line as DOB label
    if (dobLabelLine) {
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

    // Strategy D: Scan for a date preceded by a DOB-like label
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
    labelMap: Map<string, LabelMapEntry>,
  ): NameResult | null {

    const expLabelLine = labelMap.get('expiry');

    if (expLabelLine) {
      const afterLabel = this.valueAfterLabel(
        expLabelLine.text,
        /\b(?:EXP(?:IRY|IRES)?|EXPIRATION|VALID\s*UNTIL)\b/i,
      );
      if (afterLabel) {
        const dates = findAllDates(afterLabel);
        if (dates.length > 0) {
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
    labelMap: Map<string, LabelMapEntry>,
  ): NameResult | null {
    const CITY_STATE_RE = /[A-Z][A-Z\s]+,?\s+[A-Z]{2}[.,\s]+\d{5}/;
    const SUFFIX_ALT = 'ST(?:REET)?|AVE(?:NUE)?|BLVD|BOULEVARD|DR(?:IVE)?|RD|ROAD|LN|LANE|WAY|CT|COURT|PL(?:ACE)?|TER(?:RACE)?|CIR(?:CLE)?|HWY|HIGHWAY|PKWY|PARKWAY|SQ(?:UARE)?|TPKE|TURNPIKE|TRL|TRAIL';
    const STREET_SUFFIXES = new RegExp(`\\b(?:${SUFFIX_ALT})\\b`, 'i');
    // Helper: test CITY_STATE_RE against uppercase version of text (handles mixed-case OCR like "Nd")
    const hasCityStateZip = (s: string) => CITY_STATE_RE.test(s.toUpperCase());

    // Fix 5: Aggressive "8"/"9" stripping — handles both "8 123" and merged "8123"
    const normalizeAddr = (s: string) =>
      s.replace(/^[12]\s+[A-Z]+(?:\s+[A-Z]\.?)?\s+(?:\d\s+)?(?=\d{2,5}\s+[A-Z])/i, '') // strip AAMVA name prefix before house number
       .replace(/^[89]\s+/, '')        // "8 123 MAIN" → "123 MAIN"
       .replace(/^8([1-9]\d{2,4}\s)/, '$1') // "8123 MAIN" → "123 MAIN" (preserves "812 MAIN", "80 MAIN")
       .replace(/,/g, ' ')
       .replace(/\./g, '')             // "ST." → "ST"
       .replace(/([A-Z])-([A-Z])/gi, '$1 $2') // "SAMPLE-STREET" → "SAMPLE STREET" (preserves zip hyphens)
       .replace(/\s\d\s+(?=APT|STE|SUITE|UNIT|#|BLDG)/gi, ' ') // "STREET 6 APT" → "STREET APT"
       .replace(/\s[a-z]\s(?=[A-Z])/g, ' ')   // "BOULEVARD n NEW" → "BOULEVARD NEW"
       .replace(/\b((?:APT|STE|SUITE|UNIT)\s+\d+)\s+[A-Z]\s/gi, '$1 ') // "APT 2 R TOPEKA" → "APT 2 TOPEKA"
       .replace(/\s+/g, ' ')
       .replace(/(\d{5}(?:-?\d{4})?)\s+[A-Z]{1,4}$/, '$1') // strip trailing noise after zip
       .replace(/\b([A-Za-z]{2})\s+(\d{5})\b/, (_, st, zip) => st.toUpperCase() + ' ' + zip) // normalize state code case
       .trim();

    // Fix 1: Normalize a raw OCR line — trim whitespace + strip AAMVA [89] prefix + leading/trailing noise
    const normLine = (raw: string) => raw.trim()
      .replace(/^[89]\s+/, '')
      .replace(/^[a-z]\s+/, '')       // strip single leading lowercase noise char (e.g. VT "s 123 STREET")
      .replace(/\s+[89]$/, '');       // strip trailing AAMVA digit noise (e.g. "STREET ADDRESS  8")

    // Fix 4: Collect apartment/unit lines between street and city
    const isAamvaNameLine = (s: string) => /^[12]\s+[A-Z]/i.test(s);

    const findAddressBlock = (startIdx: number): { apt: string; city: string } | null => {
      let apt = '';
      for (let offset = 1; offset <= 5 && startIdx + offset < lines.length; offset++) {
        const candidate = normLine(lines[startIdx + offset].text);
        if (hasCityStateZip(candidate)) {
          // Extract just the city/state/zip portion from potentially noisy blob lines
          const upperCandidate = candidate.toUpperCase();
          const cityMatch = upperCandidate.match(
            /([A-Z][A-Z\s]+,?\s+[A-Z]{2}[.,\s]+\d{5}(?:-\d{4})?)/
          );
          let city = cityMatch ? cityMatch[1] : upperCandidate;
          // Grab APT/UNIT if it follows the zip on the same line
          const afterZip = upperCandidate.slice(upperCandidate.indexOf(city) + city.length);
          const aptAfterZip = afterZip.match(/\s*((?:APT|STE|SUITE|UNIT)\s*\.?\s*\d+)/i);
          if (aptAfterZip) {
            apt += ' ' + aptAfterZip[1].replace(/\./g, '');
          }
          city = city
            .replace(/^(?:CLAS[SA]?\s+\S+\s+)/i, '')       // "CLASA C SACRAMENTO" → "SACRAMENTO"
            .replace(/^(?:\d+[a-z]?\s+(?![\d]))/i, '');     // "9 CLASS" etc
          return { apt, city };
        }
        // Skip AAMVA name prefix lines (e.g. "1 SAMPLE", "2 BRENDA T")
        if (isAamvaNameLine(candidate)) continue;
        // Skip single-char noise lines and all-lowercase/gibberish lines
        if (candidate.length <= 2) continue;
        if (/^[a-z]+$/i.test(candidate) && !/\b(?:APT|STE|SUITE|UNIT|BLDG)\b/i.test(candidate) && !/\d/.test(candidate)) continue;
        // Intermediate line — apartment/unit or additional address line
        if (/\b(?:APT|STE|SUITE|UNIT|#|BLDG|FL|FLOOR)\b/i.test(candidate) ||
            (candidate.length < 25 &&
             !/\b(?:SEX|HGT|EYE|CLAS|CLASS|END|REST|RESTR|EXP|ISS|DOB|DONOR|VETERAN)\b/i.test(candidate) &&
             !/\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}/.test(candidate) &&
             !/\b(?:4[ab]|15|16|17|18)\s/.test(candidate))) {
          apt += ' ' + candidate;
        }
      }
      return null;
    };

    // Strategy A: Label-based
    const labelLine = labelMap.get('address');
    if (labelLine) {
      // If the label line IS a street address (e.g. "8123 STREET ADDRESS"), use it as street
      const normLabelText = normLine(labelLine.text);
      if (/^\d{1,5}\s+[A-Z]/.test(normLabelText) && normLabelText.length > 5) {
        let address = normLabelText;
        const block = findAddressBlock(labelLine.lineIndex);
        if (block) address += block.apt + ' ' + block.city;
        return { value: normalizeAddr(address), confidence: labelLine.confidence };
      }

      const afterLabel = this.valueAfterLabel(labelLine.text, /\bADDR(?:ESS)?\b/i);
      if (afterLabel && afterLabel.length > 5) {
        // Guard: if afterLabel looks like a continuation ("LINE 1", "LINE 2")
        // rather than a real address, use the full AAMVA-stripped label text instead
        let address = /^\s*LINE\s+\d/i.test(afterLabel)
          ? normLine(labelLine.text)
          : afterLabel;
        const block = findAddressBlock(labelLine.lineIndex);
        if (block) address += block.apt + ' ' + block.city;
        return { value: normalizeAddr(address), confidence: labelLine.confidence };
      }

      const aamvaM = labelLine.text.match(/^8\s+(.+)/);
      if (aamvaM) {
        const aamvaVal = aamvaM[1].trim();
        const isLabel = /\baddr(?:ess)?\b/i.test(aamvaVal);
        if (!isLabel && aamvaVal.length > 5) {
          let address = aamvaVal;
          const block = findAddressBlock(labelLine.lineIndex);
          if (block) address += block.apt + ' ' + block.city;
          return { value: normalizeAddr(address), confidence: labelLine.confidence };
        }
        if (isLabel) {
          const streetLine = lines[labelLine.lineIndex + 1];
          if (streetLine && streetLine.text.trim().length > 5) {
            let address = streetLine.text.trim();
            const block = findAddressBlock(labelLine.lineIndex + 1);
            if (block) address += block.apt + ' ' + block.city;
            return { value: normalizeAddr(address), confidence: streetLine.confidence };
          }
        }
      }

      const nextText = this.nextLineText(lines, labelLine.lineIndex);
      if (nextText && nextText.length > 5) {
        let address = nextText;
        const block = findAddressBlock(labelLine.lineIndex + 1);
        if (block) address += block.apt + ' ' + block.city;
        return { value: normalizeAddr(address), confidence: labelLine.confidence };
      }
    }

    // Strategy B: Line matching street address pattern (with Fix 1 normalization)
    const addrLines: FlatLine[] = [];

    for (const line of lines) {
      const text = normLine(line.text);
      if (/^\d{1,5}\s+[A-Z]/.test(text) && STREET_SUFFIXES.test(text)) {
        addrLines.push(line);
      }
    }

    // Fix 6: Relax suffix — accept street without suffix if city follows
    if (addrLines.length === 0) {
      for (let i = 0; i < lines.length; i++) {
        const text = normLine(lines[i].text);
        if (/^\d{1,5}\s+[A-Z]/i.test(text) &&
            !isAamvaNameLine(text) &&
            text.split(/\s+/).length >= 2) {
          const block = findAddressBlock(i);
          if (block) {
            addrLines.push(lines[i]);
            break;
          }
        }
      }
    }

    if (addrLines.length > 0) {
      const firstLine = addrLines[0];
      const firstIdx  = lines.indexOf(firstLine);
      let address = normLine(firstLine.text);
      const block = findAddressBlock(firstIdx);
      if (block) address += block.apt + ' ' + block.city;
      return { value: normalizeAddr(address), confidence: firstLine.confidence };
    }

    // Fix 2: Strategy B.5 — address embedded mid-line after "8 " prefix (e.g. CT)
    for (const line of lines) {
      const m = line.text.match(/\b8\s+(\d{1,5}\s+[A-Z].+)/);
      if (m) {
        const candidate = m[1];
        if (STREET_SUFFIXES.test(candidate) || /\d{5}/.test(candidate)) {
          let address = candidate;
          const idx = lines.indexOf(line);
          const block = findAddressBlock(idx);
          if (block) address += block.apt + ' ' + block.city;
          return { value: normalizeAddr(address), confidence: line.confidence };
        }
      }
    }

    // Fix 3: Strategy C — reverse city/state/zip lookup, work backwards for street
    for (let i = 0; i < lines.length; i++) {
      const text = normLine(lines[i].text);
      if (!hasCityStateZip(text)) continue;

      // Check if the same line also has street (combined line like IL)
      const upperText = text.toUpperCase();
      const combined = upperText.match(/^(\d{2,5}\s+.+?)\s+((?:[A-Z][A-Z\s]+,?\s+)?[A-Z]{2}[,\s]+\d{5}.*)$/);
      if (combined && !/\b(?:4d|DL[#:]|LIC|DOB|EXP|ISS)\b/i.test(combined[1])) {
        return { value: normalizeAddr(combined[1] + ' ' + combined[2]), confidence: lines[i].confidence };
      }

      // Look at 1-3 preceding lines for street address
      for (let back = 1; back <= 3 && i - back >= 0; back++) {
        const prev = normLine(lines[i - back].text);
        // Must start with house number, but skip AAMVA name/field prefixes and DL field lines
        if (/^\d{1,5}\s+[A-Z]/.test(prev) &&
            !/^[12]\s+[A-Z]{2,}$/i.test(prev) &&
            !/^\d{2}\s+[A-Z]/i.test(prev) &&              // skip AAMVA numeric fields (15 SEX, 16 HGT, 18 EYES)
            !/\b(?:4d|DL[#:]|LIC)/i.test(prev)) {
          // Require street suffix OR the line is 3+ words (avoids single-word name matches)
          if (!STREET_SUFFIXES.test(prev) && prev.split(/\s+/).length < 2) continue;
          // Collect intermediate lines (APT, Suite, etc.)
          let address = prev;
          for (let mid = i - back + 1; mid < i; mid++) {
            const midText = normLine(lines[mid].text);
            if (/\b(?:APT|STE|SUITE|UNIT|#|BLDG|FL|FLOOR)\b/i.test(midText) ||
                (midText.length < 25 &&
                 !/\b(?:SEX|HGT|EYE|CLAS|CLASS|END|REST|RESTR|EXP|ISS|DOB|DONOR|VETERAN)\b/i.test(midText) &&
                 !/\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}/.test(midText) &&
                 !/\b(?:4[ab]|15|16|17|18)\s/.test(midText))) {
              address += ' ' + midText;
            }
          }
          address += ' ' + text;
          return { value: normalizeAddr(address), confidence: lines[i].confidence };
        }
      }
    }

    // Strategy D: Address embedded mid-line (blob lines with name + address)
    const STRATEGY_D_RE = new RegExp(`(\\d{1,5}\\s+[A-Z][A-Z\\s]+(?:${SUFFIX_ALT})\\b.+?\\d{5}(?:-\\d{4})?)`, 'i');
    for (const line of lines) {
      const text = normLine(line.text);
      if (!hasCityStateZip(text)) continue;
      // Find digit-led street number inside the line (not necessarily at start)
      const m = text.match(STRATEGY_D_RE);
      if (m) {
        let address = m[1];
        // Strip trailing noise after zip+4 (e.g. "TUEBOR", "9 9")
        address = address.replace(/(\d{5}(?:-\d{4})?)\s+.*$/, '$1');
        // Check if APT is between street and city
        const aptMatch = text.match(/(\d{5}(?:-\d{4})?)\s+((?:APT|STE|SUITE|UNIT)\s*\.?\s*\d*)/i);
        if (aptMatch) {
          const aptPart = aptMatch[2].replace(/\./g, '');
          address = address.replace(aptMatch[1], aptPart + ' ' + aptMatch[1]);
        }
        return { value: normalizeAddr(address), confidence: line.confidence };
      }
      // Fallback: no suffix but digit-led + city pattern on same line
      const upperText = text.toUpperCase();
      const m2 = upperText.match(/(\d{1,5}\s+\S.+?\s+[A-Z]{2}[.,\s]+\d{5}(?:-\d{4})?)/);
      if (m2 && m2[1].split(/\s+/).length >= 4 && !/\b(?:4D|DL[#:]|LIC|DOB|EXP|ISS)\b/.test(m2[1])) {
        let address = m2[1];
        address = address.replace(/(\d{5}(?:-\d{4})?)\s+.*$/, '$1');
        return { value: normalizeAddr(address), confidence: line.confidence };
      }
    }

    return null;
  }

  // ── Physical descriptors ───────────────────────────────────

  private extractPhysicalDescriptors(lines: FlatLine[], ocrData: OCRData): void {
    for (const line of lines) {
      const text = line.text;

      if (!ocrData.sex) {
        const sexM = text.match(/\b(?:SEX|GENDER)\s*[:\s]\s*([MF])\b/i)
          ?? text.match(/\bSEX\s+([MF])\b/i);
        if (sexM) {
          ocrData.sex = sexM[1].toUpperCase();
          ocrData.confidence_scores!.sex = line.confidence;
        }
      }

      if (!ocrData.height) {
        const htM = text.match(/(?:HGT|HT|HEIGHT)\s*[:\s]*(\d\s*['′\-]\s*\d{1,2}["″]?)/i)
          ?? text.match(/\b(\d['′]\s*-?\s*\d{2}["″]?)\b/);
        if (htM) {
          ocrData.height = htM[1].replace(/\s+/g, '');
          ocrData.confidence_scores!.height = line.confidence;
        }
      }

      if (!ocrData.eye_color) {
        const eyeM = text.match(/\bEYES?\s*[:\s]*([A-Z]{2,4})\b/i);
        if (eyeM && !DL_FIELD_TOKENS.has(eyeM[1].toLowerCase())) {
          ocrData.eye_color = eyeM[1].toUpperCase();
          ocrData.confidence_scores!.eye_color = line.confidence;
        }
      }
    }

    // Second pass: cross-line sex — label on one line, M/F value on next
    // US DLs: "Date of birth  Sex  Eyes" / "09/29/1979 M BLK" — M is mid-line
    if (!ocrData.sex) {
      for (let i = 0; i < lines.length - 1; i++) {
        if (/\b(?:SEX|GENDER)\b/i.test(lines[i].text)) {
          const nextText = lines[i + 1].text;
          const m = nextText.match(/^\s*([MF])\b/i)
            ?? nextText.match(/\b([MF])\s+[A-Z]{2,4}\b/);
          if (m) {
            ocrData.sex = m[1].toUpperCase();
            ocrData.confidence_scores!.sex = lines[i + 1].confidence;
            break;
          }
        }
      }
    }
  }
}
