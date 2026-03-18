#!/usr/bin/env npx tsx
/**
 * MIDV-500 Ground Truth Mapper
 *
 * Converts MIDV-500 ground truth JSON format into our benchmark schema.
 *
 * MIDV-500 format:
 *   { "field01": { "value": "Erika", "quad": [...] }, ... }
 *
 * Our format (ground-truth-schema.ts):
 *   { "full_name": "Erika Mustermann", "date_of_birth": "1964-08-12", ... }
 *
 * The mapper uses heuristics to identify fields by their position in the document
 * and the field values themselves (date patterns, number patterns, etc.).
 *
 * Usage:
 *   npx tsx backend/scripts/benchmark/map-ground-truth.ts --specimens-dir ./specimens
 */

import * as fs from 'fs';
import * as path from 'path';
import { parseArgs } from 'util';

import type { GroundTruth } from './ground-truth-schema.js';

const { values: args } = parseArgs({
  options: {
    'specimens-dir': { type: 'string', short: 's' },
    'help': { type: 'boolean', short: 'h' },
  },
  strict: false,
});

if (args.help || !args['specimens-dir']) {
  console.log(`
MIDV-500 Ground Truth Mapper

Converts midv500_ground_truth_XX.json files into our benchmark ground_truth_XX.json format.

Usage:
  npx tsx backend/scripts/benchmark/map-ground-truth.ts --specimens-dir <path>

Options:
  --specimens-dir, -s  Path to specimens directory (required)
  --help, -h           Show this help
  `);
  process.exit(0);
}

// ── Field classification heuristics ─────────────────────────

const DATE_PATTERNS = [
  /^\d{2}[\.\-\/]\d{2}[\.\-\/]\d{4}$/,    // DD.MM.YYYY or DD-MM-YYYY
  /^\d{4}[\.\-\/]\d{2}[\.\-\/]\d{2}$/,    // YYYY-MM-DD
  /^\d{2}\s\w+\s\d{4}$/,                   // DD Month YYYY
  /^\d{1,2}[\.\-\/]\d{1,2}[\.\-\/]\d{2,4}$/,
];

const ID_NUMBER_PATTERNS = [
  /^[A-Z0-9]{5,15}$/,
  /^\d{8,12}$/,
  /^[A-Z]\d{6,9}$/,
];

function looksLikeDate(value: string): boolean {
  return DATE_PATTERNS.some(p => p.test(value.trim()));
}

function looksLikeIdNumber(value: string): boolean {
  return ID_NUMBER_PATTERNS.some(p => p.test(value.trim()));
}

