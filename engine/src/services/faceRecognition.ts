/**
 * Face Recognition Service — Engine Worker version.
 *
 * Same as backend version but without StorageService dependency.
 * Only buffer-based detection is used in the engine (images arrive via HTTP).
 */

// @ts-ignore — TypeScript can't resolve .js subpath types but runtime works fine
import faceapi from '@vladmandic/face-api/dist/face-api.node-wasm.js';
import { logger } from '@/utils/logger.js';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MODELS_DIR = path.resolve(__dirname, '../../models');

// ─── Optional image-decoding backends ────────────────────────────

let canvasModule: any = null;
let sharpModule: any = null;

try {
  canvasModule = await import('canvas');
} catch {
  // canvas not available
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
  if (canvasModule) {
    const img = await canvasModule.loadImage(buffer);
    const canvas = canvasModule.createCanvas(img.width, img.height);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const imageData = ctx.getImageData(0, 0, img.width, img.height);
    const { data, width, height } = imageData;
    const rgb = new Float32Array(width * height * 3);
    for (let i = 0, j = 0; i < data.length; i += 4, j += 3) {
      rgb[j] = data[i];
      rgb[j + 1] = data[i + 1];
      rgb[j + 2] = data[i + 2];
    }
    return faceapi.tf.tensor3d(rgb, [height, width, 3]);
  }

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

export interface FaceBufferDetectionResult {
  confidence: number;
  embedding: Float32Array;
  landmarks: Array<{ x: number; y: number }>;
  boundingBox: { x: number; y: number; width: number; height: number };
  age?: number;
  gender?: string;
}

export class FaceRecognitionService {
  private initialized = false;
  private initPromise: Promise<void> | null = null;

  /** Load vladmandic models (lazy, once). */
  async initialize(): Promise<void> {
    if (this.initialized) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      try {
        await this.initTfBackend();

        if (canvasModule) {
          const { Canvas, Image, ImageData } = canvasModule;
          faceapi.env.monkeyPatch({ Canvas, Image, ImageData } as any);
        }

        await faceapi.nets.ssdMobilenetv1.loadFromDisk(MODELS_DIR);
        await faceapi.nets.faceLandmark68Net.loadFromDisk(MODELS_DIR);
        await faceapi.nets.faceRecognitionNet.loadFromDisk(MODELS_DIR);
        await faceapi.nets.ageGenderNet.loadFromDisk(MODELS_DIR);

        this.initialized = true;
        const backend = (faceapi.tf as any).getBackend?.() ?? 'unknown';
        logger.info(`Face recognition models loaded (vladmandic/face-api, backend=${backend})`);
      } catch (error) {
        this.initPromise = null;
        logger.error('Failed to load face recognition models', {
          error: error instanceof Error ? error.message : String(error),
          modelsDir: MODELS_DIR,
        });
        throw error;
      }
    })();

    return this.initPromise;
  }

  private async initTfBackend(): Promise<void> {
    const tf = faceapi.tf as any;

    try {
      const require = createRequire(import.meta.url);
      const wasmBackendPath = require.resolve('@tensorflow/tfjs-backend-wasm/dist/tf-backend-wasm.node.js');
      const wasmDir = path.dirname(wasmBackendPath) + '/';

      if (typeof tf.setWasmPaths === 'function') {
        tf.setWasmPaths(wasmDir);
      } else {
        const wasmBackend = await import('@tensorflow/tfjs-backend-wasm');
        if (typeof wasmBackend.setWasmPaths === 'function') {
          wasmBackend.setWasmPaths(wasmDir);
        }
      }

      await tf.setBackend('wasm');
      await tf.ready();
      logger.info('TF.js WASM backend initialized', { wasmDir });
      return;
    } catch (wasmError) {
      logger.warn('WASM backend failed, falling back to CPU', {
        error: wasmError instanceof Error ? wasmError.message : String(wasmError),
      });
    }

    try {
      await tf.setBackend('cpu');
      await tf.ready();
      logger.info('TF.js CPU backend initialized (fallback)');
    } catch (cpuError) {
      logger.error('Both WASM and CPU backends failed', {
        error: cpuError instanceof Error ? cpuError.message : String(cpuError),
      });
      throw new Error('TF.js backend initialization failed — no usable backend');
    }
  }

  /**
   * Detect a face in an image buffer directly.
   * Returns full detection data: landmarks, bounding box, confidence, and embedding.
   */
  async detectFaceFromBuffer(buffer: Buffer): Promise<FaceBufferDetectionResult | null> {
    try {
      await this.initialize();

      const tensor = await bufferToTensor(buffer);

      try {
        const result = await faceapi
          .detectSingleFace(tensor as any, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.3 }))
          .withFaceLandmarks()
          .withFaceDescriptor()
          .withAgeAndGender();

        if (!result) return null;

        const landmarks = result.landmarks.positions.map((pt: any) => ({
          x: pt.x ?? pt._x,
          y: pt.y ?? pt._y,
        }));

        const box = result.detection.box;

        return {
          confidence: result.detection.score,
          embedding: result.descriptor,
          landmarks,
          boundingBox: {
            x: box.x,
            y: box.y,
            width: box.width,
            height: box.height,
          },
          age: result.age,
          gender: result.gender,
        };
      } finally {
        tensor.dispose();
      }
    } catch (error) {
      logger.error('Face detection from buffer failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }
}
