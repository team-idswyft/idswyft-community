import { ReactNode, useState, useCallback } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { clsx } from 'clsx'
import { isCommunity } from '../../config/edition'
import { CookieConsent } from '../CookieConsent'
import { toggleTheme, getTheme } from '../../theme'

interface LayoutProps {
  children: ReactNode
}

const getGitHubUrl = () => 'https://github.com/team-idswyft/idswyft-community'

// Cloud navigation — v2 uses mono-font text links, no icons
const cloudNavigation = [
  { name: 'Home', href: '/' },
  { name: 'Developer', href: '/developer' },
  { name: 'Demo', href: '/demo' },
  { name: 'Docs', href: '/docs' },
  { name: 'Pricing', href: '/pricing' },
]

function ThemeToggle() {
  const [theme, setThemeState] = useState(getTheme)

  const handleToggle = useCallback(() => {
    const next = toggleTheme()
    setThemeState(next)
  }, [])

  return (
    <button
      onClick={handleToggle}
      className="w-8 h-8 grid place-items-center border transition-colors"
      style={{ borderColor: 'var(--rule)', color: 'var(--ink)', background: 'transparent' }}
      aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
    >
      {theme === 'dark' ? (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="5" />
          <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
        </svg>
      ) : (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
        </svg>
      )}
    </button>
  )
}

