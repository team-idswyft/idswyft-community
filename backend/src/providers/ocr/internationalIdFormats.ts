/**
 * International ID Format Registry
 *
 * Country-specific document number patterns, localized field labels,
 * and date format hints for OCR extraction.
 */

export interface CountryDocFormat {
  type: 'drivers_license' | 'national_id' | 'passport';
  id_number_regex: RegExp;
  field_labels: {
    name: RegExp[];
    date_of_birth: RegExp[];
    expiry_date: RegExp[];
    id_number: RegExp[];
    nationality: RegExp[];
    address: RegExp[];
    issuing_authority: RegExp[];
  };
  date_format: 'DMY' | 'MDY' | 'YMD';
  has_mrz: boolean;
}

export interface CountryIdFormat {
  country: string; // ISO alpha-2
  document_types: CountryDocFormat[];
}

// ─── Shared label patterns ────────────────────────────────────

const ENGLISH_LABELS = {
  name: [/full\s*name/i, /\bname\b/i, /surname/i, /given\s*name/i],
  date_of_birth: [/date\s*of\s*birth/i, /dob/i, /born/i, /birth\s*date/i],
  expiry_date: [/expiry/i, /expires/i, /valid\s*until/i, /\bexp\b/i, /expiration/i],
  id_number: [/id\s*no/i, /licence\s*no/i, /license\s*no/i, /\bdln?\b/i, /number/i],
  nationality: [/nationality/i, /citizenship/i],
  address: [/address/i],
  issuing_authority: [/issued\s*by/i, /issuing\s*authority/i, /authority/i],
};

// ─── Registry ─────────────────────────────────────────────────

