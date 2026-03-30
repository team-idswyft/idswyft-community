import sharp from 'sharp';
import { logger } from '@/utils/logger.js';
import { FrequencyAnalyzer } from './FrequencyAnalyzer.js';
import type { FrequencyAnalysisResult } from './FrequencyAnalyzer.js';

export interface TamperDetectionDetails {
  ela: { diff: number; flagged: boolean };
  entropy: { value: number; flagged: boolean };
  exif: { present: boolean; flagged: boolean };
  frequency: FrequencyAnalysisResult | null;
  colorAnomaly: { score: number; anomalies: string[] } | null;
  doubleCompression: { detected: boolean; regionVariance: number } | null;
}

export interface TamperDetectionResult {
  /** 0 = likely tampered, 1 = likely authentic */
  score: number;
  flags: string[];
  isAuthentic: boolean;
  /** Detailed per-check results for admin visibility */
  details?: TamperDetectionDetails;
}

/**
 * Document authenticity checks using Sharp (libvips) + pure-JS FFT.
 *
 * 6 checks performed:
 *  1. ELA (Error Level Analysis) -- re-encodes at 85% and measures mean pixel diff
 *  2. Low entropy -- solid-colour regions suggest digital text replacement
 *  3. EXIF presence -- missing EXIF on JPEG is a weak tamper signal
 *  4. Color histogram anomaly -- printed/digital copies have abnormal channel stats
 *  5. Enhanced double compression -- inconsistent ELA across image regions
 *  6. Frequency/GAN analysis -- spectral analysis for AI-generated artifacts
 *
 * Penalty weights (rebalanced for 6 signals):
 *   ELA: -0.25 | Entropy: -0.15 | EXIF: -0.08 | Color: -0.15 | DblComp: -0.20 | FFT: -0.25
 */
export class SharpTamperDetector {
  private frequencyAnalyzer = new FrequencyAnalyzer();

  async analyze(imageBuffer: Buffer): Promise<TamperDetectionResult> {
    const flags: string[] = [];
    let score = 1.0;
    const details: TamperDetectionDetails = {
      ela: { diff: 0, flagged: false },
      entropy: { value: 0, flagged: false },
      exif: { present: false, flagged: false },
      frequency: null,
      colorAnomaly: null,
      doubleCompression: null,
    };

    try {
      const image = sharp(imageBuffer);
      const [metadata, stats] = await Promise.all([image.metadata(), image.stats()]);

      // -- Check 1: ELA (penalty: -0.25) ----------------------------
      const reEncoded = await sharp(imageBuffer).jpeg({ quality: 85 }).toBuffer();
      const reEncodedStats = await sharp(reEncoded).stats();

      const originalMean = stats.channels.reduce((s, c) => s + c.mean, 0) / stats.channels.length;
      const reEncodedMean = reEncodedStats.channels.reduce((s, c) => s + c.mean, 0) / reEncodedStats.channels.length;
      const elaDiff = Math.abs(originalMean - reEncodedMean);
      details.ela = { diff: elaDiff, flagged: elaDiff > 15 };

      if (elaDiff > 15) {
        flags.push('HIGH_ELA_DIFFERENCE');
        score -= 0.25;
      }

      // -- Check 2: Low entropy (penalty: -0.15) -------------------
      const entropy = stats.channels.reduce((s, c) => s + c.stdev, 0) / stats.channels.length;
      details.entropy = { value: entropy, flagged: entropy < 5 };

      if (entropy < 5) {
        flags.push('LOW_ENTROPY_REGIONS');
        score -= 0.15;
      }

      // -- Check 3: Missing EXIF on JPEG (penalty: -0.08) ----------
      const hasExif = !!metadata.exif;
      const exifFlagged = !hasExif && metadata.format === 'jpeg';
      details.exif = { present: hasExif, flagged: exifFlagged };

      if (exifFlagged) {
        flags.push('MISSING_EXIF_JPEG');
        score -= 0.08;
      }

      // -- Check 4: Color histogram anomaly (penalty: -0.15) -------
      try {
        const colorResult = this.analyzeColorHistogram(stats);
        details.colorAnomaly = colorResult;

        if (colorResult.anomalies.length > 0) {
          flags.push(...colorResult.anomalies);
          score -= 0.15;
        }
      } catch {
        // Non-critical -- skip if color analysis fails
      }

      // -- Check 5: Enhanced double compression (penalty: -0.20) ---
      try {
        const dblResult = await this.detectDoubleCompression(imageBuffer, stats);
        details.doubleCompression = dblResult;

        if (dblResult.detected) {
          flags.push('DOUBLE_COMPRESSION_DETECTED');
          score -= 0.20;
        }
      } catch {
        // Non-critical -- skip if double compression check fails
      }

      // -- Check 6: Frequency/GAN analysis (penalty: -0.25) --------
      try {
        const freqResult = await this.runFrequencyAnalysis(imageBuffer);
        details.frequency = freqResult;

        if (freqResult.spectralAnomalies.length > 0 &&
            !freqResult.spectralAnomalies.includes('ANALYSIS_FAILED')) {
          flags.push('GAN_SPECTRAL_ANOMALY');
          score -= 0.25;
        }
      } catch {
        // Non-critical -- skip if FFT fails
      }

      logger.info('Tamper detection complete (6 checks)', {
        format: metadata.format,
        elaDiff: elaDiff.toFixed(2),
        entropy: entropy.toFixed(2),
        ganScore: details.frequency?.ganScore?.toFixed(2) ?? 'N/A',
        colorAnomalies: details.colorAnomaly?.anomalies?.length ?? 0,
        doubleCompression: details.doubleCompression?.detected ?? false,
        score: Math.max(0, score).toFixed(2),
        flagCount: flags.length,
      });
    } catch (err) {
      logger.warn('Tamper detection failed', { error: err instanceof Error ? err.message : 'Unknown' });
      flags.push('ANALYSIS_FAILED');
      score = 0.5; // Unknown -- neutral score
    }

    const finalScore = Math.max(0, score);
    return {
      score: finalScore,
      flags,
      isAuthentic: finalScore >= 0.7,
      details,
    };
  }

