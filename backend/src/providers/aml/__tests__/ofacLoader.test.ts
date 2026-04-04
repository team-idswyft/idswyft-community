import { describe, it, expect, vi, afterEach } from 'vitest';
import { parseSDNCSV, extractDOB, loadOFACFromFile, loadOFACFromURL } from '../ofacLoader.js';
import { readFileSync } from 'fs';

vi.mock('@/utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('fs', () => ({
  readFileSync: vi.fn(),
}));

const mockedReadFileSync = vi.mocked(readFileSync);

const SAMPLE_SDN_CSV = [
  '1234|"SMITH, John"|individual|SDGT|Leader|||||||-0- DOB 15 Mar 1985; nationality United States',
  '1235|"GARCIA, Maria"|individual|SDGT||||||||||',
  '1236|"EVIL CORP"|entity|SDGT|Company|||||||-0-',
  '1237|"HASSAN, Ahmed"|individual|IRAN||||||||||DOB 20 Jun 1970; alt. DOB 1971',
  '1238|"MV TANKER ONE"|vessel|SDGT||||||||||',
  '',
  '# Comment line',
  '1239|-0-|individual|SDGT||||||||||',
].join('\n');

describe('extractDOB', () => {
  it('extracts DOB from standard format', () => {
    expect(extractDOB('DOB 15 Mar 1985; nationality US')).toBe('1985-03-15');
  });

  it('extracts DOB with single-digit day', () => {
    expect(extractDOB('DOB 5 Jan 2000')).toBe('2000-01-05');
  });

  it('returns undefined when no DOB present', () => {
    expect(extractDOB('nationality United States')).toBeUndefined();
  });

  it('returns undefined for empty remarks', () => {
    expect(extractDOB('')).toBeUndefined();
  });

  it('handles case-insensitive month', () => {
    expect(extractDOB('DOB 20 jun 1970')).toBe('1970-06-20');
  });

  it('extracts first DOB when multiple are present', () => {
    expect(extractDOB('DOB 20 Jun 1970; alt. DOB 01 Jan 1971')).toBe('1970-06-20');
  });
});

describe('parseSDNCSV', () => {
  it('parses individuals from pipe-delimited CSV', () => {
    const entries = parseSDNCSV(SAMPLE_SDN_CSV);
    // Should include: SMITH, GARCIA, HASSAN (3 individuals)
    // Should exclude: EVIL CORP (entity), MV TANKER ONE (vessel), -0- name, comment, empty
    expect(entries).toHaveLength(3);
  });

  it('sets list to us_ofac_sdn for all entries', () => {
    const entries = parseSDNCSV(SAMPLE_SDN_CSV);
    for (const entry of entries) {
      expect(entry.list).toBe('us_ofac_sdn');
    }
  });

  it('extracts DOB from remarks when present', () => {
    const entries = parseSDNCSV(SAMPLE_SDN_CSV);
    const smith = entries.find(e => e.name.includes('SMITH'));
    expect(smith?.dob).toBe('1985-03-15');
  });

  it('omits dob field when no DOB in remarks', () => {
    const entries = parseSDNCSV(SAMPLE_SDN_CSV);
    const garcia = entries.find(e => e.name.includes('GARCIA'));
    expect(garcia?.dob).toBeUndefined();
  });

  it('filters out entities and vessels', () => {
    const entries = parseSDNCSV(SAMPLE_SDN_CSV);
    const names = entries.map(e => e.name);
    expect(names).not.toContain('"EVIL CORP"');
    expect(names).not.toContain('"MV TANKER ONE"');
  });

  it('filters out -0- names', () => {
    const entries = parseSDNCSV(SAMPLE_SDN_CSV);
    const names = entries.map(e => e.name);
    expect(names).not.toContain('-0-');
  });

  it('skips comment lines and empty lines', () => {
    const entries = parseSDNCSV('# header\n\n');
    expect(entries).toHaveLength(0);
  });

  it('handles empty input', () => {
    const entries = parseSDNCSV('');
    expect(entries).toHaveLength(0);
  });

  it('strips quotes from names', () => {
    const entries = parseSDNCSV(SAMPLE_SDN_CSV);
    const smith = entries.find(e => e.name.includes('SMITH'));
    expect(smith?.name).toBe('SMITH, John');
  });
});

describe('loadOFACFromFile', () => {
  it('returns empty array on file read error', () => {
    mockedReadFileSync.mockImplementation(() => { throw new Error('ENOENT'); });
    const entries = loadOFACFromFile('/nonexistent/path.csv');
    expect(entries).toEqual([]);
  });

  it('parses file content when file exists', () => {
    mockedReadFileSync.mockReturnValue(SAMPLE_SDN_CSV);
    const entries = loadOFACFromFile('/some/sdn.csv');
    expect(entries).toHaveLength(3);
    expect(entries[0].list).toBe('us_ofac_sdn');
  });
});

describe('loadOFACFromURL', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('parses entries from successful HTTP response', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(SAMPLE_SDN_CSV),
    });
    const entries = await loadOFACFromURL('https://example.com/sdn.csv');
    expect(entries).toHaveLength(3);
    expect(entries[0].list).toBe('us_ofac_sdn');
  });

  it('returns empty array on non-OK HTTP status', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
    });
    const entries = await loadOFACFromURL('https://example.com/sdn.csv');
    expect(entries).toEqual([]);
  });

  it('returns empty array on network error', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'));
    const entries = await loadOFACFromURL('https://example.com/sdn.csv');
    expect(entries).toEqual([]);
  });
});
