/**
 * Core types used by the engine worker.
 * Subset of backend/src/types/index.ts — only what extraction needs.
 */

export type DocumentType = 'passport' | 'drivers_license' | 'national_id' | 'other';

export interface OCRData {
  name?: string;
  first_name?: string;
  last_name?: string;
  middle_name?: string;
  date_of_birth?: string;
  expiration_date?: string;
  document_number?: string;
  nationality?: string;
  issuing_country?: string;
  sex?: string;
  address?: string;
  height?: string;
  weight?: string;
  eye_color?: string;
  hair_color?: string;
  raw_text?: string;
  confidence_scores?: Record<string, number>;
  [key: string]: any;
}
