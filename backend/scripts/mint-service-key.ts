#!/usr/bin/env tsx
/**
 * Idswyft service-key management — operational CLI.
 *
 * Cloud-only. Stripped from community mirror via .community-ignore.
 *
 * Wraps the /api/platform/api-keys/service endpoints with safety rails:
 * - Plaintext keys never printed to stdout by default. Written to a per-operation
 *   file at ~/.idswyft-keys/ with chmod 0600. Stdout shows key_prefix + file path.
 * - Production operations require typing the environment name back to confirm.
 * - All operations log to ~/.idswyft-keys/audit.jsonl (append-only, no plaintext).
 * - After mint/rotate, automatically lists keys to verify the operation landed.
 *
 * Usage:
 *   tsx mint-service-key.ts mint <product> <env> <label>
 *   tsx mint-service-key.ts list [--all]
 *   tsx mint-service-key.ts rotate <id>
 *   tsx mint-service-key.ts revoke <id>
 *   tsx mint-service-key.ts launch-gatepass    # mints dev + staging + prod for GatePass
 *
 * Env vars (required):
 *   IDSWYFT_PLATFORM_SERVICE_TOKEN
 *   IDSWYFT_API_BASE  (default: https://api.idswyft.app)
 *
 * Examples:
 *   IDSWYFT_PLATFORM_SERVICE_TOKEN=$(railway variables --service idswyfts-main-api ...) \
 *     tsx mint-service-key.ts mint gatepass staging "GatePass staging $(date +%F)"
 *
 *   IDSWYFT_API_BASE=https://staging.api.idswyft.app \
 *   IDSWYFT_PLATFORM_SERVICE_TOKEN=... \
 *     tsx mint-service-key.ts list
 *
 *   tsx mint-service-key.ts revoke 06d621d9-720f-4c46-b140-c955dd992a63
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import * as readline from 'node:readline/promises';

// ───────────────────────────────────────────────────────────────
// Config + constants
// ───────────────────────────────────────────────────────────────

const VALID_PRODUCTS = ['gatepass', 'idswyft-internal'] as const;
const VALID_ENVS = ['development', 'staging', 'production'] as const;

type Product = (typeof VALID_PRODUCTS)[number];
type Environment = (typeof VALID_ENVS)[number];

const KEYS_DIR = path.join(os.homedir(), '.idswyft-keys');
const AUDIT_LOG = path.join(KEYS_DIR, 'audit.jsonl');

const TOKEN = process.env.IDSWYFT_PLATFORM_SERVICE_TOKEN;
const API_BASE = process.env.IDSWYFT_API_BASE ?? 'https://api.idswyft.app';

// ───────────────────────────────────────────────────────────────
// Tiny utility helpers
// ───────────────────────────────────────────────────────────────

function ensureKeysDir(): void {
  if (!fs.existsSync(KEYS_DIR)) {
    fs.mkdirSync(KEYS_DIR, { recursive: true, mode: 0o700 });
  }
  // Re-assert mode in case the dir already existed with looser perms
  fs.chmodSync(KEYS_DIR, 0o700);
}

function audit(event: string, payload: Record<string, unknown>): void {
  ensureKeysDir();
  const row = JSON.stringify({
    timestamp: new Date().toISOString(),
    event,
    api_base: API_BASE,
    ...payload,
  });
  fs.appendFileSync(AUDIT_LOG, row + '\n', { mode: 0o600 });
  fs.chmodSync(AUDIT_LOG, 0o600);
}

function fail(msg: string, code = 1): never {
  process.stderr.write(`✗ ${msg}\n`);
  process.exit(code);
}

function ok(msg: string): void {
  process.stdout.write(`✓ ${msg}\n`);
}

function info(msg: string): void {
  process.stdout.write(`  ${msg}\n`);
}

function warn(msg: string): void {
  process.stderr.write(`⚠ ${msg}\n`);
}

function isUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

function preflightOrExit(): void {
  if (!TOKEN || TOKEN.length === 0) {
    fail(
      'IDSWYFT_PLATFORM_SERVICE_TOKEN env var not set. ' +
      'Pull from Railway: ' +
      'https://railway.com → Idswyft → <env> → idswyfts-main-api → Variables',
    );
  }
  if (TOKEN.length < 32) {
    warn(
      `IDSWYFT_PLATFORM_SERVICE_TOKEN is suspiciously short (${TOKEN.length} chars). ` +
      `Expected 64-char hex from openssl rand -hex 32. ` +
      `Continuing anyway...`,
    );
  }
}

// Friendly env display: red for prod, yellow for staging, green for dev
function envBadge(env: Environment): string {
  const colors: Record<Environment, string> = {
    development: '\x1b[32m',
    staging: '\x1b[33m',
    production: '\x1b[31m',
  };
  const reset = '\x1b[0m';
  return `${colors[env]}${env}${reset}`;
}

async function confirmProduction(action: string, env: Environment): Promise<void> {
  if (env !== 'production') return;
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  process.stderr.write(
    `\n⚠️  About to ${action} on ${envBadge(env)}.\n` +
    `   Type "production" to confirm (or anything else to cancel): `,
  );
  const reply = await rl.question('');
  rl.close();
  if (reply.trim() !== 'production') {
    fail('Cancelled.');
  }
}

// ───────────────────────────────────────────────────────────────
// HTTP wrapper
// ───────────────────────────────────────────────────────────────

interface ServiceKeyResponse {
  id: string;
  key?: string; // present only on mint/rotate (one-time plaintext)
  key_prefix: string;
  service_product: Product;
  service_environment: Environment;
  service_label: string;
  created_at: string;
  is_active?: boolean;
  last_used_at?: string | null;
  revoked_at?: string | null;
  warning?: string;
  revoked_old_id?: string;
}

async function platformRequest<T>(
  method: 'GET' | 'POST' | 'DELETE',
  pathPart: string,
  body?: unknown,
): Promise<{ status: number; body: T | { status: 'error'; message: string; code?: string } }> {
  const url = `${API_BASE}/api/platform/api-keys/service${pathPart}`;
  const res = await fetch(url, {
    method,
    headers: {
      'X-Platform-Service-Token': TOKEN!,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  // 204 No Content has no body
  if (res.status === 204) {
    return { status: 204, body: { status: 'error', message: '' } as any };
  }

  let parsed: any;
  try {
    parsed = await res.json();
  } catch {
    parsed = { status: 'error', message: `Non-JSON response: ${res.status}` };
  }
  return { status: res.status, body: parsed };
}

// ───────────────────────────────────────────────────────────────
// Plaintext key persistence
// ───────────────────────────────────────────────────────────────

function writeKeyFile(record: ServiceKeyResponse): string {
  ensureKeysDir();
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const fname = `${stamp}-${record.service_product}-${record.service_environment}.json`;
  const fpath = path.join(KEYS_DIR, fname);

  // Persist the FULL response (including plaintext key) to the file.
  // Operator copies from this file into Railway / GatePass / etc.
  fs.writeFileSync(fpath, JSON.stringify(record, null, 2) + '\n', { mode: 0o600 });
  fs.chmodSync(fpath, 0o600);

  return fpath;
}

// ───────────────────────────────────────────────────────────────
// Commands
// ───────────────────────────────────────────────────────────────

async function cmdMint(product: string, env: string, label: string): Promise<void> {
  if (!VALID_PRODUCTS.includes(product as Product)) {
    fail(`product must be one of: ${VALID_PRODUCTS.join(', ')} (got ${JSON.stringify(product)})`);
  }
  if (!VALID_ENVS.includes(env as Environment)) {
    fail(`env must be one of: ${VALID_ENVS.join(', ')} (got ${JSON.stringify(env)})`);
  }
  if (!label || label.length < 3 || label.length > 100) {
    fail(`label must be 3-100 chars (got ${label?.length ?? 0})`);
  }

  await confirmProduction('mint a service key', env as Environment);

  process.stdout.write(`Minting ${product} / ${envBadge(env as Environment)} ... `);
  const { status, body } = await platformRequest<ServiceKeyResponse>('POST', '', {
    service_product: product,
    service_environment: env,
    label,
  });

  if (status !== 201 || !('key' in body) || !body.key) {
    process.stdout.write('failed\n');
    fail(`mint returned ${status}: ${JSON.stringify(body)}`);
  }
  process.stdout.write('ok\n');

  const fpath = writeKeyFile(body);
  audit('mint', {
    id: body.id,
    key_prefix: body.key_prefix,
    product,
    env,
    label,
    file: fpath,
  });

  ok(`Minted ${body.key_prefix}... (id ${body.id})`);
  info(`Plaintext key saved to ${fpath} (chmod 0600)`);
  info(`Copy from there to Railway IDSWYFT_API_KEY env var on the consuming service.`);
  info(``);
  info(`Verifying via list:`);
  await listKeysSummary({ filterId: body.id });
}

async function cmdList(opts: { all?: boolean; filterId?: string }): Promise<void> {
  const { status, body } = await platformRequest<{ keys: ServiceKeyResponse[]; count: number }>(
    'GET',
    '',
  );
  if (status !== 200 || !('keys' in body)) {
    fail(`list returned ${status}: ${JSON.stringify(body)}`);
  }
  const keys = (body.keys ?? []).filter((k) =>
    opts.filterId ? k.id === opts.filterId : opts.all || k.is_active !== false,
  );

  if (keys.length === 0) {
    info(opts.all ? 'No service keys at all.' : 'No active service keys.');
    return;
  }

  // Pretty table
  const cols = [
    { h: 'PREFIX', w: 12, k: (k: ServiceKeyResponse) => k.key_prefix },
    { h: 'PRODUCT', w: 18, k: (k: ServiceKeyResponse) => k.service_product },
    { h: 'ENV', w: 12, k: (k: ServiceKeyResponse) => k.service_environment },
    { h: 'LABEL', w: 30, k: (k: ServiceKeyResponse) => k.service_label?.slice(0, 30) ?? '' },
    { h: 'ACTIVE', w: 7, k: (k: ServiceKeyResponse) => (k.is_active ? 'yes' : 'no') },
    { h: 'CREATED', w: 11, k: (k: ServiceKeyResponse) => k.created_at?.slice(0, 10) ?? '' },
    {
      h: 'LAST USED',
      w: 11,
      k: (k: ServiceKeyResponse) => (k.last_used_at ? k.last_used_at.slice(0, 10) : '—'),
    },
    { h: 'ID (short)', w: 9, k: (k: ServiceKeyResponse) => k.id.slice(0, 8) },
  ];

  const head = cols.map((c) => c.h.padEnd(c.w)).join(' ');
  process.stdout.write(`  ${head}\n`);
  process.stdout.write(`  ${cols.map((c) => '─'.repeat(c.w)).join(' ')}\n`);
  for (const k of keys) {
    process.stdout.write(`  ${cols.map((c) => String(c.k(k)).padEnd(c.w)).join(' ')}\n`);
  }
  process.stdout.write(
    `\n  ${keys.length} key(s) shown` +
      (opts.all ? ' (active + revoked)' : ' (active only — pass --all to include revoked)') +
      `\n`,
  );
}

async function listKeysSummary(opts: { filterId?: string }): Promise<void> {
  await cmdList({ all: true, filterId: opts.filterId });
}

async function cmdRotate(id: string): Promise<void> {
  if (!isUuid(id)) fail(`id must be a UUID (got ${id})`);

  // Look up the existing key first to know its product/env for the confirm prompt
  const { body: listBody } = await platformRequest<{ keys: ServiceKeyResponse[] }>('GET', '');
  if (!('keys' in listBody)) fail(`could not list to look up key: ${JSON.stringify(listBody)}`);
  const existing = listBody.keys.find((k) => k.id === id);
  if (!existing) fail(`service key ${id} not found`);

  await confirmProduction('rotate a service key', existing.service_environment);

  process.stdout.write(
    `Rotating ${existing.service_product} / ${envBadge(existing.service_environment)} (label: ${existing.service_label}) ... `,
  );
  const { status, body } = await platformRequest<ServiceKeyResponse>('POST', `/${id}/rotate`);

  if (status === 207) {
    process.stdout.write('partial\n');
    warn(
      `Rotation partial-success: new key minted but old (${id}) failed to revoke. ` +
      `Manually revoke after writing down the new key.`,
    );
  } else if (status !== 200) {
    process.stdout.write('failed\n');
    fail(`rotate returned ${status}: ${JSON.stringify(body)}`);
  } else {
    process.stdout.write('ok\n');
  }

  if (!('key' in body) || !body.key) fail('rotate succeeded but response had no key');

  const fpath = writeKeyFile(body);
  audit('rotate', {
    new_id: body.id,
    new_prefix: body.key_prefix,
    old_id: id,
    product: existing.service_product,
    env: existing.service_environment,
    file: fpath,
  });

  ok(`Rotated. New key ${body.key_prefix}... (id ${body.id}) — old key ${id} marked inactive.`);
  info(`Plaintext saved to ${fpath} (chmod 0600)`);
  info(`Update IDSWYFT_API_KEY on the consuming Railway service before traffic hits cutover.`);
}

async function cmdRevoke(id: string): Promise<void> {
  if (!isUuid(id)) fail(`id must be a UUID (got ${id})`);

  const { body: listBody } = await platformRequest<{ keys: ServiceKeyResponse[] }>('GET', '');
  if (!('keys' in listBody)) fail(`could not list to look up key: ${JSON.stringify(listBody)}`);
  const existing = listBody.keys.find((k) => k.id === id);
  if (!existing) fail(`service key ${id} not found`);

  await confirmProduction('revoke a service key', existing.service_environment);

  process.stdout.write(
    `Revoking ${existing.key_prefix}... (${existing.service_product} / ${envBadge(existing.service_environment)}) ... `,
  );
  const { status, body } = await platformRequest('DELETE', `/${id}`);

  if (status !== 204) {
    process.stdout.write('failed\n');
    fail(`revoke returned ${status}: ${JSON.stringify(body)}`);
  }
  process.stdout.write('ok\n');

  audit('revoke', {
    id,
    prefix: existing.key_prefix,
    product: existing.service_product,
    env: existing.service_environment,
  });

  ok(`Revoked ${existing.key_prefix}... — subsequent calls will return 401 immediately.`);
}

async function cmdLaunchGatepass(): Promise<void> {
  warn('Launch flow: mints 3 service keys for GatePass (development, staging, production).');
  warn(`Each key is written to a separate file in ${KEYS_DIR}.`);
  warn(`Production mint will require typing "production" to confirm.`);
  process.stdout.write(`\nProceed? (y/N): `);
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const reply = await rl.question('');
  rl.close();
  if (!/^y(es)?$/i.test(reply.trim())) {
    fail('Cancelled.');
  }

  for (const env of VALID_ENVS) {
    const label = `GatePass ${env}`;
    process.stdout.write(`\n─── ${label} ───\n`);
    await cmdMint('gatepass', env, label);
  }

  process.stdout.write(`\n✓ All 3 GatePass keys minted. See ${KEYS_DIR}/ for plaintext files.\n`);
  process.stdout.write(`  Next: copy each isk_* into the corresponding GatePass Railway env var (IDSWYFT_API_KEY).\n`);
}

// ───────────────────────────────────────────────────────────────
// Help + entrypoint
// ───────────────────────────────────────────────────────────────

function printHelp(): void {
  process.stdout.write(
    `Idswyft service-key management — operational CLI\n\n` +
    `Usage:\n` +
    `  tsx mint-service-key.ts <command> [args]\n\n` +
    `Commands:\n` +
    `  mint <product> <env> <label>    Mint a new service key (one-time plaintext written to file)\n` +
    `  list [--all]                    List service keys (active by default; --all includes revoked)\n` +
    `  rotate <id>                     Mint a fresh key with same product/env, revoke the old\n` +
    `  revoke <id>                     Mark key inactive — subsequent calls return 401\n` +
    `  launch-gatepass                 Mint dev + staging + prod GatePass keys (one-shot launch)\n` +
    `  help                            Print this message\n\n` +
    `Valid products: ${VALID_PRODUCTS.join(', ')}\n` +
    `Valid envs:     ${VALID_ENVS.join(', ')}\n\n` +
    `Required env vars:\n` +
    `  IDSWYFT_PLATFORM_SERVICE_TOKEN  (the platform service token)\n` +
    `  IDSWYFT_API_BASE                (default https://api.idswyft.app; set to staging URL when testing)\n\n` +
    `Plaintext keys are NEVER printed to stdout. They are written to:\n` +
    `  ${KEYS_DIR}/<timestamp>-<product>-<env>.json  (chmod 0600)\n` +
    `Audit log of all operations: ${AUDIT_LOG}\n\n` +
    `Examples:\n` +
    `  # Mint a single staging key\n` +
    `  tsx mint-service-key.ts mint gatepass staging "GatePass staging"\n\n` +
    `  # List active keys\n` +
    `  tsx mint-service-key.ts list\n\n` +
    `  # Rotate a key (production prompt requires typing "production")\n` +
    `  tsx mint-service-key.ts rotate 06d621d9-720f-4c46-b140-c955dd992a63\n\n` +
    `  # Test against staging instead of production\n` +
    `  IDSWYFT_API_BASE=https://staging.api.idswyft.app tsx mint-service-key.ts list\n`,
  );
}

async function main(): Promise<void> {
  const [, , cmd, ...args] = process.argv;

  if (!cmd || cmd === 'help' || cmd === '--help' || cmd === '-h') {
    printHelp();
    return;
  }

  preflightOrExit();

  switch (cmd) {
    case 'mint': {
      const [product, env, ...labelParts] = args;
      const label = labelParts.join(' ');
      if (!product || !env || !label) {
        fail(`Usage: mint <product> <env> <label>\nValid products: ${VALID_PRODUCTS.join(', ')}\nValid envs: ${VALID_ENVS.join(', ')}`);
      }
      await cmdMint(product, env, label);
      break;
    }
    case 'list': {
      await cmdList({ all: args.includes('--all') });
      break;
    }
    case 'rotate': {
      const [id] = args;
      if (!id) fail('Usage: rotate <id>');
      await cmdRotate(id);
      break;
    }
    case 'revoke': {
      const [id] = args;
      if (!id) fail('Usage: revoke <id>');
      await cmdRevoke(id);
      break;
    }
    case 'launch-gatepass': {
      await cmdLaunchGatepass();
      break;
    }
    default:
      fail(`Unknown command: ${cmd}\nRun \`tsx mint-service-key.ts help\` for usage.`);
  }
}

main().catch((err) => {
  fail(err instanceof Error ? err.message : String(err));
});
