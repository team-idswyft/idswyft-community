import type { OCRData, CountryDocFormat } from '@idswyft/shared';
import type { FlatLine } from '../types.js';
import { logger } from '@/utils/logger.js';
import { BaseExtractor } from './BaseExtractor.js';
import { flattenLines } from '../utils/flattenLines.js';
import { parseMonthNameDate, standardizeDateFormat } from '../utils/dateUtils.js';
import { isHeaderNoise } from '../utils/nameUtils.js';
import { SPECIMEN_LABELS } from '../constants/noise.js';

type RecognitionResult = any;

export class InternationalExtractor extends BaseExtractor {

  extract(
    lines: RecognitionResult[][],
    ocrData: OCRData,
    format: CountryDocFormat,
    country: string,
  ): void {
    const flatLines = flattenLines(lines);
    const labels = format.field_labels;

    logger.info('PaddleOCR international extraction', {
      country,
      documentType: format.type,
      dateFormat: format.date_format,
      lineCount: flatLines.length,
    });

    // EU DL numbered-field format: use specialized parser
    if (this.isEUDriversLicense(flatLines, format)) {
      this.extractEUDriversLicenseData(flatLines, ocrData, format);
      ocrData.issuing_country = country;
      return;
    }

    // Extract name: try separate surname + given name, then fall back to combined label
    {
      let surname = '';
      let givenName = '';
      let nameConf = 0;
      const surnamePatterns = labels.name.filter(p => /surname|family|last|appell|cognom|nachnam|achternaam|^mbiemri/i.test(p.source));
      const givenPatterns = labels.name.filter(p => /given|first|prénom|vornam|voornaam|^emri$/i.test(p.source));

      if (surnamePatterns.length > 0) {
        this.findField(flatLines, surnamePatterns, (value, conf) => {
          if (!isHeaderNoise(value) && !SPECIMEN_LABELS.test(value) && !this.isLabelOrNoise(value)) {
            surname = value;
            nameConf = Math.max(nameConf, conf);
            return;
          }
          return false;
        });
      }
      if (givenPatterns.length > 0) {
        this.findField(flatLines, givenPatterns, (value, conf) => {
          if (!isHeaderNoise(value) && !SPECIMEN_LABELS.test(value) && !this.isLabelOrNoise(value)) {
            givenName = value;
            nameConf = Math.max(nameConf, conf);
            return;
          }
          return false;
        });
      }

      if (surname || givenName) {
        ocrData.name = [givenName, surname].filter(Boolean).join(' ');
        ocrData.confidence_scores!.name = nameConf;
      } else {
        this.findField(flatLines, labels.name, (value, conf) => {
          if (!isHeaderNoise(value) && !SPECIMEN_LABELS.test(value) && !this.isLabelOrNoise(value)) {
            ocrData.name = value;
            ocrData.confidence_scores!.name = conf;
            return;
          }
          return false;
        });
      }
    }

    // Extract date of birth with country date format hint
    this.findDateField(flatLines, labels.date_of_birth, (value, conf) => {
      ocrData.date_of_birth = this.normalizeDateWithHint(value, format.date_format);
      ocrData.confidence_scores!.date_of_birth = conf;
    });

    // Extract ID number
    this.findField(flatLines, labels.id_number, (value, conf) => {
      const cleaned = value.replace(/\s+/g, '');
      if (/^[A-Z0-9\-]{4,15}$/i.test(cleaned) && !this.isLabelOrNoise(cleaned) && /\d/.test(cleaned)) {
        ocrData.document_number = cleaned;
        ocrData.confidence_scores!.document_number = conf;
        return;
      }
      const idM = value.match(/\b([A-Z]\d{7,12}[A-Z0-9]?)\b/i) ?? value.match(/\b(\d{6,12})\b/);
      if (idM) {
        ocrData.document_number = idM[1];
        ocrData.confidence_scores!.document_number = conf * 0.9;
        return;
      }
      return false;
    });

    // Extract expiry date
    this.findLastDateField(flatLines, labels.expiry_date, (value, conf) => {
      ocrData.expiration_date = this.normalizeDateWithHint(value, format.date_format);
      ocrData.confidence_scores!.expiration_date = conf;
    });

    // Extract nationality
    this.findField(flatLines, labels.nationality, (value, conf) => {
      let cleaned = value.replace(/^\*+\s*/, '').replace(/\s*\*+$/, '').trim();
      cleaned = cleaned.replace(/\s+\d{5,}$/, '').trim();
      const slashParts = cleaned.split('/');
      if (slashParts.length === 2 && slashParts[1].trim().length >= 2) {
        cleaned = slashParts[1].trim();
      }
      if (cleaned.length >= 2 && cleaned.length <= 30 && !this.isLabelOrNoise(cleaned)) {
        ocrData.nationality = cleaned;
        ocrData.confidence_scores!.nationality = conf;
        return;
      }
      return false;
    });

    // Extract address
    this.findField(flatLines, labels.address, (value, conf) => {
      ocrData.address = value;
      ocrData.confidence_scores!.address = conf;
    });

    // Extract issuing authority
    this.findField(flatLines, labels.issuing_authority, (value, conf) => {
      ocrData.issuing_authority = value;
      ocrData.confidence_scores!.issuing_authority = conf;
    });

    // Extract sex
    if (!ocrData.sex) {
      for (const line of flatLines) {
        const sexM = line.text.match(/\b(?:SEX|GENDER|GJINIA|SEXE|GESCHLECHT|SESSO)\s*[:\s\/]\s*([MFmf])\b/i)
          ?? line.text.match(/\b(?:SEX|GJINIA)\s+([MF])\b/i);
        if (sexM) {
          ocrData.sex = sexM[1].toUpperCase();
          ocrData.confidence_scores!.sex = line.confidence;
          break;
        }
      }
    }

    ocrData.issuing_country = country;
  }

