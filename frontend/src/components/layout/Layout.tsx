import { ReactNode, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import {
  ShieldCheckIcon,
  CodeBracketIcon,
  DocumentTextIcon,
  BuildingOfficeIcon,
  CurrencyDollarIcon
} from '@heroicons/react/24/outline'
import { clsx } from 'clsx'
import { isCommunity } from '../../config/edition'

interface LayoutProps {
  children: ReactNode
}

const getEnterpriseUrl = () => {
  if (window.location.hostname.endsWith('.idswyft.app') || window.location.hostname === 'idswyft.app') {
    return 'https://enterprise.idswyft.app'
  }
  return 'http://localhost:3015'
}

const getGitHubUrl = () => 'https://github.com/team-idswyft/idswyft'

// Cloud navigation — full marketing nav with Enterprise link
const cloudNavigation = [
  { name: 'Home', href: '/', icon: ShieldCheckIcon },
  { name: 'Developer', href: '/developer', icon: CodeBracketIcon },
  { name: 'Demo', href: '/demo', icon: DocumentTextIcon },
  { name: 'Docs', href: '/docs', icon: DocumentTextIcon },
  { name: 'Pricing', href: '/pricing', icon: CurrencyDollarIcon },
  { name: 'Enterprise', href: getEnterpriseUrl(), icon: BuildingOfficeIcon, external: true },
]

export function Layout({ children }: LayoutProps) {
  const location = useLocation()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  const isAdminRoute = location.pathname.startsWith('/admin')
  const isStandaloneRoute =
    location.pathname.startsWith('/user-verification') ||
    location.pathname.startsWith('/verify/mobile')
  const isDarkRoute =
    location.pathname === '/' ||
    location.pathname.startsWith('/docs') ||
    location.pathname.startsWith('/developer') ||
    location.pathname.startsWith('/demo') ||
    location.pathname.startsWith('/pricing') ||
    location.pathname.startsWith('/status') ||
    location.pathname.startsWith('/legal')

  if (isAdminRoute) {
    return <>{children}</>
  }

  if (isStandaloneRoute) {
    return <>{children}</>
  }

  // ─────────────────────────────────────────
  // Community edition: no navbar, minimal footer
  // ─────────────────────────────────────────
  if (isCommunity) {
    return (
      <div className="min-h-screen bg-[#080c14] flex flex-col">
        <main className="flex-1">
          {children}
        </main>

        <footer style={{ background: '#0b0f19', borderTop: '1px solid rgba(255,255,255,0.07)' }}>
          <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
              <a href="https://idswyft.app" target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-3 hover:opacity-80 transition-opacity" style={{ textDecoration: 'none' }}>
                <img src="/idswyft-logo.png" alt="Idswyft" className="h-6 w-auto" />
                <span style={{ color: '#4a5568', fontSize: 13 }}>Powered by Idswyft</span>
              </a>
              <div className="flex items-center gap-6">
                <Link to="/docs" style={{ color: '#8896aa', fontSize: 13 }}
                  className="hover:text-white transition-colors">Docs</Link>
                <Link to="/demo" style={{ color: '#8896aa', fontSize: 13 }}
                  className="hover:text-white transition-colors">Demo</Link>
                <a href={getGitHubUrl()} target="_blank" rel="noopener noreferrer"
                  style={{ color: '#8896aa', fontSize: 13 }}
                  className="hover:text-white transition-colors">GitHub</a>
              </div>
            </div>
          </div>
        </footer>
      </div>
    )
  }

  // ─────────────────────────────────────────
  // Cloud edition: full navbar + full footer
  // ─────────────────────────────────────────
  return (
    <div className={clsx('min-h-screen', isDarkRoute ? 'bg-[#080c14]' : 'bg-gray-50')}>
      {/* Floating Pill Navigation */}
      <nav className="fixed top-6 left-1/2 transform -translate-x-1/2 z-50 w-full max-w-6xl px-6">
        <div className={clsx(
          'backdrop-blur-xl rounded-full border shadow-2xl px-6 py-4',
          isDarkRoute
            ? 'bg-[#0b0f19]/95 border-white/10 shadow-black/40'
            : 'bg-white/90 border-white/20 shadow-black/10'
        )}>
          <div className="flex justify-between items-center">
            {/* Logo */}
            <div className="flex-shrink-0 flex items-center">
              <Link to="/" className="flex items-center">
                <img
                  src="/idswyft-logo.png"
                  alt="Idswyft"
                  className="h-8 w-auto flex-shrink-0"
                />
              </Link>
            </div>

            {/* Navigation links - Centered */}
            <div className="hidden lg:flex items-center space-x-8">
              {cloudNavigation.slice(0, -1).map((item) => {
                const isActive = !item.external && (location.pathname === item.href ||
                  (item.href !== '/' && location.pathname.startsWith(item.href)))

                return (
                  <Link
                    key={item.name}
                    to={item.href}
                    className={clsx(
                      'text-sm font-medium transition-all hover:scale-105 transform',
                      isDarkRoute
                        ? isActive
                          ? 'text-cyan-400'
                          : 'text-slate-400 hover:text-white'
                        : isActive
                          ? 'text-gray-900'
                          : 'text-gray-600 hover:text-gray-900'
                    )}
                  >
                    <span>{item.name}</span>
                  </Link>
                )
              })}
            </div>

            {/* Right side */}
            <div className="flex items-center space-x-3">
              {/* Enterprise Link */}
              <a
                href={getEnterpriseUrl()}
                target="_blank"
                rel="noopener noreferrer"
                className={clsx(
                  'hidden sm:inline-flex items-center px-4 py-2 rounded-full text-sm font-medium transition-all hover:scale-105 transform',
                  isDarkRoute
                    ? 'text-slate-400 hover:text-white hover:bg-white/10'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100/50'
                )}
              >
                <BuildingOfficeIcon className="h-4 w-4 mr-1.5" />
                Enterprise
              </a>

              <a
                href={getGitHubUrl()}
                target="_blank"
                rel="noopener noreferrer"
                className={clsx(
                  'hover:scale-105 transition-all transform',
                  isDarkRoute ? 'text-slate-500 hover:text-white' : 'text-gray-500 hover:text-gray-700'
                )}
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

              {/* Mobile menu button */}
              <button
                onClick={() => setMobileMenuOpen(prev => !prev)}
                className={clsx(
                  'lg:hidden w-8 h-8 rounded-full transition-colors flex items-center justify-center backdrop-blur-sm',
                  isDarkRoute ? 'bg-white/10 hover:bg-white/20' : 'bg-gray-100/50 hover:bg-gray-200/50'
                )}
                aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
                aria-expanded={mobileMenuOpen}
              >
                <div className="w-4 h-4 flex flex-col justify-center items-center relative">
                  <div className={clsx(
                    'w-4 h-0.5 rounded transition-all duration-200 absolute',
                    isDarkRoute ? 'bg-slate-400' : 'bg-gray-600',
                    mobileMenuOpen ? 'rotate-45' : '-translate-y-1.5'
                  )}></div>
                  <div className={clsx(
                    'w-4 h-0.5 rounded transition-all duration-200',
                    isDarkRoute ? 'bg-slate-400' : 'bg-gray-600',
                    mobileMenuOpen ? 'opacity-0' : 'opacity-100'
                  )}></div>
                  <div className={clsx(
                    'w-4 h-0.5 rounded transition-all duration-200 absolute',
                    isDarkRoute ? 'bg-slate-400' : 'bg-gray-600',
                    mobileMenuOpen ? '-rotate-45' : 'translate-y-1.5'
                  )}></div>
                </div>
              </button>
            </div>
          </div>
        </div>

        {/* Mobile menu */}
        {mobileMenuOpen && (
          <div className="lg:hidden mt-2">
            <div className={clsx(
              'backdrop-blur-xl rounded-2xl border shadow-xl p-4 space-y-2',
              isDarkRoute
                ? 'bg-[#0b0f19]/98 border-white/10 shadow-black/40'
                : 'bg-white/95 border-white/30 shadow-black/5'
            )}>
              {cloudNavigation.map((item) => {
                const Icon = item.icon
                const isActive = !item.external && (location.pathname === item.href ||
                  (item.href !== '/' && location.pathname.startsWith(item.href)))

                if (item.external) {
                  return (
                    <a
                      key={item.name}
                      href={item.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => setMobileMenuOpen(false)}
                      className={clsx(
                        'flex items-center px-3 py-2.5 rounded-xl text-base font-medium space-x-3 transition-colors',
                        isDarkRoute
                          ? 'text-slate-400 hover:bg-white/10 hover:text-white'
                          : 'text-gray-600 hover:bg-gray-50/80 hover:text-gray-900'
                      )}
                    >
                      <Icon className="h-5 w-5 flex-shrink-0" />
                      <span>{item.name}</span>
                    </a>
                  )
                }

                return (
                  <Link
                    key={item.name}
                    to={item.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className={clsx(
                      'flex items-center px-3 py-2.5 rounded-xl text-base font-medium space-x-3 transition-colors',
                      isDarkRoute
                        ? isActive
                          ? 'bg-white/10 text-cyan-400'
                          : 'text-slate-400 hover:bg-white/10 hover:text-white'
                        : isActive
                          ? 'bg-primary-50/80 text-primary-700'
                          : 'text-gray-600 hover:bg-gray-50/80 hover:text-gray-900'
                    )}
                  >
                    <Icon className="h-5 w-5 flex-shrink-0" />
                    <span>{item.name}</span>
                  </Link>
                )
              })}
            </div>
          </div>
        )}
      </nav>

      {/* Main content */}
      <main className="flex-1 pt-24">
        {children}
      </main>

      {/* Footer */}
      <footer style={{ background: '#0b0f19', borderTop: '1px solid rgba(255,255,255,0.07)' }}>
        <div className="max-w-7xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            <div className="col-span-1 md:col-span-2">
              <div className="mb-6">
                <img src="/idswyft-logo.png" alt="Idswyft" className="h-8 w-auto flex-shrink-0" />
              </div>
              <p style={{ color: '#8896aa', fontSize: 14, lineHeight: 1.6 }}>
                Open-source identity verification platform built for developers.
                Secure, fast, and compliant with GDPR and CCPA.
              </p>
            </div>
            <div>
              <h3 style={{ color: '#dde2ec', fontSize: 12, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 16 }}>
                Developer
              </h3>
              <ul className="space-y-2">
                {[
                  { label: 'API Documentation', href: '/docs' },
                  { label: 'Get API Key', href: '/developer' },
                  { label: 'System Status', href: 'https://status.idswyft.app' },
                  { label: 'GitHub', href: getGitHubUrl() },
                ].map(({ label, href }) => (
                  <li key={label}>
                    {href.startsWith('http') ? (
                      <a href={href} target="_blank" rel="noopener noreferrer"
                        style={{ color: '#8896aa', fontSize: 14 }}
                        className="hover:text-white transition-colors">{label}</a>
                    ) : (
                      <Link to={href} style={{ color: '#8896aa', fontSize: 14 }}
                        className="hover:text-white transition-colors">{label}</Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 style={{ color: '#dde2ec', fontSize: 12, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 16 }}>
                Legal
              </h3>
              <ul className="space-y-2">
                {[
                  { label: 'Privacy Policy', href: '/legal#privacy' },
                  { label: 'Terms of Service', href: '/legal#terms' },
                  { label: 'GDPR Compliance', href: '/legal#gdpr' },
                ].map(({ label, href }) => (
                  <li key={label}>
                    <Link to={href} style={{ color: '#8896aa', fontSize: 14 }}
                      className="hover:text-white transition-colors">{label}</Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <div style={{ marginTop: 32, paddingTop: 32, borderTop: '1px solid rgba(255,255,255,0.07)' }}>
            <p style={{ textAlign: 'center', color: '#4a5568', fontSize: 13 }}>
              © 2026 Idswyft — Open source under MIT License.
            </p>
          </div>
        </div>
      </footer>
    </div>
  )
}
