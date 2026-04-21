/**
 * Voice Recognition — Transcribes spoken digits via sherpa-onnx-node.
 *
 * Model: Whisper tiny.en (int8 quantized, ~40MB total)
 * Input:  16kHz mono Float32Array (from audioDecoder)
 * Output: Transcribed text string
 *
 * Used for voice challenge verification — the user speaks 6 random digits
 * and this module transcribes them for comparison against the expected challenge.
 *
 * The recognizer is lazy-loaded on first call to avoid startup cost
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

// ─── Lazy-loaded recognizer singleton ────────────────────────────

let recognizer: any = null;

function getRecognizer(): any {
  if (recognizer) return recognizer;

  const sherpaOnnx = esmRequire('sherpa-onnx-node');

  const whisperDir = process.env.VOICE_ASR_MODEL_DIR
    || path.join(VOICE_MODELS_DIR, 'sherpa-onnx-whisper-tiny.en');

  const encoderPath = path.join(whisperDir, 'tiny.en-encoder.int8.onnx');
  const decoderPath = path.join(whisperDir, 'tiny.en-decoder.int8.onnx');
  const tokensPath = path.join(whisperDir, 'tiny.en-tokens.txt');

  logger.info('Loading ASR model (Whisper tiny.en)', { whisperDir });

  recognizer = new sherpaOnnx.OfflineRecognizer({
    featConfig: { sampleRate: 16000, featureDim: 80 },
    modelConfig: {
      whisper: { encoder: encoderPath, decoder: decoderPath },
      tokens: tokensPath,
      numThreads: 1,
      provider: 'cpu',
      debug: 0,
    },
  });

  logger.info('ASR model loaded');
  return recognizer;
}

// ─── Public API ──────────────────────────────────────────────────

/**
 * Transcribe audio samples to text.
 * @param samples 16kHz mono Float32Array (use audioDecoder first)
 * @param sampleRate Sample rate of the audio (default: 16000)
 * @returns Transcribed text (trimmed)
 */
export function transcribeAudio(samples: Float32Array, sampleRate = 16000): string {
  const rec = getRecognizer();
  const stream = rec.createStream();
  stream.acceptWaveform({ sampleRate, samples });
  rec.decode(stream);
  const result = rec.getResult(stream);
  return (result.text || '').trim();
}
