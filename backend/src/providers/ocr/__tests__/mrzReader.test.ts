import { describe, expect, it } from 'vitest';
import { fitLineVariants, normalizeMrzLine, readMrzFromText } from '@idswyft/shared';

// Tolerant MRZ reader, ported from the Preuvid fork (MIT). It lives in
// @idswyft/shared so the backend vitest suite (the only suite CI runs) covers
// it. Fixtures are the fork's synthetic bench identities (fictional).

const PASSPORT = [
  'P<FRALEFEBVRE<<JEAN<PIERRE<<<<<<<<<<<<<<<<<<',
  '59EG764379FRA5201086M3306161<<<<<<<<<<<<<<02',
];
const CNI_2021 = [
  'IDFRA4LPARD0AP5<<<<<<<<<<<<<<<',
  '5201086M3306161FRA<<<<<<<<<<<0',
  'LEFEBVRE<<JEAN<PIERRE<<<<<<<<<',
];
const CNI_OLD = [
  'IDFRALEFEBVRE<<<<<<<<<<<<<<<<<<<<<<<',
  '1406139273174JEAN<PIERRE<<<5201086M5',
];
const LICENCE = ['D1FRA18AB123455330616LEFEBVRE8'];

const text = (lines: string[]) => ['RÉPUBLIQUE FRANCAISE', 'Nom / Surname', ...lines].join('\n');

describe('normalizeMrzLine', () => {
  it('replaces `<` lookalikes and strips spaces', () => {
    expect(normalizeMrzLine('p<fra lefebvre««jean<pierre<<<<<<<<<<<<<<<<<<')).toBe(PASSPORT[0]);
  });
  it('rejects an ordinary text line', () => {
    expect(normalizeMrzLine('Date de naissance / Date of birth')).toBeNull();
  });
});

describe('fitLineVariants', () => {
  it('grows only the runs of `<`', () => {
    const v = fitLineVariants('P<FRALEFEBVRE<<JEAN<PIERRE<<<<<<<<<<', 44);
    expect(v[0]).toBe(PASSPORT[0]);
    for (const l of v) {
      expect(l).toHaveLength(44);
      expect(l.replace(/<+/g, '<')).toBe('P<FRALEFEBVRE<JEAN<PIERRE<');
    }
  });
  it('shrinks an over-long run', () => {
    expect(fitLineVariants(CNI_2021[2] + '<<', 30)).toContain(CNI_2021[2]);
  });
});

