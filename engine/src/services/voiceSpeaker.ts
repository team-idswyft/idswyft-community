/**
 * Voice Speaker Embedding — Extracts speaker embeddings via sherpa-onnx-node.
 *
 * Model: wespeaker_en_voxceleb_CAM++_LM (Apache-2.0, ~28MB)
 * Input:  16kHz mono Float32Array (from audioDecoder)
 * Output: 512-dimensional speaker embedding (number[])
 *
 * The extractor is lazy-loaded on first call to avoid startup cost
 * when voice auth is disabled (the default).
 */

import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { logger } from '@/utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const VOICE_MODELS_DIR = path.resolve(__dirname, '../../models/voice');

const esmRequire = createRequire(import.meta.url);

// ─── Lazy-loaded extractor singleton ─────────────────────────────

let extractor: any = null;
let extractorDim = 0;

function getExtractor(): any {
  if (extractor) return extractor;

  const sherpaOnnx = esmRequire('sherpa-onnx-node');
  const modelPath = process.env.VOICE_SPEAKER_MODEL
    || path.join(VOICE_MODELS_DIR, 'wespeaker_en_voxceleb_CAM++_LM.onnx');

  logger.info('Loading speaker embedding model', { modelPath });

  extractor = new sherpaOnnx.SpeakerEmbeddingExtractor({
    model: modelPath,
    numThreads: 1,
    debug: 0,
  });
  extractorDim = extractor.dim;

  logger.info('Speaker embedding model loaded', { dim: extractorDim });
  return extractor;
}

// ─── Public API ──────────────────────────────────────────────────

/**
 * Extract a speaker embedding from audio samples.
 * @param samples 16kHz mono Float32Array (use audioDecoder first)
 * @param sampleRate Sample rate of the audio (default: 16000)
 * @returns Speaker embedding (dimension determined by model, typically 512)
 */
export function extractSpeakerEmbedding(samples: Float32Array, sampleRate = 16000): number[] {
  const ext = getExtractor();
  const stream = ext.createStream();
  stream.acceptWaveform({ sampleRate, samples });
  stream.inputFinished();

  if (!ext.isReady(stream)) {
    throw new Error('Speaker embedding extraction failed: stream not ready (audio too short?)');
  }

  const embedding: Float32Array = ext.compute(stream);
  return Array.from(embedding);
}

/** Embedding dimension (512 for wespeaker CAM++). */
export function getEmbeddingDimension(): number {
  getExtractor();
  return extractorDim;
}
