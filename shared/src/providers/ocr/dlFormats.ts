/**
 * US State Driver's License Number Format Registry
 *
 * Comprehensive map of all 50 states + DC DL number formats.
 * Sources: NTSI, AAMVA, state DMV sites, usdl-regex (GitHub).
 *
 * Shared between OCR extraction (PaddleOCRProvider) and
 * cross-validation (dlNumberValidator).
 */

export const STATE_DL_FORMATS: Record<string, { regex: RegExp; description: string }> = {
  AL: { regex: /^[0-9]{1,8}$/,                                         description: '1-8 digits' },
  AK: { regex: /^[0-9]{1,7}$/,                                         description: '1-7 digits' },
  AZ: { regex: /^([A-Z][0-9]{8}|[0-9]{9})$/,                           description: '1L+8D or 9D' },
  AR: { regex: /^[0-9]{4,9}$/,                                         description: '4-9 digits' },
  CA: { regex: /^[A-Z][0-9]{7}$/,                                      description: '1L+7D' },
  CO: { regex: /^([0-9]{9}|[A-Z][0-9]{3,6}|[A-Z]{2}[0-9]{2,5})$/,     description: '9D or 1L+3-6D or 2L+2-5D' },
  CT: { regex: /^[0-9]{9}$/,                                           description: '9D' },
  DE: { regex: /^[0-9]{1,7}$/,                                         description: '1-7D' },
  FL: { regex: /^[A-Z][0-9]{12}$/,                                     description: '1L+12D' },
  GA: { regex: /^[0-9]{7,9}$/,                                         description: '7-9D' },
  HI: { regex: /^([A-Z][0-9]{8}|[0-9]{9})$/,                           description: '1L+8D or 9D' },
  ID: { regex: /^([A-Z]{2}[0-9]{6}[A-Z]|[0-9]{9})$/,                   description: '2L+6D+1L or 9D' },
  IL: { regex: /^[A-Z][0-9]{11,12}$/,                                  description: '1L+11-12D' },
  IN: { regex: /^([A-Z][0-9]{9}|[0-9]{9,10})$/,                        description: '1L+9D or 9-10D' },
  IA: { regex: /^([0-9]{9}|[0-9]{3}[A-Z]{2}[0-9]{4})$/,                description: '9D or 3D+2L+4D' },
  KS: { regex: /^(K[0-9]{8}|[A-Z][0-9][A-Z][0-9][A-Z]|[0-9]{9})$/,    description: 'K+8D or L-D-L-D-L or 9D' },
  KY: { regex: /^([A-Z][0-9]{8,9}|[0-9]{9})$/,                         description: '1L+8-9D or 9D' },
  LA: { regex: /^[0-9]{1,9}$/,                                         description: '1-9D' },
  ME: { regex: /^([0-9]{7}|[0-9]{7}[A-Z]|[0-9]{8})$/,                  description: '7D or 7D+1L or 8D' },
  MD: { regex: /^[A-Z][0-9]{12}$/,                                     description: '1L+12D' },
  MA: { regex: /^([A-Z][0-9]{8}|[0-9]{9})$/,                           description: '1L+8D or 9D' },
  MI: { regex: /^[A-Z][0-9]{10,12}$/,                                  description: '1L+10-12D' },
  MN: { regex: /^[A-Z][0-9]{12}$/,                                     description: '1L+12D' },
  MS: { regex: /^[0-9]{9}$/,                                           description: '9D' },
  MO: { regex: /^([A-Z][0-9]{5,9}|[A-Z][0-9]{6}R|[0-9]{8}[A-Z]{2}|[0-9]{9}[A-Z]?|[0-9]{3}[A-Z][0-9]{6})$/, description: 'complex -- many legacy formats' },
  MT: { regex: /^([A-Z][0-9]{8}|[0-9]{9}|[0-9]{13,14})$/,              description: '1L+8D or 9D or 13-14D' },
  NE: { regex: /^[A-Z][0-9]{6,8}$/,                                    description: '1L+6-8D' },
  NV: { regex: /^([0-9]{9,10}|[0-9]{12}|X[0-9]{8})$/,                  description: '9-10D or 12D or X+8D' },
  NH: { regex: /^([0-9]{2}[A-Z]{3}[0-9]{5}|NH[LNV][0-9]{8})$/,         description: '2D+3L+5D (legacy) or NHL/NHN/NHV+8D' },
  NJ: { regex: /^[A-Z][0-9]{14}$/,                                     description: '1L+14D' },
  NM: { regex: /^[0-9]{8,9}$/,                                         description: '8-9D' },
  NY: { regex: /^([0-9]{9}|[A-Z][0-9]{7}|[0-9]{16}|[0-9]{8})$/,        description: '9D or 1L+7D or 16D or 8D' },
  NC: { regex: /^[0-9]{1,12}$/,                                        description: '1-12D' },
  ND: { regex: /^([A-Z]{3}[0-9]{6}|[0-9]{9})$/,                        description: '3L+6D or 9D' },
  OH: { regex: /^([A-Z][0-9]{4,8}|[A-Z]{2}[0-9]{3,7}|[0-9]{8})$/,     description: '1L+4-8D or 2L+3-7D or 8D' },
  OK: { regex: /^([A-Z][0-9]{9}|[0-9]{9})$/,                           description: '1L+9D or 9D' },
  OR: { regex: /^[0-9]{1,9}$/,                                         description: '1-9D (commonly 7)' },
  PA: { regex: /^[0-9]{8}$/,                                           description: '8D' },
  RI: { regex: /^([0-9]{7}|[A-Z][0-9]{6})$/,                           description: '7D or 1L+6D' },
  SC: { regex: /^[0-9]{5,11}$/,                                        description: '5-11D' },
  SD: { regex: /^([0-9]{6,10}|[0-9]{12})$/,                            description: '6-10D or 12D' },
  TN: { regex: /^[0-9]{7,9}$/,                                         description: '7-9D' },
  TX: { regex: /^[0-9]{7,8}$/,                                         description: '7-8D' },
  UT: { regex: /^[0-9]{4,10}$/,                                        description: '4-10D' },
  VT: { regex: /^([0-9]{8}|[0-9]{7}A)$/,                               description: '8D or 7D+A' },
  VA: { regex: /^([A-Z][0-9]{8,11}|[0-9]{9})$/,                        description: '1L+8-11D or 9D' },
  WA: { regex: /^(WDL[A-Z0-9]{9}|[A-Z*]{1,7}[A-Z0-9*]{5,11})$/,       description: 'WDL+9 (current) or 12-char name-encoded (legacy)' },
  WV: { regex: /^([0-9]{7}|[A-Z]{1,2}[0-9]{5,6})$/,                    description: '7D or 1-2L+5-6D' },
  WI: { regex: /^[A-Z][0-9]{13}$/,                                     description: '1L+13D' },
  WY: { regex: /^[0-9]{9,10}$/,                                        description: '9-10D' },
  DC: { regex: /^([0-9]{7}|[0-9]{9})$/,                                description: '7D or 9D' },
};