describe('readMrzFromText', () => {
  it('reads a clean passport, given names included', () => {
    const r = readMrzFromText(text(PASSPORT))!;
    expect(r.valid).toBe(true);
    expect(r.lines).toEqual(PASSPORT);
    expect(r.fields.last_name.value).toBe('LEFEBVRE');
    expect(r.fields.first_names.value).toBe('JEAN PIERRE');
    expect(r.fields.document_number).toMatchObject({ value: '59EG76437', check: 'verified' });
    expect(r.fields.date_of_birth).toMatchObject({ value: '1952-01-08', check: 'verified' });
    expect(r.fields.expiry_date).toMatchObject({ value: '2033-06-16', check: 'verified' });
    expect(r.fields.sex.value).toBe('M');
    // Passport line 1: no check digit covers the name.
    expect(r.fields.last_name.check).toBe('unchecked');
  });

  it('restores lost filler (low-resolution passport)', () => {
    const r = readMrzFromText(text(['P<FRALEFEBVRE<<JEAN<PIERRE<<<<<<<< <<<', PASSPORT[1]]))!;
    expect(r.valid).toBe(true);
    expect(r.lines).toEqual(PASSPORT);
  });

  it('restores the old national ID filler, verified by the composite check digit', () => {
    // Name line truncated by OCR: padded with `<`, verified by the composite check digit.
    const r = readMrzFromText(text(['IDFRALEFEBVRE<<<', CNI_OLD[1]]))!;
    expect(r.valid).toBe(true);
    expect(r.lines).toEqual(CNI_OLD);
    // Name covered only by the composite on a resized line: never presented as sure alone.
    expect(r.fields.last_name.confidence).toBeLessThan(0.95);
    const r2 = readMrzFromText(text(['IDFRALEFEBVRE<<<<<<<<<<<<<<<<<<<<', CNI_OLD[1]]))!;
    expect(r2.valid).toBe(true);
    expect(r2.lines).toEqual(CNI_OLD);
    expect(r2.format).toBe('FRENCH_NATIONAL_ID');
    expect(r2.fields.document_number).toMatchObject({ value: '140613927317', check: 'verified' });
    expect(r2.fields.first_names).toMatchObject({ value: 'JEAN PIERRE', check: 'verified' });
  });

  it('reads the 2021 national ID (TD1)', () => {
    const r = readMrzFromText(text(CNI_2021))!;
    expect(r.valid).toBe(true);
    expect(r.fields.document_number).toMatchObject({ value: '4LPARD0AP', check: 'verified' });
    expect(r.fields.first_names.value).toBe('JEAN PIERRE');
  });

  it('corrects an O read for a 0 in an alphanumeric number', () => {
    const read = ['IDFRA4LPARDOAP5<<<<<<<<<<<<<<<', CNI_2021[1], CNI_2021[2]];
    const r = readMrzFromText(text(read))!;
    expect(r.valid).toBe(true);
    expect(r.lines).toEqual(CNI_2021);
    expect(r.fields.document_number).toMatchObject({ value: '4LPARD0AP', check: 'corrected' });
    expect(r.corrections).toContainEqual({ line: 0, column: 11, original: 'O', corrected: '0' });
    // Fields whose check digit was valid do not move.
    expect(r.fields.date_of_birth.check).toBe('verified');
  });

  it('does not present as sure a field whose check digit stays invalid', () => {
    // Wrong digit (3 instead of 8): no common confusion repairs it.
    const read = [PASSPORT[0], '59EG764379FRA5201036M3306161<<<<<<<<<<<<<<02'];
    const r = readMrzFromText(text(read))!;
    expect(r.valid).toBe(false);
    expect(r.fields.date_of_birth.check).toBe('failed');
    expect(r.fields.date_of_birth.confidence).toBeLessThan(0.5);
    // The number, covered by its own valid check digit but also by the invalid composite, is not sure either.
    expect(r.fields.document_number.check).toBe('failed');
  });

  it('returns null with no MRZ', () => {
    expect(readMrzFromText('RÉPUBLIQUE FRANCAISE\nNom / Surname\nLEFEBVRE')).toBeNull();
  });

  it('reads the driving-licence line (2013 model)', () => {
    const r = readMrzFromText(text(LICENCE))!;
    expect(r.valid).toBe(true);
    expect(r.format).toBe('FRENCH_DRIVING_LICENSE');
    expect(r.fields.document_number).toMatchObject({ value: '18AB12345', check: 'verified' });
    expect(r.fields.expiry_date.value).toBe('2033-06-16');
    expect(r.fields.last_name.value).toBe('LEFEBVRE');
  });

  it('does not take an isolated 2021 national ID line for a licence', () => {
    expect(readMrzFromText(text([CNI_2021[0]]))).toBeNull();
  });

  it('brings back to letters the digits read in the licence name', () => {
    // Bench, licence_04: "OKAFOR" read "0KAF0R".
    const r = readMrzFromText(text(['D1FRA18NA3114653405100KAF0R<<3']))!;
    expect(r.valid).toBe(true);
    expect(r.lines[0]).toBe('D1FRA18NA311465340510OKAFOR<<3');
    expect(r.fields.last_name.value).toBe('OKAFOR');
  });

  it('keeps a residence permit issuing state when the nationality differs', () => {
    const permit = [
      'IRFRAHP5DGMGX78<<<<<<<<<<<<<<<',
      '5410167F3511060BRA<<<<<<<<<<<4',
      'CHEN<<WEI<<<<<<<<<<<<<<<<<<<<<',
    ];
    expect(readMrzFromText(text(permit))!.lines[0]).toBe(permit[0]);
  });

  it('restores the old national ID IDFRA header read DFRA', () => {
    // Bench, cni_old_02 low resolution.
    const r = readMrzFromText(text([
      'DFRAMOREAU<<<<<<<<<<<<<<<<<<<<<<<<<<',
      '1602664074567JEAN<PIERRE<<<9704264M5',
    ]))!;
    expect(r.valid).toBe(true);
    expect(r.lines[0]).toBe('IDFRAMOREAU<<<<<<<<<<<<<<<<<<<<<<<<<');
  });

  it('does not validate a number whose own check digit is invalid, even if the composite passes', () => {
    // Bench, residence_permit_00 dark+noise: "IRFRAMVB89YWPD7" read "IRFAMVB89YWPD7".
    const r = readMrzFromText(text([
      'IRFAMVB89YWPD7<<<<<<<<<<<<<<<<',
      '0401098M3406289MAR<<<<<<<<<<<4',
      'BENALI<<CHIOMA<<<<<<<<<<<<<<<<',
    ]))!;
    expect(r.valid).toBe(false);
    expect(r.fields.document_number.check).toBe('failed');
    expect(r.fields.document_number.confidence).toBeLessThan(0.95);
  });
});
