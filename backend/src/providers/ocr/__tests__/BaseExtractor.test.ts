import { describe, it, expect } from 'vitest';
import { BaseExtractor } from '../extractors/BaseExtractor.js';

type FlatLine = { text: string; confidence: number };

/**
 * Test harness exposing BaseExtractor's `protected` helpers as public methods.
 *
 * The methods under test are intentionally protected in production — peer
 * extractors shouldn't be reaching into each other's helpers — but unit tests
 * need direct access without routing through a full extractor pipeline.
 * Subclassing + re-exposure is the idiomatic TypeScript pattern for this.
 *
 * These tests act as regression guards for three specific code-review fixes
 * that landed with Haiti CIN support:
 *   - HIGH 1: `\b` word boundaries in stripLeadingLabelNoise (prevents
 *             "Nomadic" → "adic" style over-matches).
 *   - HIGH 2: `options.windowSize` decoupled from `hint` in findLastDateField
 *             (hint and search-window are now independent parameters).
 *   - HIGH 3: bare English tokens `nationality`/`expiry`/`address` removed
 *             from stripTrailingLabelNoise (prevents over-stripping of
 *             legitimate values that happen to contain those words).
 *
 * Each assertion below is chosen to FAIL against the pre-fix implementation,
 * so the tests genuinely guard the fixes from regression.
 */
class TestExtractor extends BaseExtractor {
  public stripTrailing(value: string): string {
    return this.stripTrailingLabelNoise(value);
  }

  public stripLeading(value: string): string {
    return this.stripLeadingLabelNoise(value);
  }

  public isLabel(value: string): boolean {
    return this.isLabelOrNoise(value);
  }

  public findLastDate(
    lines: FlatLine[],
    patterns: RegExp[],
    hint?: 'DMY' | 'MDY' | 'YMD',
    options?: { windowSize?: 1 | 2 },
  ): { value: string; confidence: number } | null {
    let result: { value: string; confidence: number } | null = null;
    this.findLastDateField(
      lines,
      patterns,
      (value, confidence) => {
        result = { value, confidence };
      },
      hint,
      options,
    );
    return result;
  }

  public extractDatePublic(text: string, hint?: 'DMY' | 'MDY' | 'YMD'): string | null {
    return this.extractDate(text, hint);
  }
}

const tx = new TestExtractor();

// ═══════════════════════════════════════════════════════════════
//   stripLeadingLabelNoise — HIGH 1 word-boundary regression guard
// ═══════════════════════════════════════════════════════════════

describe('BaseExtractor.stripLeadingLabelNoise', () => {
  describe('HIGH 1: word boundary prevents over-matching', () => {
    it('does NOT strip "Nomadic" (prefix "nom" is inside a word)', () => {
      // Without \b this would become "adic"
      expect(tx.stripLeading('Nomadic')).toBe('Nomadic');
    });

    it('does NOT strip "Nameplate" (prefix "name" is inside a word)', () => {
      // Without \b this would become "plate"
      expect(tx.stripLeading('Nameplate')).toBe('Nameplate');
    });

    it('does NOT strip "Datastore" (prefix "dat" is inside a word)', () => {
      // Without \b this would become "astore"
      expect(tx.stripLeading('Datastore')).toBe('Datastore');
    });

    it('does NOT strip "Dateline News" (prefix "date" is inside "Dateline")', () => {
      expect(tx.stripLeading('Dateline News')).toBe('Dateline News');
    });

    it('does NOT strip "Nonplussed" (prefix "non" is inside a word)', () => {
      expect(tx.stripLeading('Nonplussed')).toBe('Nonplussed');
    });
  });

  describe('legitimate label stripping still works', () => {
    it('strips compound bilingual "Nom/ Siyati Haitien" → "Haitien"', () => {
      // The real Haitian CIN case that motivated stripLeadingLabelNoise
      expect(tx.stripLeading('Nom/ Siyati Haitien')).toBe('Haitien');
    });

    it('strips simple "Nom: Delaire" → "Delaire"', () => {
      expect(tx.stripLeading('Nom: Delaire')).toBe('Delaire');
    });

    it('strips French "Prénom Jean" → "Jean"', () => {
      expect(tx.stripLeading('Prénom Jean')).toBe('Jean');
    });

    it('is case-insensitive: "NAME SMITH" → "SMITH"', () => {
      expect(tx.stripLeading('NAME SMITH')).toBe('SMITH');
    });

    it('handles triple-label compound "Nom / Siyati / Name JONES" → "JONES"', () => {
      expect(tx.stripLeading('Nom / Siyati / Name JONES')).toBe('JONES');
    });
  });

  describe('edge cases', () => {
    it('handles empty string', () => {
      expect(tx.stripLeading('')).toBe('');
    });

    it('leaves value unchanged when no label prefix', () => {
      expect(tx.stripLeading('SMITH JOHN')).toBe('SMITH JOHN');
    });
  });
});

