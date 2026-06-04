/**
 * Shared URL validation for SSRF prevention.
 *
 * Three layers of defense, all required:
 *   1. **Pre-validate at write time** — hostname-string blocklist + DNS resolution
 *      catches obvious targets (`localhost`, `*.internal`) and DNS-pinning
 *      attacks (`evil.example A 169.254.169.254`).
 *   2. **Pre-validate at use time** — re-running validation before every
 *      delivery/download closes the DNS-rebinding window where the
 *      registration-time lookup returned a public IP but the delivery-time
 *      lookup returns a private one.
 *   3. **Re-check at connect time** — the safe http/https Agent intercepts
 *      the kernel DNS callback and refuses to open a socket to a private
 *      address. This is the only layer that can defeat redirects to internal
 *      targets *and* the narrow race between resolve and connect.
 *
 * Plus: every consumer must set `maxRedirects: 0` (axios) or
 * `redirect: 'manual'` (fetch) so redirects don't become a side-channel for
 * the application code to issue a second outbound request without re-running
 * validation.
 */

import { promises as dnsPromises, lookup as dnsLookup } from 'dns';
import net from 'net';
import { Agent as HttpAgent } from 'http';
import { Agent as HttpsAgent } from 'https';
import ipaddr from 'ipaddr.js';

// ─── Errors ────────────────────────────────────────────────────────────────

/**
 * Thrown when a URL is rejected because it could enable SSRF. Distinct class
 * so callers (webhook test endpoints, batch download workers) can return a
 * generic public-facing message instead of leaking the specific bypass
 * vector or internal IP that triggered the rejection.
 */
export class SsrfError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SsrfError';
  }
}

// ─── IP classification ─────────────────────────────────────────────────────

/**
 * True if `ip` (any standard textual encoding) belongs to a private/reserved
 * range — anything ipaddr.js classifies as something other than 'unicast'.
 *
 * Covers: 0.0.0.0/8, 10/8, 100.64/10 (CGN), 127/8, 169.254/16 (link-local +
 * metadata), 172.16/12, 192.168/16, 224/4 (multicast), 240/4 (reserved),
 * 255.255.255.255 (broadcast); ::1 (loopback), ::ffff:0:0/96 (IPv4-mapped),
 * fc00::/7 (ULA), fe80::/10 (link-local), ff00::/8 (multicast), and a few
 * benchmarking / documentation ranges. ipaddr.js maintains the table.
 *
 * For ipv4Mapped IPv6 (`::ffff:1.2.3.4`), the range is reported as
 * `'ipv4Mapped'` regardless of whether the embedded IPv4 would itself be
 * unicast — we reject all of them. Sending traffic to an IPv4-mapped IPv6
 * literal on the public internet has no legitimate use case and the mapping
 * is a known SSRF bypass.
 */
export function isPrivateIp(ip: string): boolean {
  if (!net.isIP(ip)) return false;
  try {
    const addr = ipaddr.parse(ip);
    return addr.range() !== 'unicast';
  } catch {
    // Defense in depth — if ipaddr.js can't classify, refuse to connect.
    return true;
  }
}

// ─── Hostname checks ───────────────────────────────────────────────────────

const BLOCKED_HOSTNAMES = new Set(['localhost', '']);
const BLOCKED_SUFFIXES = ['.internal', '.local', '.localhost'];

/** Decimal-encoded IPv4 (e.g. "2130706433" → 127.0.0.1) — the URL parser
 * keeps the literal hostname here, but `dns.lookup` would interpret it as a
 * uint32. Surface the dotted form so the IP check finds it. */
function decodeDecimalIpv4(hostname: string): string | null {
  if (!/^\d+$/.test(hostname)) return null;
  let n: bigint;
  try {
    n = BigInt(hostname);
  } catch {
    return null;
  }
  if (n < 0n || n > 0xffffffffn) return null;
  return [
    Number((n >> 24n) & 0xffn),
    Number((n >> 16n) & 0xffn),
    Number((n >> 8n) & 0xffn),
    Number(n & 0xffn),
  ].join('.');
}

async function assertHostnameNotPrivate(hostname: string): Promise<void> {
  // Strip IPv6 brackets if present, lowercase for suffix comparison.
  const h = hostname.replace(/^\[|\]$/g, '').toLowerCase();

  if (BLOCKED_HOSTNAMES.has(h)) {
    throw new SsrfError('URLs pointing to internal hostnames are not allowed');
  }
  for (const suffix of BLOCKED_SUFFIXES) {
    if (h.endsWith(suffix)) {
      throw new SsrfError(`URLs pointing to ${suffix} domains are not allowed`);
    }
  }

  // IP literal — check directly without DNS.
  if (net.isIP(h)) {
    if (isPrivateIp(h)) {
      throw new SsrfError('URLs pointing to private/reserved networks are not allowed');
    }
    return;
  }

  // Decimal IPv4 encoding (the URL parser doesn't expand it).
  const decimalDecoded = decodeDecimalIpv4(h);
  if (decimalDecoded) {
    if (isPrivateIp(decimalDecoded)) {
      throw new SsrfError('URLs pointing to private/reserved networks are not allowed');
    }
    return;
  }

  // Hostname — resolve via DNS and reject if ANY resolved address is private.
  // Using `all: true` so we catch dual-stack (A+AAAA) cases where one record
  // is public bait and another points internal.
  let addresses: { address: string; family: number }[];
  try {
    addresses = await dnsPromises.lookup(h, { all: true });
  } catch {
    throw new SsrfError(`Cannot resolve hostname: ${h}`);
  }
  if (addresses.length === 0) {
    throw new SsrfError(`Cannot resolve hostname: ${h}`);
  }
  for (const { address } of addresses) {
    if (isPrivateIp(address)) {
      throw new SsrfError('Hostname resolves to a private/reserved address');
    }
  }
}

