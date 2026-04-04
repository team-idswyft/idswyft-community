import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeftIcon, CheckCircleIcon, ArrowPathIcon } from '@heroicons/react/24/outline'
import toast from 'react-hot-toast'
import { API_BASE_URL } from '../config/api'
import { fetchCsrfToken, csrfHeader } from '../lib/csrf'
import { C, injectFonts } from '../theme'

// ─── Types ────────────────────────────────────────────────────

interface PageBuilderConfig {
  headerTitle: string
  headerSubtitle: string
  showPoweredBy: boolean
  theme: 'dark' | 'light'
  backgroundColor: string
  cardBackgroundColor: string
  textColor: string
  fontFamily: 'dm-sans' | 'inter' | 'system'
  steps: {
    front: { enabled: boolean; label: string }
    back: { enabled: boolean; label: string }
    liveness: { enabled: boolean; label: string }
  }
  completionTitle: string
  completionMessage: string
  showConfetti: boolean
}

const DEFAULT_CONFIG: PageBuilderConfig = {
  headerTitle: 'Verify Your Identity',
  headerSubtitle: 'Complete the steps below to verify your identity',
  showPoweredBy: true,
  theme: 'dark',
  backgroundColor: '#080c14',
  cardBackgroundColor: '#0f1420',
  textColor: '#dde2ec',
  fontFamily: 'dm-sans',
  steps: {
    front: { enabled: true, label: 'Front of ID' },
    back: { enabled: true, label: 'Back of ID' },
    liveness: { enabled: true, label: 'Live Capture' },
  },
  completionTitle: 'Verification Complete',
  completionMessage: 'Your identity has been successfully verified.',
  showConfetti: false,
}

const FONT_MAP: Record<string, string> = {
  'dm-sans': '"DM Sans", system-ui, sans-serif',
  'inter': '"Inter", system-ui, sans-serif',
  'system': 'system-ui, -apple-system, sans-serif',
}

const HEX_RE = /^#[0-9a-fA-F]{6}$/

// ─── Component ────────────────────────────────────────────────

