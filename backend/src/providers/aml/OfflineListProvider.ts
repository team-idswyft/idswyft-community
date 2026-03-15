import type { AMLProvider, AMLScreeningInput, AMLScreeningResult, AMLMatch } from './types.js';
import { logger } from '@/utils/logger.js';

/**
 * OfflineListProvider — In-memory fuzzy name matching for air-gapped deployments.
 *
 * Uses Jaro-Winkler similarity for name matching against a configurable list.
 * For production use, load the OFAC SDN CSV or similar sanctions list.
 */
export class OfflineListProvider implements AMLProvider {
  readonly name = 'offline';
  private entries: Array<{ name: string; list: string; dob?: string }> = [];

  /** Load entries from an array (e.g., parsed from OFAC SDN CSV) */
  loadEntries(entries: Array<{ name: string; list: string; dob?: string }>): void {
    this.entries = entries.map(e => ({
      name: e.name.toLowerCase().trim(),
      list: e.list,
      dob: e.dob,
    }));
    logger.info(`OfflineListProvider: loaded ${this.entries.length} entries`);
  }

  async screen(input: AMLScreeningInput): Promise<AMLScreeningResult> {
    const now = new Date().toISOString();
    const queryName = input.full_name.toLowerCase().trim();
    const matches: AMLMatch[] = [];
    const listsChecked = new Set<string>();

    for (const entry of this.entries) {
      listsChecked.add(entry.list);
      const score = this.jaroWinkler(queryName, entry.name);

      if (score < 0.85) continue;

      let matchType: AMLMatch['match_type'] = 'name';
      let adjustedScore = score;

      // Boost score if DOB also matches
      if (input.date_of_birth && entry.dob && input.date_of_birth === entry.dob) {
        matchType = 'name_dob';
        adjustedScore = Math.min(1, score + 0.1);
      }

      matches.push({
        listed_name: entry.name,
        list_source: entry.list,
        score: adjustedScore,
        match_type: matchType,
      });
    }

    // Sort by score descending
    matches.sort((a, b) => b.score - a.score);

    const highConfidence = matches.some(m => m.score >= 0.95);
    const potential = matches.length > 0;

    return {
      risk_level: highConfidence ? 'confirmed_match' : potential ? 'potential_match' : 'clear',
      match_found: matches.length > 0,
      matches: matches.slice(0, 10), // Top 10 matches
      lists_checked: [...listsChecked],
      screened_name: input.full_name,
      screened_dob: input.date_of_birth || null,
      screened_at: now,
    };
  }

  /**
   * Jaro-Winkler similarity (0-1).
   * Optimized for name matching — common prefix gets a boost.
   */
  private jaroWinkler(s1: string, s2: string): number {
    if (s1 === s2) return 1;
    if (s1.length === 0 || s2.length === 0) return 0;

    const maxDist = Math.floor(Math.max(s1.length, s2.length) / 2) - 1;
    if (maxDist < 0) return 0;

    const s1Matches = new Array(s1.length).fill(false);
    const s2Matches = new Array(s2.length).fill(false);

    let matches = 0;
    let transpositions = 0;

    // Find matches
    for (let i = 0; i < s1.length; i++) {
      const start = Math.max(0, i - maxDist);
      const end = Math.min(i + maxDist + 1, s2.length);

      for (let j = start; j < end; j++) {
        if (s2Matches[j] || s1[i] !== s2[j]) continue;
        s1Matches[i] = true;
        s2Matches[j] = true;
        matches++;
        break;
      }
    }

    if (matches === 0) return 0;

    // Count transpositions
    let k = 0;
    for (let i = 0; i < s1.length; i++) {
      if (!s1Matches[i]) continue;
      while (!s2Matches[k]) k++;
      if (s1[i] !== s2[k]) transpositions++;
      k++;
    }

    const jaro =
      (matches / s1.length +
        matches / s2.length +
        (matches - transpositions / 2) / matches) /
      3;

    // Winkler prefix bonus (up to 4 chars)
    let prefix = 0;
    for (let i = 0; i < Math.min(4, Math.min(s1.length, s2.length)); i++) {
      if (s1[i] === s2[i]) prefix++;
      else break;
    }

    return jaro + prefix * 0.1 * (1 - jaro);
  }
}
