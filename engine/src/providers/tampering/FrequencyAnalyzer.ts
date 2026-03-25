/**
 * Pure-JS 2D FFT for GAN/AI-generated document artifact detection.
 *
 * GANs produce characteristic spectral fingerprints: periodic peaks from
 * upsampling layers (checkerboard artifacts) and abnormal high-frequency
 * energy ratios from neural-network texture synthesis.
 *
 * Uses radix-2 Cooley-Tukey FFT — O(N log N) per row/column.
 * Operates on grayscale pixels only; center-crops to max 1024×1024.
 */

import { logger } from '@/utils/logger.js';

export interface FrequencyAnalysisResult {
  /** 0 = likely AI-generated, 1 = likely real photo */
  ganScore: number;
  /** Ratio of high-frequency energy to total energy */
  spectralEnergyRatio: number;
  /** Detected anomaly types */
  spectralAnomalies: string[];
}

export class FrequencyAnalyzer {
  /** Max dimension (power of 2) — keeps inference under ~100ms */
  private static readonly MAX_DIM = 1024;

  /**
   * Analyze grayscale pixel buffer for GAN artifacts.
   * @param grayscalePixels  Raw 8-bit grayscale pixel data
   * @param width            Image width in pixels
   * @param height           Image height in pixels
   */
  async analyze(
    grayscalePixels: Buffer,
    width: number,
    height: number,
  ): Promise<FrequencyAnalysisResult> {
    try {
      // Pad to next power of 2 (required by radix-2 FFT)
      const n = Math.min(
        FrequencyAnalyzer.nextPow2(Math.min(width, FrequencyAnalyzer.MAX_DIM)),
        FrequencyAnalyzer.nextPow2(Math.min(height, FrequencyAnalyzer.MAX_DIM)),
      );

      // Center-crop and convert to Float64 for FFT precision
      const pixels = this.centerCropToSquare(grayscalePixels, width, height, n);

      // Run 2D FFT (row-then-column decomposition)
      const { magnitudes } = this.fft2d(pixels, n, n);

      // Shift zero-frequency to center (standard spectral analysis layout)
      const shifted = this.fftShift(magnitudes, n, n);

      // Compute spectral features
      const energyRatio = this.computeSpectralEnergyRatio(shifted, n);
      const anomalies = this.detectSpectralAnomalies(shifted, n, energyRatio);

      // Score: real photos have moderate high-freq energy and no periodic peaks
      let ganScore = 1.0;
      if (anomalies.includes('PERIODIC_PEAKS')) ganScore -= 0.40;
      if (anomalies.includes('HIGH_FREQ_EXCESS')) ganScore -= 0.25;
      if (anomalies.includes('LOW_FREQ_DEFICIT')) ganScore -= 0.20;
      if (anomalies.includes('SPECTRAL_SYMMETRY')) ganScore -= 0.15;
      ganScore = Math.max(0, Math.min(1, ganScore));

      return { ganScore, spectralEnergyRatio: energyRatio, spectralAnomalies: anomalies };
    } catch (err) {
      logger.warn('FrequencyAnalyzer failed, returning neutral score', {
        error: err instanceof Error ? err.message : 'Unknown',
      });
      return { ganScore: 0.5, spectralEnergyRatio: 0.5, spectralAnomalies: ['ANALYSIS_FAILED'] };
    }
  }

  // ── 1D Radix-2 Cooley-Tukey FFT (in-place, iterative) ──────────────

