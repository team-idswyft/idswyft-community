import React, { useEffect, useState } from 'react';
import { Outlet, Link, useLocation, Navigate } from 'react-router-dom';
import {
  Menu,
  X,
  LayoutDashboard,
  Users,
  CheckCircle,
  Webhook,
  Settings,
  BarChart3,
  Building,
  LogOut,
  Shield,
  Monitor,
  Bell,
  User,
  ChevronDown,
  Key,
  CreditCard,
  UserCog,
  Search,
  Plus
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

const navigationItems = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, current: false },
  { name: 'Verifications', href: '/verifications', icon: CheckCircle, current: false },
  { name: 'End Users', href: '/users', icon: Users, current: false },
  { name: 'Webhooks', href: '/webhooks', icon: Webhook, current: false },
  { name: 'Analytics', href: '/analytics', icon: BarChart3, current: false },
  { name: 'Organization', href: '/organization', icon: Building, current: false },
  { name: 'Billing', href: '/billing', icon: CreditCard, current: false },
  { name: 'API Keys', href: '/api-keys', icon: Key, current: false },
  { name: 'Audit Logs', href: '/audit-logs', icon: Shield, current: false },
  { name: 'Sessions', href: '/sessions', icon: Monitor, current: false },
  { name: 'Provider Metrics', href: '/provider-metrics', icon: BarChart3, current: false },
  { name: 'Team', href: '/team', icon: UserCog, current: false },
  { name: 'Verification Settings', href: '/settings', icon: Settings, current: false },
];

export default function DashboardLayout() {
  const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3002/api';
  const { isAuthenticated, admin, organization, logout } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [logoUrl, setLogoUrl] = useState('/idswyft-logo.png');
  const location = useLocation();

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
                <Building className="h-3 w-3" />
                {organization?.name}
              </div>
            </div>
            <div className="p-1">
              <Link
                to="/profile"
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-300 transition hover:bg-slate-800/80 hover:text-slate-100"
              >
                <User className="h-4 w-4" />
                Profile Settings
              </Link>
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

  const Sidebar = ({ className = '' }: { className?: string }) => (
    <aside className={`sidebar-glass flex h-full flex-col ${className}`}>
      <div className="border-b border-white/10 px-6 py-5">
        <img src={logoUrl} alt="Idswyft VaaS Admin" className="h-8 w-auto" />
      </div>

      <div className="border-b border-white/10 px-6 py-4">
        <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Organization</div>
        <div className="mt-1 truncate text-sm font-semibold text-slate-100">{organization?.name}</div>
        <div className="mt-3 flex items-center gap-2">
          <div className={`h-2 w-2 rounded-full ${organization?.billing_status === 'active' ? 'bg-emerald-400' : 'bg-rose-400'}`} />
          <span className={organization?.billing_status === 'active' ? 'organization-status-active' : 'organization-status-inactive'}>
            {organization?.billing_status?.replace('_', ' ').toUpperCase()}
          </span>
        </div>
      </div>

      <nav className="flex-1 space-y-1 px-3 py-4">
        {updatedNavigation.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.name}
              to={item.href}
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

  return (
    <div className="dashboard-bg">
      <div className="relative flex h-screen">
        {sidebarOpen && (
          <button
            aria-label="Close navigation"
            className="fixed inset-0 z-40 bg-slate-950/65 backdrop-blur-[1px] lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

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

        <div className="hidden lg:flex lg:w-72 lg:flex-col">
          <Sidebar className="animate-slide-in-left" />
        </div>

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
                  <h1 className="truncate text-xl font-semibold text-slate-100 lg:text-2xl">{currentPage?.name || 'Dashboard'}</h1>
                  {organization && (
                    <div className="mt-1 inline-flex max-w-full items-center gap-1 text-xs text-slate-400">
                      <Building className="h-3.5 w-3.5" />
                      <span className="truncate">{organization.name}</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 lg:gap-3">
                <button
                  onClick={() => setSearchOpen(!searchOpen)}
                  className={`rounded-md border p-2 transition ${
                    searchOpen
                      ? 'border-cyan-400/50 bg-cyan-400/10 text-cyan-200'
                      : 'border-white/10 bg-slate-900/70 text-slate-400 hover:border-cyan-400/40 hover:text-cyan-200'
                  }`}
                >
                  <Search className="h-4 w-4" />
                </button>

                <Link
                  to="/verifications/start"
                  className="hidden items-center gap-2 rounded-md border border-cyan-400/55 bg-cyan-400/10 px-3.5 py-2 text-sm font-semibold text-cyan-200 transition hover:bg-cyan-400/16 sm:inline-flex"
                >
                  <Plus className="h-4 w-4" />
                  New Verification
                </Link>

                <button className="relative rounded-md border border-white/10 bg-slate-900/70 p-2 text-slate-400 transition hover:border-cyan-400/40 hover:text-cyan-200">
                  <Bell className="h-4 w-4" />
                  <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full border border-slate-950 bg-rose-400" />
                </button>

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
