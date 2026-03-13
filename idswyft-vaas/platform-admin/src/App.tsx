import React from 'react';
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
import Settings from './pages/Settings';

// ── App ──────────────────────────────────────────────────────────────────────
export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />

          <Route path="/" element={<PlatformLayout />}>
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="organizations" element={<Organizations />} />
            <Route path="organizations/:id" element={<OrganizationDetail />} />
            <Route path="branding" element={<Branding />} />
            <Route path="email-templates" element={<EmailTemplates />} />
            <Route path="admin-management" element={<AdminManagement />} />
            <Route path="settings" element={<Settings />} />
          </Route>

          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
