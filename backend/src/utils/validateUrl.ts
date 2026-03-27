/**
 * Shared URL validation for SSRF prevention.
 * Blocks private/reserved network targets and internal networking domains.
 */

/** Block SSRF: reject private/reserved network targets. */
export function validateWebhookUrl(raw: string): void {
  const parsed = new URL(raw);
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error('Only HTTP and HTTPS URLs are allowed');
  }
  assertNotPrivateHost(parsed.hostname);
}

/** Block SSRF for download URLs: HTTPS only + no private hosts. */
export function validateDownloadUrl(raw: string): void {
  const parsed = new URL(raw);
  if (parsed.protocol !== 'https:') {
    throw new Error('Only HTTPS URLs are allowed for document downloads');
  }
  assertNotPrivateHost(parsed.hostname);
}

function assertNotPrivateHost(h: string): void {
  if (
    h === 'localhost' ||
    h.startsWith('127.') ||
    h.startsWith('10.') ||
    h.startsWith('192.168.') ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(h) ||
    h.startsWith('169.254.') ||
    h === '0.0.0.0' ||
    h === '::1' ||
    h === '::' ||
    h.endsWith('.internal')
  ) {
    throw new Error('URLs pointing to private/reserved networks are not allowed');
  }
}
