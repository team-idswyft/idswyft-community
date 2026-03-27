import path from 'path';
import fs from 'fs/promises';
import { Request, Response } from 'express';

const UPLOADS_BASE = path.resolve(process.cwd(), 'uploads');

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
 * Express handler that serves a file from the uploads directory.
 * Only registered when STORAGE_PROVIDER=local.
 * Requires API key authentication (applied in server.ts).
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
    res.sendFile(absolutePath);
  } catch {
    res.status(404).json({ error: 'File not found' });
  }
}
