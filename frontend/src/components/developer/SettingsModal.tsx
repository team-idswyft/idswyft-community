import { useState, useEffect } from 'react'
import toast from 'react-hot-toast'
import { API_BASE_URL } from '../../config/api'
import { csrfHeader, clearCsrfToken } from '../../lib/csrf'
import { C } from '../../theme'
import {
  Cog6ToothIcon,
  UserCircleIcon,
  UsersIcon,
  XMarkIcon,
  CodeBracketIcon,
  EyeIcon,
  EyeSlashIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline'
import { inputStyle, labelStyle } from './types'

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

  // Fetch data on mount
  useEffect(() => {
    if (!token) return
    fetchProfile()
    fetchLLMSettings()
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
          style={{ width: '100%', maxWidth: 1040, background: C.panel, border: `1px solid ${C.border}`, borderRadius: 12, padding: 28, maxHeight: '100%', overflowY: 'auto' }}
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Cog6ToothIcon style={{ width: 18, height: 18, color: C.text }} />
              <div style={{ fontWeight: 600, fontSize: 16, color: C.text }}>Settings</div>
            </div>
            <button
              onClick={onClose}
              style={{ background: 'none', border: 'none', color: C.muted, cursor: 'pointer', fontSize: 20, padding: '0 4px' }}
            >
              &times;
            </button>
          </div>

          {/* Two-column layout */}
          <div style={{ display: 'flex', gap: 0 }}>

            {/* Left column: Profile + Danger Zone */}
            <div style={{ flex: 1, paddingRight: 28 }}>

              {/* Profile */}
              <div style={{ marginBottom: 24 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <UserCircleIcon style={{ width: 16, height: 16, color: C.cyan }} />
                  <div style={{ fontWeight: 600, fontSize: 14, color: C.text }}>Profile</div>
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
                      style={{
                        background: C.cyan, border: 'none', color: C.bg, borderRadius: 6,
                        padding: '8px 18px', cursor: 'pointer', fontSize: 13, fontWeight: 600,
                        opacity: (profileSaving || !profileName.trim()) ? 0.5 : 1,
                      }}
                    >
                      {profileSaving ? 'Saving...' : 'Save Profile'}
                    </button>
                  </>
                )}
              </div>

              {/* Verification Reviewers */}
              <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 20, marginBottom: 24 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <UsersIcon style={{ width: 16, height: 16, color: C.cyan }} />
                  <div style={{ fontWeight: 600, fontSize: 14, color: C.text }}>Team Management</div>
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
                    style={{
                      background: C.cyan, border: 'none', color: C.bg, borderRadius: 6,
                      padding: '8px 14px', cursor: 'pointer', fontSize: 13, fontWeight: 600,
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
                        background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6, padding: '8px 12px',
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
                            fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em',
                            padding: '2px 6px', borderRadius: 4,
                            background: r.role === 'admin' ? 'rgba(167,139,250,0.12)' : 'rgba(136,150,170,0.1)',
                            color: r.role === 'admin' ? '#a78bfa' : C.dim,
                          }}>
                            {r.role === 'admin' ? 'Admin' : 'Reviewer'}
                          </span>
                          {/* Status badge */}
                          <span style={{
                            fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em',
                            padding: '2px 6px', borderRadius: 4,
                            background: r.status === 'active' ? 'rgba(34,197,94,0.12)' : r.status === 'invited' ? 'rgba(34,211,238,0.1)' : 'rgba(248,113,113,0.1)',
                            color: r.status === 'active' ? '#22c55e' : r.status === 'invited' ? C.cyan : C.red,
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
                    marginTop: 12, background: 'none', border: `1px solid ${C.border}`,
                    color: C.muted, borderRadius: 6, padding: '6px 12px', cursor: 'pointer', fontSize: 12,
                  }}
                >
                  Copy reviewer login link
                </button>
              </div>

              {/* Danger Zone */}
              <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <ExclamationTriangleIcon style={{ width: 16, height: 16, color: C.red }} />
                  <div style={{ fontWeight: 600, fontSize: 14, color: C.red }}>Danger Zone</div>
                </div>
                <div style={{ color: C.muted, fontSize: 13, marginBottom: 16, lineHeight: 1.6 }}>
                  Permanently delete your developer account and all associated data including API keys, webhooks, and verification records. This action cannot be undone.
                </div>
                <button
                  style={{ background: 'none', border: `1px solid ${C.red}`, color: C.red, borderRadius: 6, padding: '8px 18px', cursor: 'pointer', fontSize: 13, fontWeight: 500 }}
                  onClick={() => { onClose(); setShowDeleteAccount(true) }}
                >
                  Delete Account
                </button>
              </div>
            </div>

            {/* Vertical divider */}
            <div style={{ width: 1, background: C.border, flexShrink: 0 }} />

            {/* Right column: OCR Enhancement */}
            <div style={{ flex: 1, paddingLeft: 28 }}>

              {/* OCR Enhancement (LLM Fallback) */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <CodeBracketIcon style={{ width: 16, height: 16, color: C.cyan }} />
                  <div style={{ fontWeight: 600, fontSize: 14, color: C.text }}>OCR Enhancement</div>
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
                            style={{
                              background: C.cyan, border: 'none', color: C.bg, borderRadius: 6,
                              padding: '8px 18px', cursor: 'pointer', fontSize: 13, fontWeight: 600,
                              opacity: (llmSaving || (!llmApiKey && !llmConfigured)) ? 0.5 : 1,
                            }}
                          >
                            {llmSaving ? 'Saving...' : 'Save'}
                          </button>
                          {llmConfigured && (
                            <button
                              onClick={clearLLMSettings}
                              disabled={llmSaving}
                              style={{
                                background: 'none', border: `1px solid ${C.border}`, color: C.muted,
                                borderRadius: 6, padding: '8px 18px', cursor: 'pointer', fontSize: 13,
                              }}
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
            </div>

          </div>{/* end two-column layout */}
        </div>
      </div>

      {/* Delete account confirmation modal */}
      {showDeleteAccount && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 80 }}
          onClick={() => setShowDeleteAccount(false)}
        >
          <div
            style={{ width: '100%', maxWidth: 440, background: C.panel, border: `1px solid ${C.red}33`, borderRadius: 12, padding: 24 }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <ExclamationTriangleIcon style={{ width: 20, height: 20, color: C.red }} />
              <div style={{ fontWeight: 600, fontSize: 16, color: C.red }}>Delete Account</div>
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
                style={{ background: 'none', border: `1px solid ${C.border}`, color: C.muted, borderRadius: 6, padding: '8px 18px', cursor: 'pointer', fontSize: 13 }}
                onClick={() => { setShowDeleteAccount(false); setDeleteAccountEmail('') }}
              >
                Cancel
              </button>
              <button
                style={{ background: C.red, border: 'none', color: '#fff', borderRadius: 6, padding: '8px 18px', cursor: 'pointer', fontSize: 13, fontWeight: 600, opacity: deleteAccountEmail ? 1 : 0.5 }}
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
