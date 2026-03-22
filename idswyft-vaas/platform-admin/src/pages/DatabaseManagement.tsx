import React, { useState, useEffect, useCallback } from 'react';
import {
  Database,
  RefreshCw,
  Trash2,
  AlertTriangle,
  Lock,
  Server,
  Layers,
  Clock,
  Shield,
  CheckCircle,
} from 'lucide-react';
import { platformApi } from '../services/api';
import type { DatabaseStats } from '../services/api';
import Modal from '../components/ui/Modal';
import {
  sectionLabel,
  statNumber,
  monoXs,
  monoSm,
  cardSurface,
  tableHeaderClass,
  statusPill,
} from '../styles/tokens';

type DatabaseTarget = 'vaas' | 'main';

export default function DatabaseManagement() {
  const [target, setTarget] = useState<DatabaseTarget>('vaas');
  const [stats, setStats] = useState<DatabaseStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Purge state
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set());
  const [olderThanDays, setOlderThanDays] = useState(30);
  const [purging, setPurging] = useState(false);

  // Wipe state
  const [wipeModalOpen, setWipeModalOpen] = useState(false);
  const [wipeConfirmPhrase, setWipeConfirmPhrase] = useState('');
  const [wiping, setWiping] = useState(false);

  // Feedback message
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const expectedWipePhrase = target === 'vaas' ? 'RESET VAAS' : 'RESET MAIN';

  const fetchStats = useCallback(async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const data = await platformApi.getDatabaseStats(target);
      setStats(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load database stats');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [target]);

  useEffect(() => {
    setSelectedCategories(new Set());
    setMessage(null);
    fetchStats();
  }, [fetchStats]);

  // Clear messages after 8s
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(null), 8000);
    return () => clearTimeout(timer);
  }, [message]);

  const handleCategoryToggle = (category: string) => {
    setSelectedCategories(prev => {
      const next = new Set(prev);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  };

  const handlePurge = async () => {
    if (selectedCategories.size === 0) return;
    setPurging(true);
    setMessage(null);

    try {
      const result = await platformApi.purgeDatabaseCategories(
        target,
        Array.from(selectedCategories),
        olderThanDays
      );
      setMessage({
        type: 'success',
        text: `Purged ${result.totalDeleted} rows across ${Object.keys(result.deletedCounts).length} tables`,
      });
      fetchStats(true);
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Purge failed' });
    } finally {
      setPurging(false);
    }
  };

  const handleWipe = async () => {
    if (wipeConfirmPhrase !== expectedWipePhrase) return;
    setWiping(true);
    setMessage(null);

    try {
      const result = await platformApi.wipeDatabaseFull(target, wipeConfirmPhrase);
      setMessage({
        type: 'success',
        text: `Wiped ${result.totalDeleted} rows from ${result.wipedTables.length} tables`,
      });
      setWipeModalOpen(false);
      setWipeConfirmPhrase('');
      fetchStats(true);
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Wipe failed' });
    } finally {
      setWiping(false);
    }
  };

  // Derived data from flat tables array
  const purgeableTables = stats?.tables.filter(t => t.risk !== 'protected') || [];
  const protectedTableNames = stats?.protectedTables || [];
  const categories = [...new Set(purgeableTables.map(t => t.category))];
  const totalPurgeableRows = purgeableTables.reduce((s, t) => s + t.rowCount, 0);

  return (
    <div className="space-y-6 p-6 lg:p-8">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-cyan-400/25 bg-cyan-400/10">
            <Database className="h-5 w-5 text-cyan-300" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-slate-100">Database Management</h1>
            <div className="flex items-center gap-2 mt-0.5">
              <span className={`${statusPill} bg-rose-500/15 text-rose-300 border-rose-500/30`}>
                <Shield className="mr-1 inline h-3 w-3" />
                Super Admin Only
              </span>
            </div>
          </div>
        </div>

        <button
          onClick={() => fetchStats(true)}
          disabled={refreshing}
          className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-slate-800/60 px-4 py-2 text-sm font-medium text-slate-200 transition hover:border-cyan-400/30 hover:bg-slate-800 disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* ── Message Toast ──────────────────────────────────────────────── */}
      {message && (
        <div className={`flex items-center gap-2 rounded-lg border px-4 py-3 text-sm font-medium ${
          message.type === 'success'
            ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
            : 'border-rose-500/30 bg-rose-500/10 text-rose-300'
        }`}>
          {message.type === 'success' ? (
            <CheckCircle className="h-4 w-4 flex-shrink-0" />
          ) : (
            <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          )}
          {message.text}
        </div>
      )}

      {/* ── Stat Cards ─────────────────────────────────────────────────── */}
      {!loading && stats && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <div className={`${cardSurface} p-5`}>
            <div className={sectionLabel}>Total Rows</div>
            <div className={`${statNumber} mt-2 text-slate-100`}>
              {stats.totalRows.toLocaleString()}
            </div>
          </div>
          <div className={`${cardSurface} p-5`}>
            <div className={sectionLabel}>Tables Tracked</div>
            <div className={`${statNumber} mt-2 text-slate-100`}>
              {stats.tables.length}
            </div>
          </div>
          <div className={`${cardSurface} p-5`}>
            <div className={sectionLabel}>Databases</div>
            <div className={`${statNumber} mt-2 text-slate-100`}>2</div>
            <div className={`${monoXs} mt-1 text-slate-500`}>VaaS + Main API</div>
          </div>
          <div className={`${cardSurface} p-5`}>
            <div className={sectionLabel}>Last Cleanup</div>
            <div className={`${monoSm} mt-3 text-slate-400`}>
              {stats.lastCleanup
                ? new Date(stats.lastCleanup).toLocaleDateString()
                : 'Never'}
            </div>
          </div>
        </div>
      )}

      {/* ── Tab Selector ───────────────────────────────────────────────── */}
      <div className="flex gap-2">
        {(['vaas', 'main'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTarget(t)}
            className={`inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition ${
              target === t
                ? 'border border-cyan-400/40 bg-cyan-400/10 text-cyan-200'
                : 'border border-white/10 bg-slate-900/40 text-slate-400 hover:border-white/20 hover:text-slate-200'
            }`}
          >
            <Server className="h-4 w-4" />
            {t === 'vaas' ? 'VaaS Database' : 'Main API Database'}
          </button>
        ))}
      </div>

      {/* ── Loading / Error ────────────────────────────────────────────── */}
      {loading && (
        <div className={`${cardSurface} flex items-center justify-center p-12`}>
          <div className="flex flex-col items-center gap-3">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-cyan-400 border-t-transparent" />
            <span className="text-sm text-slate-400">Loading database stats...</span>
          </div>
        </div>
      )}

      {error && (
        <div className={`${cardSurface} flex items-center gap-3 border-rose-500/30 p-6`}>
          <AlertTriangle className="h-5 w-5 text-rose-400" />
          <span className="text-sm text-rose-300">{error}</span>
        </div>
      )}

      {/* ── Category Table ─────────────────────────────────────────────── */}
      {!loading && stats && categories.length > 0 && (
        <div className={cardSurface}>
          <div className="border-b border-white/10 px-5 py-4">
            <div className="flex items-center gap-2">
              <Layers className="h-4 w-4 text-cyan-300" />
              <span className="text-sm font-semibold text-slate-100">Purgeable Tables</span>
              <span className={`${monoXs} text-slate-500`}>
                ({totalPurgeableRows.toLocaleString()} rows)
              </span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/5">
                  <th className={`${tableHeaderClass} w-12`}></th>
                  <th className={tableHeaderClass}>Category</th>
                  <th className={tableHeaderClass}>Risk</th>
                  <th className={`${tableHeaderClass} text-right`}>Rows</th>
                  <th className={tableHeaderClass}>Tables</th>
                </tr>
              </thead>
              <tbody>
                {categories.map(category => {
                  const catTables = purgeableTables.filter(t => t.category === category);
                  const catRows = catTables.reduce((s, t) => s + t.rowCount, 0);
                  const risk = catTables[0]?.risk || 'caution';
                  const isSelected = selectedCategories.has(category);

                  return (
                    <tr
                      key={category}
                      className={`border-b border-white/5 transition ${
                        isSelected ? 'bg-cyan-400/5' : 'hover:bg-white/[0.02]'
                      }`}
                    >
                      <td className="px-5 py-4">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleCategoryToggle(category)}
                          className="h-4 w-4 rounded border-slate-600 bg-slate-800 text-cyan-500 focus:ring-cyan-400/30"
                        />
                      </td>
                      <td className="px-5 py-4">
                        <span className="text-sm font-medium text-slate-200">{category}</span>
                      </td>
                      <td className="px-5 py-4">
                        <span className={`${statusPill} ${
                          risk === 'safe'
                            ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                            : 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                        }`}>
                          {risk}
                        </span>
                      </td>
                      <td className={`px-5 py-4 text-right ${monoSm} text-slate-300`}>
                        {catRows.toLocaleString()}
                      </td>
                      <td className={`px-5 py-4 ${monoXs} text-slate-500`}>
                        {catTables.map(t => t.name).join(', ')}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* ── Retention Controls ──────────────────────────────────────── */}
          <div className="flex flex-col gap-4 border-t border-white/10 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <Clock className="h-4 w-4 text-slate-500" />
              <span className="text-sm text-slate-300">Delete data older than</span>
              <input
                type="number"
                min={1}
                max={365}
                value={olderThanDays}
                onChange={e => setOlderThanDays(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-20 rounded-lg border border-white/10 bg-slate-800/60 px-3 py-1.5 text-center text-sm text-slate-200 focus:border-cyan-400/40 focus:outline-none focus:ring-1 focus:ring-cyan-400/30"
              />
              <span className="text-sm text-slate-300">days</span>
            </div>

            <button
              onClick={handlePurge}
              disabled={selectedCategories.size === 0 || purging}
              className="inline-flex items-center gap-2 rounded-lg bg-amber-500/90 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {purging ? (
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-slate-950 border-t-transparent" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
              Purge Selected
            </button>
          </div>
        </div>
      )}

      {/* ── Protected Tables ───────────────────────────────────────────── */}
      {!loading && stats && protectedTableNames.length > 0 && (
        <div className={cardSurface}>
          <div className="border-b border-white/10 px-5 py-4">
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-emerald-400" />
              <span className="text-sm font-semibold text-slate-100">Protected Tables</span>
              <span className={`${monoXs} text-slate-500`}>
                (not purgeable)
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 p-5 sm:grid-cols-2 lg:grid-cols-3">
            {protectedTableNames.map(table => (
              <div
                key={table}
                className="flex items-center gap-3 rounded-lg border border-white/5 bg-slate-800/30 px-4 py-3"
              >
                <Lock className="h-4 w-4 flex-shrink-0 text-slate-600" />
                <span className={`${monoSm} truncate text-slate-300`}>{table}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Danger Zone ────────────────────────────────────────────────── */}
      {!loading && stats && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/5">
          <div className="border-b border-rose-500/20 px-5 py-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-rose-400" />
              <span className="text-sm font-semibold text-rose-300">Danger Zone</span>
            </div>
          </div>

          <div className="flex flex-col gap-4 px-5 py-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-sm font-medium text-slate-200">Full Database Reset</div>
              <div className="mt-1 text-xs text-slate-400">
                Delete all data from non-protected tables in the {target === 'vaas' ? 'VaaS' : 'Main API'} database.
                This action cannot be undone.
              </div>
            </div>

            <button
              onClick={() => {
                setWipeConfirmPhrase('');
                setWipeModalOpen(true);
              }}
              className="inline-flex items-center gap-2 rounded-lg border border-rose-500/40 bg-rose-600/20 px-4 py-2 text-sm font-semibold text-rose-300 transition hover:bg-rose-600/30 hover:text-rose-200"
            >
              <Trash2 className="h-4 w-4" />
              Full Database Reset
            </button>
          </div>
        </div>
      )}

      {/* ── Wipe Confirmation Modal ────────────────────────────────────── */}
      <Modal
        isOpen={wipeModalOpen}
        onClose={() => setWipeModalOpen(false)}
        title="Full Database Reset"
        size="sm"
      >
        <div className="space-y-5">
          <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-rose-400" />
              <div>
                <div className="text-sm font-semibold text-rose-300">This will permanently delete all data</div>
                <div className="mt-1 text-xs text-rose-400/80">
                  All verification sessions, documents, logs, and audit trails in the{' '}
                  <span className="font-semibold">{target === 'vaas' ? 'VaaS' : 'Main API'}</span>{' '}
                  database will be permanently removed. Protected tables will not be affected.
                </div>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm text-slate-300">
              Type <code className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-sm text-rose-300">{expectedWipePhrase}</code> to confirm:
            </label>
            <input
              type="text"
              value={wipeConfirmPhrase}
              onChange={e => setWipeConfirmPhrase(e.target.value)}
              placeholder={expectedWipePhrase}
              className="mt-2 w-full rounded-lg border border-white/10 bg-slate-800/60 px-4 py-2.5 font-mono text-sm text-slate-200 placeholder-slate-600 focus:border-rose-400/40 focus:outline-none focus:ring-1 focus:ring-rose-400/30"
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              onClick={() => setWipeModalOpen(false)}
              className="rounded-lg border border-white/10 bg-slate-800 px-4 py-2.5 text-sm font-medium text-slate-200 transition hover:bg-slate-700"
            >
              Cancel
            </button>
            <button
              onClick={handleWipe}
              disabled={wipeConfirmPhrase !== expectedWipePhrase || wiping}
              className="inline-flex items-center gap-2 rounded-lg bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {wiping ? (
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
              Reset Database
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
