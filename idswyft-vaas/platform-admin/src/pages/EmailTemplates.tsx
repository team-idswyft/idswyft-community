import React, { useState, useEffect } from 'react';
import { Save, Eye } from 'lucide-react';
import { platformApi } from '../services/api';
import {
  sectionLabel,
  monoXs,
  monoSm,
  cardSurface,
} from '../styles/tokens';

interface EmailConfig {
  logo_url: string;
  primary_color: string;
  footer_text: string;
  company_name: string;
}

const TEMPLATE_TABS = ['welcome', 'notification', 'verification', 'invitation'] as const;
type TemplateName = typeof TEMPLATE_TABS[number];

export default function EmailTemplates() {
  const [config, setConfig] = useState<EmailConfig>({
    logo_url: '',
    primary_color: '#22d3ee',
    footer_text: '',
    company_name: '',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTemplate, setActiveTemplate] = useState<TemplateName>('welcome');
  const [previewHtml, setPreviewHtml] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    fetchConfig();
  }, []);

  useEffect(() => {
    fetchPreview(activeTemplate);
  }, [activeTemplate]);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  async function fetchConfig() {
    try {
      const data = await platformApi.getEmailConfig();
      setConfig({
        logo_url: data.logo_url || '',
        primary_color: data.primary_color || '#22d3ee',
        footer_text: data.footer_text || '',
        company_name: data.company_name || '',
      });
    } catch (err) {
      console.error('Failed to load email config:', err);
    } finally {
      setLoading(false);
    }
  }

  async function fetchPreview(template: TemplateName) {
    setPreviewLoading(true);
    try {
      const data = await platformApi.getEmailPreview(template);
      setPreviewHtml(data.html || data.preview || '');
    } catch (err) {
      console.error('Failed to load preview:', err);
      setPreviewHtml('<p style="color:#94a3b8;padding:2rem;font-family:sans-serif;">Preview unavailable</p>');
    } finally {
      setPreviewLoading(false);
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);

    try {
      await platformApi.updateEmailConfig(config);
      setToast({ type: 'success', message: 'Email configuration saved' });
      fetchPreview(activeTemplate);
    } catch (err: any) {
      setToast({ type: 'error', message: err.message || 'Failed to save configuration' });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-400" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <div>
        <p className={sectionLabel}>Email Template Configuration</p>
        <p className="text-sm text-slate-500 mt-1">
          Customize the appearance of emails sent by the platform
        </p>
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Config Form */}
        <div className={`${cardSurface} p-6`}>
          <p className={`${sectionLabel} mb-5`}>Configuration</p>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="form-group">
              <label className="form-label">Logo URL</label>
              <input
                type="text"
                value={config.logo_url}
                onChange={(e) => setConfig({ ...config, logo_url: e.target.value })}
                className="form-input"
                placeholder="https://example.com/logo.png"
              />
            </div>

            <div className="form-group">
              <label className="form-label">Primary Color</label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={config.primary_color}
                  onChange={(e) => setConfig({ ...config, primary_color: e.target.value })}
                  className="h-10 w-12 rounded-lg border border-white/10 bg-transparent cursor-pointer"
                />
                <input
                  type="text"
                  value={config.primary_color}
                  onChange={(e) => setConfig({ ...config, primary_color: e.target.value })}
                  className="form-input flex-1"
                  placeholder="#22d3ee"
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Company Name</label>
              <input
                type="text"
                value={config.company_name}
                onChange={(e) => setConfig({ ...config, company_name: e.target.value })}
                className="form-input"
                placeholder="Idswyft"
              />
            </div>

            <div className="form-group">
              <label className="form-label">Footer Text</label>
              <input
                type="text"
                value={config.footer_text}
                onChange={(e) => setConfig({ ...config, footer_text: e.target.value })}
                className="form-input"
                placeholder="Copyright 2026 Idswyft. All rights reserved."
              />
            </div>

            <div className="pt-2">
              <button type="submit" disabled={saving} className="btn btn-primary text-sm w-full">
                <Save className="h-4 w-4" />
                {saving ? 'Saving...' : 'Save Configuration'}
              </button>
            </div>
          </form>
        </div>

        {/* Preview */}
        <div className={`${cardSurface} p-6`}>
          <div className="flex items-center justify-between mb-5">
            <p className={sectionLabel}>
              <Eye className="inline h-3.5 w-3.5 mr-1.5" />
              Template Preview
            </p>
          </div>

          {/* Template Tabs */}
          <div className="flex border-b border-white/10 mb-4">
            {TEMPLATE_TABS.map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTemplate(tab)}
                className={`px-4 py-2.5 font-mono text-xs font-semibold uppercase tracking-wider transition border-b-2 ${
                  activeTemplate === tab
                    ? 'border-cyan-400 text-cyan-200'
                    : 'border-transparent text-slate-500 hover:text-slate-300'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* Preview Pane */}
          <div className="rounded-lg border border-white/10 bg-white overflow-hidden" style={{ minHeight: 300 }}>
            {previewLoading ? (
              <div className="flex items-center justify-center h-[300px] bg-slate-950/60">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-cyan-400" />
              </div>
            ) : (
              <div
                className="w-full"
                style={{ minHeight: 300 }}
                dangerouslySetInnerHTML={{ __html: previewHtml }}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
