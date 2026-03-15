import React, { useState, useMemo } from 'react';
import { Globe, Search, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';

// Priority countries grouped by region with flag emoji
const COUNTRY_LIST = [
  // English-speaking
  { code: 'US', name: 'United States', flag: '\u{1F1FA}\u{1F1F8}', region: 'Americas' },
  { code: 'GB', name: 'United Kingdom', flag: '\u{1F1EC}\u{1F1E7}', region: 'Europe' },
  { code: 'CA', name: 'Canada', flag: '\u{1F1E8}\u{1F1E6}', region: 'Americas' },
  { code: 'AU', name: 'Australia', flag: '\u{1F1E6}\u{1F1FA}', region: 'Asia-Pacific' },
  { code: 'NZ', name: 'New Zealand', flag: '\u{1F1F3}\u{1F1FF}', region: 'Asia-Pacific' },
  // EU core
  { code: 'DE', name: 'Germany', flag: '\u{1F1E9}\u{1F1EA}', region: 'Europe' },
  { code: 'FR', name: 'France', flag: '\u{1F1EB}\u{1F1F7}', region: 'Europe' },
  { code: 'IT', name: 'Italy', flag: '\u{1F1EE}\u{1F1F9}', region: 'Europe' },
  { code: 'ES', name: 'Spain', flag: '\u{1F1EA}\u{1F1F8}', region: 'Europe' },
  { code: 'NL', name: 'Netherlands', flag: '\u{1F1F3}\u{1F1F1}', region: 'Europe' },
  // Latin America
  { code: 'BR', name: 'Brazil', flag: '\u{1F1E7}\u{1F1F7}', region: 'Americas' },
  { code: 'MX', name: 'Mexico', flag: '\u{1F1F2}\u{1F1FD}', region: 'Americas' },
  { code: 'AR', name: 'Argentina', flag: '\u{1F1E6}\u{1F1F7}', region: 'Americas' },
  // Asia-Pacific
  { code: 'JP', name: 'Japan', flag: '\u{1F1EF}\u{1F1F5}', region: 'Asia-Pacific' },
  { code: 'KR', name: 'South Korea', flag: '\u{1F1F0}\u{1F1F7}', region: 'Asia-Pacific' },
  { code: 'IN', name: 'India', flag: '\u{1F1EE}\u{1F1F3}', region: 'Asia-Pacific' },
  { code: 'SG', name: 'Singapore', flag: '\u{1F1F8}\u{1F1EC}', region: 'Asia-Pacific' },
  { code: 'PH', name: 'Philippines', flag: '\u{1F1F5}\u{1F1ED}', region: 'Asia-Pacific' },
  { code: 'TH', name: 'Thailand', flag: '\u{1F1F9}\u{1F1ED}', region: 'Asia-Pacific' },
  { code: 'VN', name: 'Vietnam', flag: '\u{1F1FB}\u{1F1F3}', region: 'Asia-Pacific' },
] as const;

const REGIONS = ['Americas', 'Europe', 'Asia-Pacific'] as const;

interface CountrySelectorProps {
  onSelect: (countryCode: string) => void;
}

const regionKey: Record<string, string> = {
  'Americas': 'country.regions.americas',
  'Europe': 'country.regions.europe',
  'Asia-Pacific': 'country.regions.asiaPacific',
};

const CountrySelector: React.FC<CountrySelectorProps> = ({ onSelect }) => {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    if (!search.trim()) return COUNTRY_LIST;
    const q = search.toLowerCase();
    return COUNTRY_LIST.filter(
      c => c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q)
    );
  }, [search]);

  const grouped = useMemo(() => {
    const map: Record<string, typeof COUNTRY_LIST[number][]> = {};
    for (const r of REGIONS) map[r] = [];
    for (const c of filtered) {
      if (map[c.region]) map[c.region].push(c);
    }
    return map;
  }, [filtered]);

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <div className="flex items-center mb-4">
        <Globe className="w-6 h-6 text-blue-600 mr-3" />
        <h2 className="text-xl font-semibold text-gray-900">{t('country.title')}</h2>
      </div>
      <p className="text-gray-600 mb-6">
        {t('country.subtitle')}
      </p>

      {/* Search */}
      <div className="relative mb-6">
        <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          placeholder={t('country.searchPlaceholder')}
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
          autoFocus
        />
      </div>

      {/* Country list grouped by region */}
      <div className="max-h-80 overflow-y-auto space-y-4">
        {REGIONS.map(region => {
          const countries = grouped[region];
          if (!countries || countries.length === 0) return null;
          return (
            <div key={region}>
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                {t(regionKey[region] || region)}
              </h3>
              <div className="space-y-1">
                {countries.map(c => (
                  <button
                    key={c.code}
                    onClick={() => onSelect(c.code)}
                    className="w-full flex items-center justify-between px-3 py-2.5 rounded-md hover:bg-blue-50 transition-colors text-left group"
                  >
                    <span className="flex items-center">
                      <span className="text-lg mr-3">{c.flag}</span>
                      <span className="text-gray-900 font-medium">{c.name}</span>
                      <span className="text-gray-400 text-sm ml-2">({c.code})</span>
                    </span>
                    <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-blue-500 transition-colors" />
                  </button>
                ))}
              </div>
            </div>
          );
        })}

        {filtered.length === 0 && (
          <p className="text-gray-500 text-center py-4">{t('country.noResults')}</p>
        )}
      </div>
    </div>
  );
};

export default CountrySelector;
