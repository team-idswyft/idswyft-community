import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockProcessDocument = vi.fn();

// Mock engineClient before importing the module under test
vi.mock('@/services/engineClient.js', () => ({
  default: {
    isEnabled: vi.fn(),
    extractOCR: vi.fn(),
  },
}));

// Mock OCRService with a proper class constructor to avoid "is not a constructor" error.
// Uses a factory that returns a fresh instance with the shared mockProcessDocument fn.
vi.mock('../../../services/ocr.js', () => ({
  OCRService: class MockOCRService {
    processDocument = mockProcessDocument;
  },
}));

// Mock logger
vi.mock('@/utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import engineClient from '@/services/engineClient.js';
import { extractAddressDocument } from '../addressExtractor.js';

const mockOCRData = {
  name: 'John Smith',
  address: '123 Main St, Springfield, IL 62704',
  raw_text: 'Electric Company\nJohn Smith\n123 Main St\nSpringfield IL 62704',
  confidence_scores: { name: 0.9, address: 0.85 },
};

describe('extractAddressDocument — engine routing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('routes OCR through engine when enabled and buffer is provided', async () => {
    vi.mocked(engineClient.isEnabled).mockReturnValue(true);
    vi.mocked(engineClient.extractOCR).mockResolvedValue(mockOCRData as any);

    const buffer = Buffer.from('fake-image');
    const result = await extractAddressDocument('/path/to/doc.jpg', 'doc-1', 'utility_bill', buffer);

    expect(engineClient.isEnabled).toHaveBeenCalled();
    expect(engineClient.extractOCR).toHaveBeenCalledWith(buffer, 'utility_bill');
    expect(mockProcessDocument).not.toHaveBeenCalled();
    expect(result.name).toBe('John Smith');
    expect(result.address).toBe('123 Main St, Springfield, IL 62704');
    expect(result.confidence).toBeCloseTo(0.875);
  });

  it('falls back to local OCR when engine is disabled', async () => {
    vi.mocked(engineClient.isEnabled).mockReturnValue(false);
    mockProcessDocument.mockResolvedValue(mockOCRData);

    const result = await extractAddressDocument('/path/to/doc.jpg', 'doc-1', 'utility_bill');

    expect(engineClient.isEnabled).toHaveBeenCalled();
    expect(engineClient.extractOCR).not.toHaveBeenCalled();
    expect(mockProcessDocument).toHaveBeenCalledWith('doc-1', '/path/to/doc.jpg', 'utility_bill');
    expect(result.name).toBe('John Smith');
  });

  it('falls back to local OCR when engine is enabled but no buffer provided', async () => {
    vi.mocked(engineClient.isEnabled).mockReturnValue(true);
    mockProcessDocument.mockResolvedValue(mockOCRData);

    const result = await extractAddressDocument('/path/to/doc.jpg', 'doc-1', 'utility_bill');

    expect(engineClient.extractOCR).not.toHaveBeenCalled();
    expect(mockProcessDocument).toHaveBeenCalled();
    expect(result.name).toBe('John Smith');
  });

  it('returns parsed address components', async () => {
    vi.mocked(engineClient.isEnabled).mockReturnValue(true);
    vi.mocked(engineClient.extractOCR).mockResolvedValue(mockOCRData as any);

    const buffer = Buffer.from('fake-image');
    const result = await extractAddressDocument('/path/to/doc.jpg', 'doc-1', 'utility_bill', buffer);

    expect(result.components.postalCode).toBe('62704');
    expect(result.components.state).toBe('IL');
    expect(result.components.streetNumber).toBe('123');
  });

  it('extracts document date from raw text', async () => {
    vi.mocked(engineClient.isEnabled).mockReturnValue(true);
    vi.mocked(engineClient.extractOCR).mockResolvedValue({
      ...mockOCRData,
      raw_text: 'Statement Date: January 15, 2024\nJohn Smith\n123 Main St',
    } as any);

    const buffer = Buffer.from('fake-image');
    const result = await extractAddressDocument('/path/to/doc.jpg', 'doc-1', 'utility_bill', buffer);

    expect(result.document_date).toBe('January 15, 2024');
  });
});
