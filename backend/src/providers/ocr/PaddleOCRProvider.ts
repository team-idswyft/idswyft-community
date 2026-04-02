// Dynamic import — ppu-paddle-ocr is only available in dev mode or the Engine Worker.
// In production Docker, the engine handles OCR via HTTP (ENGINE_URL).
let PaddleOcrService: any;
type PaddleOcrResult = any;
import type { OCRProvider, LLMProviderConfig, ClassificationResult } from '@idswyft/shared';
import { getCountryFormat, findLowConfidenceFields, extractFieldsWithLLM, mergeLLMResults, classifyDocument } from '@idswyft/shared';
import { OCRData } from '../../types/index.js';
import { logger } from '@/utils/logger.js';
import { DriversLicenseExtractor } from './extractors/DriversLicenseExtractor.js';
import { PassportExtractor } from './extractors/PassportExtractor.js';
import { NationalIdExtractor } from './extractors/NationalIdExtractor.js';
import { InternationalExtractor } from './extractors/InternationalExtractor.js';
import { GenericExtractor } from './extractors/GenericExtractor.js';
import { getDocumentScript, isDefaultModelSupported } from './constants/languageMap.js';

// ── Public API re-exports ─────────────────────────────────────
export { standardizeDateFormat } from './utils/dateUtils.js';
export { STATE_DL_FORMATS } from '@idswyft/shared';

// ── Provider ──────────────────────────────────────────────────

export class PaddleOCRProvider implements OCRProvider {
  readonly name = 'paddle';

  private service:     any = null;
  private initPromise: Promise<void> | null = null;

  private async ensureInitialized(): Promise<any> {
    if (this.service) return this.service;
    if (!this.initPromise) {
      this.initPromise = (async () => {
        logger.info('PaddleOCRProvider: initializing ONNX models…');
        if (!PaddleOcrService) {
          const mod = await import('ppu-paddle-ocr');
          PaddleOcrService = mod.PaddleOcrService;
        }
        const svc = new PaddleOcrService({ debugging: { verbose: false } });
        await svc.initialize();
        this.service = svc;
        logger.info('PaddleOCRProvider: ready');
      })();
    }
    await this.initPromise;
    return this.service!;
  }

  async processDocument(buffer: Buffer, documentType: string, issuingCountry?: string, llmConfig?: LLMProviderConfig): Promise<OCRData> {
    const svc         = await this.ensureInitialized();
    const arrayBuffer = new Uint8Array(buffer).buffer;
    const result: PaddleOcrResult = await svc.recognize(arrayBuffer);

    const ocrData: OCRData = {
      raw_text:          result.text,
      confidence_scores: {},
    };

    // Auto-classify document type if not specified
    let resolvedDocType = documentType;
    let classificationResult: ClassificationResult | undefined;
    if (!documentType || documentType === 'auto') {
      classificationResult = classifyDocument(result.text);
      resolvedDocType = classificationResult.type;
      logger.info('Document auto-classified', {
        detected: classificationResult.type,
        confidence: classificationResult.confidence,
        signals: classificationResult.signals,
      });
    }

    // Language awareness: log when non-Latin script detected
    const country = issuingCountry?.toUpperCase();
    if (country && !isDefaultModelSupported(country)) {
      const script = getDocumentScript(country);
      logger.info('Non-Latin script detected — extraction quality may vary', {
        country, script, documentType: resolvedDocType,
      });
    }

    // Country-aware routing: use international extraction for non-US countries
    const countryFormat = country ? getCountryFormat(country, resolvedDocType) : null;

    if (country && country !== 'US' && countryFormat) {
      new InternationalExtractor().extract(result.lines, ocrData, countryFormat, country);
    } else {
      // Default extraction (US or unknown country)
      switch (resolvedDocType) {
        case 'passport':
          new PassportExtractor().extract(result.lines, ocrData);
          break;
        case 'drivers_license':
          new DriversLicenseExtractor().extract(result.lines, ocrData);
          break;
        case 'national_id':
          new NationalIdExtractor().extract(result.lines, ocrData);
          break;
        default:
          new GenericExtractor().extract(result.lines, ocrData);
      }
    }

    // Set issuing_country on OCR data if provided
    if (country) ocrData.issuing_country = country;

    // LLM fallback: re-extract low-confidence or empty fields via developer's LLM provider
    if (llmConfig) {
      const lowFields = findLowConfidenceFields(ocrData);
      if (lowFields.length > 0) {
        try {
          const llmResult = await extractFieldsWithLLM({
            imageBuffer: buffer,
            documentType: resolvedDocType,
            fieldsNeeded: lowFields,
            ocrContext: ocrData.raw_text,
            llmConfig,
          });
          mergeLLMResults(ocrData, llmResult);
          logger.info('PaddleOCRProvider: LLM fallback applied', {
            provider: llmConfig.provider,
            fieldsRequested: lowFields,
            fieldsExtracted: Object.keys(llmResult),
          });
        } catch (err) {
          logger.warn('PaddleOCRProvider: LLM fallback failed', {
            provider: llmConfig.provider,
            error: err instanceof Error ? err.message : 'Unknown',
          });
        }
      }
    }

    // Store classification result on OCR data
    if (classificationResult) {
      ocrData.detected_document_type = classificationResult.type;
      ocrData.classification_confidence = classificationResult.confidence;
    }

    logger.info('PaddleOCRProvider: extraction result', {
      documentType: resolvedDocType,
      issuingCountry: country,
      fields: Object.keys(ocrData).filter(k => k !== 'raw_text' && k !== 'confidence_scores'),
      ocrData,
    });

    return ocrData;
  }
}
