import type { OCRData } from '../../../types/index.js';
import { BaseExtractor } from './BaseExtractor.js';
import { flattenLines } from '../utils/flattenLines.js';
import { disambiguateExpiryDate } from '../utils/dateUtils.js';
import { isHeaderNoise } from '../utils/nameUtils.js';
import { SPECIMEN_LABELS } from '../constants/noise.js';

type RecognitionResult = any;

export class PassportExtractor extends BaseExtractor {

  extract(lines: RecognitionResult[][], ocrData: OCRData): void {
    const flatLines = flattenLines(lines);

    // Extract name: try separate surname + given name, then fall back
    {
      let surname = '';
      let givenName = '';
      let nameConf = 0;
      this.findField(flatLines, [/surname/i, /family\s*name/i, /last\s*name/i], (value, conf) => {
        if (!isHeaderNoise(value) && !SPECIMEN_LABELS.test(value) && !this.isLabelOrNoise(value)) {
          surname = value;
          nameConf = Math.max(nameConf, conf);
          return;
        }
        return false;
      });
      this.findField(flatLines, [/given\s*names?/i, /first\s*name/i, /forename/i], (value, conf) => {
        if (!isHeaderNoise(value) && !SPECIMEN_LABELS.test(value) && !this.isLabelOrNoise(value)) {
          givenName = value;
          nameConf = Math.max(nameConf, conf);
          return;
        }
        return false;
      });

      if (surname || givenName) {
        const cleanName = (s: string) =>
          s.replace(/^\d+\s+/, '')
           .split(/\s+/)
           .filter(w => w.length > 1 || /^[A-Z]$/i.test(w) && false)
           .join(' ');
        const cleanedGiven = cleanName(givenName);
        const cleanedSurname = cleanName(surname);
        ocrData.name = [cleanedGiven, cleanedSurname].filter(Boolean).join(' ');
        ocrData.confidence_scores!.name = nameConf;
      } else {
        this.findField(flatLines, [/name/i], (value, conf) => {
          if (!isHeaderNoise(value) && !SPECIMEN_LABELS.test(value) && !this.isLabelOrNoise(value)) {
            ocrData.name = value;
            ocrData.confidence_scores!.name = conf;
            return;
          }
          return false;
        });
      }
    }

    this.findDateField(flatLines, [/date\s*of\s*birth/i, /birth/i, /dob/i], (value, conf) => {
      ocrData.date_of_birth = value;
      ocrData.confidence_scores!.date_of_birth = conf;
    });

    this.findField(flatLines, [/passport\s*no/i, /card\s*no/i, /document\s*no/i, /number/i], (value, conf) => {
      const cleaned = value.replace(/\s+/g, '');
      if (/^[A-Z0-9]{6,9}$/i.test(cleaned) || /^[A-Z]\d{8}$/i.test(cleaned)) {
        ocrData.document_number = cleaned;
        ocrData.confidence_scores!.document_number = conf;
      }
    });

    // Fallback: scan for passport card number (letter + 8 digits)
    if (!ocrData.document_number) {
      for (const line of flatLines) {
        const m = line.text.match(/\b([A-Z]\d{8})\b/);
        if (m) {
          ocrData.document_number = m[1];
          ocrData.confidence_scores!.document_number = line.confidence;
          break;
        }
      }
    }

    this.findLastDateField(flatLines, [/date\s*of\s*expiry/i, /expiry/i, /expires/i, /exp/i], (value, conf) => {
      ocrData.expiration_date = disambiguateExpiryDate(value);
      ocrData.confidence_scores!.expiration_date = conf;
    });

    this.findField(flatLines, [/nationality/i], (value, conf) => {
      const cleaned = value.replace(/^\*+\s*/, '').trim();
      if (cleaned.length >= 2 && !this.isLabelOrNoise(cleaned) && !/\*/.test(cleaned)) {
        const alphaOnly = cleaned.match(/^([A-Z]{2,})\b/i);
        ocrData.nationality = alphaOnly ? alphaOnly[1] : cleaned;
        ocrData.confidence_scores!.nationality = conf;
        return;
      }
      return false;
    });

    // Extract sex
    if (!ocrData.sex) {
      for (const line of flatLines) {
        const sexM = line.text.match(/\b(?:SEX|GENDER)\s*[:\s\/]\s*([MF])\b/i)
          ?? line.text.match(/\bSEX\s+([MF])\b/i);
        if (sexM) {
          ocrData.sex = sexM[1].toUpperCase();
          ocrData.confidence_scores!.sex = line.confidence;
          break;
        }
      }
      if (!ocrData.sex) {
        for (let i = 0; i < flatLines.length; i++) {
          if (/\bSEX\b/i.test(flatLines[i].text) && i + 1 < flatLines.length) {
            const nextM = flatLines[i + 1].text.match(/^([MF])\b/);
            if (nextM) {
              ocrData.sex = nextM[1].toUpperCase();
              ocrData.confidence_scores!.sex = flatLines[i + 1].confidence;
              break;
            }
          }
        }
      }
    }
  }
}
