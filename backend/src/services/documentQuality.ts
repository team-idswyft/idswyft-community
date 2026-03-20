import Jimp from 'jimp';
import { statSync, readFileSync } from 'fs';
import sizeOf from 'image-size';
import { SharpTamperDetector } from '@/providers/tampering/SharpTamperDetector.js';

export interface DocumentQualityResult {
  isBlurry: boolean;
  blurScore: number;
  brightness: number;
  contrast: number;
  resolution: {
    width: number;
    height: number;
    isHighRes: boolean;
  };
  fileSize: {
    bytes: number;
    isReasonableSize: boolean;
  };
  overallQuality: 'excellent' | 'good' | 'fair' | 'poor';
  issues: string[];
  recommendations: string[];
  // Authenticity / tamper detection
  authenticityScore: number;
  tamperFlags: string[];
  isAuthentic: boolean;
  // Detailed sub-check results (from extended SharpTamperDetector)
  frequencyAnalysis?: { ganScore: number; spectralAnomalies: string[] };
  colorAnalysis?: { score: number; anomalies: string[] };
  doubleCompression?: { detected: boolean; regionVariance: number };
}

export class DocumentQualityService {
  private static readonly MIN_WIDTH = 800;
  private static readonly MIN_HEIGHT = 600;
  private static readonly MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
  private static readonly MIN_FILE_SIZE = 50 * 1024; // 50KB
  private static readonly BLUR_THRESHOLD = 100;
  private static readonly MIN_BRIGHTNESS = 50;
  private static readonly MAX_BRIGHTNESS = 200;

  static async analyzeDocument(filePath: string): Promise<DocumentQualityResult> {
    try {
      const fileStats = statSync(filePath);
      const fileSize = fileStats.size;

      // Get image dimensions using image-size (faster than loading full image)
      const dimensions = sizeOf(filePath);

      // Load image with Jimp for analysis
      const image = await Jimp.read(filePath);

      // Calculate basic image statistics
      const imageStats = this.calculateImageStats(image);

      // Calculate blur detection (simplified approach)
      const blurScore = this.calculateBlurScore(image);

      // Calculate brightness and contrast
      const brightness = imageStats.brightness;
      const contrast = imageStats.contrast;

      // Analyze resolution
      const resolution = {
        width: dimensions.width || 0,
        height: dimensions.height || 0,
        isHighRes: (dimensions.width || 0) >= this.MIN_WIDTH && (dimensions.height || 0) >= this.MIN_HEIGHT
      };

      // Analyze file size
      const fileSizeAnalysis = {
        bytes: fileSize,
        isReasonableSize: fileSize >= this.MIN_FILE_SIZE && fileSize <= this.MAX_FILE_SIZE
      };

      // Run tamper detection using Sharp ELA analysis
      const imageBuffer = readFileSync(filePath);
      const tamperDetector = new SharpTamperDetector();
      const tamperResult = await tamperDetector.analyze(imageBuffer);

      // Determine quality issues and recommendations
      const issues: string[] = [];
      const recommendations: string[] = [];

      if (blurScore < this.BLUR_THRESHOLD) {
        issues.push('Document appears blurry or out of focus');
        recommendations.push('Take a new photo with better focus and steady hands');
      }

      if (!resolution.isHighRes) {
        issues.push('Low resolution image');
        recommendations.push(`Use a higher resolution camera (minimum ${this.MIN_WIDTH}x${this.MIN_HEIGHT})`);
      }

      if (brightness < this.MIN_BRIGHTNESS) {
        issues.push('Image is too dark');
        recommendations.push('Improve lighting or increase camera exposure');
      } else if (brightness > this.MAX_BRIGHTNESS) {
        issues.push('Image is too bright/overexposed');
        recommendations.push('Reduce lighting or decrease camera exposure');
      }

      if (!fileSizeAnalysis.isReasonableSize) {
        if (fileSize < this.MIN_FILE_SIZE) {
          issues.push('File size too small - may indicate poor quality');
          recommendations.push('Use a higher quality camera setting');
        } else {
          issues.push('File size too large');
          recommendations.push('Compress the image or use a more efficient format');
        }
      }

      if (!tamperResult.isAuthentic) {
        issues.push(`Document may have been tampered with (flags: ${tamperResult.flags.join(', ')})`);
        recommendations.push('Please provide an original, unedited document photograph');
      }

      // Determine overall quality
      const overallQuality = this.determineOverallQuality(
        blurScore >= this.BLUR_THRESHOLD,
        resolution.isHighRes,
        brightness >= this.MIN_BRIGHTNESS && brightness <= this.MAX_BRIGHTNESS,
        fileSizeAnalysis.isReasonableSize,
        contrast
      );

      return {
        isBlurry: blurScore < this.BLUR_THRESHOLD,
        blurScore,
        brightness,
        contrast,
        resolution,
        fileSize: fileSizeAnalysis,
        overallQuality,
        issues,
        recommendations,
        authenticityScore: tamperResult.score,
        tamperFlags: tamperResult.flags,
        isAuthentic: tamperResult.isAuthentic,
        // Surface detailed sub-check results when available
        ...(tamperResult.details?.frequency && {
          frequencyAnalysis: {
            ganScore: tamperResult.details.frequency.ganScore,
            spectralAnomalies: tamperResult.details.frequency.spectralAnomalies,
          },
        }),
        ...(tamperResult.details?.colorAnomaly && {
          colorAnalysis: tamperResult.details.colorAnomaly,
        }),
        ...(tamperResult.details?.doubleCompression && {
          doubleCompression: tamperResult.details.doubleCompression,
        }),
      };
    } catch (error) {
      console.error('Error analyzing document quality:', error);
      throw new Error('Failed to analyze document quality');
    }
  }

