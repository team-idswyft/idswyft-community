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

describe('OCRService provider delegation', () => {
  afterEach(() => {
    delete process.env.OPENAI_API_KEY;
    delete process.env.OCR_PROVIDER;
    vi.restoreAllMocks();
  });

  it('throws when provider fails (no silent fallback)', async () => {
    // Mock the provider factory to return a provider that throws
    const { createOCRProvider } = await import('@/providers/ocr/index.js');
    vi.spyOn(
      await import('@/providers/ocr/index.js'),
      'createOCRProvider',
    ).mockReturnValue({
      name: 'crashing-provider',
      processDocument: vi.fn().mockRejectedValue(new Error('OCR engine crashed')),
    });

    const { OCRService } = await import('../../services/ocr.js');
    const service = new OCRService();

    await expect(service.processDocument('doc-1', '/fake/path.jpg', 'passport'))
      .rejects.toThrow('OCR processing failed');
  });

  it('defaults to paddle provider when OCR_PROVIDER is unset', async () => {
    delete process.env.OCR_PROVIDER;
    const { createOCRProvider } = await import('@/providers/ocr/index.js');
    const provider = createOCRProvider();
    expect(provider.name).toBe('paddle');
  });
});
