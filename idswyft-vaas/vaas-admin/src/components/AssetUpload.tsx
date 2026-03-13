import React, { useRef, useState } from 'react';
import { sectionLabel, monoXs, cardSurface } from '../styles/tokens';

interface AssetUploadProps {
  label: string;
  currentUrl: string | null | undefined;
  onUpload: (file: File) => Promise<void>;
  disabled?: boolean;
}

export function AssetUpload({ label, currentUrl, onUpload, disabled }: AssetUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const allowedTypes = ['image/png', 'image/jpeg', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      setError('Only PNG, JPG, and WebP files are accepted');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setError('File must be under 2MB');
      return;
    }

    setError(null);
    setUploading(true);
    try {
      await onUpload(file);
    } catch (err: any) {
      setError(err.message || 'Upload failed');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div className={`${cardSurface} p-4 flex flex-col gap-3`}>
      {/* Preview */}
      <div className="w-full h-24 bg-slate-900/40 border border-white/10 rounded-lg flex items-center justify-center overflow-hidden">
        {currentUrl ? (
          <img
            src={currentUrl}
            alt={label}
            className="max-h-full max-w-full object-contain"
          />
        ) : (
          <span className={`${monoXs} text-slate-500`}>No image set</span>
        )}
      </div>

      {/* Label + upload button */}
      <div className="flex items-center justify-between">
        <span className={sectionLabel}>{label}</span>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={disabled || uploading}
          className="bg-cyan-500/20 border border-cyan-400/40 text-cyan-200 hover:bg-cyan-500/30 font-mono text-sm rounded-lg transition-colors px-3 py-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {uploading ? 'Uploading\u2026' : 'Upload'}
        </button>
      </div>

      {/* Format hint */}
      <p className={`${monoXs} text-slate-500`}>PNG, JPG, WebP &middot; Max 2MB</p>

      {/* Error */}
      {error && <p className={`${monoXs} text-red-400`}>{error}</p>}

      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        onChange={handleFileChange}
        className="hidden"
      />
    </div>
  );
}
