import { LivenessProvider } from '../types.js';
import { logger } from '@/utils/logger.js';

/**
 * EnhancedHeuristicProvider — Multi-signal anti-spoofing liveness detection.
 *
 * Analyzes 8 independent signals from the image buffer to distinguish
 * real camera photos from screenshots, printed photos, and digital fakes.
 * Each signal produces a sub-score (0-1) that is combined via weighted average.
 *
 * Signals:
 *  1. File size heuristic — screens/prints cluster at specific sizes
 *  2. Byte entropy — natural photos have entropy > 7.0 bits/byte
 *  3. Pixel variance — natural texture/lighting variance > 1000
 *  4. EXIF metadata — real cameras embed focal length, aperture, etc.
 *  5. JPEG compression artifacts — screen-captured photos have different DCT patterns
 *  6. Color histogram analysis — screens show saturated, bimodal distributions
 *  7. Edge density / moire detection — re-photographed screens produce moire
 *  8. Aspect ratio check — camera sensors vs cropped screenshots differ
 */
export class EnhancedHeuristicProvider implements LivenessProvider {
  readonly name = 'enhanced-heuristic';

  /** Signal weights — sum to 1.0 */
  private readonly weights = {
    fileSize: 0.08,
    entropy: 0.12,
    pixelVariance: 0.10,
    exif: 0.20,
    jpegArtifacts: 0.15,
    colorHistogram: 0.15,
    edgeDensity: 0.10,
    aspectRatio: 0.10,
  };

  async assessLiveness(imageData: {
    buffer: Buffer;
    width?: number;
    height?: number;
    pixelData?: number[];
  }): Promise<number> {
    const { buffer, width, height, pixelData } = imageData;

    if (!buffer || buffer.length === 0) {
      logger.warn('EnhancedHeuristicProvider: empty buffer');
      return 0;
    }

    // If dimensions not provided, try to extract from buffer metadata
    let resolvedWidth = width;
    let resolvedHeight = height;
    if (!resolvedWidth || !resolvedHeight) {
      try {
        const sharp = (await import('sharp')).default;
        const meta = await sharp(buffer).metadata();
        resolvedWidth = meta.width;
        resolvedHeight = meta.height;
      } catch {
        // sharp unavailable or corrupt image — proceed without dimensions
      }
    }

    // Gather all signal scores in parallel where possible
    const [
      fileSizeScore,
      entropyScore,
      pixelVarianceScore,
      exifScore,
      jpegScore,
      colorScore,
      edgeScore,
      aspectScore,
    ] = await Promise.all([
      this.scoreFileSize(buffer),
      this.scoreEntropy(buffer),
      this.scorePixelVariance(pixelData),
      this.scoreExifMetadata(buffer),
      this.scoreJpegCompression(buffer),
      this.scoreColorHistogram(buffer),
      this.scoreEdgeDensity(buffer),
      this.scoreAspectRatio(buffer, resolvedWidth, resolvedHeight),
    ]);

    const signals = {
      fileSize: fileSizeScore,
      entropy: entropyScore,
      pixelVariance: pixelVarianceScore,
      exif: exifScore,
      jpegArtifacts: jpegScore,
      colorHistogram: colorScore,
      edgeDensity: edgeScore,
      aspectRatio: aspectScore,
    };

    // Weighted average
    let weightedSum = 0;
    let totalWeight = 0;
    for (const [key, score] of Object.entries(signals)) {
      const weight = this.weights[key as keyof typeof this.weights];
      weightedSum += score * weight;
      totalWeight += weight;
    }

    const finalScore = Math.max(0, Math.min(1, weightedSum / totalWeight));

    logger.info('EnhancedHeuristicProvider: liveness assessment', {
      signals,
      finalScore: finalScore.toFixed(3),
    });

    return finalScore;
  }

  // ── Signal 1: File Size ──────────────────────────────────────────

  private async scoreFileSize(buffer: Buffer): Promise<number> {
    const sizeKb = buffer.length / 1024;

    // Tiny images are almost certainly not real camera photos
    if (sizeKb < 5) return 0.1;
    if (sizeKb < 15) return 0.3;
    // Screenshots tend to be 20-100KB for faces
    if (sizeKb < 30) return 0.5;
    // Real camera photos are typically 50KB-5MB
    if (sizeKb < 100) return 0.6;
    if (sizeKb < 500) return 0.75;
    if (sizeKb < 3000) return 0.9;
    // Very large files are consistent with high-res camera photos
    return 0.85;
  }

  // ── Signal 2: Byte Entropy ───────────────────────────────────────

