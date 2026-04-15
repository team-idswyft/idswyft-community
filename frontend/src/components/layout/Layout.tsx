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
  // Community edition: no navbar, minimal footer
  // ─────────────────────────────────────────
  const pathname = location.pathname
  const showBackNav = pathname !== '/' && pathname !== '/developer' && pathname !== '/setup'

  return (
    <div className="min-h-screen bg-[#080c14] flex flex-col">
      <main className="flex-1">
        {showBackNav && (
          <div style={{ borderBottom: '1px solid rgba(255,255,255,0.07)', padding: '10px 24px' }}>
            <Link to="/" style={{ color: '#8896aa', fontSize: 13, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              &#8592; Dev Portal
            </Link>
          </div>
        )}
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
              <Link to="/" style={{ color: '#8896aa', fontSize: 13 }}
                className="hover:text-white transition-colors">Dev Portal</Link>
              <Link to="/docs" style={{ color: '#8896aa', fontSize: 13 }}
                className="hover:text-white transition-colors">Docs</Link>
              <Link to="/demo" style={{ color: '#8896aa', fontSize: 13 }}
                className="hover:text-white transition-colors">Demo</Link>
              <Link to="/verify-credential" style={{ color: '#8896aa', fontSize: 13 }}
                className="hover:text-white transition-colors">Verify Credential</Link>
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
