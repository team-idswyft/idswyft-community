import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  SlidersHorizontal,
  RefreshCw,
  Save,
  Eye,
  Shield,
  AlertTriangle,
  CheckCircle,
} from 'lucide-react';
import { platformApi } from '../services/api';
import {
  sectionLabel,
  cardSurface,
  monoXs,
  monoSm,
  infoPanel,
} from '../styles/tokens';

// ── Types ────────────────────────────────────────────────────────────────────

interface Organization {
  id: string;
  name: string;
  slug: string;
}

interface AdminSettings {
  auto_approve_threshold: number;
  manual_review_threshold: number;
  require_liveness: boolean;
  require_back_of_id: boolean;
  max_verification_attempts: number;
}

interface ThresholdData {
  production: Record<string, number>;
  sandbox: Record<string, number>;
  meta: {
    organization_id: string;
    using_defaults: boolean;
    last_updated: string | null;
    admin_settings: AdminSettings;
  };
}

interface PreviewExplanation {
  auto_approve_threshold: string;
  manual_review_threshold: string;
  face_matching_production: string;
  liveness_detection: string;
}

interface PreviewData {
  preview: {
    production: { face_matching: number; liveness: number };
    sandbox: { face_matching: number; liveness: number };
  };
  explanation: PreviewExplanation;
}

// ── Defaults ─────────────────────────────────────────────────────────────────

const DEFAULT_SETTINGS: AdminSettings = {
  auto_approve_threshold: 85,
  manual_review_threshold: 50,
  require_liveness: true,
  require_back_of_id: false,
  max_verification_attempts: 3,
};

// ── Component ────────────────────────────────────────────────────────────────

