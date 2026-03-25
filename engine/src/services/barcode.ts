/**
 * Barcode Service — Engine Worker version.
 *
 * Same logic as backend version but works directly with image buffers
 * instead of storage paths (images arrive via HTTP multipart).
 */

import { logger } from '@/utils/logger.js';
import { VERIFICATION_THRESHOLDS } from '@/config/verificationThresholds.js';
import {
  VerificationFailureType,
  VerificationErrorClassifier
} from '@/types/verificationTypes.js';
// @ts-ignore - No types available for parse-usdl
import { parse as parseUSDL } from 'parse-usdl';

// Optional dependency imports with graceful fallbacks
let Jimp: any = null;
let Tesseract: any = null;
let ZXing: any = null;

try {
  Jimp = (await import('jimp')).default;
} catch (error) {
  logger.warn('Jimp not available, using AI-only processing');
}

try {
  Tesseract = await import('tesseract.js');
} catch (error) {
  logger.warn('Tesseract.js not available, using AI-only processing');
}

try {
  ZXing = await import('@zxing/library');
  logger.info('ZXing barcode library loaded for PDF417 detection');
} catch (error) {
  logger.warn('ZXing library not available, falling back to OCR-based detection');
}

export interface BarcodeResult {
  type: 'qr_code' | 'barcode' | 'pdf417' | 'datamatrix';
  data: string;
  decoded_data?: any;
  confidence: number;
  location?: { x: number; y: number; width: number; height: number };
}

export interface PDF417Data {
  raw_data: string;
  parsed_data: {
    firstName?: string;
    lastName?: string;
    middleName?: string;
    dateOfBirth?: string;
    licenseNumber?: string;
    expirationDate?: string;
    issueDate?: string;
    address?: string;
    city?: string;
    state?: string;
    zipCode?: string;
    gender?: string;
    eyeColor?: string;
    height?: string;
    weight?: string;
    endorsements?: string;
    restrictions?: string;
    vehicleClass?: string;
    documentDiscriminator?: string;
    organ_donor?: boolean;
  };
  confidence: number;
  validation_status: 'valid' | 'invalid' | 'partial';
}

export interface BackOfIdData {
  magnetic_stripe?: string;
  qr_code?: string;
  barcode_data?: string;
  pdf417_data?: PDF417Data;
  raw_text?: string;
  parsed_data?: {
    id_number?: string;
    expiry_date?: string;
    issuing_authority?: string;
    address?: string;
    first_name?: string;
    last_name?: string;
    date_of_birth?: string;
    additional_info?: any;
  };
  verification_codes?: string[];
  security_features?: string[];
}

export class BarcodeService {
  constructor() {
    logger.info('Barcode scanning enabled (ZXing + parse-usdl)');
  }

