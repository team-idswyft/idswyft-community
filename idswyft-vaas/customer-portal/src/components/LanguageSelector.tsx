import React, { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { supportedLanguages } from '../i18n/config';

const FLAG_EMOJI: Record<string, string> = {
  US: '\u{1F1FA}\u{1F1F8}',
  ES: '\u{1F1EA}\u{1F1F8}',
  FR: '\u{1F1EB}\u{1F1F7}',
  BR: '\u{1F1E7}\u{1F1F7}',
  DE: '\u{1F1E9}\u{1F1EA}',
  JP: '\u{1F1EF}\u{1F1F5}',
};

interface LanguageSelectorProps {
  /** 'dark' for dark-themed pages, 'light' for light backgrounds */
  variant?: 'dark' | 'light';
}

const LanguageSelector: React.FC<LanguageSelectorProps> = ({ variant = 'dark' }) => {
  const { i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const currentLang = supportedLanguages.find(l => l.code === i18n.language)
    || supportedLanguages.find(l => i18n.language.startsWith(l.code))
    || supportedLanguages[0];

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const switchLanguage = (code: string) => {
    i18n.changeLanguage(code);
    setOpen(false);
  };

  const isDark = variant === 'dark';

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        onClick={() => setOpen(!open)}
        aria-label="Change language"
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '5px 10px', borderRadius: 8,
          border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.12)'}`,
          background: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)',
          color: isDark ? 'rgba(232,244,248,0.7)' : '#444',
          fontSize: 12, fontFamily: "'JetBrains Mono', monospace",
          cursor: 'pointer', transition: 'all 0.15s',
        }}
      >
        <span style={{ fontSize: 14 }}>{FLAG_EMOJI[currentLang.flag]}</span>
        <span>{currentLang.code.toUpperCase()}</span>
        <span style={{ fontSize: 8, opacity: 0.6 }}>{open ? '\u25B2' : '\u25BC'}</span>
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: '100%', right: 0, marginTop: 4,
          minWidth: 160, borderRadius: 10, overflow: 'hidden',
          border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}`,
          background: isDark ? '#0b1220' : '#fff',
          boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
          zIndex: 100,
        }}>
          {supportedLanguages.map(lang => {
            const isActive = lang.code === currentLang.code;
            return (
              <button
                key={lang.code}
                onClick={() => switchLanguage(lang.code)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  width: '100%', padding: '9px 14px',
                  border: 'none', cursor: 'pointer',
                  background: isActive
                    ? (isDark ? 'rgba(0,212,180,0.08)' : 'rgba(59,130,246,0.08)')
                    : 'transparent',
                  color: isDark ? '#e8f4f8' : '#1a1a1a',
                  fontSize: 13, fontFamily: "'JetBrains Mono', 'Segoe UI', sans-serif",
                  textAlign: 'left',
                  transition: 'background 0.12s',
                }}
                onMouseEnter={e => {
                  if (!isActive) (e.target as HTMLElement).style.background = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)';
                }}
                onMouseLeave={e => {
                  if (!isActive) (e.target as HTMLElement).style.background = 'transparent';
                }}
              >
                <span style={{ fontSize: 16 }}>{FLAG_EMOJI[lang.flag]}</span>
                <span style={{ flex: 1 }}>{lang.name}</span>
                {isActive && <span style={{ color: isDark ? '#00d4b4' : '#3b82f6', fontSize: 12 }}>{'\u2713'}</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default LanguageSelector;
