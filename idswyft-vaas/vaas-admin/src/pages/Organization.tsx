import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { apiClient } from '../services/api';
import { showToast } from '../lib/toast';
import { ConfirmationModal } from '../components/ui/Modal';
import { Organization as OrgType, OrganizationSettings, OrganizationBranding, ApiResponse } from '../types.js';
import type { AxiosResponse } from 'axios';
import { Save, CreditCard } from 'lucide-react';
import AdminManagement from '../components/organization/AdminManagement';
import UsageDashboard from '../components/organization/UsageDashboard';
import { AssetUpload } from '../components/AssetUpload';
import { sectionLabel, statNumber, monoXs, monoSm, cardSurface, statusPill, tableHeaderClass, infoPanel, getStatusAccent } from '../styles/tokens';
import Modal from '../components/ui/Modal';

export default function Organization() {
  const { organization, admin } = useAuth();
  const [orgData, setOrgData] = useState<OrgType | null>(organization);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'general' | 'billing' | 'branding' | 'storage' | 'api-keys' | 'admins'>('general');

  useEffect(() => {
    if (organization) {
      setOrgData(organization);
    }
  }, [organization]);

  const handleSaveGeneral = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orgData || !admin?.permissions.manage_organization) return;

    setIsLoading(true);
    setError(null);

    try {
      const updated = await apiClient.updateOrganization(orgData.id, {
        name: orgData.name,
        contact_email: orgData.contact_email
      });
      setOrgData(updated);
      setSuccess('Organization details updated successfully');
    } catch (err: any) {
      setError(err.message || 'Failed to update organization');
    } finally {
      setIsLoading(false);
    }
  };


  const handleSaveBranding = async (branding: OrganizationBranding) => {
    if (!orgData || !admin?.permissions.manage_organization) return;

    setIsLoading(true);
    setError(null);

    try {
      const updated = await apiClient.updateOrganization(orgData.id, { branding });
      setOrgData(updated);
      setSuccess('Branding updated successfully');
    } catch (err: any) {
      setError(err.message || 'Failed to update branding');
    } finally {
      setIsLoading(false);
    }
  };

  if (!orgData) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-400"></div>
      </div>
    );
  }

  const tabs: { key: typeof activeTab; label: string }[] = [
    { key: 'general', label: 'General' },
    { key: 'billing', label: 'Billing' },
    { key: 'branding', label: 'Branding' },
    { key: 'storage', label: 'Storage & Data' },
    { key: 'api-keys', label: 'Main API Keys' },
    { key: 'admins', label: 'Admin Users' },
  ];

  return (
    <div className="p-6 space-y-8">
      <div>
        <p className={sectionLabel}>Organization Settings</p>
        <p className="text-sm text-slate-500 mt-1">Manage your organization's business settings, branding, and data storage configuration</p>
        <div className={`mt-3 p-3 ${infoPanel}`}>
          <p className={`${monoXs} text-cyan-300`}>
            Looking for verification thresholds and technical settings? Visit{' '}
            <a href="/settings" className="font-medium text-cyan-400 hover:text-cyan-300 underline">
              Verification Settings
            </a>{' '}
            for threshold management and system configuration.
          </p>
        </div>
      </div>

      {error && (
        <div className="bg-rose-500/12 border border-rose-400/30 rounded-lg p-4 flex items-center space-x-2">
          <span className={`${monoXs} text-rose-300`}>{error}</span>
        </div>
      )}

      {success && (
        <div className="bg-emerald-500/12 border border-emerald-400/30 rounded-lg p-4">
          <span className={`${monoXs} text-emerald-300`}>{success}</span>
        </div>
      )}

      <div className="border-b border-white/10">
        <nav className="-mb-px flex space-x-8">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`py-4 px-1 border-b-2 font-mono text-sm transition-colors ${
                activeTab === tab.key
                  ? 'border-cyan-400 text-cyan-200'
                  : 'border-transparent text-slate-500 hover:text-slate-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {activeTab === 'general' && (
        <GeneralSettings
          organization={orgData}
          onSave={handleSaveGeneral}
          isLoading={isLoading}
          canEdit={admin?.permissions.manage_organization || false}
          onChange={setOrgData}
        />
      )}

      {activeTab === 'billing' && (
        <div className="space-y-6">
          <UsageDashboard organizationId={orgData.id} />
          <BillingSettings
            organization={orgData}
            canManage={admin?.permissions.manage_billing || false}
          />
        </div>
      )}

      {activeTab === 'branding' && (
        <BrandingSettings
          branding={orgData.branding}
          orgId={orgData.id}
          onSave={handleSaveBranding}
          isLoading={isLoading}
          canEdit={admin?.permissions.manage_organization || false}
        />
      )}


      {activeTab === 'storage' && (
        <StorageSettings
          organizationId={orgData.id}
          canManageStorage={admin?.permissions.manage_organization || false}
        />
      )}

      {activeTab === 'api-keys' && (
        <MainAPIKeysManagement
          organizationId={orgData.id}
          canManageKeys={admin?.permissions.manage_organization || false}
        />
      )}

      {activeTab === 'admins' && (
        <AdminManagement
          organizationId={orgData.id}
          canManageAdmins={admin?.permissions.manage_admins || false}
        />
      )}
    </div>
  );
}

interface MainAPIKeysManagementProps {
  organizationId: string;
  canManageKeys: boolean;
}

function MainAPIKeysManagement({ organizationId, canManageKeys }: MainAPIKeysManagementProps) {
  const [apiKeys, setApiKeys] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [isSandbox, setIsSandbox] = useState(true);
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [confirmRevoke, setConfirmRevoke] = useState<{ id: string; name: string } | null>(null);

  useEffect(() => {
    fetchAPIKeys();
  }, []);

  const fetchAPIKeys = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const response: AxiosResponse<ApiResponse<{api_keys: any[]}>> = await apiClient.get('/organizations/main-api-keys');

      if (response.data.success) {
        setApiKeys(response.data.data?.api_keys || []);
      } else {
        throw new Error(response.data.error?.message || 'Failed to fetch API keys');
      }
    } catch (err: any) {
      console.error('Failed to fetch API keys:', err);
      setError(err.message || 'Failed to fetch API keys');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManageKeys || !newKeyName.trim()) return;

    setIsCreating(true);
    setError(null);

    try {
      const response: AxiosResponse<ApiResponse<{api_key: string}>> = await apiClient.post('/organizations/main-api-keys', {
        key_name: newKeyName.trim(),
        is_sandbox: isSandbox
      });

      if (response.data.success) {
        setCreatedKey(response.data.data?.api_key || '');
        setNewKeyName('');
        setShowCreateForm(false);
        await fetchAPIKeys(); // Refresh the list
      } else {
        throw new Error(response.data.error?.message || 'Failed to create API key');
      }
    } catch (err: any) {
      console.error('Failed to create API key:', err);
      setError(err.message || 'Failed to create API key');
    } finally {
      setIsCreating(false);
    }
  };

  const handleRevokeKey = async (keyId: string) => {
    try {
      setError(null);
      const response: AxiosResponse<ApiResponse> = await apiClient.delete(`/organizations/main-api-keys/${keyId}`);

      if (response.data.success) {
        showToast.success('API key revoked');
        await fetchAPIKeys();
      } else {
        throw new Error(response.data.error?.message || 'Failed to revoke API key');
      }
    } catch (err: any) {
      console.error('Failed to revoke API key:', err);
      showToast.error(err.message || 'Failed to revoke API key');
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      // Could add a toast notification here
    });
  };

  return (
    <div className="space-y-6">
      {/* Success Message for Created Key */}
      {createdKey && (
        <div className="bg-emerald-500/12 border border-emerald-400/30 rounded-lg p-4">
          <div className="flex items-start">
            <div className="ml-3 flex-1">
              <p className={sectionLabel}>API Key Created Successfully</p>
              <div className="mt-2 text-sm text-emerald-300">
                <p className={`${monoXs} font-medium`}>Store this key securely - it will not be shown again:</p>
                <div className="mt-2 flex items-center space-x-2">
                  <code className={`flex-1 px-3 py-2 bg-emerald-500/15 border border-emerald-400/30 rounded-lg ${monoXs} break-all text-emerald-200`}>
                    {createdKey}
                  </code>
                  <button
                    onClick={() => copyToClipboard(createdKey)}
                    className="px-3 py-2 font-mono text-xs font-medium text-emerald-300 bg-emerald-500/15 border border-emerald-400/30 rounded-lg hover:bg-emerald-500/25 transition-colors"
                  >
                    Copy
                  </button>
                </div>
              </div>
              <div className="mt-4">
                <button
                  onClick={() => setCreatedKey(null)}
                  className="text-emerald-400 hover:text-emerald-300 text-sm font-medium font-mono transition-colors"
                >
                  Dismiss
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="bg-rose-500/12 border border-rose-400/30 rounded-lg p-4 flex items-center space-x-2">
          <span className={`${monoXs} text-rose-300`}>{error}</span>
        </div>
      )}

      <div className={cardSurface}>
        <div className="px-6 py-4 border-b border-white/10 flex justify-between items-center">
          <div>
            <p className={sectionLabel}>Main API Keys</p>
            <p className="text-sm text-slate-500 mt-1">
              API keys for accessing the main Idswyft verification API from your customer portal
            </p>
          </div>
          {canManageKeys && (
            <button
              onClick={() => setShowCreateForm(!showCreateForm)}
              className="inline-flex items-center px-4 py-2 bg-cyan-500/20 border border-cyan-400/40 text-cyan-200 hover:bg-cyan-500/30 font-mono text-sm rounded-lg transition-colors"
            >
              Create API Key
            </button>
          )}
        </div>

        {/* Create Form */}
        {showCreateForm && canManageKeys && (
          <div className="px-6 py-4 border-b border-white/10 bg-slate-900/40">
            <form onSubmit={handleCreateKey} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className={`block mb-2 ${sectionLabel}`}>
                    Key Name
                  </label>
                  <input
                    type="text"
                    value={newKeyName}
                    onChange={(e) => setNewKeyName(e.target.value)}
                    placeholder="e.g., Customer Portal Production"
                    className="w-full px-3 py-2 bg-slate-900/60 border border-white/10 rounded-lg font-mono text-sm text-slate-100 focus:outline-none focus:ring-cyan-400 focus:border-cyan-400"
                    required
                    maxLength={100}
                  />
                </div>
                <div>
                  <label className={`block mb-2 ${sectionLabel}`}>
                    Environment
                  </label>
                  <select
                    value={isSandbox ? 'sandbox' : 'production'}
                    onChange={(e) => setIsSandbox(e.target.value === 'sandbox')}
                    className="w-full px-3 py-2 bg-slate-900/60 border border-white/10 rounded-lg font-mono text-sm text-slate-100 focus:outline-none focus:ring-cyan-400 focus:border-cyan-400"
                  >
                    <option value="sandbox">Sandbox (Testing)</option>
                    <option value="production">Production (Live)</option>
                  </select>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <div className={`${monoXs} text-slate-500`}>
                  {isSandbox ? 'Up to 5 sandbox keys allowed' : 'Up to 2 production keys allowed'}
                </div>
                <div className="flex space-x-3">
                  <button
                    type="button"
                    onClick={() => setShowCreateForm(false)}
                    className="px-4 py-2 font-mono text-sm text-slate-300 border border-white/10 rounded-lg hover:bg-slate-800/40 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isCreating || !newKeyName.trim()}
                    className="px-4 py-2 font-mono text-sm bg-cyan-500/20 border border-cyan-400/40 text-cyan-200 hover:bg-cyan-500/30 rounded-lg disabled:opacity-50 transition-colors"
                  >
                    {isCreating ? 'Creating...' : 'Create Key'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        )}

        <div className="p-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-400"></div>
            </div>
          ) : apiKeys.length === 0 ? (
            <div className="text-center py-8">
              <p className={sectionLabel}>No API keys</p>
              <p className="mt-2 text-sm text-slate-500">
                Create your first main API key to enable verification in your customer portal.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {apiKeys.map((key) => (
                <div
                  key={key.id}
                  className={`flex items-center justify-between p-4 border border-white/10 rounded-lg hover:bg-slate-800/40 transition-colors`}
                >
                  <div className="flex-1">
                    <div className="flex items-center space-x-3">
                      <h4 className={`${monoSm} font-medium text-slate-100`}>{key.key_name}</h4>
                      <span className={`${statusPill} ${getStatusAccent(key.is_sandbox ? 'sandbox' : 'production').pill}`}>
                        {key.is_sandbox ? 'Sandbox' : 'Production'}
                      </span>
                    </div>
                    <div className="mt-1 space-y-1">
                      <p className={`${monoXs} text-slate-500`}>Key: <code className="bg-slate-800/50 px-2 py-0.5 rounded">{key.key_prefix}...</code></p>
                      <p className={`${monoXs} text-slate-500`}>Created: {new Date(key.created_at).toLocaleDateString()}</p>
                      {key.last_used_at && (
                        <p className={`${monoXs} text-slate-500`}>Last used: {new Date(key.last_used_at).toLocaleDateString()}</p>
                      )}
                    </div>
                  </div>
                  {canManageKeys && (
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => setConfirmRevoke({ id: key.id, name: key.key_name })}
                        className="px-3 py-1.5 bg-rose-500/20 border border-rose-400/40 text-rose-200 hover:bg-rose-500/30 font-mono text-xs rounded-lg transition-colors"
                      >
                        Revoke
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <ConfirmationModal
        isOpen={confirmRevoke !== null}
        title="Revoke API Key"
        message={`Are you sure you want to revoke the API key "${confirmRevoke?.name}"? This action cannot be undone.`}
        confirmText="Revoke"
        onConfirm={() => {
          if (confirmRevoke) handleRevokeKey(confirmRevoke.id);
        }}
        onClose={() => setConfirmRevoke(null)}
        confirmVariant="danger"
      />

      {/* Information Card */}
      <div className={infoPanel}>
        <p className={sectionLabel}>About Main API Keys</p>
        <div className={`mt-2 ${monoXs} text-cyan-300`}>
          <ul className="list-disc list-inside space-y-1">
            <li>Main API keys allow your customer portal to perform real identity verification</li>
            <li>Sandbox keys are for testing and don't process real verifications</li>
            <li>Production keys process real verifications and incur charges</li>
            <li>Keys use the format: <code className="bg-slate-900/60 px-1.5 py-0.5 rounded">ik_[64-character hex string]</code></li>
            <li>Store keys securely in environment variables, never in code</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

interface GeneralSettingsProps {
  organization: OrgType;
  onSave: (e: React.FormEvent) => void;
  isLoading: boolean;
  canEdit: boolean;
  onChange: (org: OrgType) => void;
}

function GeneralSettings({ organization, onSave, isLoading, canEdit, onChange }: GeneralSettingsProps) {
  const handleChange = (field: keyof OrgType, value: any) => {
    onChange({ ...organization, [field]: value });
  };

  return (
    <div className={cardSurface}>
      <div className="px-6 py-4 border-b border-white/10">
        <p className={sectionLabel}>Organization Details</p>
      </div>

      <form onSubmit={onSave} className="p-6 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className={`block mb-2 ${sectionLabel}`}>
              Organization Name
            </label>
            <input
              type="text"
              value={organization.name}
              onChange={(e) => handleChange('name', e.target.value)}
              disabled={!canEdit}
              className="w-full px-3 py-2 bg-slate-900/60 border border-white/10 rounded-lg font-mono text-sm text-slate-100 focus:outline-none focus:ring-cyan-400 focus:border-cyan-400 disabled:bg-slate-900/40 disabled:text-slate-500"
              required
            />
          </div>

          <div>
            <label className={`block mb-2 ${sectionLabel}`}>
              Organization Slug
            </label>
            <input
              type="text"
              value={organization.slug}
              disabled
              className="w-full px-3 py-2 bg-slate-900/40 border border-white/10 rounded-lg font-mono text-sm text-slate-500"
            />
            <p className={`mt-1 ${monoXs} text-slate-500`}>Slug cannot be changed</p>
          </div>

          <div>
            <label className={`block mb-2 ${sectionLabel}`}>
              Contact Email
            </label>
            <input
              type="email"
              value={organization.contact_email}
              onChange={(e) => handleChange('contact_email', e.target.value)}
              disabled={!canEdit}
              className="w-full px-3 py-2 bg-slate-900/60 border border-white/10 rounded-lg font-mono text-sm text-slate-100 focus:outline-none focus:ring-cyan-400 focus:border-cyan-400 disabled:bg-slate-900/40 disabled:text-slate-500"
              required
            />
          </div>

          <div>
            <label className={`block mb-2 ${sectionLabel}`}>
              Subscription Tier
            </label>
            <input
              type="text"
              value={organization.subscription_tier}
              disabled
              className="w-full px-3 py-2 bg-slate-900/40 border border-white/10 rounded-lg font-mono text-sm text-slate-500 capitalize"
            />
          </div>
        </div>

        {canEdit && (
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={isLoading}
              className="inline-flex items-center px-4 py-2 bg-cyan-500/20 border border-cyan-400/40 text-cyan-200 hover:bg-cyan-500/30 font-mono text-sm rounded-lg disabled:opacity-50 transition-colors"
            >
              <Save className="h-4 w-4 mr-2" />
              {isLoading ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        )}
      </form>
    </div>
  );
}

interface BillingSettingsProps {
  organization: OrgType;
  canManage: boolean;
}

function BillingSettings({ organization, canManage }: BillingSettingsProps) {
  return (
    <div className={cardSurface}>
      <div className="px-6 py-4 border-b border-white/10">
        <p className={sectionLabel}>Billing Information</p>
      </div>

      <div className="p-6 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="text-sm text-slate-400 block mb-2">
              Current Plan
            </label>
            <span className={`${statusPill} ${getStatusAccent(organization.subscription_tier).pill}`}>
              {organization.subscription_tier}
            </span>
          </div>

          <div>
            <label className="text-sm text-slate-400 block mb-2">
              Billing Status
            </label>
            <span className={`${statusPill} ${getStatusAccent(organization.billing_status).pill}`}>
              {organization.billing_status.replace('_', ' ')}
            </span>
          </div>

          <div>
            <label className="text-sm text-slate-400 block mb-2">
              Stripe Customer ID
            </label>
            <p className={`${monoSm} text-slate-100`}>
              {organization.stripe_customer_id || 'Not configured'}
            </p>
          </div>

          <div>
            <label className="text-sm text-slate-400 block mb-2">
              Account Created
            </label>
            <p className={`${monoXs} text-slate-100`}>
              {new Date(organization.created_at).toLocaleDateString()}
            </p>
          </div>
        </div>

        {canManage && (
          <div className="border-t border-white/10 pt-6">
            <div className="flex space-x-3">
              <button
                className="inline-flex items-center px-4 py-2 bg-cyan-500/20 border border-cyan-400/40 text-cyan-200 hover:bg-cyan-500/30 font-mono text-sm rounded-lg transition-colors"
                onClick={() => {/* TODO: Implement billing portal */}}
              >
                <CreditCard className="h-4 w-4 mr-2" />
                Manage Billing
              </button>

              <button
                className="inline-flex items-center px-4 py-2 border border-white/10 font-mono text-sm text-slate-300 rounded-lg hover:bg-slate-800/40 transition-colors"
                onClick={() => {/* TODO: Implement plan upgrade */}}
              >
                Upgrade Plan
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

interface BrandingSettingsProps {
  branding: OrganizationBranding;
  orgId: string;
  onSave: (branding: OrganizationBranding) => void;
  isLoading: boolean;
  canEdit: boolean;
}

function BrandingSettings({ branding, orgId, onSave, isLoading, canEdit }: BrandingSettingsProps) {
  const [formData, setFormData] = useState(branding);
  const [localBranding, setLocalBranding] = useState(branding);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
  };

  const handleChange = (field: keyof OrganizationBranding, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleAssetUpload = async (assetType: string, file: File) => {
    const result = await apiClient.uploadOrgAsset(orgId, assetType, file);
    const key = (assetType.replace('-', '_') + '_url') as keyof OrganizationBranding;
    setLocalBranding(prev => ({ ...prev, [key]: result.url }));
    setFormData(prev => ({ ...prev, [key]: result.url }));
  };

  return (
    <div className={cardSurface}>
      <div className="px-6 py-4 border-b border-white/10">
        <p className={sectionLabel}>Branding & Customization</p>
      </div>

      <form onSubmit={handleSubmit} className="p-6 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className={`block mb-2 ${sectionLabel}`}>
              Company Name
            </label>
            <input
              type="text"
              value={formData.company_name}
              onChange={(e) => handleChange('company_name', e.target.value)}
              disabled={!canEdit}
              className="w-full px-3 py-2 bg-slate-900/60 border border-white/10 rounded-lg font-mono text-sm text-slate-100 focus:outline-none focus:ring-cyan-400 focus:border-cyan-400 disabled:bg-slate-900/40 disabled:text-slate-500"
              required
            />
          </div>

          <div>
            <label className={`block mb-2 ${sectionLabel}`}>
              Primary Color
            </label>
            <div className="flex space-x-2">
              <input
                type="color"
                value={formData.primary_color || '#3B82F6'}
                onChange={(e) => handleChange('primary_color', e.target.value)}
                disabled={!canEdit}
                className="h-10 w-20 border border-white/10 rounded-lg disabled:opacity-50"
              />
              <input
                type="text"
                value={formData.primary_color || '#3B82F6'}
                onChange={(e) => handleChange('primary_color', e.target.value)}
                disabled={!canEdit}
                className="flex-1 px-3 py-2 bg-slate-900/60 border border-white/10 rounded-lg font-mono text-sm text-slate-100 focus:outline-none focus:ring-cyan-400 focus:border-cyan-400 disabled:bg-slate-900/40 disabled:text-slate-500"
                placeholder="#3B82F6"
              />
            </div>
          </div>
        </div>

        {/* Brand asset uploads -- replaces the old logo URL text input */}
        <div>
          <p className={`${sectionLabel} mb-3`}>Brand Assets</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <AssetUpload
              label="Logo"
              currentUrl={localBranding.logo_url}
              onUpload={(file) => handleAssetUpload('logo', file)}
              disabled={!canEdit}
            />
            <AssetUpload
              label="Favicon"
              currentUrl={localBranding.favicon_url}
              onUpload={(file) => handleAssetUpload('favicon', file)}
              disabled={!canEdit}
            />
            <AssetUpload
              label="Email Banner"
              currentUrl={localBranding.email_banner_url}
              onUpload={(file) => handleAssetUpload('email-banner', file)}
              disabled={!canEdit}
            />
            <AssetUpload
              label="Portal Background"
              currentUrl={localBranding.portal_background_url}
              onUpload={(file) => handleAssetUpload('portal-background', file)}
              disabled={!canEdit}
            />
          </div>
        </div>

        <div>
          <label className={`block mb-2 ${sectionLabel}`}>
            Welcome Message
          </label>
          <textarea
            value={formData.welcome_message}
            onChange={(e) => handleChange('welcome_message', e.target.value)}
            disabled={!canEdit}
            rows={3}
            className="w-full px-3 py-2 bg-slate-900/60 border border-white/10 rounded-lg font-mono text-sm text-slate-100 focus:outline-none focus:ring-cyan-400 focus:border-cyan-400 disabled:bg-slate-900/40 disabled:text-slate-500"
            placeholder="Welcome! Please verify your identity to continue."
          />
        </div>

        <div>
          <label className={`block mb-2 ${sectionLabel}`}>
            Success Message
          </label>
          <textarea
            value={formData.success_message}
            onChange={(e) => handleChange('success_message', e.target.value)}
            disabled={!canEdit}
            rows={3}
            className="w-full px-3 py-2 bg-slate-900/60 border border-white/10 rounded-lg font-mono text-sm text-slate-100 focus:outline-none focus:ring-cyan-400 focus:border-cyan-400 disabled:bg-slate-900/40 disabled:text-slate-500"
            placeholder="Thank you! Your identity has been successfully verified."
          />
        </div>

        <div>
          <label className={`block mb-2 ${sectionLabel}`}>
            Custom CSS
          </label>
          <textarea
            value={formData.custom_css || ''}
            onChange={(e) => handleChange('custom_css', e.target.value)}
            disabled={!canEdit}
            rows={5}
            className="w-full px-3 py-2 bg-slate-900/60 border border-white/10 rounded-lg font-mono text-sm text-slate-100 focus:outline-none focus:ring-cyan-400 focus:border-cyan-400 disabled:bg-slate-900/40 disabled:text-slate-500"
            placeholder=".verification-form { /* Custom styles */ }"
          />
          <p className={`mt-1 ${monoXs} text-slate-500`}>
            Add custom CSS to style the verification interface
          </p>
        </div>

        {canEdit && (
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={isLoading}
              className="inline-flex items-center px-4 py-2 bg-cyan-500/20 border border-cyan-400/40 text-cyan-200 hover:bg-cyan-500/30 font-mono text-sm rounded-lg disabled:opacity-50 transition-colors"
            >
              <Save className="h-4 w-4 mr-2" />
              {isLoading ? 'Saving...' : 'Save Branding'}
            </button>
          </div>
        )}
      </form>
    </div>
  );
}


interface StorageSettingsProps {
  organizationId: string;
  canManageStorage: boolean;
}

function StorageSettings({ organizationId, canManageStorage }: StorageSettingsProps) {
  const [storageConfig, setStorageConfig] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);

  // Storage configuration state
  const [storageType, setStorageType] = useState<'default' | 'supabase' | 's3' | 'gcs'>('default');
  const [config, setConfig] = useState({
    // Supabase Storage
    supabase_url: '',
    supabase_service_key: '',
    supabase_bucket: '',

    // AWS S3
    s3_region: '',
    s3_bucket: '',
    s3_access_key: '',
    s3_secret_key: '',

    // Google Cloud Storage
    gcs_bucket: '',
    gcs_project_id: '',
    gcs_key_file: '',

    // Data retention settings
    retention_days: 365,
    auto_delete_completed: false,
    encryption_enabled: true
  });

  useEffect(() => {
    fetchStorageConfig();
  }, [organizationId]);

  const fetchStorageConfig = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const response: AxiosResponse<ApiResponse<any>> = await apiClient.get(`/organizations/${organizationId}/storage-config`);

      if (response.data.success) {
        const data = response.data.data;
        setStorageConfig(data);
        setStorageType(data.storage_type || 'default');
        setConfig({ ...config, ...data.config });
      }
    } catch (err: any) {
      // If no config exists yet, that's okay - use defaults
      if (err.response?.status !== 404) {
        console.error('Failed to fetch storage config:', err);
        setError(err.message || 'Failed to fetch storage configuration');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManageStorage) return;

    setIsUpdating(true);
    setError(null);
    setSuccess(null);

    try {
      const payload = {
        storage_type: storageType,
        config: storageType === 'default' ? {} : config
      };

      const response: AxiosResponse<ApiResponse> = await apiClient.post(`/organizations/${organizationId}/storage-config`, payload);

      if (response.data.success) {
        setSuccess('Storage configuration updated successfully');
        await fetchStorageConfig();
      } else {
        throw new Error(response.data.error?.message || 'Failed to update storage configuration');
      }
    } catch (err: any) {
      console.error('Failed to update storage config:', err);
      setError(err.message || 'Failed to update storage configuration');
    } finally {
      setIsUpdating(false);
    }
  };

  if (isLoading) {
    return (
      <div className={`${cardSurface} p-8`}>
        <div className="flex items-center justify-center py-8">
          <div className="space-y-4 w-full max-w-md">
            <div className="h-4 bg-slate-700/50 rounded animate-pulse w-3/4"></div>
            <div className="h-4 bg-slate-700/50 rounded animate-pulse w-1/2"></div>
            <div className="h-10 bg-slate-700/50 rounded animate-pulse w-full"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Success/Error Messages */}
      {error && (
        <div className="bg-rose-500/12 border border-rose-400/30 rounded-lg p-4 flex items-center space-x-2">
          <span className={`${monoXs} text-rose-300`}>{error}</span>
        </div>
      )}

      {success && (
        <div className="bg-emerald-500/12 border border-emerald-400/30 rounded-lg p-4">
          <span className={`${monoXs} text-emerald-300`}>{success}</span>
        </div>
      )}

      {/* Storage Configuration Card */}
      <div className={cardSurface}>
        <div className="px-6 py-4 border-b border-white/10">
          <p className={sectionLabel}>Document Storage Configuration</p>
          <p className="text-sm text-slate-500 mt-1">
            Configure where identity documents are stored for data sovereignty and compliance
          </p>
        </div>

        <form onSubmit={handleSaveConfig} className="p-6 space-y-6">
          {/* Storage Provider Selection */}
          <div>
            <label className={`block mb-2 ${sectionLabel}`}>
              Storage Provider
            </label>
            <select
              value={storageType}
              onChange={(e) => setStorageType(e.target.value as any)}
              disabled={!canManageStorage}
              className="w-full px-3 py-2 bg-slate-900/60 border border-white/10 rounded-lg font-mono text-sm text-slate-100 focus:ring-cyan-400 focus:border-cyan-400 disabled:bg-slate-900/40 disabled:text-slate-500"
            >
              <option value="default">Default (Idswyft Storage)</option>
              <option value="supabase">Supabase Storage</option>
              <option value="s3">Amazon S3</option>
              <option value="gcs">Google Cloud Storage</option>
            </select>
            <p className={`${monoXs} text-slate-500 mt-1`}>
              Custom storage providers will be configured in the next phase
            </p>
          </div>

          {/* Data Retention Settings */}
          <div className="border-t border-white/10 pt-6">
            <p className={`${sectionLabel} mb-4`}>Data Retention & Security</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className={`block mb-2 ${sectionLabel}`}>
                  Retention Period (Days)
                </label>
                <input
                  type="number"
                  min="1"
                  max="2555" // ~7 years
                  value={config.retention_days}
                  onChange={(e) => setConfig({ ...config, retention_days: Number(e.target.value) })}
                  disabled={!canManageStorage}
                  className="w-full px-3 py-2 bg-slate-900/60 border border-white/10 rounded-lg font-mono text-sm text-slate-100 focus:ring-cyan-400 focus:border-cyan-400 disabled:bg-slate-900/40 disabled:text-slate-500"
                />
                <p className={`${monoXs} text-slate-500 mt-1`}>Documents will be automatically deleted after this period</p>
              </div>

              <div className="space-y-4">
                <div className="flex items-center">
                  <input
                    id="auto_delete_completed"
                    type="checkbox"
                    checked={config.auto_delete_completed}
                    onChange={(e) => setConfig({ ...config, auto_delete_completed: e.target.checked })}
                    disabled={!canManageStorage}
                    className="h-4 w-4 text-cyan-400 focus:ring-cyan-400 border-white/10 rounded disabled:opacity-50"
                  />
                  <label htmlFor="auto_delete_completed" className={`ml-2 ${monoXs} text-slate-100`}>
                    Auto-delete completed verifications
                  </label>
                </div>

                <div className="flex items-center">
                  <input
                    id="encryption_enabled"
                    type="checkbox"
                    checked={config.encryption_enabled}
                    onChange={(e) => setConfig({ ...config, encryption_enabled: e.target.checked })}
                    disabled={!canManageStorage}
                    className="h-4 w-4 text-cyan-400 focus:ring-cyan-400 border-white/10 rounded disabled:opacity-50"
                  />
                  <label htmlFor="encryption_enabled" className={`ml-2 ${monoXs} text-slate-100`}>
                    Enable encryption at rest
                  </label>
                </div>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          {canManageStorage && (
            <div className="flex justify-end pt-6 border-t border-white/10">
              <button
                type="submit"
                disabled={isUpdating}
                className="inline-flex items-center px-4 py-2 bg-cyan-500/20 border border-cyan-400/40 text-cyan-200 hover:bg-cyan-500/30 font-mono text-sm rounded-lg disabled:opacity-50 transition-colors"
              >
                <Save className="h-4 w-4 mr-2" />
                {isUpdating ? 'Saving...' : 'Save Configuration'}
              </button>
            </div>
          )}
        </form>
      </div>

      {/* Information Card */}
      <div className={infoPanel}>
        <p className={sectionLabel}>About Custom Storage</p>
        <div className={`mt-2 ${monoXs} text-cyan-300`}>
          <ul className="list-disc list-inside space-y-1">
            <li>Custom storage allows you to store identity documents in your own cloud storage</li>
            <li>This ensures data sovereignty and compliance with your organization's data policies</li>
            <li>All documents are encrypted in transit and at rest (when enabled)</li>
            <li>Storage credentials are encrypted and stored securely</li>
            <li>Coming soon: Full configuration for Supabase, AWS S3, and Google Cloud Storage</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