  async parsePDF417(rawBarcodeData: string): Promise<PDF417Data> {
    try {
      let parsedData = parseUSDL(rawBarcodeData, { suppressErrors: true });
      const manualParsed = this.parseAAMVAFieldCodes(rawBarcodeData);
      parsedData = { ...(parsedData || {}), ...manualParsed };

      if (!parsedData) {
        throw new Error('PDF417 parsing returned null - invalid barcode format');
      }

      const totalFields = Object.keys(parsedData).length;
      const populatedFields = Object.values(parsedData).filter(
        (value: unknown) => value !== null && value !== undefined && value !== ''
      ).length;
      const confidence = Math.min(0.95, populatedFields / Math.max(totalFields, 10));

      let validation_status: 'valid' | 'invalid' | 'partial' = 'valid';
      const criticalFields = ['firstName', 'lastName', 'licenseNumber', 'dateOfBirth'];
      const missingCriticalFields = criticalFields.filter(
        field => !parsedData[field] || parsedData[field] === ''
      );

      if (missingCriticalFields.length > 2) validation_status = 'invalid';
      else if (missingCriticalFields.length > 0) validation_status = 'partial';

      return {
        raw_data: rawBarcodeData,
        parsed_data: {
          firstName: parsedData.firstName || undefined,
          lastName: parsedData.lastName || undefined,
          middleName: parsedData.middleName || undefined,
          dateOfBirth: parsedData.dateOfBirth || undefined,
          licenseNumber: parsedData.licenseNumber || undefined,
          expirationDate: parsedData.expirationDate || undefined,
          issueDate: parsedData.issueDate || undefined,
          address: parsedData.address || undefined,
          city: parsedData.city || undefined,
          state: parsedData.state || undefined,
          zipCode: parsedData.zipCode || undefined,
          gender: parsedData.gender || undefined,
          eyeColor: parsedData.eyeColor || undefined,
          height: parsedData.height || undefined,
          weight: parsedData.weight || undefined,
          endorsements: parsedData.endorsements || undefined,
          restrictions: parsedData.restrictions || undefined,
          vehicleClass: parsedData.vehicleClass || undefined,
          documentDiscriminator: parsedData.documentDiscriminator || undefined,
          organ_donor: parsedData.organDonor || false,
        },
        confidence,
        validation_status,
      };
    } catch (error) {
      logger.error('PDF417 parsing failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        dataLength: rawBarcodeData.length,
      });
      return { raw_data: rawBarcodeData, parsed_data: {}, confidence: 0, validation_status: 'invalid' };
    }
  }

  /**
   * Scan back of ID from a buffer (engine worker version).
   * Unlike the backend version, this accepts a Buffer directly instead of a storage path.
   */
  async scanBackOfIdFromBuffer(imageBuffer: Buffer): Promise<BackOfIdData> {
    logger.info('Starting back-of-ID scanning with PDF417 only (buffer mode)', {
      bufferSize: imageBuffer.length,
    });
    return this.scanWithPDF417AndOCRFromBuffer(imageBuffer);
  }

  private async scanWithPDF417AndOCRFromBuffer(imageBuffer: Buffer): Promise<BackOfIdData> {
    try {
      // First try proper PDF417 barcode detection with ZXing
      const pdf417RawData = await this.detectPDF417WithZXingFromBuffer(imageBuffer);

      let pdf417Data: PDF417Data = {
        raw_data: '',
        parsed_data: {},
        confidence: 0,
        validation_status: 'invalid',
      };

      if (pdf417RawData) {
        pdf417Data = await this.parsePDF417(pdf417RawData);
      } else {
        pdf417Data = await this.detectPDF417WithOCRFromBuffer(imageBuffer);
      }

      // Also run OCR for additional data
      const ocrData = await this.scanWithLocalOCRFromBuffer(imageBuffer);

      const combinedResult: BackOfIdData = {
        ...ocrData,
        pdf417_data: pdf417Data.validation_status !== 'invalid' ? pdf417Data : undefined,
      };

      if (pdf417Data.validation_status !== 'invalid') {
        combinedResult.parsed_data = {
          ...ocrData.parsed_data,
          id_number: pdf417Data.parsed_data.licenseNumber || ocrData.parsed_data?.id_number,
          expiry_date: pdf417Data.parsed_data.expirationDate || ocrData.parsed_data?.expiry_date,
          issuing_authority: pdf417Data.parsed_data.state || ocrData.parsed_data?.issuing_authority,
          address: this.combineAddress(pdf417Data.parsed_data) || ocrData.parsed_data?.address,
          additional_info: {
            ...ocrData.parsed_data?.additional_info,
            pdf417_parsed: true,
            pdf417_confidence: pdf417Data.confidence,
            name: `${pdf417Data.parsed_data.firstName || ''} ${pdf417Data.parsed_data.middleName || ''} ${pdf417Data.parsed_data.lastName || ''}`.trim(),
            date_of_birth: pdf417Data.parsed_data.dateOfBirth,
          },
        };
      }

      return combinedResult;
    } catch (error) {
      logger.error('Combined PDF417 + OCR scanning failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return this.scanWithLocalOCRFromBuffer(imageBuffer);
    }
  }

  private async detectPDF417WithZXingFromBuffer(imageBuffer: Buffer): Promise<string | null> {
    if (!ZXing || !Jimp) return null;

    try {
      const sourceImage = await Jimp.read(imageBuffer);
      const strategies = this.buildPreprocessingStrategies(sourceImage);

      for (const { name, image } of strategies) {
        const decoded = this.tryDecodeBarcode(image, name);
        if (decoded) return decoded;
      }

      return null;
    } catch (error) {
      logger.warn('ZXing PDF417 detection failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  private buildPreprocessingStrategies(sourceImage: any): Array<{ name: string; image: any }> {
    const strategies: Array<{ name: string; image: any }> = [];

    strategies.push({ name: 'grey+contrast(0.5)+norm', image: sourceImage.clone().greyscale().contrast(0.5).normalize() });
    strategies.push({ name: 'grey+contrast(0.8)+norm', image: sourceImage.clone().greyscale().contrast(0.8).normalize() });
    strategies.push({ name: 'grey+contrast(0.3)+norm', image: sourceImage.clone().greyscale().contrast(0.3).normalize() });
    strategies.push({ name: 'grey+contrast(-0.3)+norm', image: sourceImage.clone().greyscale().contrast(-0.3).normalize() });
    strategies.push({ name: 'grey+bright(0.2)+contrast(0.5)', image: sourceImage.clone().greyscale().brightness(0.2).contrast(0.5).normalize() });

    const { width } = sourceImage.bitmap;
    if (width < 1200) {
      strategies.push({
        name: 'upscale+grey+contrast(0.5)',
        image: sourceImage.clone().resize(Math.max(width * 2, 1600), Jimp.default.AUTO).greyscale().contrast(0.5).normalize(),
      });
    }

    strategies.push({ name: 'grey-only', image: sourceImage.clone().greyscale() });
    strategies.push({ name: 'inverted+contrast(0.3)', image: sourceImage.clone().greyscale().invert().contrast(0.3).normalize() });

    return strategies;
  }

  private tryDecodeBarcode(image: any, strategyName: string): string | null {
    const { width, height } = image.bitmap;
    const imageData = new Uint8ClampedArray(image.bitmap.data);

    const grayscaleData = new Uint8ClampedArray(width * height);
    for (let i = 0; i < grayscaleData.length; i++) {
      const px = i * 4;
      grayscaleData[i] = Math.round(0.299 * imageData[px] + 0.587 * imageData[px + 1] + 0.114 * imageData[px + 2]);
    }

    const luminanceSource = new ZXing.PlanarYUVLuminanceSource(grayscaleData, width, height, 0, 0, width, height, false);

    const binarizers = [
      { name: 'Hybrid', binarizer: new ZXing.HybridBinarizer(luminanceSource) },
      { name: 'GlobalHistogram', binarizer: new ZXing.GlobalHistogramBinarizer(luminanceSource) },
    ];

    const readers = [new ZXing.PDF417Reader(), new ZXing.MultiFormatReader()];

    const hints = new Map();
    hints.set(ZXing.DecodeHintType.POSSIBLE_FORMATS, [ZXing.BarcodeFormat.PDF_417]);
    hints.set(ZXing.DecodeHintType.TRY_HARDER, true);
    hints.set(ZXing.DecodeHintType.PURE_BARCODE, false);

    for (const { name: binName, binarizer } of binarizers) {
      const binaryBitmap = new ZXing.BinaryBitmap(binarizer);
      for (const reader of readers) {
        try {
          const result = reader.decode(binaryBitmap, hints);
          if (result && result.getText()) {
            return result.getText();
          }
        } catch {
          // Expected — most strategy+reader combos will fail
        }
      }
    }
    return null;
  }

  private async detectPDF417WithOCRFromBuffer(imageBuffer: Buffer): Promise<PDF417Data> {
    try {
      const ocrData = await this.scanWithLocalOCRFromBuffer(imageBuffer);
      const ocrText = ocrData.raw_text || '';

      if (ocrData.parsed_data?.id_number) {
        return {
          raw_data: ocrText,
          parsed_data: {
            licenseNumber: ocrData.parsed_data.id_number,
            firstName: ocrData.parsed_data.first_name || '',
            lastName: ocrData.parsed_data.last_name || '',
            dateOfBirth: ocrData.parsed_data.date_of_birth,
            expirationDate: ocrData.parsed_data.expiry_date,
            state: ocrData.parsed_data.issuing_authority,
            address: ocrData.parsed_data.address,
          },
          confidence: 0.6,
          validation_status: 'partial' as const,
        };
      }

      throw new Error('No PDF417 barcode pattern detected in OCR text');
    } catch {
      return { raw_data: '', parsed_data: {}, confidence: 0, validation_status: 'invalid' };
    }
  }

  private async scanWithLocalOCRFromBuffer(imageBuffer: Buffer): Promise<BackOfIdData> {
    try {
      if (!Tesseract || !Jimp) {
        throw new Error('OCR dependencies not available');
      }

      const processedBuffer = await this.preprocessImageForBackOfId(imageBuffer);

      const worker = await Tesseract.createWorker('eng', 1, {
        logger: () => {},
      });

      await worker.setParameters({
        tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789.,/- :()[]',
        tessedit_pageseg_mode: Tesseract.PSM.AUTO,
        preserve_interword_spaces: '1',
        tessedit_ocr_engine_mode: Tesseract.OEM.DEFAULT,
      });

      const { data } = await worker.recognize(processedBuffer);
      await worker.terminate();

      const structuredData = this.extractBackOfIdStructuredData(data.text);
      structuredData.raw_text = data.text;

      return structuredData;
    } catch (error) {
      logger.error('Local OCR back-of-ID scanning failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return {
        parsed_data: { additional_info: { error: 'Local OCR failed' } },
        verification_codes: [],
        security_features: [],
      };
    }
  }

  private async preprocessImageForBackOfId(imageBuffer: Buffer): Promise<Buffer> {
    try {
      if (!Jimp) return imageBuffer;

      const image = await Jimp.read(imageBuffer);
      const enhancedImage = image
        .resize(image.getWidth() < 1200 ? 1200 : Math.max(image.getWidth(), 1200), Jimp.default.AUTO)
        .greyscale()
        .contrast(0.3)
        .brightness(0.1)
        .normalize();

      return await enhancedImage.getBufferAsync(Jimp.default.MIME_PNG);
    } catch {
      return imageBuffer;
    }
  }

  private extractBackOfIdStructuredData(ocrText: string): BackOfIdData {
    const cleanText = ocrText.replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim();
    const result: BackOfIdData = { parsed_data: {}, verification_codes: [], security_features: [] };

    // Extract ID/License Number
    const idPatterns = [
      /(?:ID|DL|LICENSE)\s*(?:NO|NUM|NUMBER|#)?\s*:?\s*([A-Z0-9\-\s]{6,20})/i,
      /([A-Z]{1,3}\s*\d{6,12})/g,
      /(\d{3}\s*\d{3}\s*\d{3,6})/g,
      /([A-Z]\d{8,12})/g,
      /(\d{8,15})/g,
    ];

    for (const pattern of idPatterns) {
      const matches = cleanText.match(pattern);
      if (matches) {
        for (const match of matches) {
          const candidate = Array.isArray(match) ? match[1] : match;
          const normalizedCandidate = candidate.toUpperCase().replace(/\s+/g, '');
          if (!candidate.match(/\d{2}[\/\-\.]\d{2}/) && !candidate.match(/^\d{10}$/) && normalizedCandidate.length >= 6) {
            result.parsed_data!.id_number = normalizedCandidate;
            break;
          }
        }
        if (result.parsed_data!.id_number) break;
      }
    }

    return result;
  }

  private parseAAMVAFieldCodes(rawData: string): any {
    const fields: any = {};
    try {
      const aamvaFields: Record<string, string> = {
        'DAA': 'fullName', 'DAC': 'firstName', 'DAD': 'middleName', 'DCS': 'lastName',
        'DBB': 'dateOfBirth', 'DBA': 'expirationDate', 'DBD': 'issueDate',
        'DAG': 'address', 'DAI': 'city', 'DAJ': 'state', 'DAK': 'zipCode',
        'DAQ': 'licenseNumber', 'DCF': 'documentDiscriminator', 'DBC': 'gender',
        'DAY': 'eyeColor', 'DAU': 'height', 'DCE': 'weight',
        'DCA': 'vehicleClass', 'DCB': 'restrictions', 'DCD': 'endorsements',
      };

      for (const [code, fieldName] of Object.entries(aamvaFields)) {
        const regex = new RegExp(`${code}([^\\r\\n\\x1e]*?)(?=\\x1e|[A-Z]{3}|$)`, 'g');
        const match = regex.exec(rawData);
        if (match && match[1]) {
          let value = match[1].trim();

          if (['dateOfBirth', 'expirationDate', 'issueDate'].includes(fieldName) && value.length === 8) {
            if (value.substring(0, 4) > '1900') {
              value = `${value.substring(4, 6)}/${value.substring(6, 8)}/${value.substring(0, 4)}`;
            } else {
              value = `${value.substring(0, 2)}/${value.substring(2, 4)}/${value.substring(4, 8)}`;
            }
          }

          fields[fieldName] = value;
        }
      }

      // Fallback for license number
      if (!fields.licenseNumber) {
        const daqPatterns = [/DAQ([A-Z0-9\-]+)/i, /DAQ\s*([A-Z0-9\-]+)/i, /DAQ([^\r\n\x1e]+)/i];
        for (const pattern of daqPatterns) {
          const match = rawData.match(pattern);
          if (match && match[1]) {
            fields.licenseNumber = match[1].trim();
            break;
          }
        }
      }

      return fields;
    } catch {
      return {};
    }
  }

  private combineAddress(pdf417Data: PDF417Data['parsed_data']): string | undefined {
    const parts = [pdf417Data.address, pdf417Data.city, pdf417Data.state, pdf417Data.zipCode]
      .filter(part => part && part.trim().length > 0);
    return parts.length > 0 ? parts.join(', ') : undefined;
  }
}
