/**
 * Audio Decoder — Converts uploaded audio formats to 16kHz mono PCM Float32.
 *
 * Supports WAV (direct parse) and WebM/Opus (via ffmpeg subprocess).
 * The engine Dockerfile includes ffmpeg in the runtime stage.
 */

import { spawn } from 'child_process';
import { logger } from '@/utils/logger.js';

/**
 * Decode audio buffer to 16kHz mono Float32Array.
 * Accepts WAV or WebM/Opus. Falls back to ffmpeg for non-WAV formats.
 */
export async function decodeAudioToFloat32(buffer: Buffer, mimeType: string): Promise<Float32Array> {
  if (mimeType === 'audio/wav' || mimeType === 'audio/wave' || mimeType === 'audio/x-wav') {
    return decodeWav(buffer);
  }
  // WebM, Opus, OGG, or any other format — use ffmpeg
  return decodeWithFfmpeg(buffer);
}

/**
 * Parse a WAV file directly (no external deps).
 * Handles PCM 16-bit and PCM 32-bit float at any sample rate.
 * Resamples to 16kHz if needed.
 */
function decodeWav(buffer: Buffer): Float32Array {
  // WAV header: "RIFF" (4) + size (4) + "WAVE" (4)
  if (buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error('Invalid WAV file header');
  }

  let offset = 12;
  let sampleRate = 0;
  let bitsPerSample = 0;
  let numChannels = 0;
  let audioFormat = 0;
  let dataBuffer: Buffer | null = null;

  // Parse chunks
  while (offset < buffer.length - 8) {
    const chunkId = buffer.toString('ascii', offset, offset + 4);
    const chunkSize = buffer.readUInt32LE(offset + 4);

    if (chunkId === 'fmt ') {
      audioFormat = buffer.readUInt16LE(offset + 8);
      numChannels = buffer.readUInt16LE(offset + 10);
      sampleRate = buffer.readUInt32LE(offset + 12);
      bitsPerSample = buffer.readUInt16LE(offset + 22);
    } else if (chunkId === 'data') {
      dataBuffer = buffer.subarray(offset + 8, offset + 8 + chunkSize);
    }

    offset += 8 + chunkSize;
    // Pad to even boundary
    if (chunkSize % 2 !== 0) offset += 1;
  }

  if (!dataBuffer || !sampleRate || !numChannels) {
    throw new Error('WAV file missing fmt or data chunk');
  }

  // Convert to Float32 samples
  let samples: Float32Array;
  if (audioFormat === 3 && bitsPerSample === 32) {
    // IEEE float
    samples = new Float32Array(dataBuffer.buffer, dataBuffer.byteOffset, dataBuffer.byteLength / 4);
  } else if (audioFormat === 1 && bitsPerSample === 16) {
    // PCM 16-bit
    const int16 = new Int16Array(dataBuffer.buffer, dataBuffer.byteOffset, dataBuffer.byteLength / 2);
    samples = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) {
      samples[i] = int16[i] / 32768;
    }
  } else {
    throw new Error(`Unsupported WAV format: audioFormat=${audioFormat}, bitsPerSample=${bitsPerSample}`);
  }

  // Mix to mono if stereo
  if (numChannels > 1) {
    const mono = new Float32Array(Math.floor(samples.length / numChannels));
    for (let i = 0; i < mono.length; i++) {
      let sum = 0;
      for (let ch = 0; ch < numChannels; ch++) {
        sum += samples[i * numChannels + ch];
      }
      mono[i] = sum / numChannels;
    }
    samples = mono;
  }

  // Resample to 16kHz if needed
  if (sampleRate !== 16000) {
    samples = resample(samples, sampleRate, 16000);
  }

  return samples;
}

/**
 * Decode any audio format via ffmpeg subprocess.
 * Pipes audio buffer to stdin, reads raw PCM float32 from stdout.
 */
async function decodeWithFfmpeg(buffer: Buffer): Promise<Float32Array> {
  return new Promise((resolve, reject) => {
    const ffmpeg = spawn('ffmpeg', [
      '-i', 'pipe:0',
      '-f', 'f32le',
      '-acodec', 'pcm_f32le',
      '-ar', '16000',
      '-ac', '1',
      'pipe:1',
    ], { stdio: ['pipe', 'pipe', 'pipe'] });

    const chunks: Buffer[] = [];
    let stderrOutput = '';

    ffmpeg.stdout.on('data', (chunk: Buffer) => chunks.push(chunk));
    ffmpeg.stderr.on('data', (chunk: Buffer) => { stderrOutput += chunk.toString(); });

    ffmpeg.on('close', (code) => {
      if (code !== 0) {
        logger.error('ffmpeg decoding failed', { code, stderr: stderrOutput.slice(0, 500) });
        reject(new Error('Failed to decode audio: ffmpeg conversion failed'));
        return;
      }
      const output = Buffer.concat(chunks);
      resolve(new Float32Array(output.buffer, output.byteOffset, output.byteLength / 4));
    });

    ffmpeg.on('error', (err) => {
      logger.error('ffmpeg spawn failed', { error: err.message });
      reject(new Error(`Failed to decode audio: ${err.message}`));
    });

    ffmpeg.stdin.write(buffer);
    ffmpeg.stdin.end();
  });
}

/**
 * Linear interpolation resample.
 * Good enough for speech (not music). Avoids dependency on libsamplerate.
 */
function resample(input: Float32Array, fromRate: number, toRate: number): Float32Array {
  const ratio = fromRate / toRate;
  const outputLength = Math.floor(input.length / ratio);
  const output = new Float32Array(outputLength);

  for (let i = 0; i < outputLength; i++) {
    const srcIndex = i * ratio;
    const floor = Math.floor(srcIndex);
    const frac = srcIndex - floor;
    const a = input[floor] ?? 0;
    const b = input[Math.min(floor + 1, input.length - 1)] ?? 0;
    output[i] = a + frac * (b - a);
  }

  return output;
}
