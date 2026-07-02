import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeftIcon, CheckCircleIcon, ArrowPathIcon } from '@heroicons/react/24/outline'
import toast from 'react-hot-toast'
import { API_BASE_URL } from '../config/api'
import { fetchCsrfToken, csrfHeader } from '../lib/csrf'
import { C, injectFonts } from '../theme'
import { resolveThemeVars } from '../components/verification/theme'
import { CompletionScreen } from '../components/verification/CompletionScreen'

// ─── Types ────────────────────────────────────────────────────

interface PageBuilderConfig {
  headerTitle: string
  headerSubtitle: string
  showPoweredBy: boolean
  theme: 'dark' | 'light'
  backgroundColor: string
  cardBackgroundColor: string
  textColor: string
  accentColor: string
  mutedTextColor: string
  borderColor: string
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
  accentColor: '#00F0FF',
  mutedTextColor: '#8a8a90',
  borderColor: '#1e1e22',
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
  const [previewDevice, setPreviewDevice] = useState<'mobile' | 'desktop'>('mobile')
  const [previewScreen, setPreviewScreen] = useState<'landing' | 'complete'>('landing')

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
      updateConfig('accentColor', '#00F0FF')
      updateConfig('mutedTextColor', '#8a8a90')
      updateConfig('borderColor', '#1e1e22')
    } else {
      updateConfig('theme', 'light')
      updateConfig('backgroundColor', '#f8fafc')
      updateConfig('cardBackgroundColor', '#ffffff')
      updateConfig('textColor', '#1e293b')
      updateConfig('accentColor', '#00d4d4')
      updateConfig('mutedTextColor', '#6b6b70')
      updateConfig('borderColor', '#e4e2dc')
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

  // Live preview theming: the real verification pages theme by spreading these
  // CSS-var overrides; the preview does the same so it matches production and
  // re-themes as the operator edits. resolveThemeVars keeps them in one place.
  const themeVars = resolveThemeVars(config) as React.CSSProperties
  const previewBranding = { logo_url: null, accent_color: config.accentColor || null, company_name: null }
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
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginTop: 10 }}>
              {([
                ['accentColor', 'Accent / Button'],
                ['mutedTextColor', 'Muted Text'],
                ['borderColor', 'Borders'],
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

        {/* ── Right: Live Preview (device-accurate, re-themes as you edit) ── */}
        <div style={{
          width: '45%', overflowY: 'auto', padding: 24,
          background: '#0a0e17',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16,
        }}>
          {/* Device + screen toggles */}
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center' }}>
            {(['mobile', 'desktop'] as const).map(d => (
              <button key={d} onClick={() => setPreviewDevice(d)} style={{
                padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                border: `1px solid ${previewDevice === d ? C.cyan : C.border}`,
                background: previewDevice === d ? C.cyan : 'transparent',
                color: previewDevice === d ? C.bg : '#8896aa',
              }}>{d === 'mobile' ? 'Mobile' : 'Desktop'}</button>
            ))}
            <span style={{ width: 1, height: 20, background: C.border, margin: '0 4px' }} />
            {(['landing', 'complete'] as const).map(s => (
              <button key={s} onClick={() => setPreviewScreen(s)} style={{
                padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                border: `1px solid ${previewScreen === s ? C.cyan : C.border}`,
                background: previewScreen === s ? C.cyan : 'transparent',
                color: previewScreen === s ? C.bg : '#8896aa',
              }}>{s === 'landing' ? 'Landing' : 'Completion'}</button>
            ))}
          </div>

          {/* Device frame — the inner container spreads themeVars so children
              resolve var(--paper)/var(--ink)/var(--accent)/… to the draft config,
              exactly like the real verification pages. */}
          <div style={{
            background: '#000', borderRadius: previewDevice === 'mobile' ? 36 : 12,
            padding: previewDevice === 'mobile' ? 10 : 8,
            width: previewDevice === 'mobile' ? 300 : '100%',
            maxWidth: previewDevice === 'mobile' ? 300 : 460,
            boxShadow: '0 24px 60px rgba(0,0,0,0.5)',
          }}>
            <div style={{
              ...themeVars,
              background: 'var(--paper)', color: 'var(--ink)', fontFamily: 'var(--sans)',
              borderRadius: previewDevice === 'mobile' ? 28 : 6, overflow: 'hidden',
              minHeight: previewDevice === 'mobile' ? 540 : 420,
            }}>
              {previewScreen === 'complete' ? (
                <CompletionScreen
                  device={previewDevice}
                  config={config}
                  branding={previewBranding}
                  result={{ status: 'verified', confidence_score: 0.97, face_match_score: 0.96, liveness_score: 0.98 }}
                />
              ) : previewDevice === 'mobile' ? (
                /* Mobile landing — mirrors the /verify/mobile first screen */
                <div style={{ paddingBottom: 20 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 18px 8px', fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--mid)' }}>
                    <span>9:41</span>
                    <span style={{ color: 'var(--accent)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Secure Session</span>
                    <span>●●●</span>
                  </div>
                  <div style={{ display: 'flex', gap: 4, padding: '8px 18px' }}>
                    {[...enabledSteps.map(s => config.steps[s].label), 'Complete'].map((lbl, i) => (
                      <div key={i} style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ height: 3, background: i === 0 ? 'var(--accent)' : 'var(--rule)', borderRadius: 2 }} />
                        <div style={{ fontSize: 8, marginTop: 4, fontFamily: 'var(--mono)', color: i === 0 ? 'var(--ink)' : 'var(--mid)', textTransform: 'uppercase', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{lbl}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ padding: '16px 18px 0' }}>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--accent)', letterSpacing: '0.08em', marginBottom: 8 }}>STEP 1 OF {enabledSteps.length + 1}</div>
                    <h2 style={{ fontSize: 22, fontWeight: 600, color: 'var(--ink)', margin: '0 0 6px', lineHeight: 1.15 }}>{config.headerTitle || 'Verify Your Identity'}</h2>
                    <p style={{ fontSize: 13, color: 'var(--mid)', margin: 0 }}>{config.headerSubtitle || 'Complete the steps below'}</p>
                  </div>
                  <div style={{ margin: '16px 18px', padding: '30px 16px', background: 'var(--panel)', border: '2px solid var(--accent)', borderRadius: 12, textAlign: 'center' }}>
                    <div style={{ fontSize: 11, color: 'var(--mid)', fontFamily: 'var(--mono)', letterSpacing: '0.04em' }}>Camera preview</div>
                  </div>
                  <div style={{ padding: '0 18px' }}>
                    <div style={{ background: 'var(--accent)', color: 'var(--paper)', textAlign: 'center', padding: 14, borderRadius: 10, fontWeight: 600, fontSize: 13, fontFamily: 'var(--mono)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>Take Photo of {config.steps.front.label || 'Front'}</div>
                  </div>
                  {config.showPoweredBy && <div style={{ textAlign: 'center', padding: '18px 0 0', fontSize: 10, color: 'var(--mid)' }}>Powered by Idswyft</div>}
                </div>
              ) : (
                /* Desktop landing — mirrors the choice screen */
                <div style={{ padding: '36px 28px', textAlign: 'center' }}>
                  <h2 style={{ fontSize: 24, fontWeight: 600, color: 'var(--ink)', margin: '0 0 8px' }}>{config.headerTitle || 'Verify Your Identity'}</h2>
                  <p style={{ fontSize: 14, color: 'var(--mid)', margin: '0 0 24px' }}>{config.headerSubtitle || 'Choose how you\'d like to verify'}</p>
                  <div style={{ display: 'flex', gap: 12 }}>
                    {['Continue on this device', 'Scan QR code'].map((t, i) => (
                      <div key={i} style={{ flex: 1, padding: '22px 16px', background: 'var(--panel)', border: `1.5px solid ${i === 0 ? 'var(--accent)' : 'var(--rule)'}`, borderRadius: 12 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{t}</div>
                      </div>
                    ))}
                  </div>
                  {config.showPoweredBy && <div style={{ padding: '24px 0 0', fontSize: 11, color: 'var(--mid)' }}>Powered by Idswyft</div>}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
