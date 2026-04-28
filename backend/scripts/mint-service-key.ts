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

// ANSI color palette. Git Bash on Windows + modern terminals support these.
// Disabled when stdout isn't a TTY (e.g. piping to a file) so we don't pollute
// log files with escape sequences.
const ANSI_ENABLED = process.stdout.isTTY ?? false;
const C = {
  reset: ANSI_ENABLED ? '\x1b[0m' : '',
  bold: ANSI_ENABLED ? '\x1b[1m' : '',
  dim: ANSI_ENABLED ? '\x1b[2m' : '',
  italic: ANSI_ENABLED ? '\x1b[3m' : '',
  red: ANSI_ENABLED ? '\x1b[31m' : '',
  green: ANSI_ENABLED ? '\x1b[32m' : '',
  yellow: ANSI_ENABLED ? '\x1b[33m' : '',
  blue: ANSI_ENABLED ? '\x1b[34m' : '',
  magenta: ANSI_ENABLED ? '\x1b[35m' : '',
  cyan: ANSI_ENABLED ? '\x1b[36m' : '',
  white: ANSI_ENABLED ? '\x1b[37m' : '',
  gray: ANSI_ENABLED ? '\x1b[90m' : '',
  brightRed: ANSI_ENABLED ? '\x1b[91m' : '',
  brightGreen: ANSI_ENABLED ? '\x1b[92m' : '',
  brightYellow: ANSI_ENABLED ? '\x1b[93m' : '',
  brightCyan: ANSI_ENABLED ? '\x1b[96m' : '',
};

// Friendly env display: red for prod, yellow for staging, green for dev
function envBadge(env: Environment): string {
  const colors: Record<Environment, string> = {
    development: C.green,
    staging: C.yellow,
    production: C.red,
  };
  return `${C.bold}${colors[env]}${env}${C.reset}`;
}

// Pad a string to a target visible width. ANSI escape sequences don't take
// visual columns so naive padEnd() throws off table alignment if we color
// the value first. This pads using only the visible characters then wraps
// the result with color codes.
function padCol(value: string, width: number, color = ''): string {
  const visible = value.length > width ? value.slice(0, width - 1) + '…' : value;
  const padding = ' '.repeat(Math.max(0, width - visible.length));
  return `${color}${visible}${color ? C.reset : ''}${padding}`;
}