// ─── Public validators ────────────────────────────────────────────────────

/**
 * Block SSRF: reject HTTP/HTTPS URLs whose hostname resolves to a private or
 * reserved network. Async because it does DNS lookups.
 *
 * Used at webhook create/update time AND should be re-run at delivery time
 * to close the DNS-rebinding window between registration and delivery.
 */
export async function validateWebhookUrl(raw: string): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new SsrfError('Invalid URL');
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new SsrfError('Only HTTP and HTTPS URLs are allowed');
  }
  await assertHostnameNotPrivate(parsed.hostname);
}

/**
 * Block SSRF for document downloads: HTTPS only + no private hosts. Async
 * because it does DNS lookups.
 */
export async function validateDownloadUrl(raw: string): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new SsrfError('Invalid URL');
  }
  if (parsed.protocol !== 'https:') {
    throw new SsrfError('Only HTTPS URLs are allowed for document downloads');
  }
  await assertHostnameNotPrivate(parsed.hostname);
}

// ─── Safe Agent (for axios) ───────────────────────────────────────────────

/**
 * Custom DNS lookup that rejects private IPs at connection time. This is the
 * layer that defeats DNS rebinding (the registration-time DNS returns a
 * public IP, but the connection-time DNS — milliseconds later — returns
 * 127.0.0.1).
 *
 * Native http/https Agents accept a `lookup` option that overrides `dns.lookup`
 * per-connection. We wrap the default lookup and gate the callback on the
 * resolved address.
 */
function safeLookup(
  hostname: string,
  options: any,
  callback: (err: NodeJS.ErrnoException | null, address: any, family?: number) => void,
): void {
  dnsLookup(hostname, options ?? {}, (err: NodeJS.ErrnoException | null, address: any, family?: number | any) => {
    if (err) return callback(err, address, family as number);

    // dns.lookup callback shape depends on whether `all: true` was passed.
    if (Array.isArray(address)) {
      const filtered = address.filter((a: any) => !isPrivateIp(a.address));
      if (filtered.length === 0) {
        return callback(
          Object.assign(new Error('Refused to connect: hostname resolves only to private addresses'), { code: 'ESSRFBLOCKED' }),
          [],
          0,
        );
      }
      return callback(null, filtered, 0);
    }

    if (typeof address === 'string' && isPrivateIp(address)) {
      return callback(
        Object.assign(new Error('Refused to connect: resolved address is private'), { code: 'ESSRFBLOCKED' }),
        '',
        0,
      );
    }
    return callback(null, address, family as number);
  });
}

let _safeHttpAgent: HttpAgent | null = null;
let _safeHttpsAgent: HttpsAgent | null = null;

/** http.Agent with a `lookup` that refuses connections to private IPs. */
export function getSafeHttpAgent(): HttpAgent {
  if (!_safeHttpAgent) {
    _safeHttpAgent = new HttpAgent({ keepAlive: true, lookup: safeLookup as any });
  }
  return _safeHttpAgent;
}

/** https.Agent with a `lookup` that refuses connections to private IPs. */
export function getSafeHttpsAgent(): HttpsAgent {
  if (!_safeHttpsAgent) {
    _safeHttpsAgent = new HttpsAgent({ keepAlive: true, lookup: safeLookup as any });
  }
  return _safeHttpsAgent;
}

// ─── safeFetch (for native fetch / undici) ────────────────────────────────

/**
 * fetch() wrapper that pre-validates the URL and refuses redirects. Used for
 * document downloads where the alternative axios+Agent path is overkill.
 *
 * Native `fetch()` (undici) doesn't expose a per-request `lookup` hook on the
 * default dispatcher; we defend via the two layers we CAN control:
 *   - pre-validation with DNS resolve + private-IP check
 *   - `redirect: 'manual'` so the application code never silently chases a
 *     302 to an internal target. 3xx responses become explicit rejections.
 */
export async function safeFetch(url: string, init: RequestInit = {}): Promise<Response> {
  await validateDownloadUrl(url);
  const response = await fetch(url, { ...init, redirect: 'manual' });
  if (response.status >= 300 && response.status < 400) {
    throw new SsrfError(`Download URL responded with ${response.status} redirect; refusing to follow`);
  }
  return response;
}
