/**
 * Tolerant MRZ reading.
 *
 * Ported from the Preuvid community fork (MIT, https://github.com/Boublo/preuvid).
 * Comments and the field-check status values are translated to English; the
 * parsing logic is unchanged.
 *
 * The OCR often returns a nearly-correct MRZ: a few filler `<` dropped or added,
 * a `«` for a `<`, an O read as a 0. This module:
 *   1. finds the lines in the raw text that look like an MRZ;
 *   2. resizes them to the format length (TD1 3x30, French national ID 2x36,
 *      TD2 2x36, TD3 2x44) by growing or shrinking only the existing runs of `<`;
 *   3. decodes with the `mrz` library and keeps only the variant whose check
 *      digits are all valid;
 *   4. if a check digit stays invalid, tries a common confusion (O/0, I/1, B/8,
 *      S/5, Z/2, G/6) on the field at fault. A correction is kept only when a
 *      single variant makes every check digit valid. A field whose check digit
 *      is already valid is never modified.
 *
 * Each field comes out with its status: `verified` (covered by a valid check
 * digit), `corrected` (covered, after a character correction), `failed` (a check
 * digit covering it is invalid), `unchecked` (no check digit covers it: passport
 * name, nationality, sex, ...).
 */

import { parse as parseMRZ } from 'mrz';
import type { ParseResult } from 'mrz';

export type FieldCheck = 'verified' | 'corrected' | 'failed' | 'unchecked';

export interface MrzFieldReading {
  value: string | null;
  check: FieldCheck;
  confidence: number;
}

export interface MrzReading {
  format: string;
  /** Lines after repair (length and characters). */
  lines: string[];
  /** Lines as read by the OCR, after simple cleanup. */
  ocr_lines: string[];
  /** Every check digit is valid (after any correction). */
  valid: boolean;
  /** Character corrections applied (library or common confusions). */
  corrections: { line: number; column: number; original: string; corrected: string }[];
  fields: {
    document_number: MrzFieldReading;
    last_name: MrzFieldReading;
    first_names: MrzFieldReading;
    date_of_birth: MrzFieldReading;
    expiry_date: MrzFieldReading;
    nationality: MrzFieldReading;
    issuing_country: MrzFieldReading;
    sex: MrzFieldReading;
  };
}

const CONFIDENCE: Record<FieldCheck, number> = {
  verified: 0.99,
  corrected: 0.95,
  unchecked: 0.9,
  failed: 0.3,
};

interface Format { lines: number; length: number }
const FORMATS: Format[] = [
  { lines: 3, length: 30 },
  { lines: 2, length: 36 },
  { lines: 2, length: 44 },
  // French driving licence (2013 model): one "D1FRA..." line on the back.
  { lines: 1, length: 30 },
];

/** Tolerated length gap between the read line and the format. */
const MAX_LENGTH_GAP = 8;
/** Caps on variants per line and combinations per block. */
const MAX_VARIANTS_PER_LINE = 60;
const MAX_COMBINATIONS = 6000;

