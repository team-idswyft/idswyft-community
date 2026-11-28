import { describe, expect, it } from 'vitest';
import { isFrenchIdDocument } from '@idswyft/shared';

// French-document gate: the predicate that decides whether the ported MRZ-merge
// and confidence-cap path runs. It must be true for every French document and,
// above all, false for every non-French one — including French-LANGUAGE
// documents from Belgium, Switzerland, Luxembourg, Québec, and francophone
// Africa. A false positive would rewrite a document the French-only benchmark
// cannot validate. Lives in @idswyft/shared so the backend vitest suite covers
// it.

describe('isFrenchIdDocument — issuing-country hint', () => {
  it('matches FR and FRA, case- and space-insensitive', () => {
    expect(isFrenchIdDocument('', 'FR')).toBe(true);
    expect(isFrenchIdDocument('', 'FRA')).toBe(true);
    expect(isFrenchIdDocument('', 'fr')).toBe(true);
    expect(isFrenchIdDocument('', '  fra  ')).toBe(true);
  });

  it('does not match another country hint', () => {
    expect(isFrenchIdDocument('', 'DE')).toBe(false);
    expect(isFrenchIdDocument('', 'BEL')).toBe(false);
    expect(isFrenchIdDocument('', 'CHE')).toBe(false);
    expect(isFrenchIdDocument('', 'CAN')).toBe(false);
  });
});

describe('isFrenchIdDocument — MRZ issuing state', () => {
  it('matches when the MRZ issuing state is FRA', () => {
    expect(isFrenchIdDocument('', undefined, 'FRA')).toBe(true);
    expect(isFrenchIdDocument('', null, 'fra')).toBe(true);
  });

  it('does not match a francophone neighbour issuing state', () => {
    expect(isFrenchIdDocument('', undefined, 'BEL')).toBe(false);
    expect(isFrenchIdDocument('', undefined, 'CHE')).toBe(false);
    expect(isFrenchIdDocument('', undefined, 'LUX')).toBe(false);
    expect(isFrenchIdDocument('', undefined, null)).toBe(false);
  });
});

describe('isFrenchIdDocument — printed FRANÇAISE', () => {
  it('matches the republic name, accents or not', () => {
    expect(isFrenchIdDocument('RÉPUBLIQUE FRANÇAISE\nCARTE NATIONALE')).toBe(true);
    // OCR commonly drops the cedilla.
    expect(isFrenchIdDocument('REPUBLIQUE FRANCAISE')).toBe(true);
  });
});

describe('isFrenchIdDocument — French-language, NOT French', () => {
  it('is false for a Belgian driving licence (PERMIS DE CONDUIRE, issuing BEL)', () => {
    const raw = 'ROYAUME DE BELGIQUE\nPERMIS DE CONDUIRE\nNom / Surname';
    expect(isFrenchIdDocument(raw, undefined, 'BEL')).toBe(false);
  });

  it('is false for a Swiss residence permit (TITRE DE SÉJOUR, issuing CHE)', () => {
    const raw = 'CONFÉDÉRATION SUISSE\nTITRE DE SÉJOUR';
    expect(isFrenchIdDocument(raw, undefined, 'CHE')).toBe(false);
  });

  it('is false for a francophone passport with bilingual labels, issuing not FRA', () => {
    const raw = 'PASSEPORT / PASSPORT\nNom / Surname\nNDIAYE\nPrénoms / Given names\nAWA';
    expect(isFrenchIdDocument(raw, undefined, 'SEN')).toBe(false);
  });

  it('is false for a Québec licence (PERMIS DE CONDUIRE, no FRANÇAISE)', () => {
    expect(isFrenchIdDocument('PERMIS DE CONDUIRE\nQUÉBEC\nCANADA')).toBe(false);
  });
});

describe('isFrenchIdDocument — other non-French documents', () => {
  it('is false for an ICAO specimen passport (TD3) with no French signal', () => {
    const raw = 'P<UTOERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<\nL898902C36UTO7408122F1204159ZE184226B<<<<<10';
    expect(isFrenchIdDocument(raw, undefined, 'UTO')).toBe(false);
  });

  it('is false for a German ID', () => {
    expect(isFrenchIdDocument('BUNDESREPUBLIK DEUTSCHLAND\nPERSONALAUSWEIS', 'DE')).toBe(false);
  });

  it('is false for empty or missing text with no hint', () => {
    expect(isFrenchIdDocument('')).toBe(false);
    expect(isFrenchIdDocument(null)).toBe(false);
    expect(isFrenchIdDocument(undefined)).toBe(false);
  });
});
