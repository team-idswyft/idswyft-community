import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OpenSanctionsProvider, DEFAULT_LISTS_CHECKED } from '../OpenSanctionsProvider.js';

vi.mock('@/utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

/** Helper to build a mock fetch Response. */
function mockFetchResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    json: () => Promise.resolve(body),
  } as Response;
}

/** OpenSanctions API response shape with no matches. */
const EMPTY_RESPONSE = {
  responses: {
    q1: { results: [] },
  },
};

/** OpenSanctions API response with one high-confidence match. */
const MATCH_RESPONSE = {
  responses: {
    q1: {
      results: [
        {
          id: 'ofac-12345',
          caption: 'John Doe',
          score: 0.92,
          datasets: ['us_ofac_sdn', 'us_ofac_cons'],
        },
      ],
    },
  },
};

/** Response with a low-score result (below 0.5 threshold). */
const LOW_SCORE_RESPONSE = {
  responses: {
    q1: {
      results: [
        {
          id: 'some-entry',
          caption: 'Jane Doe',
          score: 0.3,
          datasets: ['eu_fsf', 'fr_tresor_gels_avoir'],
        },
      ],
    },
  },
};

describe('OpenSanctionsProvider', () => {
  let provider: OpenSanctionsProvider;
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    provider = new OpenSanctionsProvider('test-api-key');
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  // ── Success: no matches ──────────────────────────────────

  it('populates lists_checked with defaults when API returns no matches', async () => {
    fetchSpy.mockResolvedValueOnce(mockFetchResponse(200, EMPTY_RESPONSE));

    const result = await provider.screen({ full_name: 'Nobody Special' });

    expect(result.risk_level).toBe('clear');
    expect(result.match_found).toBe(false);
    expect(result.matches).toHaveLength(0);
    // All 6 default lists must be present
    for (const list of DEFAULT_LISTS_CHECKED) {
      expect(result.lists_checked).toContain(list);
    }
    expect(result.lists_checked.length).toBeGreaterThanOrEqual(DEFAULT_LISTS_CHECKED.length);
  });

  // ── Success: with matches ────────────────────────────────

  it('returns superset of lists_checked when matches include extra datasets', async () => {
    fetchSpy.mockResolvedValueOnce(mockFetchResponse(200, MATCH_RESPONSE));

    const result = await provider.screen({ full_name: 'John Doe', date_of_birth: '1980-01-01' });

    expect(result.risk_level).toBe('confirmed_match');
    expect(result.match_found).toBe(true);
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0].listed_name).toBe('John Doe');
    expect(result.matches[0].match_type).toBe('name_dob');
    // Defaults present
    for (const list of DEFAULT_LISTS_CHECKED) {
      expect(result.lists_checked).toContain(list);
    }
    // Extra dataset from match result also present
    expect(result.lists_checked).toContain('us_ofac_cons');
  });

  // ── Success: low-score results below threshold ───────────

  it('excludes matches below 0.5 threshold but still populates lists_checked', async () => {
    fetchSpy.mockResolvedValueOnce(mockFetchResponse(200, LOW_SCORE_RESPONSE));

    const result = await provider.screen({ full_name: 'Jane Doe' });

    expect(result.risk_level).toBe('clear');
    expect(result.match_found).toBe(false);
    expect(result.matches).toHaveLength(0);
    // Default lists present
    for (const list of DEFAULT_LISTS_CHECKED) {
      expect(result.lists_checked).toContain(list);
    }
    // Extra datasets from the low-score result are still tracked
    expect(result.lists_checked).toContain('fr_tresor_gels_avoir');
  });

  // ── API error (non-200) ──────────────────────────────────

  it('returns empty lists_checked on API error (non-200)', async () => {
    fetchSpy.mockResolvedValueOnce(mockFetchResponse(500, { error: 'Internal Server Error' }));

    const result = await provider.screen({ full_name: 'Test Person' });

    expect(result.risk_level).toBe('clear');
    expect(result.match_found).toBe(false);
    expect(result.lists_checked).toHaveLength(0);
  });

  // ── Network timeout ──────────────────────────────────────

  it('returns empty lists_checked on network timeout', async () => {
    fetchSpy.mockRejectedValueOnce(new DOMException('Aborted', 'AbortError'));

    const result = await provider.screen({ full_name: 'Test Person' });

    expect(result.risk_level).toBe('clear');
    expect(result.match_found).toBe(false);
    expect(result.lists_checked).toHaveLength(0);
  });

  // ── Risk level classification ────────────────────────────

  it('classifies potential_match for scores between 0.5 and 0.85', async () => {
    const response = {
      responses: {
        q1: {
          results: [
            { id: 'entry-1', caption: 'Partial Match', score: 0.65, datasets: ['un_sc_sanctions'] },
          ],
        },
      },
    };
    fetchSpy.mockResolvedValueOnce(mockFetchResponse(200, response));

    const result = await provider.screen({ full_name: 'Partial Match' });

    expect(result.risk_level).toBe('potential_match');
    expect(result.match_found).toBe(true);
    expect(result.matches[0].score).toBe(0.65);
  });

  // ── Request shape ────────────────────────────────────────

  it('sends correct request body with name, DOB, and nationality', async () => {
    fetchSpy.mockResolvedValueOnce(mockFetchResponse(200, EMPTY_RESPONSE));

    await provider.screen({
      full_name: 'Test User',
      date_of_birth: '1990-05-15',
      nationality: 'US',
    });

    expect(fetchSpy).toHaveBeenCalledOnce();
    const [url, options] = fetchSpy.mock.calls[0];
    expect(url).toBe('https://api.opensanctions.org/match/default');
    expect(options?.method).toBe('POST');

    const sentBody = JSON.parse(options?.body as string);
    expect(sentBody.schema).toBe('Person');
    expect(sentBody.properties.name).toEqual(['Test User']);
    expect(sentBody.properties.birthDate).toEqual(['1990-05-15']);
    expect(sentBody.properties.nationality).toEqual(['US']);
  });

  it('includes Authorization header when API key is set', async () => {
    fetchSpy.mockResolvedValueOnce(mockFetchResponse(200, EMPTY_RESPONSE));

    await provider.screen({ full_name: 'Test' });

    const [, options] = fetchSpy.mock.calls[0];
    const headers = options?.headers as Record<string, string>;
    expect(headers['Authorization']).toBe('ApiKey test-api-key');
  });

  it('omits birthDate and nationality when not provided', async () => {
    fetchSpy.mockResolvedValueOnce(mockFetchResponse(200, EMPTY_RESPONSE));

    await provider.screen({ full_name: 'Name Only' });

    const sentBody = JSON.parse(fetchSpy.mock.calls[0][1]?.body as string);
    expect(sentBody.properties.birthDate).toBeUndefined();
    expect(sentBody.properties.nationality).toBeUndefined();
  });
});