  // ── Date normalization with country hint ─────────────────

  private normalizeDateWithHint(dateStr: string, hint: 'DMY' | 'MDY' | 'YMD'): string {
    const monthNameResult = parseMonthNameDate(dateStr);
    if (monthNameResult) return monthNameResult;

    const m = dateStr.match(/(\d{1,4})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})/);
    if (!m) return dateStr;

    let [, p1, p2, p3] = m;

    if (p1.length === 4) return `${p1}-${p2.padStart(2, '0')}-${p3.padStart(2, '0')}`;

    if (hint === 'YMD' && p1.length === 2) {
      const yy = parseInt(p1);
      p1 = String(yy > 30 ? 1900 + yy : 2000 + yy);
    } else if (p3.length === 2) {
      const yy = parseInt(p3);
      p3 = String(yy > 30 ? 1900 + yy : 2000 + yy);
    }

    switch (hint) {
      case 'DMY': return `${p3}-${p2.padStart(2, '0')}-${p1.padStart(2, '0')}`;
      case 'MDY': return `${p3}-${p1.padStart(2, '0')}-${p2.padStart(2, '0')}`;
      case 'YMD': return `${p1}-${p2.padStart(2, '0')}-${p3.padStart(2, '0')}`;
    }
  }

  // ── EU Driving License ──────────────────────────────────────

  private static EU_DL_HEADER = /FÜHRERSCHEIN|F(?:Ü|U)HRERSCHEIN|PERMIS\s*DE\s*CONDUIRE|DRIVING\s*LICEN[CS]E|PATENTE|RIJBEWIJS|CARTA\s*DE\s*CONDU[CÇ][AÃ]O|PERMISO\s*DE\s*CONDUCIR|KÖRKORT|AJOKORTTI|PRAWO\s*JAZDY|ŘIDIČSKÝ\s*PRŮKAZ|VODIČSKÝ\s*PREUKAZ/i;

  private isEUDriversLicense(flatLines: FlatLine[], format: CountryDocFormat): boolean {
    if (format.type !== 'drivers_license') return false;
    const fullText = flatLines.map(l => l.text).join(' ');
    if (InternationalExtractor.EU_DL_HEADER.test(fullText)) return true;
    let numberedCount = 0;
    for (const line of flatLines) {
      if (/^\s*(\d[abc]?)[\.\s]\s*.+/.test(line.text)) numberedCount++;
    }
    return numberedCount >= 3;
  }

  private extractEUDriversLicenseData(
    flatLines: FlatLine[],
    ocrData: OCRData,
    format: CountryDocFormat,
  ): void {
    const fields = new Map<string, string>();

    for (const line of flatLines) {
      const m = line.text.match(/^\s*(\d[abc]?)[\.\s]\s*(.+)/);
      if (m) {
        const fieldNum = m[1].toLowerCase();
        const value = m[2].trim();
        if (!fields.has(fieldNum) && value.length > 0) {
          fields.set(fieldNum, value);
        }
      }
      if (!fields.has('1')) {
        const m1 = line.text.match(/\b1[\.\s]\s*([A-Z][A-Za-zÀ-ÖØ-öø-ÿ\-'\s]+)/);
        if (m1) {
          const val = m1[1].trim();
          if (val.length >= 2 && !SPECIMEN_LABELS.test(val)) {
            fields.set('1', val);
          }
        }
      }
    }

    logger.info('EU DL numbered fields extracted', { fields: Object.fromEntries(fields) });

    const stripTrailingNoise = (s: string) =>
      s.replace(/\s+\d{1,2}[\.\-\/]\d{1,2}[\.\-\/]\d{2,4}.*$/, '')
       .replace(/\s+\d{2,}$/, '')
       .trim();

    // 1. Surname + 2. Given name → combined name
    const surname = stripTrailingNoise(fields.get('1') ?? '');
    const givenName = stripTrailingNoise(fields.get('2') ?? '');
    if (surname || givenName) {
      const name = [givenName, surname].filter(Boolean).join(' ');
      if (!SPECIMEN_LABELS.test(name)) {
        ocrData.name = name;
        ocrData.confidence_scores!.name = 0.9;
      }
    }

    // 3. Date of birth
    const dobRaw = fields.get('3');
    if (dobRaw) {
      const dob = this.normalizeDateWithHint(dobRaw, format.date_format)
        ?? this.extractDate(dobRaw);
      if (dob) {
        ocrData.date_of_birth = dob;
        ocrData.confidence_scores!.date_of_birth = 0.9;
      }
    }

    // 4b. Expiry date
    const expiryRaw = fields.get('4b');
    if (expiryRaw) {
      const expiry = this.normalizeDateWithHint(expiryRaw, format.date_format)
        ?? this.extractDate(expiryRaw);
      if (expiry) {
        ocrData.expiration_date = expiry;
        ocrData.confidence_scores!.expiration_date = 0.9;
      }
    }

    // 4c. Issuing authority
    const authority = fields.get('4c');
    if (authority) {
      ocrData.issuing_authority = authority;
      ocrData.confidence_scores!.issuing_authority = 0.9;
    }

    // 5. License number
    const licNum = fields.get('5');
    if (licNum) {
      const cleaned = licNum.replace(/\s+/g, '');
      if (/^[A-Z0-9]{4,20}$/i.test(cleaned)) {
        ocrData.document_number = cleaned;
        ocrData.confidence_scores!.document_number = 0.9;
      }
    }

    // Fallback: extract license number from 4b line
    if (!ocrData.document_number && expiryRaw) {
      const afterDate = expiryRaw.replace(/^\d{1,2}[\.\-\/]\d{1,2}[\.\-\/]\d{2,4}\s*/, '');
      const docM = afterDate.match(/\b([A-Z0-9]{6,15})\b/i);
      if (docM && /[A-Z]/i.test(docM[1]) && /\d/.test(docM[1])) {
        ocrData.document_number = docM[1];
        ocrData.confidence_scores!.document_number = 0.85;
      }
    }

    // Sex
    for (const line of flatLines) {
      if (!ocrData.sex) {
        const sexM = line.text.match(/\b(?:SEX|GESCHLECHT|SEXE)\s*[:\s]\s*([MFmf])\b/i)
          ?? line.text.match(/\b([MF])\s*$/);
        if (sexM) {
          ocrData.sex = sexM[1].toUpperCase();
          ocrData.confidence_scores!.sex = 0.85;
        }
      }
    }
  }
}
