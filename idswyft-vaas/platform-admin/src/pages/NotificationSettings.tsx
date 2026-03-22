import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, Zap, ChevronDown, ChevronRight } from 'lucide-react';
import platformApi from '../services/api';
import Modal from '../components/ui/Modal';
import { cardSurface, tableHeaderClass, statusPill, getStatusAccent, monoXs, monoSm, sectionLabel, infoPanel } from '../styles/tokens';

const CHANNEL_TYPES = ['slack', 'discord', 'email', 'webhook'] as const;
const EVENT_GROUPS: Record<string, string[]> = {
  Health: ['health.service_down', 'health.service_degraded', 'health.service_recovered'],
  Developer: ['developer.signup', 'developer.suspended', 'developer.unsuspended'],
  Organization: ['organization.created', 'organization.suspended', 'organization.status_changed'],
  Security: ['security.failed_login', 'security.admin_created', 'security.admin_deleted'],
  Config: ['config.changed'],
  'Key Management': ['key_change.requested', 'key_change.approved', 'key_change.denied', 'key_change.executed', 'key_change.expired'],
  Verification: ['verification.anomaly'],
  Webhook: ['webhook.delivery_failed'],
};

interface Channel {
  id: string;
  name: string;
  type: string;
  config: Record<string, any>;
  enabled: boolean;
  last_success_at?: string;
  last_failure_at?: string;
  failure_count: number;
  created_at: string;
}

interface Rule {
  id?: string;
  channel_id: string;
  event_type: string;
  min_severity: string;
  enabled: boolean;
}

