import React, { useState, useEffect, useCallback } from 'react';
import { Download, Upload, Eye, EyeOff, Pencil, Trash2, ChevronDown, ChevronRight, Database, Info, ShieldAlert, Server } from 'lucide-react';
import platformApi from '../services/api';
import { cardSurface, tableHeaderClass, statusPill, monoXs, monoSm, sectionLabel, infoPanel, getStatusAccent } from '../styles/tokens';

interface ConfigItem {
  key: string;
  value: string;
  category: string;
  is_secret: boolean;
  requires_restart: boolean;
  description?: string;
  updated_at: string;
}

interface AuditEntry {
  id: string;
  config_key: string;
  old_value?: string;
  new_value?: string;
  changed_by?: string;
  changed_at: string;
  change_type: string;
}

export default function Configuration() {
  const [configs, setConfigs] = useState<ConfigItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Edit modal
  const [editItem, setEditItem] = useState<ConfigItem | null>(null);
  const [editValue, setEditValue] = useState('');
  const [editCategory, setEditCategory] = useState('');
  const [editIsSecret, setEditIsSecret] = useState(false);
  const [editRequiresRestart, setEditRequiresRestart] = useState(false);
  const [editDescription, setEditDescription] = useState('');

  // Import modal
  const [showImport, setShowImport] = useState(false);
  const [importContent, setImportContent] = useState('');
  const [importResult, setImportResult] = useState<{ imported: number; skipped: number; errors: string[] } | null>(null);

  // Export
  const [showExport, setShowExport] = useState(false);
  const [includeSecrets, setIncludeSecrets] = useState(false);

  // Audit
  const [showAudit, setShowAudit] = useState(false);
  const [audits, setAudits] = useState<AuditEntry[]>([]);

  // Collapsible categories
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());

  // Secret visibility
  const [visibleSecrets, setVisibleSecrets] = useState<Set<string>>(new Set());
  const [revealedValues, setRevealedValues] = useState<Record<string, string>>({});

  const fetchConfigs = useCallback(async () => {
    setLoading(true);
    try {
      const data = await platformApi.listConfig();
      setConfigs(data);
    } catch (err: any) {
      setToast({ message: err.message, type: 'error' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchConfigs(); }, [fetchConfigs]);

  // Auto-dismiss toast after 5s
  useEffect(() => {
    if (toast) { const t = setTimeout(() => setToast(null), 5000); return () => clearTimeout(t); }
  }, [toast]);

  // Group by service → category
  const SERVICE_ORDER = ['VaaS', 'Main API', 'Platform Admin', 'VaaS Admin'];
  const SERVICE_LABELS: Record<string, string> = {
    'VaaS': 'VaaS Backend',
    'Main API': 'Main API',
    'Platform Admin': 'Platform Admin',
    'VaaS Admin': 'VaaS Admin (Org Portal)',
  };

  const getService = (category: string): string => {
    if (category.startsWith('Main API')) return 'Main API';
    if (category.startsWith('Platform Admin')) return 'Platform Admin';
    if (category.startsWith('VaaS Admin')) return 'VaaS Admin';
    if (category.startsWith('VaaS')) return 'VaaS';
    return 'Other';
  };

  const getSubcategory = (category: string): string => {
    const service = getService(category);
    const sub = category.slice(service.length).trim();
    return sub || 'General';
  };

  // Build: { service: { subcategory: ConfigItem[] } }
  const serviceGroups = configs.reduce<Record<string, Record<string, ConfigItem[]>>>((acc, item) => {
    const svc = getService(item.category);
    const sub = getSubcategory(item.category);
    if (!acc[svc]) acc[svc] = {};
    if (!acc[svc][sub]) acc[svc][sub] = [];
    acc[svc][sub].push(item);
    return acc;
  }, {});

  const sortedServices = [...SERVICE_ORDER.filter((s) => serviceGroups[s]), ...Object.keys(serviceGroups).filter((s) => !SERVICE_ORDER.includes(s))];

  const toggleCategory = (cat: string) => {
    setCollapsedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat); else next.add(cat);
      return next;
    });
  };

  const openEditModal = (item: ConfigItem) => {
    setEditItem(item);
    setEditValue(item.is_secret ? '' : item.value);
    setEditCategory(item.category);
    setEditIsSecret(item.is_secret);
    setEditRequiresRestart(item.requires_restart);
    setEditDescription(item.description || '');
  };

  const handleSave = async () => {
    if (!editItem) return;
    try {
      await platformApi.setConfigValue(editItem.key, {
        value: editValue,
        category: editCategory,
        is_secret: editIsSecret,
        requires_restart: editRequiresRestart,
        description: editDescription,
      });
      setToast({ message: `"${editItem.key}" updated`, type: 'success' });
      setEditItem(null);
      fetchConfigs();
    } catch (err: any) {
      setToast({ message: err.message, type: 'error' });
    }
  };

  const handleDelete = async (key: string) => {
    if (!confirm(`Delete config key "${key}"?`)) return;
    try {
      await platformApi.deleteConfigKey(key);
      setToast({ message: `"${key}" deleted`, type: 'success' });
      fetchConfigs();
    } catch (err: any) {
      setToast({ message: err.message, type: 'error' });
    }
  };

  const handleExport = async (format: 'env' | 'json') => {
    try {
      if (format === 'env') {
        const content = await platformApi.exportConfigEnv(includeSecrets);
        const blob = new Blob([content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = 'platform-config.env'; a.click();
        URL.revokeObjectURL(url);
      } else {
        const data = await platformApi.exportConfigJson(includeSecrets);
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = 'platform-config.json'; a.click();
        URL.revokeObjectURL(url);
      }
      setShowExport(false);
      setToast({ message: `Exported as ${format}`, type: 'success' });
    } catch (err: any) {
      setToast({ message: err.message, type: 'error' });
    }
  };

  const handleImport = async () => {
    try {
      const result = await platformApi.importConfig(importContent);
      setImportResult(result);
      fetchConfigs();
    } catch (err: any) {
      setToast({ message: err.message, type: 'error' });
    }
  };

  const handleSeedDefaults = async () => {
    try {
      await platformApi.seedConfigDefaults();
      setToast({ message: 'Config seeded from environment', type: 'success' });
      fetchConfigs();
    } catch (err: any) {
      setToast({ message: err.message, type: 'error' });
    }
  };

  const fetchAudit = async () => {
    if (showAudit) { setShowAudit(false); return; }
    try {
      const { audits: data } = await platformApi.getConfigAudit({ per_page: 50 });
      setAudits(data);
      setShowAudit(true);
    } catch (err: any) {
      setToast({ message: err.message, type: 'error' });
    }
  };

  const toggleSecretVisibility = async (key: string) => {
    if (visibleSecrets.has(key)) {
      setVisibleSecrets((prev) => { const s = new Set(prev); s.delete(key); return s; });
      return;
    }
    try {
      const { value } = await platformApi.getConfigValue(key);
      setRevealedValues((prev) => ({ ...prev, [key]: value }));
      setVisibleSecrets((prev) => new Set(prev).add(key));
    } catch {
      setToast({ message: 'Failed to reveal value', type: 'error' });
    }
  };

  const formatDate = (d: string) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

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
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-semibold text-slate-100">Platform Configuration</h2>
          <p className="mt-1 text-sm text-slate-400">Manage runtime configuration values and secrets</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <button
              onClick={() => setShowExport(!showExport)}
              className="flex items-center gap-2 rounded-lg border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-slate-300 transition hover:border-cyan-400/40"
            >
              <Download className="h-4 w-4" /> Export
            </button>
            {showExport && (
              <div className="absolute right-0 top-full z-30 mt-1 w-56 rounded-lg border border-white/10 bg-slate-900/95 p-3 shadow-2xl backdrop-blur-xl">
                <div className="flex items-center gap-2 mb-2">
                  <input
                    type="checkbox"
                    checked={includeSecrets}
                    onChange={(e) => setIncludeSecrets(e.target.checked)}
                    className="rounded border-white/20 bg-slate-800 text-cyan-400"
                  />
                  <span className="text-xs text-amber-300">Include secrets</span>
                </div>
                <button onClick={() => handleExport('env')} className="block w-full text-left rounded-md px-3 py-1.5 text-sm text-slate-300 hover:bg-white/10">
                  Export as .env
                </button>
                <button onClick={() => handleExport('json')} className="block w-full text-left rounded-md px-3 py-1.5 text-sm text-slate-300 hover:bg-white/10">
                  Export as JSON
                </button>
              </div>
            )}
          </div>
          <button
            onClick={() => { setShowImport(true); setImportContent(''); setImportResult(null); }}
            className="flex items-center gap-2 rounded-lg border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-slate-300 transition hover:border-cyan-400/40"
          >
            <Upload className="h-4 w-4" /> Import
          </button>
          <button
            onClick={handleSeedDefaults}
            className="flex items-center gap-2 rounded-lg border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-slate-300 transition hover:border-cyan-400/40"
          >
            <Database className="h-4 w-4" /> Seed Defaults
          </button>
        </div>
      </div>

      {/* Encryption key notice */}
      <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-5 py-4">
        <div className="flex items-start gap-3">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
          <div className="space-y-2 text-sm">
            <p className="font-medium text-amber-200">Encryption Key &mdash; <code className={`${monoXs} text-amber-300`}>VAAS_CONFIG_ENCRYPTION_KEY</code></p>
            <p className="text-slate-400">
              All secret config values are encrypted at rest using AES-256-GCM, derived from the <code className={`${monoXs} text-slate-300`}>VAAS_CONFIG_ENCRYPTION_KEY</code> environment variable.
              If you need to rotate this key:
            </p>
            <ol className="list-decimal list-inside space-y-1 text-slate-400">
              <li><strong className="text-slate-300">Export</strong> all secrets first &mdash; use the Export button above with "Include secrets" checked</li>
              <li><strong className="text-slate-300">Set the new key</strong> on your hosting provider (e.g. Railway env var)</li>
              <li><strong className="text-slate-300">Re-import</strong> the exported file after the service restarts with the new key</li>
            </ol>
            <p className="text-rose-400/80 text-xs">
              Changing the key without exporting first will make all existing encrypted values unreadable.
            </p>
          </div>
        </div>
      </div>

      {/* Config grouped by service → category */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-cyan-400 border-t-transparent" />
        </div>
      ) : sortedServices.length === 0 ? (
        <div className={cardSurface}>
          <div className="py-16 text-center text-sm text-slate-500">
            No config values found. Click "Seed Defaults" to populate from environment variables.
          </div>
        </div>
      ) : (
        sortedServices.map((service) => {
          const subcategories = serviceGroups[service];
          const totalKeys = Object.values(subcategories).reduce((sum, arr) => sum + arr.length, 0);

          return (
            <div key={service} className="space-y-2">
              {/* Service header */}
              <div className="flex items-center gap-2 pt-2">
                <Server className="h-4 w-4 text-cyan-400" />
                <h3 className="text-sm font-semibold text-slate-200">{SERVICE_LABELS[service] || service}</h3>
                <span className={`${monoXs} text-slate-500`}>{totalKeys} keys</span>
              </div>

              {/* Subcategory cards */}
              {Object.entries(subcategories).map(([subcategory, items]) => {
                const catKey = `${service}:${subcategory}`;
                const isCollapsed = collapsedCategories.has(catKey);
                return (
                  <div key={catKey} className={cardSurface}>
                    <button
                      onClick={() => toggleCategory(catKey)}
                      className="flex w-full items-center justify-between px-5 py-3 border-b border-white/10 hover:bg-white/5 transition"
                    >
                      <span className={`${sectionLabel} text-slate-400`}>{subcategory}</span>
                      <div className="flex items-center gap-2">
                        <span className={`${monoXs} text-slate-500`}>{items.length} keys</span>
                        {isCollapsed ? <ChevronRight className="h-4 w-4 text-slate-500" /> : <ChevronDown className="h-4 w-4 text-slate-500" />}
                      </div>
                    </button>

                    {!isCollapsed && (
                      <div className="divide-y divide-white/5">
                        {items.map((item) => (
                          <div key={item.key} className="flex items-center gap-4 px-5 py-3 hover:bg-white/5 transition">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className={`${monoSm} text-slate-200`}>{item.key}</span>
                                {item.description && (
                                  <span className="group relative">
                                    <Info className="h-3.5 w-3.5 text-slate-500 cursor-help" />
                                    <span className="pointer-events-none absolute bottom-full left-1/2 z-40 mb-2 -translate-x-1/2 whitespace-nowrap rounded-lg border border-white/10 bg-slate-800 px-3 py-2 text-xs text-slate-300 opacity-0 shadow-xl transition-opacity group-hover:opacity-100">
                                      {item.description}
                                    </span>
                                  </span>
                                )}
                                {item.is_secret && (
                                  <span className={`${statusPill} bg-amber-500/15 text-amber-300 border-amber-500/30`}>secret</span>
                                )}
                                {item.requires_restart && (
                                  <span className={`${statusPill} bg-orange-500/15 text-orange-300 border-orange-500/30`}>restart</span>
                                )}
                              </div>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              {item.is_secret ? (
                                <div className="flex items-center gap-1">
                                  <span className={`${monoXs} text-slate-500`}>
                                    {visibleSecrets.has(item.key) ? revealedValues[item.key] || '' : '••••••••'}
                                  </span>
                                  <button
                                    onClick={() => toggleSecretVisibility(item.key)}
                                    className="rounded-md p-1 text-slate-400 hover:bg-white/10 hover:text-slate-200"
                                  >
                                    {visibleSecrets.has(item.key) ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                                  </button>
                                </div>
                              ) : (
                                <span className={`${monoXs} text-slate-400 max-w-xs truncate`}>{item.value}</span>
                              )}

                              <button
                                onClick={() => openEditModal(item)}
                                className="rounded-md p-1 text-slate-400 hover:bg-white/10 hover:text-slate-200"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                              <button
                                onClick={() => handleDelete(item.key)}
                                className="rounded-md p-1 text-slate-400 hover:bg-rose-500/10 hover:text-rose-400"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })
      )}

      {/* Audit history toggle */}
      <button
        onClick={fetchAudit}
        className="flex items-center gap-2 text-sm text-slate-400 hover:text-cyan-400 transition"
      >
        {showAudit ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        Config Audit History
      </button>

      {showAudit && (
        <div className={cardSurface}>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/10">
                  <th className={tableHeaderClass}>Time</th>
                  <th className={tableHeaderClass}>Key</th>
                  <th className={tableHeaderClass}>Change</th>
                  <th className={tableHeaderClass}>Old</th>
                  <th className={tableHeaderClass}>New</th>
                </tr>
              </thead>
              <tbody>
                {audits.map((a) => (
                  <tr key={a.id} className="border-b border-white/5">
                    <td className="px-5 py-2"><span className={`${monoXs} text-slate-500`}>{formatDate(a.changed_at)}</span></td>
                    <td className="px-5 py-2"><span className={`${monoXs} text-slate-300`}>{a.config_key}</span></td>
                    <td className="px-5 py-2"><span className={`${statusPill} ${getStatusAccent(a.change_type === 'delete' ? 'error' : a.change_type === 'create' ? 'success' : 'info').pill}`}>{a.change_type}</span></td>
                    <td className="px-5 py-2"><span className={`${monoXs} text-slate-500`}>{a.old_value || '—'}</span></td>
                    <td className="px-5 py-2"><span className={`${monoXs} text-slate-400`}>{a.new_value || '—'}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-xl border border-white/10 bg-slate-900 p-6 shadow-2xl">
            <h3 className="text-lg font-semibold text-slate-100 mb-4">Edit Config</h3>

            <div className="space-y-4">
              <div>
                <label className={`${sectionLabel} block mb-1`}>Key</label>
                <input value={editItem.key} readOnly className={`${inputClass} opacity-60`} />
              </div>
              <div>
                <label className={`${sectionLabel} block mb-1`}>Value</label>
                <input
                  type={editIsSecret ? 'password' : 'text'}
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  className={inputClass}
                  placeholder={editItem.is_secret ? 'Enter new value...' : ''}
                />
              </div>
              <div>
                <label className={`${sectionLabel} block mb-1`}>Category</label>
                <input value={editCategory} onChange={(e) => setEditCategory(e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className={`${sectionLabel} block mb-1`}>Description</label>
                <input value={editDescription} onChange={(e) => setEditDescription(e.target.value)} className={inputClass} />
              </div>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 text-sm text-slate-300">
                  <input type="checkbox" checked={editIsSecret} onChange={(e) => setEditIsSecret(e.target.checked)} className="rounded border-white/20 bg-slate-800 text-cyan-400" />
                  Secret
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-300">
                  <input type="checkbox" checked={editRequiresRestart} onChange={(e) => setEditRequiresRestart(e.target.checked)} className="rounded border-white/20 bg-slate-800 text-cyan-400" />
                  Requires restart
                </label>
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setEditItem(null)} className="rounded-lg border border-white/10 px-4 py-2 text-sm text-slate-400 hover:text-slate-200">
                Cancel
              </button>
              <button onClick={handleSave} className="rounded-lg bg-cyan-500/20 border border-cyan-500/30 px-4 py-2 text-sm font-medium text-cyan-200 hover:bg-cyan-500/30">
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Import Modal */}
      {showImport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-xl border border-white/10 bg-slate-900 p-6 shadow-2xl">
            <h3 className="text-lg font-semibold text-slate-100 mb-4">Import Configuration</h3>

            <div className="space-y-4">
              <div>
                <label className={`${sectionLabel} block mb-1`}>Paste .env content</label>
                <textarea
                  value={importContent}
                  onChange={(e) => setImportContent(e.target.value)}
                  className={`${inputClass} min-h-[200px] font-mono text-xs`}
                  placeholder={"# Category\nKEY=value\nANOTHER_KEY=another_value"}
                />
              </div>

              {importResult && (
                <div className={infoPanel}>
                  <div className="text-sm text-slate-200">
                    Imported: <strong className="text-emerald-300">{importResult.imported}</strong>,
                    Skipped: <strong className="text-amber-300">{importResult.skipped}</strong>
                  </div>
                  {importResult.errors.length > 0 && (
                    <div className="mt-2 text-xs text-rose-400">
                      {importResult.errors.map((e, i) => <div key={i}>{e}</div>)}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setShowImport(false)} className="rounded-lg border border-white/10 px-4 py-2 text-sm text-slate-400 hover:text-slate-200">
                Close
              </button>
              <button onClick={handleImport} className="rounded-lg bg-cyan-500/20 border border-cyan-500/30 px-4 py-2 text-sm font-medium text-cyan-200 hover:bg-cyan-500/30">
                Import
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
