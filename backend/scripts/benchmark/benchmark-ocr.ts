#!/usr/bin/env npx tsx
/**
 * OCR Benchmark Script
 *
 * Tests extraction accuracy of PaddleOCR + BarcodeService against specimen
 * document images. Optionally compares against ground truth JSON files.
 *
 * Usage:
 *   npx tsx backend/scripts/benchmark/benchmark-ocr.ts --specimens-dir ./specimens
 *   npx tsx backend/scripts/benchmark/benchmark-ocr.ts --specimens-dir ./specimens --country US
 *
 * Expected directory layout:
 *   specimens/US/front_01.jpg
 *   specimens/US/back_01.jpg
 *   specimens/US/ground_truth_01.json
 *   specimens/GB/front_01.jpg
 *   ...
 */

import * as fs from 'fs';
import * as path from 'path';
import { parseArgs } from 'util';

import type { GroundTruth, FieldMetric, SpecimenResult, BenchmarkSummary } from './ground-truth-schema.js';

// ── CLI Args ─────────────────────────────────────────────────

const { values: args } = parseArgs({
  options: {
    'specimens-dir': { type: 'string', short: 's' },
    'country': { type: 'string', short: 'c' },
    'help': { type: 'boolean', short: 'h' },
  },
  strict: false,
});

if (args.help || !args['specimens-dir']) {
  console.log(`
OCR Benchmark Script

Usage:
  npx tsx backend/scripts/benchmark/benchmark-ocr.ts --specimens-dir <path> [--country <code>]

Options:
  --specimens-dir, -s  Path to specimens directory (required)
  --country, -c        Filter to a specific country code (e.g. US, GB)
  --help, -h           Show this help
  `);
  process.exit(0);
}

// ── Lazy imports (avoid loading heavy ONNX models unless needed) ──

async function loadProviders() {
  const { PaddleOCRProvider } = await import('../../src/providers/ocr/PaddleOCRProvider.js');
  const { crossValidate } = await import('../../src/verification/cross-validator/engine.js');

  // BarcodeService transitively imports database.ts which throws without env vars.
  // Load it conditionally — barcode scanning is optional for the benchmark.
  let BarcodeService: any = null;
  try {
    const mod = await import('../../src/services/barcode.js');
    BarcodeService = mod.BarcodeService;
  } catch {
    console.log('Note: BarcodeService unavailable (missing DB env vars). Back-of-ID scanning will be skipped.');
  }

  return { PaddleOCRProvider, BarcodeService, crossValidate };
}

// ── Levenshtein distance ─────────────────────────────────────

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

// ── Specimen discovery ───────────────────────────────────────

interface Specimen {
  id: string;
  country: string;
  frontPath: string | null;
  backPath: string | null;
  groundTruthPath: string | null;
}

function discoverSpecimens(baseDir: string, filterCountry?: string): Specimen[] {
  const specimens: Specimen[] = [];
  const entries = fs.readdirSync(baseDir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const country = entry.name.toUpperCase();
    if (filterCountry && country !== filterCountry.toUpperCase()) continue;

    const countryDir = path.join(baseDir, entry.name);
    const files = fs.readdirSync(countryDir);

    // Group by specimen number (e.g., front_01, back_01, ground_truth_01)
    const specimenIds = new Set<string>();
    for (const file of files) {
      const match = file.match(/(?:front|back|ground_truth)_(\d+)/i);
      if (match) specimenIds.add(match[1]);
    }

    for (const id of specimenIds) {
      const frontFile = files.find(f => new RegExp(`front_${id}`, 'i').test(f));
      const backFile = files.find(f => new RegExp(`back_${id}`, 'i').test(f));
      const gtFile = files.find(f => new RegExp(`ground_truth_${id}\\.json`, 'i').test(f));

      specimens.push({
        id: `${country}/${id}`,
        country,
        frontPath: frontFile ? path.join(countryDir, frontFile) : null,
        backPath: backFile ? path.join(countryDir, backFile) : null,
        groundTruthPath: gtFile ? path.join(countryDir, gtFile) : null,
      });
    }
  }

  return specimens.sort((a, b) => a.id.localeCompare(b.id));
}

// ── Field comparison ─────────────────────────────────────────

