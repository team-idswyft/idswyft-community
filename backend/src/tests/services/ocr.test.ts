import { describe, it, expect, vi, afterEach } from 'vitest';

// Mock heavy optional deps required by TesseractProvider
vi.mock('tesseract.js', () => ({
  default: {
    createWorker: vi.fn().mockResolvedValue({
      setParameters: vi.fn().mockResolvedValue(undefined),
      recognize: vi.fn().mockResolvedValue({ data: { text: '' } }),
      terminate: vi.fn().mockResolvedValue(undefined),
    }),
    PSM: { SINGLE_BLOCK: 6 },
  },
}));

vi.mock('jimp', () => ({
  default: {
    read: vi.fn().mockResolvedValue({
      getWidth: vi.fn().mockReturnValue(100),
      getHeight: vi.fn().mockReturnValue(100),
      scaleToFit: vi.fn().mockReturnThis(),
      greyscale: vi.fn().mockReturnThis(),
      contrast: vi.fn().mockReturnThis(),
      brightness: vi.fn().mockReturnThis(),
      normalize: vi.fn().mockReturnThis(),
      blur: vi.fn().mockReturnThis(),
      convolute: vi.fn().mockReturnThis(),
      getBufferAsync: vi.fn().mockResolvedValue(Buffer.from('fake')),
    }),
    MIME_PNG: 'image/png',
  },
}));

vi.mock('@/utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../../services/storage.js', () => ({
  StorageService: class {
    downloadFile = vi.fn().mockResolvedValue(Buffer.from('fake-image-data'));
  },
}));

vi.mock('../../services/verification.js', () => ({
  VerificationService: class {
    updateDocument = vi.fn().mockResolvedValue(undefined);
  },
}));

vi.mock('@/config/index.js', () => ({
  default: { nodeEnv: 'test', ocr: { tesseractPath: '/usr/bin/tesseract' } },
}));

vi.mock('../../services/providerMetrics.js', () => ({
  ProviderMetricsService: class {
    record = vi.fn().mockResolvedValue(undefined);
    getProviderSummary = vi.fn().mockResolvedValue({ totalRequests: 0, successRate: 0, avgLatencyMs: 0, avgConfidence: 0 });
  },
}));

// Mock the provider factory at module level — avoids slow dynamic imports in test body
const mockProcessDocument = vi.fn();
vi.mock('@/providers/ocr/index.js', () => ({
  createOCRProvider: vi.fn(() => ({
    name: 'paddle',
    processDocument: mockProcessDocument,
  })),
}));

import { createOCRProvider } from '@/providers/ocr/index.js';
import { OCRService } from '../../services/ocr.js';

describe('OCRService provider delegation', () => {
  afterEach(() => {
    delete process.env.OPENAI_API_KEY;
    delete process.env.OCR_PROVIDER;
    vi.restoreAllMocks();
    mockProcessDocument.mockReset();
  });

  it('throws when provider fails (no silent fallback)', async () => {
    mockProcessDocument.mockRejectedValue(new Error('OCR engine crashed'));

    const service = new OCRService();

    await expect(service.processDocument('doc-1', '/fake/path.jpg', 'passport'))
      .rejects.toThrow('OCR processing failed');
  });

  it('defaults to paddle provider when OCR_PROVIDER is unset', () => {
    delete process.env.OCR_PROVIDER;
    const provider = createOCRProvider();
    expect(provider.name).toBe('paddle');
  });
});
