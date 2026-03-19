/**
 * generate-keyboard-fx.mjs
 *
 * Generates a synthetic mechanical keyboard typing sound track
 * synced to the CodeIntegrationScene typing timeline.
 *
 * Usage:
 *   node scripts/generate-keyboard-fx.mjs
 *
 * Output:
 *   public/narration/keyboard-typing.wav
 *
 * No dependencies — raw PCM WAV generation.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT = path.resolve(__dirname, '../public/narration/keyboard-typing.wav');

// ─── Audio parameters ──────────────────────────────────────────────────────

const SAMPLE_RATE = 22050;
const CHANNELS = 1;
const BITS = 16;
const FPS = 30;

// Scene 3 typing timeline (must match CodeIntegrationScene)
const SCENE_FRAMES = 1260;
const SCENE_DURATION = SCENE_FRAMES / FPS; // 42 seconds
const TOTAL_SAMPLES = Math.ceil(SAMPLE_RATE * SCENE_DURATION);

// Step completion thresholds (chars) and typing speed
const TYPING_SPEED = 1.0; // chars per frame
const PAUSE_FRAMES = 35;
const STEP_CHARS = [280, 520, 690, 870, 1080];

// Keyboard click rate: ~5 clicks/sec (natural spacing, human-like)
const CLICKS_PER_SECOND = 5;

// ─── Seeded random for deterministic output ────────────────────────────────

let _seed = 42;
function rand() {
  _seed = (_seed * 16807 + 0) % 2147483647;
  return (_seed - 1) / 2147483646;
}

// ─── Typing timeline (mirrors CodeIntegrationScene logic) ──────────────────

function isTypingAtFrame(frame) {
  let chars = 0;
  let f = 0;

  for (const stepChars of STEP_CHARS) {
    const needed = stepChars - chars;
    const typingFrames = Math.ceil(needed / TYPING_SPEED);

    if (frame <= f + typingFrames) return true; // typing
    f += typingFrames;
    chars = stepChars;

    if (frame <= f + PAUSE_FRAMES) return false; // paused
    f += PAUSE_FRAMES;
  }

  return frame <= f + 30; // trailing code after last step
}

// ─── Generate a single keystroke click ─────────────────────────────────────

function generateClick(buffer, startSample, amplitude) {
  // A keystroke: short noise burst (2-4ms) with fast exponential decay
  const clickDuration = Math.floor(SAMPLE_RATE * (0.002 + rand() * 0.003));
  const decayRate = 0.92 + rand() * 0.05;

  // Add a subtle low-frequency "thunk" for body
  const thunkFreq = 80 + rand() * 60;

  let env = amplitude * (0.3 + rand() * 0.4);
  for (let i = 0; i < clickDuration && startSample + i < TOTAL_SAMPLES; i++) {
    const noise = (rand() * 2 - 1) * env;
    const thunk = Math.sin(2 * Math.PI * thunkFreq * i / SAMPLE_RATE) * env * 0.5;
    const sample = noise + thunk;

    // Mix into buffer (additive)
    const idx = startSample + i;
    buffer[idx] = Math.max(-1, Math.min(1, buffer[idx] + sample));
    env *= decayRate;
  }

  // Tiny release "tick" 1-2ms after main click (mechanical key bottom-out)
  const releaseDelay = Math.floor(SAMPLE_RATE * (0.015 + rand() * 0.01));
  const releaseDuration = Math.floor(SAMPLE_RATE * 0.001);
  let releaseEnv = amplitude * 0.15;
  for (let i = 0; i < releaseDuration; i++) {
    const idx = startSample + releaseDelay + i;
    if (idx >= TOTAL_SAMPLES) break;
    const noise = (rand() * 2 - 1) * releaseEnv;
    buffer[idx] = Math.max(-1, Math.min(1, buffer[idx] + noise));
    releaseEnv *= 0.9;
  }
}

// ─── Main ──────────────────────────────────────────────────────────────────

function main() {
  console.log('Generating keyboard typing sound effects...\n');
  console.log(`Duration:    ${SCENE_DURATION}s (${SCENE_FRAMES} frames at ${FPS}fps)`);
  console.log(`Sample rate: ${SAMPLE_RATE} Hz`);
  console.log(`Click rate:  ~${CLICKS_PER_SECOND}/sec\n`);

  // Float buffer for mixing
  const buffer = new Float32Array(TOTAL_SAMPLES);

  // Generate clicks at ~10/sec during typing frames
  const clickInterval = SAMPLE_RATE / CLICKS_PER_SECOND;
  let nextClick = 0;
  let clickCount = 0;

  for (let frame = 0; frame < SCENE_FRAMES; frame++) {
    if (!isTypingAtFrame(frame)) {
      // Advance past this frame's samples without clicking
      const frameStart = Math.floor((frame / FPS) * SAMPLE_RATE);
      const frameEnd = Math.floor(((frame + 1) / FPS) * SAMPLE_RATE);
      if (nextClick < frameEnd) nextClick = frameEnd;
      continue;
    }

    const frameStart = Math.floor((frame / FPS) * SAMPLE_RATE);
    const frameEnd = Math.floor(((frame + 1) / FPS) * SAMPLE_RATE);

    while (nextClick < frameEnd) {
      if (nextClick >= frameStart && nextClick < TOTAL_SAMPLES) {
        // Vary amplitude for natural feel
        const amp = 0.12 + rand() * 0.18;
        generateClick(buffer, Math.floor(nextClick), amp);
        clickCount++;
      }
      // Add some jitter to click timing (±15%)
      nextClick += clickInterval * (0.85 + rand() * 0.3);
    }
  }

  console.log(`Generated ${clickCount} keystrokes\n`);

  // Convert float buffer to 16-bit PCM WAV
  const dataSize = TOTAL_SAMPLES * (BITS / 8);
  const wavBuffer = Buffer.alloc(44 + dataSize);

  // WAV header
  wavBuffer.write('RIFF', 0);
  wavBuffer.writeUInt32LE(36 + dataSize, 4);
  wavBuffer.write('WAVE', 8);
  wavBuffer.write('fmt ', 12);
  wavBuffer.writeUInt32LE(16, 16);           // chunk size
  wavBuffer.writeUInt16LE(1, 20);            // PCM
  wavBuffer.writeUInt16LE(CHANNELS, 22);
  wavBuffer.writeUInt32LE(SAMPLE_RATE, 24);
  wavBuffer.writeUInt32LE(SAMPLE_RATE * CHANNELS * (BITS / 8), 28); // byte rate
  wavBuffer.writeUInt16LE(CHANNELS * (BITS / 8), 32);               // block align
  wavBuffer.writeUInt16LE(BITS, 34);
  wavBuffer.write('data', 36);
  wavBuffer.writeUInt32LE(dataSize, 40);

  // PCM samples
  for (let i = 0; i < TOTAL_SAMPLES; i++) {
    const val = Math.max(-1, Math.min(1, buffer[i]));
    const int16 = Math.floor(val * 32767);
    wavBuffer.writeInt16LE(int16, 44 + i * 2);
  }

  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, wavBuffer);

  const sizeKB = (wavBuffer.length / 1024).toFixed(1);
  console.log(`Output: ${OUTPUT} (${sizeKB} KB)`);
}

main();
