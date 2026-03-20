import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PaddleOcrResult, RecognitionResult } from 'ppu-paddle-ocr';

// Mock ppu-paddle-ocr so tests don't need real ONNX models.
// Use a class so `new PaddleOcrService()` works.
const mockRecognize = vi.fn<() => Promise<PaddleOcrResult>>();
const mockInitialize = vi.fn<() => Promise<void>>();
const mockDestroy = vi.fn<() => Promise<void>>();

vi.mock('ppu-paddle-ocr', () => {
  class MockPaddleOcrService {
    initialize = mockInitialize;
    recognize = mockRecognize;
    destroy = mockDestroy;
  }
  return { PaddleOcrService: MockPaddleOcrService };
});

// Mock logger to suppress output
vi.mock('@/utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { PaddleOCRProvider, standardizeDateFormat } from '../PaddleOCRProvider.js';

// ── Test helpers ─────────────────────────────────────

function makeItem(text: string, confidence = 0.95): RecognitionResult {
  return {
    text,
    confidence,
    box: { x: 0, y: 0, width: 100, height: 20 },
  };
}

function makeResult(lineTexts: Array<Array<{ text: string; confidence?: number }>>): PaddleOcrResult {
  const lines: RecognitionResult[][] = lineTexts.map((lineItems) =>
    lineItems.map((item) => makeItem(item.text, item.confidence ?? 0.95)),
  );
  const allItems = lines.flat();
  return {
    text: lineTexts.map((l) => l.map((i) => i.text).join(' ')).join('\n'),
    lines,
    confidence: allItems.length
      ? allItems.reduce((s, i) => s + i.confidence, 0) / allItems.length
      : 0,
  };
}

// ── Tests ────────────────────────────────────────────

describe('PaddleOCRProvider', () => {
  let provider: PaddleOCRProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    mockInitialize.mockResolvedValue(undefined);
    // Reset singleton by creating a fresh instance each time
    provider = new PaddleOCRProvider();
  });

  it('has correct provider name', () => {
    expect(provider.name).toBe('paddle');
  });

  describe('processDocument', () => {
    it('initializes service on first call and reuses on subsequent calls', async () => {
      mockRecognize.mockResolvedValue(makeResult([[{ text: 'Hello' }]]));

      const buf = Buffer.from('fake-image');
      await provider.processDocument(buf, 'passport');
      await provider.processDocument(buf, 'passport');

      // initialize() should be called exactly once (singleton)
      expect(mockInitialize).toHaveBeenCalledTimes(1);
      expect(mockRecognize).toHaveBeenCalledTimes(2);
    });

    it('returns raw_text from PaddleOCR result', async () => {
      const result = makeResult([
        [{ text: 'Name:' }, { text: 'John Doe' }],
        [{ text: 'DOB:' }, { text: '01/15/1990' }],
      ]);
      mockRecognize.mockResolvedValue(result);

      const ocrData = await provider.processDocument(Buffer.from('img'), 'passport');
      expect(ocrData.raw_text).toBe(result.text);
    });

    it('converts Buffer to ArrayBuffer for recognize()', async () => {
      mockRecognize.mockResolvedValue(makeResult([[{ text: 'test' }]]));

      const buf = Buffer.from([0x89, 0x50, 0x4e, 0x47]); // PNG magic bytes
      await provider.processDocument(buf, 'passport');

      // The argument to recognize should be an ArrayBuffer
      const arg = mockRecognize.mock.calls[0][0];
      expect(arg).toBeInstanceOf(ArrayBuffer);
    });
  });

  describe('passport extraction', () => {
    it('extracts name, DOB, document number, expiry, nationality', async () => {
      mockRecognize.mockResolvedValue(
        makeResult([
          [{ text: 'Name:', confidence: 0.92 }, { text: 'JOHN DOE', confidence: 0.88 }],
          [{ text: 'Date of birth:', confidence: 0.90 }, { text: '15/03/1990', confidence: 0.93 }],
          [{ text: 'Passport No:', confidence: 0.94 }, { text: 'AB123456', confidence: 0.96 }],
          [{ text: 'Date of expiry:', confidence: 0.91 }, { text: '20/06/2030', confidence: 0.89 }],
          [{ text: 'Nationality:', confidence: 0.87 }, { text: 'BRITISH', confidence: 0.85 }],
        ]),
      );

      const data = await provider.processDocument(Buffer.from('img'), 'passport');

      expect(data.name).toBe('JOHN DOE');
      expect(data.date_of_birth).toBeDefined();
      expect(data.document_number).toBe('AB123456');
      expect(data.expiration_date).toBeDefined();
      expect(data.nationality).toBe('BRITISH');

      // Confidence scores should come from PaddleOCR, not hardcoded
      expect(data.confidence_scores!.name).toBeGreaterThan(0);
      expect(data.confidence_scores!.name).toBeLessThanOrEqual(1);
    });
  });

  describe('drivers_license extraction', () => {
    it('extracts name, DOB, license number, expiry', async () => {
      mockRecognize.mockResolvedValue(
        makeResult([
          [{ text: 'Full Name:', confidence: 0.94 }, { text: 'JANE SMITH', confidence: 0.91 }],
          [{ text: 'DOB:', confidence: 0.96 }, { text: '05/22/1985', confidence: 0.93 }],
          [{ text: 'License No:', confidence: 0.92 }, { text: 'D1234567', confidence: 0.88 }],
          [{ text: 'Expires:', confidence: 0.90 }, { text: '11/15/2028', confidence: 0.87 }],
          [{ text: 'Sex:', confidence: 0.95 }, { text: 'F', confidence: 0.98 }],
        ]),
      );

      const data = await provider.processDocument(Buffer.from('img'), 'drivers_license');

      expect(data.name).toBe('JANE SMITH');
      expect(data.date_of_birth).toBeDefined();
      expect(data.document_number).toBe('D1234567');
      expect(data.expiration_date).toBeDefined();
      expect(data.sex).toBe('F');
    });

    it('extracts address when present', async () => {
      mockRecognize.mockResolvedValue(
        makeResult([
          [{ text: 'Name:', confidence: 0.9 }, { text: 'BOB JONES', confidence: 0.9 }],
          [{ text: 'Address:', confidence: 0.88 }, { text: '123 Main Street, Springfield', confidence: 0.85 }],
        ]),
      );

      const data = await provider.processDocument(Buffer.from('img'), 'drivers_license');
      expect(data.address).toBe('123 Main Street Springfield');
    });

    it('extracts DL number from "DLn" format (US driver license)', async () => {
      mockRecognize.mockResolvedValue(
        makeResult([
          [{ text: 'NORTHUSA', confidence: 0.97 }, { text: 'DRIVER LICENSE', confidence: 0.99 }, { text: 'CAROLINA', confidence: 0.98 }],
          [{ text: '4d DLn', confidence: 0.82 }, { text: '000055667788', confidence: 0.99 }],
          [{ text: 'Class C', confidence: 0.97 }],
          [{ text: 'MARTINEZ', confidence: 1.0 }],
          [{ text: 'ELENA', confidence: 0.91 }],
          [{ text: '12300 OAK RIDGE BLVD', confidence: 0.97 }],
          [{ text: '3 Date of birth', confidence: 0.98 }, { text: 'N Sex Eyes', confidence: 0.85 }],
          [{ text: '09/29/1979', confidence: 1.0 }, { text: 'M', confidence: 1.0 }, { text: 'BLK', confidence: 1.0 }],
          [{ text: '16 Height', confidence: 0.98 }],
          [{ text: "5'-09\"", confidence: 0.98 }, { text: 'BLK', confidence: 0.97 }],
          [{ text: 'SEP', confidence: 0.99 }, { text: '4a Iss', confidence: 0.97 }, { text: '46 Exp', confidence: 0.94 }],
          [{ text: '5 DD 0099887766', confidence: 0.98 }, { text: '08/14/2025', confidence: 1.0 }, { text: '09/29/2033', confidence: 1.0 }],
        ]),
      );

      const data = await provider.processDocument(Buffer.from('img'), 'drivers_license');

      expect(data.document_number).toBe('000055667788');
      expect(data.name).toBe('ELENA MARTINEZ');
      expect(data.date_of_birth).toBe('1979-09-29');
      expect(data.expiration_date).toBe('2033-09-29');
    });

    it('strips leading AAMVA field markers from DL number (NC "DLN 11 000023457891 9")', async () => {
      // NC specimen: OCR reads "4d DLN 11 000023457891 9 Class C"
      // where "11" is AAMVA element ID and "9" is the vehicle class field marker.
      mockRecognize.mockResolvedValue(
        makeResult([
          [{ text: 'NORTH CAROLINA', confidence: 0.99 }, { text: 'DRIVER LICENSE', confidence: 0.99 }],
          [{ text: '4d DLN 11 000023457891 9 Class C', confidence: 0.80 }],
          [{ text: 'PUBLIC', confidence: 1.0 }],
          [{ text: 'JANE Q', confidence: 0.94 }],
          [{ text: '2345 YOUR STREET', confidence: 0.96 }],
          [{ text: 'YOUR CITY, NC 99999-1234', confidence: 0.99 }],
          [{ text: '3 Date of birth', confidence: 0.98 }, { text: 'N Sex Eyes', confidence: 0.85 }],
          [{ text: '06/01/1964', confidence: 1.0 }, { text: 'F', confidence: 1.0 }, { text: 'BRO', confidence: 1.0 }],
          [{ text: '5 DD 12345689', confidence: 0.98 }, { text: '05/28/2024', confidence: 1.0 }, { text: '06/01/2032', confidence: 1.0 }],
        ]),
      );

      const data = await provider.processDocument(Buffer.from('img'), 'drivers_license');

      expect(data.document_number).toBe('000023457891');
    });

    it('handles concatenated OCR where DLN + digits + AAMVA ID run together (NC "DLN0000234578919Clas")', async () => {
      // NC specimen: PaddleOCR merges the DLN label, 12-digit number,
      // trailing AAMVA element 9 (Class), and truncated "Class" into one token.
      mockRecognize.mockResolvedValue(
        makeResult([
          [{ text: 'NORTH CAROLINA', confidence: 0.99 }, { text: 'DRIVER LICENSE', confidence: 0.99 }],
          [{ text: 'DLN0000234578919Clas', confidence: 0.86 }],
          [{ text: 'PUBLIC', confidence: 1.0 }],
          [{ text: 'JANE Q', confidence: 0.94 }],
          [{ text: '2345 YOUR STREET', confidence: 0.96 }],
          [{ text: 'YOUR CITY, NC 99999-1234', confidence: 0.99 }],
          [{ text: '3 Date of birth', confidence: 0.98 }, { text: 'N Sex Eyes', confidence: 0.85 }],
          [{ text: '06/01/1964', confidence: 1.0 }, { text: 'F', confidence: 1.0 }, { text: 'BRO', confidence: 1.0 }],
          [{ text: '5 DD 12345689', confidence: 0.98 }, { text: '05/28/2024', confidence: 1.0 }, { text: '06/01/2032', confidence: 1.0 }],
        ]),
      );

      const data = await provider.processDocument(Buffer.from('img'), 'drivers_license');

      expect(data.document_number).toBe('000023457891');
    });

    it('does NOT extract state names or document headers as name/id_number', async () => {
      // Simulate OCR where lines come in a different order than expected,
      // with state name and header text that could be mistaken for personal data.
      mockRecognize.mockResolvedValue(
        makeResult([
          [{ text: 'NORTH CAROLINA', confidence: 0.99 }],
          [{ text: 'DRIVER LICENSE', confidence: 0.99 }],
          [{ text: '4d DLn', confidence: 0.82 }, { text: '000055667788', confidence: 0.99 }],
          [{ text: 'Class C', confidence: 0.97 }],
          [{ text: 'MARTINEZ', confidence: 1.0 }],
          [{ text: 'ELENA', confidence: 0.91 }],
          [{ text: '12300 OAK RIDGE BLVD', confidence: 0.97 }],
          [{ text: '3 Date of birth', confidence: 0.98 }],
          [{ text: '09/29/1979', confidence: 1.0 }],
          [{ text: 'Exp', confidence: 0.94 }],
          [{ text: '09/29/2033', confidence: 1.0 }],
        ]),
      );

      const data = await provider.processDocument(Buffer.from('img'), 'drivers_license');

      // State name and header should NOT be extracted as personal data
      expect(data.name).not.toMatch(/carolina/i);
      expect(data.name).not.toMatch(/driver/i);
      expect(data.document_number).not.toMatch(/carolina/i);
      // The actual data should still be extracted
      expect(data.document_number).toBe('000055667788');
      expect(data.name).toBe('ELENA MARTINEZ');
      expect(data.date_of_birth).toBe('1979-09-29');
    });

    it('extracts DL number when PaddleOCR merges class letter into DLN line', async () => {
      // Simulates PaddleOCR merging adjacent text: "4d DLN C 000099112233 9Class C"
      mockRecognize.mockResolvedValue(
        makeResult([
          [{ text: 'NORTHUSA DRIVER LICENSE *', confidence: 0.90 }],
          [{ text: 'CAROLINA', confidence: 1.00 }],
          [{ text: '4d DLN C 000099112233 9Class C', confidence: 0.86 }],
          [{ text: 'TANAKA', confidence: 1.00 }],
          [{ text: '2 KENJI HIRO', confidence: 0.98 }],
          [{ text: '55000 MAPLE CREEK DR', confidence: 0.96 }],
          [{ text: 'APT 204', confidence: 0.97 }],
          [{ text: 'RALEIGH, NC 27601-1234', confidence: 0.98 }],
          [{ text: '3 Date of birth 16 Sex 18 Eyes', confidence: 0.96 }],
          [{ text: '10/11/1982 F BRO', confidence: 1.00 }],
          [{ text: '16 Height 19 Hair', confidence: 0.98 }],
          [{ text: "RR 2 5'-05\" BLK", confidence: 0.91 }],
          [{ text: 'OCT 8 2 4a iss 4b Exp LImITed teRM', confidence: 0.87 }],
          [{ text: 'S DD 0077665544 08/05/2025 10/11/2033 1', confidence: 0.83 }],
        ]),
      );

      const data = await provider.processDocument(Buffer.from('img'), 'drivers_license');

      expect(data.document_number).toBe('000099112233');
      // Name: lines "TANAKA" (last) + "KENJI HIRO" (first) → "KENJI HIRO TANAKA"
      expect(data.name).toContain('TANAKA');
      expect(data.name).toContain('KENJI');
      expect(data.name).not.toMatch(/carolina/i);
      expect(data.name).not.toMatch(/driver/i);
      expect(data.date_of_birth).toBe('1982-10-11');
      expect(data.expiration_date).toBe('2033-10-11');
    });

    it('picks last date as expiry when multiple dates on same line', async () => {
      mockRecognize.mockResolvedValue(
        makeResult([
          [{ text: 'License No:', confidence: 0.9 }, { text: 'D9876543', confidence: 0.9 }],
          [{ text: 'DOB:', confidence: 0.9 }, { text: '03/15/1985', confidence: 0.9 }],
          [{ text: 'Exp', confidence: 0.9 }],
          [{ text: '01/01/2024 12/31/2030', confidence: 0.9 }],
        ]),
      );

      const data = await provider.processDocument(Buffer.from('img'), 'drivers_license');
      expect(data.expiration_date).toBe('2030-12-31');
    });

    it('extracts California-style DL with LN/FN labels and letter-prefix number', async () => {
      // California DLs use "LN" / "FN" labels and letter + 7 digits (e.g. D1234567)
      mockRecognize.mockResolvedValue(
        makeResult([
          [{ text: 'CALIFORNIA', confidence: 0.99 }],
          [{ text: 'DRIVER LICENSE', confidence: 0.99 }],
          [{ text: 'DL D5551234', confidence: 0.95 }],
          [{ text: 'LN GARCIA', confidence: 0.97 }],
          [{ text: 'FN MARIA ELENA', confidence: 0.96 }],
          [{ text: 'DOB: 04/22/1988', confidence: 0.98 }],
          [{ text: 'Exp 04/22/2030', confidence: 0.95 }],
        ]),
      );

      const data = await provider.processDocument(Buffer.from('img'), 'drivers_license');

      expect(data.document_number).toBe('D5551234');
      expect(data.name).toBe('MARIA ELENA GARCIA');
      expect(data.date_of_birth).toBe('1988-04-22');
      expect(data.expiration_date).toBe('2030-04-22');
    });

    it('extracts comma-separated name format (LAST, FIRST MIDDLE)', async () => {
      // Some states show name as "LASTNAME, FIRSTNAME MIDDLE" on one labeled line
      mockRecognize.mockResolvedValue(
        makeResult([
          [{ text: 'TEXAS', confidence: 0.99 }],
          [{ text: 'DRIVER LICENSE', confidence: 0.99 }],
          [{ text: 'DL 12345678', confidence: 0.95 }],
          [{ text: 'Name: PARK, JAMES HYUN', confidence: 0.96 }],
          [{ text: 'DOB: 11/03/1995', confidence: 0.98 }],
          [{ text: 'Exp 11/03/2031', confidence: 0.95 }],
        ]),
      );

      const data = await provider.processDocument(Buffer.from('img'), 'drivers_license');

      expect(data.document_number).toBe('12345678');
      expect(data.name).toBe('JAMES HYUN PARK');
      expect(data.date_of_birth).toBe('1995-11-03');
    });

    it('extracts letter-prefix DL number without explicit label (FL/IL/MI style)', async () => {
      // Florida uses 1 letter + 12 digits with no "DL" label — just the raw number
      mockRecognize.mockResolvedValue(
        makeResult([
          [{ text: 'FLORIDA', confidence: 0.99 }],
          [{ text: 'DRIVER LICENSE', confidence: 0.99 }],
          [{ text: 'W550123456789', confidence: 0.97 }],
          [{ text: '1 WILLIAMS', confidence: 0.98 }],
          [{ text: '2 TANYA NICOLE', confidence: 0.96 }],
          [{ text: '3 Date of birth', confidence: 0.95 }],
          [{ text: '07/19/1991', confidence: 0.99 }],
          [{ text: '4b Exp 07/19/2029', confidence: 0.94 }],
        ]),
      );

      const data = await provider.processDocument(Buffer.from('img'), 'drivers_license');

      expect(data.document_number).toBe('W550123456789');
      expect(data.name).toContain('WILLIAMS');
      expect(data.name).toContain('TANYA');
      expect(data.date_of_birth).toBe('1991-07-19');
      expect(data.expiration_date).toBe('2029-07-19');
    });

    it('extracts pure numeric DL number with "ID NO" label (NY style)', async () => {
      // New York uses 9 digits, sometimes labeled "ID NO" or "NO."
      mockRecognize.mockResolvedValue(
        makeResult([
          [{ text: 'NEW YORK', confidence: 0.99 }],
          [{ text: 'DRIVER LICENSE', confidence: 0.99 }],
          [{ text: 'ID NO. 123456789', confidence: 0.96 }],
          [{ text: 'Last Name: CHEN', confidence: 0.97 }],
          [{ text: 'First Name: DAVID WEI', confidence: 0.96 }],
          [{ text: 'DOB 08/30/1987', confidence: 0.98 }],
          [{ text: 'Expires 08/30/2032', confidence: 0.95 }],
        ]),
      );

      const data = await provider.processDocument(Buffer.from('img'), 'drivers_license');

      expect(data.document_number).toBe('123456789');
      expect(data.name).toBe('DAVID WEI CHEN');
      expect(data.date_of_birth).toBe('1987-08-30');
      expect(data.expiration_date).toBe('2032-08-30');
    });
  });

  describe('national_id extraction', () => {
    it('extracts name, DOB, ID number, issuing authority', async () => {
      mockRecognize.mockResolvedValue(
        makeResult([
          [{ text: 'Full Name:', confidence: 0.91 }, { text: 'MARIA GARCIA', confidence: 0.89 }],
          [{ text: 'Date of birth:', confidence: 0.93 }, { text: '12/04/1975', confidence: 0.90 }],
          [{ text: 'ID No:', confidence: 0.92 }, { text: 'NID12345678', confidence: 0.94 }],
          [{ text: 'Issued by:', confidence: 0.88 }, { text: 'MINISTRY OF INTERIOR', confidence: 0.86 }],
        ]),
      );

      const data = await provider.processDocument(Buffer.from('img'), 'national_id');

      expect(data.name).toBe('MARIA GARCIA');
      expect(data.date_of_birth).toBeDefined();
      expect(data.document_number).toBe('NID12345678');
      expect(data.issuing_authority).toBe('MINISTRY OF INTERIOR');
    });
  });

  describe('national_id auto-detects driver license', () => {
    it('redirects to DL extraction when text contains DRIVER LICENSE', async () => {
      mockRecognize.mockResolvedValue(
        makeResult([
          [{ text: 'DRIVER LICENSE', confidence: 0.99 }],
          [{ text: '4d DLn', confidence: 0.82 }, { text: '000012345678', confidence: 0.99 }],
          [{ text: 'Class C', confidence: 0.97 }],
          [{ text: 'SMITH', confidence: 1.0 }],
          [{ text: 'JOHN', confidence: 0.91 }],
          [{ text: '123 MAIN ST', confidence: 0.97 }],
          [{ text: 'Date of birth', confidence: 0.98 }],
          [{ text: '01/15/1990', confidence: 1.0 }],
          [{ text: '46 Exp', confidence: 0.94 }],
          [{ text: '06/01/2035', confidence: 1.0 }],
        ]),
      );

      const data = await provider.processDocument(Buffer.from('img'), 'national_id');

      // Should have used DL extraction despite being called as national_id
      expect(data.document_number).toBe('000012345678');
      expect(data.name).toBe('JOHN SMITH');
      expect(data.date_of_birth).toBe('1990-01-15');
      expect(data.expiration_date).toBe('2035-06-01');
    });
  });

  describe('generic extraction', () => {
    it('falls back to generic extraction for unknown document types', async () => {
      mockRecognize.mockResolvedValue(
        makeResult([
          [{ text: 'Name:', confidence: 0.8 }, { text: 'ALEX TEST', confidence: 0.82 }],
          [{ text: 'Number:', confidence: 0.78 }, { text: 'XYZ9876', confidence: 0.80 }],
        ]),
      );

      const data = await provider.processDocument(Buffer.from('img'), 'unknown_type');

      expect(data.name).toBe('ALEX TEST');
      expect(data.document_number).toBe('XYZ9876');
    });
  });

  describe('label on separate line from value', () => {
    it('picks up value from the next line when label has no colon', async () => {
      mockRecognize.mockResolvedValue(
        makeResult([
          [{ text: 'Name', confidence: 0.9 }],
          [{ text: 'JOHN DOE', confidence: 0.88 }],
          [{ text: 'DOB', confidence: 0.91 }],
          [{ text: '01/15/1990', confidence: 0.93 }],
        ]),
      );

      const data = await provider.processDocument(Buffer.from('img'), 'passport');

      expect(data.name).toBe('JOHN DOE');
      expect(data.date_of_birth).toBeDefined();
    });
  });

  describe('empty / bad image', () => {
    it('returns empty OCRData when PaddleOCR finds no text', async () => {
      mockRecognize.mockResolvedValue(makeResult([]));

      const data = await provider.processDocument(Buffer.from('img'), 'passport');

      expect(data.raw_text).toBe('');
      expect(data.name).toBeUndefined();
      expect(data.document_number).toBeUndefined();
    });

    it('propagates PaddleOCR errors', async () => {
      mockRecognize.mockRejectedValue(new Error('Invalid image format'));

      await expect(
        provider.processDocument(Buffer.from('bad'), 'passport'),
      ).rejects.toThrow('Invalid image format');
    });
  });

  describe('name sanitization — strips DL field-label noise tokens', () => {
    it('removes OCR noise word from name (e.g. HALT from misread HGT)', async () => {
      // Simulates a DL where OCR reads "HALT" (misread of HGT/HAIR) as part of the name
      mockRecognize.mockResolvedValue(
        makeResult([
          [{ text: 'CALIFORNIA' }],
          [{ text: 'DRIVER LICENSE' }],
          [{ text: 'DL D1234567' }],
          [{ text: 'LORISSON' }],
          [{ text: 'OBED HALT' }],
        ]),
      );
      const data = await provider.processDocument(Buffer.from('img'), 'drivers_license');
      expect(data.name).toBe('OBED LORISSON');
    });

    it('removes eye/hair color codes from name', async () => {
      mockRecognize.mockResolvedValue(
        makeResult([
          [{ text: 'FLORIDA' }],
          [{ text: 'DL F123456789' }],
          [{ text: 'SMITH' }],
          [{ text: 'JANE BLK' }],
        ]),
      );
      const data = await provider.processDocument(Buffer.from('img'), 'drivers_license');
      expect(data.name).toBe('JANE SMITH');
    });

    it('removes SEX field token from name', async () => {
      mockRecognize.mockResolvedValue(
        makeResult([
          [{ text: 'NEW YORK' }],
          [{ text: 'DL 123456789' }],
          [{ text: 'DOE' }],
          [{ text: 'JOHN SEX' }],
        ]),
      );
      const data = await provider.processDocument(Buffer.from('img'), 'drivers_license');
      expect(data.name).toBe('JOHN DOE');
    });

    it('keeps valid name unchanged when no noise present', async () => {
      mockRecognize.mockResolvedValue(
        makeResult([
          [{ text: 'TEXAS' }],
          [{ text: 'DL TX9876543' }],
          [{ text: 'MARTINEZ' }],
          [{ text: 'ELENA ROSA' }],
        ]),
      );
      const data = await provider.processDocument(Buffer.from('img'), 'drivers_license');
      expect(data.name).toBe('ELENA ROSA MARTINEZ');
    });
  });

  describe('state-specific DL number formats', () => {
    it('Idaho: 2 letters + 6 digits + 1 letter (e.g., AB123456C)', async () => {
      mockRecognize.mockResolvedValue(
        makeResult([
          [{ text: 'IDAHO' }],
          [{ text: 'DRIVER LICENSE' }],
          [{ text: 'DL JK234567A' }],
          [{ text: 'LN ANDERSON' }],
          [{ text: 'FN SARAH' }],
          [{ text: 'DOB: 03/15/1992' }],
        ]),
      );
      const data = await provider.processDocument(Buffer.from('img'), 'drivers_license');
      expect(data.document_number).toBe('JK234567A');
    });

    it('North Dakota: 3 letters + 6 digits (e.g., ABC123456)', async () => {
      mockRecognize.mockResolvedValue(
        makeResult([
          [{ text: 'NORTH DAKOTA' }],
          [{ text: 'DRIVER LICENSE' }],
          [{ text: 'DL SMI123456' }],
          [{ text: 'Name: SMITH, JOHN' }],
          [{ text: 'DOB: 07/04/1985' }],
        ]),
      );
      const data = await provider.processDocument(Buffer.from('img'), 'drivers_license');
      expect(data.document_number).toBe('SMI123456');
    });

    it('New Hampshire current: NHL + 8 digits', async () => {
      mockRecognize.mockResolvedValue(
        makeResult([
          [{ text: 'NEW HAMPSHIRE' }],
          [{ text: 'DRIVER LICENSE' }],
          [{ text: 'NHL12345678' }],
          [{ text: 'LN BAKER' }],
          [{ text: 'FN MICHAEL' }],
          [{ text: 'DOB: 11/20/1980' }],
        ]),
      );
      const data = await provider.processDocument(Buffer.from('img'), 'drivers_license');
      expect(data.document_number).toBe('NHL12345678');
    });

    it('New Hampshire legacy: 2 digits + 3 letters + 5 digits', async () => {
      mockRecognize.mockResolvedValue(
        makeResult([
          [{ text: 'NEW HAMPSHIRE' }],
          [{ text: 'DRIVER LICENSE' }],
          [{ text: '12BAK45678' }],
          [{ text: 'LN BAKER' }],
          [{ text: 'FN ANNA' }],
          [{ text: 'DOB: 06/15/1975' }],
        ]),
      );
      const data = await provider.processDocument(Buffer.from('img'), 'drivers_license');
      expect(data.document_number).toBe('12BAK45678');
    });

    it('Iowa mixed: 3 digits + 2 letters + 4 digits (e.g., 123AB4567)', async () => {
      mockRecognize.mockResolvedValue(
        makeResult([
          [{ text: 'IOWA' }],
          [{ text: 'DRIVER LICENSE' }],
          [{ text: 'DL 456CD7890' }],
          [{ text: 'Name: LARSON, EMILY' }],
          [{ text: 'DOB: 09/08/1999' }],
        ]),
      );
      const data = await provider.processDocument(Buffer.from('img'), 'drivers_license');
      expect(data.document_number).toBe('456CD7890');
    });

    it('Montana: 13-14 digit format', async () => {
      mockRecognize.mockResolvedValue(
        makeResult([
          [{ text: 'MONTANA' }],
          [{ text: 'DRIVER LICENSE' }],
          [{ text: 'DL 1234567890123' }],
          [{ text: 'Name: CARTER, WILLIAM' }],
          [{ text: 'DOB: 04/22/1978' }],
        ]),
      );
      const data = await provider.processDocument(Buffer.from('img'), 'drivers_license');
      expect(data.document_number).toBe('1234567890123');
    });

    it('Missouri: 9 digits + trailing letter (e.g., 123456789A)', async () => {
      mockRecognize.mockResolvedValue(
        makeResult([
          [{ text: 'MISSOURI' }],
          [{ text: 'DRIVER LICENSE' }],
          [{ text: 'DL 987654321B' }],
          [{ text: 'Name: JOHNSON, ROBERT' }],
          [{ text: 'DOB: 12/01/1990' }],
        ]),
      );
      const data = await provider.processDocument(Buffer.from('img'), 'drivers_license');
      expect(data.document_number).toBe('987654321B');
    });

    it('Missouri mixed: 3 digits + 1 letter + 6 digits', async () => {
      mockRecognize.mockResolvedValue(
        makeResult([
          [{ text: 'MISSOURI' }],
          [{ text: 'DRIVER LICENSE' }],
          [{ text: '123A456789' }],
          [{ text: 'LN DAVIS' }],
          [{ text: 'FN MARK' }],
          [{ text: 'DOB: 05/10/1988' }],
        ]),
      );
      const data = await provider.processDocument(Buffer.from('img'), 'drivers_license');
      expect(data.document_number).toBe('123A456789');
    });

    it('Vermont: 7 digits + A suffix (e.g., 1234567A)', async () => {
      mockRecognize.mockResolvedValue(
        makeResult([
          [{ text: 'VERMONT' }],
          [{ text: 'DRIVER LICENSE' }],
          [{ text: 'DL 1234567A' }],
          [{ text: 'Name: GREEN, LISA' }],
          [{ text: 'DOB: 08/30/1993' }],
        ]),
      );
      const data = await provider.processDocument(Buffer.from('img'), 'drivers_license');
      expect(data.document_number).toBe('1234567A');
    });

    it('Maine: 7 digits + letter suffix (e.g., 1234567X)', async () => {
      mockRecognize.mockResolvedValue(
        makeResult([
          [{ text: 'MAINE' }],
          [{ text: 'DRIVER LICENSE' }],
          [{ text: 'DL 7654321X' }],
          [{ text: 'LN THOMPSON' }],
          [{ text: 'FN DANIEL' }],
          [{ text: 'DOB: 02/14/1986' }],
        ]),
      );
      const data = await provider.processDocument(Buffer.from('img'), 'drivers_license');
      expect(data.document_number).toBe('7654321X');
    });

    it('New Jersey: 1 letter + 14 digits', async () => {
      mockRecognize.mockResolvedValue(
        makeResult([
          [{ text: 'NEW JERSEY' }],
          [{ text: 'DRIVER LICENSE' }],
          [{ text: 'DL S12345678901234' }],
          [{ text: 'Name: PATEL, RAVI KUMAR' }],
          [{ text: 'DOB: 01/25/1995' }],
        ]),
      );
      const data = await provider.processDocument(Buffer.from('img'), 'drivers_license');
      expect(data.document_number).toBe('S12345678901234');
    });

    it('Wisconsin: 1 letter + 13 digits', async () => {
      mockRecognize.mockResolvedValue(
        makeResult([
          [{ text: 'WISCONSIN' }],
          [{ text: 'DRIVER LICENSE' }],
          [{ text: 'DL M1234567890123' }],
          [{ text: 'Name: NGUYEN, TRAN' }],
          [{ text: 'DOB: 10/12/1997' }],
        ]),
      );
      const data = await provider.processDocument(Buffer.from('img'), 'drivers_license');
      expect(data.document_number).toBe('M1234567890123');
    });

    it('Pennsylvania: 8 pure digits', async () => {
      mockRecognize.mockResolvedValue(
        makeResult([
          [{ text: 'PENNSYLVANIA' }],
          [{ text: 'DRIVER LICENSE' }],
          [{ text: 'DL 12345678' }],
          [{ text: 'Name: WILSON, JAMES' }],
          [{ text: 'DOB: 06/20/1983' }],
        ]),
      );
      const data = await provider.processDocument(Buffer.from('img'), 'drivers_license');
      expect(data.document_number).toBe('12345678');
    });

    it('Nevada X-prefix: X + 8 digits', async () => {
      mockRecognize.mockResolvedValue(
        makeResult([
          [{ text: 'NEVADA' }],
          [{ text: 'DRIVER LICENSE' }],
          [{ text: 'X12345678' }],
          [{ text: 'LN RODRIGUEZ' }],
          [{ text: 'FN CARLOS' }],
          [{ text: 'DOB: 03/07/1991' }],
        ]),
      );
      const data = await provider.processDocument(Buffer.from('img'), 'drivers_license');
      expect(data.document_number).toBe('X12345678');
    });

    it('Washington WDL format', async () => {
      mockRecognize.mockResolvedValue(
        makeResult([
          [{ text: 'WASHINGTON' }],
          [{ text: 'DRIVER LICENSE' }],
          [{ text: 'WDLBCDFGH1234' }],
          [{ text: 'LN KIM' }],
          [{ text: 'FN JENNY' }],
          [{ text: 'DOB: 04/18/1994' }],
        ]),
      );
      const data = await provider.processDocument(Buffer.from('img'), 'drivers_license');
      expect(data.document_number).toBe('WDLBCDFGH1234');
    });

    it('Kansas alternating: letter-digit-letter-digit-letter (e.g., K1A2B)', async () => {
      mockRecognize.mockResolvedValue(
        makeResult([
          [{ text: 'KANSAS' }],
          [{ text: 'DRIVER LICENSE' }],
          [{ text: 'DL K1A2B' }],
          [{ text: 'Name: BROWN, TYLER' }],
          [{ text: 'DOB: 11/30/2000' }],
        ]),
      );
      const data = await provider.processDocument(Buffer.from('img'), 'drivers_license');
      expect(data.document_number).toBe('K1A2B');
    });

    it('Kansas K-prefix: K + 8 digits', async () => {
      mockRecognize.mockResolvedValue(
        makeResult([
          [{ text: 'KANSAS' }],
          [{ text: 'DRIVER LICENSE' }],
          [{ text: 'DL K12345678' }],
          [{ text: 'Name: BROWN, TYLER' }],
          [{ text: 'DOB: 11/30/2000' }],
        ]),
      );
      const data = await provider.processDocument(Buffer.from('img'), 'drivers_license');
      expect(data.document_number).toBe('K12345678');
    });

    it('Colorado: ##-###-#### format', async () => {
      mockRecognize.mockResolvedValue(
        makeResult([
          [{ text: 'COLORADO' }],
          [{ text: 'DRIVER LICENSE' }],
          [{ text: 'DL 12-345-6789' }],
          [{ text: 'Name: HARRIS, AMY' }],
          [{ text: 'DOB: 07/22/1989' }],
        ]),
      );
      const data = await provider.processDocument(Buffer.from('img'), 'drivers_license');
      expect(data.document_number).toBe('123456789');
    });

    it('Missouri R-suffix: letter + 6 digits + R', async () => {
      mockRecognize.mockResolvedValue(
        makeResult([
          [{ text: 'MISSOURI' }],
          [{ text: 'DRIVER LICENSE' }],
          [{ text: 'A123456R' }],
          [{ text: 'LN MARTIN' }],
          [{ text: 'FN SUSAN' }],
          [{ text: 'DOB: 09/03/1982' }],
        ]),
      );
      const data = await provider.processDocument(Buffer.from('img'), 'drivers_license');
      expect(data.document_number).toBe('A123456R');
    });

    it('Operator License NO label variant', async () => {
      mockRecognize.mockResolvedValue(
        makeResult([
          [{ text: 'WASHINGTON' }],
          [{ text: 'DRIVER LICENSE' }],
          [{ text: 'Operator License No WDLBCDFGH9999' }],
          [{ text: 'LN LEE' }],
          [{ text: 'FN CHRIS' }],
          [{ text: 'DOB: 05/01/1996' }],
        ]),
      );
      const data = await provider.processDocument(Buffer.from('img'), 'drivers_license');
      expect(data.document_number).toBe('WDLBCDFGH9999');
    });
  });
});

describe('standardizeDateFormat', () => {
  it('converts MM/DD/YYYY to YYYY-MM-DD', () => {
    expect(standardizeDateFormat('01/15/1990')).toBe('1990-01-15');
  });

  it('converts DD/MM/YYYY (day > 12) to YYYY-MM-DD', () => {
    expect(standardizeDateFormat('25/03/1990')).toBe('1990-03-25');
  });

  it('expands two-digit year (≤30 → 20xx)', () => {
    expect(standardizeDateFormat('01/15/25')).toBe('2025-01-15');
  });

  it('expands two-digit year (>30 → 19xx)', () => {
    expect(standardizeDateFormat('01/15/85')).toBe('1985-01-15');
  });

  it('handles dot separators', () => {
    expect(standardizeDateFormat('15.03.1990')).toBe('1990-03-15');
  });

  it('returns original string if unparseable', () => {
    expect(standardizeDateFormat('not-a-date')).toBe('not-a-date');
  });
});
