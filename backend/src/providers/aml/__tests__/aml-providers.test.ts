import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OfflineListProvider } from '../OfflineListProvider.js';
import { createAMLProvider } from '../index.js';

vi.mock('@/utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

describe('OfflineListProvider', () => {
  let provider: OfflineListProvider;

  beforeEach(() => {
    provider = new OfflineListProvider();
    provider.loadEntries([
      { name: 'JOHN SMITH', list: 'OFAC_SDN', dob: '1985-03-15' },
      { name: 'MARIA GARCIA', list: 'EU_SANCTIONS' },
      { name: 'AHMED HASSAN', list: 'UN_SANCTIONS', dob: '1970-06-20' },
    ]);
  });

  it('returns clear for names with no match', async () => {
    const result = await provider.screen({
      full_name: 'Robert Williams',
      date_of_birth: '1995-01-01',
    });
    expect(result.risk_level).toBe('clear');
    expect(result.match_found).toBe(false);
    expect(result.matches).toHaveLength(0);
  });

  it('detects exact name match', async () => {
    const result = await provider.screen({
      full_name: 'John Smith',
      date_of_birth: '1985-03-15',
    });
    expect(result.match_found).toBe(true);
    expect(result.matches.length).toBeGreaterThan(0);
    expect(result.matches[0].listed_name).toBe('john smith');
  });

  it('detects fuzzy name match', async () => {
    const result = await provider.screen({
      full_name: 'Jon Smith',  // Typo/variant
    });
    // Jaro-Winkler should catch this — "Jon" vs "John" is very close
    expect(result.match_found).toBe(true);
    expect(result.matches[0].score).toBeGreaterThan(0.85);
  });

  it('boosts score when DOB matches', async () => {
    const withDob = await provider.screen({
      full_name: 'John Smith',
      date_of_birth: '1985-03-15',
    });

    const withoutDob = await provider.screen({
      full_name: 'John Smith',
    });

    if (withDob.matches.length > 0 && withoutDob.matches.length > 0) {
      expect(withDob.matches[0].score).toBeGreaterThanOrEqual(withoutDob.matches[0].score);
      expect(withDob.matches[0].match_type).toBe('name_dob');
    }
  });

  it('returns lists_checked', async () => {
    const result = await provider.screen({ full_name: 'Test Person' });
    expect(result.lists_checked).toContain('OFAC_SDN');
    expect(result.lists_checked).toContain('EU_SANCTIONS');
    expect(result.lists_checked).toContain('UN_SANCTIONS');
  });

  it('handles empty entries gracefully', async () => {
    const emptyProvider = new OfflineListProvider();
    emptyProvider.loadEntries([]);
    const result = await emptyProvider.screen({ full_name: 'Anyone' });
    expect(result.risk_level).toBe('clear');
  });
});

describe('createAMLProvider factory', () => {
  it('returns null when AML_PROVIDER is none (default)', () => {
    delete process.env.AML_PROVIDER;
    const provider = createAMLProvider();
    expect(provider).toBeNull();
  });

  it('returns OfflineListProvider when AML_PROVIDER=offline', () => {
    process.env.AML_PROVIDER = 'offline';
    const provider = createAMLProvider();
    expect(provider).not.toBeNull();
    expect(provider!.name).toBe('offline');
    delete process.env.AML_PROVIDER;
  });

  it('returns OpenSanctionsProvider when AML_PROVIDER=opensanctions', () => {
    process.env.AML_PROVIDER = 'opensanctions';
    const provider = createAMLProvider();
    expect(provider).not.toBeNull();
    expect(provider!.name).toBe('opensanctions');
    delete process.env.AML_PROVIDER;
  });
});
