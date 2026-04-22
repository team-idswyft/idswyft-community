import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import { API_BASE_URL } from '../../config/api'
import { csrfHeader, clearCsrfToken } from '../../lib/csrf'
import { C } from '../../theme'
import { isCloud } from '../../config/edition'
import {
  Cog6ToothIcon,
  UserCircleIcon,
  UsersIcon,
  XMarkIcon,
  CodeBracketIcon,
  DevicePhoneMobileIcon,
  PaintBrushIcon,
  EyeIcon,
  EyeSlashIcon,
  ExclamationTriangleIcon,
  FingerPrintIcon,
  ShieldExclamationIcon,
  ShieldCheckIcon,
  MicrophoneIcon,
} from '@heroicons/react/24/outline'
import { inputStyle, labelStyle } from './types'

type SettingsTab = 'profile' | 'team' | 'integrations' | 'branding' | 'account'

const tabs: Array<{ id: SettingsTab; label: string; icon: React.ComponentType<{ style?: React.CSSProperties }>; bottom?: boolean }> = [
  { id: 'profile', label: 'Profile', icon: UserCircleIcon },
  { id: 'team', label: 'Team', icon: UsersIcon },
  { id: 'integrations', label: 'Integrations', icon: CodeBracketIcon },
  { id: 'branding', label: 'Branding', icon: PaintBrushIcon },
  { id: 'account', label: 'Account', icon: ExclamationTriangleIcon, bottom: true },
]

interface SettingsModalProps {
  token: string
  onClose: () => void
  onAccountDeleted: () => void
}

