/**
 * Voice Recognition — Transcribes spoken digits via sherpa-onnx-node.
 *
 * Model: NeMo CTC Conformer small (int8 quantized, ~44MB)
 * Input:  16kHz mono Float32Array (from audioDecoder)
 * Output: Transcribed text string
 *
 * CTC (Connectionist Temporal Classification) models classify each audio frame
 * independently — they cannot hallucinate words absent from the audio, unlike
 * autoregressive models (Whisper) which generate tokens sequentially and can
 * "fill in" plausible English on short utterances like isolated digits.
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

  const ctcDir = process.env.VOICE_ASR_MODEL_DIR
    || path.join(VOICE_MODELS_DIR, 'sherpa-onnx-nemo-ctc-en-conformer-small');

  logger.info('Loading ASR model (NeMo CTC Conformer)', { modelDir: ctcDir });

  recognizer = new sherpaOnnx.OfflineRecognizer({
    featConfig: { sampleRate: 16000, featureDim: 80 },
    modelConfig: {
      nemoCtc: { model: path.join(ctcDir, 'model.int8.onnx') },
      tokens: path.join(ctcDir, 'tokens.txt'),
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