  private async scoreEntropy(buffer: Buffer): Promise<number> {
    const entropy = this.computeByteEntropy(buffer);

    // Natural photos have high entropy (7.0-8.0 bits/byte)
    // Flat/synthetic images have lower entropy
    if (entropy >= 7.5) return 0.95;
    if (entropy >= 7.0) return 0.8;
    if (entropy >= 6.5) return 0.6;
    if (entropy >= 5.5) return 0.4;
    if (entropy >= 4.0) return 0.25;
    return 0.1;
  }

  // ── Signal 3: Pixel Variance ─────────────────────────────────────

  private async scorePixelVariance(pixelData?: number[]): Promise<number> {
    if (!pixelData || pixelData.length === 0) {
      // No pixel data available — return neutral score
      return 0.5;
    }

    const variance = this.computePixelVariance(pixelData);

    // Natural photos have high variance from texture and lighting
    if (variance > 2000) return 0.9;
    if (variance > 1000) return 0.75;
    if (variance > 500) return 0.55;
    if (variance > 200) return 0.35;
    return 0.15;
  }

  // ── Signal 4: EXIF Metadata ──────────────────────────────────────

  private async scoreExifMetadata(buffer: Buffer): Promise<number> {
    try {
      // Dynamic import — sharp is an optional dependency
      const sharp = (await import('sharp')).default;
      const metadata = await sharp(buffer).metadata();

      let score = 0.3; // Base: no EXIF = suspicious

      // Camera photos have these EXIF fields; screenshots don't
      if (metadata.exif) {
        score += 0.15; // Has EXIF block at all

        // Parse EXIF buffer for camera-specific tags
        const exifStr = metadata.exif.toString('binary');

        // Focal length — only set by real cameras
        if (exifStr.includes('FocalLength') || exifStr.includes('\x92\x0a')) {
          score += 0.15;
        }

        // Camera make/model — strong camera signal
        if (exifStr.includes('Make') || exifStr.includes('Model')) {
          score += 0.15;
        }

        // Exposure time — cameras set this, editors usually don't
        if (exifStr.includes('ExposureTime') || exifStr.includes('\x82\x9a')) {
          score += 0.1;
        }

        // Flash info
        if (exifStr.includes('Flash') || exifStr.includes('\x92\x09')) {
          score += 0.05;
        }
      }

      // Orientation tag — cameras set this for rotation
      if (metadata.orientation && metadata.orientation > 1) {
        score += 0.05;
      }

      return Math.min(1, score);
    } catch {
      // sharp not available or corrupted image — return neutral
      return 0.5;
    }
  }

  // ── Signal 5: JPEG Compression Artifacts ─────────────────────────

  private async scoreJpegCompression(buffer: Buffer): Promise<number> {
    // Check if file is JPEG (FF D8 FF magic bytes)
    const isJpeg = buffer.length >= 3 &&
      buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF;

    if (!isJpeg) {
      // PNG screenshots are common — slight penalty
      const isPng = buffer.length >= 4 &&
        buffer[0] === 0x89 && buffer[1] === 0x50 &&
        buffer[2] === 0x4E && buffer[3] === 0x47;
      return isPng ? 0.4 : 0.3;
    }

    // Analyze JPEG quantization tables for compression quality
    // Camera JPEGs use specific quantization tables; re-compressed images differ
    const quantScore = this.analyzeJpegQuantization(buffer);

    // Check for double-compression artifacts (re-photographed / re-saved images)
    // Count JPEG markers — re-saved images sometimes accumulate extra markers
    const markerCount = this.countJpegMarkers(buffer);

    // Camera JPEGs typically have 10-30 markers; heavily processed images have more
    let markerScore: number;
    if (markerCount >= 8 && markerCount <= 35) {
      markerScore = 0.8;
    } else if (markerCount < 8) {
      markerScore = 0.5; // Stripped JPEG — slightly suspicious
    } else {
      markerScore = 0.4; // Too many markers — over-processed
    }

    return (quantScore * 0.6 + markerScore * 0.4);
  }

  // ── Signal 6: Color Histogram Analysis ───────────────────────────

