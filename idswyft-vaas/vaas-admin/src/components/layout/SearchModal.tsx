import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  X,
  CheckCircle,
  Users,
  Webhook,
  Shield,
  Key,
  Loader2,
} from 'lucide-react';
import { apiClient } from '../../services/api';
import type { SearchResults } from '../../types';

interface SearchModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface FlatResult {
  category: string;
  label: string;
  sublabel: string;
  href: string;
}

function flattenResults(results: SearchResults): FlatResult[] {
  const flat: FlatResult[] = [];

  for (const v of results.verifications) {
    const user = v.vaas_end_users;
    const name = user ? [user.first_name, user.last_name].filter(Boolean).join(' ') : '';
    flat.push({
      category: 'Verifications',
      label: `${v.id.slice(0, 8)}... — ${v.status}`,
      sublabel: name || user?.email || v.end_user_id?.slice(0, 8) || '',
      href: '/verifications',
    });
  }

  for (const u of results.users) {
    const name = [u.first_name, u.last_name].filter(Boolean).join(' ');
    flat.push({
      category: 'Users',
      label: name || u.email || u.external_id || u.id.slice(0, 8),
      sublabel: u.email || u.verification_status,
      href: '/users',
    });
  }

  for (const w of results.webhooks) {
    flat.push({
      category: 'Webhooks',
      label: w.url,
      sublabel: w.enabled ? 'Active' : 'Disabled',
      href: '/webhooks',
    });
  }

  for (const a of results.audit_logs) {
    flat.push({
      category: 'Audit Logs',
      label: `${a.action} — ${a.resource_type}`,
      sublabel: a.actor_name,
      href: '/audit-logs',
    });
  }

  for (const k of results.api_keys) {
    flat.push({
      category: 'API Keys',
      label: k.key_name,
      sublabel: k.key_prefix,
      href: '/api-keys',
    });
  }

  return flat;
}

const CATEGORY_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  Verifications: CheckCircle,
  Users: Users,
  Webhooks: Webhook,
  'Audit Logs': Shield,
  'API Keys': Key,
};

export default function SearchModal({ isOpen, onClose }: SearchModalProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<FlatResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  // Reset state when opened
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setResults([]);
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Debounced search
  const doSearch = useCallback((q: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (q.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const data = await apiClient.search(q);
        setResults(flattenResults(data));
        setSelectedIndex(0);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 300);
  }, []);

  useEffect(() => {
    doSearch(query);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, doSearch]);

  const handleSelect = (result: FlatResult) => {
    onClose();
    navigate(result.href);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => Math.min(prev + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter' && results[selectedIndex]) {
      e.preventDefault();
      handleSelect(results[selectedIndex]);
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  // Group by category for display, with pre-computed flat indices
  const grouped = useMemo(() => {
    const groups: { category: string; items: { result: FlatResult; flatIndex: number }[] }[] = [];
    let lastCat = '';
    let idx = 0;
    for (const r of results) {
      if (r.category !== lastCat) {
        groups.push({ category: r.category, items: [] });
        lastCat = r.category;
      }
      groups[groups.length - 1].items.push({ result: r, flatIndex: idx++ });
    }
    return groups;
  }, [results]);

  if (!isOpen) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm" />

      {/* Modal */}
      <div
        className="relative w-full max-w-lg animate-scale-in overflow-hidden rounded-xl border border-white/15 bg-slate-900/95 shadow-2xl backdrop-blur-xl"
        onClick={e => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 border-b border-white/10 px-4">
          <Search className="h-4 w-4 text-slate-400" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search verifications, users, webhooks..."
            className="flex-1 bg-transparent py-3.5 text-sm text-slate-100 outline-none placeholder:text-slate-500"
          />
          {loading && <Loader2 className="h-4 w-4 animate-spin text-slate-500" />}
          <button onClick={onClose} className="rounded p-1 text-slate-500 hover:text-slate-300 transition">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Results */}
        <div className="max-h-[360px] overflow-y-auto">
          {query.length >= 2 && !loading && results.length === 0 && (
            <div className="py-8 text-center text-sm text-slate-500">No results found</div>
          )}

          {query.length < 2 && !loading && (
            <div className="py-8 text-center text-sm text-slate-500">
              Type at least 2 characters to search
            </div>
          )}

          {grouped.map(group => {
            const Icon = CATEGORY_ICONS[group.category] || Search;
            return (
              <div key={group.category}>
                <div className="flex items-center gap-2 px-4 pt-3 pb-1">
                  <Icon className="h-3.5 w-3.5 text-slate-500" />
                  <span className="text-[11px] font-semibold uppercase tracking-widest text-slate-500">
                    {group.category}
                  </span>
                </div>
                {group.items.map(({ result, flatIndex }) => (
                  <button
                    key={`${group.category}-${flatIndex}`}
                    onClick={() => handleSelect(result)}
                    className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition ${
                      flatIndex === selectedIndex
                        ? 'bg-cyan-400/10 text-cyan-200'
                        : 'text-slate-300 hover:bg-slate-800/60'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{result.label}</div>
                      {result.sublabel && (
                        <div className="truncate text-xs text-slate-500">{result.sublabel}</div>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            );
          })}
        </div>

        {/* Footer hint */}
        <div className="border-t border-white/10 px-4 py-2 text-[11px] text-slate-500">
          <span className="rounded border border-white/15 bg-slate-800/60 px-1.5 py-0.5 font-mono text-[10px]">
            esc
          </span>{' '}
          to close{' '}
          <span className="ml-2 rounded border border-white/15 bg-slate-800/60 px-1.5 py-0.5 font-mono text-[10px]">
            &uarr;&darr;
          </span>{' '}
          to navigate{' '}
          <span className="ml-2 rounded border border-white/15 bg-slate-800/60 px-1.5 py-0.5 font-mono text-[10px]">
            enter
          </span>{' '}
          to select
        </div>
      </div>
    </div>,
    document.body
  );
}
