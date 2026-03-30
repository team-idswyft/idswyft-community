/**
 * OCR Service — Engine Worker version.
 *
 * Simplified wrapper: calls OCR provider directly with a buffer.
 * No StorageService, VerificationService, or ProviderMetrics dependencies.
 */

import { logger } from '@/utils/logger.js';
import type { OCRData, OCRProvider, LLMProviderConfig } from '@idswyft/shared';
import { createOCRProvider } from '@/providers/ocr/index.js';

export class OCRService {
  private provider: OCRProvider;

  constructor() {
    this.provider = createOCRProvider();
    logger.info('OCR provider initialised (engine)', { provider: this.provider.name });
  }

  async processDocumentFromBuffer(
    buffer: Buffer,
    documentType: string,
    issuingCountry?: string,
    llmConfig?: LLMProviderConfig,
  ): Promise<OCRData> {
    logger.info('Starting OCR processing (buffer mode)', { documentType, issuingCountry });

    try {
      const start = Date.now();
      const ocrData = await this.provider.processDocument(buffer, documentType, issuingCountry, llmConfig);
      const elapsed = Date.now() - start;

      logger.info('OCR processing completed', {
        provider: this.provider.name,
        elapsedMs: elapsed,
        extractedFields: Object.keys(ocrData).length,
      });

      return ocrData;
    } catch (error) {
      logger.error('OCR processing failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw new Error(`OCR processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}
