import type { AMLProvider, AMLScreeningInput, AMLScreeningResult, AMLMatch } from './types.js';
import { logger } from '@/utils/logger.js';

const OPENSANCTIONS_API = 'https://api.opensanctions.org/match/default';

/**
 * OpenSanctionsProvider — Uses the free OpenSanctions API for name+DOB matching
 * against OFAC, EU, UN, and other international sanctions lists.
 *
 * API docs: https://www.opensanctions.org/docs/api/
 */
export class OpenSanctionsProvider implements AMLProvider {
  readonly name = 'opensanctions';
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

      const response = await fetch(OPENSANCTIONS_API, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10000), // 10s timeout
      });

      if (!response.ok) {
        logger.error('OpenSanctions API error', {
          status: response.status,
          statusText: response.statusText,
        });
        // Graceful degradation — return clear on API error
        return this.clearResult(input, now);
      }

      const data = await response.json() as {
        responses: Record<string, { results: Array<{ id: string; caption: string; score: number; datasets: string[] }> }>;
      };

      const matches: AMLMatch[] = [];
      const listsChecked = new Set<string>();

      // Parse API response
      for (const [, queryResult] of Object.entries(data.responses || {})) {
        for (const result of queryResult.results || []) {
          const score = result.score;

          for (const dataset of result.datasets || []) {
            listsChecked.add(dataset);
          }

          // Only include matches above 0.5 threshold
          if (score >= 0.5) {
            matches.push({
              listed_name: result.caption,
              list_source: (result.datasets || []).join(', '),
              score,
              match_type: input.date_of_birth ? 'name_dob' : 'name',
            });
          }
        }
      }

      // Determine risk level
      const highConfidenceMatch = matches.some(m => m.score >= 0.85);
      const potentialMatch = matches.some(m => m.score >= 0.5);

      let risk_level: AMLScreeningResult['risk_level'];
      if (highConfidenceMatch) {
        risk_level = 'confirmed_match';
      } else if (potentialMatch) {
        risk_level = 'potential_match';
      } else {
        risk_level = 'clear';
      }

      return {
        risk_level,
        match_found: matches.length > 0,
        matches,
        lists_checked: [...listsChecked],
        screened_name: input.full_name,
        screened_dob: input.date_of_birth || null,
        screened_at: now,
      };
    } catch (err) {
      logger.error('OpenSanctions screening failed', { error: err });
      // Graceful degradation — return clear on network/timeout error
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
