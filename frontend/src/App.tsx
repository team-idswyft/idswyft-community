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
import { NotFoundPage } from './pages/NotFoundPage'
import { Status } from './pages/Status'
import { PatternShowcase } from './components/PatternShowcase'

function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/developer" element={<DeveloperPage />} />
        <Route path="/verify" element={<Navigate to="/demo" replace />} />
        <Route path="/demo" element={<DemoPage />} />
        <Route path="/user-verification" element={<UserVerificationPage />} />
        <Route path="/live-capture" element={<LiveCapturePage />} />
        <Route path="/verify/mobile" element={<MobileVerificationPage />} />
        <Route path="/docs" element={<DocsPage />} />
        <Route path="/status" element={<Status />} />
        <Route path="/patterns" element={<PatternShowcase />} />
        <Route path="/admin/login" element={<AdminLogin />} />
        <Route path="/admin/*" element={<AdminPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Layout>
  )
}

export default App