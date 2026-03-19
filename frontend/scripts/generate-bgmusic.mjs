/**
 * generate-bgmusic.mjs
 *
 * Generates ambient background music for the Developer Integration Demo
 * using ElevenLabs Sound Effects API.
 *
 * The API generates up to 22s per request. We generate multiple segments
 * and concatenate them into a single loopable track.
 *
 * Usage:
 *   ELEVENLABS_API_KEY=... node scripts/generate-bgmusic.mjs
 *
 * Output:
 *   public/narration/bg-music.mp3
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = path.resolve(__dirname, '../public/narration');

const API_KEY = process.env.ELEVENLABS_API_KEY;
if (!API_KEY) {
  console.error('ERROR: Set ELEVENLABS_API_KEY environment variable.');
  process.exit(1);
}

// Total video is ~73s. Generate segments to cover it.
// ElevenLabs max is 22s per request.
const SEGMENTS = [
  {
    filename: 'bg-music-1.mp3',
    duration: 22,
    prompt: 'soft ambient electronic background music, minimal lo-fi, gentle synthesizer pads, calm tech tutorial atmosphere, no drums, no vocals, very subtle',
  },
  {
    filename: 'bg-music-2.mp3',
    duration: 22,
    prompt: 'soft ambient electronic background music, minimal lo-fi, gentle synthesizer pads, calm coding atmosphere, no drums, no vocals, very subtle and relaxing',
  },
  {
    filename: 'bg-music-3.mp3',
    duration: 22,
    prompt: 'soft ambient electronic background music, minimal lo-fi, gentle synthesizer pads, calm tech demo atmosphere, no drums, no vocals, very subtle',
  },
  {
    filename: 'bg-music-4.mp3',
    duration: 10,
    prompt: 'soft ambient electronic background music fade out, minimal lo-fi, gentle synthesizer pads, calm ending, no drums, no vocals, very subtle',
  },
];

async function generateSoundEffect(prompt, duration, filename) {
  const url = 'https://api.elevenlabs.io/v1/sound-generation';

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'xi-api-key': API_KEY,
      'Content-Type': 'application/json',
      Accept: 'audio/mpeg',
    },
    body: JSON.stringify({
      text: prompt,
      duration_seconds: duration,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`ElevenLabs Sound Effects API error ${response.status}: ${body}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  const outPath = path.join(OUTPUT_DIR, filename);
  fs.writeFileSync(outPath, buffer);
  return buffer.length;
}

async function main() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  console.log('Generating background music with ElevenLabs Sound Effects...\n');

  let totalBytes = 0;
  const segmentPaths = [];

  for (const seg of SEGMENTS) {
    process.stdout.write(`${seg.filename} (${seg.duration}s)... `);
    try {
      const bytes = await generateSoundEffect(seg.prompt, seg.duration, seg.filename);
      totalBytes += bytes;
      segmentPaths.push(path.join(OUTPUT_DIR, seg.filename));
      console.log(`OK (${(bytes / 1024).toFixed(1)} KB)`);
    } catch (err) {
      console.error(`FAILED: ${err.message}`);
      // If sound effects API isn't available, generate a single shorter track
      if (err.message.includes('422') || err.message.includes('not found')) {
        console.log('\nSound Effects API may not be available on your plan.');
        console.log('You can use any royalty-free ambient track instead.');
        console.log('Place it at: public/narration/bg-music-1.mp3');
      }
      process.exit(1);
    }
    await new Promise((r) => setTimeout(r, 1000));
  }

  console.log(`\nDone! ${SEGMENTS.length} segments, ${(totalBytes / 1024).toFixed(1)} KB total`);
  console.log('\nSegments saved individually. They will be sequenced by Remotion.');
  console.log('Files:');
  for (const seg of SEGMENTS) {
    console.log(`  public/narration/${seg.filename}`);
  }
}

main();
