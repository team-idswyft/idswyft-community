import type { AMLProvider, AMLScreeningInput, AMLScreeningResult, AMLMatch } from './types.js';
import { logger } from '@/utils/logger.js';

const PEP_API = 'https://api.opensanctions.org/match/peps';

/**
 * Lists checked by the OpenSanctions PEP dataset.
 * Always reported for audit compliance.
 */
export const PEP_LISTS_CHECKED = [
  'opensanctions-pep',
] as const;

/**
 * PEPProvider — Screens against Politically Exposed Persons databases
 * via the OpenSanctions /match/peps endpoint.
 *
 * Key difference from sanctions: PEP matches only produce `potential_match`
 * (never `confirmed_match`), because being a PEP is a risk signal for
 * enhanced due diligence — not evidence of wrongdoing.
 */
export class PEPProvider implements AMLProvider {
  readonly name = 'pep';
  private apiKey: string | null;

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.OPENSANCTIONS_API_KEY || null;
  }

  async screen(input: AMLScreeningInput): Promise<AMLScreeningResult> {
    const now = new Date().toISOString();

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (this.apiKey) {
        headers['Authorization'] = `ApiKey ${this.apiKey}`;
      }

      const body: Record<string, any> = {
        schema: 'Person',
        properties: {
          name: [input.full_name],
        },
      };

      if (input.date_of_birth) {
        body.properties.birthDate = [input.date_of_birth];
      }
      if (input.nationality) {
        body.properties.nationality = [input.nationality];
      }

      const response = await fetch(PEP_API, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        logger.error('PEP API error', {
          status: response.status,
          statusText: response.statusText,
        });
        return this.clearResult(input, now);
      }

      const data = await response.json() as {
        responses: Record<string, { results: Array<{ id: string; caption: string; score: number; datasets: string[] }> }>;
      };

      const matches: AMLMatch[] = [];
      const listsChecked = new Set<string>(PEP_LISTS_CHECKED);

      for (const [, queryResult] of Object.entries(data.responses || {})) {
        for (const result of queryResult.results || []) {
          const score = result.score;

          for (const dataset of result.datasets || []) {
            listsChecked.add(dataset);
          }

          if (score >= 0.5) {
            matches.push({
              listed_name: result.caption,
              list_source: (result.datasets || []).join(', '),
              score,
              match_type: 'pep',
            });
          }
        }
      }

      return {
        // PEP matches cap at potential_match — being a PEP is not illegal
        risk_level: matches.length > 0 ? 'potential_match' : 'clear',
        match_found: matches.length > 0,
        matches,
        lists_checked: [...listsChecked],
        screened_name: input.full_name,
        screened_dob: input.date_of_birth || null,
        screened_at: now,
      };
    } catch (err) {
      logger.error('PEP screening failed', { error: err });
      return this.clearResult(input, now);
    }
  }

  private clearResult(input: AMLScreeningInput, timestamp: string): AMLScreeningResult {
    return {
      risk_level: 'clear',
      match_found: false,
      matches: [],
      lists_checked: [],
      screened_name: input.full_name,
      screened_dob: input.date_of_birth || null,
      screened_at: timestamp,
    };
  }
}
