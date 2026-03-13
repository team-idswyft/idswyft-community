import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import Login from './components/auth/Login';
import EmailVerification from './components/auth/EmailVerification';
import DashboardLayout from './components/layout/DashboardLayout';
import Dashboard from './components/dashboard/Dashboard';
import Organization from './pages/Organization';
import Verifications from './pages/Verifications';
import StartVerification from './pages/StartVerification';
import Users from './pages/Users';
import Webhooks from './pages/Webhooks';
import Settings from './pages/Settings';
import Analytics from './pages/Analytics';
import ApiKeys from './pages/ApiKeys';
import Billing from './pages/Billing';
import AuditLogs from './pages/AuditLogs';
import AdminUserManagement from './pages/AdminUserManagement';
import Sessions from './pages/Sessions';
import ProviderMetrics from './pages/ProviderMetrics';
import DebugInfo from './components/debug/DebugInfo';

// Development route for debugging
const DevInfo = () => (
  <div className="p-6">
    <h1 className="text-2xl font-bold mb-4">Development Info</h1>
    <DebugInfo />
  </div>
);

// No placeholder components needed - all routes are implemented

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
        <div className="App">
          <Routes>
            {/* Public routes */}
            <Route path="/login" element={<Login />} />
            <Route path="/verify-email" element={<EmailVerification />} />
            <Route path="/dev" element={<DevInfo />} />
            
            {/* Protected routes */}
            <Route path="/" element={<DashboardLayout />}>
              <Route index element={<Navigate to="/dashboard" replace />} />
              <Route path="dashboard" element={<Dashboard />} />
              <Route path="verifications" element={<Verifications />} />
              <Route path="verifications/start" element={<StartVerification />} />
              <Route path="users" element={<Users />} />
              <Route path="webhooks" element={<Webhooks />} />
              <Route path="analytics" element={<Analytics />} />
              <Route path="organization" element={<Organization />} />
              <Route path="billing" element={<Billing />} />
              <Route path="api-keys" element={<ApiKeys />} />
              <Route path="audit-logs" element={<AuditLogs />} />
              <Route path="team" element={<AdminUserManagement />} />
              <Route path="sessions" element={<Sessions />} />
              <Route path="provider-metrics" element={<ProviderMetrics />} />
              <Route path="settings" element={<Settings />} />
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