  private static calculateImageStats(image: Jimp): { brightness: number; contrast: number } {
    const width = image.getWidth();
    const height = image.getHeight();

    let totalBrightness = 0;
    let pixelValues: number[] = [];

    // Sample pixels for efficiency (every 4th pixel)
    for (let y = 0; y < height; y += 4) {
      for (let x = 0; x < width; x += 4) {
        const rgba = Jimp.intToRGBA(image.getPixelColor(x, y));
        // Calculate luminance using standard formula
        const brightness = 0.299 * rgba.r + 0.587 * rgba.g + 0.114 * rgba.b;
        totalBrightness += brightness;
        pixelValues.push(brightness);
      }
    }

    const avgBrightness = totalBrightness / pixelValues.length;

    // Calculate contrast (standard deviation)
    let variance = 0;
    for (const pixel of pixelValues) {
      variance += Math.pow(pixel - avgBrightness, 2);
    }
    const contrast = Math.sqrt(variance / pixelValues.length);

    return {
      brightness: avgBrightness,
      contrast: contrast
    };
  }

  private static calculateBlurScore(image: Jimp): number {
    try {
      // Simple edge detection for blur measurement
      const width = image.getWidth();
      const height = image.getHeight();

      // Convert to grayscale for edge detection
      const grayImage = image.clone().greyscale();

      let edgeStrength = 0;
      let pixelCount = 0;

      // Apply Sobel edge detection on a subset of pixels for performance
      for (let y = 1; y < height - 1; y += 4) {
        for (let x = 1; x < width - 1; x += 4) {
          // Get surrounding pixel values
          const topLeft = Jimp.intToRGBA(grayImage.getPixelColor(x - 1, y - 1)).r;
          const topCenter = Jimp.intToRGBA(grayImage.getPixelColor(x, y - 1)).r;
          const topRight = Jimp.intToRGBA(grayImage.getPixelColor(x + 1, y - 1)).r;
          const centerLeft = Jimp.intToRGBA(grayImage.getPixelColor(x - 1, y)).r;
          const centerRight = Jimp.intToRGBA(grayImage.getPixelColor(x + 1, y)).r;
          const bottomLeft = Jimp.intToRGBA(grayImage.getPixelColor(x - 1, y + 1)).r;
          const bottomCenter = Jimp.intToRGBA(grayImage.getPixelColor(x, y + 1)).r;
          const bottomRight = Jimp.intToRGBA(grayImage.getPixelColor(x + 1, y + 1)).r;

          // Sobel X kernel
          const sobelX = (-1 * topLeft) + (1 * topRight) +
                        (-2 * centerLeft) + (2 * centerRight) +
                        (-1 * bottomLeft) + (1 * bottomRight);

          // Sobel Y kernel
          const sobelY = (-1 * topLeft) + (-2 * topCenter) + (-1 * topRight) +
                        (1 * bottomLeft) + (2 * bottomCenter) + (1 * bottomRight);

          // Calculate gradient magnitude
          const magnitude = Math.sqrt(sobelX * sobelX + sobelY * sobelY);
          edgeStrength += magnitude;
          pixelCount++;
        }
      }

      // Return average edge strength as blur score (higher = sharper)
      return pixelCount > 0 ? edgeStrength / pixelCount : 0;
    } catch (error) {
      console.error('Error calculating blur score:', error);
      return 0;
    }
  }

  private static determineOverallQuality(
    isSharp: boolean,
    isHighRes: boolean,
    isBrightnessGood: boolean,
    isSizeGood: boolean,
    contrast: number
  ): 'excellent' | 'good' | 'fair' | 'poor' {
    const qualityFactors = [
      isSharp,
      isHighRes,
      isBrightnessGood,
      isSizeGood,
      contrast > 20 // Good contrast threshold
    ];

    const goodFactors = qualityFactors.filter(Boolean).length;

    if (goodFactors === 5) return 'excellent';
    if (goodFactors >= 4) return 'good';
    if (goodFactors >= 2) return 'fair';
    return 'poor';
  }
}
