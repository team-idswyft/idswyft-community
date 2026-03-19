/**
 * generate-narration.mjs
 *
 * Generates per-scene voice narration for the Developer Integration Demo
 * using ElevenLabs Text-to-Speech API.
 *
 * Usage:
 *   node scripts/generate-narration.mjs
 *
 * Environment variables:
 *   ELEVENLABS_API_KEY  — your ElevenLabs API key (required)
 *   ELEVENLABS_VOICE_ID — voice to use (default: "pNInz6obpgDQGcFmaJgB" = Adam)
 *   ELEVENLABS_MODEL    — model to use (default: "eleven_turbo_v2_5")
 *
 * Output:
 *   public/narration/scene-1-title.mp3 .. scene-6-cta.mp3
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = path.resolve(__dirname, '../public/narration');

// ─── Narration script (synced to scene durations) ──────────────────────────

const SCENES = [
  {
    id: '1',
    filename: 'scene-1-title.mp3',
    durationSec: 3.0,
    frames: 90,
    text: 'Integrate identity verification in just five minutes.',
  },
  {
    id: '2',
    filename: 'scene-2-register.mp3',
    durationSec: 5.0,
    frames: 150,
    text: 'Start by registering as a developer. One API call gives you your keys instantly.',
  },
  {
    id: '3',
    filename: 'scene-3-code.mp3',
    durationSec: 42.0,
    frames: 1260,
    text: "Five API calls is all it takes. First, initialize a verification session with a POST request. You'll get back a verification ID to track the flow. Next, upload the front of the document. Then the back — cross-validation runs automatically. Now submit the live capture, that's where face matching happens. Finally, poll for the result. Each step returns clean JSON you can act on right away.",
  },
  {
    id: '4',
    filename: 'scene-4-verification.mp3',
    durationSec: 10.0,
    frames: 300,
    text: "Your users get a seamless mobile experience. They scan their ID, take a quick live capture, and they're verified. No extra apps, no waiting.",
  },
  {
    id: '5',
    filename: 'scene-5-dashboard.mp3',
    durationSec: 6.0,
    frames: 180,
    text: 'Monitor everything from your dashboard. Track verifications, success rates, and response times in real time.',
  },
  {
    id: '6',
    filename: 'scene-6-cta.mp3',
    durationSec: 7.0,
    frames: 210,
    text: 'Ready to integrate? Visit idswyft dot app slash doc to get started.',
  },
];

// ─── ElevenLabs API ────────────────────────────────────────────────────────

const API_KEY = process.env.ELEVENLABS_API_KEY;
const VOICE_ID = process.env.ELEVENLABS_VOICE_ID || '0dEnJoo57u9FdzIGNPZt';
const MODEL_ID = process.env.ELEVENLABS_MODEL || 'eleven_turbo_v2_5';

if (!API_KEY) {
  console.error('ERROR: Set ELEVENLABS_API_KEY environment variable.\n');
  console.error('  Windows:  set ELEVENLABS_API_KEY=your_key_here');
  console.error('  Bash:     export ELEVENLABS_API_KEY=your_key_here\n');
  process.exit(1);
}

async function generateAudio(text, filename) {
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'xi-api-key': API_KEY,
      'Content-Type': 'application/json',
      Accept: 'audio/mpeg',
    },
    body: JSON.stringify({
      text,
      model_id: MODEL_ID,
      voice_settings: {
        stability: 0.65,
        similarity_boost: 0.75,
        style: 0.15,
        use_speaker_boost: true,
        speed: 0.85,
      },
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`ElevenLabs API error ${response.status}: ${body}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  const outPath = path.join(OUTPUT_DIR, filename);
  fs.writeFileSync(outPath, buffer);
  return buffer.length;
}

// ─── Main ──────────────────────────────────────────────────────────────────

async function main() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  console.log('Generating narration audio with ElevenLabs...\n');
  console.log(`Voice ID: ${VOICE_ID}`);
  console.log(`Model:    ${MODEL_ID}`);
  console.log(`Output:   ${OUTPUT_DIR}\n`);

  // Print narration script
  console.log('--- Narration Script -------------------------------------------');
  for (const scene of SCENES) {
    const wordCount = scene.text.split(' ').length;
    const wpm = Math.round((wordCount / scene.durationSec) * 60);
    console.log(`Scene ${scene.id} (${scene.durationSec}s, ${wordCount} words, ~${wpm} wpm):`);
    console.log(`  "${scene.text}"\n`);
  }
  console.log('----------------------------------------------------------------\n');

  // Generate sequentially to respect rate limits
  let totalBytes = 0;
  for (const scene of SCENES) {
    process.stdout.write(`Scene ${scene.id}: ${scene.filename}... `);
    try {
      const bytes = await generateAudio(scene.text, scene.filename);
      totalBytes += bytes;
      console.log(`OK (${(bytes / 1024).toFixed(1)} KB)`);
    } catch (err) {
      console.error(`FAILED: ${err.message}`);
      process.exit(1);
    }
    // Rate limit buffer
    await new Promise((r) => setTimeout(r, 500));
  }

  console.log(`\nDone! Total: ${(totalBytes / 1024).toFixed(1)} KB across ${SCENES.length} files`);
  console.log('\nNext steps:');
  console.log('  1. Enable narration in DocsPage: <Player inputProps={{ narration: true }} ... />');
  console.log('  2. Run `npm run dev` and check the video on /doc');
  console.log('  3. If audio is too long/short for a scene, edit the text in this script and re-run');
}

main();
