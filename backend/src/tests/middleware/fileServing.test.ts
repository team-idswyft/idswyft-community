import { describe, it, expect } from 'vitest';
import { isPathSafe, safeDecode } from '../../middleware/fileServing.js';

describe('isPathSafe (path traversal guard)', () => {
  it('allows a normal relative file path', () => {
    expect(isPathSafe('uploads/documents/file.jpg')).toBe(true);
  });

  it('allows a simple filename', () => {
    expect(isPathSafe('document.pdf')).toBe(true);
  });

  it('blocks classic path traversal', () => {
    expect(isPathSafe('../etc/passwd')).toBe(false);
  });

  it('blocks traversal buried inside the path', () => {
    expect(isPathSafe('uploads/../../../etc/passwd')).toBe(false);
  });

  it('blocks absolute paths', () => {
    expect(isPathSafe('/absolute/path')).toBe(false);
    expect(isPathSafe('/etc/passwd')).toBe(false);
  });

  it('blocks URL-encoded traversal that escapes uploads base (%2e%2e)', () => {
    // %2e%2e decodes to ".." — two levels up goes outside UPLOADS_BASE
    expect(isPathSafe('%2e%2e/etc/passwd')).toBe(false);
    expect(isPathSafe('uploads/%2e%2e/%2e%2e/etc/passwd')).toBe(false);
  });

  it('blocks double-encoded traversal (%252e%252e)', () => {
    // %252e decodes to %2e on first pass, then to "." on second — classic bypass
    expect(isPathSafe('%252e%252e/%252e%252e/etc/passwd')).toBe(false);
  });
});

describe('safeDecode', () => {
  it('returns absolute path for valid relative input', () => {
    const result = safeDecode('documents/file.jpg');
    expect(result).toBeTruthy();
    expect(result).toContain('documents');
    expect(result).toContain('file.jpg');
  });

  it('returns null for path traversal', () => {
    expect(safeDecode('../../etc/passwd')).toBeNull();
  });

  it('returns null for double-encoded paths', () => {
    expect(safeDecode('%252e%252e/%252e%252e/etc/passwd')).toBeNull();
  });

  it('returns null for absolute paths', () => {
    expect(safeDecode('/etc/passwd')).toBeNull();
  });
});
