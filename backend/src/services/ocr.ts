import { logger } from '@/utils/logger.js';
import { StorageService } from './storage.js';
import { VerificationService } from './verification.js';
import { ProviderMetricsService } from './providerMetrics.js';
import { OCRData } from '@/types/index.js';
import { createOCRProvider } from '@/providers/ocr/index.js';
import type { OCRProvider } from '@/providers/types.js';

export class OCRService {
  private storageService: StorageService;
  private verificationService: VerificationService;
  private metricsService: ProviderMetricsService;
  private provider: OCRProvider;

  constructor() {
    this.storageService = new StorageService();
    this.verificationService = new VerificationService();
    this.metricsService = new ProviderMetricsService();
    this.provider = createOCRProvider();
    logger.info('OCR provider initialised', { provider: this.provider.name });
  }

  async processDocument(
    documentId: string,
    filePath: string,
    documentType: string,
    issuingCountry?: string
  ): Promise<OCRData> {
    logger.info('Starting OCR processing', { documentId, filePath, documentType, issuingCountry });

    try {
      const fileBuffer = await this.storageService.downloadFile(filePath);

      let ocrData: OCRData;
      const start = Date.now();

      ocrData = await this.provider.processDocument(fileBuffer, documentType, issuingCountry);
      const scores = Object.values(ocrData.confidence_scores || {});
      const avgConfidence = scores.length > 0 ? scores.reduce((s, v) => s + v, 0) / scores.length : undefined;

      await this.metricsService.record({
        providerName: this.provider.name,
        providerType: 'ocr',
        verificationId: documentId,
        latencyMs: Date.now() - start,
        success: true,
        confidenceScore: avgConfidence,
      });

      await this.verificationService.updateDocument(documentId, {
        ocr_extracted: true,
        quality_score: 0.5,
      });

      logger.info('OCR processing completed', {
        documentId,
        provider: this.provider.name,
        extractedFields: Object.keys(ocrData).length,
      });

      return ocrData;
    } catch (error) {
      logger.error('OCR processing failed', {
        documentId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      await this.verificationService.updateDocument(documentId, {
        ocr_extracted: false,
        quality_score: 0,
      });

      throw new Error(`OCR processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  validateExtractedData(ocrData: OCRData): {
    isValid: boolean;
    errors: string[];
    warnings: string[];
  } {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!ocrData.name || ocrData.name.length < 2) {
      errors.push('Name is missing or too short');
    }

    if (!ocrData.document_number || ocrData.document_number.length < 4) {
      errors.push('Document number is missing or too short');
    }

    if (ocrData.date_of_birth && !this.isValidDate(ocrData.date_of_birth)) {
      errors.push('Invalid date of birth format');
    }

    if (ocrData.expiration_date && !this.isValidDate(ocrData.expiration_date)) {
      errors.push('Invalid expiration date format');
    }

    if (ocrData.expiration_date && this.isValidDate(ocrData.expiration_date)) {
      if (new Date(ocrData.expiration_date) < new Date()) {
        warnings.push('Document appears to be expired');
      }
    }

    const scores = Object.values(ocrData.confidence_scores || {});
    if (scores.length > 0) {
      const avg = scores.reduce((s, v) => s + v, 0) / scores.length;
      if (avg < 0.6) warnings.push('Low OCR confidence scores detected');
    }

    return { isValid: errors.length === 0, errors, warnings };
  }

  private isValidDate(dateStr: string): boolean {
    const d = new Date(dateStr);
    return d instanceof Date && !isNaN(d.getTime());
  }
}
