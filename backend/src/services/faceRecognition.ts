/**
 * Face Recognition Service — powered by @vladmandic/face-api.
 *
 * Detects faces and produces 128-d embeddings that downstream
 * cosine-similarity logic (faceMatchService.ts) uses for face matching.
 *
 * Image decoding uses `canvas` (preferred, available in Docker) or
 * `sharp` as fallback. If neither is available, detection gracefully
 * returns no face so gate evaluation handles it.
 */

import * as faceapi from '@vladmandic/face-api';
import { StorageService } from './storage.js';
import { logger } from '@/utils/logger.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MODELS_DIR = path.resolve(__dirname, '../../models');

// ─── Optional image-decoding backends ────────────────────────────

let canvasModule: any = null;
let sharpModule: any = null;

try {
  canvasModule = await import('canvas');
} catch {
  // canvas not available (e.g. Windows dev without Cairo)
}

if (!canvasModule) {
  try {
    sharpModule = (await import('sharp')).default;
  } catch {
    // sharp not available either
  }
}

// ─── Helpers ─────────────────────────────────────────────────────

/** Decode an image Buffer into a tensor3d [H, W, 3]. */
async function bufferToTensor(buffer: Buffer): Promise<faceapi.tf.Tensor3D> {
  // Prefer canvas — vladmandic/face-api works best with it
  if (canvasModule) {
    const img = await canvasModule.loadImage(buffer);
    const canvas = canvasModule.createCanvas(img.width, img.height);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const imageData = ctx.getImageData(0, 0, img.width, img.height);
    // imageData.data is RGBA Uint8ClampedArray — extract RGB
    const { data, width, height } = imageData;
    const rgb = new Float32Array(width * height * 3);
    for (let i = 0, j = 0; i < data.length; i += 4, j += 3) {
      rgb[j] = data[i];       // R
      rgb[j + 1] = data[i + 1]; // G
      rgb[j + 2] = data[i + 2]; // B
    }
    return faceapi.tf.tensor3d(rgb, [height, width, 3]);
  }

  // Fallback: sharp (available via optionalDependencies)
  if (sharpModule) {
    const { data, info } = await sharpModule(buffer)
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const float = new Float32Array(data.length);
    for (let i = 0; i < data.length; i++) float[i] = data[i];
    return faceapi.tf.tensor3d(float, [info.height, info.width, 3]);
  }

  throw new Error('No image decoder available (install canvas or sharp)');
}

// ─── Service ─────────────────────────────────────────────────────

export interface FaceDetectionResult {
  confidence: number;
  embedding: number[] | null;
}

export class FaceRecognitionService {
  private storageService: StorageService;
  private initialized = false;
  private initPromise: Promise<void> | null = null;

  constructor() {
    this.storageService = new StorageService();
  }

  /** Load vladmandic models (lazy, once). */
  async initialize(): Promise<void> {
    if (this.initialized) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      try {
        // Monkey-patch canvas environment if available
        if (canvasModule) {
          const { Canvas, Image, ImageData } = canvasModule;
          faceapi.env.monkeyPatch({ Canvas, Image, ImageData } as any);
        }

        await faceapi.nets.ssdMobilenetv1.loadFromDisk(MODELS_DIR);
        await faceapi.nets.faceLandmark68Net.loadFromDisk(MODELS_DIR);
        await faceapi.nets.faceRecognitionNet.loadFromDisk(MODELS_DIR);

        this.initialized = true;
        logger.info('Face recognition models loaded (vladmandic/face-api)');
      } catch (error) {
        this.initPromise = null; // allow retry
        logger.error('Failed to load face recognition models', {
          error: error instanceof Error ? error.message : String(error),
          modelsDir: MODELS_DIR,
        });
        throw error;
      }
    })();

    return this.initPromise;
  }

  /**
   * Detect a face in an image stored at `storagePath`.
   * Returns confidence (0–1) and a 128-d embedding, or null if no face found.
   */
  async detectFace(storagePath: string): Promise<FaceDetectionResult> {
    try {
      await this.initialize();

      const buffer = await this.storageService.downloadFile(storagePath);
      const tensor = await bufferToTensor(buffer);

      try {
        const result = await faceapi
          .detectSingleFace(tensor as any, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.3 }))
          .withFaceLandmarks()
          .withFaceDescriptor();

        if (!result) {
          logger.info('No face detected in image', { path: storagePath });
          return { confidence: 0, embedding: null };
        }

        const embedding = Array.from(result.descriptor); // Float32Array → number[]
        const confidence = result.detection.score;

        logger.info('Face detected', {
          path: storagePath,
          confidence: confidence.toFixed(3),
          embeddingDim: embedding.length,
        });

        return { confidence, embedding };
      } finally {
        tensor.dispose();
      }
    } catch (error) {
      logger.error('Face detection failed', {
        path: storagePath,
        error: error instanceof Error ? error.message : String(error),
      });
      return { confidence: 0, embedding: null };
    }
  }

  /**
   * @deprecated Use detectFace() instead. Kept for backward compatibility
   * with tests that reference this method.
   */
  async detectFacePresence(storagePath: string): Promise<number> {
    const result = await this.detectFace(storagePath);
    return result.confidence;
  }
}
