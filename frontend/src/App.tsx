import { Routes, Route, Navigate } from 'react-router-dom'
import { ErrorBoundary } from './components/ErrorBoundary'
import { Layout } from './components/layout/Layout'
import { DeveloperPage } from './pages/DeveloperPage'
import { DemoPage } from './pages/DemoPage'
import UserVerificationPage from './pages/UserVerificationPage'
import PageBuilderPage from './pages/PageBuilderPage'
import { LiveCapturePage } from './pages/LiveCapturePage'
import MobileVerificationPage from './pages/MobileVerificationPage'
import { AdminLogin } from './pages/AdminLogin'
import { VerificationManagement } from './pages/VerificationManagement'
import { DevelopersList } from './pages/DevelopersList'
import { DocsPage } from './pages/DocsPage'
import { DocsGuides } from './pages/DocsGuides'
import { DocsSdk } from './pages/DocsSdk'
import { DocsFeatures } from './pages/DocsFeatures'
import { DocsReference } from './pages/DocsReference'
import { ReviewDashboardDocs } from './pages/ReviewDashboardDocs'
import { MarkdownDocsPage } from './pages/MarkdownDocsPage'
import { NotFoundPage } from './pages/NotFoundPage'
import { LegalPage } from './pages/LegalPage'
import { SetupPage } from './pages/SetupPage'
import { VerifyCredentialPage } from './pages/VerifyCredentialPage'

function App() {
  return (
    <ErrorBoundary>
    <Layout>
      <Routes>
        {/* Root route: Dev Portal */}
        <Route path="/" element={<DeveloperPage />} />

        {/* Dev Portal */}
        <Route path="/developer" element={<DeveloperPage />} />

        {/* Demo */}
        <Route path="/demo" element={<DemoPage />} />
        <Route path="/verify" element={<Navigate to="/demo" replace />} />
        <Route path="/verify-credential" element={<VerifyCredentialPage />} />

        {/* Shared routes */}
        <Route path="/user-verification" element={<UserVerificationPage />} />
        <Route path="/v/:slug" element={<UserVerificationPage />} />
        <Route path="/developer/page-builder" element={<PageBuilderPage />} />
        <Route path="/live-capture" element={<LiveCapturePage />} />
        <Route path="/verify/mobile" element={<MobileVerificationPage />} />
        <Route path="/docs/markdown" element={<MarkdownDocsPage />} />
        <Route path="/docs/review" element={<ReviewDashboardDocs />} />
        <Route path="/docs/guides" element={<DocsGuides />} />
        <Route path="/docs/sdk" element={<DocsSdk />} />
        <Route path="/docs/features" element={<DocsFeatures />} />
        <Route path="/docs/reference" element={<DocsReference />} />
        <Route path="/docs" element={<DocsPage />} />
        <Route path="/setup" element={<SetupPage />} />
        <Route path="/legal" element={<LegalPage />} />
        <Route path="/admin/login" element={<AdminLogin />} />
        <Route path="/admin/verifications" element={<VerificationManagement />} />
        <Route path="/admin/developers" element={<DevelopersList />} />
        <Route path="/admin/*" element={<Navigate to="/admin/verifications" replace />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Layout>
    </ErrorBoundary>
  )
}

export default App