// ═══════════════════════════════════════════════════════════════
//   stripTrailingLabelNoise — HIGH 3 over-stripping regression guard
// ═══════════════════════════════════════════════════════════════

describe('BaseExtractor.stripTrailingLabelNoise', () => {
  describe('HIGH 3: bare English tokens do NOT trigger stripping', () => {
    it('does NOT strip bare English "expiry"', () => {
      // Before fix: "Pass Expiry 2025" → "Pass"
      expect(tx.stripTrailing('Pass Expiry 2025')).toBe('Pass Expiry 2025');
    });

    it('does NOT strip bare English "nationality"', () => {
      // Before fix: "Acme Corp Nationality" → "Acme Corp"
      expect(tx.stripTrailing('Acme Corp Nationality')).toBe('Acme Corp Nationality');
    });

    it('does NOT strip bare English "address"', () => {
      // Before fix: "123 Main Street Address" → "123 Main Street"
      expect(tx.stripTrailing('123 Main Street Address')).toBe('123 Main Street Address');
    });

    it('does NOT strip "Happy Expiry Date" (no multi-word "Date of Expiry")', () => {
      expect(tx.stripTrailing('Happy Expiry Date')).toBe('Happy Expiry Date');
    });
  });

  describe('multi-word English label phrases still strip', () => {
    it('strips "SMITH Date of Birth" → "SMITH"', () => {
      expect(tx.stripTrailing('SMITH Date of Birth')).toBe('SMITH');
    });

    it('strips "JONES Date of Expiry 2030" → "JONES"', () => {
      expect(tx.stripTrailing('JONES Date of Expiry 2030')).toBe('JONES');
    });
  });

  describe('French label stripping', () => {
    it('strips "DELAIRE Date de Naissance /Dat.ou fet" → "DELAIRE"', () => {
      // The real Haitian CIN case — French label followed by Kreyòl label
      expect(tx.stripTrailing('DELAIRE Date de Naissance /Dat.ou fet')).toBe('DELAIRE');
    });

    it('strips "Marie Lieu de Naissance Port-au-Prince" → "Marie"', () => {
      expect(tx.stripTrailing('Marie Lieu de Naissance Port-au-Prince')).toBe('Marie');
    });

    it('strips "PATRICIA Nationalité Haïtienne" → "PATRICIA"', () => {
      expect(tx.stripTrailing('PATRICIA Nationalité Haïtienne')).toBe('PATRICIA');
    });
  });

  describe('Haitian Creole label stripping', () => {
    it('strips "PATRICIA kat la fet 2018" → "PATRICIA"', () => {
      expect(tx.stripTrailing('PATRICIA kat la fet 2018')).toBe('PATRICIA');
    });

    it('strips "JEAN nimewo kat 12345" → "JEAN"', () => {
      expect(tx.stripTrailing('JEAN nimewo kat 12345')).toBe('JEAN');
    });

    it('strips "Marie nasyonalite Ayisyen" → "Marie"', () => {
      expect(tx.stripTrailing('Marie nasyonalite Ayisyen')).toBe('Marie');
    });
  });

  describe('edge cases', () => {
    it('leaves value unchanged when no trailing label', () => {
      expect(tx.stripTrailing('PATRICIA DELAIRE')).toBe('PATRICIA DELAIRE');
    });

    it('handles empty string', () => {
      expect(tx.stripTrailing('')).toBe('');
    });
  });
});

// ═══════════════════════════════════════════════════════════════
//   findLastDateField — HIGH 2 windowSize/hint decoupling guard
// ═══════════════════════════════════════════════════════════════

