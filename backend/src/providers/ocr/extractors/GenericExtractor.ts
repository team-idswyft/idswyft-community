import type { OCRData } from '../../../types/index.js';
import { BaseExtractor } from './BaseExtractor.js';
import { flattenLines } from '../utils/flattenLines.js';
import { disambiguateExpiryDate } from '../utils/dateUtils.js';

type RecognitionResult = any;

export class GenericExtractor extends BaseExtractor {

  extract(lines: RecognitionResult[][], ocrData: OCRData): void {
    const flatLines = flattenLines(lines);

    this.findField(flatLines, [/\bname\b/i], (value, conf) => {
      ocrData.name = value;
      ocrData.confidence_scores!.name = conf;
    });
    this.findDateField(flatLines, [/dob/i, /date\s*of\s*birth/i, /birth/i], (value, conf) => {
      ocrData.date_of_birth = value;
      ocrData.confidence_scores!.date_of_birth = conf;
    });
    this.findField(flatLines, [/\bnumber\b/i, /\bno\b/i, /\bid\b/i], (value, conf) => {
      const cleaned = value.replace(/\s+/g, '');
      if (/^[A-Z0-9\-]{4,20}$/i.test(cleaned)) {
        ocrData.document_number = cleaned;
        ocrData.confidence_scores!.document_number = conf;
      }
    });
    this.findDateField(flatLines, [/expiry/i, /expires/i, /exp/i], (value, conf) => {
      ocrData.expiration_date = disambiguateExpiryDate(value);
      ocrData.confidence_scores!.expiration_date = conf;
    });
  }
}