  /**
   * In-place iterative radix-2 FFT. Length MUST be a power of 2.
   * Operates on interleaved real/imaginary Float64Arrays.
   */
  private fft1d(re: Float64Array, im: Float64Array): void {
    const n = re.length;
    // Bit-reversal permutation
    for (let i = 1, j = 0; i < n; i++) {
      let bit = n >> 1;
      while (j & bit) {
        j ^= bit;
        bit >>= 1;
      }
      j ^= bit;
      if (i < j) {
        [re[i], re[j]] = [re[j], re[i]];
        [im[i], im[j]] = [im[j], im[i]];
      }
    }

    // Butterfly stages
    for (let len = 2; len <= n; len <<= 1) {
      const halfLen = len >> 1;
      const angle = (-2 * Math.PI) / len;
      const wRe = Math.cos(angle);
      const wIm = Math.sin(angle);

      for (let i = 0; i < n; i += len) {
        let curRe = 1, curIm = 0;
        for (let j = 0; j < halfLen; j++) {
          const uRe = re[i + j];
          const uIm = im[i + j];
          const tRe = curRe * re[i + j + halfLen] - curIm * im[i + j + halfLen];
          const tIm = curRe * im[i + j + halfLen] + curIm * re[i + j + halfLen];
          re[i + j] = uRe + tRe;
          im[i + j] = uIm + tIm;
          re[i + j + halfLen] = uRe - tRe;
          im[i + j + halfLen] = uIm - tIm;
          const newCurRe = curRe * wRe - curIm * wIm;
          curIm = curRe * wIm + curIm * wRe;
          curRe = newCurRe;
        }
      }
    }
  }

  // ── 2D FFT (row-then-column decomposition) ─────────────────────────

  private fft2d(
    pixels: Float64Array,
    w: number,
    h: number,
  ): { magnitudes: Float64Array } {
    // Allocate real and imaginary grids
    const re = new Float64Array(w * h);
    const im = new Float64Array(w * h);
    re.set(pixels);

    // FFT along rows
    const rowRe = new Float64Array(w);
    const rowIm = new Float64Array(w);
    for (let y = 0; y < h; y++) {
      const offset = y * w;
      rowRe.set(re.subarray(offset, offset + w));
      rowIm.fill(0);
      this.fft1d(rowRe, rowIm);
      re.set(rowRe, offset);
      im.set(rowIm, offset);
    }

    // FFT along columns
    const colRe = new Float64Array(h);
    const colIm = new Float64Array(h);
    for (let x = 0; x < w; x++) {
      for (let y = 0; y < h; y++) {
        colRe[y] = re[y * w + x];
        colIm[y] = im[y * w + x];
      }
      this.fft1d(colRe, colIm);
      for (let y = 0; y < h; y++) {
        re[y * w + x] = colRe[y];
        im[y * w + x] = colIm[y];
      }
    }

    // Compute magnitude spectrum (log scale for better dynamic range)
    const magnitudes = new Float64Array(w * h);
    for (let i = 0; i < w * h; i++) {
      magnitudes[i] = Math.log1p(Math.sqrt(re[i] * re[i] + im[i] * im[i]));
    }

    return { magnitudes };
  }

  // ── Spectral feature extraction ────────────────────────────────────

