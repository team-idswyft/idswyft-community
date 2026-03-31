/**
 * Multi-provider AML screening orchestrator.
 *
 * Runs all configured providers in parallel, merges results,
 * deduplicates matches, and returns a unified AMLScreeningResult.
 */

import type { AMLProvider, AMLScreeningInput, AMLScreeningResult, AMLMatch, AMLRiskLevel } from './types.js';
import { logger } from '@/utils/logger.js';

const RISK_PRIORITY: Record<AMLRiskLevel, number> = {
  clear: 0,
  potential_match: 1,
  confirmed_match: 2,
};

/**
 * Screen against all providers in parallel, merge results.
 * - Deduplicates matches by listed_name + list_source
 * - Takes the highest risk_level across all providers
 * - Combines lists_checked from all providers
 */
export async function screenAll(
  providers: AMLProvider[],
  input: AMLScreeningInput,
): Promise<AMLScreeningResult> {
  if (providers.length === 0) {
    return {
      risk_level: 'clear',
      match_found: false,
      matches: [],
      lists_checked: [],
      screened_name: input.full_name,
      screened_dob: input.date_of_birth ?? null,
      screened_at: new Date().toISOString(),
    };
  }

  const results = await Promise.allSettled(
    providers.map(p => p.screen(input)),
  );

  const allMatches: AMLMatch[] = [];
  const allLists = new Set<string>();
  let highestRisk: AMLRiskLevel = 'clear';

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    if (result.status === 'fulfilled') {
      const r = result.value;
      allMatches.push(...r.matches);
      for (const list of r.lists_checked) allLists.add(list);
      if (RISK_PRIORITY[r.risk_level] > RISK_PRIORITY[highestRisk]) {
        highestRisk = r.risk_level;
      }
    } else {
      logger.warn('AML provider failed during multi-screen', {
        provider: providers[i].name,
        error: result.reason instanceof Error ? result.reason.message : String(result.reason),
      });
    }
  }

  // Deduplicate matches by listed_name + list_source
  const seen = new Set<string>();
  const uniqueMatches: AMLMatch[] = [];
  for (const match of allMatches) {
    const key = `${match.listed_name}|${match.list_source}`;
    if (!seen.has(key)) {
      seen.add(key);
      uniqueMatches.push(match);
    }
  }

  return {
    risk_level: highestRisk,
    match_found: uniqueMatches.length > 0,
    matches: uniqueMatches,
    lists_checked: Array.from(allLists),
    screened_name: input.full_name,
    screened_dob: input.date_of_birth ?? null,
    screened_at: new Date().toISOString(),
  };
}
