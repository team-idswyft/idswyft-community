import React, { Suspense, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider } from './contexts/AuthContext';
import Login from './components/auth/Login';
import EmailVerification from './components/auth/EmailVerification';
import DashboardLayout from './components/layout/DashboardLayout';
import RequirePermission from './components/auth/RequirePermission';
import DebugInfo from './components/debug/DebugInfo';

// Lazy-loaded page components (code-split per route)
const Dashboard = React.lazy(() => import('./components/dashboard/Dashboard'));
const Organization = React.lazy(() => import('./pages/Organization'));
const Verifications = React.lazy(() => import('./pages/Verifications'));
const StartVerification = React.lazy(() => import('./pages/StartVerification'));
const Users = React.lazy(() => import('./pages/Users'));
const Webhooks = React.lazy(() => import('./pages/Webhooks'));
const Settings = React.lazy(() => import('./pages/Settings'));
const Analytics = React.lazy(() => import('./pages/Analytics'));
const ApiKeys = React.lazy(() => import('./pages/ApiKeys'));
const Billing = React.lazy(() => import('./pages/Billing'));
const AuditLogs = React.lazy(() => import('./pages/AuditLogs'));
const AdminUserManagement = React.lazy(() => import('./pages/AdminUserManagement'));
const Sessions = React.lazy(() => import('./pages/Sessions'));
const ProviderMetrics = React.lazy(() => import('./pages/ProviderMetrics'));

// Suspense fallback — matches DashboardLayout content area
function PageSkeleton() {
  return (
    <div className="p-6 space-y-6 animate-pulse">
      <div className="h-6 w-48 bg-slate-800 rounded" />
      <div className="h-4 w-72 bg-slate-800/60 rounded" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-24 bg-slate-800/40 border border-white/5 rounded-xl" />
        ))}
      </div>
      <div className="h-64 bg-slate-800/40 border border-white/5 rounded-xl" />
    </div>
  );
}

// Development route for debugging
const DevInfo = () => (
  <div className="p-6">
    <h1 className="text-2xl font-bold mb-4">Development Info</h1>
    <DebugInfo />
  </div>
);

// ── Dynamic favicon from platform branding ───────────────────────────────────
function usePlatformFavicon() {
  const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3002/api';

  useEffect(() => {
    const loadFavicon = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/assets/platform`);
        const payload = await response.json();
        const faviconUrl = payload?.data?.favicon_url;
        if (response.ok && typeof faviconUrl === 'string' && faviconUrl.trim()) {
          const link = document.querySelector("link[rel='icon']") as HTMLLinkElement;
          if (link) link.href = faviconUrl;
        }
      } catch {
        // Keep static fallback favicon.
      }
    };

    loadFavicon();
  }, [API_BASE_URL]);
}

function App() {
  usePlatformFavicon();
  return (
    <AuthProvider>
      <Router>
        <Toaster
          position="top-right"
          toastOptions={{
            duration: 4000,
            style: {
              background: '#0f172a',
              color: '#e2e8f0',
              border: '1px solid rgba(255,255,255,0.1)',
              fontFamily: "'IBM Plex Mono', monospace",
              fontSize: '0.8125rem',
            },
          }}
        />
        <div className="App">
          <Routes>
            {/* Public routes */}
            <Route path="/login" element={<Login />} />
            <Route path="/verify-email" element={<EmailVerification />} />
            <Route path="/dev" element={<DevInfo />} />

            {/* Protected routes */}
            <Route path="/" element={<DashboardLayout />}>
              <Route index element={<Navigate to="/dashboard" replace />} />
              <Route path="dashboard" element={<Suspense fallback={<PageSkeleton />}><Dashboard /></Suspense>} />
              <Route path="verifications" element={<Suspense fallback={<PageSkeleton />}><Verifications /></Suspense>} />
              <Route path="verifications/start" element={<Suspense fallback={<PageSkeleton />}><StartVerification /></Suspense>} />
              <Route path="users" element={<Suspense fallback={<PageSkeleton />}><Users /></Suspense>} />
              <Route path="webhooks" element={
                <RequirePermission permission="manage_webhooks">
                  <Suspense fallback={<PageSkeleton />}><Webhooks /></Suspense>
                </RequirePermission>
              } />
              <Route path="analytics" element={<Suspense fallback={<PageSkeleton />}><Analytics /></Suspense>} />
              <Route path="organization" element={<Suspense fallback={<PageSkeleton />}><Organization /></Suspense>} />
              <Route path="billing" element={
                <RequirePermission permission="manage_billing">
                  <Suspense fallback={<PageSkeleton />}><Billing /></Suspense>
                </RequirePermission>
              } />
              <Route path="api-keys" element={
                <RequirePermission permission="manage_integrations">
                  <Suspense fallback={<PageSkeleton />}><ApiKeys /></Suspense>
                </RequirePermission>
              } />
              <Route path="audit-logs" element={<Suspense fallback={<PageSkeleton />}><AuditLogs /></Suspense>} />
              <Route path="team" element={
                <RequirePermission permission="manage_admins">
                  <Suspense fallback={<PageSkeleton />}><AdminUserManagement /></Suspense>
                </RequirePermission>
              } />
              <Route path="sessions" element={<Suspense fallback={<PageSkeleton />}><Sessions /></Suspense>} />
              <Route path="provider-metrics" element={<Suspense fallback={<PageSkeleton />}><ProviderMetrics /></Suspense>} />
              <Route path="settings" element={
                <RequirePermission permission="manage_settings">
                  <Suspense fallback={<PageSkeleton />}><Settings /></Suspense>
                </RequirePermission>
              } />
            </Route>

            {/* Catch-all redirect */}
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </div>
      </Router>
    </AuthProvider>
  );
}

export default App;