  /**
   * Shift zero-frequency component to center of spectrum.
   * Standard for spectral visualization and radial analysis.
   */
  private fftShift(mags: Float64Array, w: number, h: number): Float64Array {
    const shifted = new Float64Array(w * h);
    const hw = w >> 1;
    const hh = h >> 1;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const sx = (x + hw) % w;
        const sy = (y + hh) % h;
        shifted[sy * w + sx] = mags[y * w + x];
      }
    }
    return shifted;
  }

  /**
   * Compute ratio of high-frequency energy to total energy.
   * Real photos: ~0.15–0.40. GAN images: often >0.45 or <0.10.
   */
  private computeSpectralEnergyRatio(shifted: Float64Array, n: number): number {
    const center = n >> 1;
    const radius = n * 0.25; // Inner 25% = low freq, outer 75% = high freq
    let totalEnergy = 0;
    let highFreqEnergy = 0;

    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const val = shifted[y * n + x];
        const energy = val * val;
        totalEnergy += energy;
        const dist = Math.sqrt((x - center) ** 2 + (y - center) ** 2);
        if (dist > radius) {
          highFreqEnergy += energy;
        }
      }
    }

    return totalEnergy > 0 ? highFreqEnergy / totalEnergy : 0;
  }

  /**
   * Detect spectral anomalies indicative of synthetic generation:
   * - PERIODIC_PEAKS: Regular spikes from GAN upsampling checkerboard
   * - HIGH_FREQ_EXCESS: Too much high-frequency energy (neural texture)
   * - LOW_FREQ_DEFICIT: Unnaturally low mid-frequency content
   * - SPECTRAL_SYMMETRY: Unnatural 4-fold symmetry from convolutional layers
   */
  private detectSpectralAnomalies(
    shifted: Float64Array,
    n: number,
    energyRatio: number,
  ): string[] {
    const anomalies: string[] = [];
    const center = n >> 1;

    // 1. High-frequency excess (GAN texture synthesis)
    if (energyRatio > 0.50) {
      anomalies.push('HIGH_FREQ_EXCESS');
    }

    // 2. Low-frequency deficit (unnatural smoothness in low-freq band)
    if (energyRatio < 0.08) {
      anomalies.push('LOW_FREQ_DEFICIT');
    }

    // 3. Periodic peaks — sample radial profile and detect spikes
    const radialBins = new Float64Array(center);
    const radialCounts = new Float64Array(center);
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const dist = Math.sqrt((x - center) ** 2 + (y - center) ** 2);
        const bin = Math.min(Math.floor(dist), center - 1);
        radialBins[bin] += shifted[y * n + x];
        radialCounts[bin]++;
      }
    }
    // Normalize bins
    for (let i = 0; i < center; i++) {
      if (radialCounts[i] > 0) radialBins[i] /= radialCounts[i];
    }

    // Detect peaks: a bin is a peak if it's >3x the mean of its neighbors
    let peakCount = 0;
    const skipDC = 3; // Skip DC component and immediate neighbors
    for (let i = skipDC; i < center - 2; i++) {
      const local = (radialBins[i - 2] + radialBins[i - 1] + radialBins[i + 1] + radialBins[i + 2]) / 4;
      if (local > 0 && radialBins[i] / local > 3.0) {
        peakCount++;
      }
    }
    if (peakCount >= 3) {
      anomalies.push('PERIODIC_PEAKS');
    }

    // 4. Spectral symmetry — compare quadrants for unnatural regularity
    let symmetryScore = 0;
    const sampleRadius = Math.floor(center * 0.6);
    let sampleCount = 0;
    for (let r = skipDC; r < sampleRadius; r += 2) {
      for (let angle = 0; angle < Math.PI / 2; angle += 0.1) {
        const x1 = Math.round(center + r * Math.cos(angle));
        const y1 = Math.round(center + r * Math.sin(angle));
        const x2 = Math.round(center - r * Math.cos(angle));
        const y2 = Math.round(center - r * Math.sin(angle));
        const x3 = Math.round(center + r * Math.sin(angle));
        const y3 = Math.round(center - r * Math.cos(angle));

        if (x1 >= 0 && x1 < n && y1 >= 0 && y1 < n &&
            x2 >= 0 && x2 < n && y2 >= 0 && y2 < n &&
            x3 >= 0 && x3 < n && y3 >= 0 && y3 < n) {
          const v1 = shifted[y1 * n + x1];
          const v2 = shifted[y2 * n + x2];
          const v3 = shifted[y3 * n + x3];
          if (v1 > 0) {
            const diff12 = Math.abs(v1 - v2) / v1;
            const diff13 = Math.abs(v1 - v3) / v1;
            symmetryScore += (diff12 < 0.05 ? 1 : 0) + (diff13 < 0.05 ? 1 : 0);
            sampleCount += 2;
          }
        }
      }
    }
    // If >80% of sampled points have near-perfect symmetry → suspicious
    if (sampleCount > 0 && symmetryScore / sampleCount > 0.80) {
      anomalies.push('SPECTRAL_SYMMETRY');
    }

    return anomalies;
  }

  // ── Helpers ────────────────────────────────────────────────────────

  /**
   * Center-crop image to a square of size `n` and convert to Float64.
   */
  private centerCropToSquare(
    pixels: Buffer,
    srcW: number,
    srcH: number,
    n: number,
  ): Float64Array {
    const result = new Float64Array(n * n);
    const startX = Math.max(0, Math.floor((srcW - n) / 2));
    const startY = Math.max(0, Math.floor((srcH - n) / 2));

    for (let y = 0; y < n; y++) {
      const srcY = Math.min(startY + y, srcH - 1);
      for (let x = 0; x < n; x++) {
        const srcX = Math.min(startX + x, srcW - 1);
        result[y * n + x] = pixels[srcY * srcW + srcX];
      }
    }
    return result;
  }

  /** Next power of 2 >= n */
  static nextPow2(n: number): number {
    let p = 1;
    while (p < n) p <<= 1;
    return p;
  }
}
