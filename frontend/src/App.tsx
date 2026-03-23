import { Routes, Route, Navigate } from 'react-router-dom'
import { Layout } from './components/layout/Layout'
import { HomePage } from './pages/HomePage'
import { DeveloperPage } from './pages/DeveloperPage'
import { DemoPage } from './pages/DemoPage'
import UserVerificationPage from './pages/UserVerificationPage'
import { LiveCapturePage } from './pages/LiveCapturePage'
import MobileVerificationPage from './pages/MobileVerificationPage'
import { AdminPage } from './pages/AdminPage'
import { AdminLogin } from './pages/AdminLogin'
import { DocsPage } from './pages/DocsPage'
import { MarkdownDocsPage } from './pages/MarkdownDocsPage'
import { NotFoundPage } from './pages/NotFoundPage'
import { LegalPage } from './pages/LegalPage'
import { Status } from './pages/Status'
import { PatternShowcase } from './components/PatternShowcase'
import { isCommunity, isCloud } from './config/edition'

function App() {
  return (
    <Layout>
      <Routes>
        {/* Root route: community → Dev Portal, cloud → Marketing homepage */}
        <Route path="/" element={isCommunity ? <DeveloperPage /> : <HomePage />} />

        {/* Dev Portal — always available */}
        <Route path="/developer" element={<DeveloperPage />} />

        {/* Demo — available in both editions */}
        <Route path="/demo" element={<DemoPage />} />
        <Route path="/verify" element={<Navigate to="/demo" replace />} />

        {/* Cloud-only marketing routes — redirect to portal in community */}
        <Route path="/patterns" element={isCloud ? <PatternShowcase /> : <Navigate to="/" replace />} />

        {/* Shared routes — both editions */}
        <Route path="/user-verification" element={<UserVerificationPage />} />
        <Route path="/live-capture" element={<LiveCapturePage />} />
        <Route path="/verify/mobile" element={<MobileVerificationPage />} />
        <Route path="/docs/markdown" element={<MarkdownDocsPage />} />
        <Route path="/docs" element={<DocsPage />} />
        <Route path="/status" element={<Status />} />
        <Route path="/legal" element={<LegalPage />} />
        <Route path="/admin/login" element={<AdminLogin />} />
        <Route path="/admin/*" element={<AdminPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Layout>
  )
}

export default App
