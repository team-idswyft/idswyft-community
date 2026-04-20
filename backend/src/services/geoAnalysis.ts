/**
 * IP Geolocation Risk Analysis Service
 *
 * Detects geographic fraud signals by analyzing verification IP addresses:
 * - Country mismatch: IP country doesn't match document's issuing country
 * - Tor exit nodes: Session originates from a Tor exit relay
 * - Datacenter/VPN IPs: Session from a known cloud provider
 * - High-risk country: IP resolves to an elevated-fraud jurisdiction
 *
 * Results feed into risk scoring as a weighted signal (0.07).
 * Flagged sessions route to manual_review, never hard-reject.
 */

import geoip from 'geoip-lite';
import { logger } from '@/utils/logger.js';
import type { GeoAnalysisResult, GeoRiskFlag } from '@idswyft/shared';

// ── Flag scores (highest wins — not cumulative) ─────────────────────
const FLAG_SCORES: Record<GeoRiskFlag, number> = {
  tor_exit_node: 90,
  country_mismatch: 70,
  datacenter_ip: 50,
  high_risk_country: 40,
};

// ── High-risk countries (sanctioned / elevated fraud jurisdictions) ──
const HIGH_RISK_COUNTRIES = new Set([
  'KP', // North Korea
  'IR', // Iran
  'SY', // Syria
  'CU', // Cuba
  'RU', // Russia
  'BY', // Belarus
  'MM', // Myanmar
  'VE', // Venezuela
  'YE', // Yemen
  'SO', // Somalia
]);

// ── Tor exit node cache ─────────────────────────────────────────────
let torExitSet: Set<string> = new Set();
let torLastFetched = 0;
const TOR_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
let torFetchInProgress = false;

/**
 * Fetch Tor exit node list from torproject.org.
 * Cached for 24 hours. Fails gracefully — never blocks pipeline.
 */
async function refreshTorExitList(): Promise<void> {
  if (torFetchInProgress) return;
  torFetchInProgress = true;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000); // 10s timeout
    const res = await fetch('https://check.torproject.org/torbulkexitlist', {
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      logger.warn('Tor exit list fetch failed', { status: res.status });
      return;
    }

    const text = await res.text();
    const ips = text.split('\n')
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('#'));

    torExitSet = new Set(ips);
    torLastFetched = Date.now();
    logger.info(`Tor exit list refreshed: ${torExitSet.size} IPs`);
  } catch (err) {
    logger.warn('Tor exit list fetch failed (non-blocking)', {
      error: err instanceof Error ? err.message : 'Unknown',
    });
  } finally {
    torFetchInProgress = false;
  }
}

// Eagerly populate Tor list on module load so it's ready for the first
// verification. Non-blocking — if it fails, isTorExitNode returns false.
refreshTorExitList().catch(() => {});

/**
 * Check if an IP is a known Tor exit node.
 * Triggers background refresh if cache is stale.
 */
function isTorExitNode(ip: string): boolean {
  if (Date.now() - torLastFetched > TOR_CACHE_TTL_MS) {
    refreshTorExitList().catch(() => {});
  }
  return torExitSet.has(ip);
}

// ── Datacenter/VPN IP prefix detection ──────────────────────────────
// Known datacenter CIDR ranges — specific /16 and /8 prefixes.
// We use targeted ranges rather than broad /8 blocks (e.g. '5.') to
// minimize false positives from residential ISPs sharing the same /8.
const DATACENTER_PREFIXES: string[] = [
  // AWS major ranges
  '3.', '52.', '54.',
  // GCP
  '34.', '35.',
  // Azure
  '20.', '40.',
  // DigitalOcean common /16s
  '167.99.', '164.90.', '134.209.',
  // Hetzner common /16s
  '49.12.', '5.78.', '116.203.', '135.181.', '65.108.', '65.109.',
  // Vultr common /16s
  '45.32.', '45.63.', '45.76.', '45.77.', '104.238.', '108.61.',
];

/**
 * Check if an IP belongs to a known datacenter/cloud provider.
 * Uses prefix matching — fast O(n) check against known ranges.
 */
function isDatacenterIp(ip: string): boolean {
  for (const prefix of DATACENTER_PREFIXES) {
    if (ip.startsWith(prefix)) return true;
  }
  return false;
}

/**
 * Analyze IP geolocation risk for a verification session.
 *
 * @param clientIp - IP address captured at initialization
 * @param documentCountry - ISO alpha-2 from front extraction issuing_country
 */
export async function analyzeGeoRisk(
  clientIp: string | null,
  documentCountry: string | null,
): Promise<GeoAnalysisResult> {
  const flags: GeoRiskFlag[] = [];

  // No IP — can't analyze, return empty result
  if (!clientIp) {
    return {
      ip_country: null,
      ip_region: null,
      ip_city: null,
      document_country: documentCountry,
      is_tor: false,
      is_datacenter: false,
      flags: [],
      score: 0,
    };
  }

  // ── GeoIP lookup ──────────────────────────────────────────────
  const geo = geoip.lookup(clientIp);
  const ipCountry = geo?.country ?? null;
  const ipRegion = geo?.region ?? null;
  const ipCity = geo?.city ?? null;

  // ── Country mismatch ──────────────────────────────────────────
  if (ipCountry && documentCountry && ipCountry.toUpperCase() !== documentCountry.toUpperCase()) {
    flags.push('country_mismatch');
  }

  // ── Tor exit node ─────────────────────────────────────────────
  const isTor = isTorExitNode(clientIp);
  if (isTor) {
    flags.push('tor_exit_node');
  }

  // ── Datacenter/VPN ────────────────────────────────────────────
  const isDatacenter = isDatacenterIp(clientIp);
  if (isDatacenter) {
    flags.push('datacenter_ip');
  }

  // ── High-risk country ─────────────────────────────────────────
  if (ipCountry && HIGH_RISK_COUNTRIES.has(ipCountry.toUpperCase())) {
    flags.push('high_risk_country');
  }

  // Score = highest individual flag score (not cumulative)
  const score = flags.length > 0
    ? Math.max(...flags.map(f => FLAG_SCORES[f]))
    : 0;

  return {
    ip_country: ipCountry,
    ip_region: ipRegion,
    ip_city: ipCity,
    document_country: documentCountry,
    is_tor: isTor,
    is_datacenter: isDatacenter,
    flags,
    score,
  };
}