export default function VerificationSettings() {
  // Org picker
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [selectedOrgId, setSelectedOrgId] = useState('');
  const [loadingOrgs, setLoadingOrgs] = useState(true);

  // Threshold data
  const [thresholdData, setThresholdData] = useState<ThresholdData | null>(null);
  const [settings, setSettings] = useState<AdminSettings>(DEFAULT_SETTINGS);
  const [loadingThresholds, setLoadingThresholds] = useState(false);

  // Preview
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const previewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Actions
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);

  // Feedback
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Track whether settings have been modified from loaded values
  const [dirty, setDirty] = useState(false);

  // ── Load organizations ───────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;

    async function loadOrgs() {
      try {
        const data = await platformApi.listOrganizations();
        if (!cancelled) {
          setOrganizations(data.organizations);
        }
      } catch (err: any) {
        if (!cancelled) {
          setError(err.message || 'Failed to load organizations');
        }
      } finally {
        if (!cancelled) setLoadingOrgs(false);
      }
    }

    loadOrgs();
    return () => { cancelled = true; };
  }, []);

  // ── Load thresholds when org changes ─────────────────────────────────────

  useEffect(() => {
    if (!selectedOrgId) {
      setThresholdData(null);
      setSettings(DEFAULT_SETTINGS);
      setPreview(null);
      setDirty(false);
      return;
    }

    let cancelled = false;

    async function loadThresholds() {
      setLoadingThresholds(true);
      setError('');
      setPreview(null);
      setDirty(false);

      try {
        const data = await platformApi.getOrgThresholds(selectedOrgId);
        if (!cancelled) {
          setThresholdData(data);
          setSettings(data.meta.admin_settings);
        }
      } catch (err: any) {
        if (!cancelled) {
          setError(err.message || 'Failed to load thresholds');
        }
      } finally {
        if (!cancelled) setLoadingThresholds(false);
      }
    }

    loadThresholds();
    return () => { cancelled = true; };
  }, [selectedOrgId]);

  // ── Debounced preview ────────────────────────────────────────────────────

  const fetchPreview = useCallback(
    async (orgId: string, s: AdminSettings) => {
      setLoadingPreview(true);
      try {
        const data = await platformApi.previewOrgThresholds(orgId, s);
        setPreview(data);
      } catch {
        // Preview is best-effort; don't block the UI
        setPreview(null);
      } finally {
        setLoadingPreview(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (!selectedOrgId || !dirty) return;

    if (previewTimerRef.current) clearTimeout(previewTimerRef.current);

    previewTimerRef.current = setTimeout(() => {
      fetchPreview(selectedOrgId, settings);
    }, 400);

    return () => {
      if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
    };
  }, [selectedOrgId, settings, dirty, fetchPreview]);

  // ── Setting helpers ──────────────────────────────────────────────────────

  function updateSetting<K extends keyof AdminSettings>(key: K, value: AdminSettings[K]) {
    setSettings((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
    setSuccess('');
  }

  // ── Save ─────────────────────────────────────────────────────────────────

  async function handleSave() {
    if (!selectedOrgId) return;
    setSaving(true);
    setError('');
    setSuccess('');

    try {
      const data = await platformApi.updateOrgThresholds(selectedOrgId, settings);
      setThresholdData(data);
      setSettings(data.meta.admin_settings);
      setDirty(false);
      setSuccess('Thresholds saved successfully');
    } catch (err: any) {
      setError(err.message || 'Failed to save thresholds');
    } finally {
      setSaving(false);
    }
  }

  // ── Reset ────────────────────────────────────────────────────────────────

  async function handleReset() {
    if (!selectedOrgId) return;
    setResetting(true);
    setError('');
    setSuccess('');

    try {
      const data = await platformApi.resetOrgThresholds(selectedOrgId);
      setThresholdData(data);
      setSettings(data.meta.admin_settings);
      setPreview(null);
      setDirty(false);
      setSuccess('Thresholds reset to platform defaults');
    } catch (err: any) {
      setError(err.message || 'Failed to reset thresholds');
    } finally {
      setResetting(false);
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <p className={sectionLabel}>Verification Settings</p>
        <p className="text-sm text-slate-500 mt-1">
          Configure per-organization verification thresholds and feature flags
        </p>
      </div>

      {/* Feedback banners */}
      {error && (
        <div className="bg-rose-500/12 border border-rose-400/30 rounded-lg p-3 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-rose-400 shrink-0" />
          <span className={`${monoXs} text-rose-300`}>{error}</span>
        </div>
      )}

      {success && (
        <div className="bg-emerald-500/12 border border-emerald-400/30 rounded-lg p-3 flex items-center gap-2">
          <CheckCircle className="h-4 w-4 text-emerald-400 shrink-0" />
          <span className={`${monoXs} text-emerald-300`}>{success}</span>
        </div>
      )}

      {/* Organization picker */}
      <div className={`${cardSurface} p-5`}>
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-lg bg-cyan-500/15">
            <Shield className="h-5 w-5 text-cyan-400" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-100">Organization</p>
            <p className="text-xs text-slate-500">Select an organization to configure</p>
          </div>
        </div>

        <select
          value={selectedOrgId}
          onChange={(e) => setSelectedOrgId(e.target.value)}
          disabled={loadingOrgs}
          className="w-full bg-slate-800/80 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500/40 focus:border-cyan-500/40 transition-colors appearance-none cursor-pointer disabled:opacity-50"
        >
          <option value="">
            {loadingOrgs ? 'Loading organizations...' : '-- Select organization --'}
          </option>
          {organizations.map((org) => (
            <option key={org.id} value={org.id}>
              {org.name} ({org.slug})
            </option>
          ))}
        </select>
      </div>

      {/* Loading state */}
      {loadingThresholds && (
        <div className={`${cardSurface} p-8 flex items-center justify-center`}>
          <RefreshCw className="h-5 w-5 text-cyan-400 animate-spin" />
          <span className={`${monoSm} text-slate-400 ml-3`}>Loading thresholds...</span>
        </div>
      )}

      {/* Main settings — only visible when an org is selected and loaded */}
      {selectedOrgId && thresholdData && !loadingThresholds && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* ── Left column: sliders + toggles ─────────────────────────────── */}
          <div className="lg:col-span-2 space-y-6">
            {/* Using defaults badge */}
            {thresholdData.meta.using_defaults && (
              <div className="bg-amber-500/10 border border-amber-400/20 rounded-lg px-4 py-2.5 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />
                <span className={`${monoXs} text-amber-300`}>
                  This organization is using platform defaults. Changes will create a custom override.
                </span>
              </div>
            )}

            {/* Threshold sliders */}
            <div className={`${cardSurface} p-5 space-y-6`}>
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-cyan-500/15">
                  <SlidersHorizontal className="h-5 w-5 text-cyan-400" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-100">Decision Thresholds</p>
                  <p className="text-xs text-slate-500">
                    Control automatic approval and manual review boundaries
                  </p>
                </div>
              </div>

              {/* Auto-approve threshold */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className={sectionLabel}>Auto-approve threshold</label>
                  <span className={`${monoSm} text-cyan-400 font-bold`}>
                    {settings.auto_approve_threshold}%
                  </span>
                </div>
                <input
                  type="range"
                  min={70}
                  max={95}
                  step={1}
                  value={settings.auto_approve_threshold}
                  onChange={(e) =>
                    updateSetting('auto_approve_threshold', Number(e.target.value))
                  }
                  className="w-full h-2 rounded-full appearance-none cursor-pointer bg-slate-700 accent-cyan-500"
                />
                <div className="flex justify-between">
                  <span className={`${monoXs} text-slate-600`}>70%</span>
                  <span className={`${monoXs} text-slate-600`}>95%</span>
                </div>
                <p className="text-xs text-slate-500">
                  Verifications scoring above this threshold are approved automatically
                </p>
              </div>

              {/* Manual review threshold */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className={sectionLabel}>Manual review threshold</label>
                  <span className={`${monoSm} text-amber-400 font-bold`}>
                    {settings.manual_review_threshold}%
                  </span>
                </div>
                <input
                  type="range"
                  min={30}
                  max={80}
                  step={1}
                  value={settings.manual_review_threshold}
                  onChange={(e) =>
                    updateSetting('manual_review_threshold', Number(e.target.value))
                  }
                  className="w-full h-2 rounded-full appearance-none cursor-pointer bg-slate-700 accent-amber-500"
                />
                <div className="flex justify-between">
                  <span className={`${monoXs} text-slate-600`}>30%</span>
                  <span className={`${monoXs} text-slate-600`}>80%</span>
                </div>
                <p className="text-xs text-slate-500">
                  Verifications scoring between this and auto-approve go to manual review.
                  Below this threshold, verifications are rejected automatically.
                </p>
              </div>

              {/* Threshold validation warning */}
              {settings.manual_review_threshold >= settings.auto_approve_threshold && (
                <div className="bg-rose-500/10 border border-rose-400/20 rounded-lg px-4 py-2.5 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-rose-400 shrink-0" />
                  <span className={`${monoXs} text-rose-300`}>
                    Manual review threshold must be lower than auto-approve threshold
                  </span>
                </div>
              )}
            </div>

            {/* Feature toggles */}
            <div className={`${cardSurface} p-5 space-y-5`}>
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-cyan-500/15">
                  <Shield className="h-5 w-5 text-cyan-400" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-100">Feature Flags</p>
                  <p className="text-xs text-slate-500">
                    Toggle verification requirements for this organization
                  </p>
                </div>
              </div>

              {/* Liveness detection toggle */}
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-200">Liveness Detection</p>
                  <p className="text-xs text-slate-500">
                    Require real-time liveness check during live capture
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={settings.require_liveness}
                  onClick={() => updateSetting('require_liveness', !settings.require_liveness)}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-cyan-500/40 ${
                    settings.require_liveness ? 'bg-cyan-500' : 'bg-slate-700'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transform transition-transform duration-200 ${
                      settings.require_liveness ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {/* Back of ID toggle */}
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-200">Back of ID Required</p>
                  <p className="text-xs text-slate-500">
                    Require back-of-document capture for cross-validation
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={settings.require_back_of_id}
                  onClick={() => updateSetting('require_back_of_id', !settings.require_back_of_id)}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-cyan-500/40 ${
                    settings.require_back_of_id ? 'bg-cyan-500' : 'bg-slate-700'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transform transition-transform duration-200 ${
                      settings.require_back_of_id ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {/* Max attempts */}
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-200">Max Verification Attempts</p>
                  <p className="text-xs text-slate-500">
                    Maximum retries before permanently failing a session
                  </p>
                </div>
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={settings.max_verification_attempts}
                  onChange={(e) => {
                    const v = Math.max(1, Math.min(10, Number(e.target.value) || 1));
                    updateSetting('max_verification_attempts', v);
                  }}
                  className="w-20 bg-slate-800/80 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-slate-200 text-center focus:outline-none focus:ring-2 focus:ring-cyan-500/40 focus:border-cyan-500/40 transition-colors"
                />
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-3">
              <button
                onClick={handleSave}
                disabled={
                  saving ||
                  !dirty ||
                  settings.manual_review_threshold >= settings.auto_approve_threshold
                }
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-sm font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {saving ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                {saving ? 'Saving...' : 'Save Changes'}
              </button>

              <button
                onClick={handleReset}
                disabled={resetting}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-white/10 text-slate-300 text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {resetting ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                {resetting ? 'Resetting...' : 'Reset to Defaults'}
              </button>
            </div>
          </div>

          {/* ── Right column: live preview ─────────────────────────────────── */}
          <div className="space-y-6">
            {/* Current thresholds summary */}
            <div className={`${cardSurface} p-5 space-y-4`}>
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-cyan-500/15">
                  <Eye className="h-5 w-5 text-cyan-400" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-100">Live Preview</p>
                  <p className="text-xs text-slate-500">
                    {loadingPreview ? 'Computing...' : 'Predicted threshold impact'}
                  </p>
                </div>
              </div>

              {/* Loading indicator */}
              {loadingPreview && (
                <div className="flex items-center justify-center py-4">
                  <RefreshCw className="h-4 w-4 text-cyan-400 animate-spin" />
                  <span className={`${monoXs} text-slate-500 ml-2`}>Generating preview...</span>
                </div>
              )}

              {/* Preview results */}
              {!loadingPreview && preview && (
                <div className="space-y-4">
                  {/* Production thresholds */}
                  <div className={infoPanel}>
                    <p className={sectionLabel}>Production</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <p className={`${monoXs} text-slate-500`}>Face matching</p>
                        <p className={`${monoSm} text-emerald-400 font-bold`}>
                          {preview.preview.production.face_matching}%
                        </p>
                      </div>
                      <div>
                        <p className={`${monoXs} text-slate-500`}>Liveness</p>
                        <p className={`${monoSm} text-emerald-400 font-bold`}>
                          {preview.preview.production.liveness}%
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Sandbox thresholds */}
                  <div className={infoPanel}>
                    <p className={sectionLabel}>Sandbox</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <p className={`${monoXs} text-slate-500`}>Face matching</p>
                        <p className={`${monoSm} text-amber-400 font-bold`}>
                          {preview.preview.sandbox.face_matching}%
                        </p>
                      </div>
                      <div>
                        <p className={`${monoXs} text-slate-500`}>Liveness</p>
                        <p className={`${monoSm} text-amber-400 font-bold`}>
                          {preview.preview.sandbox.liveness}%
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Explanations */}
                  <div className={infoPanel}>
                    <p className={sectionLabel}>Impact Explanation</p>
                    <div className="space-y-2">
                      {Object.entries(preview.explanation).map(([key, text]) => (
                        <div key={key} className="flex items-start gap-2">
                          <CheckCircle className="h-3.5 w-3.5 text-cyan-400 mt-0.5 shrink-0" />
                          <p className={`${monoXs} text-slate-400`}>{text}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Idle state — no preview yet */}
              {!loadingPreview && !preview && dirty && (
                <div className="py-4 text-center">
                  <p className={`${monoXs} text-slate-600`}>
                    Adjust settings to see a live preview
                  </p>
                </div>
              )}

              {!loadingPreview && !preview && !dirty && (
                <div className={infoPanel}>
                  <p className={sectionLabel}>Current Values</p>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className={`${monoXs} text-slate-500`}>Auto-approve</span>
                      <span className={`${monoXs} text-cyan-400`}>
                        {settings.auto_approve_threshold}%
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className={`${monoXs} text-slate-500`}>Manual review</span>
                      <span className={`${monoXs} text-amber-400`}>
                        {settings.manual_review_threshold}%
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className={`${monoXs} text-slate-500`}>Liveness</span>
                      <span className={`${monoXs} text-slate-300`}>
                        {settings.require_liveness ? 'Required' : 'Optional'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className={`${monoXs} text-slate-500`}>Back of ID</span>
                      <span className={`${monoXs} text-slate-300`}>
                        {settings.require_back_of_id ? 'Required' : 'Optional'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className={`${monoXs} text-slate-500`}>Max attempts</span>
                      <span className={`${monoXs} text-slate-300`}>
                        {settings.max_verification_attempts}
                      </span>
                    </div>
                  </div>

                  {thresholdData.meta.last_updated && (
                    <p className={`${monoXs} text-slate-600 pt-2 border-t border-white/5`}>
                      Last updated:{' '}
                      {new Date(thresholdData.meta.last_updated).toLocaleString()}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Empty state — no org selected */}
      {!selectedOrgId && !loadingOrgs && (
        <div className={`${cardSurface} p-12 text-center`}>
          <SlidersHorizontal className="h-10 w-10 text-slate-600 mx-auto mb-3" />
          <p className="text-sm text-slate-400">
            Select an organization above to view and configure its verification settings
          </p>
        </div>
      )}
    </div>
  );
}