  private async scoreColorHistogram(buffer: Buffer): Promise<number> {
    // Sample pixels from the raw buffer (skip headers)
    // For JPEG, we sample from the compressed stream — patterns still detectable
    const sampleStart = Math.min(100, buffer.length);
    const sampleEnd = Math.min(buffer.length, 32768);
    const sample = buffer.subarray(sampleStart, sampleEnd);

    if (sample.length < 256) return 0.5;

    // Build byte-level histogram (proxy for color distribution)
    const histogram = new Uint32Array(256);
    for (let i = 0; i < sample.length; i++) {
      histogram[sample[i]]++;
    }

    // Compute histogram uniformity — natural photos have smoother distributions
    const total = sample.length;
    const expected = total / 256;

    let chiSquared = 0;
    let peakCount = 0;
    let zeroCount = 0;

    for (let i = 0; i < 256; i++) {
      const observed = histogram[i];
      chiSquared += ((observed - expected) ** 2) / expected;
      if (observed > expected * 3) peakCount++;
      if (observed === 0) zeroCount++;
    }

    // Normalize chi-squared to 0-1 range
    // Screen photos tend to have spikier distributions (bimodal)
    const normalizedChi = Math.min(chiSquared / (total * 2), 1);

    // Natural photos: moderate chi-squared (not too uniform, not too spiky)
    // Screen captures: very spiky (high chi-squared) or very uniform (synthetic)
    let score: number;
    if (normalizedChi < 0.1) {
      score = 0.4; // Too uniform — synthetic
    } else if (normalizedChi < 0.5) {
      score = 0.8; // Natural distribution
    } else if (normalizedChi < 0.8) {
      score = 0.6; // Somewhat spiky
    } else {
      score = 0.35; // Very spiky — likely screen capture
    }

    // Penalize if too many zero or peak bins
    if (zeroCount > 100) score -= 0.1;
    if (peakCount > 20) score -= 0.1;

    return Math.max(0, Math.min(1, score));
  }

  // ── Signal 7: Edge Density / Moire Detection ────────────────────

  private async scoreEdgeDensity(buffer: Buffer): Promise<number> {
    // Moire patterns from re-photographing a screen produce regular
    // high-frequency patterns. We detect this via byte-level autocorrelation.
    const sampleStart = Math.min(200, buffer.length);
    const sampleSize = Math.min(8192, buffer.length - sampleStart);

    if (sampleSize < 512) return 0.5;

    const sample = buffer.subarray(sampleStart, sampleStart + sampleSize);

    // Compute local differences (proxy for edge density)
    let edgeSum = 0;
    let edgeCount = 0;
    for (let i = 1; i < sample.length; i++) {
      edgeSum += Math.abs(sample[i] - sample[i - 1]);
      edgeCount++;
    }
    const avgEdge = edgeSum / edgeCount;

    // Check for periodic patterns (moire indicator)
    // Autocorrelation at small lags — moire produces peaks at regular intervals
    const moireScore = this.detectMoirePattern(sample);

    // Natural photos: moderate edge density, low periodic patterns
    let edgeScore: number;
    if (avgEdge > 80) {
      edgeScore = 0.3; // Very noisy — could be moire or over-sharpened
    } else if (avgEdge > 40) {
      edgeScore = 0.8; // Natural edge density
    } else if (avgEdge > 15) {
      edgeScore = 0.65; // Low edges — possibly blurry or flat
    } else {
      edgeScore = 0.3; // Very flat — synthetic or heavily compressed
    }

    // Penalize if moire detected
    if (moireScore > 0.6) {
      edgeScore -= 0.2;
    }

    return Math.max(0, Math.min(1, edgeScore));
  }

  // ── Signal 8: Aspect Ratio ───────────────────────────────────────

  private async scoreAspectRatio(
    buffer: Buffer,
    width?: number,
    height?: number,
  ): Promise<number> {
    let w = width;
    let h = height;

    // Try to get dimensions from sharp if not provided
    if (!w || !h) {
      try {
        const sharp = (await import('sharp')).default;
        const meta = await sharp(buffer).metadata();
        w = meta.width;
        h = meta.height;
      } catch {
        return 0.5; // Can't determine — neutral
      }
    }

    if (!w || !h) return 0.5;

    const ratio = w / h;

    // Common camera aspect ratios: 4:3 (1.333), 3:2 (1.5), 16:9 (1.778)
    // Phone selfie cameras are typically 4:3 or 3:2
    const cameraRatios = [
      { ratio: 4 / 3, label: '4:3' },
      { ratio: 3 / 2, label: '3:2' },
      { ratio: 16 / 9, label: '16:9' },
      { ratio: 3 / 4, label: '3:4 portrait' },
      { ratio: 2 / 3, label: '2:3 portrait' },
      { ratio: 9 / 16, label: '9:16 portrait' },
      { ratio: 1, label: '1:1 square' },
    ];

    // Find closest standard ratio
    let minDist = Infinity;
    for (const cam of cameraRatios) {
      const dist = Math.abs(ratio - cam.ratio);
      if (dist < minDist) minDist = dist;
    }

    // Close to a standard camera ratio = good
    if (minDist < 0.02) return 0.85;
    if (minDist < 0.05) return 0.7;
    if (minDist < 0.15) return 0.55;

    // Unusual ratios: cropped screenshots, edited images
    return 0.35;

  }

