import { Routes, Route, Navigate } from 'react-router-dom'
import { Layout } from './components/layout/Layout'
import { HomePageV2 } from './pages/HomePageV2'
import { DeveloperPage } from './pages/DeveloperPage'
import { DemoPage } from './pages/DemoPage'
import UserVerificationPage from './pages/UserVerificationPage'
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
import { PricingPage } from './pages/PricingPage'
import { Status } from './pages/Status'
import { SetupPage } from './pages/SetupPage'
import { PatternShowcase } from './components/PatternShowcase'
import { isCommunity, isCloud } from './config/edition'

function App() {
  return (
    <Layout>
      <Routes>
        {/* Root route: community → Dev Portal, cloud → Glassmorphic homepage */}
        <Route path="/" element={isCommunity ? <DeveloperPage /> : <HomePageV2 />} />

        {/* Dev Portal — always available */}
        <Route path="/developer" element={<DeveloperPage />} />

        {/* Demo — available in both editions */}
        <Route path="/demo" element={<DemoPage />} />
        <Route path="/verify" element={<Navigate to="/demo" replace />} />

        {/* Cloud-only marketing routes — redirect to portal in community */}
        <Route path="/pricing" element={isCloud ? <PricingPage /> : <Navigate to="/" replace />} />
        <Route path="/patterns" element={isCloud ? <PatternShowcase /> : <Navigate to="/" replace />} />

        {/* Shared routes — both editions */}
        <Route path="/user-verification" element={<UserVerificationPage />} />
        <Route path="/live-capture" element={<LiveCapturePage />} />
        <Route path="/verify/mobile" element={<MobileVerificationPage />} />
        <Route path="/docs/markdown" element={<MarkdownDocsPage />} />
        <Route path="/docs/review" element={<ReviewDashboardDocs />} />
        <Route path="/docs/guides" element={<DocsGuides />} />
        <Route path="/docs/sdk" element={<DocsSdk />} />
        <Route path="/docs/features" element={<DocsFeatures />} />
        <Route path="/docs/reference" element={<DocsReference />} />
        <Route path="/docs" element={<DocsPage />} />
        {/* Community-only setup wizard — redirect to portal in cloud */}
        <Route path="/setup" element={isCommunity ? <SetupPage /> : <Navigate to="/" replace />} />
        <Route path="/status" element={<Status />} />
        <Route path="/legal" element={<LegalPage />} />
        <Route path="/admin/login" element={<AdminLogin />} />
        <Route path="/admin/verifications" element={<VerificationManagement />} />
        <Route path="/admin/developers" element={<DevelopersList />} />
        <Route path="/admin/*" element={<Navigate to="/admin/verifications" replace />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Layout>
  )
}

export default App