function looksLikeName(value: string): boolean {
  // Names are typically alphabetic with spaces, dashes, apostrophes
  return /^[A-Za-zÀ-ÿ\s\-'\.]+$/.test(value.trim()) && value.trim().length > 2;
}

function normalizeDate(value: string): string {
  // Try to normalize dates to YYYY-MM-DD
  const ddmmyyyy = value.match(/^(\d{2})[\.\-\/](\d{2})[\.\-\/](\d{4})$/);
  if (ddmmyyyy) return `${ddmmyyyy[3]}-${ddmmyyyy[2]}-${ddmmyyyy[1]}`;

  const yyyymmdd = value.match(/^(\d{4})[\.\-\/](\d{2})[\.\-\/](\d{2})$/);
  if (yyyymmdd) return `${yyyymmdd[1]}-${yyyymmdd[2]}-${yyyymmdd[3]}`;

  return value.trim();
}

// ── Known field labels for common document types ────────────

// These are field labels that appear in MIDV-500 ground truth.
// The actual field numbers vary by document type, so we classify
// by examining the value content and field labels.
const FIELD_LABEL_HINTS: Record<string, keyof GroundTruth> = {
  'surname': 'full_name',
  'name': 'full_name',
  'given_names': 'full_name',
  'first_name': 'full_name',
  'last_name': 'full_name',
  'date_of_birth': 'date_of_birth',
  'birth_date': 'date_of_birth',
  'dob': 'date_of_birth',
  'document_number': 'document_number',
  'card_number': 'document_number',
  'license_number': 'document_number',
  'expiry': 'expiry_date',
  'expiry_date': 'expiry_date',
  'expiration': 'expiry_date',
  'valid_until': 'expiry_date',
  'nationality': 'nationality',
  'sex': 'sex',
  'address': 'address',
};

interface MidvField {
  value: string;
  quad: number[][];
}

interface MidvGroundTruth {
  [key: string]: MidvField;
}

function classifyFields(midvGt: MidvGroundTruth): GroundTruth {
  const result: GroundTruth = {};
  const nameFields: string[] = [];
  const dateFields: Array<{ key: string; value: string; y: number }> = [];

  for (const [key, field] of Object.entries(midvGt)) {
    if (key === 'photo' || key === 'signature') continue;
    if (!field.value || field.value === '*') continue;

    const value = field.value.trim();
    const avgY = field.quad ? (field.quad[0][1] + field.quad[2][1]) / 2 : 0;

    // Check label-based hints first
    const lowerKey = key.toLowerCase();
    const hintMatch = FIELD_LABEL_HINTS[lowerKey];
    if (hintMatch) {
      if (hintMatch === 'full_name') {
        nameFields.push(value);
      } else if (hintMatch === 'date_of_birth') {
        result.date_of_birth = normalizeDate(value);
      } else if (hintMatch === 'expiry_date') {
        result.expiry_date = normalizeDate(value);
      } else {
        (result as any)[hintMatch] = value;
      }
      continue;
    }

    // Heuristic classification for fieldNN style keys
    if (looksLikeDate(value)) {
      dateFields.push({ key, value, y: avgY });
    } else if (looksLikeName(value)) {
      nameFields.push(value);
    } else if (looksLikeIdNumber(value)) {
      if (!result.document_number) {
        result.document_number = value;
      }
    } else if (/^[MF]$/i.test(value)) {
      result.sex = value.toUpperCase();
    } else if (value.length > 20) {
      // Long values might be addresses
      if (!result.address) result.address = value;
    }
  }

  // Combine name fields
  if (nameFields.length > 0 && !result.full_name) {
    result.full_name = nameFields.join(' ');
  }

  // Assign dates by position (higher on document = DOB, lower = expiry usually)
  if (dateFields.length > 0 && !result.date_of_birth) {
    dateFields.sort((a, b) => a.y - b.y);
    result.date_of_birth = normalizeDate(dateFields[0].value);
    if (dateFields.length > 1 && !result.expiry_date) {
      result.expiry_date = normalizeDate(dateFields[dateFields.length - 1].value);
    }
  }

  return result;
}

// ── Main ─────────────────────────────────────────────────────

function main() {
  const specimensDir = args['specimens-dir'] as string;

  if (!fs.existsSync(specimensDir)) {
    console.error(`Specimens directory not found: ${specimensDir}`);
    process.exit(1);
  }

  let mapped = 0;
  let skipped = 0;

  const countries = fs.readdirSync(specimensDir, { withFileTypes: true });
  for (const entry of countries) {
    if (!entry.isDirectory() || entry.name.startsWith('_')) continue;
    const countryDir = path.join(specimensDir, entry.name);
    const files = fs.readdirSync(countryDir);

    for (const file of files) {
      const match = file.match(/^midv500_ground_truth_(\d+)\.json$/);
      if (!match) continue;

      const id = match[1];
      const outPath = path.join(countryDir, `ground_truth_${id}.json`);

      if (fs.existsSync(outPath)) {
        console.log(`  Skip ${entry.name}/ground_truth_${id}.json (already exists)`);
        skipped++;
        continue;
      }

      try {
        const midvGt: MidvGroundTruth = JSON.parse(
          fs.readFileSync(path.join(countryDir, file), 'utf-8')
        );

        const ourGt = classifyFields(midvGt);

        // Add document type based on parent directory name patterns
        const countryCode = entry.name.toUpperCase();
        ourGt.issuing_country = countryCode;

        fs.writeFileSync(outPath, JSON.stringify(ourGt, null, 2) + '\n');
        console.log(`  Mapped ${entry.name}/ground_truth_${id}.json:`, Object.keys(ourGt).join(', '));
        mapped++;
      } catch (e) {
        console.error(`  Error mapping ${file}: ${e}`);
      }
    }
  }

  console.log(`\nDone: ${mapped} mapped, ${skipped} skipped`);
}

main();
