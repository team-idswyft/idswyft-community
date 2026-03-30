/**
 * Deepfake Detection Factory
 *
 * Provides a singleton OnnxDeepfakeDetector instance.
 * Uses lazy initialization -- the model only loads on first use.
 */

import { OnnxDeepfakeDetector } from './OnnxDeepfakeDetector.js';

export type { DeepfakeDetectionResult, BoundingBox } from './OnnxDeepfakeDetector.js';

let instance: OnnxDeepfakeDetector | null = null;

/**
 * Get the singleton deepfake detector instance.
 * The model is lazily loaded on first `detect()` call.
 */
export function createDeepfakeDetector(): OnnxDeepfakeDetector {
  if (!instance) {
    instance = new OnnxDeepfakeDetector();
  }
  return instance;
}