export const INTERNATIONAL_ID_FORMATS: Record<string, CountryIdFormat> = {
  // ── English-speaking ──────────────────────────────────

  GB: {
    country: 'GB',
    document_types: [
      {
        type: 'drivers_license',
        id_number_regex: /^[A-Z]{5}\d{6}[A-Z0-9]{2}\d[A-Z]{2}$/,
        field_labels: {
          ...ENGLISH_LABELS,
          id_number: [/licence\s*no/i, /driving\s*licence/i, /\bdln?\b/i, ...ENGLISH_LABELS.id_number],
        },
        date_format: 'DMY',
        has_mrz: false,
      },
      {
        type: 'national_id',
        id_number_regex: /^\d{9}$/,
        field_labels: ENGLISH_LABELS,
        date_format: 'DMY',
        has_mrz: true,
      },
      {
        type: 'passport',
        id_number_regex: /^\d{9}$/,
        field_labels: ENGLISH_LABELS,
        date_format: 'DMY',
        has_mrz: true,
      },
    ],
  },

  CA: {
    country: 'CA',
    document_types: [
      {
        type: 'drivers_license',
        // Province-specific: ON=A1234-12345-12345, BC=1234567, AB=12-1234-1234
        id_number_regex: /^[A-Z0-9\-]{6,20}$/,
        field_labels: {
          ...ENGLISH_LABELS,
          id_number: [/licence\s*no/i, /permis\s*no/i, /driver'?s?\s*licen[cs]e/i, ...ENGLISH_LABELS.id_number],
          name: [...ENGLISH_LABELS.name, /nom/i, /prénom/i],
          date_of_birth: [...ENGLISH_LABELS.date_of_birth, /date\s*de\s*naissance/i],
        },
        date_format: 'DMY',
        has_mrz: false,
      },
    ],
  },

  AU: {
    country: 'AU',
    document_types: [
      {
        type: 'drivers_license',
        // State-specific: NSW=12345678, VIC=123456789, QLD=12345678
        id_number_regex: /^[A-Z0-9]{6,12}$/,
        field_labels: {
          ...ENGLISH_LABELS,
          id_number: [/licence\s*no/i, /card\s*no/i, ...ENGLISH_LABELS.id_number],
        },
        date_format: 'DMY',
        has_mrz: false,
      },
    ],
  },

  NZ: {
    country: 'NZ',
    document_types: [
      {
        type: 'drivers_license',
        id_number_regex: /^[A-Z]{2}\d{6}$/,
        field_labels: ENGLISH_LABELS,
        date_format: 'DMY',
        has_mrz: false,
      },
    ],
  },

  // ── EU ────────────────────────────────────────────────

  DE: {
    country: 'DE',
    document_types: [
      {
        type: 'national_id', // Personalausweis
        id_number_regex: /^[CLMTXY][A-Z0-9]{8}$/,
        field_labels: {
          name: [/name/i, /familienname/i, /vorname/i, /\bnom\b/i],
          date_of_birth: [/geburtsdatum/i, /date\s*of\s*birth/i, /geb\.?/i],
          expiry_date: [/gültig\s*bis/i, /ablaufdatum/i, /expiry/i],
          id_number: [/ausweis\s*nr/i, /personalausweis/i, /karten\s*nr/i, /id\s*no/i],
          nationality: [/staatsangehörigkeit/i, /nationality/i],
          address: [/anschrift/i, /wohnort/i, /address/i],
          issuing_authority: [/ausstellende\s*behörde/i, /authority/i],
        },
        date_format: 'DMY',
        has_mrz: true,
      },
      {
        type: 'drivers_license', // Führerschein
        id_number_regex: /^[A-Z0-9]{11}$/,
        field_labels: {
          name: [/name/i, /familienname/i, /vorname/i, /\bnom\b/i],
          date_of_birth: [/geburtsdatum/i, /geb\.?/i, /date\s*of\s*birth/i],
          expiry_date: [/gültig\s*bis/i, /ablaufdatum/i, /expiry/i],
          id_number: [/führerschein\s*nr/i, /karten\s*nr/i, /licence\s*no/i, /id\s*no/i],
          nationality: [/staatsangehörigkeit/i, /nationality/i],
          address: [/anschrift/i, /wohnort/i, /address/i],
          issuing_authority: [/ausstellende\s*behörde/i, /authority/i],
        },
        date_format: 'DMY',
        has_mrz: false,
      },
    ],
  },

  FR: {
    country: 'FR',
    document_types: [
      {
        type: 'national_id', // Carte nationale d'identité (CNI)
        id_number_regex: /^\d{12}$/,
        field_labels: {
          name: [/nom/i, /prénom/i, /name/i, /prénoms/i],
          date_of_birth: [/date\s*de\s*naissance/i, /né\s*le/i, /date\s*of\s*birth/i],
          expiry_date: [/date\s*d'expiration/i, /valable\s*jusqu/i, /expiry/i],
          id_number: [/n°\s*carte/i, /numéro/i, /carte\s*nationale/i, /id\s*no/i],
          nationality: [/nationalité/i, /nationality/i],
          address: [/adresse/i, /domicile/i, /address/i],
          issuing_authority: [/délivré\s*par/i, /autorité/i, /authority/i],
        },
        date_format: 'DMY',
        has_mrz: true,
      },
      {
        type: 'drivers_license', // Permis de conduire
        id_number_regex: /^\d{12}$/,
        field_labels: {
          name: [/nom/i, /prénom/i, /name/i],
          date_of_birth: [/date\s*de\s*naissance/i, /né\s*le/i, /date\s*of\s*birth/i],
          expiry_date: [/date\s*d'expiration/i, /valable\s*jusqu/i, /expiry/i],
          id_number: [/permis\s*no/i, /numéro/i, /licence\s*no/i],
          nationality: [/nationalité/i, /nationality/i],
          address: [/adresse/i, /domicile/i, /address/i],
          issuing_authority: [/délivré\s*par/i, /préfecture/i, /authority/i],
        },
        date_format: 'DMY',
        has_mrz: false,
      },
    ],
  },

  IT: {
    country: 'IT',
    document_types: [
      {
        type: 'national_id', // Carta d'identità
        id_number_regex: /^[A-Z]{2}\d{5}[A-Z]{2}$/,
        field_labels: {
          name: [/cognome/i, /nome/i, /name/i],
          date_of_birth: [/data\s*di\s*nascita/i, /nato\s*il/i, /date\s*of\s*birth/i],
          expiry_date: [/scadenza/i, /valido\s*fino/i, /expiry/i],
          id_number: [/carta\s*d/i, /numero/i, /id\s*no/i],
          nationality: [/cittadinanza/i, /nazionalità/i, /nationality/i],
          address: [/residenza/i, /indirizzo/i, /address/i],
          issuing_authority: [/rilasciato\s*da/i, /comune/i, /authority/i],
        },
        date_format: 'DMY',
        has_mrz: true,
      },
    ],
  },

  ES: {
    country: 'ES',
    document_types: [
      {
        type: 'national_id', // DNI
        id_number_regex: /^\d{8}[A-Z]$/,
        field_labels: {
          name: [/apellidos/i, /nombre/i, /name/i],
          date_of_birth: [/fecha\s*de\s*nacimiento/i, /nacimiento/i, /date\s*of\s*birth/i],
          expiry_date: [/validez/i, /fecha\s*de\s*caducidad/i, /expiry/i],
          id_number: [/d\.?n\.?i\.?\s*no/i, /número/i, /id\s*no/i],
          nationality: [/nacionalidad/i, /nationality/i],
          address: [/domicilio/i, /dirección/i, /address/i],
          issuing_authority: [/expedido\s*por/i, /authority/i],
        },
        date_format: 'DMY',
        has_mrz: true,
      },
    ],
  },

  NL: {
    country: 'NL',
    document_types: [
      {
        type: 'national_id',
        id_number_regex: /^[A-Z]{2}[A-Z0-9]{6}\d$/,
        field_labels: {
          name: [/achternaam/i, /voornamen/i, /naam/i, /name/i],
          date_of_birth: [/geboortedatum/i, /date\s*of\s*birth/i],
          expiry_date: [/geldig\s*tot/i, /vervaldatum/i, /expiry/i],
          id_number: [/documentnummer/i, /id\s*no/i],
          nationality: [/nationaliteit/i, /nationality/i],
          address: [/adres/i, /address/i],
          issuing_authority: [/afgegeven\s*door/i, /authority/i],
        },
        date_format: 'DMY',
        has_mrz: true,
      },
    ],
  },

  // ── Latin America ──────────────────────────────────────

  BR: {
    country: 'BR',
    document_types: [
      {
        type: 'drivers_license', // CNH
        id_number_regex: /^\d{11}$/,
        field_labels: {
          name: [/nome/i, /name/i],
          date_of_birth: [/data\s*de?\s*nascimento/i, /nascimento/i, /date\s*of\s*birth/i],
          expiry_date: [/validade/i, /vencimento/i, /expiry/i],
          id_number: [/registro/i, /n°\s*registro/i, /cnh/i, /id\s*no/i],
          nationality: [/nacionalidade/i, /nationality/i],
          address: [/endereço/i, /address/i],
          issuing_authority: [/detran/i, /authority/i],
        },
        date_format: 'DMY',
        has_mrz: false,
      },
    ],
  },

  MX: {
    country: 'MX',
    document_types: [
      {
        type: 'national_id', // INE / IFE
        id_number_regex: /^[A-Z]{6}\d{8}[A-Z0-9]{3}$/,
        field_labels: {
          name: [/nombre/i, /apellido/i, /name/i],
          date_of_birth: [/fecha\s*de\s*nacimiento/i, /nacimiento/i, /date\s*of\s*birth/i],
          expiry_date: [/vigencia/i, /vence/i, /expiry/i],
          id_number: [/clave\s*de\s*elector/i, /credencial/i, /ine/i, /id\s*no/i],
          nationality: [/nacionalidad/i, /nationality/i],
          address: [/domicilio/i, /dirección/i, /address/i],
          issuing_authority: [/ine/i, /authority/i],
        },
        date_format: 'DMY',
        has_mrz: false,
      },
    ],
  },

  AR: {
    country: 'AR',
    document_types: [
      {
        type: 'national_id', // DNI
        id_number_regex: /^\d{7,8}$/,
        field_labels: {
          name: [/apellido/i, /nombre/i, /name/i],
          date_of_birth: [/fecha\s*de\s*nacimiento/i, /nacimiento/i, /date\s*of\s*birth/i],
          expiry_date: [/vencimiento/i, /fecha\s*de\s*vencimiento/i, /expiry/i],
          id_number: [/d\.?n\.?i\.?\s*no?/i, /número/i, /id\s*no/i],
          nationality: [/nacionalidad/i, /nationality/i],
          address: [/domicilio/i, /address/i],
          issuing_authority: [/renaper/i, /authority/i],
        },
        date_format: 'DMY',
        has_mrz: true,
      },
    ],
  },

  // ── Asia-Pacific ───────────────────────────────────────

  JP: {
    country: 'JP',
    document_types: [
      {
        type: 'drivers_license',
        id_number_regex: /^\d{12}$/,
        field_labels: {
          name: [/氏名/i, /name/i],
          date_of_birth: [/生年月日/i, /date\s*of\s*birth/i],
          expiry_date: [/有効期限/i, /expiry/i],
          id_number: [/免許証番号/i, /番号/i, /id\s*no/i],
          nationality: [/国籍/i, /nationality/i],
          address: [/住所/i, /address/i],
          issuing_authority: [/公安委員会/i, /authority/i],
        },
        date_format: 'YMD',
        has_mrz: false,
      },
    ],
  },

  KR: {
    country: 'KR',
    document_types: [
      {
        type: 'drivers_license',
        id_number_regex: /^\d{2}-\d{2}-\d{6}-\d{2}$/,
        field_labels: {
          name: [/성명/i, /이름/i, /name/i],
          date_of_birth: [/생년월일/i, /date\s*of\s*birth/i],
          expiry_date: [/유효기간/i, /expiry/i],
          id_number: [/면허번호/i, /번호/i, /id\s*no/i],
          nationality: [/국적/i, /nationality/i],
          address: [/주소/i, /address/i],
          issuing_authority: [/경찰청/i, /authority/i],
        },
        date_format: 'YMD',
        has_mrz: false,
      },
    ],
  },

  IN: {
    country: 'IN',
    document_types: [
      {
        type: 'national_id', // Aadhaar
        id_number_regex: /^\d{12}$/,
        field_labels: {
          name: [...ENGLISH_LABELS.name, /नाम/i],
          date_of_birth: [...ENGLISH_LABELS.date_of_birth, /जन्म\s*तिथि/i],
          expiry_date: ENGLISH_LABELS.expiry_date,
          id_number: [/aadhaar/i, /आधार/i, ...ENGLISH_LABELS.id_number],
          nationality: ENGLISH_LABELS.nationality,
          address: [...ENGLISH_LABELS.address, /पता/i],
          issuing_authority: ENGLISH_LABELS.issuing_authority,
        },
        date_format: 'DMY',
        has_mrz: false,
      },
      {
        type: 'drivers_license',
        // State prefix + digits, e.g., DL-1420110012345
        id_number_regex: /^[A-Z]{2}-?\d{13,}$/,
        field_labels: ENGLISH_LABELS,
        date_format: 'DMY',
        has_mrz: false,
      },
    ],
  },

  SG: {
    country: 'SG',
    document_types: [
      {
        type: 'national_id', // NRIC
        id_number_regex: /^[STFGM]\d{7}[A-Z]$/,
        field_labels: ENGLISH_LABELS,
        date_format: 'DMY',
        has_mrz: false,
      },
    ],
  },

  PH: {
    country: 'PH',
    document_types: [
      {
        type: 'national_id', // PhilSys ID
        id_number_regex: /^\d{4}-\d{4}-\d{4}-\d{4}$/,
        field_labels: ENGLISH_LABELS,
        date_format: 'DMY',
        has_mrz: false,
      },
      {
        type: 'drivers_license',
        id_number_regex: /^[A-Z]\d{2}-\d{2}-\d{6}$/,
        field_labels: ENGLISH_LABELS,
        date_format: 'DMY',
        has_mrz: false,
      },
    ],
  },

  TH: {
    country: 'TH',
    document_types: [
      {
        type: 'national_id',
        id_number_regex: /^\d{1}-\d{4}-\d{5}-\d{2}-\d{1}$/,
        field_labels: {
          name: [/ชื่อ/i, ...ENGLISH_LABELS.name],
          date_of_birth: [/เกิดวันที่/i, ...ENGLISH_LABELS.date_of_birth],
          expiry_date: [/หมดอายุ/i, ...ENGLISH_LABELS.expiry_date],
          id_number: [/เลขประจำตัว/i, ...ENGLISH_LABELS.id_number],
          nationality: [/สัญชาติ/i, ...ENGLISH_LABELS.nationality],
          address: [/ที่อยู่/i, ...ENGLISH_LABELS.address],
          issuing_authority: ENGLISH_LABELS.issuing_authority,
        },
        date_format: 'DMY',
        has_mrz: false,
      },
    ],
  },

  VN: {
    country: 'VN',
    document_types: [
      {
        type: 'national_id', // CCCD
        id_number_regex: /^\d{12}$/,
        field_labels: {
          name: [/họ\s*và\s*tên/i, /họ\s*tên/i, ...ENGLISH_LABELS.name],
          date_of_birth: [/ngày\s*sinh/i, ...ENGLISH_LABELS.date_of_birth],
          expiry_date: [/có\s*giá\s*trị\s*đến/i, ...ENGLISH_LABELS.expiry_date],
          id_number: [/số/i, /cccd/i, ...ENGLISH_LABELS.id_number],
          nationality: [/quốc\s*tịch/i, ...ENGLISH_LABELS.nationality],
          address: [/nơi\s*thường\s*trú/i, ...ENGLISH_LABELS.address],
          issuing_authority: ENGLISH_LABELS.issuing_authority,
        },
        date_format: 'DMY',
        has_mrz: true,
      },
    ],
  },
};

/**
 * Get the format definition for a country + document type.
 * Returns null if the country or document type is not in the registry.
 */
export function getCountryFormat(
  country: string,
  documentType: string,
): CountryDocFormat | null {
  const countryDef = INTERNATIONAL_ID_FORMATS[country.toUpperCase()];
  if (!countryDef) return null;

  return countryDef.document_types.find(d => d.type === documentType) || null;
}

/**
 * Validate a document number against the country-specific format.
 */
export function validateIdNumber(country: string, documentType: string, idNumber: string): boolean {
  const format = getCountryFormat(country, documentType);
  if (!format) return true; // No format = no validation constraint
  return format.id_number_regex.test(idNumber);
}

/**
 * International document header noise phrases to filter out during OCR.
 */
export const INTERNATIONAL_HEADER_NOISE = new Set([
  // English
  'driver license', 'drivers license', "driver's license",
  'driver licence', 'drivers licence', 'driving licence',
  'identification card', 'id card', 'identity card',
  'passport', 'national id', 'real id',
  // German
  'personalausweis', 'führerschein', 'bundesrepublik deutschland',
  // French
  'carte nationale d\'identité', 'permis de conduire', 'république française',
  // Italian
  'carta d\'identità', 'patente di guida', 'repubblica italiana',
  // Spanish
  'documento nacional de identidad', 'permiso de conducir',
  'instituto nacional electoral',
  // Portuguese
  'carteira nacional de habilitação', 'carta de condução',
  // Dutch
  'identiteitskaart', 'rijbewijs',
  // Japanese
  '運転免許証', 'マイナンバーカード',
  // Korean
  '운전면허증', '주민등록증',
]);
