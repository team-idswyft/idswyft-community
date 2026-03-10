import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { apiClient } from '../services/api';
import { ApiKey, ApiKeyFormData, ApiKeyPermissions, ApiKeyUsage } from '../types.js';
import {
  Key,
  Plus,
  Edit,
  Trash2,
  Eye,
  EyeOff,
  Copy,
  RotateCcw,
  Shield,
  Clock,
  Globe,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Activity,
  TrendingUp,
  Calendar,
  Filter,
  Search,
  Download,
  RefreshCw,
  Settings,
  Code,
  Zap,
  Info
} from 'lucide-react';

export default function ApiKeys() {
  const { admin } = useAuth();
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [filteredApiKeys, setFilteredApiKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showUsageModal, setShowUsageModal] = useState(false);
  const [selectedApiKey, setSelectedApiKey] = useState<ApiKey | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'disabled' | 'revoked'>('all');
  const [environmentFilter, setEnvironmentFilter] = useState<'all' | 'sandbox' | 'production'>('all');
  const [usageData, setUsageData] = useState<ApiKeyUsage[]>([]);
  const [secretKey, setSecretKey] = useState<string | null>(null);
  const [showSecretModal, setShowSecretModal] = useState(false);

  useEffect(() => {
    loadApiKeys();
  }, []);

  useEffect(() => {
    filterApiKeys();
  }, [apiKeys, searchTerm, statusFilter, environmentFilter]);

  const filterApiKeys = () => {
    let filtered = apiKeys;

    // Search filter
    if (searchTerm) {
      filtered = filtered.filter(key =>
        key.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        key.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        key.key_prefix.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter(key => key.status === statusFilter);
    }

    // Environment filter
    if (environmentFilter !== 'all') {
      filtered = filtered.filter(key => key.environment === environmentFilter);
    }

    setFilteredApiKeys(filtered);
  };

  const loadApiKeys = async () => {
    try {
      setLoading(true);
      const keys = await apiClient.listApiKeys();
      setApiKeys(keys);
    } catch (error) {
      console.error('Failed to load API keys:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateApiKey = async (formData: ApiKeyFormData) => {
    try {
      const response = await apiClient.createApiKey(formData);
      setApiKeys(prev => [response.api_key, ...prev]);
      setSecretKey(response.secret_key);
      setShowCreateModal(false);
      setShowSecretModal(true);
    } catch (error) {
      console.error('Failed to create API key:', error);
      throw error;
    }
  };

  const handleUpdateApiKey = async (id: string, updates: Partial<ApiKey>) => {
    try {
      const updated = await apiClient.updateApiKey(id, updates);
      setApiKeys(prev => prev.map(key => key.id === id ? updated : key));
    } catch (error) {
      console.error('Failed to update API key:', error);
      throw error;
    }
  };

  const handleDeleteApiKey = async (id: string) => {
    if (!confirm('Are you sure you want to delete this API key? This action cannot be undone.')) {
      return;
    }

    try {
      await apiClient.deleteApiKey(id);
      setApiKeys(prev => prev.filter(key => key.id !== id));
    } catch (error) {
      console.error('Failed to delete API key:', error);
      alert('Failed to delete API key');
    }
  };

  const handleRotateApiKey = async (id: string) => {
    if (!confirm('Are you sure you want to rotate this API key? The old key will stop working immediately.')) {
      return;
    }

    try {
      const response = await apiClient.rotateApiKey(id);
      setSecretKey(response.secret_key);
      setShowSecretModal(true);
      loadApiKeys(); // Refresh to get updated key info
    } catch (error) {
      console.error('Failed to rotate API key:', error);
      alert('Failed to rotate API key');
    }
  };

  const handleViewUsage = async (apiKey: ApiKey) => {
    try {
      setSelectedApiKey(apiKey);
      const usage = await apiClient.getApiKeyUsage(apiKey.id, {
        start_date: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
        end_date: new Date().toISOString(),
        granularity: 'day'
      });
      setUsageData(usage);
      setShowUsageModal(true);
    } catch (error) {
      console.error('Failed to load API key usage:', error);
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

  const getStatusBadge = (status: string) => {
    const baseClass = "inline-flex items-center px-2 py-1 rounded-full text-xs font-medium";
    
    switch (status) {
      case 'active':
        return `${baseClass} bg-green-100 text-green-800`;
      case 'disabled':
        return `${baseClass} bg-yellow-100 text-yellow-800`;
      case 'revoked':
        return `${baseClass} bg-red-100 text-red-800`;
      default:
        return `${baseClass} bg-gray-100 text-gray-800`;
    }
  };

  const getEnvironmentBadge = (environment: string) => {
    return environment === 'production' 
      ? 'bg-blue-100 text-blue-800' 
      : 'bg-gray-100 text-gray-800';
  };

  const apiKeyStats = {
    total: apiKeys.length,
    active: apiKeys.filter(k => k.status === 'active').length,
    production: apiKeys.filter(k => k.environment === 'production').length,
    totalUsage: apiKeys.reduce((sum, k) => sum + k.usage_count, 0),
    recentlyUsed: apiKeys.filter(k => {
      if (!k.last_used_at) return false;
      const daysSince = (Date.now() - new Date(k.last_used_at).getTime()) / (1000 * 60 * 60 * 24);
      return daysSince < 7;
    }).length
  };

  const canManageApiKeys = admin?.permissions.manage_integrations || false;

  if (!canManageApiKeys) {
    return (
      <div className="p-6">
        <div className="text-center">
          <Shield className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-sm font-medium text-gray-900">Access Denied</h3>
          <p className="mt-1 text-sm text-gray-500">
            You don't have permission to manage API keys.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-8">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:justify-between lg:items-start space-y-4 lg:space-y-0">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">API Key Management</h1>
          <p className="text-gray-600 mt-1">Manage API keys for programmatic access to the VaaS platform</p>
          
          {/* Stats Bar */}
          <div className="flex items-center space-x-6 mt-4">
            <div className="flex items-center space-x-2">
              <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
              <span className="text-sm text-gray-600">Total: {apiKeyStats.total}</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-3 h-3 bg-green-500 rounded-full"></div>
              <span className="text-sm text-gray-600">Active: {apiKeyStats.active}</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-3 h-3 bg-purple-500 rounded-full"></div>
              <span className="text-sm text-gray-600">Production: {apiKeyStats.production}</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-3 h-3 bg-orange-500 rounded-full"></div>
              <span className="text-sm text-gray-600">Total Requests: {apiKeyStats.totalUsage.toLocaleString()}</span>
            </div>
          </div>
        </div>
        
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center space-y-2 sm:space-y-0 sm:space-x-3">
          <button
            onClick={loadApiKeys}
            className="btn btn-secondary"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </button>
          
          <button
            onClick={() => setShowCreateModal(true)}
            className="btn btn-primary"
          >
            <Plus className="w-4 h-4 mr-2" />
            Create API Key
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="content-card-glass p-6">
        <div className="pb-4 border-b border-white/20">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-4 sm:space-y-0">
            <div className="flex flex-col sm:flex-row sm:items-center space-y-4 sm:space-y-0 sm:space-x-4">
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                <input
                  type="text"
                  placeholder="Search API keys..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 w-full sm:w-64"
                />
              </div>

              {/* Status Filter */}
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as any)}
                className="px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="all">All Status</option>
                <option value="active">Active</option>
                <option value="disabled">Disabled</option>
                <option value="revoked">Revoked</option>
              </select>

              {/* Environment Filter */}
              <select
                value={environmentFilter}
                onChange={(e) => setEnvironmentFilter(e.target.value as any)}
                className="px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="all">All Environments</option>
                <option value="sandbox">Sandbox</option>
                <option value="production">Production</option>
              </select>

              <div className="text-sm text-gray-500">
                Showing {filteredApiKeys.length} of {apiKeys.length} API keys
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* API Keys List */}
      <div className="content-card-glass">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mr-3"></div>
            Loading API keys...
          </div>
        ) : filteredApiKeys.length === 0 ? (
          <div className="text-center py-12 px-6">
            <Key className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              {apiKeys.length === 0 ? 'No API keys created' : 'No API keys match your filters'}
            </h3>
            <p className="text-gray-600 mb-4">
              {apiKeys.length === 0 
                ? 'Create your first API key to start integrating with the VaaS platform'
                : 'Try adjusting your search or filter criteria'
              }
            </p>
            {apiKeys.length === 0 && (
              <button
                onClick={() => setShowCreateModal(true)}
                className="btn btn-primary"
              >
                <Plus className="w-4 h-4 mr-2" />
                Create Your First API Key
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-white/50 backdrop-blur-sm">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">
                    API Key
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">
                    Environment
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">
                    Usage
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">
                    Last Used
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white/30 backdrop-blur-sm divide-y divide-white/20">
                {filteredApiKeys.map((apiKey) => (
                  <tr key={apiKey.id} className="table-row-glass">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <Key className="w-5 h-5 text-gray-400 mr-3 flex-shrink-0" />
                        <div>
                          <div className="text-sm font-medium text-gray-900">
                            {apiKey.name}
                          </div>
                          <div className="text-xs text-gray-500 font-mono">
                            {apiKey.key_prefix}...{apiKey.key_suffix}
                          </div>
                          {apiKey.description && (
                            <div className="text-xs text-gray-500 mt-1">
                              {apiKey.description}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getEnvironmentBadge(apiKey.environment)}`}>
                        {apiKey.environment}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={getStatusBadge(apiKey.status)}>
                        {apiKey.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        {apiKey.usage_count.toLocaleString()} requests
                      </div>
                      {apiKey.rate_limit && (
                        <div className="text-xs text-gray-500">
                          Limit: {apiKey.rate_limit}/min
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {apiKey.last_used_at ? (
                        <div>
                          <div>{formatDate(apiKey.last_used_at)}</div>
                        </div>
                      ) : (
                        <span className="text-gray-400">Never used</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => handleViewUsage(apiKey)}
                          className="text-blue-600 hover:text-blue-900"
                          title="View usage"
                        >
                          <Activity className="w-4 h-4" />
                        </button>
                        
                        <button
                          onClick={() => {
                            setSelectedApiKey(apiKey);
                            setShowCreateModal(true);
                          }}
                          className="text-gray-600 hover:text-gray-900"
                          title="Edit"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        
                        <button
                          onClick={() => handleRotateApiKey(apiKey.id)}
                          className="text-orange-600 hover:text-orange-900"
                          title="Rotate key"
                        >
                          <RotateCcw className="w-4 h-4" />
                        </button>
                        
                        <button
                          onClick={() => handleDeleteApiKey(apiKey.id)}
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

      {/* Create/Edit API Key Modal */}
      {showCreateModal && (
        <ApiKeyFormModal
          apiKey={selectedApiKey}
          onClose={() => {
            setShowCreateModal(false);
            setSelectedApiKey(null);
          }}
          onSubmit={selectedApiKey ? 
            (data) => handleUpdateApiKey(selectedApiKey.id, data) : 
            handleCreateApiKey
          }
        />
      )}

      {/* Secret Key Display Modal */}
      {showSecretModal && secretKey && (
        <SecretKeyModal
          secretKey={secretKey}
          onClose={() => {
            setShowSecretModal(false);
            setSecretKey(null);
          }}
        />
      )}

      {/* Usage Modal */}
      {showUsageModal && selectedApiKey && (
        <UsageModal
          apiKey={selectedApiKey}
          usageData={usageData}
          onClose={() => {
            setShowUsageModal(false);
            setSelectedApiKey(null);
            setUsageData([]);
          }}
        />
      )}
    </div>
  );
}

interface ApiKeyFormModalProps {
  apiKey: ApiKey | null;
  onClose: () => void;
  onSubmit: (data: ApiKeyFormData) => Promise<void>;
}

function ApiKeyFormModal({ apiKey, onClose, onSubmit }: ApiKeyFormModalProps) {
  const [formData, setFormData] = useState<ApiKeyFormData>({
    name: apiKey?.name || '',
    description: apiKey?.description || '',
    permissions: apiKey?.permissions || {
      read_verifications: false,
      write_verifications: false,
      read_users: false,
      write_users: false,
      read_webhooks: false,
      write_webhooks: false,
      read_analytics: false,
      admin_access: false
    },
    environment: apiKey?.environment || 'sandbox',
    rate_limit: apiKey?.rate_limit || 60,
    allowed_ips: apiKey?.allowed_ips || [],
    expires_at: apiKey?.expires_at || ''
  });
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.name.trim()) {
      newErrors.name = 'Name is required';
    }

    const hasAnyPermission = Object.values(formData.permissions).some(Boolean);
    if (!hasAnyPermission) {
      newErrors.permissions = 'At least one permission must be selected';
    }

    if (formData.rate_limit && (formData.rate_limit < 1 || formData.rate_limit > 10000)) {
      newErrors.rate_limit = 'Rate limit must be between 1 and 10000';
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
      await onSubmit(formData);
      onClose();
    } catch (error: any) {
      console.error('Failed to save API key:', error);
      if (error.response?.data?.error?.details) {
        setErrors(error.response.data.error.details);
      }
    } finally {
      setLoading(false);
    }
  };

  const handlePermissionChange = (permission: keyof ApiKeyPermissions, checked: boolean) => {
    setFormData(prev => ({
      ...prev,
      permissions: {
        ...prev.permissions,
        [permission]: checked
      }
    }));
  };

  const permissionGroups = [
    {
      title: 'Verification Management',
      permissions: [
        { key: 'read_verifications' as keyof ApiKeyPermissions, label: 'Read Verifications', description: 'View verification data and status' },
        { key: 'write_verifications' as keyof ApiKeyPermissions, label: 'Write Verifications', description: 'Start and manage verification sessions' }
      ]
    },
    {
      title: 'User Management',
      permissions: [
        { key: 'read_users' as keyof ApiKeyPermissions, label: 'Read Users', description: 'View end user information' },
        { key: 'write_users' as keyof ApiKeyPermissions, label: 'Write Users', description: 'Create and modify end users' }
      ]
    },
    {
      title: 'Integration Management',
      permissions: [
        { key: 'read_webhooks' as keyof ApiKeyPermissions, label: 'Read Webhooks', description: 'View webhook configurations' },
        { key: 'write_webhooks' as keyof ApiKeyPermissions, label: 'Write Webhooks', description: 'Create and manage webhooks' }
      ]
    },
    {
      title: 'Analytics & Administration',
      permissions: [
        { key: 'read_analytics' as keyof ApiKeyPermissions, label: 'Read Analytics', description: 'Access usage and performance data' },
        { key: 'admin_access' as keyof ApiKeyPermissions, label: 'Admin Access', description: 'Full administrative privileges' }
      ]
    }
  ];

  return (
    <div className="fixed inset-0 z-[120] overflow-y-auto h-full w-full bg-slate-950/70 backdrop-blur-sm">
      <div className="relative top-10 mx-auto p-5 border w-11/12 max-w-4xl shadow-lg rounded-md bg-white">
        <div className="flex justify-between items-start mb-6">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">
              {apiKey ? 'Edit API Key' : 'Create New API Key'}
            </h3>
            <p className="text-sm text-gray-500 mt-1">
              Configure API key permissions and settings
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <XCircle className="w-6 h-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Basic Information */}
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Name *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  className={`w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                    errors.name ? 'border-red-300' : 'border-gray-300'
                  }`}
                  placeholder="My API Key"
                />
                {errors.name && <p className="mt-1 text-sm text-red-600">{errors.name}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Description
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Optional description for this API key"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Environment *
                </label>
                <select
                  value={formData.environment}
                  onChange={(e) => setFormData(prev => ({ ...prev, environment: e.target.value as 'sandbox' | 'production' }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="sandbox">Sandbox</option>
                  <option value="production">Production</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Rate Limit (requests/minute)
                </label>
                <input
                  type="number"
                  min="1"
                  max="10000"
                  value={formData.rate_limit || ''}
                  onChange={(e) => setFormData(prev => ({ ...prev, rate_limit: e.target.value ? parseInt(e.target.value) : undefined }))}
                  className={`w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                    errors.rate_limit ? 'border-red-300' : 'border-gray-300'
                  }`}
                  placeholder="60"
                />
                {errors.rate_limit && <p className="mt-1 text-sm text-red-600">{errors.rate_limit}</p>}
              </div>
            </div>

            {/* Permissions */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-4">
                Permissions *
              </label>
              {errors.permissions && <p className="mb-4 text-sm text-red-600">{errors.permissions}</p>}
              
              <div className="space-y-4 max-h-80 overflow-y-auto">
                {permissionGroups.map((group) => (
                  <div key={group.title} className="border border-gray-200 rounded-lg p-4">
                    <h4 className="text-sm font-medium text-gray-900 mb-3">{group.title}</h4>
                    <div className="space-y-3">
                      {group.permissions.map((permission) => (
                        <div key={permission.key} className="flex items-start">
                          <input
                            type="checkbox"
                            id={permission.key}
                            checked={formData.permissions[permission.key]}
                            onChange={(e) => handlePermissionChange(permission.key, e.target.checked)}
                            className="mt-1 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                          />
                          <label htmlFor={permission.key} className="ml-3 text-sm cursor-pointer">
                            <div className="font-medium text-gray-900">{permission.label}</div>
                            <div className="text-gray-500">{permission.description}</div>
                          </label>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="flex justify-end space-x-4 pt-4 border-t border-gray-200">
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
                  {apiKey ? 'Updating...' : 'Creating...'}
                </div>
              ) : (
                apiKey ? 'Update API Key' : 'Create API Key'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

interface SecretKeyModalProps {
  secretKey: string;
  onClose: () => void;
}

function SecretKeyModal({ secretKey, onClose }: SecretKeyModalProps) {
  const [copied, setCopied] = useState(false);

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(secretKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
    }
  };

  return (
    <div className="fixed inset-0 z-[120] overflow-y-auto h-full w-full bg-slate-950/70 backdrop-blur-sm">
      <div className="relative top-20 mx-auto p-5 border w-11/12 max-w-2xl shadow-lg rounded-md bg-white">
        <div className="text-center">
          <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-green-100 mb-4">
            <Key className="h-6 w-6 text-green-600" />
          </div>
          
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            API Key Created Successfully!
          </h3>
          
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
            <div className="flex">
              <AlertTriangle className="h-5 w-5 text-yellow-400 flex-shrink-0" />
              <div className="ml-3">
                <h4 className="text-sm font-medium text-yellow-800">Important Security Notice</h4>
                <p className="mt-1 text-sm text-yellow-700">
                  This is the only time you'll see the full API key. Please copy it and store it securely.
                </p>
              </div>
            </div>
          </div>

          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Your API Key
            </label>
            <div className="flex items-center space-x-2">
              <code className="flex-1 bg-white border border-gray-300 rounded px-3 py-2 text-sm font-mono break-all">
                {secretKey}
              </code>
              <button
                onClick={copyToClipboard}
                className="btn btn-secondary"
                title="Copy to clipboard"
              >
                {copied ? (
                  <CheckCircle className="w-4 h-4 text-green-600" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>

          <div className="text-left bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
            <h4 className="text-sm font-medium text-blue-900 mb-2">Quick Start</h4>
            <div className="text-sm text-blue-800 space-y-1">
              <p>• Include this key in your API requests as a Bearer token</p>
              <p>• Store it securely in your application's environment variables</p>
              <p>• Never expose it in client-side code or version control</p>
              <p>• You can rotate this key anytime from the API key management page</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="btn btn-primary"
          >
            I've Saved My API Key
          </button>
        </div>
      </div>
    </div>
  );
}

interface UsageModalProps {
  apiKey: ApiKey;
  usageData: ApiKeyUsage[];
  onClose: () => void;
}

function UsageModal({ apiKey, usageData, onClose }: UsageModalProps) {
  const totalRequests = usageData.reduce((sum, day) => sum + day.request_count, 0);
  const totalErrors = usageData.reduce((sum, day) => sum + day.error_count, 0);
  const errorRate = totalRequests > 0 ? (totalErrors / totalRequests) * 100 : 0;

  return (
    <div className="fixed inset-0 z-[120] overflow-y-auto h-full w-full bg-slate-950/70 backdrop-blur-sm">
      <div className="relative top-10 mx-auto p-5 border w-11/12 max-w-4xl shadow-lg rounded-md bg-white">
        <div className="flex justify-between items-start mb-6">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">
              API Key Usage: {apiKey.name}
            </h3>
            <p className="text-sm text-gray-500 mt-1">
              Usage statistics for the last 30 days
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <XCircle className="w-6 h-6" />
          </button>
        </div>

        {/* Usage Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-center">
              <Activity className="h-8 w-8 text-blue-600" />
              <div className="ml-4">
                <p className="text-sm font-medium text-blue-600">Total Requests</p>
                <p className="text-2xl font-bold text-blue-900">{totalRequests.toLocaleString()}</p>
              </div>
            </div>
          </div>

          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <div className="flex items-center">
              <CheckCircle className="h-8 w-8 text-green-600" />
              <div className="ml-4">
                <p className="text-sm font-medium text-green-600">Success Rate</p>
                <p className="text-2xl font-bold text-green-900">{(100 - errorRate).toFixed(1)}%</p>
              </div>
            </div>
          </div>

          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="flex items-center">
              <XCircle className="h-8 w-8 text-red-600" />
              <div className="ml-4">
                <p className="text-sm font-medium text-red-600">Error Count</p>
                <p className="text-2xl font-bold text-red-900">{totalErrors.toLocaleString()}</p>
              </div>
            </div>
          </div>

          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <div className="flex items-center">
              <Zap className="h-8 w-8 text-yellow-600" />
              <div className="ml-4">
                <p className="text-sm font-medium text-yellow-600">Rate Limit</p>
                <p className="text-2xl font-bold text-yellow-900">
                  {apiKey.rate_limit ? `${apiKey.rate_limit}/min` : 'None'}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Usage Chart Placeholder */}
        <div className="content-card-glass p-6 mb-6">
          <h4 className="text-lg font-semibold text-gray-900 mb-4">Daily Usage Trend</h4>
          <div className="h-64 flex items-center justify-center border-2 border-gray-200 border-dashed rounded-lg">
            <div className="text-center">
              <TrendingUp className="mx-auto h-12 w-12 text-gray-400" />
              <span className="mt-2 block text-sm font-medium text-gray-900">
                Usage Chart Coming Soon
              </span>
              <span className="block text-sm text-gray-500">
                Visual representation of API usage over time
              </span>
            </div>
          </div>
        </div>

        <div className="flex justify-end">
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
