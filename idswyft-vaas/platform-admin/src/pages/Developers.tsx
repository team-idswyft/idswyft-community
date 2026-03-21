import React, { useState, useEffect, useCallback } from 'react';
import { Users, Search, ShieldOff, ShieldCheck, X } from 'lucide-react';
import { platformApi } from '../services/api';
import type { DeveloperInfo } from '../services/api';
import {
  sectionLabel,
  monoXs,
  monoSm,
  cardSurface,
  tableHeaderClass,
  statusPill,
  getStatusAccent,
} from '../styles/tokens';

type StatusFilter = 'all' | 'active' | 'suspended';

export default function Developers() {
  const [developers, setDevelopers] = useState<DeveloperInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [meta, setMeta] = useState<{ total: number; page: number; per_page: number }>({ total: 0, page: 1, per_page: 25 });
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [confirmAction, setConfirmAction] = useState<{ id: string; action: 'suspend' | 'unsuspend'; name: string } | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Auto-clear toast
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const fetchDevelopers = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      const params: Record<string, any> = { page, per_page: 25 };
      if (debouncedSearch) params.search = debouncedSearch;
      if (statusFilter !== 'all') params.status = statusFilter;

      const result = await platformApi.listDevelopers(params);
      setDevelopers(result.developers);
      setMeta(result.meta);
    } catch (err: any) {
      console.error('Failed to load developers:', err);
      setToast({ type: 'error', message: err.message || 'Failed to load developers' });
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, statusFilter]);

  useEffect(() => {
    fetchDevelopers(1);
  }, [fetchDevelopers]);

  async function handleAction() {
    if (!confirmAction) return;
    setActionLoading(true);
    try {
      if (confirmAction.action === 'suspend') {
        await platformApi.suspendDeveloper(confirmAction.id);
        setToast({ type: 'success', message: `${confirmAction.name} suspended` });
      } else {
        await platformApi.unsuspendDeveloper(confirmAction.id);
        setToast({ type: 'success', message: `${confirmAction.name} unsuspended` });
      }
      setConfirmAction(null);
      fetchDevelopers(meta.page);
    } catch (err: any) {
      setToast({ type: 'error', message: err.message || 'Action failed' });
      setConfirmAction(null);
    } finally {
      setActionLoading(false);
    }
  }

  const totalPages = Math.ceil(meta.total / meta.per_page);
  const filterTabs: { label: string; value: StatusFilter }[] = [
    { label: 'All', value: 'all' },
    { label: 'Active', value: 'active' },
    { label: 'Suspended', value: 'suspended' },
  ];

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-cyan-400" />
            <p className={sectionLabel}>Developers</p>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            {meta.total} developer{meta.total !== 1 ? 's' : ''} registered
          </p>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div
          className={`rounded-lg p-4 animate-slide-in-up ${
            toast.type === 'success'
              ? 'bg-emerald-500/12 border border-emerald-400/30'
              : 'bg-rose-500/12 border border-rose-400/30'
          }`}
        >
          <span className={`${monoXs} ${toast.type === 'success' ? 'text-emerald-300' : 'text-rose-300'}`}>
            {toast.message}
          </span>
        </div>
      )}

      {/* Search + Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, email, or company..."
            className="form-input pl-10 w-full"
          />
        </div>
        <div className="flex items-center gap-1 rounded-lg border border-white/10 bg-slate-900/40 p-1">
          {filterTabs.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setStatusFilter(tab.value)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition ${
                statusFilter === tab.value
                  ? 'bg-cyan-400/15 text-cyan-300 border border-cyan-400/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className={`${cardSurface} overflow-hidden`}>
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-400" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-950/60">
                  <th className={tableHeaderClass}>Developer</th>
                  <th className={tableHeaderClass}>Email</th>
                  <th className={tableHeaderClass}>Company</th>
                  <th className={tableHeaderClass}>Status</th>
                  <th className={`${tableHeaderClass} text-right`}>Verifications</th>
                  <th className={`${tableHeaderClass} text-right`}>API Keys</th>
                  <th className={tableHeaderClass}>Signed Up</th>
                  <th className={tableHeaderClass}>Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {developers.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-5 py-8 text-center text-slate-500">
                      No developers found
                    </td>
                  </tr>
                ) : (
                  developers.map((dev) => (
                    <tr key={dev.id} className="transition hover:bg-slate-800/40">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          {dev.avatar_url ? (
                            <img
                              src={dev.avatar_url}
                              alt=""
                              className="h-8 w-8 rounded-full object-cover border border-white/10"
                            />
                          ) : (
                            <div className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-slate-800 text-xs font-semibold text-slate-400">
                              {dev.name?.charAt(0)?.toUpperCase() || '?'}
                            </div>
                          )}
                          <span className="text-sm font-medium text-slate-100 truncate max-w-[140px]">
                            {dev.name}
                          </span>
                        </div>
                      </td>
                      <td className={`px-5 py-3 ${monoSm} text-slate-300`}>{dev.email}</td>
                      <td className="px-5 py-3 text-sm text-slate-400">{dev.company || '--'}</td>
                      <td className="px-5 py-3">
                        <span className={`${statusPill} ${getStatusAccent(dev.status || 'active').pill}`}>
                          {dev.status || 'active'}
                        </span>
                      </td>
                      <td className={`px-5 py-3 ${monoXs} text-slate-300 text-right`}>
                        {dev.verification_count}
                      </td>
                      <td className={`px-5 py-3 ${monoXs} text-slate-300 text-right`}>
                        {dev.api_key_count}
                      </td>
                      <td className={`px-5 py-3 ${monoXs} text-slate-500`}>
                        {new Date(dev.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-5 py-3">
                        {dev.status === 'suspended' ? (
                          <button
                            onClick={() => setConfirmAction({ id: dev.id, action: 'unsuspend', name: dev.name })}
                            className="flex items-center gap-1.5 text-xs text-emerald-400 hover:text-emerald-300 transition"
                            title="Unsuspend developer"
                          >
                            <ShieldCheck className="h-4 w-4" />
                            Unsuspend
                          </button>
                        ) : (
                          <button
                            onClick={() => setConfirmAction({ id: dev.id, action: 'suspend', name: dev.name })}
                            className="flex items-center gap-1.5 text-xs text-rose-400 hover:text-rose-300 transition"
                            title="Suspend developer"
                          >
                            <ShieldOff className="h-4 w-4" />
                            Suspend
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {!loading && totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-white/10 px-5 py-3">
            <span className={`${monoXs} text-slate-500`}>
              Page {meta.page} of {totalPages} ({meta.total} total)
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => fetchDevelopers(meta.page - 1)}
                disabled={meta.page <= 1}
                className="btn btn-ghost text-xs disabled:opacity-40"
              >
                Previous
              </button>
              <button
                onClick={() => fetchDevelopers(meta.page + 1)}
                disabled={meta.page >= totalPages}
                className="btn btn-ghost text-xs disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Confirm Action Modal */}
      {confirmAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="fixed inset-0 bg-slate-950/65 backdrop-blur-[2px]"
            onClick={() => setConfirmAction(null)}
          />
          <div className="relative glass-panel rounded-xl p-6 w-full max-w-sm animate-scale-in">
            <div className="flex items-center justify-between mb-4">
              <p className="text-slate-100 font-semibold">
                {confirmAction.action === 'suspend' ? 'Suspend Developer' : 'Unsuspend Developer'}
              </p>
              <button
                onClick={() => setConfirmAction(null)}
                className="text-slate-400 hover:text-slate-200 transition"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="text-sm text-slate-400 mb-5">
              {confirmAction.action === 'suspend'
                ? `Are you sure you want to suspend ${confirmAction.name}? They will be unable to use the API until unsuspended.`
                : `Are you sure you want to unsuspend ${confirmAction.name}? Their API access will be restored immediately.`}
            </p>
            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => setConfirmAction(null)}
                className="btn btn-ghost text-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleAction}
                disabled={actionLoading}
                className={`btn text-sm ${
                  confirmAction.action === 'suspend' ? 'btn-danger' : 'btn-primary'
                }`}
              >
                {actionLoading
                  ? 'Processing...'
                  : confirmAction.action === 'suspend'
                    ? 'Suspend'
                    : 'Unsuspend'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
