import React, { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { platformApi } from '../services/api';
import { ConfirmationModal } from '../components/ui/Modal';
import { sectionLabel, monoXs, monoSm, cardSurface, statusPill, tableHeaderClass } from '../styles/tokens';

interface ActiveSession {
  id: string;
  userAgent: string;
  ip: string;
  lastActiveAt: string;
  isCurrent: boolean;
}

export default function Sessions() {
  const [sessions, setSessions] = useState<ActiveSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmRevokeId, setConfirmRevokeId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setSessions(await platformApi.getSessions());
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load sessions');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const revoke = async (id: string) => {
    setError(null);
    setRevoking(id);
    try {
      await platformApi.revokeSession(id);
      setSessions((s) => s.filter((session) => session.id !== id));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to revoke session');
    } finally {
      setRevoking(null);
    }
  };

  const formatDate = (iso: string) => {
    if (!iso) return '\u2014';
    const d = new Date(iso);
    return isNaN(d.getTime()) ? '\u2014' : d.toLocaleString(undefined, {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className={sectionLabel}>Active Sessions</p>
          <p className="text-sm text-slate-500 mt-1">
            Devices currently logged into the platform admin.
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="p-2 border border-white/10 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800/40 disabled:opacity-50 transition-colors"
          title="Refresh"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {error && (
        <div className="p-4 bg-rose-500/12 border border-rose-500/25 rounded-lg text-rose-300 text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <div className="animate-pulse space-y-4">
          <div className={`${cardSurface} p-5`}>
            <div className="h-3 bg-slate-700/50 rounded w-40 mb-3" />
            <div className="h-3 bg-slate-700/50 rounded w-60" />
          </div>
        </div>
      ) : sessions.length === 0 ? (
        <div className="text-center py-12">
          <p className={`${sectionLabel} mb-2`}>No Sessions</p>
          <p className="text-sm text-slate-500">No active sessions found.</p>
        </div>
      ) : (
        <div className={`${cardSurface} overflow-hidden`}>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-900/80">
                <tr>
                  <th className={tableHeaderClass}>Device / Browser</th>
                  <th className={tableHeaderClass}>IP Address</th>
                  <th className={tableHeaderClass}>Last Active</th>
                  <th className={tableHeaderClass}></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {sessions.map((session) => (
                  <tr key={session.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="px-5 py-3.5">
                      <span className={`${monoSm} text-slate-100`}>
                        {session.userAgent || 'Unknown device'}
                      </span>
                      {session.isCurrent && (
                        <span className={`ml-2 ${statusPill} bg-cyan-500/15 text-cyan-300 border-cyan-500/30`}>
                          Current
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3.5">
                      <span className={`${monoXs} text-slate-500`}>{session.ip}</span>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className={`${monoXs} text-slate-400`}>{formatDate(session.lastActiveAt)}</span>
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      {!session.isCurrent && (
                        <button
                          onClick={() => setConfirmRevokeId(session.id)}
                          disabled={revoking === session.id}
                          className={`${monoXs} text-rose-400 hover:text-rose-300 disabled:opacity-50 transition-colors`}
                        >
                          {revoking === session.id ? 'Revoking...' : 'Revoke'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <ConfirmationModal
        isOpen={confirmRevokeId !== null}
        title="Revoke Session"
        message="Are you sure you want to revoke this session? The device will be logged out immediately."
        confirmText="Revoke"
        onConfirm={() => {
          if (confirmRevokeId) revoke(confirmRevokeId);
        }}
        onClose={() => setConfirmRevokeId(null)}
        confirmVariant="danger"
      />
    </div>
  );
}
