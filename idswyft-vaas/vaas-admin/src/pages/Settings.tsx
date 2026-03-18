import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { apiClient } from '../services/api';
import { Organization, OrganizationSettings } from '../types.js';
import { Save, AlertCircle, CheckCircle, Palette, Bell } from 'lucide-react';
import { sectionLabel, cardSurface } from '../styles/tokens';

export default function Settings() {
  const { organization, admin } = useAuth();
  const [orgData, setOrgData] = useState<Organization | null>(organization);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<'notifications' | 'appearance'>('notifications');

  useEffect(() => {
    if (organization) {
      setOrgData(organization);
    }
  }, [organization]);

  const handleSaveSettings = async (updates: Partial<OrganizationSettings>) => {
    if (!orgData || !admin?.permissions.manage_settings) return;

    setIsLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const updatedSettings = { ...orgData.settings, ...updates };
      const updated = await apiClient.updateOrganization(orgData.id, {
        settings: updatedSettings
      });
      setOrgData(updated);
      setSuccess('Settings updated successfully');

      // Clear success message after 3 seconds
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to update settings');
    } finally {
      setIsLoading(false);
    }
  };

  const handleQuickToggle = async (field: keyof OrganizationSettings, value: boolean) => {
    await handleSaveSettings({ [field]: value });
  };

  if (!orgData) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-400"></div>
      </div>
    );
  }

  const canEdit = admin?.permissions.manage_settings || false;

  return (
    <div className="p-6 space-y-8">
      <div>
        <p className={sectionLabel}>Organization Settings</p>
        <p className="text-sm text-slate-500 mt-1">Configure notification preferences and appearance settings</p>
      </div>

      {error && (
        <div className="bg-rose-500/12 border border-rose-500/25 rounded-md p-4 flex items-center space-x-2">
          <AlertCircle className="h-5 w-5 text-rose-400 flex-shrink-0" />
          <span className="text-rose-300">{error}</span>
        </div>
      )}

      {success && (
        <div className="bg-emerald-500/12 border border-emerald-500/25 rounded-md p-4 flex items-center space-x-2">
          <CheckCircle className="h-5 w-5 text-emerald-400 flex-shrink-0" />
          <span className="text-emerald-300">{success}</span>
        </div>
      )}

      <div className="flex flex-col lg:flex-row lg:space-x-6">
        {/* Settings Navigation */}
        <div className="lg:w-64 mb-6 lg:mb-0">
          <nav className="space-y-2">
            <button
              onClick={() => setActiveSection('notifications')}
              className={`w-full flex items-center px-3 py-2 text-sm font-medium rounded-md ${
                activeSection === 'notifications'
                  ? 'bg-cyan-500/15 text-cyan-300 border-r-2 border-cyan-400'
                  : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/60'
              }`}
            >
              <Bell className="h-4 w-4 mr-3" />
              Notifications
            </button>

            <button
              onClick={() => setActiveSection('appearance')}
              className={`w-full flex items-center px-3 py-2 text-sm font-medium rounded-md ${
                activeSection === 'appearance'
                  ? 'bg-cyan-500/15 text-cyan-300 border-r-2 border-cyan-400'
                  : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/60'
              }`}
            >
              <Palette className="h-4 w-4 mr-3" />
              Appearance
            </button>
          </nav>
        </div>

        {/* Settings Content */}
        <div className="flex-1">
          {activeSection === 'notifications' && (
            <NotificationSettingsSection
              settings={orgData.settings}
              onSave={handleSaveSettings}
              onQuickToggle={handleQuickToggle}
              isLoading={isLoading}
              canEdit={canEdit}
            />
          )}

          {activeSection === 'appearance' && (
            <AppearanceSettingsSection
              settings={orgData.settings}
              onSave={handleSaveSettings}
              isLoading={isLoading}
              canEdit={canEdit}
            />
          )}
        </div>
      </div>
    </div>
  );
}

interface SettingsSectionProps {
  settings: OrganizationSettings;
  onSave: (updates: Partial<OrganizationSettings>) => Promise<void>;
  onQuickToggle?: (field: keyof OrganizationSettings, value: boolean) => Promise<void>;
  isLoading: boolean;
  canEdit: boolean;
}

