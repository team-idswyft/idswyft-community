/**
 * Merge of the MRZ and the printed zone.
 *
 * Ported from the Preuvid community fork (MIT, https://github.com/Boublo/preuvid).
 * Comments and the source/status values are translated to English; the merge
 * logic is unchanged.
 *
 * Rules:
 * - a field whose check digit is invalid is never taken from the MRZ;
 * - a field covered by a valid check digit replaces the printed-zone reading;
 * - a field only "corrected" by the check digits, or with no check digit
 *   (passport and 2021 national ID names), is presented as sure only when the
 *   printed zone says the same thing;
 * - on a name disagreement, the printed zone wins, with a low confidence.
 *
 * "Sure" means confidence >= SURE_CONFIDENCE.
 */

import type { OCRData } from '../../types/index.js';
import type { FieldCheck, MrzReading } from './mrzReader.js';

export const SURE_CONFIDENCE = 0.95;
const DISAGREEMENT_CONFIDENCE = 0.6;

export interface MergedField {
  value: string | null;
  /** Status of the MRZ check digit covering the field. */
  check: FieldCheck | 'absent';
  /** `mrz`, `printed_zone`, or `agree` when both say the same thing. */
  source: 'mrz' | 'printed_zone' | 'agree' | null;
  confidence: number;
}

export type MergedFields = Record<
  'document_number' | 'last_name' | 'first_names' | 'date_of_birth' | 'expiry_date' | 'nationality' | 'sex',
  MergedField
>;

