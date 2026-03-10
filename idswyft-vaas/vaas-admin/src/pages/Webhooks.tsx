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
  ExternalLink,
  Download,
  Settings,
  Activity,
  Clock,
  Filter,
  Search,
  MoreHorizontal,
  Zap,
  Shield,
  Code,
  History
} from 'lucide-react';
import { apiClient } from '../services/api';
import type { Webhook, WebhookDelivery, WebhookFormData } from '../types.js';

const WEBHOOK_EVENTS = [
  { value: 'verification.started', label: 'Verification Started', description: 'When a new verification session begins' },
  { value: 'verification.completed', label: 'Verification Completed', description: 'When verification is completed (success or failure)' },
  { value: 'verification.verified', label: 'Verification Verified', description: 'When verification is successfully verified' },
  { value: 'verification.failed', label: 'Verification Failed', description: 'When verification fails validation' },
  { value: 'verification.manual_review', label: 'Manual Review Required', description: 'When verification requires manual review' },
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

  const deleteWebhook = async (webhookId: string) => {
    if (!confirm('Are you sure you want to delete this webhook?')) {
      return;
    }

    try {
      await apiClient.deleteWebhook(webhookId);
      setWebhooks(prev => prev.filter(w => w.id !== webhookId));
    } catch (error) {
      console.error('Failed to delete webhook:', error);
    }
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

  const bulkDeleteWebhooks = async () => {
    if (selectedWebhooks.length === 0) return;
    
    if (!confirm(`Are you sure you want to delete ${selectedWebhooks.length} webhook(s)?`)) {
      return;
    }

    try {
      const promises = selectedWebhooks.map(webhookId =>
        apiClient.deleteWebhook(webhookId)
      );
      
      await Promise.all(promises);
      setWebhooks(prev => prev.filter(w => !selectedWebhooks.includes(w.id)));
      setSelectedWebhooks([]);
    } catch (error) {
      console.error('Failed to bulk delete webhooks:', error);
    }
  };

  const testAllWebhooks = async () => {
    if (filteredWebhooks.length === 0) return;
    
    try {
      const promises = filteredWebhooks
        .filter(w => w.enabled)
        .map(w => apiClient.testWebhook(w.id));
      
      await Promise.all(promises);
      alert(`Test requests sent to ${promises.length} active webhook(s)!`);
    } catch (error) {
      console.error('Failed to test webhooks:', error);
      alert('Failed to send test requests to some webhooks');
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
      alert('Test webhook sent successfully!');
    } catch (error) {
      console.error('Failed to test webhook:', error);
      alert('Failed to send test webhook');
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

  const getStatusIcon = (webhook: Webhook) => {
    if (!webhook.enabled) {
      return <XCircle className="w-4 h-4 text-slate-500" />;
    }
    
    if (webhook.failure_count > 0) {
      return <AlertTriangle className="w-4 h-4 text-yellow-500" />;
    }
    
    return <CheckCircle className="w-4 h-4 text-green-500" />;
  };

  const webhookStats = {
    total: webhooks.length,
    active: webhooks.filter(w => w.enabled && w.failure_count === 0).length,
    disabled: webhooks.filter(w => !w.enabled).length,
    failing: webhooks.filter(w => w.enabled && w.failure_count > 0).length,
  };

  return (
    <div className="p-6 space-y-8">
      {/* Enhanced Header */}
      <div className="flex flex-col lg:flex-row lg:justify-between lg:items-start space-y-4 lg:space-y-0">
        <div>
          <h1 className="text-3xl font-bold text-slate-100">Webhook Management</h1>
          <p className="text-slate-400 mt-1">Monitor and manage webhook endpoints for real-time event notifications</p>
          
          {/* Stats Bar */}
          <div className="flex items-center space-x-6 mt-4">
            <div className="flex items-center space-x-2">
              <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
              <span className="text-sm text-slate-400">Total: {webhookStats.total}</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-3 h-3 bg-green-500 rounded-full"></div>
              <span className="text-sm text-slate-400">Active: {webhookStats.active}</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-3 h-3 bg-yellow-500 rounded-full"></div>
              <span className="text-sm text-slate-400">Failing: {webhookStats.failing}</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-3 h-3 bg-slate-500 rounded-full"></div>
              <span className="text-sm text-slate-400">Disabled: {webhookStats.disabled}</span>
            </div>
          </div>
        </div>
        
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center space-y-2 sm:space-y-0 sm:space-x-3">
          <button
            onClick={exportWebhookConfig}
            className="btn btn-secondary"
            disabled={webhooks.length === 0}
          >
            <Download className="w-4 h-4 mr-2" />
            Export Config
          </button>
          
          <button
            onClick={() => setShowHealthModal(true)}
            className="btn btn-secondary"
            disabled={webhooks.length === 0}
          >
            <Activity className="w-4 h-4 mr-2" />
            Health Check
          </button>
          
          <button
            onClick={testAllWebhooks}
            className="btn btn-secondary"
            disabled={filteredWebhooks.filter(w => w.enabled).length === 0}
          >
            <Zap className="w-4 h-4 mr-2" />
            Test All
          </button>
          
          <button
            onClick={() => setShowCreateModal(true)}
            className="btn btn-primary"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Webhook
          </button>
        </div>
      </div>

      {/* Enhanced Filters and Search */}
      <div className="content-card-glass">
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
                  className="pl-10 pr-4 py-2 border border-white/15 rounded-md focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 w-full sm:w-64"
                />
              </div>

              {/* Status Filter */}
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as any)}
                className="px-3 py-2 border border-white/15 rounded-md focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500"
              >
                <option value="all">All Status</option>
                <option value="active">Active</option>
                <option value="failing">Failing</option>
                <option value="disabled">Disabled</option>
              </select>

              <div className="text-sm text-slate-500">
                Showing {filteredWebhooks.length} of {webhooks.length} webhooks
              </div>
            </div>

            {/* Bulk Actions */}
            {selectedWebhooks.length > 0 && (
              <div className="flex items-center space-x-2">
                <span className="text-sm text-slate-400">
                  {selectedWebhooks.length} selected
                </span>
                
                <button
                  onClick={() => bulkToggleWebhooks(true)}
                  className="px-3 py-1 text-xs bg-green-100 text-green-700 rounded-md hover:bg-green-200"
                >
                  Enable
                </button>
                
                <button
                  onClick={() => bulkToggleWebhooks(false)}
                  className="px-3 py-1 text-xs bg-yellow-100 text-yellow-700 rounded-md hover:bg-yellow-200"
                >
                  Disable
                </button>
                
                <button
                  onClick={bulkDeleteWebhooks}
                  className="px-3 py-1 text-xs bg-red-100 text-red-700 rounded-md hover:bg-red-200"
                >
                  Delete
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Webhook List */}
      <div className="content-card-glass">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-6 h-6 border-2 border-primary-600 border-t-transparent rounded-full animate-spin mr-3"></div>
            Loading webhooks...
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
              className="btn btn-primary"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Your First Webhook
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-slate-900/60">
                <tr>
                  <th className="px-6 py-3">
                    <input
                      type="checkbox"
                      checked={selectedWebhooks.length === filteredWebhooks.length && filteredWebhooks.length > 0}
                      onChange={(e) => selectAllWebhooks(e.target.checked)}
                      className="h-4 w-4 text-cyan-300 focus:ring-cyan-500 border-white/15 rounded"
                    />
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Webhook URL
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Events
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Status & Health
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Last Activity
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-slate-900/55 backdrop-blur-sm divide-y divide-white/20">
                {filteredWebhooks.map((webhook) => (
                  <tr key={webhook.id} className="hover:bg-slate-900/60">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <input
                        type="checkbox"
                        checked={selectedWebhooks.includes(webhook.id)}
                        onChange={() => toggleWebhookSelection(webhook.id)}
                        className="h-4 w-4 text-cyan-300 focus:ring-cyan-500 border-white/15 rounded"
                      />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <Globe className="w-5 h-5 text-slate-500 mr-3" />
                        <div>
                          <div className="text-sm font-medium text-slate-100">
                            {webhook.url}
                          </div>
                          <div className="text-xs text-slate-500">
                            ID: {webhook.id.substring(0, 8)}...
                          </div>
                          <span className="text-xs text-slate-500">
                            {webhook.max_retries ?? 3} retries · {webhook.retry_backoff_minutes ?? 5} min backoff
                          </span>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-slate-100">
                        {webhook.events.length} event{webhook.events.length !== 1 ? 's' : ''}
                      </div>
                      <div className="text-xs text-slate-500">
                        {webhook.events.slice(0, 2).join(', ')}
                        {webhook.events.length > 2 && ` +${webhook.events.length - 2} more`}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex flex-col space-y-1">
                        <div className="flex items-center">
                          {getStatusIcon(webhook)}
                          <span className={`ml-2 text-sm font-medium ${
                            !webhook.enabled 
                              ? 'text-slate-500' 
                              : webhook.failure_count > 0 
                                ? 'text-yellow-600' 
                                : 'text-green-600'
                          }`}>
                            {!webhook.enabled 
                              ? 'Disabled' 
                              : webhook.failure_count > 0 
                                ? `${webhook.failure_count} failures` 
                                : 'Healthy'
                            }
                          </span>
                        </div>
                        {webhook.enabled && (
                          <div className="text-xs text-slate-500">
                            {webhook.last_success_at 
                              ? `Last success: ${formatDate(webhook.last_success_at).split(',')[0]}`
                              : 'Never delivered'
                            }
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                      {webhook.last_success_at ? (
                        <div>
                          <div>Success: {formatDate(webhook.last_success_at)}</div>
                          {webhook.last_failure_at && (
                            <div className="text-red-500">
                              Failure: {formatDate(webhook.last_failure_at)}
                            </div>
                          )}
                        </div>
                      ) : webhook.last_failure_at ? (
                        <div className="text-red-500">
                          Failure: {formatDate(webhook.last_failure_at)}
                        </div>
                      ) : (
                        'No deliveries'
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => viewDeliveries(webhook)}
                          className="text-primary-600 hover:text-primary-900"
                          title="View deliveries"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        
                        <button
                          onClick={() => testWebhook(webhook.id)}
                          className="text-cyan-300 hover:text-cyan-200"
                          title="Send test"
                        >
                          <RefreshCw className="w-4 h-4" />
                        </button>
                        
                        <button
                          onClick={() => toggleWebhook(webhook.id, !webhook.enabled)}
                          className={webhook.enabled ? "text-amber-300 hover:text-amber-200" : "text-emerald-300 hover:text-emerald-200"}
                          title={webhook.enabled ? "Disable" : "Enable"}
                        >
                          {webhook.enabled ? <XCircle className="w-4 h-4" /> : <CheckCircle className="w-4 h-4" />}
                        </button>
                        
                        <button
                          onClick={() => {
                            setSelectedWebhook(webhook);
                            setShowCreateModal(true);
                          }}
                          className="text-slate-400 hover:text-slate-100"
                          title="Edit"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        
                        <button
                          onClick={() => deleteWebhook(webhook.id)}
                          className="text-red-600 hover:text-red-900"
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
      alert('Secret key copied to clipboard!');
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
    <div className="fixed inset-0 z-[120] overflow-y-auto h-full w-full bg-slate-950/70 backdrop-blur-sm">
      <div className="relative top-20 mx-auto p-5 border w-11/12 max-w-2xl shadow-lg rounded-md bg-slate-900">
        <div className="flex justify-between items-start mb-6">
          <div>
            <h3 className="text-lg font-semibold text-slate-100">
              {webhook ? 'Edit Webhook' : 'Add New Webhook'}
            </h3>
            <p className="text-sm text-slate-500 mt-1">
              Configure webhook endpoint to receive real-time notifications
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-500 hover:text-slate-400"
          >
            <XCircle className="w-6 h-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="form-label">Webhook URL *</label>
            <div className="relative">
              <Globe className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-500 w-4 h-4" />
              <input
                type="url"
                className={`form-input pl-10 ${errors.url ? 'border-red-300 focus:border-red-500 focus:ring-red-500' : ''}`}
                placeholder="https://your-domain.com/webhooks"
                value={formData.url}
                onChange={(e) => {
                  setFormData(prev => ({ ...prev, url: e.target.value }));
                  if (errors.url) setErrors(prev => ({ ...prev, url: '' }));
                }}
              />
            </div>
            {errors.url && <p className="mt-1 text-sm text-red-600">{errors.url}</p>}
            <p className="mt-1 text-sm text-slate-500">
              HTTPS URLs are recommended for security
            </p>
          </div>

          <div>
            <label className="form-label">Secret Key (Optional)</label>
            <div className="relative">
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
                  className="text-slate-500 hover:text-slate-400"
                >
                  {showSecretKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
                {formData.secret_key && (
                  <button
                    type="button"
                    onClick={copySecretKey}
                    className="text-slate-500 hover:text-slate-400"
                    title="Copy secret key"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
            <div className="flex justify-between items-center mt-1">
              <p className="text-sm text-slate-500">
                {webhook?.id
                  ? 'Leave blank to keep the existing secret. Enter a new value to rotate it.'
                  : 'Used to verify webhook authenticity (HMAC-SHA256)'}
              </p>
              <button
                type="button"
                onClick={generateSecretKey}
                className="text-sm text-primary-600 hover:text-primary-700"
              >
                Generate Random Key
              </button>
            </div>
          </div>

          <div>
            <label className="form-label">Events to Listen For *</label>
            {errors.events && <p className="mb-2 text-sm text-red-600">{errors.events}</p>}
            <div className="space-y-2 max-h-48 overflow-y-auto border border-white/10 rounded-lg p-3">
              {WEBHOOK_EVENTS.map((event) => (
                <div key={event.value} className="flex items-start">
                  <input
                    type="checkbox"
                    id={event.value}
                    checked={formData.events.includes(event.value)}
                    onChange={() => toggleEvent(event.value)}
                    className="mt-1 h-4 w-4 text-primary-600 focus:ring-primary-500 border-white/15 rounded"
                  />
                  <label htmlFor={event.value} className="ml-3 text-sm cursor-pointer">
                    <div className="font-medium text-slate-100">{event.label}</div>
                    <div className="text-slate-500">{event.description}</div>
                  </label>
                </div>
              ))}
            </div>
          </div>

          {webhookSecret && formData.url.startsWith('https://') && (
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">
                Signing Secret
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={webhookSecret}
                  className="flex-1 font-mono text-xs border rounded-lg px-3 py-2 bg-slate-900/60"
                />
                <button
                  type="button"
                  onClick={() => navigator.clipboard.writeText(webhookSecret)}
                  className="px-3 py-2 text-sm border rounded-lg hover:bg-slate-900/60"
                >
                  Copy
                </button>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Compute <code>HMAC-SHA256(secret, rawBody)</code> and compare to the{' '}
                <code>X-Webhook-Signature</code> header to verify payloads.
              </p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">
                Max Retries
              </label>
              <input
                type="number"
                min={0}
                max={10}
                value={formData.max_retries ?? 3}
                onChange={(e) => {
                  const v = parseInt(e.target.value, 10);
                  if (!isNaN(v)) setFormData((f) => ({ ...f, max_retries: v }));
                }}
                className="w-full border rounded-lg px-3 py-2"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">
                Retry Backoff (minutes)
              </label>
              <input
                type="number"
                min={1}
                max={60}
                value={formData.retry_backoff_minutes ?? 5}
                onChange={(e) => {
                  const v = parseInt(e.target.value, 10);
                  if (!isNaN(v)) setFormData((f) => ({ ...f, retry_backoff_minutes: v }));
                }}
                className="w-full border rounded-lg px-3 py-2"
              />
            </div>
          </div>

          <div className="flex justify-end space-x-4 pt-4 border-t border-white/10">
            <button
              type="button"
              onClick={onClose}
              className="btn btn-secondary"
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
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
      </div>
    </div>
  );
}

interface WebhookDeliveriesModalProps {
  webhook: Webhook;
  deliveries: WebhookDelivery[];
  onClose: () => void;
}

function WebhookDeliveriesModal({ webhook, deliveries, onClose }: WebhookDeliveriesModalProps) {
  const getStatusBadge = (status: string) => {
    const baseClass = "inline-flex items-center px-2 py-1 rounded-full text-xs font-medium";
    
    switch (status) {
      case 'delivered':
        return `${baseClass} bg-green-100 text-green-800`;
      case 'failed':
        return `${baseClass} bg-red-100 text-red-800`;
      case 'retrying':
        return `${baseClass} bg-yellow-100 text-yellow-800`;
      default:
        return `${baseClass} bg-slate-800/70 text-slate-200`;
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

  return (
    <div className="fixed inset-0 z-[120] overflow-y-auto h-full w-full bg-slate-950/70 backdrop-blur-sm">
      <div className="relative top-10 mx-auto p-5 border w-11/12 max-w-5xl shadow-lg rounded-md bg-slate-900">
        <div className="flex justify-between items-start mb-6">
          <div>
            <h3 className="text-lg font-semibold text-slate-100">Webhook Deliveries</h3>
            <p className="text-sm text-slate-500 mt-1">
              Recent delivery attempts for {webhook.url}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-500 hover:text-slate-400"
          >
            <XCircle className="w-6 h-6" />
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-slate-900/60">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Event
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Response
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Attempts
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Timestamp
                </th>
              </tr>
            </thead>
            <tbody className="bg-slate-900 divide-y divide-gray-200">
              {deliveries.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-4 text-center text-slate-500">
                    No deliveries found for this webhook
                  </td>
                </tr>
              ) : (
                deliveries.map((delivery) => (
                  <tr key={delivery.id} className="hover:bg-slate-900/60">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-slate-100">
                        {delivery.event_type}
                      </div>
                      <div className="text-xs text-slate-500">
                        ID: {delivery.id.substring(0, 8)}...
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={getStatusBadge(delivery.status)}>
                        {delivery.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-slate-100">
                        {delivery.http_status_code ? (
                          <span className={
                            delivery.http_status_code < 300 
                              ? 'text-green-600' 
                              : 'text-red-600'
                          }>
                            {delivery.http_status_code}
                          </span>
                        ) : (
                          'N/A'
                        )}
                      </div>
                      {delivery.error_message && (
                        <div className="text-xs text-red-500 truncate max-w-xs">
                          {delivery.error_message}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-100">
                      {delivery.attempts}/{delivery.max_retries}
                      {delivery.next_retry_at && (
                        <div className="text-xs text-slate-500">
                          Next: {formatDate(delivery.next_retry_at)}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                      <div>{formatDate(delivery.created_at)}</div>
                      {delivery.delivered_at && (
                        <div className="text-xs text-green-600">
                          Delivered: {formatDate(delivery.delivered_at)}
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="flex justify-end mt-6">
          <button
            onClick={onClose}
            className="btn btn-secondary"
          >
            Close
          </button>
        </div>
      </div>
    </div>
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
    <div className="fixed inset-0 z-[120] overflow-y-auto h-full w-full bg-slate-950/70 backdrop-blur-sm">
      <div className="relative top-10 mx-auto p-5 border w-11/12 max-w-4xl shadow-lg rounded-md bg-slate-900">
        <div className="flex justify-between items-start mb-6">
          <div>
            <h3 className="text-lg font-semibold text-slate-100 flex items-center">
              <Activity className="h-5 w-5 mr-2 text-green-600" />
              Webhook Health Dashboard
            </h3>
            <p className="text-sm text-slate-500 mt-1">
              Overview of webhook performance and health status
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-500 hover:text-slate-400"
          >
            <XCircle className="w-6 h-6" />
          </button>
        </div>

        {/* Health Overview Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div className="bg-cyan-500/10 border border-cyan-500/30 rounded-lg p-4">
            <div className="flex items-center">
              <Globe className="h-8 w-8 text-cyan-300" />
              <div className="ml-4">
                <p className="text-sm font-medium text-cyan-300">Total Webhooks</p>
                <p className="text-2xl font-bold text-slate-100">{healthStats.total}</p>
              </div>
            </div>
          </div>

          <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-4">
            <div className="flex items-center">
              <CheckCircle className="h-8 w-8 text-green-600" />
              <div className="ml-4">
                <p className="text-sm font-medium text-emerald-300">Healthy</p>
                <p className="text-2xl font-bold text-slate-100">{healthStats.healthy}</p>
              </div>
            </div>
          </div>

          <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4">
            <div className="flex items-center">
              <AlertTriangle className="h-8 w-8 text-yellow-600" />
              <div className="ml-4">
                <p className="text-sm font-medium text-amber-300">Failing</p>
                <p className="text-2xl font-bold text-slate-100">{healthStats.failing}</p>
              </div>
            </div>
          </div>

          <div className="bg-slate-900/60 border border-white/10 rounded-lg p-4">
            <div className="flex items-center">
              <XCircle className="h-8 w-8 text-slate-400" />
              <div className="ml-4">
                <p className="text-sm font-medium text-slate-400">Disabled</p>
                <p className="text-2xl font-bold text-slate-100">{healthStats.disabled}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Critical Issues */}
          <div className="bg-slate-900 border border-white/10 rounded-lg">
            <div className="p-4 border-b border-white/10">
              <h4 className="text-lg font-semibold text-slate-100 flex items-center">
                <AlertTriangle className="h-4 w-4 mr-2 text-red-500" />
                Critical Issues
              </h4>
            </div>
            <div className="p-4">
              {criticalWebhooks.length === 0 ? (
                <div className="text-center py-4">
                  <CheckCircle className="h-8 w-8 text-green-500 mx-auto mb-2" />
                  <p className="text-sm text-slate-400">No critical issues found</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {criticalWebhooks.map(webhook => (
                    <div key={webhook.id} className="flex items-center justify-between p-3 bg-rose-500/10 rounded-lg border border-rose-500/20">
                      <div>
                        <p className="text-sm font-medium text-slate-100">{webhook.url}</p>
                        <p className="text-xs text-red-600">{webhook.failure_count} consecutive failures</p>
                      </div>
                      <AlertTriangle className="h-4 w-4 text-red-500" />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Stale Webhooks */}
          <div className="bg-slate-900 border border-white/10 rounded-lg">
            <div className="p-4 border-b border-white/10">
              <h4 className="text-lg font-semibold text-slate-100 flex items-center">
                <Clock className="h-4 w-4 mr-2 text-yellow-500" />
                Stale Webhooks
              </h4>
            </div>
            <div className="p-4">
              {staleWebhooks.length === 0 ? (
                <div className="text-center py-4">
                  <Activity className="h-8 w-8 text-green-500 mx-auto mb-2" />
                  <p className="text-sm text-slate-400">All webhooks have recent activity</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {staleWebhooks.slice(0, 5).map(webhook => (
                    <div key={webhook.id} className="flex items-center justify-between p-3 bg-amber-500/10 rounded-lg border border-amber-500/20">
                      <div>
                        <p className="text-sm font-medium text-slate-100">{webhook.url}</p>
                        <p className="text-xs text-yellow-600">
                          {!webhook.last_success_at && !webhook.last_failure_at 
                            ? 'Never received events' 
                            : 'No activity in 7+ days'
                          }
                        </p>
                      </div>
                      <Clock className="h-4 w-4 text-yellow-500" />
                    </div>
                  ))}
                  {staleWebhooks.length > 5 && (
                    <p className="text-xs text-slate-500 text-center">
                      +{staleWebhooks.length - 5} more stale webhooks
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Health Recommendations */}
        <div className="mt-6 bg-cyan-500/10 border border-cyan-500/25 rounded-lg p-4">
          <h4 className="text-sm font-semibold text-cyan-200 mb-2 flex items-center">
            <Shield className="h-4 w-4 mr-2" />
            Health Recommendations
          </h4>
          <ul className="text-sm text-cyan-200 space-y-1">
            {criticalWebhooks.length > 0 && (
              <li>• Review and fix {criticalWebhooks.length} webhook(s) with high failure rates</li>
            )}
            {staleWebhooks.length > 0 && (
              <li>• Consider removing or updating {staleWebhooks.length} inactive webhook(s)</li>
            )}
            {healthStats.disabled > 0 && (
              <li>• Review {healthStats.disabled} disabled webhook(s) - enable if still needed</li>
            )}
            {criticalWebhooks.length === 0 && staleWebhooks.length === 0 && healthStats.disabled === 0 && (
              <li>• All webhooks are healthy and active! 🎉</li>
            )}
          </ul>
        </div>

        <div className="flex justify-end mt-6">
          <button
            onClick={onClose}
            className="btn btn-primary"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
