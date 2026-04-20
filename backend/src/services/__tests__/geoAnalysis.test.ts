/**
 * Unit tests for the IP geolocation risk analysis service.
 *
 * Tests verify country mismatch detection, Tor exit node detection,
 * datacenter IP detection, high-risk country flagging, and scoring.
 * geoip-lite is mocked to control IP lookup results.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock geoip-lite before importing the service ────────────────────
const mockLookup = vi.fn();

vi.mock('geoip-lite', () => ({
  default: { lookup: mockLookup },
}));

// Must import AFTER vi.mock
const { analyzeGeoRisk } = await import('../geoAnalysis.js');

describe('analyzeGeoRisk', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns empty result with score 0 when IP is null', async () => {
    const result = await analyzeGeoRisk(null, 'US');

    expect(result.ip_country).toBeNull();
    expect(result.ip_region).toBeNull();
    expect(result.ip_city).toBeNull();
    expect(result.document_country).toBe('US');
    expect(result.is_tor).toBe(false);
    expect(result.is_datacenter).toBe(false);
    expect(result.flags).toEqual([]);
    expect(result.score).toBe(0);
  });

  it('returns valid geo data for a known public IP', async () => {
    mockLookup.mockReturnValue({
      country: 'US',
      region: 'CA',
      city: 'Mountain View',
    });

    const result = await analyzeGeoRisk('8.8.8.8', 'US');

    expect(result.ip_country).toBe('US');
    expect(result.ip_region).toBe('CA');
    expect(result.ip_city).toBe('Mountain View');
    expect(result.document_country).toBe('US');
    expect(result.flags).toEqual([]);
    expect(result.score).toBe(0);
  });

  it('returns country_mismatch flag when IP country differs from document country', async () => {
    mockLookup.mockReturnValue({
      country: 'NG',
      region: '',
      city: 'Lagos',
    });

    const result = await analyzeGeoRisk('41.58.1.1', 'US');

    expect(result.flags).toContain('country_mismatch');
    expect(result.score).toBe(70);
  });

  it('does not flag country_mismatch when countries match', async () => {
    mockLookup.mockReturnValue({
      country: 'US',
      region: 'NY',
      city: 'New York',
    });

    const result = await analyzeGeoRisk('74.65.1.1', 'US');

    expect(result.flags).not.toContain('country_mismatch');
    expect(result.score).toBe(0);
  });

  it('does not flag country_mismatch when document country is null', async () => {
    mockLookup.mockReturnValue({
      country: 'DE',
      region: '',
      city: 'Berlin',
    });

    const result = await analyzeGeoRisk('1.2.3.4', null);

    expect(result.flags).not.toContain('country_mismatch');
  });

  it('does not flag country_mismatch when geoip lookup returns no country', async () => {
    mockLookup.mockReturnValue(null);

    const result = await analyzeGeoRisk('192.168.1.1', 'US');

    expect(result.flags).not.toContain('country_mismatch');
    expect(result.ip_country).toBeNull();
  });

  it('returns datacenter_ip flag for known cloud provider IPs', async () => {
    mockLookup.mockReturnValue({
      country: 'US',
      region: '',
      city: '',
    });

    // 52.x.x.x is AWS
    const result = await analyzeGeoRisk('52.95.110.1', 'US');

    expect(result.flags).toContain('datacenter_ip');
    expect(result.is_datacenter).toBe(true);
    expect(result.score).toBe(50);
  });

  it('returns high_risk_country flag for sanctioned countries', async () => {
    mockLookup.mockReturnValue({
      country: 'KP',
      region: '',
      city: '',
    });

    const result = await analyzeGeoRisk('175.45.176.1', null);

    expect(result.flags).toContain('high_risk_country');
    expect(result.score).toBe(40);
  });

  it('score is the highest individual flag score (not cumulative)', async () => {
    // IP from North Korea + country mismatch = high_risk_country(40) + country_mismatch(70)
    mockLookup.mockReturnValue({
      country: 'KP',
      region: '',
      city: '',
    });

    const result = await analyzeGeoRisk('175.45.176.1', 'US');

    expect(result.flags).toContain('country_mismatch');
    expect(result.flags).toContain('high_risk_country');
    // Score should be max (country_mismatch = 70), not sum
    expect(result.score).toBe(70);
  });

  it('handles geoip lookup returning null gracefully', async () => {
    mockLookup.mockReturnValue(null);

    const result = await analyzeGeoRisk('0.0.0.0', 'US');

    expect(result.ip_country).toBeNull();
    expect(result.ip_region).toBeNull();
    expect(result.ip_city).toBeNull();
    expect(result.score).toBe(0);
  });

  it('case-insensitive country comparison', async () => {
    mockLookup.mockReturnValue({
      country: 'us',
      region: '',
      city: '',
    });

    const result = await analyzeGeoRisk('8.8.8.8', 'US');

    expect(result.flags).not.toContain('country_mismatch');
  });

  it('detects multiple flags simultaneously', async () => {
    // Datacenter IP from high-risk country with country mismatch
    mockLookup.mockReturnValue({
      country: 'RU',
      region: '',
      city: '',
    });

    // 52.x is AWS (datacenter) + RU is high-risk + mismatch with US doc
    const result = await analyzeGeoRisk('52.1.1.1', 'US');

    expect(result.flags).toContain('country_mismatch');
    expect(result.flags).toContain('datacenter_ip');
    expect(result.flags).toContain('high_risk_country');
    // Score = max(country_mismatch=70, datacenter_ip=50, high_risk_country=40) = 70
    expect(result.score).toBe(70);
  });
});
