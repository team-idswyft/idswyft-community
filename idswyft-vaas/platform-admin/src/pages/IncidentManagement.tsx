import React, { useState, useEffect, useCallback } from 'react';
import {
  AlertTriangle,
  Plus,
  RefreshCw,
  CheckCircle,
  XCircle,
  ChevronDown,
  ChevronUp,
  Clock,
  Send,
  Trash2,
  Shield,
} from 'lucide-react';
import { platformApi } from '../services/api';
import type { StatusIncident, StatusIncidentUpdate } from '../services/api';
import {
  sectionLabel,
  monoXs,
  cardSurface,
  statusPill,
} from '../styles/tokens';

// ── Constants ────────────────────────────────────────────────────────────────

const AFFECTED_SERVICES = ['main_api', 'vaas_api', 'web_app', 'enterprise'] as const;

const SEVERITY_COLORS: Record<string, string> = {
  minor: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  major: 'bg-orange-500/15 text-orange-300 border-orange-500/30',
  critical: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
};

const STATUS_COLORS: Record<string, string> = {
  investigating: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
  identified: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  monitoring: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
  resolved: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function relativeTime(iso: string): string {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return 'just now';
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function serviceLabel(svc: string): string {
  switch (svc) {
    case 'main_api': return 'Main API';
    case 'vaas_api': return 'VaaS API';
    case 'web_app': return 'Web App';
    case 'enterprise': return 'Enterprise';
    default: return svc;
  }
}

// ── Component ────────────────────────────────────────────────────────────────

export default function IncidentManagement() {
  const [incidents, setIncidents] = useState<StatusIncident[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Create form state
  const [showCreate, setShowCreate] = useState(false);
  const [createTitle, setCreateTitle] = useState('');
  const [createSeverity, setCreateSeverity] = useState<string>('minor');
  const [createServices, setCreateServices] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);

  // Add update state (keyed by incident id)
  const [updateInputs, setUpdateInputs] = useState<Record<string, string>>({});
  const [showUpdateFor, setShowUpdateFor] = useState<string | null>(null);

  // Resolved section collapsed
  const [showResolved, setShowResolved] = useState(false);

  // Action loading state
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // ── Fetch ──────────────────────────────────────────────────────────────

  const fetchIncidents = useCallback(async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const data = await platformApi.getStatusIncidents();
      setIncidents(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load incidents');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchIncidents();
  }, [fetchIncidents]);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => fetchIncidents(true), 30_000);
    return () => clearInterval(interval);
  }, [fetchIncidents]);

  // Clear messages after 5s
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(null), 5000);
    return () => clearTimeout(timer);
  }, [message]);

  // ── Actions ────────────────────────────────────────────────────────────

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createTitle.trim() || createServices.length === 0) {
      setMessage({ type: 'error', text: 'Title and at least one affected service are required' });
      return;
    }

    setCreating(true);
    try {
      await platformApi.createStatusIncident({
        title: createTitle.trim(),
        severity: createSeverity,
        affected_services: createServices,
      });
      setMessage({ type: 'success', text: 'Incident created' });
      setCreateTitle('');
      setCreateSeverity('minor');
      setCreateServices([]);
      setShowCreate(false);
      await fetchIncidents(true);
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to create incident' });
    } finally {
      setCreating(false);
    }
  };

  const handleResolve = async (id: string) => {
    setActionLoading(id);
    try {
      await platformApi.updateStatusIncident(id, { status: 'resolved' });
      setMessage({ type: 'success', text: 'Incident resolved' });
      await fetchIncidents(true);
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to resolve incident' });
    } finally {
      setActionLoading(null);
    }
  };

  const handleAddUpdate = async (id: string) => {
    const msg = updateInputs[id]?.trim();
    if (!msg) return;

    setActionLoading(id);
    try {
      await platformApi.addIncidentUpdate(id, { message: msg });
      setMessage({ type: 'success', text: 'Update added' });
      setUpdateInputs((prev) => ({ ...prev, [id]: '' }));
      setShowUpdateFor(null);
      await fetchIncidents(true);
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to add update' });
    } finally {
      setActionLoading(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this incident permanently?')) return;
    setActionLoading(id);
    try {
      await platformApi.deleteStatusIncident(id);
      setMessage({ type: 'success', text: 'Incident deleted' });
      await fetchIncidents(true);
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to delete incident' });
    } finally {
      setActionLoading(null);
    }
  };

  const toggleService = (svc: string) => {
    setCreateServices((prev) =>
      prev.includes(svc) ? prev.filter((s) => s !== svc) : [...prev, svc]
    );
  };

  // ── Derived data ───────────────────────────────────────────────────────

  const activeIncidents = incidents.filter((i) => i.status !== 'resolved');
  const resolvedIncidents = incidents.filter((i) => i.status === 'resolved');

  // ── Loading / Error ────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-cyan-400 border-t-transparent" />
          <p className="text-sm text-slate-400">Loading incidents...</p>
        </div>
      </div>
    );
  }

  if (error && incidents.length === 0) {
    return (
      <div className="p-6">
        <div className="flex items-center gap-3 rounded-xl border border-rose-500/30 bg-rose-500/10 px-5 py-4 text-rose-300">
          <AlertTriangle className="h-5 w-5 flex-shrink-0" />
          <span className="text-sm">{error}</span>
          <button onClick={() => fetchIncidents()} className="ml-auto text-xs underline hover:no-underline">
            Retry
          </button>
        </div>
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6 p-6">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold text-slate-100">Incident Management</h2>
          <span className={`${statusPill} bg-cyan-500/15 text-cyan-300 border-cyan-500/30`}>
            <Shield className="mr-1 inline h-3 w-3" />
            Super admin
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => fetchIncidents(true)}
            disabled={refreshing}
            className="flex items-center gap-2 rounded-lg border border-white/10 bg-slate-800/60 px-3 py-2 text-sm text-slate-300 transition hover:border-cyan-400/40 hover:text-cyan-200 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            onClick={() => setShowCreate(!showCreate)}
            className="flex items-center gap-2 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-sm font-medium text-cyan-300 transition hover:bg-cyan-500/20"
          >
            <Plus className="h-4 w-4" />
            Create Incident
          </button>
        </div>
      </div>

      {/* ── Toast message ──────────────────────────────────────────────── */}
      {message && (
        <div
          className={`flex items-center gap-2 rounded-lg border px-4 py-3 text-sm ${
            message.type === 'success'
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
              : 'border-rose-500/30 bg-rose-500/10 text-rose-300'
          }`}
        >
          {message.type === 'success' ? (
            <CheckCircle className="h-4 w-4 flex-shrink-0" />
          ) : (
            <XCircle className="h-4 w-4 flex-shrink-0" />
          )}
          {message.text}
        </div>
      )}

      {/* ── Create form ────────────────────────────────────────────────── */}
      {showCreate && (
        <form onSubmit={handleCreate} className={`${cardSurface} space-y-4 p-5`}>
          <div className={sectionLabel}>New Incident</div>

          {/* Title */}
          <div>
            <label className="mb-1.5 block text-sm text-slate-400">Title</label>
            <input
              type="text"
              value={createTitle}
              onChange={(e) => setCreateTitle(e.target.value)}
              placeholder="e.g. Elevated error rates on VaaS API"
              className="w-full rounded-lg border border-white/10 bg-slate-800/60 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 outline-none focus:border-cyan-400/40"
            />
          </div>

          {/* Severity */}
          <div>
            <label className="mb-1.5 block text-sm text-slate-400">Severity</label>
            <select
              value={createSeverity}
              onChange={(e) => setCreateSeverity(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-slate-800/60 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-400/40"
            >
              <option value="minor">Minor</option>
              <option value="major">Major</option>
              <option value="critical">Critical</option>
            </select>
          </div>

          {/* Affected services */}
          <div>
            <label className="mb-1.5 block text-sm text-slate-400">Affected Services</label>
            <div className="flex flex-wrap gap-2">
              {AFFECTED_SERVICES.map((svc) => {
                const selected = createServices.includes(svc);
                return (
                  <button
                    key={svc}
                    type="button"
                    onClick={() => toggleService(svc)}
                    className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                      selected
                        ? 'border-cyan-500/40 bg-cyan-500/15 text-cyan-300'
                        : 'border-white/10 bg-slate-800/40 text-slate-400 hover:border-white/20'
                    }`}
                  >
                    {serviceLabel(svc)}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Submit */}
          <div className="flex items-center gap-3 pt-2">
            <button
              type="submit"
              disabled={creating}
              className="flex items-center gap-2 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-4 py-2 text-sm font-medium text-cyan-300 transition hover:bg-cyan-500/20 disabled:opacity-50"
            >
              {creating ? (
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-cyan-400 border-t-transparent" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              Create Incident
            </button>
            <button
              type="button"
              onClick={() => setShowCreate(false)}
              className="rounded-lg border border-white/10 bg-slate-800/40 px-4 py-2 text-sm text-slate-400 transition hover:text-slate-200"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* ── Active Incidents ───────────────────────────────────────────── */}
      <div>
        <div className={`${sectionLabel} mb-3`}>
          Active Incidents ({activeIncidents.length})
        </div>

        {activeIncidents.length === 0 ? (
          <div className={`${cardSurface} flex items-center justify-center p-12 text-sm text-slate-500`}>
            No active incidents
          </div>
        ) : (
          <div className="space-y-3">
            {activeIncidents.map((incident) => (
              <IncidentCard
                key={incident.id}
                incident={incident}
                actionLoading={actionLoading}
                showUpdateFor={showUpdateFor}
                updateInputs={updateInputs}
                onToggleUpdate={(id) => setShowUpdateFor(showUpdateFor === id ? null : id)}
                onUpdateInputChange={(id, val) => setUpdateInputs((prev) => ({ ...prev, [id]: val }))}
                onAddUpdate={handleAddUpdate}
                onResolve={handleResolve}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Resolved Incidents ─────────────────────────────────────────── */}
      {resolvedIncidents.length > 0 && (
        <div>
          <button
            onClick={() => setShowResolved(!showResolved)}
            className="flex items-center gap-2 text-sm text-slate-400 hover:text-slate-200 transition"
          >
            {showResolved ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            <span className={sectionLabel}>
              Resolved Incidents ({resolvedIncidents.length})
            </span>
          </button>

          {showResolved && (
            <div className="mt-3 space-y-3">
              {resolvedIncidents.map((incident) => (
                <IncidentCard
                  key={incident.id}
                  incident={incident}
                  actionLoading={actionLoading}
                  showUpdateFor={showUpdateFor}
                  updateInputs={updateInputs}
                  onToggleUpdate={(id) => setShowUpdateFor(showUpdateFor === id ? null : id)}
                  onUpdateInputChange={(id, val) => setUpdateInputs((prev) => ({ ...prev, [id]: val }))}
                  onAddUpdate={handleAddUpdate}
                  onResolve={handleResolve}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Incident Card Sub-component ──────────────────────────────────────────────

interface IncidentCardProps {
  incident: StatusIncident;
  actionLoading: string | null;
  showUpdateFor: string | null;
  updateInputs: Record<string, string>;
  onToggleUpdate: (id: string) => void;
  onUpdateInputChange: (id: string, val: string) => void;
  onAddUpdate: (id: string) => void;
  onResolve: (id: string) => void;
  onDelete: (id: string) => void;
}

function IncidentCard({
  incident,
  actionLoading,
  showUpdateFor,
  updateInputs,
  onToggleUpdate,
  onUpdateInputChange,
  onAddUpdate,
  onResolve,
  onDelete,
}: IncidentCardProps) {
  const isLoading = actionLoading === incident.id;
  const isResolved = incident.status === 'resolved';

  return (
    <div className={`${cardSurface} p-5`}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        {/* Left: Title + badges + metadata */}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold text-slate-100">{incident.title}</h3>

            {/* Severity badge */}
            <span className={`${statusPill} ${SEVERITY_COLORS[incident.severity] || ''}`}>
              {incident.severity}
            </span>

            {/* Status badge */}
            <span className={`${statusPill} ${STATUS_COLORS[incident.status] || ''}`}>
              {incident.status}
            </span>
          </div>

          {/* Affected services tags */}
          <div className="mt-2 flex flex-wrap gap-1.5">
            {incident.affected_services.map((svc) => (
              <span
                key={svc}
                className="rounded-md border border-white/10 bg-slate-800/40 px-2 py-0.5 text-xs text-slate-400"
              >
                {serviceLabel(svc)}
              </span>
            ))}
          </div>

          {/* Timestamps */}
          <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1">
            <span className={`flex items-center gap-1.5 ${monoXs} text-slate-500`}>
              <Clock className="h-3 w-3" />
              Created {relativeTime(incident.created_at)}
            </span>
            {incident.resolved_at && (
              <span className={`flex items-center gap-1.5 ${monoXs} text-emerald-400`}>
                <CheckCircle className="h-3 w-3" />
                Resolved {relativeTime(incident.resolved_at)}
              </span>
            )}
          </div>

          {/* Existing updates */}
          {incident.updates && incident.updates.length > 0 && (
            <div className="mt-3 space-y-2 border-l-2 border-white/5 pl-3">
              {incident.updates.map((upd) => (
                <div key={upd.id} className="text-xs">
                  <span className="text-slate-500">{relativeTime(upd.created_at)}</span>
                  {upd.status && (
                    <span className={`ml-2 ${statusPill} ${STATUS_COLORS[upd.status] || 'bg-slate-500/15 text-slate-300 border-slate-500/30'}`}>
                      {upd.status}
                    </span>
                  )}
                  <p className="mt-0.5 text-slate-300">{upd.message}</p>
                </div>
              ))}
            </div>
          )}

          {/* Add update inline form */}
          {showUpdateFor === incident.id && (
            <div className="mt-3 flex items-center gap-2">
              <input
                type="text"
                value={updateInputs[incident.id] || ''}
                onChange={(e) => onUpdateInputChange(incident.id, e.target.value)}
                placeholder="Status update message..."
                className="flex-1 rounded-lg border border-white/10 bg-slate-800/60 px-3 py-1.5 text-sm text-slate-100 placeholder-slate-500 outline-none focus:border-cyan-400/40"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') onAddUpdate(incident.id);
                }}
              />
              <button
                onClick={() => onAddUpdate(incident.id)}
                disabled={isLoading}
                className="flex items-center gap-1.5 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-1.5 text-xs font-medium text-cyan-300 transition hover:bg-cyan-500/20 disabled:opacity-50"
              >
                <Send className="h-3.5 w-3.5" />
                Send
              </button>
            </div>
          )}
        </div>

        {/* Right: Actions */}
        {!isResolved && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => onToggleUpdate(incident.id)}
              disabled={isLoading}
              className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-slate-800/40 px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:border-cyan-400/40 hover:text-cyan-200 disabled:opacity-50"
            >
              <Send className="h-3.5 w-3.5" />
              Add Update
            </button>
            <button
              onClick={() => onResolve(incident.id)}
              disabled={isLoading}
              className="flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-300 transition hover:bg-emerald-500/20 disabled:opacity-50"
            >
              <CheckCircle className="h-3.5 w-3.5" />
              Resolve
            </button>
            <button
              onClick={() => onDelete(incident.id)}
              disabled={isLoading}
              className="flex items-center gap-1.5 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-xs font-medium text-rose-300 transition hover:bg-rose-500/20 disabled:opacity-50"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {isResolved && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => onDelete(incident.id)}
              disabled={isLoading}
              className="flex items-center gap-1.5 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-xs font-medium text-rose-300 transition hover:bg-rose-500/20 disabled:opacity-50"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