function compareFields(
  groundTruth: GroundTruth,
  extracted: Record<string, unknown>,
): FieldMetric[] {
  const metrics: FieldMetric[] = [];

  const fieldMap: Array<{ gt: keyof GroundTruth; ocr: string[] }> = [
    { gt: 'full_name', ocr: ['full_name', 'name'] },
    { gt: 'date_of_birth', ocr: ['date_of_birth'] },
    { gt: 'document_number', ocr: ['document_number', 'id_number'] },
    { gt: 'expiry_date', ocr: ['expiry_date', 'expiration_date'] },
    { gt: 'nationality', ocr: ['nationality'] },
    { gt: 'address', ocr: ['address'] },
    { gt: 'sex', ocr: ['sex'] },
  ];

  for (const { gt, ocr } of fieldMap) {
    const expected = groundTruth[gt];
    if (!expected) continue;

    let extractedValue = '';
    for (const key of ocr) {
      if (extracted[key] && typeof extracted[key] === 'string') {
        extractedValue = extracted[key] as string;
        break;
      }
    }

    metrics.push({
      field: gt,
      expected: String(expected),
      extracted: extractedValue,
      exact_match: expected.toLowerCase().trim() === extractedValue.toLowerCase().trim(),
      levenshtein_distance: normalizedLevenshtein(String(expected), extractedValue),
    });
  }

  return metrics;
}

// ── Main ─────────────────────────────────────────────────────

async function main() {
  const specimensDir = args['specimens-dir'] as string;
  const filterCountry = args.country as string | undefined;

  if (!fs.existsSync(specimensDir)) {
    console.error(`Specimens directory not found: ${specimensDir}`);
    process.exit(1);
  }

  console.log('Loading OCR providers...');
  const { PaddleOCRProvider, BarcodeService, crossValidate } = await loadProviders();
  const ocrProvider = new PaddleOCRProvider();
  const barcodeService = BarcodeService ? new BarcodeService() : null;

  const specimens = discoverSpecimens(specimensDir, filterCountry);
  console.log(`Found ${specimens.length} specimen(s)\n`);

  if (specimens.length === 0) {
    console.log('No specimens found. Expected layout:');
    console.log('  specimens/US/front_01.jpg');
    console.log('  specimens/US/back_01.jpg');
    console.log('  specimens/US/ground_truth_01.json');
    process.exit(0);
  }

  const results: SpecimenResult[] = [];

  for (const specimen of specimens) {
    console.log(`\n── Processing ${specimen.id} ──`);
    const start = Date.now();
    const errors: string[] = [];
    let frontProcessed = false;
    let backProcessed = false;
    let crossValidated = false;
    let fieldMetrics: FieldMetric[] = [];

    // Load ground truth if available
    let groundTruth: GroundTruth | null = null;
    if (specimen.groundTruthPath) {
      try {
        groundTruth = JSON.parse(fs.readFileSync(specimen.groundTruthPath, 'utf-8'));
      } catch (e) {
        errors.push(`Failed to load ground truth: ${e}`);
      }
    }

    const docType = groundTruth?.document_type || 'drivers_license';

    // Process front
    let frontResult: any = null;
    if (specimen.frontPath) {
      try {
        const buffer = fs.readFileSync(specimen.frontPath);
        const ocrData = await ocrProvider.processDocument(buffer, docType, specimen.country);
        frontResult = {
          ocr: {
            full_name: ocrData.name || '',
            date_of_birth: ocrData.date_of_birth || '',
            id_number: ocrData.document_number || '',
            expiry_date: ocrData.expiration_date || '',
            nationality: ocrData.nationality || '',
            ...ocrData,
          },
          face_embedding: null,
          face_confidence: 0,
          ocr_confidence: 0.5,
          mrz_from_front: null,
        };
        frontProcessed = true;
        console.log(`  Front: extracted ${Object.keys(ocrData).filter(k => k !== 'raw_text' && k !== 'confidence_scores' && ocrData[k as keyof typeof ocrData]).length} fields`);
      } catch (e) {
        errors.push(`Front OCR failed: ${e}`);
        console.log(`  Front: FAILED - ${e}`);
      }
    }

    // Process back
    let backResult: any = null;
    if (specimen.backPath && barcodeService) {
      try {
        const barcodeData = await barcodeService.scanBackOfId(specimen.backPath);
        const qrPayload = barcodeData?.pdf417_data?.parsed_data ? {
          first_name: barcodeData.pdf417_data.parsed_data.firstName || '',
          last_name: barcodeData.pdf417_data.parsed_data.lastName || '',
          full_name: [barcodeData.pdf417_data.parsed_data.firstName, barcodeData.pdf417_data.parsed_data.lastName].filter(Boolean).join(' '),
          date_of_birth: barcodeData.pdf417_data.parsed_data.dateOfBirth || '',
          id_number: barcodeData.pdf417_data.parsed_data.licenseNumber || '',
          expiry_date: barcodeData.pdf417_data.parsed_data.expirationDate || '',
          nationality: '',
        } : null;

        backResult = {
          qr_payload: qrPayload,
          mrz_result: null,
          barcode_format: barcodeData?.pdf417_data ? 'PDF417' : null,
          raw_barcode_data: null,
        };
        backProcessed = !!qrPayload;
        console.log(`  Back: ${qrPayload ? 'barcode decoded' : 'no barcode data'}`);
      } catch (e) {
        errors.push(`Back scan failed: ${e}`);
        console.log(`  Back: FAILED - ${e}`);
      }
    }

    // Cross-validate
    if (frontResult && backResult) {
      try {
        const cvResult = crossValidate(frontResult, backResult);
        crossValidated = true;
        console.log(`  Cross-validation: ${cvResult.verdict} (score: ${cvResult.overall_score})`);
      } catch (e) {
        errors.push(`Cross-validation failed: ${e}`);
      }
    }

    // Compare against ground truth
    if (groundTruth && frontResult) {
      fieldMetrics = compareFields(groundTruth, frontResult.ocr);
      const matched = fieldMetrics.filter(m => m.exact_match).length;
      console.log(`  Ground truth: ${matched}/${fieldMetrics.length} exact matches`);
      for (const m of fieldMetrics) {
        const icon = m.exact_match ? '  +' : '  -';
        console.log(`    ${icon} ${m.field}: expected="${m.expected}" got="${m.extracted}" (lev=${m.levenshtein_distance.toFixed(3)})`);
      }
    }

    results.push({
      specimen_id: specimen.id,
      country: specimen.country,
      front_processed: frontProcessed,
      back_processed: backProcessed,
      cross_validated: crossValidated,
      field_metrics: fieldMetrics,
      processing_time_ms: Date.now() - start,
      errors,
    });
  }

  // ── Summary ──
  const summary = buildSummary(results);
  console.log('\n\n════════════════════════════════════════════');
  console.log('           BENCHMARK SUMMARY');
  console.log('════════════════════════════════════════════');
  console.log(`Total specimens:        ${summary.total_specimens}`);
  console.log(`Front extraction rate:  ${(summary.front_extraction_rate * 100).toFixed(1)}%`);
  console.log(`Back decode rate:       ${(summary.back_decode_rate * 100).toFixed(1)}%`);
  console.log(`Cross-validation rate:  ${(summary.cross_validation_rate * 100).toFixed(1)}%`);
  console.log(`Avg processing time:    ${summary.avg_processing_time_ms.toFixed(0)}ms`);
  console.log('\nField Accuracy:');
  for (const [field, stats] of Object.entries(summary.field_accuracy)) {
    console.log(`  ${field.padEnd(20)} exact: ${(stats.exact_match_rate * 100).toFixed(1)}%  avg_lev: ${stats.avg_levenshtein.toFixed(3)}  (n=${stats.count})`);
  }
  console.log('════════════════════════════════════════════\n');
}

