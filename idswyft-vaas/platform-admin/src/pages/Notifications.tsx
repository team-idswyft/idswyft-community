import React, { useState, useEffect, useCallback } from 'react';
import { Check, ChevronLeft, ChevronRight, Eye } from 'lucide-react';
import platformApi from '../services/api';
import { cardSurface, tableHeaderClass, statusPill, getStatusAccent, monoXs, monoSm, sectionLabel } from '../styles/tokens';

const SEVERITY_TABS = ['all', 'info', 'warning', 'error', 'critical'] as const;

interface Notification {
  id: string;
  type: string;
  severity: string;
  title: string;
  message: string;
  metadata: Record<string, any>;
  source?: string;
  read: boolean;
  created_at: string;
}

export default function Notifications() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [perPage] = useState(25);
  const [severityFilter, setSeverityFilter] = useState<string>('all');
  const [readFilter, setReadFilter] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, any> = { page, per_page: perPage };
      if (severityFilter !== 'all') params.severity = severityFilter;
      if (readFilter === 'unread') params.read = false;
      if (readFilter === 'read') params.read = true;

      const { notifications: items, meta } = await platformApi.listNotifications(params);
      setNotifications(items);
      setTotal(meta.total || 0);
    } catch (err: any) {
      setToast({ message: err.message, type: 'error' });
    } finally {
      setLoading(false);
    }
  }, [page, perPage, severityFilter, readFilter]);

  useEffect(() => { fetchNotifications(); }, [fetchNotifications]);

  // Auto-dismiss toast after 5s
  useEffect(() => {
    if (toast) { const t = setTimeout(() => setToast(null), 5000); return () => clearTimeout(t); }
  }, [toast]);

  const handleMarkAllRead = async () => {
    try {
      await platformApi.markAllNotificationsRead();
      setToast({ message: 'All notifications marked as read', type: 'success' });
      fetchNotifications();
    } catch (err: any) {
      setToast({ message: err.message, type: 'error' });
    }
  };

  const handleMarkRead = async (id: string) => {
    try {
      await platformApi.markNotificationRead(id);
      setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, read: true } : n));
    } catch {
      // silent
    }
  };

  const totalPages = Math.ceil(total / perPage);

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="p-6 lg:p-8 space-y-6">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 rounded-lg border px-4 py-3 text-sm shadow-lg ${
          toast.type === 'success' ? 'border-emerald-500/30 bg-emerald-500/15 text-emerald-300' : 'border-rose-500/30 bg-rose-500/15 text-rose-300'
        }`}>
          {toast.message}
          <button onClick={() => setToast(null)} className="ml-3 text-white/50 hover:text-white">&times;</button>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-100">Notifications</h2>
          <p className="mt-1 text-sm text-slate-400">Platform events and alerts</p>
        </div>
        <button
          onClick={handleMarkAllRead}
          className="flex items-center gap-2 rounded-lg border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-slate-300 transition hover:border-cyan-400/40 hover:text-cyan-200"
        >
          <Check className="h-4 w-4" />
          Mark all read
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Severity tabs */}
        <div className="flex rounded-lg border border-white/10 bg-slate-900/40 p-0.5">
          {SEVERITY_TABS.map((sev) => (
            <button
              key={sev}
              onClick={() => { setSeverityFilter(sev); setPage(1); }}
              className={`rounded-md px-3 py-1.5 text-xs font-medium capitalize transition ${
                severityFilter === sev
                  ? 'bg-cyan-500/20 text-cyan-200'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {sev}
            </button>
          ))}
        </div>

        {/* Read/unread toggle */}
        <div className="flex rounded-lg border border-white/10 bg-slate-900/40 p-0.5">
          {['all', 'unread', 'read'].map((f) => (
            <button
              key={f}
              onClick={() => { setReadFilter(f); setPage(1); }}
              className={`rounded-md px-3 py-1.5 text-xs font-medium capitalize transition ${
                readFilter === f
                  ? 'bg-cyan-500/20 text-cyan-200'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className={cardSurface}>
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-cyan-400 border-t-transparent" />
          </div>
        ) : notifications.length === 0 ? (
          <div className="py-16 text-center text-sm text-slate-500">No notifications found</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/10">
                  <th className={tableHeaderClass} style={{ width: '40px' }}></th>
                  <th className={tableHeaderClass}>Severity</th>
                  <th className={tableHeaderClass}>Type</th>
                  <th className={tableHeaderClass}>Title</th>
                  <th className={tableHeaderClass}>Message</th>
                  <th className={tableHeaderClass}>Time</th>
                  <th className={tableHeaderClass}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {notifications.map((n) => {
                  const accent = getStatusAccent(n.severity);
                  return (
                    <React.Fragment key={n.id}>
                      <tr className={`border-b border-white/5 transition hover:bg-white/5 ${!n.read ? 'bg-cyan-500/5' : ''}`}>
                        <td className="px-3 py-3">
                          {!n.read && <div className="h-2 w-2 rounded-full bg-cyan-400" />}
                        </td>
                        <td className="px-5 py-3">
                          <span className={`${statusPill} ${accent.pill}`}>{n.severity}</span>
                        </td>
                        <td className="px-5 py-3">
                          <span className={`${monoXs} text-slate-400`}>{n.type}</span>
                        </td>
                        <td className="px-5 py-3">
                          <span className="text-sm text-slate-200">{n.title}</span>
                        </td>
                        <td className="px-5 py-3 max-w-xs">
                          <span className="text-sm text-slate-400 truncate block">{n.message}</span>
                        </td>
                        <td className="px-5 py-3">
                          <span className={`${monoXs} text-slate-500`}>{formatDate(n.created_at)}</span>
                        </td>
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => setExpandedId(expandedId === n.id ? null : n.id)}
                              className="rounded-md p-1 text-slate-400 hover:bg-white/10 hover:text-slate-200"
                              title="View details"
                            >
                              <Eye className="h-3.5 w-3.5" />
                            </button>
                            {!n.read && (
                              <button
                                onClick={() => handleMarkRead(n.id)}
                                className="rounded-md p-1 text-slate-400 hover:bg-white/10 hover:text-cyan-300"
                                title="Mark read"
                              >
                                <Check className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                      {expandedId === n.id && (
                        <tr>
                          <td colSpan={7} className="bg-slate-800/30 px-8 py-4">
                            <div className={sectionLabel}>Metadata</div>
                            <pre className={`${monoXs} mt-2 text-slate-300 whitespace-pre-wrap`}>
                              {JSON.stringify(n.metadata, null, 2)}
                            </pre>
                            {n.source && (
                              <div className="mt-2">
                                <span className={`${sectionLabel}`}>Source: </span>
                                <span className={`${monoXs} text-slate-400`}>{n.source}</span>
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-white/10 px-5 py-3">
            <span className={`${monoXs} text-slate-500`}>{total} total</span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(Math.max(1, page - 1))}
                disabled={page === 1}
                className="rounded-md border border-white/10 p-1 text-slate-400 transition hover:border-cyan-400/40 disabled:opacity-30"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className={`${monoXs} text-slate-400`}>
                {page} / {totalPages}
              </span>
              <button
                onClick={() => setPage(Math.min(totalPages, page + 1))}
                disabled={page === totalPages}
                className="rounded-md border border-white/10 p-1 text-slate-400 transition hover:border-cyan-400/40 disabled:opacity-30"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
