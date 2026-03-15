/**
 * AML/Sanctions Screening Types
 *
 * Supports screening against OFAC SDN, EU, UN, and other sanctions lists.
 */

export type AMLRiskLevel = 'clear' | 'potential_match' | 'confirmed_match';

export interface AMLMatch {
  /** Name on the sanctions list */
  listed_name: string;
  /** Which list the match was found on */
  list_source: string;
  /** Match confidence score (0-1) */
  score: number;
  /** Reason the match was flagged */
  match_type: 'name' | 'name_dob' | 'name_nationality';
}

export interface AMLScreeningResult {
  /** Overall risk level */
  risk_level: AMLRiskLevel;
  /** Whether any match was found */
  match_found: boolean;
  /** Individual matches found */
  matches: AMLMatch[];
  /** Lists that were checked */
  lists_checked: string[];
  /** Name that was screened */
  screened_name: string;
  /** Date of birth used (if available) */
  screened_dob: string | null;
  /** Timestamp of screening */
  screened_at: string;
}

export interface AMLScreeningInput {
  full_name: string;
  date_of_birth?: string | null;
  nationality?: string | null;
}

export interface AMLProvider {
  readonly name: string;
  /** Screen a person against sanctions lists */
  screen(input: AMLScreeningInput): Promise<AMLScreeningResult>;
}
