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
  {
    name: 'Dashboard',
    href: '/dashboard',
    icon: LayoutDashboard,
    current: false,
  },
  {
    name: 'Verifications',
    href: '/verifications',
    icon: CheckCircle,
    current: false,
  },
  {
    name: 'End Users',
    href: '/users',
    icon: Users,
    current: false,
  },
  {
    name: 'Webhooks',
    href: '/webhooks',
    icon: Webhook,
    current: false,
  },
  {
    name: 'Analytics',
    href: '/analytics',
    icon: BarChart3,
    current: false,
  },
  {
    name: 'Organization',
    href: '/organization',
    icon: Building,
    current: false,
  },
  {
    name: 'Billing',
    href: '/billing',
    icon: CreditCard,
    current: false,
  },
  {
    name: 'API Keys',
    href: '/api-keys',
    icon: Key,
    current: false,
  },
  {
    name: 'Audit Logs',
    href: '/audit-logs',
    icon: Shield,
    current: false,
  },
  {
    name: 'Sessions',
    href: '/sessions',
    icon: Monitor,
    current: false,
  },
  {
    name: 'Provider Metrics',
    href: '/provider-metrics',
    icon: BarChart3,
    current: false,
  },
  {
    name: 'Team',
    href: '/team',
    icon: UserCog,
    current: false,
  },
  {
    name: 'Verification Settings',
    href: '/settings',
    icon: Settings,
    current: false,
  },
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

  // Redirect to login if not authenticated
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

  // Update current navigation item based on location
  const updatedNavigation = navigationItems.map(item => ({
    ...item,
    current: location.pathname.startsWith(item.href),
  }));

  const AdminMenu = () => (
    <div className="relative">
      <button
        onClick={() => setUserMenuOpen(!userMenuOpen)}
        className="flex items-center space-x-3 p-3 rounded-2xl hover:bg-white/30 hover:backdrop-blur-sm transition-all duration-300 w-full text-left"
      >
        <div className="relative">
          <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-2xl flex items-center justify-center shadow-lg">
            <User className="w-5 h-5 text-white" />
          </div>
          <div className="absolute -top-1 -right-1 w-4 h-4 bg-green-400 rounded-full border-2 border-white flex items-center justify-center">
            <div className="w-2 h-2 bg-green-600 rounded-full"></div>
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-slate-800 truncate">
            {admin?.first_name} {admin?.last_name}
          </div>
          <div className="text-xs text-slate-600 truncate">{admin?.role}</div>
        </div>
        <ChevronDown className={`w-4 h-4 text-slate-500 transition-transform duration-300 hover:text-slate-700 ${userMenuOpen ? 'rotate-180' : ''}`} />
      </button>

      {userMenuOpen && (
        <div className="absolute bottom-full left-0 w-full mb-3 animate-scale-in">
          <div className="user-menu-glass p-1">
            <div className="p-4 border-b border-white/20">
              <div className="text-sm font-semibold text-slate-800">
                {admin?.first_name} {admin?.last_name}
              </div>
              <div className="text-xs text-slate-600 mt-1">{admin?.email}</div>
              <div className="text-xs font-medium text-blue-600 mt-2 flex items-center">
                <Building className="w-3 h-3 mr-1" />
                {organization?.name}
              </div>
            </div>
            <div className="p-1">
              <Link
                to="/profile"
                className="flex items-center px-3 py-2.5 text-sm text-slate-700 hover:bg-white/30 rounded-xl transition-all duration-200"
              >
                <User className="w-4 h-4 mr-3 text-slate-500" />
                Profile Settings
              </Link>
              <button
                onClick={handleLogout}
                className="w-full flex items-center px-3 py-2.5 text-sm text-red-600 hover:bg-red-50/50 rounded-xl transition-all duration-200"
              >
                <LogOut className="w-4 h-4 mr-3" />
                Sign out
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  const Sidebar = ({ className = '' }: { className?: string }) => (
    <div className={`flex flex-col h-full sidebar-glass ${className}`}>
      {/* Logo */}
      <div className="flex items-center px-6 py-6 border-b border-white/20">        <img           src={logoUrl}           alt="Idswyft VaaS Admin"           className="h-8 w-auto"        />      </div>

      {/* Organization info */}
      <div className="px-6 py-4 border-b border-white/20 bg-white/10 backdrop-blur-sm">
        <div className="text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">Organization</div>
        <div className="text-sm font-bold text-slate-800">{organization?.name}</div>
        <div className="flex items-center mt-3">
          <div className={`w-2 h-2 rounded-full mr-2 ${
            organization?.billing_status === 'active' ? 'bg-green-500 animate-pulse' : 'bg-red-500'
          }`}></div>
          <span className={`text-xs font-semibold px-2 py-1 rounded-full ${
            organization?.billing_status === 'active' 
              ? 'organization-status-active'
              : 'organization-status-inactive'
          }`}>
            {organization?.billing_status?.replace('_', ' ').toUpperCase()}
          </span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-4 py-6 space-y-2">
        {updatedNavigation.map((item, index) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.name}
              to={item.href}
              className={`sidebar-nav-item ${
                item.current ? 'sidebar-nav-active' : 'sidebar-nav-inactive'
              }`}
              style={{
                animationDelay: `${index * 50}ms`
              }}
            >
              <div className={`w-5 h-5 mr-3 transition-transform duration-300 hover:scale-110 ${
                item.current ? 'text-blue-600' : 'text-slate-500 hover:text-slate-700'
              }`}>
                <Icon />
              </div>
              <span className="font-medium">{item.name}</span>
              {item.current && (
                <div className="ml-auto w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
              )}
            </Link>
          );
        })}
      </nav>

      {/* User menu at bottom */}
      <div className="px-4 py-4 border-t border-white/20 bg-white/5">
        <AdminMenu />
      </div>
    </div>
  );

  const currentPage = updatedNavigation.find(item => item.current);

  return (
    <div className="dashboard-bg">
      {/* Decorative background elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 right-10 w-64 h-64 bg-gradient-to-br from-blue-400/10 to-indigo-600/10 rounded-full blur-3xl"></div>
        <div className="absolute bottom-20 left-10 w-80 h-80 bg-gradient-to-tr from-indigo-400/10 to-purple-600/10 rounded-full blur-3xl"></div>
      </div>

      <div className="h-screen flex relative z-10">
        {/* Mobile sidebar backdrop */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 z-40 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          >
            <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"></div>
          </div>
        )}

        {/* Mobile sidebar */}
        <div
          className={`fixed inset-y-0 left-0 z-50 w-72 transform transition-transform duration-300 ease-in-out lg:hidden ${
            sidebarOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <div className="absolute top-0 right-0 -mr-12 pt-2">
            <button
              onClick={() => setSidebarOpen(false)}
              className="ml-1 flex items-center justify-center h-10 w-10 rounded-full focus:outline-none focus:ring-2 focus:ring-inset focus:ring-white/50 bg-white/10 backdrop-blur-sm"
            >
              <X className="h-6 w-6 text-white" />
            </button>
          </div>
          <Sidebar />
        </div>

        {/* Desktop sidebar */}
        <div className="hidden lg:flex lg:w-72 lg:flex-col">
          <Sidebar className="animate-slide-in-left" />
        </div>

        {/* Main content area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Top navigation bar */}
          <header className="header-glass">
            <div className="flex items-center justify-between px-6 py-4">
              <div className="flex items-center space-x-4">
                <button
                  onClick={() => setSidebarOpen(true)}
                  className="text-slate-600 hover:text-slate-800 lg:hidden p-2 rounded-xl hover:bg-white/30 transition-all duration-200"
                >
                  <Menu className="h-6 w-6" />
                </button>
                
                <div className="animate-slide-in-up">
                  <h1 className="text-2xl font-bold text-slate-800 lg:ml-0">
                    {currentPage?.name || 'Dashboard'}
                  </h1>
                  {organization && (
                    <div className="flex items-center mt-1">
                      <Building className="w-3 h-3 text-slate-500 mr-1" />
                      <span className="text-sm text-slate-600 font-medium">{organization.name}</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center space-x-3">
                {/* Search button */}
                <button 
                  onClick={() => setSearchOpen(!searchOpen)}
                  className="p-2.5 rounded-xl text-slate-600 hover:text-slate-800 hover:bg-white/40 transition-all duration-200 glass-shimmer"
                >
                  <Search className="h-5 w-5" />
                </button>

                {/* Quick action button */}
                <Link
                  to="/verifications/start"
                  className="hidden sm:flex items-center space-x-2 px-4 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-105 font-medium"
                >
                  <Plus className="h-4 w-4" />
                  <span>New Verification</span>
                </Link>

                {/* Notifications */}
                <div className="relative">
                  <button className="p-2.5 rounded-xl text-slate-600 hover:text-slate-800 hover:bg-white/40 transition-all duration-200 glass-shimmer">
                    <Bell className="h-5 w-5" />
                    <div className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full flex items-center justify-center">
                      <div className="w-2 h-2 bg-white rounded-full"></div>
                    </div>
                  </button>
                </div>

                {/* Desktop user menu */}
                <div className="hidden lg:block">
                  <AdminMenu />
                </div>
              </div>
            </div>
          </header>

          {/* Page content */}
          <main className="flex-1 overflow-auto">
            <div className="animate-fade-in">
              <Outlet />
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
