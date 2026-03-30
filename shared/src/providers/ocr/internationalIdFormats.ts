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

// --- Shared label patterns ----------------------------------------

const ENGLISH_LABELS = {
  name: [/full\s*name/i, /\bname\b/i, /surname/i, /given\s*name/i],
  date_of_birth: [/date\s*of\s*birth/i, /dob/i, /born/i, /birth\s*date/i],
  expiry_date: [/expiry/i, /expires/i, /valid\s*until/i, /\bexp\b/i, /expiration/i],
  id_number: [/id\s*no/i, /licence\s*no/i, /license\s*no/i, /\bdln?\b/i, /number/i],
  nationality: [/nationality/i, /citizenship/i],
  address: [/address/i],
  issuing_authority: [/issued\s*by/i, /issuing\s*authority/i, /authority/i],
};

// --- Registry -----------------------------------------------------

export const INTERNATIONAL_ID_FORMATS: Record<string, CountryIdFormat> = {
  // -- English-speaking ------------------------------------------

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
          name: [...ENGLISH_LABELS.name, /nom/i, /pr\u00e9nom/i],
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

  // -- EU --------------------------------------------------------

  DE: {
    country: 'DE',
    document_types: [
      {
        type: 'national_id', // Personalausweis
        id_number_regex: /^[CLMTXY][A-Z0-9]{8}$/,
        field_labels: {
          name: [/name/i, /familienname/i, /vorname/i, /\bnom\b/i],
          date_of_birth: [/geburtsdatum/i, /date\s*of\s*birth/i, /geb\.?/i],
          expiry_date: [/g\u00fcltig\s*bis/i, /ablaufdatum/i, /expiry/i],
          id_number: [/ausweis\s*nr/i, /personalausweis/i, /karten\s*nr/i, /id\s*no/i],
          nationality: [/staatsangeh\u00f6rigkeit/i, /nationality/i],
          address: [/anschrift/i, /wohnort/i, /address/i],
          issuing_authority: [/ausstellende\s*beh\u00f6rde/i, /authority/i],
        },
        date_format: 'DMY',
        has_mrz: true,
      },
      {
        type: 'drivers_license', // Fuehrerschein
        id_number_regex: /^[A-Z0-9]{11}$/,
        field_labels: {
          name: [/name/i, /familienname/i, /vorname/i, /\bnom\b/i],
          date_of_birth: [/geburtsdatum/i, /geb\.?/i, /date\s*of\s*birth/i],
          expiry_date: [/g\u00fcltig\s*bis/i, /ablaufdatum/i, /expiry/i],
          id_number: [/f\u00fchrerschein\s*nr/i, /karten\s*nr/i, /licence\s*no/i, /id\s*no/i],
          nationality: [/staatsangeh\u00f6rigkeit/i, /nationality/i],
          address: [/anschrift/i, /wohnort/i, /address/i],
          issuing_authority: [/ausstellende\s*beh\u00f6rde/i, /authority/i],
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
        type: 'national_id', // Carte nationale d'identite (CNI)
        id_number_regex: /^\d{12}$/,
        field_labels: {
          name: [/nom/i, /pr\u00e9nom/i, /name/i, /pr\u00e9noms/i],
          date_of_birth: [/date\s*de\s*naissance/i, /n\u00e9\s*le/i, /date\s*of\s*birth/i],
          expiry_date: [/date\s*d'expiration/i, /valable\s*jusqu/i, /expiry/i],
          id_number: [/n\u00b0\s*carte/i, /num\u00e9ro/i, /carte\s*nationale/i, /id\s*no/i],
          nationality: [/nationalit\u00e9/i, /nationality/i],
          address: [/adresse/i, /domicile/i, /address/i],
          issuing_authority: [/d\u00e9livr\u00e9\s*par/i, /autorit\u00e9/i, /authority/i],
        },
        date_format: 'DMY',
        has_mrz: true,
      },
      {
        type: 'drivers_license', // Permis de conduire
        id_number_regex: /^\d{12}$/,
        field_labels: {
          name: [/nom/i, /pr\u00e9nom/i, /name/i],
          date_of_birth: [/date\s*de\s*naissance/i, /n\u00e9\s*le/i, /date\s*of\s*birth/i],
          expiry_date: [/date\s*d'expiration/i, /valable\s*jusqu/i, /expiry/i],
          id_number: [/permis\s*no/i, /num\u00e9ro/i, /licence\s*no/i],
          nationality: [/nationalit\u00e9/i, /nationality/i],
          address: [/adresse/i, /domicile/i, /address/i],
          issuing_authority: [/d\u00e9livr\u00e9\s*par/i, /pr\u00e9fecture/i, /authority/i],
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
        type: 'national_id', // Carta d'identita
        id_number_regex: /^[A-Z]{2}\d{5}[A-Z]{2}$/,
        field_labels: {
          name: [/cognome/i, /nome/i, /name/i],
          date_of_birth: [/data\s*di\s*nascita/i, /nato\s*il/i, /date\s*of\s*birth/i],
          expiry_date: [/scadenza/i, /valido\s*fino/i, /expiry/i],
          id_number: [/carta\s*d/i, /numero/i, /id\s*no/i],
          nationality: [/cittadinanza/i, /nazionalit\u00e0/i, /nationality/i],
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
          id_number: [/d\.?n\.?i\.?\s*no/i, /n\u00famero/i, /id\s*no/i],
          nationality: [/nacionalidad/i, /nationality/i],
          address: [/domicilio/i, /direcci\u00f3n/i, /address/i],
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

  // -- Balkans ---------------------------------------------------

  AL: {
    country: 'AL',
    document_types: [
      {
        type: 'national_id', // Leternjoftim / Karte Identiteti
        id_number_regex: /^[A-Z0-9]{8,10}$/,
        field_labels: {
          name: [/mbiemri\/surname/i, /emri\/given\s*name/i, /surname/i, /given\s*name/i, /name/i],
          date_of_birth: [/dat[\u00eb e]lindja\/date\s*of\s*birth/i, /date\s*of\s*birth/i, /dob/i, /born/i],
          expiry_date: [/skadimit\/date\s*of\s*expiry/i, /date\s*of\s*expiry/i, /skadimit/i, /expiry/i, /expires/i],
          id_number: [/nr\.?\s*personal\/personal\s*no/i, /personal\s*no/i, /id\s*no/i],
          nationality: [/shtet[\u00eb e]sia\/nationality/i, /nationality/i, /citizenship/i],
          address: [/vendbanimi\/place/i, /adresa/i, /address/i],
          issuing_authority: [/autoriteti\s*leshues\/authority/i, /authority/i],
        },
        date_format: 'DMY',
        has_mrz: true,
      },
    ],
  },

  // -- Latin America --------------------------------------------

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
          id_number: [/registro/i, /n\u00b0\s*registro/i, /cnh/i, /id\s*no/i],
          nationality: [/nacionalidade/i, /nationality/i],
          address: [/endere\u00e7o/i, /address/i],
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
          address: [/domicilio/i, /direcci\u00f3n/i, /address/i],
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
          id_number: [/d\.?n\.?i\.?\s*no?/i, /n\u00famero/i, /id\s*no/i],
          nationality: [/nacionalidad/i, /nationality/i],
          address: [/domicilio/i, /address/i],
          issuing_authority: [/renaper/i, /authority/i],
        },
        date_format: 'DMY',
        has_mrz: true,
      },
    ],
  },

  // -- Asia-Pacific ----------------------------------------------

  JP: {
    country: 'JP',
    document_types: [
      {
        type: 'drivers_license',
        id_number_regex: /^\d{12}$/,
        field_labels: {
          name: [/\u6c0f\u540d/i, /name/i],
          date_of_birth: [/\u751f\u5e74\u6708\u65e5/i, /date\s*of\s*birth/i],
          expiry_date: [/\u6709\u52b9\u671f\u9650/i, /expiry/i],
          id_number: [/\u514d\u8a31\u8a3c\u756a\u53f7/i, /\u756a\u53f7/i, /id\s*no/i],
          nationality: [/\u56fd\u7c4d/i, /nationality/i],
          address: [/\u4f4f\u6240/i, /address/i],
          issuing_authority: [/\u516c\u5b89\u59d4\u54e1\u4f1a/i, /authority/i],
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
          name: [/\uc131\uba85/i, /\uc774\ub984/i, /name/i],
          date_of_birth: [/\uc0dd\ub144\uc6d4\uc77c/i, /date\s*of\s*birth/i],
          expiry_date: [/\uc720\ud6a8\uae30\uac04/i, /expiry/i],
          id_number: [/\uba74\ud5c8\ubc88\ud638/i, /\ubc88\ud638/i, /id\s*no/i],
          nationality: [/\uad6d\uc801/i, /nationality/i],
          address: [/\uc8fc\uc18c/i, /address/i],
          issuing_authority: [/\uacbd\ucc30\uccad/i, /authority/i],
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
          name: [...ENGLISH_LABELS.name, /\u0928\u093e\u092e/i],
          date_of_birth: [...ENGLISH_LABELS.date_of_birth, /\u091c\u0928\u094d\u092e\s*\u0924\u093f\u0925\u093f/i],
          expiry_date: ENGLISH_LABELS.expiry_date,
          id_number: [/aadhaar/i, /\u0906\u0927\u093e\u0930/i, ...ENGLISH_LABELS.id_number],
          nationality: ENGLISH_LABELS.nationality,
          address: [...ENGLISH_LABELS.address, /\u092a\u0924\u093e/i],
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
          name: [/\u0e0a\u0e37\u0e48\u0e2d/i, ...ENGLISH_LABELS.name],
          date_of_birth: [/\u0e40\u0e01\u0e34\u0e14\u0e27\u0e31\u0e19\u0e17\u0e35\u0e48/i, ...ENGLISH_LABELS.date_of_birth],
          expiry_date: [/\u0e2b\u0e21\u0e14\u0e2d\u0e32\u0e22\u0e38/i, ...ENGLISH_LABELS.expiry_date],
          id_number: [/\u0e40\u0e25\u0e02\u0e1b\u0e23\u0e30\u0e08\u0e33\u0e15\u0e31\u0e27/i, ...ENGLISH_LABELS.id_number],
          nationality: [/\u0e2a\u0e31\u0e0d\u0e0a\u0e32\u0e15\u0e34/i, ...ENGLISH_LABELS.nationality],
          address: [/\u0e17\u0e35\u0e48\u0e2d\u0e22\u0e39\u0e48/i, ...ENGLISH_LABELS.address],
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
          name: [/h\u1ecd\s*v\u00e0\s*t\u00ean/i, /h\u1ecd\s*t\u00ean/i, ...ENGLISH_LABELS.name],
          date_of_birth: [/ng\u00e0y\s*sinh/i, ...ENGLISH_LABELS.date_of_birth],
          expiry_date: [/c\u00f3\s*gi\u00e1\s*tr\u1ecb\s*\u0111\u1ebfn/i, ...ENGLISH_LABELS.expiry_date],
          id_number: [/s\u1ed1/i, /cccd/i, ...ENGLISH_LABELS.id_number],
          nationality: [/qu\u1ed1c\s*t\u1ecbch/i, ...ENGLISH_LABELS.nationality],
          address: [/n\u01a1i\s*th\u01b0\u1eddng\s*tr\u00fa/i, ...ENGLISH_LABELS.address],
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
  'personalausweis', 'f\u00fchrerschein', 'bundesrepublik deutschland',
  // French
  "carte nationale d'identit\u00e9", 'permis de conduire', 'r\u00e9publique fran\u00e7aise',
  // Italian
  "carta d'identit\u00e0", 'patente di guida', 'repubblica italiana',
  // Spanish
  'documento nacional de identidad', 'permiso de conducir',
  'instituto nacional electoral',
  // Portuguese
  'carteira nacional de habilita\u00e7\u00e3o', 'carta de condu\u00e7\u00e3o',
  // Dutch
  'identiteitskaart', 'rijbewijs',
  // Albanian
  'republika e shqip\u00ebris\u00eb', 'let\u00ebrnjoftim', 'kart\u00eb identiteti',
  // Japanese
  '\u904b\u8ee2\u514d\u8a31\u8a3c', '\u30de\u30a4\u30ca\u30f3\u30d0\u30fc\u30ab\u30fc\u30c9',
  // Korean
  '\uc6b4\uc804\uba74\ud5c8\uc99d', '\uc8fc\ubbfc\ub4f1\ub85d\uc99d',
]);
