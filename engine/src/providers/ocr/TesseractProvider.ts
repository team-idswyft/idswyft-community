import Tesseract from 'tesseract.js';
import Jimp from 'jimp';
import type { OCRProvider, OCRData } from '@idswyft/shared';
import { logger } from '@/utils/logger.js';

export class TesseractProvider implements OCRProvider {
  readonly name = 'tesseract';

  async processDocument(buffer: Buffer, documentType: string, _issuingCountry?: string): Promise<OCRData> {
    const preprocessed = await this.preprocessImage(buffer);

    const worker = await Tesseract.createWorker('eng', 1, {});
    await worker.setParameters({
      tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789.,/-: ',
      tessedit_pageseg_mode: Tesseract.PSM.SINGLE_BLOCK,
      preserve_interword_spaces: '1',
    });

    const { data } = await worker.recognize(preprocessed);
    await worker.terminate();

    return this.extractStructuredData(data.text, documentType);
  }

  private async preprocessImage(imageBuffer: Buffer): Promise<Buffer> {
    try {
      const image = await Jimp.read(imageBuffer);

      const maxDimension = 2000;
      if (image.getWidth() > maxDimension || image.getHeight() > maxDimension) {
        image.scaleToFit(maxDimension, maxDimension);
      }

      const enhanced = image
        .greyscale()
        .contrast(0.3)
        .brightness(0.1)
        .normalize()
        .blur(0.5)
        .convolute([
          [ 0, -1,  0],
          [-1,  5, -1],
          [ 0, -1,  0],
        ]);

      return enhanced.getBufferAsync(Jimp.MIME_PNG);
    } catch (error) {
      logger.warn('TesseractProvider: image preprocessing failed, using original', {
        error: error instanceof Error ? error.message : 'Unknown',
      });
      return imageBuffer;
    }
  }

  private extractStructuredData(text: string, documentType: string): OCRData {
    const ocrData: OCRData = { raw_text: text, confidence_scores: {} };
    const cleanText = text.replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim();

    try {
      switch (documentType) {
        case 'passport':
          this.extractPassportData(cleanText, ocrData);
          break;
        case 'drivers_license':
          this.extractDriversLicenseData(cleanText, ocrData);
          break;
        case 'national_id':
          this.extractNationalIdData(cleanText, ocrData);
          break;
        default:
          this.extractGenericData(cleanText, ocrData);
      }
    } catch {
      this.extractGenericData(cleanText, ocrData);
    }

    return ocrData;
  }

