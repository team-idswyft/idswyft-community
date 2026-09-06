#!/usr/bin/env node
/**
 * LLM provider smoke test — does this key/endpoint/model actually read a document?
 *
 * Runs the exact same request the OCR fallback makes (vision message,
 * OpenAI-compatible body for custom endpoints), so a pass here means the LLM
 * fallback works in the pipeline, and a failure prints the provider's own error
 * instead of it being swallowed as a warning inside a verification.
 *
 * Usage:
 *   LLM_API_KEY=... node scripts/test-llm-provider.mjs \
 *     --provider custom \
 *     --endpoint https://generativelanguage.googleapis.com/v1beta/openai/chat/completions \
 *     --model gemini-2.5-flash \
 *     [--image ./sample-document.jpg]
 *
 *   LLM_API_KEY=sk-... node scripts/test-llm-provider.mjs --provider openai [--model gpt-4o]
 *
 * The key is read from LLM_API_KEY (or --api-key) and is never printed.
 * Exit code 0 = the provider answered with usable JSON.
 */

import fs from 'node:fs';

const TIMEOUT_MS = 30_000;

const DEFAULT_MODELS = {
  openai: 'gpt-4o',
  anthropic: 'claude-sonnet-4-20250514',
};

function parseArgs(argv) {
  const args = { provider: 'custom', endpoint: '', model: '', image: '', apiKey: process.env.LLM_API_KEY || '' };
  for (let i = 0; i < argv.length; i += 1) {
    const [flag, inline] = argv[i].split('=');
    const value = inline ?? argv[++i];
    switch (flag) {
      case '--provider': args.provider = value; break;
      case '--endpoint': args.endpoint = value; break;
      case '--model': args.model = value; break;
      case '--image': args.image = value; break;
      case '--api-key': args.apiKey = value; break;
      case '--help': args.help = true; break;
      default:
        if (flag.startsWith('--')) fail(`Unknown flag: ${flag}`);
    }
  }
  return args;
}

function fail(message) {
  console.error(`FAIL  ${message}`);
  process.exit(1);
}

/**
 * A synthetic ID card — printed fields on a plain card, no real document and no
 * PII. Vision APIs only accept raster formats, so this ships as a PNG fixture.
 */
const SAMPLE_IMAGE = new URL('./fixtures/sample-document.png', import.meta.url);

/** What the sample card actually says — used to judge whether the model read it. */
const SAMPLE_EXPECTED = {
  name: 'MARIA SILVA SANTOS',
  date_of_birth: '1990-05-15',
  document_number: '04812345678',
  expiration_date: '2031-08-20',
};

async function loadImage(imagePath) {
  if (!imagePath) {
    if (!fs.existsSync(SAMPLE_IMAGE)) fail(`Missing fixture: ${SAMPLE_IMAGE.pathname}`);
    return { buffer: fs.readFileSync(SAMPLE_IMAGE), mimeType: 'image/png', isSample: true };
  }
  if (!fs.existsSync(imagePath)) fail(`Image not found: ${imagePath}`);
  const buffer = fs.readFileSync(imagePath);
  const mimeType = buffer[0] === 0x89 ? 'image/png' : buffer[0] === 0x52 ? 'image/webp' : 'image/jpeg';
  return { buffer, mimeType };
}

const PROMPT = `You are an expert document reader. Extract the following fields from this drivers license image.

Fields to extract:
- "name": Full legal name (first + middle + last)
- "date_of_birth": Date of birth in YYYY-MM-DD format
- "document_number": Document / license number
- "expiration_date": Expiration date in YYYY-MM-DD format

Rules:
- Return ONLY a JSON object with the requested field names as keys
- For dates, use YYYY-MM-DD format
- If a field is not visible or unreadable, use null for that field`;

async function post(url, headers, body) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const started = Date.now();
    const response = await fetch(url, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
    });
    const text = await response.text();
    return { status: response.status, ok: response.ok, text, elapsedMs: Date.now() - started };
  } catch (error) {
    if (error.name === 'AbortError') fail(`No answer within ${TIMEOUT_MS / 1000}s — endpoint unreachable or too slow`);
    fail(`Request failed: ${error.message}`);
  } finally {
    clearTimeout(timer);
  }
}

