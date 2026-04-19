/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        paper:  'var(--paper)',
        ink:    'var(--ink)',
        mid:    'var(--mid)',
        soft:   'var(--soft)',
        rule:   'var(--rule)',
        'rule-strong': 'var(--rule-strong)',
        panel:  'var(--panel)',
        accent: {
          DEFAULT: 'var(--accent)',
          ink:     'var(--accent-ink)',
          soft:    'var(--accent-soft)',
        },
        flag: {
          DEFAULT: 'var(--flag)',
          soft:    'var(--flag-soft)',
        },
        primary: {
          50:  '#eff6ff',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
          800: '#1e40af',
        },
        success: {
          50:  '#f0fdf4',
          100: '#dcfce7',
          500: '#22c55e',
          600: '#16a34a',
          700: '#15803d',
          800: '#166534',
        },
        warning: {
          50:  '#fffbeb',
          100: '#fef3c7',
          500: '#f59e0b',
          600: '#d97706',
          700: '#b45309',
          800: '#92400e',
        },
        error: {
          50:  '#fef2f2',
          100: '#fee2e2',
          500: '#ef4444',
          600: '#dc2626',
          700: '#b91c1c',
          800: '#991b1b',
        },
      },
      fontFamily: {
        sans: ['Geist', 'Inter', 'ui-sans-serif', 'system-ui'],
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      maxWidth: {
        content: '1320px',
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease-out',
        'scan': 'scan 2s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: {
          from: { opacity: '0', transform: 'translateY(6px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
        scan: {
          '0%, 100%': { top: '15%', opacity: '0.2' },
          '50%':      { top: '80%', opacity: '0.9' },
        },
      },
    },
  },
  plugins: [],
}