  // -- Check 4: Color histogram anomaly ----------------------------

  /**
   * Detect abnormal color channel statistics.
   *
   * Printed/scanned copies: abnormal uniformity (stdev < 20 per channel)
   * Digital copies: decorrelated RGB channels (stdev ratios far from 1.0)
   */
  private analyzeColorHistogram(stats: sharp.Stats): { score: number; anomalies: string[] } {
    const anomalies: string[] = [];
    const channels = stats.channels;

    if (channels.length < 3) {
      return { score: 1.0, anomalies: [] }; // Grayscale -- skip
    }

    const stdevs = channels.slice(0, 3).map(c => c.stdev);
    const means = channels.slice(0, 3).map(c => c.mean);

    // Check 4a: Abnormal uniformity -- all channels very low stdev
    const avgStdev = stdevs.reduce((a, b) => a + b, 0) / stdevs.length;
    if (avgStdev < 20) {
      anomalies.push('COLOR_ABNORMAL_UNIFORMITY');
    }

    // Check 4b: Channel decorrelation -- stdev ratios between channels
    // Natural photos: R/G/B stdevs are within ~3x of each other
    const maxStdev = Math.max(...stdevs);
    const minStdev = Math.min(...stdevs);
    if (minStdev > 0 && maxStdev / minStdev > 4.0) {
      anomalies.push('COLOR_CHANNEL_DECORRELATION');
    }

    // Check 4c: Unnatural mean clustering -- all channels nearly identical mean
    // (indicates desaturated/grayscale image saved as RGB)
    const meanRange = Math.max(...means) - Math.min(...means);
    if (meanRange < 3 && avgStdev > 30) {
      anomalies.push('COLOR_DESATURATED_RGB');
    }

    const colorScore = anomalies.length === 0 ? 1.0 : Math.max(0, 1 - anomalies.length * 0.3);
    return { score: colorScore, anomalies };
  }

  // -- Check 5: Enhanced double compression ------------------------