/** Uppercase without accents; MRZ separators and punctuation reduced to a space. */
export function normalizeName(s: string | null | undefined): string {
  return (s ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[<'’\-,]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const compact = (s: string | null | undefined) => (s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');

/** Value printed under a label ("Nom / Surname", next line). */
function valueAfterLabel(lines: string[], label: RegExp): string | null {
  for (let i = 0; i < lines.length - 1; i++) {
    if (label.test(lines[i])) {
      const v = lines[i + 1].trim();
      if (v && !/[\/:]/.test(v)) return v;
    }
  }
  return null;
}

export interface PrintedZone {
  last_name: string | null;
  first_names: string | null;
  document_number: string | null;
  /** Printed date of birth, in ISO format. */
  date_of_birth: string | null;
}

/** Numbered field of the driving licence ("1. LEFEBVRE", "5. 18AB12345"). */
function numberedField(lines: string[], n: string): string | null {
  const re = new RegExp(`^\\s*${n}\\.\\s+(.+?)\\s*$`);
  for (const l of lines) {
    const m = l.match(re);
    if (m) return m[1];
  }
  return null;
}

/**
 * The line after numbered field `n`, when the OCR lost the next field's number
 * (on the bench, "2. WEI" read ". WEI"). Letters only.
 */
function lineAfterNumbered(lines: string[], n: string): string | null {
  const re = new RegExp(`^\\s*${n}\\.\\s+`);
  const i = lines.findIndex(l => re.test(l));
  const m = i >= 0 ? lines[i + 1]?.match(/^\s*[.,]?\s*([A-ZÀ-Ü][A-ZÀ-Ü' -]*?)\s*$/) : null;
  return m ? m[1] : null;
}

function isoFromPrinted(v: string | null): string | null {
  const m = v?.match(/(\d{2})[./ ](\d{2})[./ ](\d{4})/);
  if (!m) return null;
  const [, d, mo, y] = m;
  if (+mo < 1 || +mo > 12 || +d < 1 || +d > 31) return null;
  return `${y}-${mo}-${d}`;
}

/** Reads the French documents' bilingual labels, or the licence's numbered fields. */
export function readPrintedZone(rawText: string): PrintedZone {
  const lines = (rawText ?? '').split('\n');
  const inlineNumber = lines
    .map(l => l.match(/N[°º]\s*:?\s*([A-Z0-9]{9,12})\s*$/i)?.[1] ?? null)
    .find(Boolean) ?? null;
  const permitNumber = numberedField(lines, '5')?.match(/^([A-Z0-9]{9,12})\b/)?.[1] ?? null;
  return {
    last_name: valueAfterLabel(lines, /^\s*Nom\b.*Surname/i) ?? numberedField(lines, '1'),
    first_names: valueAfterLabel(lines, /^\s*Pr[ée]noms?\b.*Given/i) ?? numberedField(lines, '2')
      ?? lineAfterNumbered(lines, '1'),
    document_number: valueAfterLabel(lines, /N[°º]\s*du\s*document|Document\s*No/i) ?? inlineNumber ?? permitNumber,
    date_of_birth: isoFromPrinted(valueAfterLabel(lines, /Date\s*de\s*naissance|Date\s*of\s*birth/i))
      ?? isoFromPrinted(numberedField(lines, '3')),
  };
}

/**
 * @param truncatedAt length at which the MRZ truncates the name (8 for the
 *   licence): a printed zone that starts the same agrees, but the end of the
 *   name is verified by nothing.
 */
function mergeName(mrz: MrzReading['fields']['last_name'], printed: string | null, truncatedAt?: number): MergedField {
  const m = mrz.value && mrz.check !== 'failed' ? normalizeName(mrz.value) : null;
  const p = printed ? normalizeName(printed) : null;
  if (m && p) {
    if (m === p) return { value: m, check: mrz.check, source: 'agree', confidence: 0.99 };
    // Comparison in the MRZ alphabet: "DE LA FONTAINE" is written "DE<LA<FO" over 8 characters.
    const inMrz = (x: string) => x.replace(/ /g, '<').slice(0, truncatedAt);
    if (truncatedAt && p.length > truncatedAt && inMrz(m).length === truncatedAt && inMrz(p) === inMrz(m)) {
      return { value: p, check: mrz.check, source: 'agree', confidence: 0.9 };
    }
    return { value: p, check: mrz.check, source: 'printed_zone', confidence: DISAGREEMENT_CONFIDENCE };
  }
  if (m) return { value: m, check: mrz.check, source: 'mrz', confidence: Math.min(mrz.confidence, 0.9) };
  if (p) return { value: p, check: mrz.value ? mrz.check : 'absent', source: 'printed_zone', confidence: DISAGREEMENT_CONFIDENCE };
  return { value: null, check: 'absent', source: null, confidence: 0 };
}

function mergeChecked(
  mrz: MrzReading['fields']['document_number'],
  printed: string | null,
): MergedField {
  if (!mrz.value || mrz.check === 'failed') {
    return printed
      ? { value: printed, check: mrz.value ? 'failed' : 'absent', source: 'printed_zone', confidence: DISAGREEMENT_CONFIDENCE }
      : { value: null, check: mrz.value ? 'failed' : 'absent', source: null, confidence: 0 };
  }
  const agree = printed !== null && compact(printed) === compact(mrz.value);
  if (agree) return { value: mrz.value, check: mrz.check, source: 'agree', confidence: 0.99 };
  if (mrz.check === 'verified' && mrz.confidence >= SURE_CONFIDENCE) {
    return { value: mrz.value, check: mrz.check, source: 'mrz', confidence: mrz.confidence };
  }
  // Corrected by the check digits, or weakly protected: sure only if the printed zone agrees.
  return {
    value: mrz.value,
    check: mrz.check,
    source: 'mrz',
    confidence: printed === null ? Math.min(mrz.confidence, 0.9) : DISAGREEMENT_CONFIDENCE,
  };
}

function fromMrz(f: MrzReading['fields']['date_of_birth']): MergedField {
  if (!f.value || f.check === 'failed') return { value: null, check: f.value ? 'failed' : 'absent', source: null, confidence: 0 };
  return { value: f.value, check: f.check, source: 'mrz', confidence: f.confidence };
}

/**
 * Applies the MRZ reading to `ocrData` (modified in place) and returns the
 * field-by-field detail. The aliases the API expects (`full_name`, `id_number`,
 * `expiry_date`) follow.
 */
export function mergeMrzIntoOcr(ocrData: OCRData, reading: MrzReading): MergedFields {
  const printed = readPrintedZone(ocrData.raw_text ?? '');
  const f = reading.fields;

  const permit = reading.format === 'FRENCH_DRIVING_LICENSE';
  const merged: MergedFields = {
    document_number: mergeChecked(f.document_number, printed.document_number),
    last_name: mergeName(f.last_name, printed.last_name, permit ? 8 : undefined),
    first_names: mergeName(f.first_names, printed.first_names),
    // The licence has no date of birth in its MRZ: the printed zone alone, not sure.
    date_of_birth: f.date_of_birth.value || !printed.date_of_birth
      ? fromMrz(f.date_of_birth)
      : { value: printed.date_of_birth, check: 'absent', source: 'printed_zone', confidence: DISAGREEMENT_CONFIDENCE },
    expiry_date: fromMrz(f.expiry_date),
    nationality: fromMrz(f.nationality),
    sex: fromMrz(f.sex),
  };

  const scores = (ocrData.confidence_scores = ocrData.confidence_scores || {});
  const set = (key: string, field: MergedField) => {
    if (!field.value) {
      // The MRZ is read but does not confirm this field (invalid check digit, or
      // absent): the provider's reading stays, but never as sure (its OCR
      // confidence often reaches 0.99).
      if (ocrData[key]) scores[key] = Math.min(scores[key] ?? DISAGREEMENT_CONFIDENCE, DISAGREEMENT_CONFIDENCE);
      return;
    }
    ocrData[key] = field.value;
    scores[key] = field.confidence;
  };

  set('document_number', merged.document_number);
  set('date_of_birth', merged.date_of_birth);
  set('expiration_date', merged.expiry_date);
  set('nationality', merged.nationality);
  set('sex', merged.sex);
  set('last_name', merged.last_name);
  set('first_name', merged.first_names);

  if (merged.last_name.value) {
    const full = [merged.first_names.value, merged.last_name.value].filter(Boolean).join(' ');
    ocrData.name = full;
    scores.name = Math.min(merged.last_name.confidence, merged.first_names.value ? merged.first_names.confidence : 1);
  }

  // Aliases read by the API and the bench: they must never diverge from the main fields.
  if (ocrData.name) ocrData.full_name = ocrData.name;
  if (ocrData.document_number) ocrData.id_number = ocrData.document_number;
  if (ocrData.expiration_date) ocrData.expiry_date = ocrData.expiration_date;

  return merged;
}

/**
 * Front with no MRZ (2021 national ID, licence, foreign documents): no check
 * digit verifies the printed zone, so no identity field is presented as sure,
 * whatever the OCR confidence (the bench saw "4LPARDOAP" for "4LPARD0AP" at
 * 0.96). The verification comes from the back.
 */
export const UNCHECKED_CONFIDENCE = 0.9;
const IDENTITY_FIELDS = ['document_number', 'name', 'last_name', 'first_name', 'date_of_birth', 'expiration_date', 'nationality', 'sex'];

export function capUncheckedConfidences(ocrData: OCRData): void {
  const scores = ocrData.confidence_scores;
  if (!scores) return;
  for (const key of IDENTITY_FIELDS) {
    if (typeof scores[key] === 'number') scores[key] = Math.min(scores[key], UNCHECKED_CONFIDENCE);
  }
}