export default function NotificationSettings() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editChannel, setEditChannel] = useState<Channel | null>(null);
  const [expandedChannelId, setExpandedChannelId] = useState<string | null>(null);
  const [channelRules, setChannelRules] = useState<Rule[]>([]);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [testing, setTesting] = useState<string | null>(null);

  // Modal form state
  const [formName, setFormName] = useState('');
  const [formType, setFormType] = useState<string>('slack');
  const [formEnabled, setFormEnabled] = useState(true);
  const [formWebhookUrl, setFormWebhookUrl] = useState('');
  const [formRecipients, setFormRecipients] = useState('');
  const [formCustomUrl, setFormCustomUrl] = useState('');
  const [formCustomMethod, setFormCustomMethod] = useState('POST');
  const [formCustomHeaders, setFormCustomHeaders] = useState('');

  const fetchChannels = useCallback(async () => {
    setLoading(true);
    try {
      const data = await platformApi.listNotificationChannels();
      setChannels(data);
    } catch (err: any) {
      setToast({ message: err.message, type: 'error' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchChannels(); }, [fetchChannels]);

  // Auto-dismiss toast after 5s
  useEffect(() => {
    if (toast) { const t = setTimeout(() => setToast(null), 5000); return () => clearTimeout(t); }
  }, [toast]);

  const openCreateModal = () => {
    setEditChannel(null);
    setFormName('');
    setFormType('slack');
    setFormEnabled(true);
    setFormWebhookUrl('');
    setFormRecipients('');
    setFormCustomUrl('');
    setFormCustomMethod('POST');
    setFormCustomHeaders('');
    setShowModal(true);
  };

  const openEditModal = (ch: Channel) => {
    setEditChannel(ch);
    setFormName(ch.name);
    setFormType(ch.type);
    setFormEnabled(ch.enabled);
    setFormWebhookUrl(ch.config.webhook_url || '');
    setFormRecipients((ch.config.recipients || []).join(', '));
    setFormCustomUrl(ch.config.url || '');
    setFormCustomMethod(ch.config.method || 'POST');
    setFormCustomHeaders(ch.config.headers ? JSON.stringify(ch.config.headers) : '');
    setShowModal(true);
  };

  const buildConfig = () => {
    switch (formType) {
      case 'slack':
      case 'discord':
        return { webhook_url: formWebhookUrl };
      case 'email':
        return { recipients: formRecipients.split(',').map((e) => e.trim()).filter(Boolean) };
      case 'webhook':
        let headers: Record<string, string> = {};
        if (formCustomHeaders.trim()) {
          try { headers = JSON.parse(formCustomHeaders); } catch { /* ignore */ }
        }
        return { url: formCustomUrl, method: formCustomMethod, headers };
      default:
        return {};
    }
  };

  const handleSave = async () => {
    try {
      const payload = { name: formName, type: formType, config: buildConfig(), enabled: formEnabled };
      if (editChannel) {
        await platformApi.updateNotificationChannel(editChannel.id, payload);
        setToast({ message: 'Channel updated', type: 'success' });
      } else {
        await platformApi.createNotificationChannel(payload);
        setToast({ message: 'Channel created', type: 'success' });
      }
      setShowModal(false);
      fetchChannels();
    } catch (err: any) {
      setToast({ message: err.message, type: 'error' });
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this notification channel?')) return;
    try {
      await platformApi.deleteNotificationChannel(id);
      setToast({ message: 'Channel deleted', type: 'success' });
      fetchChannels();
    } catch (err: any) {
      setToast({ message: err.message, type: 'error' });
    }
  };

  const handleTest = async (id: string) => {
    setTesting(id);
    try {
      await platformApi.testNotificationChannel(id);
      setToast({ message: 'Test notification sent', type: 'success' });
      fetchChannels();
    } catch (err: any) {
      setToast({ message: err.message, type: 'error' });
    } finally {
      setTesting(null);
    }
  };

  // Rules management
  const toggleRulesPanel = async (channelId: string) => {
    if (expandedChannelId === channelId) {
      setExpandedChannelId(null);
      return;
    }
    setExpandedChannelId(channelId);
    try {
      const rules = await platformApi.getChannelRules(channelId);
      setChannelRules(rules);
    } catch {
      setChannelRules([]);
    }
  };

  const handleRuleToggle = (eventType: string) => {
    setChannelRules((prev) => {
      const existing = prev.find((r) => r.event_type === eventType);
      if (existing) {
        return prev.map((r) => r.event_type === eventType ? { ...r, enabled: !r.enabled } : r);
      }
      return [...prev, { channel_id: expandedChannelId!, event_type: eventType, min_severity: 'info', enabled: true }];
    });
  };

  const handleRuleSeverityChange = (eventType: string, severity: string) => {
    setChannelRules((prev) =>
      prev.map((r) => r.event_type === eventType ? { ...r, min_severity: severity } : r)
    );
  };

  const handleSaveRules = async () => {
    if (!expandedChannelId) return;
    try {
      const rules = channelRules.filter((r) => r.enabled).map((r) => ({
        event_type: r.event_type,
        min_severity: r.min_severity,
        enabled: true,
      }));
      await platformApi.updateChannelRules(expandedChannelId, rules);
      setToast({ message: 'Rules saved', type: 'success' });
    } catch (err: any) {
      setToast({ message: err.message, type: 'error' });
    }
  };

  const formatDate = (d?: string) => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

  const inputClass = 'w-full rounded-lg border border-white/10 bg-slate-800/60 px-3 py-2 text-sm text-slate-200 focus:border-cyan-400/50 focus:outline-none';

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
          <h2 className="text-xl font-semibold text-slate-100">Alert Channels</h2>
          <p className="mt-1 text-sm text-slate-400">Configure where platform notifications are sent</p>
        </div>
        <button
          onClick={openCreateModal}
          className="flex items-center gap-2 rounded-lg bg-cyan-500/20 border border-cyan-500/30 px-4 py-2 text-sm font-medium text-cyan-200 transition hover:bg-cyan-500/30"
        >
          <Plus className="h-4 w-4" />
          Add Channel
        </button>
      </div>

      {/* Channel list */}
      <div className={cardSurface}>
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-cyan-400 border-t-transparent" />
          </div>
        ) : channels.length === 0 ? (
          <div className="py-16 text-center text-sm text-slate-500">No notification channels configured</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/10">
                  <th className={tableHeaderClass}>Name</th>
                  <th className={tableHeaderClass}>Type</th>
                  <th className={tableHeaderClass}>Status</th>
                  <th className={tableHeaderClass}>Last Success</th>
                  <th className={tableHeaderClass}>Failures</th>
                  <th className={tableHeaderClass}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {channels.map((ch) => {
                  const statusKey = ch.enabled ? (ch.failure_count > 5 ? 'unhealthy' : ch.failure_count > 0 ? 'degraded' : 'healthy') : 'disabled';
                  const accent = getStatusAccent(statusKey);

                  return (
                    <React.Fragment key={ch.id}>
                      <tr className="border-b border-white/5 transition hover:bg-white/5">
                        <td className="px-5 py-3">
                          <span className="text-sm font-medium text-slate-200">{ch.name}</span>
                        </td>
                        <td className="px-5 py-3">
                          <span className={`${statusPill} bg-slate-500/15 text-slate-300 border-slate-500/30`}>{ch.type}</span>
                        </td>
                        <td className="px-5 py-3">
                          <span className={`${statusPill} ${accent.pill}`}>{ch.enabled ? (ch.failure_count > 5 ? 'unhealthy' : 'healthy') : 'disabled'}</span>
                        </td>
                        <td className="px-5 py-3">
                          <span className={`${monoXs} text-slate-500`}>{formatDate(ch.last_success_at)}</span>
                        </td>
                        <td className="px-5 py-3">
                          <span className={`${monoSm} ${ch.failure_count > 0 ? 'text-rose-400' : 'text-slate-500'}`}>{ch.failure_count}</span>
                        </td>
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => toggleRulesPanel(ch.id)}
                              className="rounded-md px-2 py-1 text-xs text-slate-400 hover:bg-white/10 hover:text-slate-200 flex items-center gap-1"
                            >
                              {expandedChannelId === ch.id ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                              Rules
                            </button>
                            <button
                              onClick={() => handleTest(ch.id)}
                              disabled={testing === ch.id}
                              className="rounded-md px-2 py-1 text-xs text-cyan-400 hover:bg-cyan-500/10 disabled:opacity-50"
                            >
                              {testing === ch.id ? '...' : 'Test'}
                            </button>
                            <button
                              onClick={() => openEditModal(ch)}
                              className="rounded-md px-2 py-1 text-xs text-slate-400 hover:bg-white/10 hover:text-slate-200"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => handleDelete(ch.id)}
                              className="rounded-md p-1 text-slate-400 hover:bg-rose-500/10 hover:text-rose-400"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>

                      {/* Rules panel */}
                      {expandedChannelId === ch.id && (
                        <tr>
                          <td colSpan={6} className="bg-slate-800/30 px-8 py-4">
                            <div className="space-y-4">
                              <div className="flex items-center justify-between">
                                <span className={sectionLabel}>Routing Rules</span>
                                <button
                                  onClick={handleSaveRules}
                                  className="rounded-md bg-cyan-500/20 border border-cyan-500/30 px-3 py-1 text-xs text-cyan-200 hover:bg-cyan-500/30"
                                >
                                  Save Rules
                                </button>
                              </div>

                              {Object.entries(EVENT_GROUPS).map(([group, events]) => (
                                <div key={group} className={infoPanel}>
                                  <div className={sectionLabel}>{group}</div>
                                  <div className="space-y-2 mt-2">
                                    {events.map((eventType) => {
                                      const rule = channelRules.find((r) => r.event_type === eventType);
                                      const isEnabled = rule?.enabled ?? false;

                                      return (
                                        <div key={eventType} className="flex items-center gap-3">
                                          <input
                                            type="checkbox"
                                            checked={isEnabled}
                                            onChange={() => handleRuleToggle(eventType)}
                                            className="rounded border-white/20 bg-slate-800 text-cyan-400 focus:ring-cyan-400/50"
                                          />
                                          <span className={`${monoXs} text-slate-300 flex-1`}>{eventType}</span>
                                          {isEnabled && (
                                            <select
                                              value={rule?.min_severity || 'info'}
                                              onChange={(e) => handleRuleSeverityChange(eventType, e.target.value)}
                                              className="rounded-md border border-white/10 bg-slate-800/60 px-2 py-1 text-xs text-slate-300"
                                            >
                                              <option value="info">info+</option>
                                              <option value="warning">warning+</option>
                                              <option value="error">error+</option>
                                              <option value="critical">critical</option>
                                            </select>
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              ))}
                            </div>
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
      </div>

      {/* Create/Edit Modal */}
      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editChannel ? 'Edit Channel' : 'Add Channel'} size="md">
        <div className="space-y-4">
          <div>
            <label className={`${sectionLabel} block mb-1`}>Name</label>
            <input value={formName} onChange={(e) => setFormName(e.target.value)} className={inputClass} placeholder="My Slack Channel" />
          </div>

          {!editChannel && (
            <div>
              <label className={`${sectionLabel} block mb-1`}>Type</label>
              <select value={formType} onChange={(e) => setFormType(e.target.value)} className={inputClass}>
                {CHANNEL_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          )}

          {/* Dynamic config form */}
          {(formType === 'slack' || formType === 'discord') && (
            <div>
              <label className={`${sectionLabel} block mb-1`}>Webhook URL</label>
              <input value={formWebhookUrl} onChange={(e) => setFormWebhookUrl(e.target.value)} className={inputClass} placeholder="https://hooks.slack.com/..." />
            </div>
          )}

          {formType === 'email' && (
            <div>
              <label className={`${sectionLabel} block mb-1`}>Recipients (comma-separated)</label>
              <input value={formRecipients} onChange={(e) => setFormRecipients(e.target.value)} className={inputClass} placeholder="admin@example.com, ops@example.com" />
            </div>
          )}

          {formType === 'webhook' && (
            <>
              <div>
                <label className={`${sectionLabel} block mb-1`}>URL</label>
                <input value={formCustomUrl} onChange={(e) => setFormCustomUrl(e.target.value)} className={inputClass} placeholder="https://api.example.com/webhook" />
              </div>
              <div>
                <label className={`${sectionLabel} block mb-1`}>Method</label>
                <select value={formCustomMethod} onChange={(e) => setFormCustomMethod(e.target.value)} className={inputClass}>
                  <option value="POST">POST</option>
                  <option value="PUT">PUT</option>
                </select>
              </div>
              <div>
                <label className={`${sectionLabel} block mb-1`}>Headers (JSON)</label>
                <input value={formCustomHeaders} onChange={(e) => setFormCustomHeaders(e.target.value)} className={inputClass} placeholder='{"Authorization": "Bearer ..."}' />
              </div>
            </>
          )}

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={formEnabled}
              onChange={(e) => setFormEnabled(e.target.checked)}
              className="rounded border-white/20 bg-slate-800 text-cyan-400"
            />
            <span className="text-sm text-slate-300">Enabled</span>
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-6">
          <button onClick={() => setShowModal(false)} className="rounded-lg border border-white/10 px-4 py-2 text-sm text-slate-400 hover:text-slate-200">
            Cancel
          </button>
          <button onClick={handleSave} className="rounded-lg bg-cyan-500/20 border border-cyan-500/30 px-4 py-2 text-sm font-medium text-cyan-200 hover:bg-cyan-500/30">
            {editChannel ? 'Update' : 'Create'}
          </button>
        </div>
      </Modal>
    </div>
  );
}
