import React, { useState, useEffect } from 'react';
import { Outlet, Link, useLocation, Navigate } from 'react-router-dom';
import {
  Menu,
  X,
  LayoutDashboard,
  Building,
  Palette,
  Mail,
  UserCog,
  Settings,
  LogOut,
  User,
  ChevronDown,
  Shield,
  Monitor,
  BarChart3,
  Activity,
  SlidersHorizontal,
  Users,
  Bell,
  BellRing,
  Wrench,
} from 'lucide-react';
import NotificationBell from '../NotificationBell';
import { useAuth } from '../../contexts/AuthContext';

const navigationItems = [
  { name: 'Dashboard',         href: '/dashboard',         icon: LayoutDashboard },
  { name: 'System Status',     href: '/system-status',     icon: Activity },
  { name: 'Organizations',     href: '/organizations',     icon: Building },
  { name: 'Developers',        href: '/developers',        icon: Users },
  { name: 'Verification',      href: '/verification-settings', icon: SlidersHorizontal },
  { name: 'Branding',          href: '/branding',          icon: Palette },
  { name: 'Email Templates',   href: '/email-templates',   icon: Mail },
  { name: 'Admin Management',  href: '/admin-management',  icon: UserCog },
  { name: 'Sessions',          href: '/sessions',          icon: Monitor },
  { name: 'Provider Metrics',  href: '/provider-metrics',  icon: BarChart3 },
  { name: 'Audit Logs',        href: '/audit-logs',        icon: Shield },
  { name: 'Notifications',     href: '/notifications',     icon: Bell },
  { name: 'Alert Channels',    href: '/notification-settings', icon: BellRing },
  { name: 'Configuration',     href: '/configuration',     icon: Wrench },
  { name: 'Settings',          href: '/settings',          icon: Settings },
];

