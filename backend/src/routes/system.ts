import express, { Request, Response } from 'express';
import { authenticateDeveloperJWT } from '@/middleware/auth.js';
import { catchAsync } from '@/middleware/errorHandler.js';
import { APP_VERSION } from '@/utils/version.js';

const router = express.Router();

// In-memory cache for latest version (1 hour TTL)
let cachedLatest: { version: string; url: string; fetchedAt: number } | null = null;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

function isNewerVersion(latest: string, current: string): boolean {
  const parse = (v: string) => v.replace(/^v/, '').split('.').map(Number);
  const [lMajor, lMinor, lPatch] = parse(latest);
  const [cMajor, cMinor, cPatch] = parse(current);
  if (lMajor !== cMajor) return lMajor > cMajor;
  if (lMinor !== cMinor) return lMinor > cMinor;
  return lPatch > cPatch;
}

async function fetchLatestRelease(): Promise<{ version: string; url: string } | null> {
  // Return cache if still fresh
  if (cachedLatest && Date.now() - cachedLatest.fetchedAt < CACHE_TTL_MS) {
    return { version: cachedLatest.version, url: cachedLatest.url };
  }

  try {
    const res = await fetch(
      'https://api.github.com/repos/team-idswyft/idswyft-community/releases/latest',
      {
        headers: { 'Accept': 'application/vnd.github+json', 'User-Agent': 'idswyft-backend' },
        signal: AbortSignal.timeout(5000),
      }
    );
    if (!res.ok) throw new Error(`GitHub API ${res.status}`);
    const data = await res.json();
    if (!data.tag_name || !data.html_url) throw new Error('Unexpected GitHub response');
    const version = (data.tag_name as string).replace(/^v/, '');
    const url = data.html_url as string;
    cachedLatest = { version, url, fetchedAt: Date.now() };
    return { version, url };
  } catch {
    // Return stale cache on failure
    if (cachedLatest) {
      return { version: cachedLatest.version, url: cachedLatest.url };
    }
    return null;
  }
}

// GET /api/system/version
router.get('/version', authenticateDeveloperJWT as any, catchAsync(async (req: Request, res: Response) => {
  const latest = await fetchLatestRelease();

  const response: Record<string, unknown> = {
    current_version: APP_VERSION,
  };

  if (latest) {
    response.latest_version = latest.version;
    response.update_available = isNewerVersion(latest.version, APP_VERSION);
    response.release_url = latest.url;
  } else {
    response.latest_version = null;
    response.update_available = false;
    response.release_url = null;
  }

  // Watchtower auto-update status probe
  const watchtowerToken = process.env.WATCHTOWER_API_TOKEN;
  if (watchtowerToken) {
    const wt: Record<string, unknown> = { configured: true, running: false };
    try {
      const wtRes = await fetch('http://watchtower:8080/v1/metrics', {
        headers: { Authorization: `Bearer ${watchtowerToken}` },
        signal: AbortSignal.timeout(2000),
      });
      if (wtRes.ok) {
        const body = await wtRes.text();
        wt.running = true;
        const extract = (key: string): number | null => {
          const m = body.match(new RegExp(`${key}\\s+(\\d+)`));
          return m ? Number(m[1]) : null;
        };
        wt.containers_scanned = extract('watchtower_containers_scanned');
        wt.containers_updated = extract('watchtower_containers_updated');
        wt.containers_failed = extract('watchtower_containers_failed');
      }
    } catch {
      // Watchtower not reachable — configured but not running
    }
    response.watchtower = wt;
  } else {
    response.watchtower = { configured: false, running: false };
  }

  res.json(response);
}));

export default router;