describe('BaseExtractor.findLastDateField', () => {
  const dobLabel = /date\s*of\s*birth|dob/i;
  const expiryLabel = /date\s*of\s*expiry|expiration|expiry/i;

  describe('HIGH 2: windowSize decoupled from hint', () => {
    it('default windowSize=1 ignores next2 line even when hint provided', () => {
      // Before fix: passing any `hint` auto-widened the window to 2.
      // After fix: default windowSize is 1 regardless of hint.
      const lines: FlatLine[] = [
        { text: 'Date of Expiry', confidence: 0.9 },
        { text: '15/06/2030', confidence: 0.9 }, // next1 — should be found
        { text: '20/12/2040', confidence: 0.9 }, // next2 — should be IGNORED
      ];
      const result = tx.findLastDate(lines, [expiryLabel], 'DMY');
      expect(result).not.toBeNull();
      expect(result!.value).toBe('2030-06-15'); // not 2040
    });

    it('windowSize=2 extends search to next2 line', () => {
      // The real Haitian CIN layout: label header on line 0, stacked
      // bilingual label on line 1, dates on line 2. Requires windowSize=2.
      const lines: FlatLine[] = [
        { text: 'Date d\'émission / Date d\'expiration', confidence: 0.9 },
        { text: 'Dat kat la fet  Dat kat la fini', confidence: 0.9 }, // next1 — no dates
        { text: '07-02-2018      06-02-2028', confidence: 0.9 }, // next2 — dates here
      ];
      const result = tx.findLastDate(lines, [expiryLabel], 'DMY', { windowSize: 2 });
      expect(result).not.toBeNull();
      expect(result!.value).toBe('2028-02-06'); // latest of the two
    });

    it('passing windowSize without hint works (parameters fully independent)', () => {
      // Proves the decoupling: you can opt into window=2 without a date hint.
      const lines: FlatLine[] = [
        { text: 'Expiry', confidence: 0.9 },
        { text: 'irrelevant line', confidence: 0.9 }, // next1 — no dates
        { text: '15/06/2025', confidence: 0.9 }, // next2 — date here
      ];
      const result = tx.findLastDate(lines, [expiryLabel], undefined, { windowSize: 2 });
      expect(result).not.toBeNull();
      // No hint → p1>12 heuristic: 15 > 12, so interpreted as DMY → 2025-06-15
      expect(result!.value).toBe('2025-06-15');
    });

    it('passing hint without windowSize works (default window=1)', () => {
      const lines: FlatLine[] = [
        { text: 'Date of Expiry 06-02-2028', confidence: 0.9 },
      ];
      const result = tx.findLastDate(lines, [expiryLabel], 'DMY');
      expect(result).not.toBeNull();
      expect(result!.value).toBe('2028-02-06'); // DMY: 06=day, 02=month
    });
  });

  describe('last-date selection', () => {
    it('picks chronologically latest date when multiple appear on same line', () => {
      const lines: FlatLine[] = [
        { text: 'Expiry 15/06/2025  20/08/2030', confidence: 0.9 },
      ];
      const result = tx.findLastDate(lines, [expiryLabel], 'DMY');
      expect(result).not.toBeNull();
      expect(result!.value).toBe('2030-08-20');
    });

    it('picks latest across label line + next1 line', () => {
      const lines: FlatLine[] = [
        { text: 'Expiry 15/06/2025', confidence: 0.9 },
        { text: '20/08/2030', confidence: 0.9 },
      ];
      const result = tx.findLastDate(lines, [expiryLabel], 'DMY');
      expect(result).not.toBeNull();
      expect(result!.value).toBe('2030-08-20');
    });
  });

  describe('hint disambiguation', () => {
    it('respects DMY hint for ambiguous dates', () => {
      const lines: FlatLine[] = [
        { text: 'Date of Birth 06-02-1987', confidence: 0.9 },
      ];
      const result = tx.findLastDate(lines, [dobLabel], 'DMY');
      expect(result).not.toBeNull();
      expect(result!.value).toBe('1987-02-06'); // day=06, month=02
    });

    it('respects MDY hint for ambiguous dates', () => {
      const lines: FlatLine[] = [
        { text: 'Date of Birth 06-02-1987', confidence: 0.9 },
      ];
      const result = tx.findLastDate(lines, [dobLabel], 'MDY');
      expect(result).not.toBeNull();
      expect(result!.value).toBe('1987-06-02'); // month=06, day=02
    });
  });

  describe('negative cases', () => {
    it('returns null when no label match found', () => {
      const lines: FlatLine[] = [
        { text: 'Random text', confidence: 0.9 },
        { text: '15/06/2025', confidence: 0.9 },
      ];
      const result = tx.findLastDate(lines, [expiryLabel], 'DMY');
      expect(result).toBeNull();
    });

    it('returns null when label matches but no dates in window', () => {
      const lines: FlatLine[] = [
        { text: 'Date of Expiry', confidence: 0.9 },
        { text: 'no dates here', confidence: 0.9 },
      ];
      const result = tx.findLastDate(lines, [expiryLabel], 'DMY');
      expect(result).toBeNull();
    });
  });
});

