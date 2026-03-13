import React, { useState, useEffect, useRef } from 'react';
import { Upload, Image, X } from 'lucide-react';
import { platformApi } from '../services/api';
import {
  sectionLabel,
  monoXs,
  monoSm,
  cardSurface,
} from '../styles/tokens';

interface BrandingAssets {
  logo_url: string | null;
  favicon_url: string | null;
  email_banner_url: string | null;
}

interface AssetSection {
  key: string;
  label: string;
  description: string;
  url: string | null;
}

export default function Branding() {
  const [branding, setBranding] = useState<BrandingAssets>({
    logo_url: null,
    favicon_url: null,
    email_banner_url: null,
  });
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState<Record<string, boolean>>({});
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const logoRef = useRef<HTMLInputElement>(null);
  const faviconRef = useRef<HTMLInputElement>(null);
  const emailBannerRef = useRef<HTMLInputElement>(null);

  const fileRefs: Record<string, React.RefObject<HTMLInputElement | null>> = {
    logo: logoRef,
    favicon: faviconRef,
    'email-banner': emailBannerRef,
  };

  useEffect(() => {
    fetchBranding();
  }, []);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  async function fetchBranding() {
    try {
      const data = await platformApi.getBranding();
      setBranding({
        logo_url: data.logo_url || null,
        favicon_url: data.favicon_url || null,
        email_banner_url: data.email_banner_url || null,
      });
    } catch (err) {
      console.error('Failed to load branding:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleUpload(assetType: string) {
    const ref = fileRefs[assetType];
    const file = ref?.current?.files?.[0];
    if (!file) return;

    setUploading((prev) => ({ ...prev, [assetType]: true }));

    try {
      const result = await platformApi.uploadBrandingAsset(assetType, file);
      const urlKey = `${assetType.replace('-', '_')}_url` as keyof BrandingAssets;
      setBranding((prev) => ({ ...prev, [urlKey]: result.url || result[urlKey] || prev[urlKey] }));
      setToast({ type: 'success', message: `${assetType} uploaded successfully` });
      if (ref.current) ref.current.value = '';
    } catch (err: any) {
      setToast({ type: 'error', message: err.message || `Failed to upload ${assetType}` });
    } finally {
      setUploading((prev) => ({ ...prev, [assetType]: false }));
    }
  }

  const assetSections: AssetSection[] = [
    { key: 'logo', label: 'Platform Logo', description: 'Main logo displayed across the platform', url: branding.logo_url },
    { key: 'favicon', label: 'Favicon', description: 'Browser tab icon (recommended: 32x32 or 64x64 PNG)', url: branding.favicon_url },
    { key: 'email-banner', label: 'Email Banner', description: 'Banner image used in email templates', url: branding.email_banner_url },
  ];

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
        <p className={sectionLabel}>Platform Branding</p>
        <p className="text-sm text-slate-500 mt-1">
          Manage your platform logo, favicon, and email banner assets
        </p>
      </div>

      {/* Toast */}
      {toast && (
        <div
          className={`rounded-lg p-4 flex items-center justify-between animate-slide-in-up ${
            toast.type === 'success'
              ? 'bg-emerald-500/12 border border-emerald-400/30'
              : 'bg-rose-500/12 border border-rose-400/30'
          }`}
        >
          <span className={`${monoXs} ${toast.type === 'success' ? 'text-emerald-300' : 'text-rose-300'}`}>
            {toast.message}
          </span>
          <button onClick={() => setToast(null)} className="text-slate-400 hover:text-slate-200">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Asset Sections */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {assetSections.map((section) => (
          <div key={section.key} className={`${cardSurface} p-5 space-y-4`}>
            <div>
              <p className={`${sectionLabel} mb-1`}>{section.label}</p>
              <p className="text-xs text-slate-500">{section.description}</p>
            </div>

            {/* Preview */}
            <div className="flex items-center justify-center h-32 rounded-lg bg-slate-950/60 border border-white/5 overflow-hidden">
              {section.url ? (
                <img
                  src={section.url}
                  alt={section.label}
                  className="max-h-full max-w-full object-contain"
                />
              ) : (
                <div className="flex flex-col items-center gap-2 text-slate-600">
                  <Image className="h-8 w-8" />
                  <span className={monoXs}>No asset</span>
                </div>
              )}
            </div>

            {/* Upload */}
            <div className="flex items-center gap-2">
              <input
                ref={fileRefs[section.key]}
                type="file"
                accept="image/*"
                className="hidden"
                id={`file-${section.key}`}
                onChange={() => handleUpload(section.key)}
              />
              <label
                htmlFor={`file-${section.key}`}
                className="btn btn-ghost text-sm flex-1 cursor-pointer text-center"
              >
                Choose File
              </label>
              <button
                onClick={() => handleUpload(section.key)}
                disabled={uploading[section.key]}
                className="btn btn-primary text-sm"
              >
                <Upload className="h-4 w-4" />
                {uploading[section.key] ? 'Uploading...' : 'Upload'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
