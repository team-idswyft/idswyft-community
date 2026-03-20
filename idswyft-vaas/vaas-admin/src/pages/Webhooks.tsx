import React, { useState, useEffect } from 'react';
import {
  Plus,
  Edit,
  Trash2,
  Globe,
  Key,
  CheckCircle,
  XCircle,
  AlertTriangle,
  RefreshCw,
  Eye,
  EyeOff,
  Copy,
  Download,
  Search,
  Zap,
  Clock,
  ChevronDown,
  ChevronRight,
  Layers
} from 'lucide-react';
import { apiClient } from '../services/api';
import type { Webhook, WebhookDelivery, WebhookFormData } from '../types.js';
import Modal, { ConfirmationModal } from '../components/ui/Modal';
import { showToast } from '../lib/toast';
import { sectionLabel, statNumber, monoXs, monoSm, cardSurface, statusPill, tableHeaderClass, infoPanel, getStatusAccent } from '../styles/tokens';

const WEBHOOK_EVENTS = [
  { value: 'verification.started', label: 'Verification Started', description: 'When a new verification session begins' },
  { value: 'verification.completed', label: 'Verification Completed', description: 'When verification is completed (success or failure)' },
  { value: 'verification.failed', label: 'Verification Failed', description: 'When verification fails validation' },
  { value: 'verification.manual_review', label: 'Manual Review Required', description: 'When verification requires manual review' },
  { value: 'verification.approved', label: 'Verification Approved', description: 'When verification is approved by admin' },
  { value: 'verification.rejected', label: 'Verification Rejected', description: 'When verification is rejected by admin' },
  { value: 'verification.overridden', label: 'Verification Overridden', description: 'When verification result is manually overridden' },
  { value: 'verification.expired', label: 'Verification Expired', description: 'When verification session expires' },
  { value: 'user.created', label: 'User Created', description: 'When a new end user is created' },
  { value: 'user.updated', label: 'User Updated', description: 'When user information is updated' }
];

