import path from 'path';
import fs from 'fs/promises';
import { Request, Response } from 'express';
import config from '@/config/index.js';

const UPLOADS_BASE = path.resolve(process.cwd(), 'uploads');

/** Folders allowed to be served without authentication. */
const PUBLIC_ASSET_FOLDERS = ['avatars', 'branding'];

/**
 * Decode a percent-encoded relative path and resolve it within UPLOADS_BASE.
 * Returns the absolute path if safe, or null if the path is invalid/escapes the base.
 */
export function safeDecode(filePath: string): string | null {
  // Reject absolute paths immediately
  if (path.isAbsolute(filePath)) return null;

  // Decode percent-encoded characters once
  let decoded: string;
  try {
    decoded = decodeURIComponent(filePath);
  } catch {
    return null;
  }

  // Reject if a second decode would produce a different value (double-encoding attack)
  try {
    if (decodeURIComponent(decoded) !== decoded) return null;
  } catch {
    // decodeURIComponent threw — decoded contained an invalid sequence, which is fine
  }

  const resolved = path.resolve(UPLOADS_BASE, decoded);
  if (!resolved.startsWith(UPLOADS_BASE + path.sep) && resolved !== UPLOADS_BASE) {
    return null;
  }
  return resolved;
}

// Keep the old name as an alias for any existing consumers
export function isPathSafe(filePath: string): boolean {
  return safeDecode(filePath) !== null;
}

/**
 * Map a file extension to a MIME type for Content-Type headers when serving
 * via res.send(buffer) instead of res.sendFile (which infers it automatically).
 */
function mimeFromPath(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const mimes: Record<string, string> = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.pdf': 'application/pdf',
  };
  return mimes[ext] || 'application/octet-stream';
}

/**
 * Express handler that serves a file from the uploads directory.
 * Only registered when STORAGE_PROVIDER=local.
 * Requires API key authentication (applied in server.ts).
 *
 * When STORAGE_ENCRYPTION=true, reads via the StorageService so envelope-
 * encrypted bytes get decrypted before they reach the wire. Otherwise
 * defaults to res.sendFile for native streaming performance.
 */
export async function serveLocalFile(req: Request, res: Response): Promise<void> {
  const requestedPath = (req.params as any)[0]; // everything after /api/files/

  // Decode + validate once — same resolved path used for serving
  const absolutePath = requestedPath ? safeDecode(requestedPath) : null;
  if (!absolutePath) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  try {
    await fs.access(absolutePath);
  } catch {
    res.status(404).json({ error: 'File not found' });
    return;
  }

  // When encryption is enabled, on-disk bytes are ciphertext — read through
  // StorageService so maybeDecryptBlob runs on the response path.
  if (config.storage.encryption) {
    try {
      const { StorageService } = await import('@/services/storage.js');
      const storage = new StorageService();
      // downloadFile takes a path relative to cwd (e.g. "uploads/documents/abc.jpg").
      const relPath = path.relative(process.cwd(), absolutePath).replace(/\\/g, '/');
      const buffer = await storage.downloadFile(relPath);
      res.setHeader('Content-Type', mimeFromPath(absolutePath));
      res.send(buffer);
      return;
    } catch {
      res.status(404).json({ error: 'File not found' });
      return;
    }
  }

  res.sendFile(absolutePath);
}

/**
 * Serve public assets (branding logos, avatars).
 * Scoped to PUBLIC_ASSET_FOLDERS only — no auth required.
 * Handles both local filesystem and S3 storage providers.
 */
export async function servePublicAsset(req: Request, res: Response): Promise<void> {
  const requestedPath = (req.params as any)[0]; // everything after /api/public/assets/

  if (!requestedPath) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  // Only allow serving from explicitly public folders
  const folder = requestedPath.split('/')[0];
  if (!PUBLIC_ASSET_FOLDERS.includes(folder)) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  // ── Local filesystem ─────────────────────────────
  if (config.storage.provider === 'local') {
    const absolutePath = safeDecode(requestedPath);
    if (!absolutePath) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    try {
      await fs.access(absolutePath);
    } catch {
      res.status(404).json({ error: 'File not found' });
      return;
    }

    // When encryption is enabled, on-disk bytes are ciphertext — read through
    // StorageService so maybeDecryptBlob runs on the response path.
    if (config.storage.encryption) {
      try {
        const { StorageService } = await import('@/services/storage.js');
        const storage = new StorageService();
        const relPath = path.relative(process.cwd(), absolutePath).replace(/\\/g, '/');
        const buffer = await storage.downloadFile(relPath);
        res.setHeader('Content-Type', mimeFromPath(absolutePath));
        res.setHeader('Cache-Control', 'public, max-age=3600');
        res.send(buffer);
        return;
      } catch {
        res.status(404).json({ error: 'File not found' });
        return;
      }
    }

    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.sendFile(absolutePath);
    return;
  }

  // ── S3 storage (proxy through API server) ────────
  if (config.storage.provider === 's3') {
    // Only allow safe characters in the key
    if (!/^[a-zA-Z0-9_\-./]+$/.test(requestedPath)) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    // Normalize and re-validate to block path traversal (e.g. avatars/../../documents/secret)
    const normalized = path.posix.normalize(requestedPath);
    if (normalized.startsWith('..') || normalized.startsWith('/')) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    const normalizedFolder = normalized.split('/')[0];
    if (!PUBLIC_ASSET_FOLDERS.includes(normalizedFolder)) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    try {
      const { StorageService } = await import('@/services/storage.js');
      const storage = new StorageService();
      const buffer = await storage.downloadFile(normalized);

      const ext = path.extname(normalized).toLowerCase();
      const mimeTypes: Record<string, string> = {
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
      };
      const contentType = mimeTypes[ext] || 'application/octet-stream';

      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.send(buffer);
    } catch {
      res.status(404).json({ error: 'File not found' });
    }
    return;
  }

  res.status(404).json({ error: 'File not found' });
}