function buildRequest(args, base64Image, mimeType) {
  const model = args.model || DEFAULT_MODELS[args.provider];

  if (args.provider === 'anthropic') {
    return {
      url: 'https://api.anthropic.com/v1/messages',
      headers: { 'x-api-key': args.apiKey, 'anthropic-version': '2023-06-01' },
      body: {
        model,
        max_tokens: 500,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mimeType, data: base64Image } },
            { type: 'text', text: PROMPT },
          ],
        }],
      },
    };
  }

  // openai and custom share the OpenAI-compatible chat/completions shape
  return {
    url: args.provider === 'openai' ? 'https://api.openai.com/v1/chat/completions' : args.endpoint,
    headers: { Authorization: `Bearer ${args.apiKey}` },
    body: {
      model,
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: PROMPT },
          { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64Image}`, detail: 'high' } },
        ],
      }],
      max_tokens: 500,
      temperature: 0.1,
    },
  };
}

function extractContent(payload) {
  return payload?.choices?.[0]?.message?.content
    ?? payload?.content?.find?.(block => block.type === 'text')?.text
    ?? payload?.content?.[0]?.text
    ?? payload?.text
    ?? '';
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    console.log(fs.readFileSync(new URL(import.meta.url), 'utf8').split('*/')[0]);
    return;
  }
  if (!['openai', 'anthropic', 'custom'].includes(args.provider)) fail(`provider must be openai, anthropic or custom`);
  if (!args.apiKey) fail('Missing API key — set LLM_API_KEY or pass --api-key');
  if (args.provider === 'custom' && !args.endpoint) fail('Custom provider needs --endpoint');
  if (args.provider === 'custom' && !args.model) fail('Custom provider needs --model (this is what produced "model is not specified")');

  const { buffer, mimeType, isSample } = await loadImage(args.image);
  const request = buildRequest(args, buffer.toString('base64'), mimeType);

  console.log(`provider : ${args.provider}`);
  console.log(`endpoint : ${request.url}`);
  console.log(`model    : ${request.body.model}`);
  console.log(`image    : ${args.image || 'synthetic sample card'} (${mimeType}, ${(buffer.length / 1024).toFixed(1)} KB)`);
  console.log(`api key  : ${args.apiKey.slice(0, 4)}…${args.apiKey.slice(-4)} (${args.apiKey.length} chars)`);
  console.log('');

  const response = await post(request.url, request.headers, request.body);

  if (!response.ok) {
    console.error(`HTTP ${response.status} after ${response.elapsedMs}ms`);
    console.error(response.text.slice(0, 800));
    console.error('');
    if (response.status === 400 && /model/i.test(response.text)) {
      console.error('The endpoint rejected the request over the model name — check --model against the provider\'s catalog.');
    }
    if (response.status === 401 || response.status === 403) {
      console.error('The key was refused. Confirm it is active and allowed to call this endpoint.');
    }
    process.exit(1);
  }

  let payload;
  try {
    payload = JSON.parse(response.text);
  } catch {
    fail(`Answer was not JSON: ${response.text.slice(0, 200)}`);
  }

  const content = extractContent(payload);
  if (!content) fail(`No text in the answer: ${response.text.slice(0, 300)}`);

  const cleaned = content.trim().replace(/^```json\n?/, '').replace(/^```\n?/, '').replace(/```$/, '');
  let fields;
  try {
    fields = JSON.parse(cleaned);
  } catch {
    console.error(`FAIL  The model answered, but not with JSON the OCR fallback can parse:\n${content.slice(0, 400)}`);
    process.exit(1);
  }

  console.log(`HTTP ${response.status} in ${response.elapsedMs}ms`);
  console.log('Extracted fields:');
  for (const [key, value] of Object.entries(fields)) console.log(`  ${key}: ${value ?? 'null'}`);

  const readAnything = Object.values(fields).some(value => value != null && value !== '');
  if (!readAnything) {
    console.error('\nFAIL  The model replied with every field null — it answered but did not read the image.');
    process.exit(1);
  }

  console.log('\nPASS  Key, endpoint and model work for vision OCR extraction.');
}

main();
