/**
 * Specimen-Driven OCR Extraction Accuracy Tests
 *
 * Runs PaddleOCR extraction against the 54-specimen dataset and asserts
 * minimum per-field accuracy thresholds. These tests require:
 *   - PaddleOCR ONNX models (downloaded via npm run build)
 *   - Specimen images in scripts/benchmark/specimens/
 *
 * Run:
 *   npx vitest run extraction-accuracy
 *
 * Skipped automatically in CI or when specimens are missing.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

// ── Paths ───────────────────────────────────────────

const BACKEND_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const SPECIMENS_DIR = path.join(BACKEND_ROOT, 'scripts', 'benchmark', 'specimens');
const specimensExist = fs.existsSync(SPECIMENS_DIR);

// ── Accuracy thresholds (minimum acceptable) ────────

const FIELD_THRESHOLDS: Record<string, number> = {
  full_name: 0.30,
  date_of_birth: 0.40,
  document_number: 0.45,
  expiry_date: 0.40,
  sex: 0.65,
  address: 0.30,
};

const OVERALL_THRESHOLD = 0.40; // overall exact-match rate

// ── Levenshtein helper ──────────────────────────────

function levenshtein(a: string, b: string): number {
  const la = a.length, lb = b.length;
  if (la === 0) return lb;
  if (lb === 0) return la;
  const matrix: number[][] = [];
  for (let i = 0; i <= la; i++) matrix[i] = [i];
  for (let j = 0; j <= lb; j++) matrix[0][j] = j;
  for (let i = 1; i <= la; i++) {
    for (let j = 1; j <= lb; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost,
      );
    }
  }
  return matrix[la][lb];
}

function normalizedLevenshtein(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 0;
  return levenshtein(a.toLowerCase(), b.toLowerCase()) / maxLen;
}

// ── Ground truth types ──────────────────────────────

interface GroundTruth {
  full_name?: string;
  date_of_birth?: string;
  document_number?: string;
  expiry_date?: string;
  nationality?: string;
  address?: string;
  sex?: string;
  issuing_state?: string;
  issuing_country?: string;
  document_type?: string;
}

interface FieldMetric {
  field: string;
  expected: string;
  extracted: string;
  exact_match: boolean;
  similarity: number;
}

interface Specimen {
  id: string;
  country: string;
  frontPath: string;
  groundTruth: GroundTruth;
}

// ── Specimen discovery ──────────────────────────────

function discoverSpecimens(baseDir: string): Specimen[] {
  const specimens: Specimen[] = [];

  function scanDir(dir: string, countryLabel: string) {
    if (!fs.existsSync(dir)) return;
    const files = fs.readdirSync(dir);
    const ids = new Set<string>();
    for (const f of files) {
      const m = f.match(/front_(\d+)/i);
      if (m) ids.add(m[1]);
    }
    for (const id of ids) {
      const frontFile = files.find(f => new RegExp(`front_${id}\\.(jpg|jpeg|png)`, 'i').test(f));
      const gtFile = files.find(f => new RegExp(`ground_truth_${id}\\.json`, 'i').test(f));
      if (!frontFile || !gtFile) continue;
      const gt = JSON.parse(fs.readFileSync(path.join(dir, gtFile), 'utf-8')) as GroundTruth;
      specimens.push({
        id: `${countryLabel}/${id}`,
        country: countryLabel,
        frontPath: path.join(dir, frontFile),
        groundTruth: gt,
      });
    }
  }

  // Top-level country dirs (e.g. US/, DE/, AL/)
  const topEntries = fs.readdirSync(baseDir, { withFileTypes: true });
  for (const entry of topEntries) {
    if (!entry.isDirectory()) continue;
    if (entry.name === '_raw') continue;

    // Check if it's a container dir like US_states/ with sub-dirs
    const subDir = path.join(baseDir, entry.name);
    const subEntries = fs.readdirSync(subDir, { withFileTypes: true });
    const hasFronts = subEntries.some(e => /front_\d+/i.test(e.name));

    if (hasFronts) {
      scanDir(subDir, entry.name.toUpperCase());
    } else {
      // Container dir — scan subdirectories
      for (const sub of subEntries) {
        if (sub.isDirectory()) {
          scanDir(path.join(subDir, sub.name), sub.name.toUpperCase());
        }
      }
    }
  }

  return specimens.sort((a, b) => a.id.localeCompare(b.id));
}

// ── Field comparison ────────────────────────────────

const FIELD_MAP: Array<{ gt: keyof GroundTruth; ocr: string[] }> = [
  { gt: 'full_name', ocr: ['full_name', 'name'] },
  { gt: 'date_of_birth', ocr: ['date_of_birth'] },
  { gt: 'document_number', ocr: ['document_number', 'id_number'] },
  { gt: 'expiry_date', ocr: ['expiry_date', 'expiration_date'] },
  { gt: 'address', ocr: ['address'] },
  { gt: 'sex', ocr: ['sex'] },
];

function compareFields(gt: GroundTruth, extracted: Record<string, unknown>): FieldMetric[] {
  const metrics: FieldMetric[] = [];
  for (const { gt: gtKey, ocr: ocrKeys } of FIELD_MAP) {
    const expected = gt[gtKey];
    if (!expected) continue;
    let extractedValue = '';
    for (const key of ocrKeys) {
      if (extracted[key] && typeof extracted[key] === 'string') {
        extractedValue = extracted[key] as string;
        break;
      }
    }
    let expNorm = expected.toLowerCase().trim();
    let extNorm = extractedValue.toLowerCase().trim();
    if (gtKey === 'document_number') {
      expNorm = expNorm.replace(/[\s-]/g, '');
      extNorm = extNorm.replace(/[\s-]/g, '');
    }
    metrics.push({
      field: gtKey,
      expected: String(expected),
      extracted: extractedValue,
      exact_match: expNorm === extNorm,
      similarity: 1 - normalizedLevenshtein(
        gtKey === 'document_number' ? expNorm : String(expected),
        gtKey === 'document_number' ? extNorm : extractedValue,
      ),
    });
  }
  return metrics;
}

// ── Test suite ──────────────────────────────────────

describe.skipIf(!specimensExist)('OCR Extraction Accuracy', () => {
  let PaddleOCRProvider: any;
  let provider: any;
  let specimens: Specimen[];
  let allMetrics: FieldMetric[];

  beforeAll(async () => {
    // Dynamic import to avoid loading ONNX models when tests are skipped
    const mod = await import('../PaddleOCRProvider.js');
    PaddleOCRProvider = mod.PaddleOCRProvider;
    provider = new PaddleOCRProvider();
    specimens = discoverSpecimens(SPECIMENS_DIR);
    allMetrics = [];

    // Process each specimen
    for (const specimen of specimens) {
      try {
        const imageBuffer = fs.readFileSync(specimen.frontPath);
        const docType = specimen.groundTruth.document_type || 'drivers_license';
        const country = specimen.groundTruth.issuing_country || undefined;
        const result = await provider.processDocument(imageBuffer, docType, country);
        const metrics = compareFields(specimen.groundTruth, result);
        allMetrics.push(...metrics);
      } catch (err) {
        console.warn(`Failed to process specimen ${specimen.id}:`, err);
      }
    }

    // Print summary for visibility
    const fieldGroups: Record<string, FieldMetric[]> = {};
    for (const m of allMetrics) {
      (fieldGroups[m.field] ??= []).push(m);
    }
    console.log('\n--- Extraction Accuracy Summary ---');
    let totalMatches = 0, totalFields = 0;
    for (const [field, metrics] of Object.entries(fieldGroups).sort()) {
      const matches = metrics.filter(m => m.exact_match).length;
      const rate = (matches / metrics.length * 100).toFixed(1);
      const avgSim = (metrics.reduce((s, m) => s + m.similarity, 0) / metrics.length * 100).toFixed(1);
      console.log(`  ${field.padEnd(18)} ${matches}/${metrics.length} exact (${rate}%)  avg similarity: ${avgSim}%`);
      totalMatches += matches;
      totalFields += metrics.length;
    }
    const overall = totalFields > 0 ? (totalMatches / totalFields * 100).toFixed(1) : '0.0';
    console.log(`  ${'OVERALL'.padEnd(18)} ${totalMatches}/${totalFields} exact (${overall}%)`);
    console.log('-----------------------------------\n');
  }, 300_000); // 5 min timeout for processing all specimens

  it('has specimens to test', () => {
    expect(specimens.length).toBeGreaterThan(0);
  });

  it(`overall accuracy >= ${(OVERALL_THRESHOLD * 100).toFixed(0)}%`, () => {
    const matches = allMetrics.filter(m => m.exact_match).length;
    const rate = allMetrics.length > 0 ? matches / allMetrics.length : 0;
    expect(rate).toBeGreaterThanOrEqual(OVERALL_THRESHOLD);
  });

  for (const [field, threshold] of Object.entries(FIELD_THRESHOLDS)) {
    it(`${field} accuracy >= ${(threshold * 100).toFixed(0)}%`, () => {
      const fieldMetrics = allMetrics.filter(m => m.field === field);
      if (fieldMetrics.length === 0) return; // no ground truth for this field
      const matches = fieldMetrics.filter(m => m.exact_match).length;
      const rate = matches / fieldMetrics.length;
      expect(rate).toBeGreaterThanOrEqual(threshold);
    });
  }

  it('no field has 0% accuracy', () => {
    const fieldGroups: Record<string, FieldMetric[]> = {};
    for (const m of allMetrics) {
      (fieldGroups[m.field] ??= []).push(m);
    }
    for (const [field, metrics] of Object.entries(fieldGroups)) {
      const matches = metrics.filter(m => m.exact_match).length;
      if (metrics.length >= 5) {
        // Only assert for fields with enough samples
        expect(matches, `${field} has 0% accuracy`).toBeGreaterThan(0);
      }
    }
  });

  it('average similarity >= 50% across all fields', () => {
    if (allMetrics.length === 0) return;
    const avgSim = allMetrics.reduce((s, m) => s + m.similarity, 0) / allMetrics.length;
    expect(avgSim).toBeGreaterThanOrEqual(0.50);
  });
});