export default function PlatformLayout() {
  const { isAuthenticated, loading, admin, logout } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [logoUrl, setLogoUrl] = useState('/idswyft-logo.png');
  const location = useLocation();

  const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3002/api';

  useEffect(() => {
    const loadPlatformLogo = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/assets/platform`);
        const payload = await response.json();
        const remoteLogo = payload?.data?.logo_url;
        if (response.ok && typeof remoteLogo === 'string' && remoteLogo.trim()) {
          setLogoUrl(remoteLogo);
        }
      } catch {
        // Keep fallback logo if branding endpoint is unavailable.
      }
    };

    loadPlatformLogo();
  }, [API_BASE_URL]);

  // Still verifying token on page refresh — wait before redirecting
  if (!isAuthenticated && loading) {
    return (
      <div className="dashboard-bg flex h-screen items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-cyan-400 border-t-transparent" />
          <p className="text-sm text-slate-400">Verifying session...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  const handleLogout = async () => {
    try {
      await logout();
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  const updatedNavigation = navigationItems.map((item) => ({
    ...item,
    current: location.pathname.startsWith(item.href),
  }));

  const currentPage = updatedNavigation.find((item) => item.current);

  // ── Admin menu (sidebar footer + header) ─────────────────────────────────
  const AdminMenu = ({ compact = false }: { compact?: boolean }) => (
    <div className="relative">
      <button
        onClick={() => setUserMenuOpen(!userMenuOpen)}
        className={`w-full rounded-xl border border-white/10 bg-slate-950/50 px-3 py-2 text-left transition hover:border-cyan-400/40 hover:bg-slate-900/70 ${compact ? '' : 'min-w-[220px]'}`}
      >
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-cyan-400/35 bg-cyan-400/10 text-cyan-200">
            <User className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold text-slate-100">
              {admin?.first_name} {admin?.last_name}
            </div>
            <div className="truncate text-xs text-slate-400">{admin?.role}</div>
          </div>
          <ChevronDown className={`h-4 w-4 text-slate-500 transition-transform ${userMenuOpen ? 'rotate-180' : ''}`} />
        </div>
      </button>

      {userMenuOpen && (
        <div className="absolute bottom-full left-0 z-50 mb-2 w-full animate-scale-in">
          <div className="user-menu-glass rounded-xl p-1">
            <div className="border-b border-white/10 px-3 py-3">
              <div className="text-sm font-semibold text-slate-100">{admin?.first_name} {admin?.last_name}</div>
              <div className="mt-0.5 text-xs text-slate-400">{admin?.email}</div>
              <div className="mt-2 inline-flex items-center gap-1 rounded-full border border-cyan-400/30 bg-cyan-400/10 px-2 py-0.5 text-[11px] font-semibold text-cyan-200">
                <Shield className="h-3 w-3" />
                Platform Admin
              </div>
            </div>
            <div className="p-1">
              <button
                onClick={handleLogout}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-rose-300 transition hover:bg-rose-500/10 hover:text-rose-200"
              >
                <LogOut className="h-4 w-4" />
                Sign out
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  // ── Sidebar ──────────────────────────────────────────────────────────────
  const Sidebar = ({ className = '' }: { className?: string }) => (
    <aside className={`sidebar-glass flex h-full flex-col ${className}`}>
      <div className="border-b border-white/10 px-6 py-5">
        <img src={logoUrl} alt="Idswyft Platform" className="h-8 w-auto" />
      </div>

      <div className="border-b border-white/10 px-6 py-4">
        <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Platform</div>
        <div className="mt-1 truncate text-sm font-semibold text-slate-100">Idswyft Platform</div>
        <div className="mt-3 flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-emerald-400" />
          <span className="organization-status-active">ONLINE</span>
        </div>
      </div>

      <nav className="flex-1 space-y-1 px-3 py-4">
        {updatedNavigation.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.name}
              to={item.href}
              onClick={() => setSidebarOpen(false)}
              className={`sidebar-nav-item ${item.current ? 'sidebar-nav-active' : 'sidebar-nav-inactive'}`}
            >
              <Icon className={`mr-3 h-4 w-4 ${item.current ? 'text-cyan-200' : 'text-slate-500'}`} />
              <span className="truncate">{item.name}</span>
              {item.current && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-cyan-300" />}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-white/10 p-3">
        <AdminMenu />
      </div>
    </aside>
  );

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="dashboard-bg">
      <div className="relative flex h-screen">
        {/* Mobile overlay */}
        {sidebarOpen && (
          <button
            aria-label="Close navigation"
            className="fixed inset-0 z-40 bg-slate-950/65 backdrop-blur-[1px] lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Mobile sidebar */}
        <div
          className={`fixed inset-y-0 left-0 z-50 w-72 transform transition-transform duration-300 lg:hidden ${
            sidebarOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <button
            onClick={() => setSidebarOpen(false)}
            className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-md border border-white/10 bg-slate-900/90 text-slate-300"
          >
            <X className="h-4 w-4" />
          </button>
          <Sidebar />
        </div>

        {/* Desktop sidebar */}
        <div className="hidden lg:flex lg:w-72 lg:flex-col">
          <Sidebar />
        </div>

        {/* Main content */}
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <header className="header-glass">
            <div className="flex items-center justify-between gap-4 px-5 py-4 lg:px-6">
              <div className="flex min-w-0 items-center gap-3">
                <button
                  onClick={() => setSidebarOpen(true)}
                  className="rounded-md border border-white/10 bg-slate-900/80 p-2 text-slate-300 transition hover:border-cyan-400/40 hover:text-cyan-200 lg:hidden"
                >
                  <Menu className="h-5 w-5" />
                </button>
                <div className="min-w-0">
                  <h1 className="truncate text-xl font-semibold text-slate-100 lg:text-2xl">
                    {currentPage?.name || 'Dashboard'}
                  </h1>
                </div>
              </div>

              <div className="flex items-center gap-2 lg:gap-3">
                <NotificationBell />
                <div className="hidden lg:block">
                  <AdminMenu compact />
                </div>
              </div>
            </div>
          </header>

          <main className="flex-1 overflow-auto">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
}
