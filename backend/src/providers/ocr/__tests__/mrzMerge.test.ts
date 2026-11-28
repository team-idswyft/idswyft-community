import { describe, expect, it } from 'vitest';
import {
  readMrzFromText,
  mergeMrzIntoOcr,
  readPrintedZone,
  capUncheckedConfidences,
  SURE_CONFIDENCE,
} from '@idswyft/shared';

// MRZ-plus-printed-zone merge, ported from the Preuvid fork (MIT). Lives in
// @idswyft/shared so the backend vitest suite covers it. Fixtures are the
// fork's synthetic bench identities (fictional).

const PASSPORT = [
  'P<FRALEFEBVRE<<JEAN<PIERRE<<<<<<<<<<<<<<<<<<',
  '59EG764379FRA5201086M3306161<<<<<<<<<<<<<<02',
];

const front = (lastName: string, givenNames: string, mrz: string[]) => [
  'RÉPUBLIQUE FRANÇAISE',
  'Nom / Surname', lastName,
  'Prénoms / Given names', givenNames,
  ...mrz,
].join('\n');

const merge = (raw: string) => {
  const ocr: any = { raw_text: raw, confidence_scores: {} };
  const reading = readMrzFromText(raw)!;
  return { ocr, fields: mergeMrzIntoOcr(ocr, reading) };
};

describe('readPrintedZone', () => {
  it('reads the values under the bilingual labels', () => {
    const z = readPrintedZone(front('LEFEBVRE', 'JEAN, PIERRE', []));
    expect(z).toMatchObject({ last_name: 'LEFEBVRE', first_names: 'JEAN, PIERRE' });
  });
});

describe('mergeMrzIntoOcr', () => {
  it('presents names as sure when the MRZ and the printed zone agree', () => {
    const { ocr, fields } = merge(front('LEFEBVRE', 'Jean, Pierre', PASSPORT));
    expect(fields.last_name).toMatchObject({ value: 'LEFEBVRE', source: 'agree' });
    expect(fields.first_names).toMatchObject({ value: 'JEAN PIERRE', source: 'agree' });
    expect(fields.first_names.confidence).toBeGreaterThanOrEqual(SURE_CONFIDENCE);
    // The API aliases follow the main fields.
    expect(ocr.full_name).toBe('JEAN PIERRE LEFEBVRE');
    expect(ocr.id_number).toBe(ocr.document_number);
    expect(ocr.expiry_date).toBe('2033-06-16');
    expect(ocr.date_of_birth).toBe('1952-01-08');
  });

  it('keeps the printed zone, at low confidence, when the name diverges', () => {
    const { fields } = merge(front('LEFEVRE', 'JEAN PIERRE', PASSPORT));
    expect(fields.last_name).toMatchObject({ value: 'LEFEVRE', source: 'printed_zone' });
    expect(fields.last_name.confidence).toBeLessThan(SURE_CONFIDENCE);
  });

  it('does not present as sure a name read only in the MRZ, with no check digit', () => {
    const { fields } = merge(['RÉPUBLIQUE FRANÇAISE', ...PASSPORT].join('\n'));
    expect(fields.last_name).toMatchObject({ value: 'LEFEBVRE', source: 'mrz', check: 'unchecked' });
    expect(fields.last_name.confidence).toBeLessThan(SURE_CONFIDENCE);
  });

  it('does not take from the MRZ a date whose check digit is invalid', () => {
    const invalid = [PASSPORT[0], PASSPORT[1].replace('5201086', '5201036')];
    const { ocr, fields } = merge(front('LEFEBVRE', 'JEAN PIERRE', invalid));
    expect(fields.date_of_birth).toMatchObject({ value: null, check: 'failed' });
    expect(ocr.date_of_birth).toBeUndefined();
  });

  it('does not leave the provider date sure when the MRZ contradicts it', () => {
    const invalid = [PASSPORT[0], PASSPORT[1].replace('5201086', '5201036')];
    const raw = front('LEFEBVRE', 'JEAN PIERRE', invalid);
    const ocr: any = { raw_text: raw, date_of_birth: '1952-08-01', confidence_scores: { date_of_birth: 0.99 } };
    mergeMrzIntoOcr(ocr, readMrzFromText(raw)!);
    expect(ocr.confidence_scores.date_of_birth).toBeLessThan(SURE_CONFIDENCE);
  });

  it('reads the licence: numbered fields, name truncated in the MRZ, printed birth date only', () => {
    const raw = [
      'PERMIS DE CONDUIRE', '1. DE LA FONTAINE', '2. MARIE CLAIRE', '3. 08.01.1952 GRENOBLE',
      '4b. 16.06.2033', '5. 18AB12345', 'D1FRA18AB123455330616DE<LA<FO8',
    ].join('\n');
    const { ocr, fields } = merge(raw);
    expect(fields.document_number).toMatchObject({ value: '18AB12345', source: 'agree' });
    expect(fields.last_name).toMatchObject({ value: 'DE LA FONTAINE', source: 'agree' });
    // The end of the name is covered by no check digit.
    expect(fields.last_name.confidence).toBeLessThan(SURE_CONFIDENCE);
    expect(fields.date_of_birth).toMatchObject({ value: '1952-01-08', source: 'printed_zone' });
    expect(fields.date_of_birth.confidence).toBeLessThan(SURE_CONFIDENCE);
    expect(ocr.expiry_date).toBe('2033-06-16');
    expect(ocr.full_name).toBe('MARIE CLAIRE DE LA FONTAINE');
  });

  it('keeps the licence given names when the OCR loses the field number', () => {
    // Bench, licence_05: "2. WEI" read ". WEI".
    const raw = ['PERMIS DE CONDUIRE', '1. CHEN', '. WEI', '3. 16.10.1954 GRENOBLE', '5. 19XT01904',
      'D1FRA19XT019044351106CHEN<<<<8'].join('\n');
    const { ocr, fields } = merge(raw);
    expect(fields.first_names).toMatchObject({ value: 'WEI', source: 'printed_zone' });
    expect(fields.first_names.confidence).toBeLessThan(SURE_CONFIDENCE);
    expect(ocr.full_name).toBe('WEI CHEN');
  });
});

describe('front with no MRZ', () => {
  it('no identity field is presented as sure; other fields do not change', () => {
    const ocr: any = { confidence_scores: { document_number: 0.96, date_of_birth: 0.99, name: 0.5, address: 0.98 } };
    capUncheckedConfidences(ocr);
    expect(ocr.confidence_scores.document_number).toBeLessThan(SURE_CONFIDENCE);
    expect(ocr.confidence_scores.date_of_birth).toBeLessThan(SURE_CONFIDENCE);
    expect(ocr.confidence_scores.name).toBe(0.5);
    expect(ocr.confidence_scores.address).toBe(0.98);
  });
});