  /**
   * Detect localized editing by comparing ELA at two quality levels.
   *
   * Uniformly compressed images show consistent ELA across regions.
   * Edited images show different ELA patterns in tampered vs. original regions.
   *
   * Method: split image into a 4x4 grid, compute per-region ELA at 85% and 50%
   * quality, then measure the variance of per-region ELA diffs. High variance =
   * inconsistent compression history = localized editing.
   */
  private async detectDoubleCompression(
    imageBuffer: Buffer,
    originalStats: sharp.Stats,
  ): Promise<{ detected: boolean; regionVariance: number }> {
    const meta = await sharp(imageBuffer).metadata();
    const width = meta.width || 0;
    const height = meta.height || 0;

    if (width < 128 || height < 128) {
      return { detected: false, regionVariance: 0 }; // Too small for regional analysis
    }

    // Re-encode at two quality levels
    const [reEncoded85, reEncoded50] = await Promise.all([
      sharp(imageBuffer).jpeg({ quality: 85 }).toBuffer(),
      sharp(imageBuffer).jpeg({ quality: 50 }).toBuffer(),
    ]);

    // Compare per-region ELA: split into 4x4 grid
    const gridSize = 4;
    const regionW = Math.floor(width / gridSize);
    const regionH = Math.floor(height / gridSize);
    const regionDiffs: number[] = [];

    for (let gy = 0; gy < gridSize; gy++) {
      for (let gx = 0; gx < gridSize; gx++) {
        const left = gx * regionW;
        const top = gy * regionH;
        const extractOpts = { left, top, width: regionW, height: regionH };

        try {
          const [origRegionStats, re85RegionStats, re50RegionStats] = await Promise.all([
            sharp(imageBuffer).extract(extractOpts).stats(),
            sharp(reEncoded85).extract(extractOpts).stats(),
            sharp(reEncoded50).extract(extractOpts).stats(),
          ]);

          const origMean = origRegionStats.channels.reduce((s, c) => s + c.mean, 0) / origRegionStats.channels.length;
          const re85Mean = re85RegionStats.channels.reduce((s, c) => s + c.mean, 0) / re85RegionStats.channels.length;
          const re50Mean = re50RegionStats.channels.reduce((s, c) => s + c.mean, 0) / re50RegionStats.channels.length;

          // ELA diff ratio: how differently this region responds to recompression
          const diff85 = Math.abs(origMean - re85Mean);
          const diff50 = Math.abs(origMean - re50Mean);
          const ratio = diff50 > 0 ? diff85 / diff50 : 0;
          regionDiffs.push(ratio);
        } catch {
          // Skip unextractable regions
        }
      }
    }

    if (regionDiffs.length < 4) {
      return { detected: false, regionVariance: 0 };
    }

    // Compute variance of region diffs -- high variance = inconsistent compression
    const mean = regionDiffs.reduce((a, b) => a + b, 0) / regionDiffs.length;
    const variance = regionDiffs.reduce((s, v) => s + (v - mean) ** 2, 0) / regionDiffs.length;

    // Threshold: variance > 0.15 indicates localized editing
    const detected = variance > 0.15;

    return { detected, regionVariance: variance };
  }

  // -- Check 6: FFT frequency analysis -----------------------------

  /**
   * Run spectral analysis on grayscale version of the image.
   * Delegates to FrequencyAnalyzer for the heavy FFT math.
   */
  private async runFrequencyAnalysis(imageBuffer: Buffer): Promise<FrequencyAnalysisResult> {
    // Convert to grayscale and get raw pixels
    const image = sharp(imageBuffer).greyscale();
    const meta = await image.metadata();

    // Center-crop to max 1024x1024 before FFT (performance budget)
    const maxDim = 1024;
    let width = meta.width || 0;
    let height = meta.height || 0;

    let processedImage = sharp(imageBuffer).greyscale();
    if (width > maxDim || height > maxDim) {
      const scale = Math.min(maxDim / width, maxDim / height);
      width = Math.round(width * scale);
      height = Math.round(height * scale);
      processedImage = processedImage.resize(width, height, { fit: 'inside' });
    }

    const { data } = await processedImage.raw().toBuffer({ resolveWithObject: true });

    return this.frequencyAnalyzer.analyze(data, width, height);
  }
}