// ═══════════════════════════════════════════════════════════════
//   extractDate — basic parsing with hint support
// ═══════════════════════════════════════════════════════════════

describe('BaseExtractor.extractDate', () => {
  it('parses month-name date without hint', () => {
    expect(tx.extractDatePublic('1 JAN 1981')).toBe('1981-01-01');
  });

  it('parses numeric date with DMY hint', () => {
    expect(tx.extractDatePublic('06/02/1987', 'DMY')).toBe('1987-02-06');
  });

  it('parses numeric date with MDY hint', () => {
    expect(tx.extractDatePublic('06/02/1987', 'MDY')).toBe('1987-06-02');
  });

  it('parses numeric date with YMD hint', () => {
    expect(tx.extractDatePublic('1987/02/06', 'YMD')).toBe('1987-02-06');
  });

  it('returns null for text without any date', () => {
    expect(tx.extractDatePublic('hello world')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(tx.extractDatePublic('')).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════
//   isLabelOrNoise — French + Kreyòl label detection
// ═══════════════════════════════════════════════════════════════

describe('BaseExtractor.isLabelOrNoise', () => {
  describe('French labels', () => {
    it('flags "date de naissance"', () => {
      expect(tx.isLabel('date de naissance')).toBe(true);
    });

    it('flags "lieu de naissance"', () => {
      expect(tx.isLabel('lieu de naissance')).toBe(true);
    });

    it('flags "nationalité"', () => {
      expect(tx.isLabel('nationalité')).toBe(true);
    });

    it('flags "numéro de carte"', () => {
      expect(tx.isLabel('numéro de carte')).toBe(true);
    });

    it('flags "prénom"', () => {
      expect(tx.isLabel('prénom')).toBe(true);
    });
  });

  describe('Haitian Creole labels', () => {
    it('flags "kat la fet"', () => {
      expect(tx.isLabel('kat la fet')).toBe(true);
    });

    it('flags "nimewo kat"', () => {
      expect(tx.isLabel('nimewo kat')).toBe(true);
    });

    it('flags "nasyonalite"', () => {
      expect(tx.isLabel('nasyonalite')).toBe(true);
    });

    it('flags "siyati mèt"', () => {
      expect(tx.isLabel('siyati mèt')).toBe(true);
    });

    it('flags "dat ou fet"', () => {
      expect(tx.isLabel('dat ou fet')).toBe(true);
    });
  });

  describe('English labels', () => {
    it('flags "date of birth"', () => {
      expect(tx.isLabel('date of birth')).toBe(true);
    });

    it('flags "surname"', () => {
      expect(tx.isLabel('surname')).toBe(true);
    });
  });

  describe('non-labels', () => {
    it('does not flag a real name', () => {
      expect(tx.isLabel('PATRICIA DELAIRE')).toBe(false);
    });

    it('flags pure number as noise', () => {
      expect(tx.isLabel('12345')).toBe(true);
    });

    it('flags values starting with "/"', () => {
      expect(tx.isLabel('/surname')).toBe(true);
    });

    it('flags values starting with "*"', () => {
      expect(tx.isLabel('**SPECIMEN**')).toBe(true);
    });

    it('flags single character as too short', () => {
      expect(tx.isLabel('A')).toBe(true);
    });
  });
});