export default function Webhooks() {
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [filteredWebhooks, setFilteredWebhooks] = useState<Webhook[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showDeliveriesModal, setShowDeliveriesModal] = useState(false);
  const [showHealthModal, setShowHealthModal] = useState(false);
  const [selectedWebhook, setSelectedWebhook] = useState<Webhook | null>(null);
  const [deliveries, setDeliveries] = useState<WebhookDelivery[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'disabled' | 'failing'>('all');
  const [selectedWebhooks, setSelectedWebhooks] = useState<string[]>([]);
  const [confirmAction, setConfirmAction] = useState<{ message: string; onConfirm: () => void } | null>(null);

  useEffect(() => {
    loadWebhooks();
  }, []);

  useEffect(() => {
    filterWebhooks();
  }, [webhooks, searchTerm, statusFilter]);

  const filterWebhooks = () => {
    let filtered = webhooks;

    // Search filter
    if (searchTerm) {
      filtered = filtered.filter(webhook =>
        webhook.url.toLowerCase().includes(searchTerm.toLowerCase()) ||
        webhook.events.some(event => event.toLowerCase().includes(searchTerm.toLowerCase()))
      );
    }

    // Status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter(webhook => {
        switch (statusFilter) {
          case 'active':
            return webhook.enabled && webhook.failure_count === 0;
          case 'disabled':
            return !webhook.enabled;
          case 'failing':
            return webhook.enabled && webhook.failure_count > 0;
          default:
            return true;
        }
      });
    }

    setFilteredWebhooks(filtered);
  };

  const loadWebhooks = async () => {
    try {
      setLoading(true);
      const response = await apiClient.listWebhooks();
      setWebhooks(response);
    } catch (error) {
      console.error('Failed to load webhooks:', error);
    } finally {
      setLoading(false);
    }
  };

  const deleteWebhook = (webhookId: string) => {
    setConfirmAction({
      message: 'Are you sure you want to delete this webhook?',
      onConfirm: async () => {
        try {
          await apiClient.deleteWebhook(webhookId);
          setWebhooks(prev => prev.filter(w => w.id !== webhookId));
          showToast.success('Webhook deleted');
        } catch (error) {
          console.error('Failed to delete webhook:', error);
          showToast.error('Failed to delete webhook');
        }
      },
    });
  };

  const bulkToggleWebhooks = async (enabled: boolean) => {
    if (selectedWebhooks.length === 0) return;

    try {
      const promises = selectedWebhooks.map(webhookId =>
        apiClient.updateWebhook(webhookId, { enabled })
      );

      await Promise.all(promises);
      setWebhooks(prev =>
        prev.map(w =>
          selectedWebhooks.includes(w.id) ? { ...w, enabled } : w
        )
      );
      setSelectedWebhooks([]);
    } catch (error) {
      console.error('Failed to bulk toggle webhooks:', error);
    }
  };

  const bulkDeleteWebhooks = () => {
    if (selectedWebhooks.length === 0) return;

    setConfirmAction({
      message: `Are you sure you want to delete ${selectedWebhooks.length} webhook(s)?`,
      onConfirm: async () => {
        try {
          const promises = selectedWebhooks.map(webhookId =>
            apiClient.deleteWebhook(webhookId)
          );
          await Promise.all(promises);
          setWebhooks(prev => prev.filter(w => !selectedWebhooks.includes(w.id)));
          setSelectedWebhooks([]);
          showToast.success(`${selectedWebhooks.length} webhook(s) deleted`);
        } catch (error) {
          console.error('Failed to bulk delete webhooks:', error);
          showToast.error('Failed to delete some webhooks');
        }
      },
    });
  };

  const testAllWebhooks = async () => {
    if (filteredWebhooks.length === 0) return;

    try {
      const promises = filteredWebhooks
        .filter(w => w.enabled)
        .map(w => apiClient.testWebhook(w.id));

      await Promise.all(promises);
      showToast.success(`Test requests sent to ${promises.length} active webhook(s)`);
    } catch (error) {
      console.error('Failed to test webhooks:', error);
      showToast.error('Failed to send test requests to some webhooks');
    }
  };

  const exportWebhookConfig = () => {
    const exportData = webhooks.map(webhook => ({
      url: webhook.url,
      events: webhook.events,
      enabled: webhook.enabled,
      created_at: webhook.created_at,
      last_success_at: webhook.last_success_at,
      failure_count: webhook.failure_count
    }));

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `webhook-config-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const selectAllWebhooks = (checked: boolean) => {
    if (checked) {
      setSelectedWebhooks(filteredWebhooks.map(w => w.id));
    } else {
      setSelectedWebhooks([]);
    }
  };

  const toggleWebhookSelection = (webhookId: string) => {
    setSelectedWebhooks(prev =>
      prev.includes(webhookId)
        ? prev.filter(id => id !== webhookId)
        : [...prev, webhookId]
    );
  };

  const toggleWebhook = async (webhookId: string, enabled: boolean) => {
    try {
      await apiClient.updateWebhook(webhookId, { enabled });
      setWebhooks(prev =>
        prev.map(w =>
          w.id === webhookId ? { ...w, enabled } : w
        )
      );
    } catch (error) {
      console.error('Failed to toggle webhook:', error);
    }
  };

  const testWebhook = async (webhookId: string) => {
    try {
      await apiClient.testWebhook(webhookId);
      showToast.success('Test webhook sent successfully');
    } catch (error) {
      console.error('Failed to test webhook:', error);
      showToast.error('Failed to send test webhook');
    }
  };

  const viewDeliveries = async (webhook: Webhook) => {
    try {
      setSelectedWebhook(webhook);
      const response = await apiClient.getWebhookDeliveries(webhook.id);
      setDeliveries(response.deliveries);
      setShowDeliveriesModal(true);
    } catch (error) {
      console.error('Failed to load webhook deliveries:', error);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getWebhookHealthKey = (webhook: Webhook): string => {
    if (!webhook.enabled) return 'disabled';
    if (webhook.failure_count > 0) return 'degraded';
    return 'healthy';
  };

  const getWebhookHealthLabel = (webhook: Webhook): string => {
    if (!webhook.enabled) return 'Disabled';
    if (webhook.failure_count > 0) return `${webhook.failure_count} failures`;
    return 'Healthy';
  };

  const webhookStats = {
    total: webhooks.length,
    active: webhooks.filter(w => w.enabled && w.failure_count === 0).length,
    disabled: webhooks.filter(w => !w.enabled).length,
    failing: webhooks.filter(w => w.enabled && w.failure_count > 0).length,
  };

  return (
    <div className="p-6 space-y-8">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:justify-between lg:items-start space-y-4 lg:space-y-0">
        <div>
          <p className={sectionLabel}>Webhook Management</p>
          <p className="text-slate-400 text-sm mt-1">Monitor and manage webhook endpoints for real-time event notifications</p>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center space-y-2 sm:space-y-0 sm:space-x-3">
          <button
            onClick={exportWebhookConfig}
            className="border border-white/10 rounded-lg font-mono text-sm px-3 py-2 text-slate-300 hover:bg-slate-800/40 transition-colors inline-flex items-center"
            disabled={webhooks.length === 0}
          >
            <Download className="w-4 h-4 mr-2" />
            Export Config
          </button>

          <button
            onClick={() => setShowHealthModal(true)}
            className="border border-white/10 rounded-lg font-mono text-sm px-3 py-2 text-slate-300 hover:bg-slate-800/40 transition-colors inline-flex items-center"
            disabled={webhooks.length === 0}
          >
            Health Check
          </button>

          <button
            onClick={testAllWebhooks}
            className="border border-white/10 rounded-lg font-mono text-sm px-3 py-2 text-slate-300 hover:bg-slate-800/40 transition-colors inline-flex items-center"
            disabled={filteredWebhooks.filter(w => w.enabled).length === 0}
          >
            <Zap className="w-4 h-4 mr-2" />
            Test All
          </button>

          <button
            onClick={() => setShowCreateModal(true)}
            className="bg-cyan-500/20 border border-cyan-400/40 text-cyan-200 hover:bg-cyan-500/30 rounded-lg font-mono text-sm px-3 py-2 inline-flex items-center transition-colors"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Webhook
          </button>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className={`${cardSurface} border-l-[3px] border-l-cyan-400 p-5`}>
          <p className={sectionLabel}>Total Webhooks</p>
          <p className={statNumber}>{webhookStats.total}</p>
        </div>
        <div className={`${cardSurface} border-l-[3px] border-l-emerald-400 p-5`}>
          <p className={sectionLabel}>Active</p>
          <p className={statNumber}>{webhookStats.active}</p>
        </div>
        <div className={`${cardSurface} border-l-[3px] border-l-amber-400 p-5`}>
          <p className={sectionLabel}>Failing</p>
          <p className={statNumber}>{webhookStats.failing}</p>
        </div>
        <div className={`${cardSurface} border-l-[3px] border-l-slate-400 p-5`}>
          <p className={sectionLabel}>Disabled</p>
          <p className={statNumber}>{webhookStats.disabled}</p>
        </div>
      </div>

      {/* Filters and Search */}
      <div className={cardSurface}>
        <div className="p-4 border-b border-white/10">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-4 sm:space-y-0">
            <div className="flex flex-col sm:flex-row sm:items-center space-y-4 sm:space-y-0 sm:space-x-4">
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-500 w-4 h-4" />
                <input
                  type="text"
                  placeholder="Search webhooks..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 pr-4 py-2 border border-white/10 rounded-md focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 w-full sm:w-64 bg-slate-800/50 text-slate-100 placeholder-slate-500"
                />
              </div>

              {/* Status Filter */}
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as any)}
                className="px-3 py-2 border border-white/10 rounded-md focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 bg-slate-800/50 text-slate-100"
              >
                <option value="all">All Status</option>
                <option value="active">Active</option>
                <option value="failing">Failing</option>
                <option value="disabled">Disabled</option>
              </select>

              <div className={`${monoXs} text-slate-500`}>
                Showing {filteredWebhooks.length} of {webhooks.length} webhooks
              </div>
            </div>

            {/* Bulk Actions */}
            {selectedWebhooks.length > 0 && (
              <div className="flex items-center space-x-2">
                <span className={`${monoXs} text-slate-400`}>
                  {selectedWebhooks.length} selected
                </span>

                <button
                  onClick={() => bulkToggleWebhooks(true)}
                  className="border border-white/10 rounded-lg font-mono text-sm px-3 py-1 text-emerald-300 hover:bg-slate-800/40 transition-colors"
                >
                  Enable
                </button>

                <button
                  onClick={() => bulkToggleWebhooks(false)}
                  className="border border-white/10 rounded-lg font-mono text-sm px-3 py-1 text-amber-300 hover:bg-slate-800/40 transition-colors"
                >
                  Disable
                </button>

                <button
                  onClick={bulkDeleteWebhooks}
                  className="border border-white/10 rounded-lg font-mono text-sm px-3 py-1 text-rose-300 hover:bg-slate-800/40 transition-colors"
                >
                  Delete
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Webhook List */}
      <div className={cardSurface}>
        {loading ? (
          <div className="p-6 space-y-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className={`${cardSurface} animate-pulse p-5`}>
                <div className="flex items-center space-x-4">
                  <div className="h-4 w-48 bg-slate-700/50 rounded"></div>
                  <div className="h-4 w-24 bg-slate-700/50 rounded"></div>
                  <div className="h-4 w-16 bg-slate-700/50 rounded"></div>
                </div>
                <div className="mt-3 h-3 w-32 bg-slate-700/50 rounded"></div>
              </div>
            ))}
          </div>
        ) : filteredWebhooks.length === 0 ? (
          <div className="text-center py-12">
            <Globe className="w-12 h-12 text-slate-500 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-slate-100 mb-2">No webhooks configured</h3>
            <p className="text-slate-400 mb-4">
              Set up webhook endpoints to receive real-time notifications about verification events
            </p>
            <button
              onClick={() => setShowCreateModal(true)}
              className="bg-cyan-500/20 border border-cyan-400/40 text-cyan-200 hover:bg-cyan-500/30 rounded-lg font-mono text-sm px-4 py-2 inline-flex items-center transition-colors"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Your First Webhook
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-white/10">
              <thead>
                <tr>
                  <th className={tableHeaderClass}>
                    <input
                      type="checkbox"
                      checked={selectedWebhooks.length === filteredWebhooks.length && filteredWebhooks.length > 0}
                      onChange={(e) => selectAllWebhooks(e.target.checked)}
                      className="h-4 w-4 text-cyan-300 focus:ring-cyan-500 border-white/10 rounded"
                    />
                  </th>
                  <th className={tableHeaderClass}>Webhook URL</th>
                  <th className={tableHeaderClass}>Events</th>
                  <th className={tableHeaderClass}>Status & Health</th>
                  <th className={tableHeaderClass}>Last Activity</th>
                  <th className={tableHeaderClass}>Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {filteredWebhooks.map((webhook) => (
                  <tr key={webhook.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="px-5 py-4 whitespace-nowrap">
                      <input
                        type="checkbox"
                        checked={selectedWebhooks.includes(webhook.id)}
                        onChange={() => toggleWebhookSelection(webhook.id)}
                        className="h-4 w-4 text-cyan-300 focus:ring-cyan-500 border-white/10 rounded"
                      />
                    </td>
                    <td className="px-5 py-4 whitespace-nowrap">
                      <div>
                        <div className={`${monoSm} text-slate-100`}>
                          {webhook.url}
                        </div>
                        <div className={`${monoXs} text-slate-500 mt-0.5`}>
                          ID: {webhook.id.substring(0, 8)}...
                        </div>
                        <span className={`${monoXs} text-slate-500`}>
                          {webhook.max_retries ?? 3} retries · {webhook.retry_backoff_minutes ?? 5} min backoff
                        </span>
                      </div>
                    </td>
                    <td className="px-5 py-4 whitespace-nowrap">
                      <div className={`${monoSm} text-slate-100`}>
                        {webhook.events.length} event{webhook.events.length !== 1 ? 's' : ''}
                      </div>
                      <div className={`${monoXs} text-slate-500 mt-0.5`}>
                        {webhook.events.slice(0, 2).join(', ')}
                        {webhook.events.length > 2 && ` +${webhook.events.length - 2} more`}
                      </div>
                    </td>
                    <td className="px-5 py-4 whitespace-nowrap">
                      <div className="flex flex-col space-y-1">
                        <span className={`${statusPill} ${getStatusAccent(getWebhookHealthKey(webhook)).pill}`}>
                          {getWebhookHealthLabel(webhook)}
                        </span>
                        {webhook.enabled && (
                          <div className={`${monoXs} text-slate-500`}>
                            {webhook.last_success_at
                              ? `Last success: ${formatDate(webhook.last_success_at).split(',')[0]}`
                              : 'Never delivered'
                            }
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-4 whitespace-nowrap">
                      {webhook.last_success_at ? (
                        <div>
                          <div className={`${monoXs} text-slate-400`}>Success: {formatDate(webhook.last_success_at)}</div>
                          {webhook.last_failure_at && (
                            <div className={`${monoXs} text-rose-400`}>
                              Failure: {formatDate(webhook.last_failure_at)}
                            </div>
                          )}
                        </div>
                      ) : webhook.last_failure_at ? (
                        <div className={`${monoXs} text-rose-400`}>
                          Failure: {formatDate(webhook.last_failure_at)}
                        </div>
                      ) : (
                        <span className={`${monoXs} text-slate-500`}>No deliveries</span>
                      )}
                    </td>
                    <td className="px-5 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => viewDeliveries(webhook)}
                          className="text-slate-400 hover:text-cyan-300 transition-colors"
                          title="View deliveries"
                        >
                          <Eye className="w-4 h-4" />
                        </button>

                        <button
                          onClick={() => testWebhook(webhook.id)}
                          className="text-slate-400 hover:text-cyan-300 transition-colors"
                          title="Send test"
                        >
                          <RefreshCw className="w-4 h-4" />
                        </button>

                        <button
                          onClick={() => toggleWebhook(webhook.id, !webhook.enabled)}
                          className={webhook.enabled ? "text-slate-400 hover:text-amber-300 transition-colors" : "text-slate-400 hover:text-emerald-300 transition-colors"}
                          title={webhook.enabled ? "Disable" : "Enable"}
                        >
                          {webhook.enabled ? <XCircle className="w-4 h-4" /> : <CheckCircle className="w-4 h-4" />}
                        </button>

                        <button
                          onClick={() => {
                            setSelectedWebhook(webhook);
                            setShowCreateModal(true);
                          }}
                          className="text-slate-400 hover:text-slate-100 transition-colors"
                          title="Edit"
                        >
                          <Edit className="w-4 h-4" />
                        </button>

                        <button
                          onClick={() => deleteWebhook(webhook.id)}
                          className="text-slate-400 hover:text-rose-300 transition-colors"
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create/Edit Webhook Modal */}
      {showCreateModal && (
        <WebhookFormModal
          webhook={selectedWebhook}
          onClose={() => {
            setShowCreateModal(false);
            setSelectedWebhook(null);
          }}
          onSuccess={(webhook) => {
            if (selectedWebhook) {
              setWebhooks(prev => prev.map(w => w.id === webhook.id ? webhook : w));
            } else {
              setWebhooks(prev => [webhook, ...prev]);
            }
            setShowCreateModal(false);
            setSelectedWebhook(null);
          }}
        />
      )}

      {/* Webhook Deliveries Modal */}
      {showDeliveriesModal && selectedWebhook && (
        <WebhookDeliveriesModal
          webhook={selectedWebhook}
          deliveries={deliveries}
          onClose={() => {
            setShowDeliveriesModal(false);
            setSelectedWebhook(null);
            setDeliveries([]);
          }}
        />
      )}

      {/* Webhook Health Modal */}
      {showHealthModal && (
        <WebhookHealthModal
          webhooks={webhooks}
          onClose={() => setShowHealthModal(false)}
        />
      )}

      {/* Confirmation Modal */}
      <ConfirmationModal
        isOpen={!!confirmAction}
        onClose={() => setConfirmAction(null)}
        onConfirm={() => { confirmAction?.onConfirm(); }}
        title="Confirm Action"
        message={confirmAction?.message || ''}
        confirmText="Delete"
        confirmVariant="danger"
      />
    </div>
  );
}

interface WebhookFormModalProps {
  webhook: Webhook | null;
  onClose: () => void;
  onSuccess: (webhook: Webhook) => void;
}

function WebhookFormModal({ webhook, onClose, onSuccess }: WebhookFormModalProps) {
  const [formData, setFormData] = useState<WebhookFormData>({
    url: webhook?.url || '',
    events: webhook?.events || [],
    secret_key: webhook?.secret_key || '',
    max_retries: webhook?.max_retries ?? 3,
    retry_backoff_minutes: webhook?.retry_backoff_minutes ?? 5
  });
  const [loading, setLoading] = useState(false);
  const [showSecretKey, setShowSecretKey] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [webhookSecret, setWebhookSecret] = useState<string | null>(null);

  useEffect(() => {
    if (webhook?.id) {
      apiClient.getWebhookSecret(webhook.id)
        .then(setWebhookSecret)
        .catch(() => setWebhookSecret(null));
    } else {
      setWebhookSecret(null);
    }
  }, [webhook?.id]);

  const generateSecretKey = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    const result = Array.from(bytes).map((b) => chars[b % chars.length]).join('');
    setFormData(prev => ({ ...prev, secret_key: result }));
  };

  const copySecretKey = async () => {
    try {
      await navigator.clipboard.writeText(formData.secret_key);
      showToast.success('Secret key copied to clipboard');
    } catch (error) {
      console.error('Failed to copy secret key:', error);
    }
  };

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.url.trim()) {
      newErrors.url = 'Webhook URL is required';
    } else if (!/^https?:\/\/.+/.test(formData.url.trim())) {
      newErrors.url = 'Please enter a valid HTTP or HTTPS URL';
    }

    if (formData.events.length === 0) {
      newErrors.events = 'Select at least one event to listen for';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    try {
      setLoading(true);

      const payload = {
        ...formData,
        secret_key: formData.secret_key || undefined
      };

      let response;
      if (webhook) {
        response = await apiClient.patch(`/webhooks/${webhook.id}`, payload);
      } else {
        response = await apiClient.post('/webhooks', payload);
      }

      onSuccess(response.data.webhook);
    } catch (error: any) {
      console.error('Failed to save webhook:', error);
      if (error.response?.data?.error?.details) {
        setErrors(error.response.data.error.details);
      }
    } finally {
      setLoading(false);
    }
  };

  const toggleEvent = (eventValue: string) => {
    setFormData(prev => ({
      ...prev,
      events: prev.events.includes(eventValue)
        ? prev.events.filter(e => e !== eventValue)
        : [...prev.events, eventValue]
    }));
  };

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title={webhook ? 'Edit Webhook' : 'Add New Webhook'}
      size="lg"
      closeOnOverlayClick={false}
    >
      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <p className={sectionLabel}>Webhook URL *</p>
          <div className="relative mt-2">
            <Globe className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-500 w-4 h-4" />
            <input
              type="url"
              className={`form-input pl-10 ${errors.url ? '!border-rose-500 focus:!ring-rose-500/20' : ''}`}
              placeholder="https://your-domain.com/webhooks"
              value={formData.url}
              onChange={(e) => {
                setFormData(prev => ({ ...prev, url: e.target.value }));
                if (errors.url) setErrors(prev => ({ ...prev, url: '' }));
              }}
            />
          </div>
          {errors.url && <p className="mt-1 text-sm text-rose-400">{errors.url}</p>}
          <p className={`mt-1 ${monoXs} text-slate-500`}>
            HTTPS URLs are recommended for security
          </p>
        </div>

        <div>
          <p className={sectionLabel}>Secret Key (Optional)</p>
          <div className="relative mt-2">
            <Key className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-500 w-4 h-4" />
            <input
              type={showSecretKey ? 'text' : 'password'}
              className="form-input pl-10 pr-20"
              placeholder="Optional secret key for signing webhooks"
              value={formData.secret_key}
              onChange={(e) => setFormData(prev => ({ ...prev, secret_key: e.target.value }))}
            />
            <div className="absolute right-3 top-1/2 transform -translate-y-1/2 flex items-center space-x-1">
              <button
                type="button"
                onClick={() => setShowSecretKey(!showSecretKey)}
                className="text-slate-500 hover:text-slate-400 transition-colors"
              >
                {showSecretKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
              {formData.secret_key && (
                <button
                  type="button"
                  onClick={copySecretKey}
                  className="text-slate-500 hover:text-slate-400 transition-colors"
                  title="Copy secret key"
                >
                  <Copy className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
          <div className="flex justify-between items-center mt-1">
            <p className={`${monoXs} text-slate-500`}>
              {webhook?.id
                ? 'Leave blank to keep the existing secret. Enter a new value to rotate it.'
                : 'Used to verify webhook authenticity (HMAC-SHA256)'}
            </p>
            <button
              type="button"
              onClick={generateSecretKey}
              className="text-sm text-cyan-300 hover:text-cyan-200 transition-colors"
            >
              Generate Random Key
            </button>
          </div>
        </div>

        <div>
          <p className={sectionLabel}>Events to Listen For *</p>
          {errors.events && <p className="mb-2 text-sm text-rose-400">{errors.events}</p>}
          <div className="space-y-2 max-h-48 overflow-y-auto border border-white/10 rounded-lg p-3 mt-2">
            {WEBHOOK_EVENTS.map((event) => (
              <div key={event.value} className="flex items-start">
                <input
                  type="checkbox"
                  id={event.value}
                  checked={formData.events.includes(event.value)}
                  onChange={() => toggleEvent(event.value)}
                  className="mt-1 h-4 w-4 text-cyan-300 focus:ring-cyan-500 border-white/10 rounded"
                />
                <label htmlFor={event.value} className="ml-3 text-sm cursor-pointer">
                  <div className="font-medium text-slate-100">{event.label}</div>
                  <div className={`${monoXs} text-slate-500`}>{event.description}</div>
                </label>
              </div>
            ))}
          </div>
        </div>

        {webhookSecret && formData.url.startsWith('https://') && (
          <div>
            <p className={sectionLabel}>Signing Secret</p>
            <div className="flex items-center gap-2 mt-2">
              <input
                type="text"
                readOnly
                value={webhookSecret}
                className={`flex-1 ${monoXs} border border-white/10 rounded-lg px-3 py-2 bg-slate-800/50 text-slate-100`}
              />
              <button
                type="button"
                onClick={() => navigator.clipboard.writeText(webhookSecret)}
                className="border border-white/10 rounded-lg font-mono text-sm px-3 py-2 text-slate-300 hover:bg-slate-800/40 transition-colors"
              >
                Copy
              </button>
            </div>
            <p className={`${monoXs} text-slate-500 mt-1`}>
              Compute <code>HMAC-SHA256(secret, rawBody)</code> and compare to the{' '}
              <code>X-Webhook-Signature</code> header to verify payloads.
            </p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className={sectionLabel}>Max Retries</p>
            <input
              type="number"
              min={0}
              max={10}
              value={formData.max_retries ?? 3}
              onChange={(e) => {
                const v = parseInt(e.target.value, 10);
                if (!isNaN(v)) setFormData((f) => ({ ...f, max_retries: v }));
              }}
              className="form-input mt-2"
            />
          </div>
          <div>
            <p className={sectionLabel}>Retry Backoff (minutes)</p>
            <input
              type="number"
              min={1}
              max={60}
              value={formData.retry_backoff_minutes ?? 5}
              onChange={(e) => {
                const v = parseInt(e.target.value, 10);
                if (!isNaN(v)) setFormData((f) => ({ ...f, retry_backoff_minutes: v }));
              }}
              className="form-input mt-2"
            />
          </div>
        </div>

        <div className="flex justify-end space-x-4 pt-4 border-t border-white/10">
          <button
            type="button"
            onClick={onClose}
            className="border border-white/10 rounded-lg font-mono text-sm px-4 py-2 text-slate-300 hover:bg-slate-800/40 transition-colors"
            disabled={loading}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="bg-cyan-500/20 border border-cyan-400/40 text-cyan-200 hover:bg-cyan-500/30 rounded-lg font-mono text-sm px-4 py-2 transition-colors"
            disabled={loading}
          >
            {loading ? (
              <div className="flex items-center">
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
                Saving...
              </div>
            ) : (
              webhook ? 'Update Webhook' : 'Create Webhook'
            )}
          </button>
        </div>
      </form>
    </Modal>
  );
}

interface WebhookDeliveriesModalProps {
  webhook: Webhook;
  deliveries: WebhookDelivery[];
  onClose: () => void;
}

function getVaasSessionId(delivery: WebhookDelivery): string | null {
  return delivery.event_data?.data?.object?.verification_session?.id ?? null;
}

function getLifecycleStatus(deliveries: WebhookDelivery[]): { label: string; accentKey: string } {
  const types = deliveries.map(d => d.event_type);
  if (types.some(t => t.includes('approved') || t.includes('verified')))
    return { label: 'Approved', accentKey: 'success' };
  if (types.some(t => t.includes('rejected') || t.includes('failed')))
    return { label: 'Failed', accentKey: 'failed' };
  if (types.some(t => t.includes('manual_review')))
    return { label: 'Review', accentKey: 'pending' };
  if (types.some(t => t.includes('completed')))
    return { label: 'Completed', accentKey: 'success' };
  if (types.some(t => t.includes('overridden')))
    return { label: 'Overridden', accentKey: 'pending' };
  if (types.some(t => t.includes('expired')))
    return { label: 'Expired', accentKey: 'failed' };
  return { label: 'In Progress', accentKey: 'default' };
}

function groupDeliveriesBySession(deliveries: WebhookDelivery[]): { groupId: string; label: string; deliveries: WebhookDelivery[] }[] {
  const map = new Map<string, WebhookDelivery[]>();
  for (const d of deliveries) {
    const sid = getVaasSessionId(d) ?? '__other__';
    if (!map.has(sid)) map.set(sid, []);
    map.get(sid)!.push(d);
  }
  // Sort deliveries within each group ascending by created_at (lifecycle order)
  for (const [, group] of map) {
    group.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  }
  // Build result array, sorted by earliest delivery descending (most recent verification first)
  const result: { groupId: string; label: string; deliveries: WebhookDelivery[] }[] = [];
  for (const [sid, group] of map) {
    if (sid === '__other__') continue;
    result.push({ groupId: sid, label: sid.substring(0, 8) + '...', deliveries: group });
  }
  result.sort((a, b) => new Date(b.deliveries[0].created_at).getTime() - new Date(a.deliveries[0].created_at).getTime());
  // Append "Other Events" at the end
  const other = map.get('__other__');
  if (other) {
    result.push({ groupId: '__other__', label: 'Other Events', deliveries: other });
  }
  return result;
}

function WebhookDeliveriesModal({ webhook, deliveries, onClose }: WebhookDeliveriesModalProps) {
  const [viewMode, setViewMode] = useState<'chronological' | 'grouped'>('grouped');
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => {
    // Default expand first 3 groups
    const groups = groupDeliveriesBySession(deliveries);
    return new Set(groups.slice(0, 3).map(g => g.groupId));
  });

  const getDeliveryStatusKey = (status: string): string => {
    switch (status) {
      case 'delivered': return 'success';
      case 'failed': return 'failed';
      case 'retrying': return 'pending';
      default: return 'default';
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  const toggleGroup = (groupId: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      next.has(groupId) ? next.delete(groupId) : next.add(groupId);
      return next;
    });
  };

  const groups = groupDeliveriesBySession(deliveries);

  const renderDeliveryRow = (delivery: WebhookDelivery) => (
    <tr key={delivery.id} className="hover:bg-slate-800/40 transition-colors">
      <td className="px-5 py-4 whitespace-nowrap">
        <div className={`${monoSm} text-slate-100`}>
          {delivery.event_type}
        </div>
        <div className={`${monoXs} text-slate-500 mt-0.5`}>
          ID: {delivery.id.substring(0, 8)}...
        </div>
      </td>
      <td className="px-5 py-4 whitespace-nowrap">
        <span className={`${statusPill} ${getStatusAccent(getDeliveryStatusKey(delivery.status)).pill}`}>
          {delivery.status}
        </span>
      </td>
      <td className="px-5 py-4 whitespace-nowrap">
        <div className={monoSm}>
          {delivery.http_status_code ? (
            <span className={
              delivery.http_status_code < 300
                ? 'text-emerald-300'
                : 'text-rose-300'
            }>
              {delivery.http_status_code}
            </span>
          ) : (
            <span className="text-slate-500">N/A</span>
          )}
        </div>
        {delivery.error_message && (
          <div className={`${monoXs} text-rose-400 truncate max-w-xs mt-0.5`}>
            {delivery.error_message}
          </div>
        )}
      </td>
      <td className="px-5 py-4 whitespace-nowrap">
        <span className={`${monoSm} text-slate-100`}>
          {delivery.attempts}/{delivery.max_retries}
        </span>
        {delivery.next_retry_at && (
          <div className={`${monoXs} text-slate-500 mt-0.5`}>
            Next: {formatDate(delivery.next_retry_at)}
          </div>
        )}
      </td>
      <td className="px-5 py-4 whitespace-nowrap">
        <div className={`${monoXs} text-slate-400`}>{formatDate(delivery.created_at)}</div>
        {delivery.delivered_at && (
          <div className={`${monoXs} text-emerald-400 mt-0.5`}>
            Delivered: {formatDate(delivery.delivered_at)}
          </div>
        )}
      </td>
    </tr>
  );

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title="Webhook Deliveries"
      size="2xl"
    >
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className={infoPanel + ' flex-1'}>
            <p className={sectionLabel}>Endpoint</p>
            <p className={`${monoSm} text-slate-100`}>{webhook.url}</p>
          </div>

          {/* View toggle */}
          <div className="flex items-center ml-4 rounded-lg border border-white/10 overflow-hidden flex-shrink-0">
            <button
              onClick={() => setViewMode('chronological')}
              className={`${monoXs} px-3 py-1.5 transition-colors ${
                viewMode === 'chronological'
                  ? 'bg-cyan-500/20 text-cyan-200'
                  : 'text-slate-400 hover:bg-slate-800/40'
              }`}
            >
              <Clock className="w-3 h-3 inline mr-1" />
              Chronological
            </button>
            <button
              onClick={() => setViewMode('grouped')}
              className={`${monoXs} px-3 py-1.5 transition-colors border-l border-white/10 ${
                viewMode === 'grouped'
                  ? 'bg-cyan-500/20 text-cyan-200'
                  : 'text-slate-400 hover:bg-slate-800/40'
              }`}
            >
              <Layers className="w-3 h-3 inline mr-1" />
              By Verification
            </button>
          </div>
        </div>

        {deliveries.length === 0 ? (
          <div className="px-5 py-8 text-center text-slate-500">
            No deliveries found for this webhook
          </div>
        ) : viewMode === 'chronological' ? (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-white/10">
              <thead>
                <tr>
                  <th className={tableHeaderClass}>Event</th>
                  <th className={tableHeaderClass}>Status</th>
                  <th className={tableHeaderClass}>Response</th>
                  <th className={tableHeaderClass}>Attempts</th>
                  <th className={tableHeaderClass}>Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {deliveries.map(renderDeliveryRow)}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="space-y-3">
            {groups.map(group => {
              const isExpanded = expandedGroups.has(group.groupId);
              const lifecycle = getLifecycleStatus(group.deliveries);
              const firstDate = formatDate(group.deliveries[0].created_at);
              const lastDate = group.deliveries.length > 1
                ? formatDate(group.deliveries[group.deliveries.length - 1].created_at)
                : null;

              return (
                <div key={group.groupId} className={cardSurface}>
                  <button
                    onClick={() => toggleGroup(group.groupId)}
                    className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-800/40 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      {isExpanded
                        ? <ChevronDown className="w-4 h-4 text-slate-400" />
                        : <ChevronRight className="w-4 h-4 text-slate-400" />
                      }
                      <span className={`${monoSm} text-slate-100`}>{group.label}</span>
                      <span className={`${monoXs} px-2 py-0.5 rounded-full bg-slate-700/50 text-slate-300`}>
                        {group.deliveries.length} event{group.deliveries.length !== 1 ? 's' : ''}
                      </span>
                      <span className={`${statusPill} ${getStatusAccent(lifecycle.accentKey).pill}`}>
                        {lifecycle.label}
                      </span>
                    </div>
                    <div className={`${monoXs} text-slate-500`}>
                      {firstDate}{lastDate ? ` → ${lastDate}` : ''}
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="border-t border-white/10 overflow-x-auto">
                      <table className="min-w-full divide-y divide-white/10">
                        <thead>
                          <tr>
                            <th className={tableHeaderClass}>Event</th>
                            <th className={tableHeaderClass}>Status</th>
                            <th className={tableHeaderClass}>Response</th>
                            <th className={tableHeaderClass}>Attempts</th>
                            <th className={tableHeaderClass}>Timestamp</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/10">
                          {group.deliveries.map(renderDeliveryRow)}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div className="flex justify-end pt-4 border-t border-white/10">
          <button
            onClick={onClose}
            className="border border-white/10 rounded-lg font-mono text-sm px-4 py-2 text-slate-300 hover:bg-slate-800/40 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </Modal>
  );
}

interface WebhookHealthModalProps {
  webhooks: Webhook[];
  onClose: () => void;
}

function WebhookHealthModal({ webhooks, onClose }: WebhookHealthModalProps) {
  const healthStats = {
    total: webhooks.length,
    healthy: webhooks.filter(w => w.enabled && w.failure_count === 0).length,
    failing: webhooks.filter(w => w.enabled && w.failure_count > 0).length,
    disabled: webhooks.filter(w => !w.enabled).length,
    totalFailures: webhooks.reduce((sum, w) => sum + w.failure_count, 0),
    recentActivity: webhooks.filter(w => w.last_success_at || w.last_failure_at).length
  };

  const criticalWebhooks = webhooks.filter(w => w.enabled && w.failure_count > 5);
  const staleWebhooks = webhooks.filter(w => {
    if (!w.last_success_at && !w.last_failure_at) return true;
    const lastActivity = new Date(Math.max(
      new Date(w.last_success_at || 0).getTime(),
      new Date(w.last_failure_at || 0).getTime()
    ));
    const daysSinceActivity = (Date.now() - lastActivity.getTime()) / (1000 * 60 * 60 * 24);
    return daysSinceActivity > 7;
  });

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title="Webhook Health Dashboard"
      size="xl"
    >
      <div className="space-y-6">
        {/* Health Overview Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className={`${cardSurface} border-l-[3px] border-l-cyan-400 p-5`}>
            <p className={sectionLabel}>Total Webhooks</p>
            <p className={statNumber}>{healthStats.total}</p>
          </div>

          <div className={`${cardSurface} border-l-[3px] border-l-emerald-400 p-5`}>
            <p className={sectionLabel}>Healthy</p>
            <p className={statNumber}>{healthStats.healthy}</p>
          </div>

          <div className={`${cardSurface} border-l-[3px] border-l-amber-400 p-5`}>
            <p className={sectionLabel}>Failing</p>
            <p className={statNumber}>{healthStats.failing}</p>
          </div>

          <div className={`${cardSurface} border-l-[3px] border-l-slate-400 p-5`}>
            <p className={sectionLabel}>Disabled</p>
            <p className={statNumber}>{healthStats.disabled}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Critical Issues */}
          <div className={cardSurface}>
            <div className="p-4 border-b border-white/10">
              <p className={sectionLabel}>Critical Issues</p>
            </div>
            <div className="p-4">
              {criticalWebhooks.length === 0 ? (
                <div className="text-center py-4">
                  <CheckCircle className="h-8 w-8 text-emerald-400 mx-auto mb-2" />
                  <p className="text-sm text-slate-400">No critical issues found</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {criticalWebhooks.map(webhook => (
                    <div key={webhook.id} className={`${infoPanel} !p-3 border border-rose-500/20`}>
                      <div className="flex items-center justify-between">
                        <div>
                          <p className={`${monoSm} text-slate-100`}>{webhook.url}</p>
                          <p className={`${monoXs} text-rose-400`}>{webhook.failure_count} consecutive failures</p>
                        </div>
                        <AlertTriangle className="h-4 w-4 text-rose-400 flex-shrink-0" />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Stale Webhooks */}
          <div className={cardSurface}>
            <div className="p-4 border-b border-white/10">
              <p className={sectionLabel}>Stale Webhooks</p>
            </div>
            <div className="p-4">
              {staleWebhooks.length === 0 ? (
                <div className="text-center py-4">
                  <CheckCircle className="h-8 w-8 text-emerald-400 mx-auto mb-2" />
                  <p className="text-sm text-slate-400">All webhooks have recent activity</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {staleWebhooks.slice(0, 5).map(webhook => (
                    <div key={webhook.id} className={`${infoPanel} !p-3 border border-amber-500/20`}>
                      <div className="flex items-center justify-between">
                        <div>
                          <p className={`${monoSm} text-slate-100`}>{webhook.url}</p>
                          <p className={`${monoXs} text-amber-400`}>
                            {!webhook.last_success_at && !webhook.last_failure_at
                              ? 'Never received events'
                              : 'No activity in 7+ days'
                            }
                          </p>
                        </div>
                        <Clock className="h-4 w-4 text-amber-400 flex-shrink-0" />
                      </div>
                    </div>
                  ))}
                  {staleWebhooks.length > 5 && (
                    <p className={`${monoXs} text-slate-500 text-center`}>
                      +{staleWebhooks.length - 5} more stale webhooks
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Health Recommendations */}
        <div className={infoPanel}>
          <p className={sectionLabel}>Health Recommendations</p>
          <ul className={`${monoXs} text-slate-300 space-y-1`}>
            {criticalWebhooks.length > 0 && (
              <li>Review and fix {criticalWebhooks.length} webhook(s) with high failure rates</li>
            )}
            {staleWebhooks.length > 0 && (
              <li>Consider removing or updating {staleWebhooks.length} inactive webhook(s)</li>
            )}
            {healthStats.disabled > 0 && (
              <li>Review {healthStats.disabled} disabled webhook(s) - enable if still needed</li>
            )}
            {criticalWebhooks.length === 0 && staleWebhooks.length === 0 && healthStats.disabled === 0 && (
              <li>All webhooks are healthy and active</li>
            )}
          </ul>
        </div>

        <div className="flex justify-end pt-4 border-t border-white/10">
          <button
            onClick={onClose}
            className="bg-cyan-500/20 border border-cyan-400/40 text-cyan-200 hover:bg-cyan-500/30 rounded-lg font-mono text-sm px-4 py-2 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </Modal>
  );
}
