import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import Login from './components/auth/Login';
import PlatformLayout from './components/layout/PlatformLayout';

// ── Pages ───────────────────────────────────────────────────────────────────
import Dashboard from './pages/Dashboard';
import Organizations from './pages/Organizations';
import OrganizationDetail from './pages/OrganizationDetail';
import Branding from './pages/Branding';
import EmailTemplates from './pages/EmailTemplates';
import AdminManagement from './pages/AdminManagement';
import Sessions from './pages/Sessions';
import ProviderMetrics from './pages/ProviderMetrics';
import AuditLogs from './pages/AuditLogs';
import Settings from './pages/Settings';
import VerificationSettings from './pages/VerificationSettings';
import SystemStatus from './pages/SystemStatus';
import Developers from './pages/Developers';

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

// ── App ──────────────────────────────────────────────────────────────────────
export default function App() {
  usePlatformFavicon();

  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />

          <Route path="/" element={<PlatformLayout />}>
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="organizations" element={<Organizations />} />
            <Route path="developers" element={<Developers />} />
            <Route path="organizations/:id" element={<OrganizationDetail />} />
            <Route path="branding" element={<Branding />} />
            <Route path="email-templates" element={<EmailTemplates />} />
            <Route path="admin-management" element={<AdminManagement />} />
            <Route path="sessions" element={<Sessions />} />
            <Route path="provider-metrics" element={<ProviderMetrics />} />
            <Route path="audit-logs" element={<AuditLogs />} />
            <Route path="verification-settings" element={<VerificationSettings />} />
            <Route path="system-status" element={<SystemStatus />} />
            <Route path="settings" element={<Settings />} />
          </Route>

          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
