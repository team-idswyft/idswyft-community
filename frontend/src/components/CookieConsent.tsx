import { useState, useEffect } from 'react'

const STORAGE_KEY = 'idswyft_cookie_consent'

export function CookieConsent() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    // Small delay so banner doesn't flash before page paint
    const t = setTimeout(() => {
      if (!localStorage.getItem(STORAGE_KEY)) setVisible(true)
    }, 800)
    return () => clearTimeout(t)
  }, [])

  if (!visible) return null

  const accept = () => {
    localStorage.setItem(STORAGE_KEY, 'accepted')
    setVisible(false)
  }

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 9999,
        background: 'rgba(11, 15, 25, 0.97)',
        backdropFilter: 'blur(16px)',
        borderTop: '1px solid rgba(255,255,255,0.07)',
        padding: '16px 24px',
        animation: 'cookieSlideUp 0.4s ease-out',
      }}
    >
      <style>{`
        @keyframes cookieSlideUp {
          from { transform: translateY(100%); opacity: 0; }
          to   { transform: translateY(0);    opacity: 1; }
        }
      `}</style>

      <div style={{
        maxWidth: 1200,
        margin: '0 auto',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 16,
        flexWrap: 'wrap',
      }}>
        <p style={{
          color: '#8896aa',
          fontSize: 13,
          lineHeight: 1.5,
          margin: 0,
          flex: '1 1 400px',
          fontFamily: '"DM Sans",system-ui,sans-serif',
        }}>
          We use cookies to improve your experience and analyze site usage.
          By continuing to use this site, you agree to our{' '}
          <a
            href="/legal#privacy"
            style={{ color: '#22d3ee', textDecoration: 'underline', textUnderlineOffset: 2 }}
          >
            Privacy Policy
          </a>.
        </p>

        <div style={{ display: 'flex', gap: 10, flexShrink: 0 }}>
          <button
            onClick={accept}
            style={{
              background: '#22d3ee',
              color: '#080c14',
              border: 'none',
              borderRadius: 8,
              padding: '8px 20px',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: '"DM Sans",system-ui,sans-serif',
              transition: 'opacity 0.2s',
            }}
            onMouseEnter={e => (e.currentTarget.style.opacity = '0.85')}
            onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
          >
            Accept
          </button>
        </div>
      </div>
    </div>
  )
}
