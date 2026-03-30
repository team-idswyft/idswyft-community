/**
 * Core types shared between backend and engine.
 * Superset of both backend/src/types/index.ts and engine/src/types/index.ts OCRData.
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
  issuing_authority?: string;
  sex?: string;
  address?: string;
  height?: string;
  weight?: string;
  eye_color?: string;
  hair_color?: string;
  raw_text?: string;
  id_number?: string;
  expiry_date?: string;
  confidence_scores?: Record<string, number>;
  [key: string]: any;
}
