import {
  HEADER_NOISE, US_STATES, DL_FIELD_TOKENS,
  DL_LABEL_NOISE, COMPOUND_NOISE_WORDS, NAME_SUFFIXES,
} from '../constants/noise.js';
import type { NameResult } from '../types.js';

/** True if text is a document header or state name */
export function isHeaderNoise(text: string): boolean {
  const lower = text.toLowerCase().trim();
  if (HEADER_NOISE.has(lower)) return true;
  if (US_STATES.has(lower))    return true;
  if (DL_LABEL_NOISE.has(lower)) return true;
  // Substring check: catches OCR-merged noise like "NORTHUSA DRIVER LICENSE CAROLINA"
  for (const phrase of HEADER_NOISE) {
    if (lower.includes(phrase)) return true;
  }

  // Single-word or two-word text that matches a US state name (OCR fragment)
  // Catches garbled OCR like "NEWJERSEY", "NEWEMEXICO"
  // Only uses prefix matching for multi-word states (joined forms are never real names).
  // Single-word states require near-exact match to avoid false positives on names
  // like GEORGE (georgia), LOUIS (louisiana), VIRGINIA, MONTGOMERY (montana).
  const words = lower.split(/\s+/);
  if (words.length <= 2) {
    for (const state of US_STATES) {
      const stateWords = state.split(' ');
      if (stateWords.length === 1) {
        // Single-word states: only reject if text IS the state name (± a few garbled chars)
        if (state.length >= 4 && lower === state) return true;
        // Allow up to 3 trailing garbled chars (e.g., "oregons", "floridaa")
        if (state.length >= 5 && lower.startsWith(state) && lower.length <= state.length + 3) return true;
      } else {
        // Multi-word states: check if text starts with joined form (e.g., "newjersey", "newmexico")
        // These joined forms are never real names, so prefix matching is safe
        const joined = stateWords.join('');
        if (joined.length >= 5 && lower.startsWith(joined.slice(0, 5))) return true;
      }
    }
  }

  // Compound noise: check if text is made entirely of known noise words
  // (handles OCR-merged tokens by also checking if each word STARTS WITH a noise word)
  // Prefix matching only for multi-word text — prevents false positives
  // on single-word surnames (e.g., "MOTORIST" matching noise word "motor")
  const usePrefix = words.length > 1;
  const matchCount = words.filter(w =>
    COMPOUND_NOISE_WORDS.has(w) ||
    (usePrefix && [...COMPOUND_NOISE_WORDS].some(nw => w.startsWith(nw) && w.length <= nw.length + 4))
  ).length;
  // All words are noise, OR for 4+ word strings allow 1 non-noise word (OCR garble tolerance)
  if (words.length > 0 && matchCount === words.length) return true;
  if (words.length >= 4 && matchCount >= words.length - 1) return true;
  return false;
}

/** Strip DL field-label tokens from an extracted name */
export function sanitizeName(name: string): string {
  const tokens  = name.split(/\s+/).filter(Boolean);
  // Strip commas from tokens — formatting artifacts like "ELIZABETH, SR" → "ELIZABETH SR"
  const cleaned = tokens.map(t => t.replace(/,/g, '')).filter(t => {
    const lower = t.toLowerCase();
    if (DL_FIELD_TOKENS.has(lower)) return false;
    if (t.length === 1 && !/^[A-Z]$/.test(t)) return false;
    // Remove standalone numbers (AAMVA field markers like "1", "2", "3")
    if (/^\d+$/.test(t))           return false;
    return true;
  });
  return cleaned.length === 0 ? name : cleaned.join(' ');
}

/** Move name suffixes (JR, SR, II, etc.) to the end of the full name */
export function reorderSuffix(name: string): string {
  const tokens = name.split(/\s+/);
  if (tokens.length < 2) return name;
  const suffixes: string[] = [];
  const rest: string[] = [];
  for (const t of tokens) {
    if (NAME_SUFFIXES.has(t.toUpperCase())) suffixes.push(t);
    else rest.push(t);
  }
  if (suffixes.length === 0) return name;
  return [...rest, ...suffixes].join(' ');
}

/** Score how likely a string is a real person name (0–1) */
export function nameScore(text: string): number {
  const t = text.trim();
  if (t.length < 2)                               return 0;
  if (isHeaderNoise(t))                           return 0;
  if (/\d{3,}/.test(t))                           return 0;  // contains long number
  if (/[:\/<>@#$%^&*=+]/.test(t))                 return 0;  // special chars
  if (/^(class|iss|exp|dob|sex|hgt|wt)\b/i.test(t)) return 0;

  let score = 0;
  // All caps alphabetic with spaces/hyphens/apostrophes — classic DL name
  if (/^[A-Z][A-Z\s\-',]+$/.test(t))              score += 0.5;
  // Contains at least two "words" that look like name tokens
  const words = t.split(/\s+/).filter(w => w.length >= 2);
  if (words.length >= 2)                          score += 0.3;
  if (words.length === 1 && t.length >= 3)        score += 0.1;
  // Title case is also valid for some DLs
  if (/^[A-Z][a-z]/.test(t))                     score += 0.1;
  return Math.min(score, 1);
}

/**
 * Accumulates name candidates across extraction strategies.
 * When a strategy yields a single-word result (likely partial), it saves
 * it as a fallback and returns null so later strategies can try to find
 * a multi-word name. Replaces the prior `returnOrFallback` closure.
 */
export class CandidateAccumulator {
  fallback: NameResult | null = null;

  /** Returns result if multi-word; saves single-word as fallback and returns null */
  tryReturn(result: NameResult): NameResult | null {
    if (result.value.split(/\s+/).length >= 2) return result;
    if (!this.fallback || nameScore(result.value) > nameScore(this.fallback.value)) {
      this.fallback = result;
    }
    return null;
  }
}