  private extractPassportData(text: string, ocrData: OCRData): void {
    const nameMatch = text.match(/(?:Name|Surname|Given Names?)\s*[:\-]?\s*([A-Z][A-Z\s,]+)/i);
    if (nameMatch) { ocrData.name = nameMatch[1].trim(); ocrData.confidence_scores!.name = 0.8; }

    const dobMatch = text.match(/(?:Date of birth|Birth|DOB)\s*[:\-]?\s*(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/i);
    if (dobMatch) { ocrData.date_of_birth = this.standardizeDateFormat(dobMatch[1]); ocrData.confidence_scores!.date_of_birth = 0.9; }

    const passportMatch = text.match(/(?:Passport No|Number)\s*[:\-]?\s*([A-Z0-9]{6,9})/i);
    if (passportMatch) { ocrData.document_number = passportMatch[1]; ocrData.confidence_scores!.document_number = 0.85; }

    const expMatch = text.match(/(?:Date of expiry|Expiry|Expires)\s*[:\-]?\s*(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/i);
    if (expMatch) { ocrData.expiration_date = this.standardizeDateFormat(expMatch[1]); ocrData.confidence_scores!.expiration_date = 0.9; }

    const nationalityMatch = text.match(/(?:Nationality|Country)\s*[:\-]?\s*([A-Z\s]+)/i);
    if (nationalityMatch) { ocrData.nationality = nationalityMatch[1].trim(); ocrData.confidence_scores!.nationality = 0.7; }
  }

  private extractDriversLicenseData(text: string, ocrData: OCRData): void {
    const namePatterns = [
      /(?:Name|Full Name|LN|FN)\s*[:\-]?\s*([A-Z][A-Z\s,]+)/i,
      /([A-Z]{2,}\s+[A-Z]{2,}(?:\s+[A-Z]{2,})?)/,
      /\b([A-Z][a-z]+\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/,
    ];
    for (const pattern of namePatterns) {
      const m = text.match(pattern);
      if (m && m[1].length > 3) { ocrData.name = m[1].trim().replace(/\s+/g, ' '); ocrData.confidence_scores!.name = 0.8; break; }
    }

    const dobPatterns = [
      /(?:DOB|Date of birth|Birth|Born)\s*[:\-]?\s*(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/i,
      /(\d{2}[\/\-\.]\d{2}[\/\-\.]\d{4})/g,
      /(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2})/g,
    ];
    for (const pattern of dobPatterns) {
      const matches = text.match(pattern);
      if (matches) {
        for (const match of matches) {
          const std = this.standardizeDateFormat(match);
          const date = new Date(std);
          if (date.getFullYear() > 1900 && date.getFullYear() < new Date().getFullYear() - 16) {
            ocrData.date_of_birth = std; ocrData.confidence_scores!.date_of_birth = 0.9; break;
          }
        }
        if (ocrData.date_of_birth) break;
      }
    }

    const licensePatterns = [
      /(?:License No|Driver License|DL|ID|Number)\s*[:\-]?\s*([A-Z0-9\-]{6,15})/i,
      /\b([A-Z]{1,3}\d{6,12})\b/,
      /\b(\d{8,12})\b/,
      /([A-Z0-9]{8,15})/,
    ];
    for (const pattern of licensePatterns) {
      const m = text.match(pattern);
      if (m && m[1] && !/\d{2}[\/\-\.]\d{2}/.test(m[1])) {
        ocrData.document_number = m[1].replace(/\s+/g, ''); ocrData.confidence_scores!.document_number = 0.85; break;
      }
    }

    const expPatterns = [
      /(?:Expires|Expiry|Exp|Valid Until)\s*[:\-]?\s*(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/i,
      /(\d{2}[\/\-\.]\d{2}[\/\-\.]\d{4})/g,
    ];
    for (const pattern of expPatterns) {
      const matches = text.match(pattern);
      if (matches) {
        for (const match of matches) {
          const std = this.standardizeDateFormat(match);
          if (new Date(std) > new Date()) { ocrData.expiration_date = std; ocrData.confidence_scores!.expiration_date = 0.9; break; }
        }
        if (ocrData.expiration_date) break;
      }
    }

    const addressPatterns = [
      /(?:Address|Addr|Add)\s*[:\-]?\s*([A-Z0-9\s,\.\-]+(?:St|Ave|Rd|Dr|Blvd|Lane|Way|Street|Avenue|Road|Drive|Boulevard)[A-Z0-9\s,\.\-]*)/i,
      /(\d+\s+[A-Z\s]+(?:ST|AVE|RD|DR|BLVD|LANE|WAY))/i,
      /([A-Z\s]+,\s*[A-Z]{2}\s+\d{5})/i,
    ];
    for (const pattern of addressPatterns) {
      const m = text.match(pattern);
      if (m && m[1] && m[1].length > 5) { ocrData.address = m[1].trim().replace(/\s+/g, ' '); ocrData.confidence_scores!.address = 0.6; break; }
    }

    const sexMatch = text.match(/(?:Sex|Gender|M\/F)\s*[:\-]?\s*([MF])/i);
    if (sexMatch) { ocrData.sex = sexMatch[1].toUpperCase(); ocrData.confidence_scores!.sex = 0.8; }

    const heightMatch = text.match(/(?:Height|Hgt|Ht)\s*[:\-]?\s*(\d+['\-]\d+["']?|\d+\s*ft\s*\d+\s*in)/i);
    if (heightMatch) { ocrData.height = heightMatch[1].trim(); ocrData.confidence_scores!.height = 0.7; }

    const eyesMatch = text.match(/(?:Eyes|Eye Color|EYE)\s*[:\-]?\s*([A-Z]{2,4})/i);
    if (eyesMatch) { ocrData.eye_color = eyesMatch[1].toUpperCase(); ocrData.confidence_scores!.eye_color = 0.7; }
  }

  private extractNationalIdData(text: string, ocrData: OCRData): void {
    const nameMatch = text.match(/(?:Name|Full Name)\s*[:\-]?\s*([A-Z][A-Z\s,]+)/i);
    if (nameMatch) { ocrData.name = nameMatch[1].trim(); ocrData.confidence_scores!.name = 0.8; }

    const dobMatch = text.match(/(?:DOB|Date of birth|Born)\s*[:\-]?\s*(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/i);
    if (dobMatch) { ocrData.date_of_birth = this.standardizeDateFormat(dobMatch[1]); ocrData.confidence_scores!.date_of_birth = 0.9; }

    const idMatch = text.match(/(?:ID No|National ID|Identity)\s*[:\-]?\s*([A-Z0-9\-]{6,20})/i);
    if (idMatch) { ocrData.document_number = idMatch[1]; ocrData.confidence_scores!.document_number = 0.85; }

    const authorityMatch = text.match(/(?:Issued by|Authority|Department)\s*[:\-]?\s*([A-Z\s]+)/i);
    if (authorityMatch) { ocrData.issuing_authority = authorityMatch[1].trim(); ocrData.confidence_scores!.issuing_authority = 0.7; }
  }

  private extractGenericData(text: string, ocrData: OCRData): void {
    const nameMatch = text.match(/\b([A-Z][a-z]+ [A-Z][a-z]+(?:\s[A-Z][a-z]+)*)\b/);
    if (nameMatch) { ocrData.name = nameMatch[1]; ocrData.confidence_scores!.name = 0.6; }

    const dateMatches = text.match(/\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}/g);
    if (dateMatches && dateMatches.length >= 1) {
      ocrData.date_of_birth = this.standardizeDateFormat(dateMatches[0]);
      ocrData.confidence_scores!.date_of_birth = 0.5;
      if (dateMatches.length >= 2) {
        ocrData.expiration_date = this.standardizeDateFormat(dateMatches[1]);
        ocrData.confidence_scores!.expiration_date = 0.5;
      }
    }

    const numberMatch = text.match(/\b([A-Z0-9]{6,15})\b/);
    if (numberMatch) { ocrData.document_number = numberMatch[1]; ocrData.confidence_scores!.document_number = 0.4; }
  }

  private standardizeDateFormat(dateStr: string): string {
    const cleaned = dateStr.replace(/[^\d\/\-\.]/g, '');
    const parts = cleaned.split(/[\/\-\.]/);
    if (parts.length !== 3) return dateStr;

    let [part1, part2, part3] = parts;
    if (part3.length === 2) {
      const year = parseInt(part3);
      part3 = year > 30 ? `19${part3}` : `20${part3}`;
    }
    if (parseInt(part1) > 12) {
      return `${part3}-${part2.padStart(2, '0')}-${part1.padStart(2, '0')}`;
    }
    return `${part3}-${part1.padStart(2, '0')}-${part2.padStart(2, '0')}`;
  }
}