// Characters the OCR returns in place of `<`.
const FILLER_LOOKALIKES = /[«‹≤(\[{]/g;

/** Cleans an OCR line; returns null if it cannot be an MRZ line. */
export function normalizeMrzLine(raw: string): string | null {
  const s = raw
    .toUpperCase()
    .replace(FILLER_LOOKALIKES, '<')
    .replace(/\s+/g, '');
  // A heavily truncated name line ("IDFRALEFEBVRE<<<<SS"): accepted from 12
  // characters if it contains a double `<`; cleanNameLine completes it.
  const minLength = s.includes('<<') ? 12 : 30 - MAX_LENGTH_GAP;
  if (s.length < minLength || s.length > 44 + MAX_LENGTH_GAP) return null;
  if (!/^[A-Z0-9<]+$/.test(s)) return null;
  // An MRZ line almost always contains filler; without `<`, require at least a
  // majority of digits (a full TD1 second line, for example).
  if (!s.includes('<') && (s.match(/\d/g)?.length ?? 0) < s.length / 2) return null;
  return s;
}

interface Run { start: number; length: number }

function fillerRuns(s: string): Run[] {
  const runs: Run[] = [];
  const re = /<+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) runs.push({ start: m.index, length: m[0].length });
  return runs;
}

function resizeRuns(s: string, runs: Run[], deltas: number[]): string {
  let out = '';
  let pos = 0;
  runs.forEach((r, i) => {
    out += s.slice(pos, r.start) + '<'.repeat(r.length + deltas[i]);
    pos = r.start + r.length;
  });
  return out + s.slice(pos);
}

/**
 * Variants of a line at the target length, touching only the runs of `<`.
 * Order: the last run first (the trailing filler is most often truncated), then
 * another run alone, then two runs. A run never disappears.
 */
export function fitLineVariants(s: string, length: number): string[] {
  const gap = length - s.length;
  if (gap === 0) return [s];
  if (Math.abs(gap) > MAX_LENGTH_GAP) return [];

  let runs = fillerRuns(s);
  let base = s;
  if (gap > 0 && (runs.length === 0 || runs[runs.length - 1].start + runs[runs.length - 1].length !== s.length)) {
    // Trailing filler fully lost: recreate it at the end of the line.
    base = s + '<';
    runs = fillerRuns(base);
    return fitLineVariants(base, length);
  }
  if (runs.length === 0) return [];

  const out: string[] = [];
  const seen = new Set<string>();
  const push = (deltas: number[]) => {
    if (runs.some((r, i) => r.length + deltas[i] < 1)) return;
    const v = resizeRuns(base, runs, deltas);
    if (v.length === length && !seen.has(v)) { seen.add(v); out.push(v); }
  };

  const order = runs.map((_, i) => runs.length - 1 - i);
  for (const i of order) {
    const d = runs.map(() => 0); d[i] = gap; push(d);
  }
  const step = gap > 0 ? 1 : -1;
  for (const i of order) {
    for (const j of order) {
      if (j >= i) continue;
      for (let a = step; Math.abs(a) < Math.abs(gap); a += step) {
        const d = runs.map(() => 0); d[i] = a; d[j] = gap - a; push(d);
        if (out.length >= MAX_VARIANTS_PER_LINE) return out;
      }
    }
  }
  return out.slice(0, MAX_VARIANTS_PER_LINE);
}

function safeParse(lines: string[]): ParseResult | null {
  try {
    return parseMRZ(lines, { autocorrect: true });
  } catch {
    return null;
  }
}

const isCheckField = (f: string | null) => !!f && f.endsWith('CheckDigit');

function checkScore(r: ParseResult): number {
  return r.details.filter(d => isCheckField(d.field) && d.valid).length
    - r.details.filter(d => isCheckField(d.field) && !d.valid).length;
}

// Fields whose invalidity (unknown country code, digit in a name) does not call
// the others into question: flagged `failed` one by one, without invalidating
// the whole reading.
const SOFT_FIELDS = new Set(['issuingState', 'nationality', 'lastName', 'firstName']);

function allChecksValid(r: ParseResult): boolean {
  const checks = r.details.filter(d => isCheckField(d.field));
  return checks.length > 0
    && checks.every(d => d.valid)
    && r.details.every(d => d.valid || !d.field || SOFT_FIELDS.has(d.field));
}

/** Values of the check-digit-protected fields: two valid readings must share them. */
function protectedSignature(r: ParseResult): string {
  return r.details
    .filter(d => d.field && isCovered(r, d.line, d.start, d.end))
    .map(d => `${d.field}=${d.value ?? ''}`)
    .join('|');
}

function isCovered(r: ParseResult, line: number, start: number, end: number): boolean {
  if (end <= start) return false;
  return r.details.some(d =>
    isCheckField(d.field) &&
    (d.ranges ?? []).slice(1).some(g => g.line === line && g.start <= start && g.end >= end),
  );
}

// Common confusions, in both directions.
const CONFUSIONS: Record<string, string[]> = {
  '0': ['O', 'D', 'Q'], O: ['0'], D: ['0'], Q: ['0'],
  '1': ['I', 'L'], I: ['1'], L: ['1'],
  '8': ['B'], B: ['8'],
  '5': ['S'], S: ['5'],
  '2': ['Z'], Z: ['2'],
  '6': ['G'], G: ['6'],
};

/** Digit read in a zone that allows only letters (driving-licence name). */
const DIGIT_TO_LETTER: Record<string, string> = { '0': 'O', '1': 'I', '2': 'Z', '5': 'S', '6': 'G', '8': 'B' };

/**
 * Repair by check digits: on each zone covered by an invalid check digit, try a
 * substitution. Returns the corrected reading only when it is unique. No double
 * substitution: on the benchmark it found readings valid per the check digits but
 * wrong (TK21Z read TK2ZZ, returned TKZ2Z).
 */
function repairByCheckDigits(lines: string[], parsed: ParseResult): { lines: string[]; parsed: ParseResult } | null {
  const failing = parsed.details.filter(d => isCheckField(d.field) && !d.valid);
  if (failing.length === 0) return null;

  // Candidate positions: the characters covered by an invalid check digit, minus
  // positions covered by a valid check digit (never modify a field whose check
  // digit is valid).
  const validRanges = parsed.details
    .filter(d => isCheckField(d.field) && d.valid)
    .flatMap(d => d.ranges ?? []);
  const lockedPos = new Set<string>();
  for (const g of validRanges) for (let c = g.start; c < g.end; c++) lockedPos.add(`${g.line}:${c}`);

  const positions: { line: number; col: number }[] = [];
  const seenPos = new Set<string>();
  for (const d of failing) {
    for (const g of d.ranges ?? []) {
      for (let c = g.start; c < g.end; c++) {
        const k = `${g.line}:${c}`;
        if (lockedPos.has(k) || seenPos.has(k)) continue;
        if (!CONFUSIONS[lines[g.line][c]]) continue;
        seenPos.add(k);
        positions.push({ line: g.line, col: c });
      }
    }
  }
  if (positions.length === 0 || positions.length > 24) return null;

  const substitute = (src: string[], subs: { line: number; col: number; ch: string }[]) => {
    const out = [...src];
    for (const s of subs) out[s.line] = out[s.line].slice(0, s.col) + s.ch + out[s.line].slice(s.col + 1);
    return out;
  };

  const solutions = new Map<string, { lines: string[]; parsed: ParseResult }>();
  const tryCandidate = (cand: string[]) => {
    const r = safeParse(cand);
    if (r && allChecksValid(r)) solutions.set(protectedSignature(r), { lines: cand, parsed: r });
  };

  for (const p of positions) {
    for (const ch of CONFUSIONS[lines[p.line][p.col]]) tryCandidate(substitute(lines, [{ ...p, ch }]));
  }
  if (solutions.size !== 1) return null;
  return [...solutions.values()][0];
}

/**
 * Name line (line 1 of the passport, line 3 of the 2021 national ID): no check
 * digit covers it and the names are cross-checked against the printed zone. Cut
 * at the first run of 3 or more `<` (given names are separated by a single `<`),
 * which drops the end-of-line noise, then pad with `<`, however many `<` were lost.
 */
export function cleanNameLine(line: string, length: number): string | null {
  const m = /<{3,}/.exec(line);
  const base = m ? line.slice(0, m.index) : line.replace(/<+$/, '');
  if (base.length >= length - 2) return null;
  return base.padEnd(length, '<');
}

const levenshtein1 = (a: string, b: string) => {
  // True if b is obtained from a by at most one substitution, insertion, or deletion.
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0; while (i < a.length && i < b.length && a[i] === b[i]) i++;
  if (a.length === b.length) return a.slice(i + 1) === b.slice(i + 1);
  return a.length > b.length ? a.slice(i + 1) === b.slice(i) : a.slice(i) === b.slice(i + 1);
};

/**
 * Issuing-state code mis-read at the start of line 1 ("P<FAMOREAU", "P<F<AMOREAU"):
 * restore it from the data line's nationality if it differs by one character. The
 * state code is covered by no check digit; it stays flagged as such.
 */
function repairHeader(lines: string[], format: Format): string[] {
  // Old national ID: "IDFRA" read "DFRA" or "IFRA" (one letter lost at the start).
  // That card's composite check digit covers the whole first line and decides.
  if (format.length === 36 && lines.length === 2 && /^[ID]FRA/.test(lines[0])) {
    lines = ['IDFRA' + lines[0].slice(4), ...lines.slice(1)];
  }
  let stateLine: string | null = null;
  if (format.length === 44 && lines.length === 2) stateLine = lines[1].length >= 13 ? lines[1].slice(10, 13) : null;
  if (format.length === 30 && lines.length === 3) stateLine = lines[1].length >= 18 ? lines[1].slice(15, 18) : null;
  if (format.length === 36 && lines.length === 2 && lines[0].startsWith('ID')) {
    // TD2: nationality on line 2; French national ID: no nationality, the state is France.
    const nat = lines[1].length >= 13 ? lines[1].slice(10, 13) : '';
    stateLine = /^[A-Z]{3}$/.test(nat) ? nat : 'FRA';
  }
  if (!stateLine || !/^[A-Z]{3}$/.test(stateLine)) return lines;
  const l0 = lines[0];
  if (l0.slice(2, 5) === stateLine) return lines;
  // TD1: a residence permit is issued by France for a foreigner, so the issuing
  // state normally differs from the nationality. Rewrite only when the header is
  // not three letters.
  if (format.length === 30 && /^[A-Z]{3}$/.test(l0.slice(2, 5))) return lines;
  for (const cut of [4, 5, 6]) {
    if (levenshtein1(l0.slice(2, cut), stateLine)) {
      return [l0.slice(0, 2) + stateLine + l0.slice(cut), ...lines.slice(1)];
    }
  }
  return lines;
}

/**
 * Line that carries the names: line 1 (passport, pre-2021 French national ID,
 * TD2), line 3 of the TD1. -1 for the driving licence: its name, truncated to 8
 * letters, is taken from the single line without special handling.
 */
function nameLineIndex(format: Format): number {
  if (format.lines === 1) return -1;
  return format.lines === 3 ? 2 : 0;
}

function readBlock(rawBlock: string[], format: Format): { lines: string[]; parsed: ParseResult; before: string[] } | null {
  const block = repairHeader(rawBlock, format);
  const nameLine = nameLineIndex(format);
  const variants = block.map((l, i) => {
    const v = fitLineVariants(l, format.length);
    // Driving licence: the name (positions 21 to 28) has no digits; "0KAF0R" reads
    // OKAFOR. The letters variant is tried first: the composite check digit covers
    // the name but can validate both readings (as with "0KAF0R" / "OKAFOR"), and a
    // name never has a digit.
    if (format.lines === 1) {
      const letters = v.map(x => x.slice(0, 21) + x.slice(21, 29).replace(/[0-9]/g, d => DIGIT_TO_LETTER[d] ?? d) + x.slice(29));
      return [...new Set([...letters, ...v])];
    }
    if (i !== nameLine) return v;
    const cleaned = cleanNameLine(l, format.length);
    return cleaned && !v.includes(cleaned) ? [cleaned, ...v] : v;
  });
  if (variants.some(v => v.length === 0)) return null;

  // Capped cartesian product; the first line varies the slowest.
  const combos: string[][] = [];
  const build = (i: number, acc: string[]) => {
    if (combos.length >= MAX_COMBINATIONS) return;
    if (i === variants.length) { combos.push(acc); return; }
    for (const v of variants[i]) build(i + 1, [...acc, v]);
  };
  build(0, []);

  let best: { lines: string[]; parsed: ParseResult; score: number } | null = null;
  const validBySignature = new Map<string, { lines: string[]; parsed: ParseResult }>();
  for (const c of combos) {
    const r = safeParse(c);
    if (!r) continue;
    if (allChecksValid(r)) {
      const sig = protectedSignature(r);
      // First variant kept for a given signature: the order favours the trailing filler.
      if (!validBySignature.has(sig)) validBySignature.set(sig, { lines: c, parsed: r });
      continue;
    }
    const s = checkScore(r);
    if (!best || s > best.score) best = { lines: c, parsed: r, score: s };
  }

  if (validBySignature.size === 1) {
    const v = [...validBySignature.values()][0];
    return { ...v, before: v.lines };
  }
  if (validBySignature.size > 1) {
    // Several valid, different readings: ambiguous, do not decide.
    const first = [...validBySignature.values()][0];
    return { lines: first.lines, parsed: { ...first.parsed, valid: false }, before: first.lines };
  }
  if (!best) return null;

  const fixed = repairByCheckDigits(best.lines, best.parsed);
  if (fixed) return { ...fixed, before: best.lines };
  return { lines: best.lines, parsed: best.parsed, before: best.lines };
}

function diffCorrections(before: string[], after: string[]) {
  const out: MrzReading['corrections'] = [];
  after.forEach((l, i) => {
    for (let c = 0; c < l.length; c++) {
      if (before[i][c] !== l[c]) out.push({ line: i, column: c, original: before[i][c], corrected: l[c] });
    }
  });
  return out;
}

function fieldReading(
  r: ParseResult,
  field: string,
  value: string | null,
  correctedPositions: Set<string>,
  resizedLines: Set<number> = new Set(),
): MrzFieldReading {
  const d = r.details.find(x => x.field === field);
  if (!d || value === null || value === '') return { value: value || null, check: 'unchecked', confidence: 0 };
  const ranges = (x: ParseResult['details'][number]) => isCheckField(x.field) ? (x.ranges ?? []).slice(1) : [];
  const covering = r.details.filter(x => ranges(x).some(g => g.line === d.line && g.start <= d.start && g.end >= d.end));
  // A check digit covering only part of the field counts too if it is invalid: on
  // the benchmark, a residence permit read "IRFAMVB89..." (a lost letter) gave a
  // long number "VB89YWPD7<<..." whose own check digit was invalid but which the
  // only composite check digit, valid by chance, validated.
  const overlapping = r.details.filter(x => ranges(x).some(g => g.line === d.line && g.start < d.end && g.end > d.start));
  let check: FieldCheck;
  if (!d.valid) check = 'failed';
  else if (overlapping.some(x => !x.valid)) check = 'failed';
  else if (covering.length === 0 || d.end <= d.start) check = 'unchecked';
  else {
    let touched = (d.autocorrect ?? []).length > 0;
    for (let c = d.start; c < d.end && !touched; c++) if (correctedPositions.has(`${d.line}:${c}`)) touched = true;
    check = touched ? 'corrected' : 'verified';
  }
  let confidence = CONFIDENCE[check];
  // Field protected only by the composite check digit (one digit, a 1-in-10 chance
  // of passing by accident) on a line whose length was rebuilt: on the benchmark,
  // "MOREAU" read "MOREU" then padded with < passed the check. Do not present it as sure.
  if ((check === 'verified' || check === 'corrected') && resizedLines.has(d.line)
      && covering.every(x => x.field === 'compositeCheckDigit')) {
    confidence = CONFIDENCE.unchecked;
  }
  return { value, check, confidence };
}

function toIsoDate(yymmdd: string | null | undefined, kind: 'birth' | 'expiry'): string | null {
  if (!yymmdd || !/^\d{6}$/.test(yymmdd)) return null;
  const yy = parseInt(yymmdd.slice(0, 2), 10);
  const current = new Date().getFullYear() % 100;
  const century = kind === 'birth' ? (yy > current ? '19' : '20') : (yy > current + 70 ? '19' : '20');
  return `${century}${yymmdd.slice(0, 2)}-${yymmdd.slice(2, 4)}-${yymmdd.slice(4, 6)}`;
}

function buildReading(ocrLines: string[], lines: string[], parsed: ParseResult, extra: MrzReading['corrections']): MrzReading {
  const libCorrections = parsed.details.flatMap(d => d.autocorrect ?? []).map(a => ({
    line: a.line, column: a.column, original: a.original, corrected: a.corrected,
  }));
  const corrections = [...extra, ...libCorrections];
  const corrected = new Set(corrections.map(c => `${c.line}:${c.column}`));
  const f = parsed.fields as Record<string, string | null | undefined>;
  const resized = new Set(lines.map((l, i) => (l.length !== ocrLines[i].length ? i : -1)).filter(i => i >= 0));

  // Pre-2021 French national ID: the printed number is 12 characters (issue date,
  // administrative code, number); the library splits it into three.
  let docNumber = f.documentNumber ?? null;
  let docField = 'documentNumber';
  if (parsed.format === 'FRENCH_NATIONAL_ID') {
    docNumber = lines[1].slice(0, 12);
    docField = 'documentNumberCheckDigit';
  }
  const sex = f.sex === 'male' ? 'M' : f.sex === 'female' ? 'F' : (f.sex ?? null);

  const docReading = fieldReading(parsed, docField, docNumber, corrected);
  if (docField === 'documentNumberCheckDigit') {
    // The number's check digit covers the first 12 characters of line 2.
    const d = parsed.details.find(x => x.field === 'documentNumberCheckDigit');
    const touched = [...Array(12).keys()].some(c => corrected.has(`1:${c}`));
    docReading.check = !d ? 'unchecked' : !d.valid ? 'failed' : touched ? 'corrected' : 'verified';
    docReading.confidence = CONFIDENCE[docReading.check];
  }

  return {
    format: parsed.format,
    lines,
    ocr_lines: ocrLines,
    valid: allChecksValid(parsed),
    corrections,
    fields: {
      document_number: docReading,
      last_name: fieldReading(parsed, 'lastName', f.lastName ?? null, corrected, resized),
      first_names: fieldReading(parsed, 'firstName', f.firstName ?? null, corrected, resized),
      date_of_birth: { ...fieldReading(parsed, 'birthDate', f.birthDate ?? null, corrected), value: toIsoDate(f.birthDate, 'birth') },
      expiry_date: { ...fieldReading(parsed, 'expirationDate', f.expirationDate ?? null, corrected), value: toIsoDate(f.expirationDate, 'expiry') },
      nationality: fieldReading(parsed, 'nationality', f.nationality ?? null, corrected),
      issuing_country: fieldReading(parsed, 'issuingState', f.issuingState ?? null, corrected),
      sex: { ...fieldReading(parsed, 'sex', f.sex ?? null, corrected), value: sex },
    },
  };
}

/**
 * Finds and reads the MRZ in an OCR text (one line per text line). Returns null
 * if no block looks like a decodable MRZ.
 */
export function readMrzFromText(rawText: string): MrzReading | null {
  if (!rawText) return null;
  // Lines that do not look like an MRZ (blank line, noise) are skipped: the OCR
  // sometimes inserts them between two lines of the band.
  const candidates = rawText.split('\n').map(normalizeMrzLine).filter((l): l is string => l !== null);

  let best: { reading: MrzReading; score: number } | null = null;
  for (const format of FORMATS) {
    for (let i = 0; i + format.lines <= candidates.length; i++) {
      const lines = candidates.slice(i, i + format.lines);
      const nameLine = nameLineIndex(format);
      if (lines.some((l, k) => k !== nameLine && Math.abs(l.length - format.length) > MAX_LENGTH_GAP)) continue;
      if (nameLine >= 0 && lines[nameLine].length > format.length + MAX_LENGTH_GAP) continue;
      // Single line: only a driving licence ("D1"), so as not to read an isolated TD1 line.
      if (format.lines === 1 && !/^D[1I]/.test(lines[0])) continue;

      const read = readBlock(lines, format);
      if (!read) continue;
      const extra = diffCorrections(read.before, read.lines);
      const reading = buildReading(lines, read.lines, read.parsed, extra);
      const score = (reading.valid ? 1000 : 0) + checkScore(read.parsed) * 10
        - lines.reduce((a, l) => a + Math.abs(l.length - format.length), 0);
      if (!best || score > best.score) best = { reading, score };
    }
  }
  return best?.reading ?? null;
}