export function SettingsModal({ token, onClose, onAccountDeleted }: SettingsModalProps) {
  const authHeaders = (token === 'session' ? {} : { Authorization: `Bearer ${token}` }) as Record<string, string>
  // Profile settings
  const [profileName, setProfileName] = useState('')
  const [profileCompany, setProfileCompany] = useState('')
  const [profileEmail, setProfileEmail] = useState('')
  const [profileAvatarUrl, setProfileAvatarUrl] = useState('')
  const [profileLoading, setProfileLoading] = useState(false)
  const [profileSaving, setProfileSaving] = useState(false)

  // LLM Enhancement settings
  const [llmProvider, setLlmProvider] = useState<string>('')
  const [llmApiKey, setLlmApiKey] = useState<string>('')
  const [llmEndpointUrl, setLlmEndpointUrl] = useState<string>('')
  const [llmKeyPreview, setLlmKeyPreview] = useState<string>('')
  const [llmConfigured, setLlmConfigured] = useState(false)
  const [llmSaving, setLlmSaving] = useState(false)
  const [llmLoading, setLlmLoading] = useState(false)
  const [showLlmKey, setShowLlmKey] = useState(false)

  // SMS Provider settings
  const [smsProvider, setSmsProvider] = useState<string>('')
  const [smsApiKey, setSmsApiKey] = useState<string>('')
  const [smsApiSecret, setSmsApiSecret] = useState<string>('')
  const [smsPhoneNumber, setSmsPhoneNumber] = useState<string>('')
  const [smsKeyPreview, setSmsKeyPreview] = useState<string>('')
  const [smsConfigured, setSmsConfigured] = useState(false)
  const [smsSaving, setSmsSaving] = useState(false)
  const [smsLoading, setSmsLoading] = useState(false)
  const [showSmsKey, setShowSmsKey] = useState(false)

  // AML / Sanctions screening settings
  const [amlEnabled, setAmlEnabled] = useState(true)
  const [amlLoading, setAmlLoading] = useState(false)
  const [amlSaving, setAmlSaving] = useState(false)

  // Duplicate detection settings
  const [dedupEnabled, setDedupEnabled] = useState(false)
  const [dedupAction, setDedupAction] = useState<string>('review')
  const [dedupLoading, setDedupLoading] = useState(false)
  const [dedupSaving, setDedupSaving] = useState(false)

  // Voice authentication settings
  const [voiceAuthEnabled, setVoiceAuthEnabled] = useState(false)
  const [voiceAuthLoading, setVoiceAuthLoading] = useState(false)
  const [voiceAuthSaving, setVoiceAuthSaving] = useState(false)

  // Verifiable Credentials settings (cloud-only)
  const [vcEnabled, setVcEnabled] = useState(false)
  const [vcLoading, setVcLoading] = useState(false)
  const [vcSaving, setVcSaving] = useState(false)

  // Page branding settings
  const [brandLogoUrl, setBrandLogoUrl] = useState<string>('')
  const [brandAccentColor, setBrandAccentColor] = useState<string>('')
  const [brandCompanyName, setBrandCompanyName] = useState<string>('')
  const [brandConfigured, setBrandConfigured] = useState(false)
  const [brandSaving, setBrandSaving] = useState(false)
  const [brandLoading, setBrandLoading] = useState(false)

  // Reviewer management
  const [reviewers, setReviewers] = useState<Array<{ id: string; email: string; name?: string; role?: string; status: string; invited_at: string; last_login_at?: string }>>([])
  const [reviewerEmail, setReviewerEmail] = useState('')
  const [reviewerName, setReviewerName] = useState('')
  const [reviewerRole, setReviewerRole] = useState<'reviewer' | 'admin'>('reviewer')
  const [reviewerInviting, setReviewerInviting] = useState(false)

  // Danger zone
  const [showDeleteAccount, setShowDeleteAccount] = useState(false)
  const [deleteAccountEmail, setDeleteAccountEmail] = useState('')
  const [deleteAccountLoading, setDeleteAccountLoading] = useState(false)

  // Active settings tab
  const [activeTab, setActiveTab] = useState<SettingsTab>('profile')

  // Fetch data on mount
  useEffect(() => {
    if (!token) return
    fetchProfile()
    fetchLLMSettings()
    fetchSMSSettings()
    fetchAmlSettings()
    fetchDedupSettings()
    fetchVoiceAuthSettings()
    if (isCloud) fetchVcSettings()
    fetchBrandingSettings()
    fetchReviewers()
  }, [token])

  const fetchProfile = async () => {
    setProfileLoading(true)
    try {
      const res = await fetch(`${API_BASE_URL}/api/developer/profile`, {
        headers: authHeaders,
        credentials: 'include' as RequestCredentials,
      })
      if (res.ok) {
        const { data } = await res.json()
        setProfileName(data.name || '')
        setProfileCompany(data.company || '')
        setProfileEmail(data.email || '')
        setProfileAvatarUrl(data.avatar_url || '')
      }
    } catch { /* network error */ }
    setProfileLoading(false)
  }

  const saveProfile = async () => {
    if (!token) return
    setProfileSaving(true)
    try {
      const res = await fetch(`${API_BASE_URL}/api/developer/profile`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...authHeaders, ...csrfHeader() }, credentials: 'include' as RequestCredentials,
        body: JSON.stringify({ name: profileName, company: profileCompany || null }),
      })
      if (res.ok) {
        toast.success('Profile updated')
      } else {
        const err = await res.json().catch(() => ({}))
        toast.error(err.message || 'Failed to update profile')
      }
    } catch { toast.error('Network error') }
    setProfileSaving(false)
  }

  const uploadAvatar = async (file: File) => {
    if (!token) return
    const formData = new FormData()
    formData.append('file', file)
    try {
      const res = await fetch(`${API_BASE_URL}/api/developer/avatar`, {
        method: 'POST',
        headers: { ...authHeaders, ...csrfHeader() },
        credentials: 'include' as RequestCredentials,
        body: formData,
      })
      if (res.ok) {
        const { data } = await res.json()
        setProfileAvatarUrl(data.avatar_url)
        toast.success('Avatar updated')
      } else {
        const err = await res.json().catch(() => ({}))
        toast.error(err.message || 'Failed to upload avatar')
      }
    } catch { toast.error('Network error') }
  }

  const fetchLLMSettings = async () => {
    setLlmLoading(true)
    try {
      const res = await fetch(`${API_BASE_URL}/api/developer/settings/llm`, {
        headers: authHeaders,
        credentials: 'include' as RequestCredentials,
      })
      if (res.ok) {
        const data = await res.json()
        setLlmConfigured(data.configured)
        setLlmProvider(data.provider || '')
        setLlmKeyPreview(data.api_key_preview || '')
        setLlmEndpointUrl(data.endpoint_url || '')
        setLlmApiKey('')
        setShowLlmKey(false)
      }
    } catch { /* network error */ }
    setLlmLoading(false)
  }

  const saveLLMSettings = async () => {
    if (!token) return
    setLlmSaving(true)
    try {
      const body: Record<string, string | null> = { provider: llmProvider || null }
      if (llmApiKey) body.api_key = llmApiKey
      if (llmProvider === 'custom') body.endpoint_url = llmEndpointUrl || null
      const res = await fetch(`${API_BASE_URL}/api/developer/settings/llm`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...authHeaders, ...csrfHeader() }, credentials: 'include' as RequestCredentials,
        body: JSON.stringify(body),
      })
      if (res.ok) {
        toast.success(llmProvider ? 'LLM settings saved' : 'LLM settings cleared')
        fetchLLMSettings()
      } else {
        const err = await res.json().catch(() => ({ error: 'Failed to save' }))
        toast.error(err.error || 'Failed to save LLM settings')
      }
    } catch { toast.error('Network error') }
    setLlmSaving(false)
  }

  const clearLLMSettings = async () => {
    if (!token) return
    setLlmSaving(true)
    try {
      const res = await fetch(`${API_BASE_URL}/api/developer/settings/llm`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...authHeaders, ...csrfHeader() }, credentials: 'include' as RequestCredentials,
        body: JSON.stringify({ provider: null }),
      })
      if (res.ok) {
        toast.success('LLM settings cleared')
        setLlmProvider('')
        setLlmApiKey('')
        setLlmEndpointUrl('')
        setLlmKeyPreview('')
        setLlmConfigured(false)
      }
    } catch { toast.error('Network error') }
    setLlmSaving(false)
  }

  const fetchSMSSettings = async () => {
    setSmsLoading(true)
    try {
      const res = await fetch(`${API_BASE_URL}/api/developer/settings/sms`, {
        headers: authHeaders,
        credentials: 'include' as RequestCredentials,
      })
      if (res.ok) {
        const data = await res.json()
        setSmsConfigured(data.configured)
        setSmsProvider(data.provider || '')
        setSmsKeyPreview(data.api_key_preview || '')
        setSmsPhoneNumber(data.phone_number || '')
        setSmsApiKey('')
        setSmsApiSecret('')
        setShowSmsKey(false)
      }
    } catch { /* network error */ }
    setSmsLoading(false)
  }

  const saveSMSSettings = async () => {
    if (!token) return
    setSmsSaving(true)
    try {
      const body: Record<string, string | null> = { provider: smsProvider || null }
      if (smsApiKey) body.api_key = smsApiKey
      if (smsApiSecret) body.api_secret = smsApiSecret
      if (smsPhoneNumber) body.phone_number = smsPhoneNumber
      const res = await fetch(`${API_BASE_URL}/api/developer/settings/sms`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...authHeaders, ...csrfHeader() }, credentials: 'include' as RequestCredentials,
        body: JSON.stringify(body),
      })
      if (res.ok) {
        toast.success(smsProvider ? 'SMS settings saved' : 'SMS settings cleared')
        fetchSMSSettings()
      } else {
        const err = await res.json().catch(() => ({ error: 'Failed to save' }))
        toast.error(err.error || err.message || 'Failed to save SMS settings')
      }
    } catch { toast.error('Network error') }
    setSmsSaving(false)
  }

  const clearSMSSettings = async () => {
    if (!token) return
    setSmsSaving(true)
    try {
      const res = await fetch(`${API_BASE_URL}/api/developer/settings/sms`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...authHeaders, ...csrfHeader() }, credentials: 'include' as RequestCredentials,
        body: JSON.stringify({ provider: null }),
      })
      if (res.ok) {
        toast.success('SMS settings cleared')
        setSmsProvider('')
        setSmsApiKey('')
        setSmsApiSecret('')
        setSmsPhoneNumber('')
        setSmsKeyPreview('')
        setSmsConfigured(false)
      }
    } catch { toast.error('Network error') }
    setSmsSaving(false)
  }

  const fetchAmlSettings = async () => {
    setAmlLoading(true)
    try {
      const res = await fetch(`${API_BASE_URL}/api/developer/settings/aml`, {
        headers: authHeaders,
        credentials: 'include' as RequestCredentials,
      })
      if (res.ok) {
        const data = await res.json()
        setAmlEnabled(data.enabled ?? true)
      }
    } catch { /* network error */ }
    setAmlLoading(false)
  }

  const saveAmlSettings = async () => {
    if (!token) return
    setAmlSaving(true)
    try {
      const res = await fetch(`${API_BASE_URL}/api/developer/settings/aml`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...authHeaders, ...csrfHeader() },
        credentials: 'include' as RequestCredentials,
        body: JSON.stringify({ enabled: amlEnabled }),
      })
      if (res.ok) {
        toast.success('AML screening settings saved')
      } else {
        const err = await res.json().catch(() => ({}))
        toast.error(err.error || 'Failed to save settings')
      }
    } catch { toast.error('Network error') }
    setAmlSaving(false)
  }

  const fetchDedupSettings = async () => {
    setDedupLoading(true)
    try {
      const res = await fetch(`${API_BASE_URL}/api/developer/settings/duplicate-detection`, {
        headers: authHeaders,
        credentials: 'include' as RequestCredentials,
      })
      if (res.ok) {
        const data = await res.json()
        setDedupEnabled(data.enabled ?? false)
        setDedupAction(data.action ?? 'review')
      }
    } catch { /* network error */ }
    setDedupLoading(false)
  }

  const saveDedupSettings = async () => {
    if (!token) return
    setDedupSaving(true)
    try {
      const res = await fetch(`${API_BASE_URL}/api/developer/settings/duplicate-detection`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...authHeaders, ...csrfHeader() },
        credentials: 'include' as RequestCredentials,
        body: JSON.stringify({ enabled: dedupEnabled, action: dedupAction }),
      })
      if (res.ok) {
        toast.success('Duplicate detection settings saved')
      } else {
        const err = await res.json().catch(() => ({}))
        toast.error(err.error || 'Failed to save settings')
      }
    } catch { toast.error('Network error') }
    setDedupSaving(false)
  }

  const fetchVoiceAuthSettings = async () => {
    setVoiceAuthLoading(true)
    try {
      const res = await fetch(`${API_BASE_URL}/api/developer/settings/voice-auth`, {
        headers: authHeaders,
        credentials: 'include' as RequestCredentials,
      })
      if (res.ok) {
        const data = await res.json()
        setVoiceAuthEnabled(data.enabled ?? false)
      }
    } catch { /* network error */ }
    setVoiceAuthLoading(false)
  }

  const saveVoiceAuthSettings = async () => {
    if (!token) return
    setVoiceAuthSaving(true)
    try {
      const res = await fetch(`${API_BASE_URL}/api/developer/settings/voice-auth`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...authHeaders, ...csrfHeader() },
        credentials: 'include' as RequestCredentials,
        body: JSON.stringify({ enabled: voiceAuthEnabled }),
      })
      if (res.ok) {
        toast.success('Voice authentication settings saved')
      } else {
        const err = await res.json().catch(() => ({}))
        toast.error(err.error || 'Failed to save settings')
      }
    } catch { toast.error('Network error') }
    setVoiceAuthSaving(false)
  }

  const fetchVcSettings = async () => {
    setVcLoading(true)
    try {
      const res = await fetch(`${API_BASE_URL}/api/developer/settings/vc`, {
        headers: authHeaders,
        credentials: 'include' as RequestCredentials,
      })
      if (res.ok) {
        const data = await res.json()
        setVcEnabled(data.enabled ?? false)
      }
    } catch { /* network error */ }
    setVcLoading(false)
  }

  const saveVcSettings = async () => {
    if (!token) return
    setVcSaving(true)
    try {
      const res = await fetch(`${API_BASE_URL}/api/developer/settings/vc`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...authHeaders, ...csrfHeader() },
        credentials: 'include' as RequestCredentials,
        body: JSON.stringify({ enabled: vcEnabled }),
      })
      if (res.ok) {
        toast.success('Verifiable Credentials settings saved')
      } else {
        const err = await res.json().catch(() => ({}))
        toast.error(err.error || 'Failed to save settings')
      }
    } catch { toast.error('Network error') }
    setVcSaving(false)
  }

  const fetchBrandingSettings = async () => {
    setBrandLoading(true)
    try {
      const res = await fetch(`${API_BASE_URL}/api/developer/settings/branding`, {
        headers: authHeaders,
        credentials: 'include' as RequestCredentials,
      })
      if (res.ok) {
        const data = await res.json()
        setBrandConfigured(data.configured)
        setBrandLogoUrl(data.logo_url || '')
        setBrandAccentColor(data.accent_color || '')
        setBrandCompanyName(data.company_name || '')
      }
    } catch { /* network error */ }
    setBrandLoading(false)
  }

  const saveBrandingSettings = async () => {
    if (!token) return
    setBrandSaving(true)
    try {
      const res = await fetch(`${API_BASE_URL}/api/developer/settings/branding`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...authHeaders, ...csrfHeader() }, credentials: 'include' as RequestCredentials,
        body: JSON.stringify({
          logo_url: brandLogoUrl || null,
          accent_color: brandAccentColor || null,
          company_name: brandCompanyName || null,
        }),
      })
      if (res.ok) {
        toast.success('Branding saved')
        fetchBrandingSettings()
      } else {
        const err = await res.json().catch(() => ({ error: 'Failed to save' }))
        toast.error(err.error || err.message || 'Failed to save branding')
      }
    } catch { toast.error('Network error') }
    setBrandSaving(false)
  }

  const clearBrandingSettings = async () => {
    if (!token) return
    setBrandSaving(true)
    try {
      const res = await fetch(`${API_BASE_URL}/api/developer/settings/branding`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...authHeaders, ...csrfHeader() }, credentials: 'include' as RequestCredentials,
        body: JSON.stringify({ logo_url: null, accent_color: null, company_name: null }),
      })
      if (res.ok) {
        toast.success('Branding cleared')
        setBrandLogoUrl('')
        setBrandAccentColor('')
        setBrandCompanyName('')
        setBrandConfigured(false)
      }
    } catch { toast.error('Network error') }
    setBrandSaving(false)
  }

  const uploadBrandingLogo = async (file: File) => {
    if (!token) return
    const formData = new FormData()
    formData.append('file', file)
    try {
      const res = await fetch(`${API_BASE_URL}/api/developer/branding/logo`, {
        method: 'POST',
        headers: { ...authHeaders, ...csrfHeader() },
        credentials: 'include' as RequestCredentials,
        body: formData,
      })
      if (res.ok) {
        const { data } = await res.json()
        setBrandLogoUrl(data.logo_url)
        toast.success('Logo uploaded')
      } else {
        const err = await res.json().catch(() => ({}))
        toast.error(err.message || 'Failed to upload logo')
      }
    } catch { toast.error('Network error') }
  }

  const fetchReviewers = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/developer/reviewers`, {
        headers: authHeaders,
        credentials: 'include' as RequestCredentials,
      })
      if (res.ok) {
        const data = await res.json()
        setReviewers(data.reviewers ?? [])
      }
    } catch { /* network error */ }
  }

  const inviteReviewer = async () => {
    if (!token || !reviewerEmail) return
    setReviewerInviting(true)
    try {
      const res = await fetch(`${API_BASE_URL}/api/developer/reviewers/invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders, ...csrfHeader() }, credentials: 'include' as RequestCredentials,
        body: JSON.stringify({ email: reviewerEmail, name: reviewerName || undefined, role: reviewerRole }),
      })
      const data = await res.json()
      if (res.ok) {
        setReviewers(prev => [data.reviewer, ...prev])
        setReviewerEmail('')
        setReviewerName('')
        setReviewerRole('reviewer')
        toast.success('Reviewer invited')
      } else {
        toast.error(data.message || 'Failed to invite reviewer')
      }
    } catch { toast.error('Network error') }
    setReviewerInviting(false)
  }

  const revokeReviewer = async (id: string) => {
    if (!token) return
    try {
      const res = await fetch(`${API_BASE_URL}/api/developer/reviewers/${id}`, {
        method: 'DELETE',
        headers: { ...authHeaders, ...csrfHeader() },
        credentials: 'include' as RequestCredentials,
      })
      if (res.ok) {
        setReviewers(prev => prev.map(r => r.id === id ? { ...r, status: 'revoked' } : r))
        toast.success('Reviewer access revoked')
      } else {
        const data = await res.json().catch(() => ({}))
        toast.error(data.message || 'Failed to revoke reviewer')
      }
    } catch { toast.error('Network error') }
  }

  const deleteAccount = async () => {
    if (!token) return
    setDeleteAccountLoading(true)
    try {
      const res = await fetch(`${API_BASE_URL}/api/developer/account`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', ...authHeaders, ...csrfHeader() },
        credentials: 'include' as RequestCredentials,
        body: JSON.stringify({ confirm_email: deleteAccountEmail }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message || 'Failed to delete account')
      fetch(`${API_BASE_URL}/api/auth/logout`, { method: 'POST', credentials: 'include', headers: { ...authHeaders, ...csrfHeader() } }).catch(() => {})
      clearCsrfToken()
      toast.success('Account deleted')
      onAccountDeleted()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete account')
    } finally {
      setDeleteAccountLoading(false)
      setShowDeleteAccount(false)
      setDeleteAccountEmail('')
    }
  }

  return (
    <>
      <div
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '80px 16px 24px' }}
        onClick={onClose}
      >
        <div
          style={{ width: '100%', maxWidth: 1200, height: '80vh', background: C.panel, border: `1px solid ${C.border}`, borderRadius: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '24px 28px 20px', borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Cog6ToothIcon style={{ width: 18, height: 18, color: C.text }} />
              <div style={{ fontFamily: C.mono, fontWeight: 600, fontSize: 14, color: C.text, letterSpacing: '0.02em' }}>Settings</div>
            </div>
            <button
              onClick={onClose}
              style={{ background: 'none', border: `1px solid ${C.border}`, color: C.muted, cursor: 'pointer', fontSize: 13, padding: '4px 10px', borderRadius: 0, fontFamily: C.mono }}
            >
              &times;
            </button>
          </div>

          {/* Sidebar + Content */}
          <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>

            {/* Sidebar */}
            <nav style={{ width: 220, flexShrink: 0, background: C.surface, borderRight: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column', paddingTop: 8 }}>
              {/* Main tabs */}
              {tabs.filter(t => !t.bottom).map(tab => {
                const isActive = activeTab === tab.id
                const Icon = tab.icon
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10, height: 40,
                      paddingLeft: isActive ? 13 : 16, paddingRight: 16,
                      background: isActive ? C.surfaceHover : 'transparent',
                      border: 'none', borderLeftStyle: 'solid', borderLeftWidth: 2,
                      borderLeftColor: isActive ? C.accent : 'transparent',
                      color: isActive ? C.text : C.muted,
                      fontSize: 12, fontWeight: 500, cursor: 'pointer', width: '100%',
                      borderRadius: 0, textAlign: 'left',
                      fontFamily: C.mono,
                    }}
                    onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = C.surfaceHover }}
                    onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent' }}
                  >
                    <Icon style={{ width: 16, height: 16, flexShrink: 0 }} />
                    {tab.label}
                  </button>
                )
              })}

              {/* Spacer */}
              <div style={{ flex: 1 }} />

              {/* Divider */}
              <div style={{ borderTop: `1px solid ${C.border}`, margin: '0 16px' }} />

              {/* Bottom tabs (Account) */}
              {tabs.filter(t => t.bottom).map(tab => {
                const isActive = activeTab === tab.id
                const Icon = tab.icon
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10, height: 40,
                      paddingLeft: isActive ? 13 : 16, paddingRight: 16,
                      background: isActive ? C.surfaceHover : 'transparent',
                      border: 'none', borderLeftStyle: 'solid', borderLeftWidth: 2,
                      borderLeftColor: isActive ? C.red : 'transparent',
                      color: isActive ? C.text : C.muted,
                      fontSize: 12, fontWeight: 500, cursor: 'pointer', width: '100%',
                      borderRadius: 0, textAlign: 'left',
                      fontFamily: C.mono,
                    }}
                    onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = C.surfaceHover }}
                    onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent' }}
                  >
                    <Icon style={{ width: 16, height: 16, flexShrink: 0, color: C.red }} />
                    {tab.label}
                  </button>
                )
              })}
              <div style={{ height: 8 }} />
            </nav>

            {/* Content panel */}
            <div style={{ flex: 1, padding: 32, overflowY: 'auto' }}>

              {/* ─── Profile ─── */}
              {activeTab === 'profile' && (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                    <UserCircleIcon style={{ width: 16, height: 16, color: C.accent }} />
                    <div style={{ fontFamily: C.mono, fontWeight: 600, fontSize: 13, color: C.text }}>Profile</div>
                  </div>

                  {profileLoading ? (
                    <div style={{ color: C.muted, fontSize: 13 }}>Loading...</div>
                  ) : (
                    <>
                      {/* Avatar */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
                        <div
                          style={{ position: 'relative', width: 48, height: 48, borderRadius: '50%', overflow: 'hidden', cursor: 'pointer', flexShrink: 0, border: `1px solid ${C.border}` }}
                          onClick={() => document.getElementById('avatar-input')?.click()}
                        >
                          {profileAvatarUrl ? (
                            <img src={profileAvatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          ) : (
                            <div style={{ width: '100%', height: '100%', background: C.surface, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <UserCircleIcon style={{ width: 28, height: 28, color: C.dim }} />
                            </div>
                          )}
                          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0, transition: 'opacity 0.15s' }}
                            onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
                            onMouseLeave={e => (e.currentTarget.style.opacity = '0')}
                          >
                            <span style={{ fontSize: 10, color: '#fff', fontWeight: 600 }}>Change</span>
                          </div>
                        </div>
                        <input
                          id="avatar-input"
                          type="file"
                          accept="image/jpeg,image/png"
                          style={{ display: 'none' }}
                          onChange={e => {
                            const file = e.target.files?.[0]
                            if (file && file.size > 2 * 1024 * 1024) {
                              toast.error('File must be under 2 MB')
                              e.target.value = ''
                              return
                            }
                            if (file) uploadAvatar(file)
                            e.target.value = ''
                          }}
                        />
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 12, color: C.muted, marginBottom: 2 }}>Click avatar to change</div>
                          <div style={{ fontSize: 11, color: C.dim }}>JPEG or PNG, max 2 MB</div>
                        </div>
                      </div>

                      {/* Email (read-only) */}
                      <label style={labelStyle}>Email</label>
                      <input
                        type="email"
                        value={profileEmail}
                        readOnly
                        style={{ ...inputStyle, marginBottom: 12, opacity: 0.5, cursor: 'not-allowed' }}
                      />

                      {/* Name */}
                      <label style={labelStyle}>Name</label>
                      <input
                        type="text"
                        value={profileName}
                        onChange={e => setProfileName(e.target.value)}
                        style={{ ...inputStyle, marginBottom: 12 }}
                        placeholder="Your name"
                      />

                      {/* Company */}
                      <label style={labelStyle}>Company <span style={{ color: C.dim, fontWeight: 400 }}>(optional)</span></label>
                      <input
                        type="text"
                        value={profileCompany}
                        onChange={e => setProfileCompany(e.target.value)}
                        style={{ ...inputStyle, marginBottom: 12 }}
                        placeholder="Your company"
                      />

                      {/* Save button */}
                      <button
                        onClick={saveProfile}
                        disabled={profileSaving || !profileName.trim()}
                        className="btn-accent"
                        style={{
                          opacity: (profileSaving || !profileName.trim()) ? 0.5 : 1,
                        }}
                      >
                        {profileSaving ? 'Saving...' : 'Save Profile'}
                      </button>
                    </>
                  )}
                </div>
              )}

              {/* ─── Team ─── */}
              {activeTab === 'team' && (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <UsersIcon style={{ width: 16, height: 16, color: C.accent }} />
                    <div style={{ fontFamily: C.mono, fontWeight: 600, fontSize: 13, color: C.text }}>Team Management</div>
                  </div>
                  <div style={{ color: C.muted, fontSize: 13, marginBottom: 16, lineHeight: 1.6 }}>
                    Invite team members to review and manage your verifications. <strong style={{ color: C.text }}>Organization Admins</strong> can
                    override decisions, access analytics, and manage GDPR requests. <strong style={{ color: C.text }}>Reviewers</strong> can approve or reject verifications.
                    Everyone signs in via email code — no passwords needed.
                  </div>

                  {/* Invite form */}
                  <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
                    <input
                      type="email"
                      value={reviewerEmail}
                      onChange={e => setReviewerEmail(e.target.value)}
                      placeholder="reviewer@company.com"
                      style={{ ...inputStyle, flex: '1 1 160px', marginBottom: 0 }}
                    />
                    <input
                      type="text"
                      value={reviewerName}
                      onChange={e => setReviewerName(e.target.value)}
                      placeholder="Name (optional)"
                      style={{ ...inputStyle, flex: '0 1 120px', marginBottom: 0 }}
                    />
                    <select
                      value={reviewerRole}
                      onChange={e => setReviewerRole(e.target.value as 'reviewer' | 'admin')}
                      style={{ ...inputStyle, flex: '0 0 130px', marginBottom: 0, cursor: 'pointer', appearance: 'auto' }}
                    >
                      <option value="reviewer">Reviewer</option>
                      <option value="admin">Org Admin</option>
                    </select>
                    <button
                      onClick={inviteReviewer}
                      disabled={reviewerInviting || !reviewerEmail.includes('@')}
                      className="btn-accent"
                      style={{
                        opacity: (reviewerInviting || !reviewerEmail.includes('@')) ? 0.5 : 1,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {reviewerInviting ? 'Inviting...' : 'Invite'}
                    </button>
                  </div>

                  {/* Reviewers list */}
                  {reviewers.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {reviewers.map(r => (
                        <div key={r.id} style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          background: C.surface, border: `1px solid ${C.border}`, borderRadius: 0, padding: '8px 12px',
                          opacity: r.status === 'revoked' ? 0.45 : 1,
                        }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {r.email}
                              {r.name && <span style={{ color: C.dim, marginLeft: 6 }}>({r.name})</span>}
                            </div>
                            <div style={{ fontSize: 11, color: C.dim, marginTop: 2 }}>
                              {r.status === 'invited' && 'Invited'}
                              {r.status === 'active' && `Active${r.last_login_at ? ` \u00b7 Last login ${new Date(r.last_login_at).toLocaleDateString()}` : ''}`}
                              {r.status === 'revoked' && 'Revoked'}
                            </div>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, marginLeft: 8 }}>
                            {/* Role badge */}
                            <span style={{
                              fontFamily: C.mono, fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em',
                              padding: '2px 6px', borderRadius: 0,
                              background: r.role === 'admin' ? 'rgba(167,139,250,0.12)' : 'rgba(136,150,170,0.1)',
                              color: r.role === 'admin' ? '#a78bfa' : C.dim,
                              border: `1px solid ${r.role === 'admin' ? 'rgba(167,139,250,0.25)' : C.border}`,
                            }}>
                              {r.role === 'admin' ? 'Admin' : 'Reviewer'}
                            </span>
                            {/* Status badge */}
                            <span style={{
                              fontFamily: C.mono, fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em',
                              padding: '2px 6px', borderRadius: 0,
                              background: r.status === 'active' ? 'rgba(34,197,94,0.12)' : r.status === 'invited' ? 'rgba(34,211,238,0.1)' : 'rgba(248,113,113,0.1)',
                              color: r.status === 'active' ? '#22c55e' : r.status === 'invited' ? C.accent : C.red,
                              border: `1px solid ${r.status === 'active' ? 'rgba(34,197,94,0.25)' : r.status === 'invited' ? C.cyanBorder : 'rgba(248,113,113,0.25)'}`,
                            }}>
                              {r.status}
                            </span>
                            {r.status !== 'revoked' && (
                              <button
                                onClick={() => revokeReviewer(r.id)}
                                title="Revoke access"
                                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: C.dim, display: 'flex' }}
                                onMouseEnter={e => (e.currentTarget.style.color = C.red)}
                                onMouseLeave={e => (e.currentTarget.style.color = C.dim)}
                              >
                                <XMarkIcon style={{ width: 14, height: 14 }} />
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {reviewers.length === 0 && (
                    <div style={{ color: C.dim, fontSize: 12, textAlign: 'center', padding: '8px 0' }}>
                      No reviewers invited yet
                    </div>
                  )}

                  {/* Copy login link */}
                  <button
                    onClick={() => {
                      const url = `${window.location.origin}/admin/login`
                      navigator.clipboard.writeText(url).then(() => toast.success('Login link copied'))
                    }}
                    style={{
                      marginTop: 12, background: 'none', border: `1px solid ${C.borderStrong}`,
                      color: C.muted, borderRadius: 0, padding: '6px 12px', cursor: 'pointer', fontSize: 12, fontFamily: C.mono,
                    }}
                  >
                    Copy reviewer login link
                  </button>
                </div>
              )}

              {/* ─── Integrations ─── */}
              {activeTab === 'integrations' && (
                <div>
                  {/* OCR Enhancement (LLM Fallback) */}
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <CodeBracketIcon style={{ width: 16, height: 16, color: C.accent }} />
                      <div style={{ fontFamily: C.mono, fontWeight: 600, fontSize: 13, color: C.text }}>OCR Enhancement</div>
                    </div>
                    <div style={{ color: C.muted, fontSize: 13, marginBottom: 16, lineHeight: 1.6 }}>
                      This is completely optional. Our OCR pipeline extracts document fields using fast heuristics.
                      When you provide an LLM key, it acts as a <strong style={{ color: C.text, fontWeight: 500 }}>second-pass fallback</strong> --
                      only called for fields where heuristic confidence is below 60%.
                      This can improve accuracy on unusual layouts or poor-quality scans, but most documents process fine without it.
                      Your key is encrypted at rest and only used during your verifications.
                    </div>

                    {llmLoading ? (
                      <div style={{ color: C.muted, fontSize: 13 }}>Loading...</div>
                    ) : (
                      <>
                        {/* Provider select */}
                        <label style={labelStyle}>Provider</label>
                        <select
                          value={llmProvider}
                          onChange={e => { setLlmProvider(e.target.value); setLlmApiKey(''); setShowLlmKey(false) }}
                          style={{ ...inputStyle, marginBottom: 12, cursor: 'pointer', appearance: 'auto' }}
                        >
                          <option value="">None (disabled)</option>
                          <option value="openai">OpenAI (GPT-4o Vision)</option>
                          <option value="anthropic">Anthropic (Claude Vision)</option>
                          <option value="custom">Custom (OpenAI-compatible endpoint)</option>
                        </select>

                        {llmProvider && (
                          <>
                            {/* API Key */}
                            <label style={labelStyle}>
                              API Key
                              {llmConfigured && llmKeyPreview && !llmApiKey && (
                                <span style={{ color: C.green, marginLeft: 8, fontWeight: 400 }}>
                                  configured: {llmKeyPreview}
                                </span>
                              )}
                            </label>
                            <div style={{ position: 'relative', marginBottom: 12 }}>
                              <input
                                type={showLlmKey ? 'text' : 'password'}
                                style={{ ...inputStyle, paddingRight: 40 }}
                                value={llmApiKey}
                                onChange={e => setLlmApiKey(e.target.value)}
                                placeholder={llmConfigured ? 'Enter new key to replace' : llmProvider === 'anthropic' ? 'sk-ant-...' : 'sk-...'}
                              />
                              <button
                                type="button"
                                onClick={() => setShowLlmKey(!showLlmKey)}
                                style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: C.muted, cursor: 'pointer', padding: 4 }}
                              >
                                {showLlmKey
                                  ? <EyeSlashIcon style={{ width: 16, height: 16 }} />
                                  : <EyeIcon style={{ width: 16, height: 16 }} />
                                }
                              </button>
                            </div>

                            {/* Custom endpoint URL */}
                            {llmProvider === 'custom' && (
                              <>
                                <label style={labelStyle}>Endpoint URL</label>
                                <input
                                  type="url"
                                  style={{ ...inputStyle, marginBottom: 12 }}
                                  value={llmEndpointUrl}
                                  onChange={e => setLlmEndpointUrl(e.target.value)}
                                  placeholder="https://your-server.com/v1/chat/completions"
                                />
                              </>
                            )}

                            {/* Save / Clear buttons */}
                            <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                              <button
                                onClick={saveLLMSettings}
                                disabled={llmSaving || (!llmApiKey && !llmConfigured)}
                                className="btn-accent"
                                style={{
                                  opacity: (llmSaving || (!llmApiKey && !llmConfigured)) ? 0.5 : 1,
                                }}
                              >
                                {llmSaving ? 'Saving...' : 'Save'}
                              </button>
                              {llmConfigured && (
                                <button
                                  onClick={clearLLMSettings}
                                  disabled={llmSaving}
                                  className="btn-outline"
                                >
                                  Remove
                                </button>
                              )}
                            </div>
                          </>
                        )}
                      </>
                    )}
                  </div>

                  {/* Divider between OCR and SMS */}
                  <div style={{ borderTop: `1px solid ${C.border}`, marginTop: 24, paddingTop: 20 }} />

                  {/* SMS Provider (Phone OTP) */}
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <DevicePhoneMobileIcon style={{ width: 16, height: 16, color: C.accent }} />
                      <div style={{ fontFamily: C.mono, fontWeight: 600, fontSize: 13, color: C.text }}>Phone OTP</div>
                    </div>
                    <div style={{ color: C.muted, fontSize: 13, marginBottom: 16, lineHeight: 1.6 }}>
                      Optional. Add your own <strong style={{ color: C.text, fontWeight: 500 }}>Twilio</strong> or <strong style={{ color: C.text, fontWeight: 500 }}>Vonage</strong> credentials
                      to enable phone number verification as an additional step in your verification flow.
                      Credentials are encrypted at rest.
                    </div>

                    {smsLoading ? (
                      <div style={{ color: C.muted, fontSize: 13 }}>Loading...</div>
                    ) : (
                      <>
                        {/* Provider select */}
                        <label style={labelStyle}>Provider</label>
                        <select
                          value={smsProvider}
                          onChange={e => { setSmsProvider(e.target.value); setSmsApiKey(''); setSmsApiSecret(''); setShowSmsKey(false) }}
                          style={{ ...inputStyle, marginBottom: 12, cursor: 'pointer', appearance: 'auto' }}
                        >
                          <option value="">None (disabled)</option>
                          <option value="twilio">Twilio</option>
                          <option value="vonage">Vonage</option>
                        </select>

                        {smsProvider && (
                          <>
                            {/* API Key / Account SID */}
                            <label style={labelStyle}>
                              {smsProvider === 'twilio' ? 'Account SID' : 'API Key'}
                              {smsConfigured && smsKeyPreview && !smsApiKey && (
                                <span style={{ color: C.green, marginLeft: 8, fontWeight: 400 }}>
                                  configured: {smsKeyPreview}
                                </span>
                              )}
                            </label>
                            <div style={{ position: 'relative', marginBottom: 12 }}>
                              <input
                                type={showSmsKey ? 'text' : 'password'}
                                style={{ ...inputStyle, paddingRight: 40 }}
                                value={smsApiKey}
                                onChange={e => setSmsApiKey(e.target.value)}
                                placeholder={smsConfigured ? 'Enter new key to replace' : smsProvider === 'twilio' ? 'AC...' : 'API key'}
                              />
                              <button
                                type="button"
                                onClick={() => setShowSmsKey(!showSmsKey)}
                                style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: C.muted, cursor: 'pointer', padding: 4 }}
                              >
                                {showSmsKey
                                  ? <EyeSlashIcon style={{ width: 16, height: 16 }} />
                                  : <EyeIcon style={{ width: 16, height: 16 }} />
                                }
                              </button>
                            </div>

                            {/* API Secret / Auth Token */}
                            <label style={labelStyle}>{smsProvider === 'twilio' ? 'Auth Token' : 'API Secret'}</label>
                            <input
                              type="password"
                              style={{ ...inputStyle, marginBottom: 12 }}
                              value={smsApiSecret}
                              onChange={e => setSmsApiSecret(e.target.value)}
                              placeholder={smsConfigured ? 'Enter new secret to replace' : smsProvider === 'twilio' ? 'Auth token' : 'API secret'}
                            />

                            {/* Phone Number */}
                            <label style={labelStyle}>Sender Phone Number</label>
                            <input
                              type="tel"
                              style={{ ...inputStyle, marginBottom: 12 }}
                              value={smsPhoneNumber}
                              onChange={e => setSmsPhoneNumber(e.target.value)}
                              placeholder="+15551234567"
                            />

                            {/* Save / Clear buttons */}
                            <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                              <button
                                onClick={saveSMSSettings}
                                disabled={smsSaving || (!smsConfigured && (!smsApiKey || !smsApiSecret || !smsPhoneNumber))}
                                className="btn-accent"
                                style={{
                                  opacity: (smsSaving || (!smsConfigured && (!smsApiKey || !smsApiSecret || !smsPhoneNumber))) ? 0.5 : 1,
                                }}
                              >
                                {smsSaving ? 'Saving...' : 'Save'}
                              </button>
                              {smsConfigured && (
                                <button
                                  onClick={clearSMSSettings}
                                  disabled={smsSaving}
                                  className="btn-outline"
                                >
                                  Remove
                                </button>
                              )}
                            </div>
                          </>
                        )}
                      </>
                    )}
                  </div>

                  {/* Divider between SMS and AML */}
                  <div style={{ borderTop: `1px solid ${C.border}`, marginTop: 24, paddingTop: 20 }} />

                  {/* AML / Sanctions Screening */}
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <ShieldExclamationIcon style={{ width: 16, height: 16, color: C.accent }} />
                      <div style={{ fontFamily: C.mono, fontWeight: 600, fontSize: 13, color: C.text }}>AML / Sanctions Screening</div>
                    </div>
                    <div style={{ color: C.muted, fontSize: 13, marginBottom: 16, lineHeight: 1.6 }}>
                      Screen extracted names against <strong style={{ color: C.text, fontWeight: 500 }}>OFAC, EU, UN</strong>, and other sanctions lists
                      during verification. When enabled, names are automatically checked after document processing.
                    </div>

                    {amlLoading ? (
                      <div style={{ color: C.muted, fontSize: 13 }}>Loading...</div>
                    ) : (
                      <>
                        {/* Enable toggle */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                          <button
                            type="button"
                            onClick={() => setAmlEnabled(!amlEnabled)}
                            style={{
                              width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer',
                              background: amlEnabled ? C.accent : C.border,
                              position: 'relative', transition: 'background 0.2s',
                            }}
                          >
                            <div style={{
                              width: 18, height: 18, borderRadius: '50%', background: '#fff',
                              position: 'absolute', top: 3,
                              left: amlEnabled ? 23 : 3,
                              transition: 'left 0.2s',
                            }} />
                          </button>
                          <span style={{ color: C.text, fontSize: 13 }}>
                            {amlEnabled ? 'Enabled' : 'Disabled'}
                          </span>
                        </div>

                        {!amlEnabled && (
                          <div style={{ color: C.dim, fontSize: 12, marginBottom: 12, fontStyle: 'italic' }}>
                            AML screening is disabled. Verifications will skip sanctions list checks.
                          </div>
                        )}

                        <button
                          onClick={saveAmlSettings}
                          disabled={amlSaving}
                          className="btn-accent"
                          style={{ opacity: amlSaving ? 0.5 : 1 }}
                        >
                          {amlSaving ? 'Saving...' : 'Save'}
                        </button>
                      </>
                    )}
                  </div>

                  {/* Divider between AML and Duplicate Detection */}
                  <div style={{ borderTop: `1px solid ${C.border}`, marginTop: 24, paddingTop: 20 }} />

                  {/* Duplicate Detection */}
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <FingerPrintIcon style={{ width: 16, height: 16, color: C.accent }} />
                      <div style={{ fontFamily: C.mono, fontWeight: 600, fontSize: 13, color: C.text }}>Duplicate Detection</div>
                    </div>
                    <div style={{ color: C.muted, fontSize: 13, marginBottom: 16, lineHeight: 1.6 }}>
                      Detect when the same government ID or face appears in multiple verification sessions.
                      Uses perceptual hashing for documents and locality-sensitive hashing for faces.
                      All hashes are <strong style={{ color: C.text, fontWeight: 500 }}>one-way</strong> — they cannot reconstruct the original data.
                    </div>

                    {dedupLoading ? (
                      <div style={{ color: C.muted, fontSize: 13 }}>Loading...</div>
                    ) : (
                      <>
                        {/* Enable toggle */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                          <button
                            type="button"
                            onClick={() => setDedupEnabled(!dedupEnabled)}
                            style={{
                              width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer',
                              background: dedupEnabled ? C.accent : C.border,
                              position: 'relative', transition: 'background 0.2s',
                            }}
                          >
                            <div style={{
                              width: 18, height: 18, borderRadius: '50%', background: '#fff',
                              position: 'absolute', top: 3,
                              left: dedupEnabled ? 23 : 3,
                              transition: 'left 0.2s',
                            }} />
                          </button>
                          <span style={{ color: C.text, fontSize: 13 }}>
                            {dedupEnabled ? 'Enabled' : 'Disabled'}
                          </span>
                        </div>

                        {dedupEnabled && (
                          <>
                            <label style={labelStyle}>Action on Duplicate</label>
                            <select
                              value={dedupAction}
                              onChange={e => setDedupAction(e.target.value)}
                              style={{ ...inputStyle, marginBottom: 16, cursor: 'pointer', appearance: 'auto' }}
                            >
                              <option value="review">Flag for manual review</option>
                              <option value="block">Block (auto-reject)</option>
                              <option value="allow">Allow (flag only)</option>
                            </select>
                          </>
                        )}

                        <button
                          onClick={saveDedupSettings}
                          disabled={dedupSaving}
                          className="btn-accent"
                          style={{ opacity: dedupSaving ? 0.5 : 1 }}
                        >
                          {dedupSaving ? 'Saving...' : 'Save'}
                        </button>
                      </>
                    )}
                  </div>

                  {/* Divider between Duplicate Detection and Voice Auth */}
                  <div style={{ borderTop: `1px solid ${C.border}`, marginTop: 24, paddingTop: 20 }} />

                  {/* Voice Authentication */}
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <MicrophoneIcon style={{ width: 16, height: 16, color: C.accent }} />
                      <div style={{ fontFamily: C.mono, fontWeight: 600, fontSize: 13, color: C.text }}>Voice Authentication</div>
                    </div>
                    <div style={{ color: C.muted, fontSize: 13, marginBottom: 16, lineHeight: 1.6 }}>
                      Optional speaker verification step. When enabled, users must complete a random
                      digit voice challenge after face matching. Uses <strong style={{ color: C.text, fontWeight: 500 }}>192-dimensional speaker embeddings</strong> for
                      voice biometric comparison.
                    </div>

                    {voiceAuthLoading ? (
                      <div style={{ color: C.muted, fontSize: 13 }}>Loading...</div>
                    ) : (
                      <>
                        {/* Enable toggle */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                          <button
                            type="button"
                            onClick={() => setVoiceAuthEnabled(!voiceAuthEnabled)}
                            style={{
                              width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer',
                              background: voiceAuthEnabled ? C.accent : C.border,
                              position: 'relative', transition: 'background 0.2s',
                            }}
                          >
                            <div style={{
                              width: 18, height: 18, borderRadius: '50%', background: '#fff',
                              position: 'absolute', top: 3,
                              left: voiceAuthEnabled ? 23 : 3,
                              transition: 'left 0.2s',
                            }} />
                          </button>
                          <span style={{ color: C.text, fontSize: 13 }}>
                            {voiceAuthEnabled ? 'Enabled' : 'Disabled'}
                          </span>
                        </div>

                        {!voiceAuthEnabled && (
                          <div style={{ color: C.dim, fontSize: 12, marginBottom: 12, fontStyle: 'italic' }}>
                            Voice authentication is disabled. Verifications will skip the voice challenge step.
                          </div>
                        )}

                        <button
                          onClick={saveVoiceAuthSettings}
                          disabled={voiceAuthSaving}
                          className="btn-accent"
                          style={{ opacity: voiceAuthSaving ? 0.5 : 1 }}
                        >
                          {voiceAuthSaving ? 'Saving...' : 'Save'}
                        </button>
                      </>
                    )}
                  </div>

                  {/* Verifiable Credentials — cloud edition only */}
                  {isCloud && (
                    <>
                      <div style={{ borderTop: `1px solid ${C.border}`, marginTop: 24, paddingTop: 20 }} />

                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                          <ShieldCheckIcon style={{ width: 16, height: 16, color: C.accent }} />
                          <div style={{ fontFamily: C.mono, fontWeight: 600, fontSize: 13, color: C.text }}>Verifiable Credentials</div>
                        </div>
                        <div style={{ color: C.muted, fontSize: 13, marginBottom: 16, lineHeight: 1.6 }}>
                          Issue <strong style={{ color: C.text, fontWeight: 500 }}>W3C Verifiable Credentials</strong> (JWT-VC format)
                          after successful identity verification. Credentials are signed with <strong style={{ color: C.text, fontWeight: 500 }}>did:web</strong> and
                          valid for 2 years. Developers fetch credentials via the API; users can re-present them to skip re-verification.
                        </div>

                        {vcLoading ? (
                          <div style={{ color: C.muted, fontSize: 13 }}>Loading...</div>
                        ) : (
                          <>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                              <button
                                type="button"
                                onClick={() => setVcEnabled(!vcEnabled)}
                                style={{
                                  width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer',
                                  background: vcEnabled ? C.accent : C.border,
                                  position: 'relative', transition: 'background 0.2s',
                                }}
                              >
                                <div style={{
                                  width: 18, height: 18, borderRadius: '50%', background: '#fff',
                                  position: 'absolute', top: 3,
                                  left: vcEnabled ? 23 : 3,
                                  transition: 'left 0.2s',
                                }} />
                              </button>
                              <span style={{ color: C.text, fontSize: 13 }}>
                                {vcEnabled ? 'Enabled' : 'Disabled'}
                              </span>
                            </div>

                            {vcEnabled && (
                              <div style={{ color: C.dim, fontSize: 12, marginBottom: 12, lineHeight: 1.6 }}>
                                After a verification completes with status <strong style={{ color: C.text }}>verified</strong>,
                                call <code style={{ color: C.accent, fontFamily: C.mono, fontSize: 11 }}>GET /api/v2/verify/:id/credential</code> to
                                receive a signed JWT-VC.
                              </div>
                            )}

                            <button
                              onClick={saveVcSettings}
                              disabled={vcSaving}
                              className="btn-accent"
                              style={{ opacity: vcSaving ? 0.5 : 1 }}
                            >
                              {vcSaving ? 'Saving...' : 'Save'}
                            </button>
                          </>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* ─── Branding ─── */}
              {activeTab === 'branding' && (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <PaintBrushIcon style={{ width: 16, height: 16, color: C.accent }} />
                    <div style={{ fontFamily: C.mono, fontWeight: 600, fontSize: 13, color: C.text }}>Verification Page</div>
                  </div>
                  <div style={{ color: C.muted, fontSize: 13, marginBottom: 16, lineHeight: 1.6 }}>
                    White-label the hosted verification page with your own branding. End users will see your logo,
                    company name, and accent color instead of Idswyft defaults.
                  </div>

                  {brandLoading ? (
                    <div style={{ color: C.muted, fontSize: 13 }}>Loading...</div>
                  ) : (
                    <>
                      {/* Company Name */}
                      <label style={labelStyle}>Company Name</label>
                      <input
                        type="text"
                        value={brandCompanyName}
                        onChange={e => setBrandCompanyName(e.target.value)}
                        style={{ ...inputStyle, marginBottom: 12 }}
                        placeholder="Your Company"
                        maxLength={100}
                      />

                      {/* Logo URL + upload */}
                      <label style={labelStyle}>Logo URL</label>
                      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                        <input
                          type="url"
                          value={brandLogoUrl}
                          onChange={e => setBrandLogoUrl(e.target.value)}
                          style={{ ...inputStyle, marginBottom: 0, flex: 1 }}
                          placeholder="https://example.com/logo.png"
                        />
                        <button
                          type="button"
                          onClick={() => document.getElementById('branding-logo-input')?.click()}
                          style={{
                            background: C.surface, border: `1px solid ${C.borderStrong}`, color: C.muted,
                            borderRadius: 0, padding: '6px 12px', cursor: 'pointer', fontSize: 12, fontFamily: C.mono,
                            whiteSpace: 'nowrap',
                          }}
                        >
                          Upload
                        </button>
                        <input
                          id="branding-logo-input"
                          type="file"
                          accept="image/jpeg,image/png"
                          style={{ display: 'none' }}
                          onChange={e => {
                            const file = e.target.files?.[0]
                            if (file && file.size > 2 * 1024 * 1024) {
                              toast.error('File must be under 2 MB')
                              e.target.value = ''
                              return
                            }
                            if (file) uploadBrandingLogo(file)
                            e.target.value = ''
                          }}
                        />
                      </div>

                      {/* Accent Color */}
                      <label style={labelStyle}>Accent Color</label>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
                        <input
                          type="text"
                          value={brandAccentColor}
                          onChange={e => setBrandAccentColor(e.target.value)}
                          style={{ ...inputStyle, marginBottom: 0, flex: 1 }}
                          placeholder="#22d3ee"
                          maxLength={7}
                        />
                        <div
                          style={{
                            width: 32, height: 32, borderRadius: 0, flexShrink: 0,
                            background: /^#[0-9a-fA-F]{6}$/.test(brandAccentColor) ? brandAccentColor : C.accent,
                            border: `1px solid ${C.border}`,
                          }}
                        />
                        <input
                          type="color"
                          value={/^#[0-9a-fA-F]{6}$/.test(brandAccentColor) ? brandAccentColor : '#22d3ee'}
                          onChange={e => setBrandAccentColor(e.target.value)}
                          style={{ width: 32, height: 32, border: 'none', padding: 0, cursor: 'pointer', background: 'transparent' }}
                        />
                      </div>

                      {/* Live Preview */}
                      <div style={{
                        background: C.bg, border: `1px solid ${C.border}`, borderRadius: 0,
                        padding: 16, marginBottom: 14,
                      }}>
                        <div style={{ fontSize: 10, color: C.dim, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>Preview</div>
                        <div style={{ textAlign: 'center' }}>
                          {brandLogoUrl ? (
                            <img
                              src={brandLogoUrl}
                              alt="Logo preview"
                              style={{ height: 28, margin: '0 auto 10px', display: 'block', objectFit: 'contain' }}
                              onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
                            />
                          ) : (
                            <img src="/idswyft-logo.png" alt="Idswyft" style={{ height: 28, margin: '0 auto 10px', display: 'block' }} />
                          )}
                          <div style={{ fontSize: 14, fontWeight: 600, color: '#dde2ec', marginBottom: 4 }}>
                            {brandCompanyName ? `Verify with ${brandCompanyName}` : 'Verify Your Identity'}
                          </div>
                          <div style={{ fontSize: 11, color: '#8896aa', marginBottom: 12 }}>Choose how you'd like to complete verification</div>
                          <button
                            type="button"
                            style={{
                              background: /^#[0-9a-fA-F]{6}$/.test(brandAccentColor) ? brandAccentColor : C.accent,
                              color: C.bg, border: 'none', borderRadius: 0,
                              padding: '8px 24px', fontSize: 12, fontWeight: 600,
                              fontFamily: C.mono, cursor: 'default',
                            }}
                          >
                            Scan QR Code
                          </button>
                          {(brandLogoUrl || brandCompanyName || brandAccentColor) && (
                            <div style={{ fontSize: 9, color: C.dim, marginTop: 10 }}>
                              Powered by Idswyft
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Save / Clear buttons */}
                      <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                        <button
                          onClick={saveBrandingSettings}
                          disabled={brandSaving}
                          className="btn-accent"
                          style={{ opacity: brandSaving ? 0.5 : 1 }}
                        >
                          {brandSaving ? 'Saving...' : 'Save'}
                        </button>
                        {brandConfigured && (
                          <button
                            onClick={clearBrandingSettings}
                            disabled={brandSaving}
                            className="btn-outline"
                          >
                            Clear
                          </button>
                        )}
                      </div>

                      <div style={{ marginTop: 16, padding: '12px 14px', background: C.accentSoft, borderRadius: 0, border: `1px solid ${C.cyanBorder}` }}>
                        <Link to="/developer/page-builder" onClick={onClose}
                          style={{ color: C.accent, fontSize: 13, fontFamily: C.mono, fontWeight: 500, textDecoration: 'none' }}>
                          Want more control? Try the Page Builder &rarr;
                        </Link>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* ─── Account (Danger Zone) ─── */}
              {activeTab === 'account' && (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <ExclamationTriangleIcon style={{ width: 16, height: 16, color: C.red }} />
                    <div style={{ fontWeight: 600, fontSize: 14, color: C.red }}>Danger Zone</div>
                  </div>
                  <div style={{ color: C.muted, fontSize: 13, marginBottom: 16, lineHeight: 1.6 }}>
                    Permanently delete your developer account and all associated data including API keys, webhooks, and verification records. This action cannot be undone.
                  </div>
                  <button
                    style={{ background: 'none', border: `1px solid ${C.red}`, color: C.red, borderRadius: 0, padding: '8px 18px', cursor: 'pointer', fontSize: 13, fontWeight: 500, fontFamily: C.mono }}
                    onClick={() => setShowDeleteAccount(true)}
                  >
                    Delete Account
                  </button>
                </div>
              )}

            </div>
          </div>
        </div>
      </div>

      {/* Delete account confirmation modal */}
      {showDeleteAccount && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 110 }}
          onClick={() => setShowDeleteAccount(false)}
        >
          <div
            style={{ width: '100%', maxWidth: 440, background: C.panel, border: `1px solid ${C.red}33`, borderRadius: 0, padding: 24 }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <ExclamationTriangleIcon style={{ width: 20, height: 20, color: C.red }} />
              <div style={{ fontFamily: C.mono, fontWeight: 600, fontSize: 14, color: C.red }}>Delete Account</div>
            </div>
            <div style={{ color: C.muted, fontSize: 13, marginBottom: 16, lineHeight: 1.6 }}>
              This will permanently delete your developer account and all associated data. Type your email address to confirm.
            </div>
            <input
              style={{ ...inputStyle, marginBottom: 16 }}
              type="email"
              value={deleteAccountEmail}
              onChange={e => setDeleteAccountEmail(e.target.value)}
              placeholder="your@email.com"
              autoFocus
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button
                className="btn-outline"
                onClick={() => { setShowDeleteAccount(false); setDeleteAccountEmail('') }}
              >
                Cancel
              </button>
              <button
                className="btn-error"
                style={{ opacity: deleteAccountEmail ? 1 : 0.5 }}
                onClick={deleteAccount}
                disabled={!deleteAccountEmail || deleteAccountLoading}
              >
                {deleteAccountLoading ? 'Deleting...' : 'Delete My Account'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
