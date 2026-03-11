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
      expect(data.address).toBe('123 Main Street, Springfield');
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
