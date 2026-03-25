import { INTERNATIONAL_HEADER_NOISE } from '../internationalIdFormats.js';

/** Specimen / watermark labels found on sample documents */
export const SPECIMEN_LABELS = /\b(EXEMPLAR|SPECIMEN|MUSTER|MOD[ÈE]LE|MODELO|MUESTRA|ESEMPIO|EKSEMPLAR|ESIMERKKIKAPPALE|WZÓR)\b/i;

/** Document headers and titles that should never be treated as person names */
export const HEADER_NOISE = new Set([
  'driver license', 'drivers license', "driver's license",
  'driver licence', 'drivers licence', 'identification card',
  'id card', 'identity card', 'passport', 'national id',
  'real id', 'department of motor vehicles', 'dmv',
  'not for federal identification', 'federal limits apply',
  'not for federal purposes', 'not for federal identification purposes',
  'commercial driver license', 'cdl',
  // International header noise
  ...INTERNATIONAL_HEADER_NOISE,
]);

/** All 50 US states + DC (lowercase) */
export const US_STATES = new Set([
  'alabama','alaska','arizona','arkansas','california','colorado',
  'connecticut','delaware','florida','georgia','hawaii','idaho',
  'illinois','indiana','iowa','kansas','kentucky','louisiana',
  'maine','maryland','massachusetts','michigan','minnesota',
  'mississippi','missouri','montana','nebraska','nevada',
  'new hampshire','new jersey','new mexico','new york',
  'north carolina','north dakota','ohio','oklahoma','oregon',
  'pennsylvania','rhode island','south carolina','south dakota',
  'tennessee','texas','utah','vermont','virginia','washington',
  'west virginia','wisconsin','wyoming','district of columbia',
]);

/** Short tokens that appear as DL field labels / values */
export const DL_FIELD_TOKENS = new Set([
  'hgt','ht','wt','sex','hair','eyes','eye','dob','exp','iss',
  'end','rstr','rest','class','endorsements','restr','restrictions',
  'halt','hait','hal','hai','hgi','hg','sek','sox',
  'blk','brn','blu','grn','hzl','gry','none','organ','donor',
  'veteran','vet','dd','4d','4a','4b','4c','1','2','3','n',
]);

/** DL-specific short labels that should never be treated as names */
export const DL_LABEL_NOISE = new Set([
  'dl', 'cdl', 'id', 'usa', 'dob', 'exp', 'iss',
]);

/** Compound noise words for detecting OCR-garbled document headers/labels */
export const COMPOUND_NOISE_WORDS = new Set([
  'north','south','west','east','new','rhode','district','of',
  'carolina','dakota','virginia','hampshire','jersey','mexico',
  'york','island','columbia','usa','state','driver','drivers',
  'license','licence','identification','card','id','real',
  'department','motor','vehicles','commercial','com',
  'federal','not','for','purposes','limits','apply',
  'personal','privileges','auto','credential',
]);

/** Name suffixes that should always appear at the end of the full name */
export const NAME_SUFFIXES = new Set(['JR', 'SR', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII']);