  // ── Helper: Byte Entropy ─────────────────────────────────────────

  private computeByteEntropy(buffer: Buffer): number {
    const freq = new Float64Array(256).fill(0);
    const sampleSize = Math.min(buffer.length, 16384);
    const step = Math.max(1, Math.floor(buffer.length / sampleSize));

    for (let i = 0; i < buffer.length; i += step) freq[buffer[i]]++;

    const total = freq.reduce((a, b) => a + b, 0) || 1;
    let entropy = 0;
    for (const f of freq) {
      if (f > 0) {
        const p = f / total;
        entropy -= p * Math.log2(p);
      }
    }
    return entropy;
  }

  // ── Helper: Pixel Variance ───────────────────────────────────────

  private computePixelVariance(pixels: number[]): number {
    const n = pixels.length;
    if (n === 0) return 0;
    const mean = pixels.reduce((a, b) => a + b, 0) / n;
    return pixels.reduce((sum, p) => sum + (p - mean) ** 2, 0) / n;
  }

  // ── Helper: JPEG Quantization Analysis ───────────────────────────

  private analyzeJpegQuantization(buffer: Buffer): number {
    // Look for DQT marker (FF DB) — defines quantization tables
    let dqtCount = 0;
    let totalQValue = 0;
    let qValueCount = 0;

    for (let i = 0; i < buffer.length - 1; i++) {
      if (buffer[i] === 0xFF && buffer[i + 1] === 0xDB) {
        dqtCount++;
        // Sample quantization values after the marker
        const tableStart = i + 5; // Skip marker (2) + length (2) + precision/id (1)
        const tableEnd = Math.min(tableStart + 64, buffer.length);
        for (let j = tableStart; j < tableEnd; j++) {
          totalQValue += buffer[j];
          qValueCount++;
        }
      }
    }

    if (dqtCount === 0) return 0.5; // No quant tables — not standard JPEG

    const avgQValue = qValueCount > 0 ? totalQValue / qValueCount : 50;

    // Low quantization values = high quality (camera default)
    // High quantization values = heavy compression (re-saves, screenshots saved as JPEG)
    if (avgQValue < 10) return 0.9;  // Very high quality — likely camera
    if (avgQValue < 30) return 0.75; // Good quality
    if (avgQValue < 60) return 0.55; // Moderate — could be re-saved
    if (avgQValue < 100) return 0.4; // Heavy compression
    return 0.3; // Very heavy — likely multiple re-compressions
  }

  // ── Helper: Count JPEG Markers ───────────────────────────────────

  private countJpegMarkers(buffer: Buffer): number {
    let count = 0;
    for (let i = 0; i < buffer.length - 1; i++) {
      if (buffer[i] === 0xFF && buffer[i + 1] !== 0x00 && buffer[i + 1] !== 0xFF) {
        count++;
      }
    }
    return count;
  }

  // ── Helper: Moire Pattern Detection ──────────────────────────────

  private detectMoirePattern(sample: Uint8Array): number {
    // Simple autocorrelation at small lags to detect periodic patterns
    // Moire from screen re-photography produces peaks at regular intervals
    const n = sample.length;
    if (n < 128) return 0;

    // Compute mean
    let mean = 0;
    for (let i = 0; i < n; i++) mean += sample[i];
    mean /= n;

    // Autocorrelation at lag 0 (normalization)
    let r0 = 0;
    for (let i = 0; i < n; i++) r0 += (sample[i] - mean) ** 2;
    if (r0 === 0) return 0;

    // Check lags 2-20 for periodic peaks (rise-then-fall detection)
    let peakCount = 0;
    let prevCorr = 0;
    let wasRising = false;

    for (let lag = 2; lag <= Math.min(20, n - 1); lag++) {
      let rk = 0;
      for (let i = 0; i < n - lag; i++) {
        rk += (sample[i] - mean) * (sample[i + lag] - mean);
      }
      const corr = rk / r0;

      // True peak detection: correlation was rising, now falling
      if (corr > prevCorr) {
        wasRising = true;
      } else if (wasRising && prevCorr > 0.15) {
        // Previous point was a peak (rose then fell, and was significant)
        peakCount++;
        wasRising = false;
      }
      prevCorr = corr;
    }

    // Multiple autocorrelation peaks = periodic pattern = moire
    if (peakCount >= 4) return 0.9;
    if (peakCount >= 2) return 0.6;
    if (peakCount >= 1) return 0.3;
    return 0.1;
  }
}