export default function PageBuilderPage() {
  const navigate = useNavigate()
  useEffect(() => { injectFonts() }, [])

  const [authed, setAuthed] = useState<boolean | null>(null)
  const [config, setConfig] = useState<PageBuilderConfig>(DEFAULT_CONFIG)
  const [slug, setSlug] = useState('')
  const [slugAvailable, setSlugAvailable] = useState<boolean | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savingSlug, setSavingSlug] = useState(false)

  const mutationHeaders = useCallback(() => ({
    'Content-Type': 'application/json',
    ...csrfHeader(),
  }), [])

  // Step 1: Verify session + fetch CSRF token (same pattern as DeveloperPage)
  useEffect(() => {
    fetch(`${API_BASE_URL}/api/developer/profile`, { credentials: 'include' })
      .then(r => {
        if (!r.ok) { setAuthed(false); return }
        setAuthed(true)
        return fetchCsrfToken()
      })
      .catch(() => setAuthed(false))
  }, [])

  // Step 2: Once authed, load page builder config
  useEffect(() => {
    if (authed !== true) return
    fetch(`${API_BASE_URL}/api/developer/settings/page-builder`, {
      credentials: 'include',
    })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data) return
        if (data.config) setConfig({ ...DEFAULT_CONFIG, ...data.config })
        if (data.slug) setSlug(data.slug)
      })
      .catch(() => toast.error('Failed to load page builder config'))
      .finally(() => setLoading(false))
  }, [authed])

  // Check slug availability (debounced)
  useEffect(() => {
    if (!slug || slug.length < 4) { setSlugAvailable(null); return }
    const timer = setTimeout(async () => {
      try {
        const r = await fetch(`${API_BASE_URL}/api/v2/verify/page-config/slug/${encodeURIComponent(slug)}`)
        const data = await r.json()
        setSlugAvailable(!data.page_builder_config)
      } catch {
        setSlugAvailable(null)
      }
    }, 500)
    return () => clearTimeout(timer)
  }, [slug])

  const saveConfig = async () => {
    setSaving(true)
    try {
      const r = await fetch(`${API_BASE_URL}/api/developer/settings/page-builder`, {
        method: 'PUT',
        credentials: 'include',
        headers: mutationHeaders(),
        body: JSON.stringify({ config }),
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error || data.message || 'Save failed')
      toast.success('Page builder config saved')
    } catch (e: any) {
      toast.error(e.message || 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const saveSlug = async () => {
    setSavingSlug(true)
    try {
      const r = await fetch(`${API_BASE_URL}/api/developer/settings/page-builder/slug`, {
        method: 'PUT',
        credentials: 'include',
        headers: mutationHeaders(),
        body: JSON.stringify({ slug: slug || null }),
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error || data.message || 'Save failed')
      toast.success(slug ? `Slug saved: /v/${slug}` : 'Slug removed')
    } catch (e: any) {
      toast.error(e.message || 'Failed to save slug')
    } finally {
      setSavingSlug(false)
    }
  }

  const resetConfig = () => {
    setConfig(DEFAULT_CONFIG)
    toast.success('Reset to defaults (save to apply)')
  }

  const updateConfig = <K extends keyof PageBuilderConfig>(key: K, value: PageBuilderConfig[K]) => {
    setConfig(prev => ({ ...prev, [key]: value }))
  }

  const updateStep = (step: 'front' | 'back' | 'liveness', field: 'enabled' | 'label', value: any) => {
    setConfig(prev => ({
      ...prev,
      steps: {
        ...prev.steps,
        [step]: { ...prev.steps[step], [field]: value },
      },
    }))
  }

  const setTheme = (theme: 'dark' | 'light') => {
    if (theme === 'dark') {
      updateConfig('theme', 'dark')
      updateConfig('backgroundColor', '#080c14')
      updateConfig('cardBackgroundColor', '#0f1420')
      updateConfig('textColor', '#dde2ec')
    } else {
      updateConfig('theme', 'light')
      updateConfig('backgroundColor', '#f8fafc')
      updateConfig('cardBackgroundColor', '#ffffff')
      updateConfig('textColor', '#1e293b')
    }
  }

  // ─── Auth guard ─────────────────────────────────────────────
  if (authed === false) {
    navigate('/developer', { replace: true })
    return null
  }
  if (authed === null || loading) {
    return (
      <div style={{ background: C.bg, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: C.muted, fontFamily: C.sans, fontSize: 14 }}>Loading...</div>
      </div>
    )
  }

  // ─── Shared styles ──────────────────────────────────────────

  const sectionTitle: React.CSSProperties = {
    fontFamily: C.mono, fontSize: 11, fontWeight: 600, color: C.cyan,
    letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 12,
  }

  const label: React.CSSProperties = {
    fontFamily: C.sans, fontSize: 12, fontWeight: 500, color: C.muted,
    display: 'block', marginBottom: 4,
  }

  const input: React.CSSProperties = {
    width: '100%', background: C.surface, border: `1px solid ${C.border}`,
    color: C.text, borderRadius: 6, padding: '8px 10px', fontSize: 13,
    fontFamily: C.sans, outline: 'none', boxSizing: 'border-box',
  }

  const toggle = (on: boolean): React.CSSProperties => ({
    width: 36, height: 20, borderRadius: 10, cursor: 'pointer', border: 'none',
    background: on ? C.cyan : C.dim, position: 'relative', transition: 'background 0.2s',
    flexShrink: 0,
  })

  const toggleDot = (on: boolean): React.CSSProperties => ({
    width: 16, height: 16, borderRadius: '50%', background: '#fff',
    position: 'absolute', top: 2, left: on ? 18 : 2, transition: 'left 0.2s',
  })

  // ─── Preview derived values ─────────────────────────────────

  const previewFont = FONT_MAP[config.fontFamily] || FONT_MAP['dm-sans']
  const previewBg = HEX_RE.test(config.backgroundColor) ? config.backgroundColor : '#080c14'
  const previewCard = HEX_RE.test(config.cardBackgroundColor) ? config.cardBackgroundColor : '#0f1420'
  const previewText = HEX_RE.test(config.textColor) ? config.textColor : '#dde2ec'
  const previewMuted = config.theme === 'light' ? '#64748b' : '#8896aa'
  const enabledSteps = (['front', 'back', 'liveness'] as const).filter(s => config.steps[s].enabled)

  // ─── Render ─────────────────────────────────────────────────

  return (
    <div style={{ background: C.bg, minHeight: '100vh', fontFamily: C.sans, color: C.text }}>
      {/* Top bar */}
      <div style={{
        borderBottom: `1px solid ${C.border}`, padding: '12px 24px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={() => navigate('/developer')} style={{
            background: 'none', border: 'none', color: C.muted, cursor: 'pointer', display: 'flex', alignItems: 'center',
          }}>
            <ArrowLeftIcon style={{ width: 16, height: 16 }} />
          </button>
          <span style={{ fontFamily: C.mono, fontSize: 13, color: C.text, fontWeight: 600 }}>
            Page Builder
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={resetConfig} style={{
            background: 'none', border: `1px solid ${C.border}`, color: C.muted,
            borderRadius: 6, padding: '6px 14px', cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <ArrowPathIcon style={{ width: 14, height: 14 }} /> Reset
          </button>
          <button onClick={saveConfig} disabled={saving} style={{
            background: C.cyan, border: 'none', color: C.bg, borderRadius: 6,
            padding: '6px 18px', cursor: saving ? 'not-allowed' : 'pointer', fontSize: 12, fontWeight: 600,
            opacity: saving ? 0.6 : 1, display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <CheckCircleIcon style={{ width: 14, height: 14 }} /> {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>

      {/* Two-panel layout */}
      <div style={{ display: 'flex', height: 'calc(100vh - 49px)' }}>

        {/* ── Left: Controls ── */}
        <div style={{
          width: '55%', overflowY: 'auto', padding: '24px 28px',
          borderRight: `1px solid ${C.border}`,
        }}>

          {/* Header section */}
          <div style={{ marginBottom: 28 }}>
            <div style={sectionTitle}>Header</div>
            <div style={{ marginBottom: 10 }}>
              <label style={label}>Title</label>
              <input style={input} value={config.headerTitle}
                onChange={e => updateConfig('headerTitle', e.target.value)} maxLength={200} />
            </div>
            <div>
              <label style={label}>Subtitle</label>
              <input style={input} value={config.headerSubtitle}
                onChange={e => updateConfig('headerSubtitle', e.target.value)} maxLength={300} />
            </div>
          </div>

          {/* Theme section */}
          <div style={{ marginBottom: 28 }}>
            <div style={sectionTitle}>Theme</div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
              {(['dark', 'light'] as const).map(t => (
                <button key={t} onClick={() => setTheme(t)} style={{
                  flex: 1, padding: '10px 0', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 500,
                  background: config.theme === t ? C.cyan : C.surface,
                  color: config.theme === t ? C.bg : C.muted,
                  border: `1px solid ${config.theme === t ? C.cyan : C.border}`,
                }}>
                  {t === 'dark' ? 'Dark' : 'Light'}
                </button>
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
              {([
                ['backgroundColor', 'Background'],
                ['cardBackgroundColor', 'Card'],
                ['textColor', 'Text'],
              ] as const).map(([key, lbl]) => (
                <div key={key}>
                  <label style={label}>{lbl}</label>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <input style={{ ...input, flex: 1 }} value={config[key]}
                      onChange={e => updateConfig(key, e.target.value)} maxLength={7} />
                    <input type="color" value={HEX_RE.test(config[key]) ? config[key] : '#000000'}
                      onChange={e => updateConfig(key, e.target.value)}
                      style={{ width: 28, height: 28, border: 'none', padding: 0, cursor: 'pointer', background: 'transparent' }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Typography section */}
          <div style={{ marginBottom: 28 }}>
            <div style={sectionTitle}>Typography</div>
            <label style={label}>Font Family</label>
            <select style={{ ...input, cursor: 'pointer' }} value={config.fontFamily}
              onChange={e => updateConfig('fontFamily', e.target.value as any)}>
              <option value="dm-sans">DM Sans</option>
              <option value="inter">Inter</option>
              <option value="system">System Default</option>
            </select>
          </div>

          {/* Steps section */}
          <div style={{ marginBottom: 28 }}>
            <div style={sectionTitle}>Verification Steps</div>
            {(['front', 'back', 'liveness'] as const).map(step => (
              <div key={step} style={{
                display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10,
                padding: '10px 12px', background: C.surface, borderRadius: 8, border: `1px solid ${C.border}`,
              }}>
                <button style={toggle(config.steps[step].enabled)}
                  onClick={() => updateStep(step, 'enabled', !config.steps[step].enabled)}>
                  <div style={toggleDot(config.steps[step].enabled)} />
                </button>
                <input style={{ ...input, marginBottom: 0 }} value={config.steps[step].label}
                  onChange={e => updateStep(step, 'label', e.target.value)} maxLength={50} />
              </div>
            ))}
          </div>

          {/* Completion section */}
          <div style={{ marginBottom: 28 }}>
            <div style={sectionTitle}>Completion Screen</div>
            <div style={{ marginBottom: 10 }}>
              <label style={label}>Title</label>
              <input style={input} value={config.completionTitle}
                onChange={e => updateConfig('completionTitle', e.target.value)} maxLength={200} />
            </div>
            <div style={{ marginBottom: 10 }}>
              <label style={label}>Message</label>
              <input style={input} value={config.completionMessage}
                onChange={e => updateConfig('completionMessage', e.target.value)} maxLength={500} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button style={toggle(config.showConfetti)}
                onClick={() => updateConfig('showConfetti', !config.showConfetti)}>
                <div style={toggleDot(config.showConfetti)} />
              </button>
              <span style={{ fontSize: 13, color: C.muted }}>Show confetti on completion</span>
            </div>
          </div>

          {/* Options section */}
          <div style={{ marginBottom: 28 }}>
            <div style={sectionTitle}>Options</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button style={toggle(config.showPoweredBy)}
                onClick={() => updateConfig('showPoweredBy', !config.showPoweredBy)}>
                <div style={toggleDot(config.showPoweredBy)} />
              </button>
              <span style={{ fontSize: 13, color: C.muted }}>Show "Powered by Idswyft" footer</span>
            </div>
          </div>

          {/* Custom URL section */}
          <div style={{ marginBottom: 28 }}>
            <div style={sectionTitle}>Custom URL</div>
            <label style={label}>Verification Slug</label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ fontSize: 13, color: C.dim, whiteSpace: 'nowrap' }}>/v/</span>
              <input style={{ ...input, flex: 1 }} value={slug} placeholder="your-company"
                onChange={e => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))} maxLength={50} />
              <button onClick={saveSlug} disabled={savingSlug} style={{
                background: C.surface, border: `1px solid ${C.border}`, color: C.muted,
                borderRadius: 6, padding: '8px 14px', cursor: savingSlug ? 'not-allowed' : 'pointer', fontSize: 12, whiteSpace: 'nowrap',
              }}>
                {savingSlug ? '...' : 'Save Slug'}
              </button>
            </div>
            {slug && slug.length >= 4 && slugAvailable !== null && (
              <div style={{ fontSize: 12, marginTop: 6, color: slugAvailable ? C.green : C.red }}>
                {slugAvailable ? 'Available' : 'Already taken'}
              </div>
            )}
          </div>
        </div>

        {/* ── Right: Live Preview ── */}
        <div style={{
          width: '45%', overflowY: 'auto', padding: 24,
          background: '#0a0e17',
          display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        }}>
          <div style={{
            width: '100%', maxWidth: 400,
            background: previewBg, borderRadius: 16, overflow: 'hidden',
            border: `1px solid ${C.border}`, fontFamily: previewFont,
          }}>
            {/* Preview header */}
            <div style={{ padding: '28px 24px 20px', textAlign: 'center' }}>
              <h2 style={{ fontSize: 20, fontWeight: 600, color: previewText, margin: '0 0 6px' }}>
                {config.headerTitle || 'Verify Your Identity'}
              </h2>
              <p style={{ fontSize: 13, color: previewMuted, margin: 0 }}>
                {config.headerSubtitle || 'Complete the steps below'}
              </p>
            </div>

            {/* Steps */}
            <div style={{ padding: '0 24px 20px' }}>
              {enabledSteps.map((step, i) => (
                <div key={step} style={{
                  background: previewCard, borderRadius: 10, padding: '14px 16px',
                  marginBottom: 8, display: 'flex', alignItems: 'center', gap: 12,
                  border: `1px solid ${config.theme === 'light' ? '#e2e8f0' : 'rgba(255,255,255,0.06)'}`,
                }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                    background: i === 0 ? C.cyan : 'transparent',
                    border: i === 0 ? 'none' : `1.5px solid ${previewMuted}`,
                    color: i === 0 ? C.bg : previewMuted,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 12, fontWeight: 600,
                  }}>
                    {i + 1}
                  </div>
                  <span style={{ fontSize: 14, color: previewText, fontWeight: 500 }}>
                    {config.steps[step].label}
                  </span>
                </div>
              ))}
            </div>

            {/* Completion preview (dimmed) */}
            <div style={{
              padding: '16px 24px', borderTop: `1px solid ${config.theme === 'light' ? '#e2e8f0' : 'rgba(255,255,255,0.06)'}`,
              textAlign: 'center', opacity: 0.5,
            }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: previewText, marginBottom: 4 }}>
                {config.completionTitle}
              </div>
              <div style={{ fontSize: 12, color: previewMuted }}>
                {config.completionMessage}
              </div>
            </div>

            {/* Powered by */}
            {config.showPoweredBy && (
              <div style={{ textAlign: 'center', padding: '12px 0 16px', fontSize: 10, color: previewMuted }}>
                Powered by Idswyft
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
