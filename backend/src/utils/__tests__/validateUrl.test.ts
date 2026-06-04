import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  isPrivateIp,
  validateWebhookUrl,
  validateDownloadUrl,
  safeFetch,
  SsrfError,
} from '../validateUrl.js';

describe('isPrivateIp', () => {
  describe('IPv4', () => {
    // The full table of ranges we expect to reject — drives test data.
    const PRIVATE_V4 = [
      '0.0.0.0',                // unspecified
      '10.0.0.1',               // RFC1918
      '10.255.255.254',         // RFC1918
      '100.64.0.1',             // CGN
      '127.0.0.1',              // loopback
      '127.255.255.254',        // loopback
      '169.254.1.1',            // link-local
      '169.254.169.254',        // AWS / DigitalOcean / Azure metadata
      '172.16.0.1',             // RFC1918
      '172.31.255.254',         // RFC1918
      '192.168.0.1',            // RFC1918
      '192.168.255.254',        // RFC1918
      '224.0.0.1',              // multicast
      '239.255.255.254',        // multicast
      '240.0.0.1',              // reserved
      '255.255.255.255',        // broadcast
    ];
    const PUBLIC_V4 = [
      '1.1.1.1',                // Cloudflare DNS
      '8.8.8.8',                // Google DNS
      '142.250.80.46',          // google.com
      '13.107.42.14',           // microsoft.com
    ];

    it.each(PRIVATE_V4)('%s is private', (ip) => {
      expect(isPrivateIp(ip)).toBe(true);
    });

    it.each(PUBLIC_V4)('%s is public', (ip) => {
      expect(isPrivateIp(ip)).toBe(false);
    });
  });

  describe('IPv6', () => {
    const PRIVATE_V6 = [
      '::1',                     // loopback
      '::',                      // unspecified
      'fc00::1',                 // ULA
      'fd00:dead:beef::1',       // ULA
      'fe80::1',                 // link-local
      'ff02::1',                 // multicast
      '::ffff:127.0.0.1',        // IPv4-mapped (reject all by policy)
      '::ffff:8.8.8.8',          // IPv4-mapped (reject all — bypass vector)
    ];
    const PUBLIC_V6 = [
      '2606:4700:4700::1111',    // Cloudflare DNS
      '2001:4860:4860::8888',    // Google DNS
    ];

    it.each(PRIVATE_V6)('%s is private', (ip) => {
      expect(isPrivateIp(ip)).toBe(true);
    });

    it.each(PUBLIC_V6)('%s is public', (ip) => {
      expect(isPrivateIp(ip)).toBe(false);
    });
  });

  it('returns false for non-IP strings (caller must DNS-resolve first)', () => {
    expect(isPrivateIp('example.com')).toBe(false);
    expect(isPrivateIp('not-an-ip')).toBe(false);
    expect(isPrivateIp('')).toBe(false);
  });
});