function NotificationSettingsSection({ settings, onSave, onQuickToggle, isLoading, canEdit }: SettingsSectionProps) {
  const [formData, setFormData] = useState(settings);

  const handleQuickToggleLocal = async (field: keyof OrganizationSettings, checked: boolean) => {
    setFormData(prev => ({ ...prev, [field]: checked }));
    if (onQuickToggle) {
      await onQuickToggle(field, checked);
    }
  };

  return (
    <div className={cardSurface}>
      <div className="px-6 py-4 border-b border-white/10">
        <p className={sectionLabel}>Notification Preferences</p>
      </div>

      <div className="p-6 space-y-6">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <label className="text-sm font-medium text-slate-100">Email Notifications</label>
              <p className="text-xs text-slate-500">Receive email alerts for verification events</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={formData.email_notifications}
                onChange={(e) => handleQuickToggleLocal('email_notifications', e.target.checked)}
                disabled={!canEdit || isLoading}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-slate-600 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-cyan-500/30 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-500 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-cyan-500"></div>
            </label>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <label className="text-sm font-medium text-slate-100">Webhook Notifications</label>
              <p className="text-xs text-slate-500">Send real-time events to configured webhooks</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={formData.webhook_notifications}
                onChange={(e) => handleQuickToggleLocal('webhook_notifications', e.target.checked)}
                disabled={!canEdit || isLoading}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-slate-600 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-cyan-500/30 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-500 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-cyan-500"></div>
            </label>
          </div>
        </div>

        <div className="bg-cyan-500/12 border border-cyan-500/25 rounded-md p-4">
          <div className="flex">
            <Bell className="h-5 w-5 text-cyan-400 flex-shrink-0" />
            <div className="ml-3">
              <h4 className="text-sm font-medium text-cyan-200">Notification Events</h4>
              <ul className="mt-1 text-sm text-cyan-300 list-disc list-inside space-y-1">
                <li>Verification completion (success/failure)</li>
                <li>Manual review requirements</li>
                <li>System alerts and errors</li>
                <li>Usage threshold notifications</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function AppearanceSettingsSection({ settings, onSave, isLoading, canEdit }: SettingsSectionProps) {
  const [formData, setFormData] = useState(settings);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSave({ theme: formData.theme, language: formData.language });
  };

  const handleChange = (field: keyof OrganizationSettings, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  return (
    <div className={cardSurface}>
      <div className="px-6 py-4 border-b border-white/10">
        <p className={sectionLabel}>Appearance &amp; Localization</p>
      </div>

      <form onSubmit={handleSubmit} className="p-6 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Theme
            </label>
            <div className="w-full px-3 py-2 border border-white/10 rounded-md bg-slate-900/40 text-slate-400 text-sm">
              Dark (default)
            </div>
            <p className="mt-1 text-xs text-slate-500">Light theme coming soon</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Language
            </label>
            <select
              value={formData.language}
              onChange={(e) => handleChange('language', e.target.value)}
              disabled={!canEdit}
              className="w-full px-3 py-2 border border-white/10 rounded-md bg-slate-900/70 text-slate-100 focus:outline-none focus:ring-cyan-400 focus:border-cyan-400 disabled:bg-slate-900/40"
            >
              <option value="en">English</option>
              <option value="es">Spanish</option>
              <option value="fr">French</option>
              <option value="de">German</option>
            </select>
          </div>
        </div>

        <div className={`${cardSurface} p-4`}>
          <div className="flex">
            <Palette className="h-5 w-5 text-slate-500 flex-shrink-0" />
            <div className="ml-3">
              <h4 className="text-sm font-medium text-slate-200">Advanced Customization</h4>
              <p className="mt-1 text-sm text-slate-400">
                For custom branding, colors, and advanced appearance options, visit the{' '}
                <a href="/organization" className="text-cyan-400 hover:text-cyan-300 font-medium">
                  Organization Settings
                </a>{' '}
                page.
              </p>
            </div>
          </div>
        </div>

        {canEdit && (
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={isLoading}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-cyan-600 hover:bg-cyan-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-cyan-400 disabled:opacity-50"
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
