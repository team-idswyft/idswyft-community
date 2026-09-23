import { ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'

interface LayoutProps {
  children: ReactNode
}

const getGitHubUrl = () => 'https://github.com/team-idswyft/idswyft-community'

export function Layout({ children }: LayoutProps) {
  const location = useLocation()

  const isAdminRoute = location.pathname.startsWith('/admin')
  const isStandaloneRoute =
    location.pathname.startsWith('/user-verification') ||
    location.pathname.startsWith('/verify/mobile') ||
    location.pathname.startsWith('/v/') ||
    location.pathname === '/developer/page-builder'

  if (isAdminRoute) {
    return <>{children}</>
  }

  if (isStandaloneRoute) {
    return <>{children}</>
  }

  // ─────────────────────────────────────────
  // Community edition: no navbar, minimal footer (v2 styling)
  // ─────────────────────────────────────────
  const pathname = location.pathname
  const showBackNav = pathname !== '/' && pathname !== '/developer' && pathname !== '/setup'

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--paper)', color: 'var(--ink)' }}>
      <main className="flex-1">
        {showBackNav && (
          <div style={{ borderBottom: '1px solid var(--rule)', padding: '10px 24px' }}>
            <Link to="/" className="mono" style={{ color: 'var(--mid)', fontSize: 12.5, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              &#8592; Dev Portal
            </Link>
          </div>
        )}
        {children}
      </main>

      <footer style={{ background: 'var(--panel)', borderTop: '1px solid var(--rule)' }}>
        <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <a href="https://idswyft.app" target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-3 hover:opacity-80 transition-opacity">
              <img src="/idswyft-logo.png" alt="Idswyft" className="h-6 w-auto" />
              <span className="mono" style={{ color: 'var(--soft)', fontSize: 12 }}>Powered by Idswyft</span>
            </a>
            <div className="flex items-center gap-6">
              {[
                { label: 'Dev Portal', href: '/' },
                { label: 'Docs', href: '/docs' },
                { label: 'Demo', href: '/demo' },
                { label: 'Verify Credential', href: '/verify-credential' },
              ].map(({ label, href }) => (
                <Link key={label} to={href}
                  className="mono hover:opacity-100 transition-opacity"
                  style={{ color: 'var(--mid)', fontSize: 12 }}>{label}</Link>
              ))}
              <a href={getGitHubUrl()} target="_blank" rel="noopener noreferrer"
                className="mono hover:opacity-100 transition-opacity"
                style={{ color: 'var(--mid)', fontSize: 12 }}>GitHub</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