export function Layout({ children }: LayoutProps) {
  const location = useLocation()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  const isAdminRoute = location.pathname.startsWith('/admin')
  const isStandaloneRoute =
    location.pathname.startsWith('/user-verification') ||
    location.pathname.startsWith('/verify/mobile') ||
    location.pathname.startsWith('/v/') ||
    location.pathname === '/developer/page-builder'

  if (isAdminRoute || isStandaloneRoute) {
    return <>{children}</>
  }

  // ─────────────────────────────────────────
  // Community edition: no navbar, minimal footer
  // ─────────────────────────────────────────
  if (isCommunity) {
    return (
      <div className="min-h-screen flex flex-col" style={{ background: 'var(--paper)', color: 'var(--ink)' }}>
        <main className="flex-1">
          {children}
        </main>

        <footer style={{ background: 'var(--panel)', borderTop: '1px solid var(--rule)' }}>
          <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
              <a href="https://idswyft.app" target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-3 hover:opacity-80 transition-opacity">
                <img src="/idswyft-logo.png" alt="Idswyft" className="h-6 w-auto" />
                <span className="mono" style={{ color: 'var(--soft)', fontSize: 13 }}>Powered by Idswyft</span>
              </a>
              <div className="flex items-center gap-6">
                {[
                  { label: 'Docs', href: '/docs' },
                  { label: 'Demo', href: '/demo' },
                  { label: 'Verify Credential', href: '/verify-credential' },
                ].map(({ label, href }) => (
                  <Link key={label} to={href}
                    className="mono hover:opacity-100 transition-opacity"
                    style={{ color: 'var(--mid)', fontSize: 12.5 }}>{label}</Link>
                ))}
                <a href={getGitHubUrl()} target="_blank" rel="noopener noreferrer"
                  className="mono hover:opacity-100 transition-opacity"
                  style={{ color: 'var(--mid)', fontSize: 12.5 }}>GitHub</a>
              </div>
            </div>
          </div>
        </footer>
      </div>
    )
  }

  // ─────────────────────────────────────────
  // Cloud edition: v2 sticky top bar + 5-col footer
  // ─────────────────────────────────────────
  return (
    <div className="min-h-screen" style={{ background: 'var(--paper)', color: 'var(--ink)' }}>
      {/* v2 Sticky Navigation */}
      <nav
        className="sticky top-0 z-50"
        style={{
          background: 'color-mix(in oklab, var(--paper) 85%, transparent)',
          backdropFilter: 'saturate(140%) blur(8px)',
          borderBottom: '1px solid var(--rule)',
        }}
      >
        <div className="flex items-center gap-8" style={{ maxWidth: 1320, margin: '0 auto', padding: '14px 32px' }}>
          {/* Logo */}
          <Link to="/" className="flex items-center flex-shrink-0">
            <img src="/idswyft-logo.png" alt="Idswyft" className="h-7 w-auto" />
          </Link>

          {/* Nav links — mono font, centered */}
          <div className="hidden lg:flex items-center gap-6 ml-auto">
            {cloudNavigation.map((item) => {
              const isActive = location.pathname === item.href ||
                (item.href !== '/' && location.pathname.startsWith(item.href))

              return (
                <Link
                  key={item.name}
                  to={item.href}
                  className="mono transition-colors"
                  style={{
                    fontSize: 12.5,
                    color: isActive ? 'var(--ink)' : 'var(--mid)',
                  }}
                  onMouseEnter={e => { if (!isActive) (e.target as HTMLElement).style.color = 'var(--ink)' }}
                  onMouseLeave={e => { if (!isActive) (e.target as HTMLElement).style.color = 'var(--mid)' }}
                >
                  {item.name}
                </Link>
              )
            })}
          </div>

          {/* Right side: GitHub + Theme Toggle + CTA */}
          <div className="flex items-center gap-3 ml-auto lg:ml-0">
            <a
              href={getGitHubUrl()}
              target="_blank"
              rel="noopener noreferrer"
              className="transition-opacity hover:opacity-100"
              style={{ color: 'var(--mid)' }}
            >
              <span className="sr-only">GitHub</span>
              <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M10 0C4.477 0 0 4.484 0 10.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0110 4.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.203 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.942.359.31.678.921.678 1.856 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0020 10.017C20 4.484 15.522 0 10 0z"
                  clipRule="evenodd"
                />
              </svg>
            </a>

            <ThemeToggle />

            <Link
              to="/developer"
              className="hidden sm:inline-flex items-center gap-1.5 mono transition-transform hover:-translate-y-px"
              style={{
                padding: '8px 14px',
                border: '1px solid var(--ink)',
                background: 'var(--ink)',
                color: 'var(--paper)',
                fontSize: 12,
                fontWeight: 500,
              }}
            >
              Start building <span aria-hidden="true">&rarr;</span>
            </Link>

            {/* Mobile menu button */}
            <button
              onClick={() => setMobileMenuOpen(prev => !prev)}
              className="lg:hidden w-8 h-8 flex items-center justify-center border"
              style={{ borderColor: 'var(--rule)', color: 'var(--ink)', background: 'transparent' }}
              aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={mobileMenuOpen}
            >
              <div className="w-4 h-4 flex flex-col justify-center items-center relative">
                <div className={clsx(
                  'w-4 h-0.5 transition-all duration-200 absolute',
                  mobileMenuOpen ? 'rotate-45' : '-translate-y-1.5'
                )} style={{ background: 'var(--ink)' }} />
                <div className={clsx(
                  'w-4 h-0.5 transition-all duration-200',
                  mobileMenuOpen ? 'opacity-0' : 'opacity-100'
                )} style={{ background: 'var(--ink)' }} />
                <div className={clsx(
                  'w-4 h-0.5 transition-all duration-200 absolute',
                  mobileMenuOpen ? '-rotate-45' : 'translate-y-1.5'
                )} style={{ background: 'var(--ink)' }} />
              </div>
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        {mobileMenuOpen && (
          <div className="lg:hidden" style={{ borderTop: '1px solid var(--rule)' }}>
            <div className="py-2" style={{ maxWidth: 1320, margin: '0 auto', padding: '8px 32px' }}>
              {cloudNavigation.map((item) => {
                const isActive = location.pathname === item.href ||
                  (item.href !== '/' && location.pathname.startsWith(item.href))

                return (
                  <Link
                    key={item.name}
                    to={item.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className="mono block py-3 transition-colors"
                    style={{
                      fontSize: 13,
                      color: isActive ? 'var(--ink)' : 'var(--mid)',
                      borderBottom: '1px solid var(--rule)',
                    }}
                  >
                    {item.name}
                  </Link>
                )
              })}
            </div>
          </div>
        )}
      </nav>

      {/* Main content — no padding-top needed, nav is sticky not fixed */}
      <main className="flex-1">
        {children}
      </main>

      {/* v2 Footer — 5 column grid */}
      <footer style={{ borderTop: '1px solid var(--rule)', padding: '40px 0' }}>
        <div style={{ maxWidth: 1320, margin: '0 auto', padding: '0 32px' }}>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-8">
            {/* Brand column */}
            <div className="col-span-2 md:col-span-1">
              <div className="mb-4">
                <img src="/idswyft-logo.png" alt="Idswyft" className="h-7 w-auto" />
              </div>
              <p className="mono" style={{ color: 'var(--mid)', fontSize: 11.5, lineHeight: 1.6 }}>
                Open-source identity verification for developers.
              </p>
            </div>

            {/* Product */}
            <div>
              <h5 className="mono" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--mid)', margin: '0 0 12px' }}>
                Product
              </h5>
              <ul className="space-y-1.5">
                {[
                  { label: 'Demo', href: '/demo' },
                  { label: 'Pricing', href: '/pricing' },
                  { label: 'Status', href: '/status' },
                ].map(({ label, href }) => (
                  <li key={label}>
                    <Link to={href} className="mono hover:opacity-100 transition-opacity"
                      style={{ color: 'var(--ink)', fontSize: 12 }}>{label}</Link>
                  </li>
                ))}
              </ul>
            </div>

            {/* Developers */}
            <div>
              <h5 className="mono" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--mid)', margin: '0 0 12px' }}>
                Developers
              </h5>
              <ul className="space-y-1.5">
                {[
                  { label: 'Documentation', href: '/docs' },
                  { label: 'API Reference', href: '/docs/reference' },
                  { label: 'Get API Key', href: '/developer' },
                  { label: 'GitHub', href: getGitHubUrl(), external: true },
                ].map(({ label, href, external }) => (
                  <li key={label}>
                    {external ? (
                      <a href={href} target="_blank" rel="noopener noreferrer"
                        className="mono hover:opacity-100 transition-opacity"
                        style={{ color: 'var(--ink)', fontSize: 12 }}>{label}</a>
                    ) : (
                      <Link to={href} className="mono hover:opacity-100 transition-opacity"
                        style={{ color: 'var(--ink)', fontSize: 12 }}>{label}</Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>

            {/* Company */}
            <div>
              <h5 className="mono" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--mid)', margin: '0 0 12px' }}>
                Company
              </h5>
              <ul className="space-y-1.5">
                {[
                  { label: 'Verify Credential', href: '/verify-credential' },
                ].map(({ label, href }) => (
                  <li key={label}>
                    <Link to={href} className="mono hover:opacity-100 transition-opacity"
                      style={{ color: 'var(--ink)', fontSize: 12 }}>{label}</Link>
                  </li>
                ))}
              </ul>
            </div>

            {/* Legal */}
            <div>
              <h5 className="mono" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--mid)', margin: '0 0 12px' }}>
                Legal
              </h5>
              <ul className="space-y-1.5">
                {[
                  { label: 'Privacy Policy', href: '/legal#privacy' },
                  { label: 'Terms of Service', href: '/legal#terms' },
                  { label: 'GDPR', href: '/legal#gdpr' },
                ].map(({ label, href }) => (
                  <li key={label}>
                    <Link to={href} className="mono hover:opacity-100 transition-opacity"
                      style={{ color: 'var(--ink)', fontSize: 12 }}>{label}</Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Footer base */}
          <div className="flex flex-col sm:flex-row justify-between items-center gap-4 mt-8 pt-5"
            style={{ borderTop: '1px solid var(--rule)' }}>
            <span className="mono" style={{ color: 'var(--mid)', fontSize: 11.5 }}>
              &copy; 2026 Idswyft &mdash; Open source under MIT License.
            </span>
          </div>
        </div>
      </footer>

      {/* Cookie consent — cloud edition only */}
      <CookieConsent />
    </div>
  )
}