describe('validateWebhookUrl', () => {
  it('rejects non-HTTP protocols', async () => {
    await expect(validateWebhookUrl('ftp://example.com/x')).rejects.toThrow(SsrfError);
    await expect(validateWebhookUrl('file:///etc/passwd')).rejects.toThrow(SsrfError);
    await expect(validateWebhookUrl('gopher://example.com')).rejects.toThrow(SsrfError);
  });

  it('rejects malformed URLs', async () => {
    await expect(validateWebhookUrl('not a url')).rejects.toThrow(SsrfError);
  });

  it('rejects localhost hostname', async () => {
    await expect(validateWebhookUrl('http://localhost/hook')).rejects.toThrow(SsrfError);
    await expect(validateWebhookUrl('https://localhost:8080/hook')).rejects.toThrow(SsrfError);
  });

  it('rejects .internal / .local / .localhost suffixes', async () => {
    await expect(validateWebhookUrl('http://api.railway.internal/x')).rejects.toThrow(SsrfError);
    await expect(validateWebhookUrl('http://service.local/x')).rejects.toThrow(SsrfError);
    await expect(validateWebhookUrl('http://router.localhost/x')).rejects.toThrow(SsrfError);
  });

  it('rejects IPv4 literals in all standard private ranges', async () => {
    const privateUrls = [
      'http://127.0.0.1/hook',
      'http://10.0.0.1/hook',
      'http://172.16.0.1/hook',
      'http://192.168.0.1/hook',
      'http://169.254.169.254/latest/meta-data/',
      'http://0.0.0.0/hook',
    ];
    for (const url of privateUrls) {
      await expect(validateWebhookUrl(url)).rejects.toThrow(SsrfError);
    }
  });

  it('rejects IPv6 literals in private ranges', async () => {
    await expect(validateWebhookUrl('http://[::1]/hook')).rejects.toThrow(SsrfError);
    await expect(validateWebhookUrl('http://[fc00::1]/hook')).rejects.toThrow(SsrfError);
    await expect(validateWebhookUrl('http://[fe80::1]/hook')).rejects.toThrow(SsrfError);
  });

  it('rejects IPv4-mapped IPv6 literals (bypass vector)', async () => {
    await expect(validateWebhookUrl('http://[::ffff:127.0.0.1]/hook')).rejects.toThrow(SsrfError);
    // Even a public IPv4 mapped into IPv6 — no legitimate use case.
    await expect(validateWebhookUrl('http://[::ffff:8.8.8.8]/hook')).rejects.toThrow(SsrfError);
  });

  it('rejects decimal-encoded IPv4 (URL parser leaves these as-is)', async () => {
    // 2130706433 = 127.0.0.1 — the bypass we explicitly defend against.
    await expect(validateWebhookUrl('http://2130706433/hook')).rejects.toThrow(SsrfError);
    // 2852039166 = 169.254.169.254 (AWS metadata)
    await expect(validateWebhookUrl('http://2852039166/latest/meta-data/')).rejects.toThrow(SsrfError);
  });

  it('rejects when DNS resolution fails (closed by default)', async () => {
    await expect(
      validateWebhookUrl('http://this-host-cannot-resolve-anywhere.example.invalid/hook'),
    ).rejects.toThrow(SsrfError);
  });
});

describe('validateDownloadUrl', () => {
  it('rejects HTTP (HTTPS only for downloads)', async () => {
    await expect(validateDownloadUrl('http://example.com/doc.pdf')).rejects.toThrow(SsrfError);
  });

  it('rejects non-HTTP/HTTPS protocols', async () => {
    await expect(validateDownloadUrl('file:///etc/passwd')).rejects.toThrow(SsrfError);
    await expect(validateDownloadUrl('ftp://example.com/doc.pdf')).rejects.toThrow(SsrfError);
  });

  it('rejects private hosts even when HTTPS', async () => {
    await expect(validateDownloadUrl('https://127.0.0.1/doc.pdf')).rejects.toThrow(SsrfError);
    await expect(validateDownloadUrl('https://169.254.169.254/secrets')).rejects.toThrow(SsrfError);
  });
});

describe('safeFetch', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    // Replace globalThis.fetch with a controllable mock — keeps the test
    // hermetic regardless of network state.
    (globalThis as any).fetch = vi.fn();
  });

  afterEach(() => {
    (globalThis as any).fetch = originalFetch;
  });

  it('refuses 3xx redirect responses (defeats redirect-based SSRF)', async () => {
    // Pre-validate is async; bypass it by stubbing validateDownloadUrl
    // indirectly via a public URL that DOES resolve. We need a hostname
    // that resolves to a public IP for the validator to pass, then fetch
    // returns a 302 we expect safeFetch to refuse.
    (globalThis as any).fetch = vi.fn().mockResolvedValue(
      new Response(null, { status: 302, headers: { Location: 'http://127.0.0.1/' } }),
    );

    await expect(safeFetch('https://example.com/doc.pdf')).rejects.toThrow(SsrfError);
    expect((globalThis as any).fetch).toHaveBeenCalledWith(
      'https://example.com/doc.pdf',
      expect.objectContaining({ redirect: 'manual' }),
    );
  });

  it('passes through 2xx responses', async () => {
    const buf = Buffer.from('hello');
    (globalThis as any).fetch = vi.fn().mockResolvedValue(
      new Response(buf, { status: 200 }),
    );

    const res = await safeFetch('https://example.com/doc.pdf');
    expect(res.status).toBe(200);
  });

  it('runs validation before fetch (rejects bad URL without network call)', async () => {
    const fetchMock = vi.fn();
    (globalThis as any).fetch = fetchMock;

    await expect(safeFetch('https://127.0.0.1/doc.pdf')).rejects.toThrow(SsrfError);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
