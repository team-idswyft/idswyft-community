import React, { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { platformApi } from '../services/api';
import { sectionLabel, monoXs, monoSm, cardSurface } from '../styles/tokens';

type ProviderType = 'ocr' | 'face' | 'liveness';
type Days = 7 | 30 | 90;

interface ProviderSummary {
  totalRequests: number;
  successRate: number;
  avgLatencyMs: number;
  avgConfidence: number;
  providerName: string;
}

interface ProviderCard {
  type: ProviderType;
  label: string;
  data: ProviderSummary;
}

const PROVIDERS: { type: ProviderType; label: string }[] = [
  { type: 'ocr', label: 'OCR' },
  { type: 'face', label: 'Face Matching' },
  { type: 'liveness', label: 'Liveness' },
];

export default function ProviderMetrics() {
  const [days, setDays] = useState<Days>(7);
  const [cards, setCards] = useState<ProviderCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadAll = async (d: Days) => {
    setLoading(true);
    setError(null);
    setCards([]);
    try {
      const [ocr, face, liveness] = await Promise.all([
        platformApi.getProviderMetrics('ocr', d),
        platformApi.getProviderMetrics('face', d),
        platformApi.getProviderMetrics('liveness', d),
      ]);
      setCards([
        { type: 'ocr', label: 'OCR', data: ocr },
        { type: 'face', label: 'Face Matching', data: face },
        { type: 'liveness', label: 'Liveness', data: liveness },
      ]);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load provider metrics');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadAll(days); }, [days]);

  const pct = (n: number) => `${Math.min(100, Math.max(0, Math.round(n * 100)))}%`;
  const ms = (n: number) => `${Math.round(n)}ms`;

  const accentColors: Record<ProviderType, string> = {
    ocr: 'border-l-cyan-400',
    face: 'border-l-violet-400',
    liveness: 'border-l-emerald-400',
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <p className={sectionLabel}>Provider Performance</p>
          <p className="text-sm text-slate-500 mt-1">
            Cross-organization OCR, face matching, and liveness metrics
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex border border-white/10 rounded-lg overflow-hidden">
            {([7, 30, 90] as Days[]).map((d) => (
              <button
                key={d}
                onClick={() => setDays(d)}
                disabled={loading}
                className={`px-3 py-1.5 font-mono text-xs font-medium transition-colors disabled:opacity-50 ${
                  days === d
                    ? 'bg-cyan-500/12 text-cyan-200'
                    : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/40'
                }`}
              >
                {d}d
              </button>
            ))}
          </div>
          <button
            onClick={() => loadAll(days)}
            disabled={loading}
            className="p-2 border border-white/10 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800/40 disabled:opacity-50 transition-colors"
            title="Refresh"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-rose-500/12 border border-rose-500/25 rounded-lg text-rose-300 text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className={`${cardSurface} border-l-[3px] border-l-slate-700/50 p-5 animate-pulse`}>
              <div className="h-3 bg-slate-700/50 rounded w-16 mb-3" />
              <div className="h-7 bg-slate-700/50 rounded w-10 mb-4" />
              <div className="space-y-2">
                <div className="h-3 bg-slate-700/50 rounded w-full" />
                <div className="h-3 bg-slate-700/50 rounded w-3/4" />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {cards.map((c) => (
            <div key={c.type} className={`${cardSurface} border-l-[3px] ${accentColors[c.type]} p-5 hover:bg-slate-800/40 transition-colors`}>
              <p className={`${sectionLabel} mb-1`}>{c.label}</p>
              <p className={`${monoXs} text-slate-500 mb-4 truncate`}>{c.data.providerName}</p>

              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-500">Success</span>
                  <span className={`${monoSm} font-semibold ${c.data.successRate >= 0.9 ? 'text-emerald-400' : 'text-amber-400'}`}>
                    {pct(c.data.successRate)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-500">Avg Latency</span>
                  <span className={`${monoSm} font-semibold text-slate-300`}>{ms(c.data.avgLatencyMs)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-500">Confidence</span>
                  <span className={`${monoSm} font-semibold text-slate-300`}>{pct(c.data.avgConfidence)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-500">Requests</span>
                  <span className={`${monoSm} font-semibold text-slate-300`}>{c.data.totalRequests.toLocaleString()}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