function buildSummary(results: SpecimenResult[]): BenchmarkSummary {
  const total = results.length;
  const frontCount = results.filter(r => r.front_processed).length;
  const backCount = results.filter(r => r.back_processed).length;
  const cvCount = results.filter(r => r.cross_validated).length;
  const totalTime = results.reduce((sum, r) => sum + r.processing_time_ms, 0);

  // Aggregate field accuracy
  const fieldAcc: Record<string, { exact: number; levSum: number; count: number }> = {};
  for (const r of results) {
    for (const m of r.field_metrics) {
      if (!fieldAcc[m.field]) fieldAcc[m.field] = { exact: 0, levSum: 0, count: 0 };
      fieldAcc[m.field].count++;
      if (m.exact_match) fieldAcc[m.field].exact++;
      fieldAcc[m.field].levSum += m.levenshtein_distance;
    }
  }

  const fieldAccuracy: Record<string, { exact_match_rate: number; avg_levenshtein: number; count: number }> = {};
  for (const [field, stats] of Object.entries(fieldAcc)) {
    fieldAccuracy[field] = {
      exact_match_rate: stats.count > 0 ? stats.exact / stats.count : 0,
      avg_levenshtein: stats.count > 0 ? stats.levSum / stats.count : 0,
      count: stats.count,
    };
  }

  return {
    total_specimens: total,
    front_extraction_rate: total > 0 ? frontCount / total : 0,
    back_decode_rate: total > 0 ? backCount / total : 0,
    cross_validation_rate: total > 0 ? cvCount / total : 0,
    field_accuracy: fieldAccuracy,
    avg_processing_time_ms: total > 0 ? totalTime / total : 0,
    specimens: results,
  };
}

main().catch(err => {
  console.error('Benchmark failed:', err);
  process.exit(1);
});