// Highlighted box around a one-time plaintext key. Drawn in bright cyan with
// the key itself in bold so it stands out in scrollback. Internal-only
// tooling — printing the plaintext is intentional (operator copies it from
// here into Railway env vars).
function printKeyBox(key: string): void {
  const label = ' NEW SERVICE KEY — copy now, will not be shown again ';
  const inner = key;
  const width = Math.max(label.length, inner.length) + 4;
  const horiz = '━'.repeat(width);
  const lblPad = ' '.repeat(Math.max(0, width - label.length));
  const innerPad = ' '.repeat(Math.max(0, width - inner.length - 2));

  process.stdout.write('\n');
  process.stdout.write(`  ${C.brightCyan}┏${horiz}┓${C.reset}\n`);
  process.stdout.write(`  ${C.brightCyan}┃${C.reset}${C.bold}${label}${C.reset}${lblPad}${C.brightCyan}┃${C.reset}\n`);
  process.stdout.write(`  ${C.brightCyan}┣${horiz}┫${C.reset}\n`);
  process.stdout.write(`  ${C.brightCyan}┃${C.reset}  ${C.bold}${C.brightCyan}${inner}${C.reset}${innerPad}${C.brightCyan}┃${C.reset}\n`);
  process.stdout.write(`  ${C.brightCyan}┗${horiz}┛${C.reset}\n`);
  process.stdout.write('\n');
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

async function platformRequestRaw<T>(
  method: 'GET' | 'POST' | 'DELETE',
  fullPath: string,
  body?: unknown,
): Promise<{ status: number; body: T | { status: 'error'; message: string; code?: string } }> {
  const url = `${API_BASE}${fullPath}`;
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

// Service-keys endpoints (/api/platform/api-keys/service)
async function platformRequest<T>(
  method: 'GET' | 'POST' | 'DELETE',
  pathPart: string,
  body?: unknown,
) {
  return platformRequestRaw<T>(method, `/api/platform/api-keys/service${pathPart}`, body);
}

// Webhook endpoints (/api/platform/webhooks)
async function platformWebhookRequest<T>(
  method: 'GET' | 'POST' | 'DELETE',
  pathPart: string,
  body?: unknown,
) {
  return platformRequestRaw<T>(method, `/api/platform/webhooks${pathPart}`, body);
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

  ok(`Minted ${C.brightCyan}${C.bold}${body.key_prefix}${C.reset} (id ${C.dim}${body.id}${C.reset})`);
  printKeyBox(body.key);
  info(`${C.dim}Also saved to ${fpath} (chmod 0600)${C.reset}`);
  info(`Set on the consumer's Railway service: ${C.bold}IDSWYFT_API_KEY=${body.key.slice(0, 8)}…${C.reset}`);
  info(``);
  info(`${C.dim}Verifying via list:${C.reset}`);
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

  // Column widths — keep these in one place so header + rule + rows align.
  const W = {
    prefix: 12,
    product: 18,
    env: 12,
    label: 30,
    active: 7,
    created: 11,
    lastUsed: 11,
    id: 9,
  } as const;

  // Header (bold + dim gray underline rule)
  const header =
    `${C.bold}${padCol('PREFIX', W.prefix)}${C.reset} ` +
    `${C.bold}${padCol('PRODUCT', W.product)}${C.reset} ` +
    `${C.bold}${padCol('ENV', W.env)}${C.reset} ` +
    `${C.bold}${padCol('LABEL', W.label)}${C.reset} ` +
    `${C.bold}${padCol('ACTIVE', W.active)}${C.reset} ` +
    `${C.bold}${padCol('CREATED', W.created)}${C.reset} ` +
    `${C.bold}${padCol('LAST USED', W.lastUsed)}${C.reset} ` +
    `${C.bold}${padCol('ID', W.id)}${C.reset}`;
  const rule = `${C.gray}${'─'.repeat(W.prefix)} ${'─'.repeat(W.product)} ${'─'.repeat(W.env)} ${'─'.repeat(W.label)} ${'─'.repeat(W.active)} ${'─'.repeat(W.created)} ${'─'.repeat(W.lastUsed)} ${'─'.repeat(W.id)}${C.reset}`;

  process.stdout.write(`\n  ${header}\n`);
  process.stdout.write(`  ${rule}\n`);

  for (const k of keys) {
    const env = k.service_environment;
    const envColor = env === 'production' ? C.red : env === 'staging' ? C.yellow : C.green;
    const activeText = k.is_active ? 'yes' : 'no';
    const activeColor = k.is_active ? C.green : C.red;
    const lastUsed = k.last_used_at ? k.last_used_at.slice(0, 10) : '—';
    const lastUsedColor = k.last_used_at ? '' : C.dim;

    process.stdout.write(
      `  ` +
        `${padCol(k.key_prefix, W.prefix, C.brightCyan + C.bold)} ` +
        `${padCol(k.service_product, W.product, C.cyan)} ` +
        `${padCol(env, W.env, envColor + C.bold)} ` +
        `${padCol(k.service_label ?? '', W.label)} ` +
        `${padCol(activeText, W.active, activeColor)} ` +
        `${padCol(k.created_at?.slice(0, 10) ?? '', W.created, C.dim)} ` +
        `${padCol(lastUsed, W.lastUsed, lastUsedColor)} ` +
        `${padCol(k.id.slice(0, 8), W.id, C.dim + C.cyan)}` +
        `\n`,
    );
  }

  const summary = opts.all
    ? `${keys.length} key(s) shown (active + revoked)`
    : `${keys.length} key(s) shown ${C.dim}(active only — pass --all to include revoked)${C.reset}`;
  process.stdout.write(`\n  ${summary}\n`);
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

  ok(`Rotated. New key ${C.brightCyan}${C.bold}${body.key_prefix}${C.reset} (id ${C.dim}${body.id}${C.reset}) — old key ${C.dim}${id}${C.reset} marked inactive.`);
  printKeyBox(body.key);
  info(`${C.dim}Also saved to ${fpath} (chmod 0600)${C.reset}`);
  info(`${C.bold}${C.yellow}Update IDSWYFT_API_KEY on the consuming Railway service before traffic hits cutover.${C.reset}`);
  info(`${C.dim}There is no overlap window — the old key is invalid the moment this script returned.${C.reset}`);
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

interface RevokeAllOpts {
  serviceEnv?: Environment;     // filter by service_environment column
  product?: Product;             // filter by service_product column
  yes?: boolean;                 // skip confirmation prompt
}

/**
 * Bulk-revoke active service keys, optionally filtered by service_environment
 * and/or service_product. Lists matches first and requires explicit confirmation
 * before any destructive action. Production keys add an extra confirmation gate.
 */
async function cmdRevokeAll(opts: RevokeAllOpts): Promise<void> {
  const { body } = await platformRequest<{ keys: ServiceKeyResponse[] }>('GET', '');
  if (!('keys' in body)) fail(`could not list service keys: ${JSON.stringify(body)}`);

  let candidates = (body.keys ?? []).filter((k) => k.is_active !== false);
  if (opts.serviceEnv) {
    candidates = candidates.filter((k) => k.service_environment === opts.serviceEnv);
  }
  if (opts.product) {
    candidates = candidates.filter((k) => k.service_product === opts.product);
  }

  if (candidates.length === 0) {
    info(
      `No active service keys match the filter` +
        (opts.serviceEnv ? ` (service-env=${opts.serviceEnv})` : '') +
        (opts.product ? ` (product=${opts.product})` : '') +
        `.`,
    );
    return;
  }

  // Show what will be revoked, in the same colored table format as `list`
  process.stdout.write(`\n${C.bold}${C.yellow}About to revoke ${candidates.length} key(s):${C.reset}\n`);
  await cmdList({ all: false }); // shows current active set; matches what's about to die

  const hasProduction = candidates.some((k) => k.service_environment === 'production');

  // Two-stage confirmation: typed yes, plus explicit "production" if any prod keys
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    if (!opts.yes) {
      process.stderr.write(
        `\n${C.yellow}Type ${C.bold}yes${C.reset}${C.yellow} to revoke all ${candidates.length} key(s) ` +
          `(or anything else to cancel): ${C.reset}`,
      );
      const reply = await rl.question('');
      if (reply.trim().toLowerCase() !== 'yes') fail('Cancelled.');
    }

    if (hasProduction) {
      const prodCount = candidates.filter((k) => k.service_environment === 'production').length;
      process.stderr.write(
        `\n${C.red}${C.bold}⚠ ${prodCount} of these are PRODUCTION keys.${C.reset}\n` +
          `${C.red}Type ${C.bold}production${C.reset}${C.red} to confirm production revocation ` +
          `(or anything else to cancel): ${C.reset}`,
      );
      const prodReply = await rl.question('');
      if (prodReply.trim() !== 'production') fail('Cancelled.');
    }
  } finally {
    rl.close();
  }

  // Revoke each one. Continue on individual failures so a single 404 doesn't
  // strand the rest in a half-revoked state.
  let revoked = 0;
  let failed = 0;
  process.stdout.write(`\n`);
  for (const k of candidates) {
    process.stdout.write(`  Revoking ${k.key_prefix}... `);
    const { status } = await platformRequest('DELETE', `/${k.id}`);
    if (status === 204) {
      process.stdout.write(`${C.green}ok${C.reset}\n`);
      audit('revoke-all', {
        id: k.id,
        prefix: k.key_prefix,
        product: k.service_product,
        env: k.service_environment,
      });
      revoked += 1;
    } else {
      process.stdout.write(`${C.red}failed (${status})${C.reset}\n`);
      failed += 1;
    }
  }

  process.stdout.write(`\n`);
  if (failed === 0) {
    ok(`Revoked ${revoked} key(s).`);
  } else {
    warn(`Revoked ${revoked}, ${failed} failed. Check 'sk -e <env> list --all' to inspect.`);
  }
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
// Webhook subcommands (Phase 1 — platform webhooks for service products)
// ───────────────────────────────────────────────────────────────

interface WebhookResponse {
  id: string;
  service_product?: string;
  url: string;
  events: string[];
  is_sandbox: boolean;
  is_active: boolean;
  created_at: string;
  last_attempted_at?: string | null;
  signing_secret?: string;          // present only on register / rotate
  signing_secret_masked?: string;   // present on list
  warning?: string;
}

function writeWebhookSecretFile(record: WebhookResponse, product: string): string {
  ensureKeysDir();
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const fname = `${stamp}-${product}-webhook-secret.json`;
  const fpath = path.join(KEYS_DIR, fname);
  fs.writeFileSync(fpath, JSON.stringify(record, null, 2) + '\n', { mode: 0o600 });
  fs.chmodSync(fpath, 0o600);
  return fpath;
}

function printSecretBox(secret: string): void {
  const label = ' NEW WEBHOOK SIGNING SECRET — copy now, will not be shown again ';
  const inner = secret;
  const width = Math.max(label.length, inner.length) + 4;
  const horiz = '━'.repeat(width);
  const lblPad = ' '.repeat(Math.max(0, width - label.length));
  const innerPad = ' '.repeat(Math.max(0, width - inner.length - 2));
  process.stdout.write('\n');
  process.stdout.write(`  ${C.brightYellow}┏${horiz}┓${C.reset}\n`);
  process.stdout.write(`  ${C.brightYellow}┃${C.reset}${C.bold}${label}${C.reset}${lblPad}${C.brightYellow}┃${C.reset}\n`);
  process.stdout.write(`  ${C.brightYellow}┣${horiz}┫${C.reset}\n`);
  process.stdout.write(`  ${C.brightYellow}┃${C.reset}  ${C.bold}${C.brightYellow}${inner}${C.reset}${innerPad}${C.brightYellow}┃${C.reset}\n`);
  process.stdout.write(`  ${C.brightYellow}┗${horiz}┛${C.reset}\n`);
  process.stdout.write('\n');
}

interface WebhookRegisterOpts {
  product: Product;
  url: string;
  events?: string[];
  isSandbox?: boolean;
}

async function cmdWebhookRegister(opts: WebhookRegisterOpts): Promise<void> {
  if (!VALID_PRODUCTS.includes(opts.product)) {
    fail(`product must be one of: ${VALID_PRODUCTS.join(', ')}`);
  }

  process.stdout.write(`Registering webhook ${opts.product} → ${opts.url} ... `);
  const { status, body } = await platformWebhookRequest<WebhookResponse>('POST', '', {
    service_product: opts.product,
    url: opts.url,
    ...(opts.events ? { events: opts.events } : {}),
    is_sandbox: opts.isSandbox ?? false,
  });

  if (status !== 201 || !('signing_secret' in body) || !body.signing_secret) {
    process.stdout.write('failed\n');
    fail(`register returned ${status}: ${JSON.stringify(body)}`);
  }
  process.stdout.write('ok\n');

  const fpath = writeWebhookSecretFile(body, opts.product);
  audit('webhook-register', {
    id: body.id,
    product: opts.product,
    url: opts.url,
    file: fpath,
  });

  ok(`Registered webhook ${C.brightCyan}${C.bold}${body.id}${C.reset} for ${opts.product}.`);
  printSecretBox(body.signing_secret);
  info(`${C.dim}Also saved to ${fpath} (chmod 0600)${C.reset}`);
  info(`Use this secret to verify the X-Idswyft-Signature header on inbound webhooks at ${C.bold}${opts.url}${C.reset}.`);
  info(`Events subscribed: ${body.events.join(', ')}`);
}

async function cmdWebhookList(opts: { product?: Product }): Promise<void> {
  const query = opts.product ? `?service_product=${opts.product}` : '';
  const { status, body } = await platformWebhookRequest<{ webhooks: WebhookResponse[]; count: number }>(
    'GET',
    query,
  );
  if (status !== 200 || !('webhooks' in body)) {
    fail(`list returned ${status}: ${JSON.stringify(body)}`);
  }

  if (body.webhooks.length === 0) {
    info(opts.product ? `No webhooks registered for ${opts.product}.` : 'No platform webhooks registered.');
    return;
  }

  const W = { product: 18, url: 50, sandbox: 8, active: 7, events: 30, secret: 20, id: 9 };
  process.stdout.write(`\n  `);
  process.stdout.write(`${C.bold}${padCol('PRODUCT', W.product)}${C.reset} `);
  process.stdout.write(`${C.bold}${padCol('URL', W.url)}${C.reset} `);
  process.stdout.write(`${C.bold}${padCol('SANDBOX', W.sandbox)}${C.reset} `);
  process.stdout.write(`${C.bold}${padCol('ACTIVE', W.active)}${C.reset} `);
  process.stdout.write(`${C.bold}${padCol('EVENTS', W.events)}${C.reset} `);
  process.stdout.write(`${C.bold}${padCol('SECRET', W.secret)}${C.reset} `);
  process.stdout.write(`${C.bold}${padCol('ID', W.id)}${C.reset}\n`);
  process.stdout.write(`  ${C.gray}${'─'.repeat(W.product)} ${'─'.repeat(W.url)} ${'─'.repeat(W.sandbox)} ${'─'.repeat(W.active)} ${'─'.repeat(W.events)} ${'─'.repeat(W.secret)} ${'─'.repeat(W.id)}${C.reset}\n`);

  for (const w of body.webhooks) {
    const sandboxText = w.is_sandbox ? 'yes' : 'no';
    const sandboxColor = w.is_sandbox ? C.yellow : C.dim;
    const activeText = w.is_active ? 'yes' : 'no';
    const activeColor = w.is_active ? C.green : C.red;
    const eventsShort = (w.events ?? []).map((e) => e.replace('verification.', 'v.')).join(',');

    process.stdout.write(
      `  ` +
        `${padCol(w.service_product ?? '?', W.product, C.cyan)} ` +
        `${padCol(w.url, W.url, C.brightCyan)} ` +
        `${padCol(sandboxText, W.sandbox, sandboxColor)} ` +
        `${padCol(activeText, W.active, activeColor)} ` +
        `${padCol(eventsShort, W.events, C.dim)} ` +
        `${padCol(w.signing_secret_masked ?? '***', W.secret, C.dim)} ` +
        `${padCol(w.id.slice(0, 8), W.id, C.dim + C.cyan)}` +
        `\n`,
    );
  }
  process.stdout.write(`\n  ${body.count} webhook(s) shown\n`);
}

async function cmdWebhookRotate(id: string): Promise<void> {
  if (!isUuid(id)) fail(`id must be a UUID (got ${id})`);

  process.stdout.write(`Rotating webhook signing secret for ${id} ... `);
  const { status, body } = await platformWebhookRequest<WebhookResponse>('POST', `/${id}/rotate`);

  if (status !== 200 || !('signing_secret' in body) || !body.signing_secret) {
    process.stdout.write('failed\n');
    fail(`rotate returned ${status}: ${JSON.stringify(body)}`);
  }
  process.stdout.write('ok\n');

  const fpath = writeWebhookSecretFile(body, 'rotated');
  audit('webhook-rotate', { id, file: fpath });

  ok(`Rotated signing secret for webhook ${C.brightCyan}${C.bold}${id}${C.reset}.`);
  printSecretBox(body.signing_secret);
  info(`${C.dim}Also saved to ${fpath} (chmod 0600)${C.reset}`);
  info(`${C.bold}${C.yellow}Update the consumer's HMAC verification secret IMMEDIATELY.${C.reset}`);
  info(`${C.dim}There is no overlap window — the old secret is invalid the moment this command returned.${C.reset}`);
}

async function cmdWebhookDelete(id: string): Promise<void> {
  if (!isUuid(id)) fail(`id must be a UUID (got ${id})`);

  process.stdout.write(`Deleting webhook ${id} ... `);
  const { status, body } = await platformWebhookRequest('DELETE', `/${id}`);
  if (status !== 204) {
    process.stdout.write('failed\n');
    fail(`delete returned ${status}: ${JSON.stringify(body)}`);
  }
  process.stdout.write('ok\n');

  audit('webhook-delete', { id });
  ok(`Deleted webhook ${id}. Subsequent verification events will not fire to this URL.`);
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
    `  mint <product> <env> <label>    Mint a new service key (plaintext shown in highlighted box + saved to file)\n` +
    `  list [--all]                    List service keys (active by default; --all includes revoked)\n` +
    `  rotate <id>                     Mint a fresh key with same product/env, revoke the old\n` +
    `  revoke <id>                     Mark key inactive — subsequent calls return 401\n` +
    `  revoke-all [--service-env <e>] [--product <p>] [--yes]\n` +
    `                                  Bulk-revoke active keys (with confirmation; production needs extra confirm)\n` +
    `  launch-gatepass                 Mint dev + staging + prod GatePass keys (one-shot launch)\n` +
    `  webhook register --product <p> --url <url> [--events e1,e2] [--sandbox]\n` +
    `                                  Register a webhook on the shadow developer for a service product.\n` +
    `                                  Returns plaintext signing secret ONCE (highlighted box + saved to file).\n` +
    `  webhook list [--product <p>]    List platform webhooks (signing secret masked)\n` +
    `  webhook rotate <id>             Rotate signing secret (no overlap window — old invalid immediately)\n` +
    `  webhook delete <id>             Hard-delete webhook registration\n` +
    `  help                            Print this message\n\n` +
    `Valid products: ${VALID_PRODUCTS.join(', ')}\n` +
    `Valid envs:     ${VALID_ENVS.join(', ')}\n\n` +
    `Required env vars:\n` +
    `  IDSWYFT_PLATFORM_SERVICE_TOKEN  (the platform service token)\n` +
    `  IDSWYFT_API_BASE                (default https://api.idswyft.app; set to staging URL when testing)\n\n` +
    `Plaintext keys: shown in a highlighted box on mint/rotate AND saved to:\n` +
    `  ${KEYS_DIR}/<timestamp>-<product>-<env>.json  (chmod 0600)\n` +
    `Audit log of all operations (no plaintext): ${AUDIT_LOG}\n\n` +
    `Examples:\n` +
    `  # Mint a single staging key\n` +
    `  tsx mint-service-key.ts mint gatepass staging "GatePass staging"\n\n` +
    `  # List active keys\n` +
    `  tsx mint-service-key.ts list\n\n` +
    `  # Rotate a key (production prompt requires typing "production")\n` +
    `  tsx mint-service-key.ts rotate 06d621d9-720f-4c46-b140-c955dd992a63\n\n` +
    `  # Bulk-revoke ALL active keys with service_environment=staging\n` +
    `  tsx mint-service-key.ts revoke-all --service-env staging\n\n` +
    `  # Bulk-revoke all GatePass keys regardless of environment\n` +
    `  tsx mint-service-key.ts revoke-all --product gatepass\n\n` +
    `  # Test against staging instead of production\n` +
    `  IDSWYFT_API_BASE=https://staging.api.idswyft.app tsx mint-service-key.ts list\n\n` +
    `  # Register a webhook for GatePass on staging\n` +
    `  tsx mint-service-key.ts webhook register --product gatepass --url https://api.gatepass.example.com/idswyft-webhook\n\n` +
    `  # List webhooks for a specific service product\n` +
    `  tsx mint-service-key.ts webhook list --product gatepass\n\n` +
    `  # Rotate a webhook signing secret\n` +
    `  tsx mint-service-key.ts webhook rotate <webhook-id>\n`,
  );
}

async function dispatchWebhookSubcommand(subcmd: string, args: string[]): Promise<void> {
  switch (subcmd) {
    case 'register': {
      const opts: Partial<WebhookRegisterOpts> = {};
      for (let i = 0; i < args.length; i++) {
        const a = args[i];
        if (a === '--product') {
          opts.product = args[++i] as Product;
        } else if (a.startsWith('--product=')) {
          opts.product = a.slice('--product='.length) as Product;
        } else if (a === '--url') {
          opts.url = args[++i];
        } else if (a.startsWith('--url=')) {
          opts.url = a.slice('--url='.length);
        } else if (a === '--events') {
          opts.events = (args[++i] ?? '').split(',').map((s) => s.trim()).filter(Boolean);
        } else if (a.startsWith('--events=')) {
          opts.events = a.slice('--events='.length).split(',').map((s) => s.trim()).filter(Boolean);
        } else if (a === '--sandbox') {
          opts.isSandbox = true;
        } else {
          fail(`Unknown flag for webhook register: ${a}`);
        }
      }
      if (!opts.product || !opts.url) {
        fail(`webhook register: --product and --url are required.\nValid products: ${VALID_PRODUCTS.join(', ')}`);
      }
      await cmdWebhookRegister(opts as WebhookRegisterOpts);
      break;
    }
    case 'list': {
      let product: Product | undefined;
      for (let i = 0; i < args.length; i++) {
        const a = args[i];
        if (a === '--product') product = args[++i] as Product;
        else if (a.startsWith('--product=')) product = a.slice('--product='.length) as Product;
        else fail(`Unknown flag for webhook list: ${a}`);
      }
      if (product && !VALID_PRODUCTS.includes(product)) {
        fail(`--product must be one of: ${VALID_PRODUCTS.join(', ')}`);
      }
      await cmdWebhookList({ product });
      break;
    }
    case 'rotate': {
      const [id] = args;
      if (!id) fail('Usage: webhook rotate <id>');
      await cmdWebhookRotate(id);
      break;
    }
    case 'delete': {
      const [id] = args;
      if (!id) fail('Usage: webhook delete <id>');
      await cmdWebhookDelete(id);
      break;
    }
    default:
      fail(`Unknown webhook subcommand: ${subcmd}\nValid: register, list, rotate, delete`);
  }
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
    case 'revoke-all': {
      // Parse optional filters: --service-env <env>, --product <product>, --yes
      const opts: RevokeAllOpts = {};
      for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (arg === '--service-env') {
          const v = args[++i];
          if (!VALID_ENVS.includes(v as Environment)) {
            fail(`--service-env must be one of: ${VALID_ENVS.join(', ')} (got ${JSON.stringify(v)})`);
          }
          opts.serviceEnv = v as Environment;
        } else if (arg.startsWith('--service-env=')) {
          const v = arg.slice('--service-env='.length);
          if (!VALID_ENVS.includes(v as Environment)) {
            fail(`--service-env must be one of: ${VALID_ENVS.join(', ')} (got ${JSON.stringify(v)})`);
          }
          opts.serviceEnv = v as Environment;
        } else if (arg === '--product') {
          const v = args[++i];
          if (!VALID_PRODUCTS.includes(v as Product)) {
            fail(`--product must be one of: ${VALID_PRODUCTS.join(', ')} (got ${JSON.stringify(v)})`);
          }
          opts.product = v as Product;
        } else if (arg.startsWith('--product=')) {
          const v = arg.slice('--product='.length);
          if (!VALID_PRODUCTS.includes(v as Product)) {
            fail(`--product must be one of: ${VALID_PRODUCTS.join(', ')} (got ${JSON.stringify(v)})`);
          }
          opts.product = v as Product;
        } else if (arg === '--yes' || arg === '-y') {
          opts.yes = true;
        } else {
          fail(`Unknown flag for revoke-all: ${arg}`);
        }
      }
      await cmdRevokeAll(opts);
      break;
    }
    case 'launch-gatepass': {
      await cmdLaunchGatepass();
      break;
    }
    case 'webhook': {
      const [subcmd, ...subargs] = args;
      if (!subcmd) {
        fail(
          `Usage: webhook <register|list|rotate|delete> [args...]\n` +
            `  webhook register --product <p> --url <url> [--events e1,e2] [--sandbox]\n` +
            `  webhook list [--product <p>]\n` +
            `  webhook rotate <id>\n` +
            `  webhook delete <id>`,
        );
      }
      await dispatchWebhookSubcommand(subcmd, subargs);
      break;
    }
    default:
      fail(`Unknown command: ${cmd}\nRun \`tsx mint-service-key.ts help\` for usage.`);
  }
}

main().catch((err) => {
  fail(err instanceof Error ? err.message : String(err));
});
