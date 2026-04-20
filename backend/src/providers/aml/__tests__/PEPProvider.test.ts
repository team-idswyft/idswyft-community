import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PEPProvider, PEP_LISTS_CHECKED } from '../PEPProvider.js';

vi.mock('@/utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

function mockFetchResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    json: () => Promise.resolve(body),
  } as Response;
}

const EMPTY_RESPONSE = {
  responses: {
    q1: { results: [] },
  },
};

/** High-confidence PEP match (score 0.92). */
const PEP_MATCH_RESPONSE = {
  responses: {
    q1: {
      results: [
        {
          id: 'pep-12345',
          caption: 'Angela Merkel',
          score: 0.92,
          datasets: ['opensanctions-pep', 'de_bundestag'],
        },
      ],
    },
  },
};

/** Mid-range PEP match (score 0.65). */
const MID_SCORE_RESPONSE = {
  responses: {
    q1: {
      results: [
        {
          id: 'pep-67890',
          caption: 'A. Merkel',
          score: 0.65,
          datasets: ['opensanctions-pep'],
        },
      ],
    },
  },
};

/** Below-threshold result. */
const LOW_SCORE_RESPONSE = {
  responses: {
    q1: {
      results: [
        {
          id: 'pep-99999',
          caption: 'Jane Smith',
          score: 0.3,
          datasets: ['opensanctions-pep'],
        },
      ],
    },
  },
};

describe('PEPProvider', () => {
  let provider: PEPProvider;
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    provider = new PEPProvider('test-api-key');
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  // ── Never confirmed_match ────────────────────────────────

  it('returns potential_match (never confirmed_match) even for high scores', async () => {
    fetchSpy.mockResolvedValueOnce(mockFetchResponse(200, PEP_MATCH_RESPONSE));

    const result = await provider.screen({ full_name: 'Angela Merkel', date_of_birth: '1954-07-17' });

    expect(result.risk_level).toBe('potential_match');
    expect(result.match_found).toBe(true);
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0].score).toBe(0.92);
    // Must NOT be confirmed_match — PEPs are risk signals, not crimes
    expect(result.risk_level).not.toBe('confirmed_match');
  });

  // ── Mid-score also potential_match ─────────────────────

  it('returns potential_match for mid-range scores >= 0.5', async () => {
    fetchSpy.mockResolvedValueOnce(mockFetchResponse(200, MID_SCORE_RESPONSE));

    const result = await provider.screen({ full_name: 'A. Merkel' });

    expect(result.risk_level).toBe('potential_match');
    expect(result.match_found).toBe(true);
    expect(result.matches[0].score).toBe(0.65);
  });

  // ── Clear when no matches ─────────────────────────────

  it('returns clear when no matches above threshold', async () => {
    fetchSpy.mockResolvedValueOnce(mockFetchResponse(200, EMPTY_RESPONSE));

    const result = await provider.screen({ full_name: 'Nobody Special' });

    expect(result.risk_level).toBe('clear');
    expect(result.match_found).toBe(false);
    expect(result.matches).toHaveLength(0);
    for (const list of PEP_LISTS_CHECKED) {
      expect(result.lists_checked).toContain(list);
    }
  });

  // ── Low-score below threshold ─────────────────────────

  it('excludes matches below 0.5 threshold', async () => {
    fetchSpy.mockResolvedValueOnce(mockFetchResponse(200, LOW_SCORE_RESPONSE));

    const result = await provider.screen({ full_name: 'Jane Smith' });

    expect(result.risk_level).toBe('clear');
    expect(result.match_found).toBe(false);
    expect(result.matches).toHaveLength(0);
  });

  // ── match_type and list_source ─────────────────────────

  it('sets match_type to pep and list_source from API datasets', async () => {
    fetchSpy.mockResolvedValueOnce(mockFetchResponse(200, PEP_MATCH_RESPONSE));

    const result = await provider.screen({ full_name: 'Angela Merkel' });

    expect(result.matches[0].match_type).toBe('pep');
    // list_source joins actual datasets from the API response
    expect(result.matches[0].list_source).toBe('opensanctions-pep, de_bundestag');
  });

  // ── API error → graceful clear ─────────────────────────

  it('returns clear on API error (non-200)', async () => {
    fetchSpy.mockResolvedValueOnce(mockFetchResponse(500, { error: 'Internal Server Error' }));

    const result = await provider.screen({ full_name: 'Test Person' });

    expect(result.risk_level).toBe('clear');
    expect(result.match_found).toBe(false);
    expect(result.lists_checked).toHaveLength(0);
  });

  // ── Network timeout → graceful clear ───────────────────

  it('returns clear on network timeout', async () => {
    fetchSpy.mockRejectedValueOnce(new DOMException('Aborted', 'AbortError'));

    const result = await provider.screen({ full_name: 'Test Person' });

    expect(result.risk_level).toBe('clear');
    expect(result.match_found).toBe(false);
    expect(result.lists_checked).toHaveLength(0);
  });

  // ── Correct endpoint ───────────────────────────────────

  it('calls /match/peps endpoint (not /match/default)', async () => {
    fetchSpy.mockResolvedValueOnce(mockFetchResponse(200, EMPTY_RESPONSE));

    await provider.screen({ full_name: 'Test User' });

    expect(fetchSpy).toHaveBeenCalledOnce();
    const [url] = fetchSpy.mock.calls[0];
    expect(url).toBe('https://api.opensanctions.org/match/peps');
    expect(url).not.toContain('/match/default');
  });

  // ── Request body shape ─────────────────────────────────

  it('sends correct request body with name, DOB, and nationality', async () => {
    fetchSpy.mockResolvedValueOnce(mockFetchResponse(200, EMPTY_RESPONSE));

    await provider.screen({
      full_name: 'Test User',
      date_of_birth: '1990-05-15',
      nationality: 'US',
    });

    const [, options] = fetchSpy.mock.calls[0];
    const sentBody = JSON.parse(options?.body as string);
    expect(sentBody.schema).toBe('Person');
    expect(sentBody.properties.name).toEqual(['Test User']);
    expect(sentBody.properties.birthDate).toEqual(['1990-05-15']);
    expect(sentBody.properties.nationality).toEqual(['US']);
  });

  // ── Auth header ────────────────────────────────────────

  it('includes Authorization header when API key is set', async () => {
    fetchSpy.mockResolvedValueOnce(mockFetchResponse(200, EMPTY_RESPONSE));

    await provider.screen({ full_name: 'Test' });

    const [, options] = fetchSpy.mock.calls[0];
    const headers = options?.headers as Record<string, string>;
    expect(headers['Authorization']).toBe('ApiKey test-api-key');
  });

  // ── Provider name ──────────────────────────────────────

  it('has provider name set to pep', () => {
    expect(provider.name).toBe('pep');
  });
});
