import type { OCRData } from '../../../types/index.js';
import { BaseExtractor } from './BaseExtractor.js';
import { DriversLicenseExtractor } from './DriversLicenseExtractor.js';
import { flattenLines } from '../utils/flattenLines.js';
import { disambiguateExpiryDate } from '../utils/dateUtils.js';
import { isHeaderNoise } from '../utils/nameUtils.js';

type RecognitionResult = any;

export class NationalIdExtractor extends BaseExtractor {

  extract(lines: RecognitionResult[][], ocrData: OCRData): void {
    const flatLines = flattenLines(lines);
    const fullText  = flatLines.map(l => l.text).join(' ');

    // Auto-detect: if it looks like a DL, delegate to DL extractor
    if (/driver\s*license|driver'?s?\s*lic/i.test(fullText) || /\bDLn?\b/i.test(fullText)) {
      return new DriversLicenseExtractor().extract(lines, ocrData);
    }

    this.findField(flatLines, [/full\s*name/i, /\bname\b/i], (value, conf) => {
      if (!isHeaderNoise(value)) {
        ocrData.name = value;
        ocrData.confidence_scores!.name = conf;
      }
    });
    this.findDateField(flatLines, [/dob/i, /date\s*of\s*birth/i, /born/i], (value, conf) => {
      ocrData.date_of_birth = value;
      ocrData.confidence_scores!.date_of_birth = conf;
    });
    this.findField(flatLines, [/id\s*no/i, /national\s*id/i, /identity/i, /\bdln?\b/i], (value, conf) => {
      const cleaned = value.replace(/\s+/g, '');
      if (/^[A-Z0-9\-]{6,20}$/i.test(cleaned)) {
        ocrData.document_number = cleaned;
        ocrData.confidence_scores!.document_number = conf;
      }
    });
    this.findDateField(flatLines, [/expiry/i, /expires/i, /valid\s*until/i, /\bexp\b/i], (value, conf) => {
      ocrData.expiration_date = disambiguateExpiryDate(value);
      ocrData.confidence_scores!.expiration_date = conf;
    });

    this.findField(flatLines, [/issued\s*by/i, /issuing\s*authority/i, /authority/i], (value, conf) => {
      ocrData.issuing_authority = value;
      ocrData.confidence_scores!.issuing_authority = conf;
    });
  }
}
