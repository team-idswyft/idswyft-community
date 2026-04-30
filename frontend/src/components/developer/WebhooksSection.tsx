import React, { useState } from 'react'
import toast from 'react-hot-toast'
import { API_BASE_URL } from '../../config/api'
import { csrfHeader } from '../../lib/csrf'
import { C } from '../../theme'
import {
  EyeIcon,
  EyeSlashIcon,
  ClipboardDocumentIcon,
} from '@heroicons/react/24/outline'
import type { ApiKey, DeveloperWebhook, WebhookDeliveryLog } from './types'
import {
  highlightJson,
  copyToClipboard,
  WEBHOOK_EVENTS,
  WEBHOOK_EVENT_NAMES,
  groupDevDeliveries,
  getDevLifecycleStatus,
} from './types'

interface WebhooksSectionProps {
  token: string
  apiKeys: ApiKey[]
}

export function WebhooksSection({ token, apiKeys }: WebhooksSectionProps) {
  const authHeaders = (token === 'session' ? {} : { Authorization: `Bearer ${token}` }) as Record<string, string>
  const [webhookUrl, setWebhookUrl] = useState('')
  const [webhookApiKeyId, setWebhookApiKeyId] = useState<string | null>(null)
  const [selectedWebhookEvents, setSelectedWebhookEvents] = useState<string[]>([...WEBHOOK_EVENT_NAMES])
  const [revealedSecrets, setRevealedSecrets] = useState<Record<string, string>>({})
  const [testingWebhookId, setTestingWebhookId] = useState<string | null>(null)
  const [webhooks, setWebhooks] = useState<DeveloperWebhook[]>([])
  const [webhookLoading, setWebhookLoading] = useState(false)
  const [expandedWebhookLog, setExpandedWebhookLog] = useState<string | null>(null)
  const [webhookDeliveries, setWebhookDeliveries] = useState<Record<string, WebhookDeliveryLog[]>>({})
  const [deliveriesLoading, setDeliveriesLoading] = useState<string | null>(null)
  const [expandedDeliveryId, setExpandedDeliveryId] = useState<string | null>(null)
  const [resendingDeliveryId, setResendingDeliveryId] = useState<string | null>(null)
  const [deliveryViewMode, setDeliveryViewMode] = useState<Record<string, 'chronological' | 'grouped'>>({})
  const [expandedSessionGroups, setExpandedSessionGroups] = useState<Record<string, Set<string>>>({})

  // Fetch webhooks on mount
  React.useEffect(() => {
    if (!token) return
    const fetchWebhooks = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/developer/webhooks`, {
          headers: authHeaders,
          credentials: 'include' as RequestCredentials,
        })
        if (res.ok) {
          const data = await res.json()
          setWebhooks(data.webhooks ?? [])
        }
      } catch { /* network error */ }
    }
    fetchWebhooks()
  }, [token])

  const copyKey = async (key: string) => {
    const ok = await copyToClipboard(key)
    if (ok) toast.success('Copied to clipboard')
    else toast.error('Failed to copy - try selecting and copying manually')
  }

  const addWebhook = async () => {
    if (!token) return
    const url = webhookUrl.trim()
    if (!url) {
      toast.error('Enter a webhook URL')
      return
    }
    if (selectedWebhookEvents.length === 0) {
      toast.error('Select at least one webhook event')
      return
    }

    setWebhookLoading(true)
    try {
      const res = await fetch(`${API_BASE_URL}/api/developer/webhooks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders, ...csrfHeader() },
        credentials: 'include' as RequestCredentials,
        body: JSON.stringify({ url, events: selectedWebhookEvents, api_key_id: webhookApiKeyId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message || 'Failed to add webhook')
      setWebhooks(prev => [data.webhook, ...prev])
      // Store the full secret so the user can copy it right after creation
      if (data.webhook?.secret_key) {
        setRevealedSecrets(prev => ({ ...prev, [data.webhook.id]: data.webhook.secret_key }))
      }
      setWebhookUrl('')
      setWebhookApiKeyId(null)
      setSelectedWebhookEvents([...WEBHOOK_EVENT_NAMES])
      toast.success('Webhook added - copy your signing secret now')
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to add webhook')
    } finally {
      setWebhookLoading(false)
    }
  }

  const removeWebhook = async (id: string) => {
    if (!token) return
    try {
      const res = await fetch(`${API_BASE_URL}/api/developer/webhooks/${id}`, {
        method: 'DELETE',
        headers: { ...authHeaders, ...csrfHeader() },
        credentials: 'include' as RequestCredentials,
      })
      if (!res.ok) throw new Error('Failed to remove webhook')
      setWebhooks(prev => prev.filter(w => w.id !== id))
      setRevealedSecrets(prev => { const copy = { ...prev }; delete copy[id]; return copy })
      toast.success('Webhook removed')
    } catch {
      toast.error('Failed to remove webhook')
    }
  }

  const testWebhook = async (id: string) => {
    if (!token) return
    setTestingWebhookId(id)
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 15000)
    try {
      const res = await fetch(`${API_BASE_URL}/api/developer/webhooks/${id}/test`, {
        method: 'POST',
        headers: { ...authHeaders, ...csrfHeader() },
        credentials: 'include' as RequestCredentials,
        signal: controller.signal,
      })
      clearTimeout(timer)
      const data = await res.json()
      if (data.success) {
        toast.success(`Test delivered (HTTP ${data.status_code})`)
      } else {
        toast.error(data.error || `Test failed${data.status_code ? ` (HTTP ${data.status_code})` : ''}`)
      }
    } catch (err: unknown) {
      clearTimeout(timer)
      const isAbort = err instanceof DOMException && err.name === 'AbortError'
      toast.error(isAbort ? 'Test timed out - check that the webhook URL is reachable' : 'Failed to send test webhook')
    } finally {
      setTestingWebhookId(null)
    }
  }

  const revealSecret = async (id: string) => {
    if (revealedSecrets[id]) {
      setRevealedSecrets(prev => { const copy = { ...prev }; delete copy[id]; return copy })
      return
    }
    if (!token) return
    try {
      const res = await fetch(`${API_BASE_URL}/api/developer/webhooks/${id}/secret`, {
        headers: authHeaders,
        credentials: 'include' as RequestCredentials,
      })
      const data = await res.json()
      if (res.ok && data.secret_key) {
        setRevealedSecrets(prev => ({ ...prev, [id]: data.secret_key }))
      } else {
        toast.error('Failed to reveal secret')
      }
    } catch {
      toast.error('Failed to reveal secret')
    }
  }

  const toggleDeliveryLog = async (webhookId: string) => {
    if (expandedWebhookLog === webhookId) {
      setExpandedWebhookLog(null)
      return
    }
    setExpandedWebhookLog(webhookId)
    if (webhookDeliveries[webhookId]) return // already fetched
    if (!token) return
    setDeliveriesLoading(webhookId)
    try {
      const res = await fetch(`${API_BASE_URL}/api/developer/webhooks/${webhookId}/deliveries`, {
        headers: authHeaders,
        credentials: 'include' as RequestCredentials,
      })
      if (res.ok) {
        const data = await res.json()
        setWebhookDeliveries(prev => ({ ...prev, [webhookId]: data.deliveries ?? [] }))
      }
    } catch { /* network error */ }
    finally { setDeliveriesLoading(null) }
  }

  const resendDelivery = async (webhookId: string, deliveryId: string) => {
    if (!token) return
    setResendingDeliveryId(deliveryId)
    try {
      const res = await fetch(`${API_BASE_URL}/api/developer/webhooks/${webhookId}/deliveries/${deliveryId}/resend`, {
        method: 'POST',
        headers: { ...authHeaders, ...csrfHeader() },
        credentials: 'include' as RequestCredentials,
      })
      if (res.ok) {
        toast.success('Webhook resent')
        // Refresh deliveries for this webhook
        const listRes = await fetch(`${API_BASE_URL}/api/developer/webhooks/${webhookId}/deliveries`, {
          headers: authHeaders,
          credentials: 'include' as RequestCredentials,
        })
        if (listRes.ok) {
          const data = await listRes.json()
          setWebhookDeliveries(prev => ({ ...prev, [webhookId]: data.deliveries ?? [] }))
        }
      } else {
        toast.error('Failed to resend webhook')
      }
    } catch {
      toast.error('Failed to resend webhook')
    } finally {
      setResendingDeliveryId(null)
    }
  }

  // Shared delivery item renderer used by both chronological and grouped views
  const renderDeliveryItem = (d: WebhookDeliveryLog, webhookId: string, opts?: { compact?: boolean }) => {
    const statusColor = d.status === 'delivered' ? C.green : d.status === 'failed' ? C.red : C.muted
    const isExpanded = expandedDeliveryId === d.id
    const compact = opts?.compact
    return (
      <div key={d.id}>
        <div
          onClick={() => setExpandedDeliveryId(isExpanded ? null : d.id)}
          style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: compact ? '5px 8px' : '6px 8px',
            background: isExpanded ? C.surface : C.panel, borderRadius: isExpanded ? '4px 4px 0 0' : 4,
            fontSize: 11, cursor: 'pointer', transition: 'background 0.15s',
          }}
        >
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: statusColor, flexShrink: 0 }} />
          <span style={{ fontFamily: C.mono, color: C.text, minWidth: compact ? 140 : 160 }}>{d.event || 'unknown'}</span>
          <span style={{ color: statusColor, fontWeight: 500, minWidth: compact ? 50 : 60, fontSize: compact ? 10 : 11 }}>{d.status === 'delivered' ? `${d.response_status}` : d.status}</span>
          <span style={{ color: C.muted, fontSize: 10, marginLeft: 'auto', whiteSpace: 'nowrap' }}>{compact ? new Date(d.created_at).toLocaleTimeString() : new Date(d.created_at).toLocaleString()}</span>
          <span style={{ color: C.muted, fontSize: 10, marginLeft: 4, transition: 'transform 0.15s', transform: isExpanded ? 'rotate(90deg)' : 'none' }}>&#9656;</span>
        </div>
        {isExpanded && (
          <div style={{ background: C.codeBg, borderRadius: '0 0 6px 6px', border: `1px solid ${C.border}`, borderTop: 'none', overflow: 'hidden' }}>
            {d.payload && (
              <div style={{ padding: '10px 12px', borderBottom: `1px solid ${C.border}` }}>
                <div style={{ fontSize: 10, fontWeight: 600, color: C.muted, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Request Payload</div>
                <pre style={{ margin: 0, padding: 10, background: C.bg, borderRadius: 6, border: `1px solid ${C.border}`, fontSize: 11, lineHeight: 1.5, fontFamily: C.mono, color: C.text, overflowX: 'auto', maxHeight: 240, whiteSpace: 'pre', wordBreak: 'normal' }}>{highlightJson(JSON.stringify(d.payload, null, 2))}</pre>
              </div>
            )}
            <div style={{ padding: '10px 12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                <span style={{ fontSize: 10, fontWeight: 600, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Response</span>
                {d.response_status && (
                  <span style={{ fontSize: 9, fontWeight: 600, padding: '1px 6px', borderRadius: 4, background: d.response_status < 300 ? C.greenDim : d.response_status < 500 ? C.amberDim : C.redDim, color: d.response_status < 300 ? C.green : d.response_status < 500 ? C.amber : C.red }}>{d.response_status}</span>
                )}
              </div>
              <pre style={{ margin: 0, padding: 10, background: C.bg, borderRadius: 6, border: `1px solid ${C.border}`, fontSize: 11, lineHeight: 1.5, fontFamily: C.mono, color: C.muted, overflowX: 'auto', maxHeight: 120, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{d.response_body ? (() => { try { return highlightJson(JSON.stringify(JSON.parse(d.response_body), null, 2)) } catch { return d.response_body.slice(0, 500) } })() : 'No response captured'}</pre>
            </div>
            {(d.status === 'failed' || d.status === 'pending') && d.payload && (
              <div style={{ padding: '8px 12px', borderTop: `1px solid ${C.border}`, display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  onClick={(e) => { e.stopPropagation(); resendDelivery(webhookId, d.id) }}
                  disabled={resendingDeliveryId === d.id}
                  style={{ background: 'none', border: `1px solid ${C.cyanBorder}`, color: C.cyan, borderRadius: 6, padding: '4px 12px', fontSize: 11, fontWeight: 500, cursor: resendingDeliveryId === d.id ? 'wait' : 'pointer', opacity: resendingDeliveryId === d.id ? 0.5 : 1 }}
                >{resendingDeliveryId === d.id ? 'Resending...' : 'Resend'}</button>
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <>
      {/* § 04 Webhooks — configure */}
      <div className="section-title">
        <h2><span className="num">§ 04</span>Webhooks</h2>
        <span className="meta">{webhooks.length} {webhooks.length === 1 ? 'endpoint' : 'endpoints'} · signed · idempotent</span>
      </div>
      <section className="card">
        <div className="card-head">
          <h3>Configure webhook</h3>
          <span className="sub">// receive POST callbacks for verification events · we sign every request</span>
        </div>

        <div className="field-grid">
          <div className="lbl">
            <b>Endpoint URL <span className="req">*</span></b>
            <span>HTTPS · TLS 1.2+</span>
          </div>
          <div className="ctl">
            <div className="input">
              <span className="scheme">POST</span>
              <input
                type="url"
                value={webhookUrl}
                onChange={e => setWebhookUrl(e.target.value)}
                placeholder="https://yourapp.com/webhook"
              />
            </div>
          </div>

          <div className="lbl">
            <b>Scope to API Key</b>
            <span>limit which keys fire</span>
          </div>
          <div className="ctl">
            <div className="input">
              <select
                value={webhookApiKeyId ?? ''}
                onChange={e => setWebhookApiKeyId(e.target.value || null)}
              >
                <option value="">All keys (fires for every verification)</option>
                {apiKeys.filter(k => k.status === 'active').map(k => (
                  <option key={k.id} value={k.id}>
                    {k.key_preview} — {k.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div
          style={{
            padding: '14px 18px',
            borderBottom: '1px solid var(--rule)',
            fontFamily: C.mono,
            fontSize: 11,
            color: C.muted,
            background: 'var(--panel-2)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span>// events · {selectedWebhookEvents.length} of {WEBHOOK_EVENT_NAMES.length} selected</span>
          <span>
            <button
              type="button"
              onClick={() => setSelectedWebhookEvents([...WEBHOOK_EVENT_NAMES])}
              style={{ background: 'none', border: 'none', color: C.accent, fontSize: 11, fontFamily: C.mono, cursor: 'pointer', padding: 0 }}
            >
              select all
            </button>
            {' · '}
            <button
              type="button"
              onClick={() => setSelectedWebhookEvents([])}
              style={{ background: 'none', border: 'none', color: C.muted, fontSize: 11, fontFamily: C.mono, cursor: 'pointer', padding: 0 }}
            >
              clear
            </button>
          </span>
        </div>
        <div className="events-list">
          {WEBHOOK_EVENT_NAMES.map(eventName => {
            const checked = selectedWebhookEvents.includes(eventName)
            const sevClass =
              eventName.includes('failed') || eventName.includes('declined') ? 'fail'
              : eventName.includes('approved') || eventName.includes('completed') || eventName.includes('processed') ? 'pass'
              : eventName.includes('manual') || eventName.includes('review') ? 'warn'
              : ''
            const sevLabel =
              sevClass === 'fail' ? 'fail'
              : sevClass === 'pass' ? 'pass'
              : sevClass === 'warn' ? 'review'
              : 'info'
            return (
              <label key={eventName} className={`event${checked ? ' on' : ''}`}>
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={e => {
                    const isChecked = e.target.checked
                    setSelectedWebhookEvents(prev => (
                      isChecked
                        ? [...prev, eventName]
                        : prev.filter(item => item !== eventName)
                    ))
                  }}
                />
                <div>
                  <div className="name">{eventName}</div>
                  <div className="desc">{WEBHOOK_EVENTS[eventName]}</div>
                </div>
                <span className={`sev ${sevClass}`}>{sevLabel}</span>
              </label>
            )
          })}
        </div>

        <div
          style={{
            padding: '14px 18px',
            borderTop: '1px solid var(--rule)',
            background: 'var(--panel-2)',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 8,
          }}
        >
          <button
            type="button"
            className="btn primary sm"
            onClick={addWebhook}
            disabled={webhookLoading}
          >
            {webhookLoading ? 'Adding…' : '+ Add Webhook'}
          </button>
        </div>
      </section>

      {/* § 05 Active endpoints */}
      {webhooks.length > 0 && (
        <>
          <div className="section-title">
            <h2><span className="num">§ 05</span>Active endpoints</h2>
            <span className="meta">click an endpoint to inspect deliveries</span>
          </div>
          {webhooks.map(hook => (
            <article key={hook.id} className={`endpoint${expandedWebhookLog === hook.id ? ' open' : ''}`}>
              <div
                className="ep-row"
                onClick={() => toggleDeliveryLog(hook.id)}
              >
                <span className={`led${hook.is_active ? '' : ' paused'}`} />
                <div className="ep-url">
                  <span className="href">{hook.url}</span>
                  {hook.api_key_id ? (
                    <span className="pill staging">{hook.api_key_preview || 'scoped'}</span>
                  ) : (
                    <span className="pill live">all keys</span>
                  )}
                </div>
                <div className="ep-metrics">
                  <span><b>{hook.events?.length ?? 0}</b> events</span>
                  <span className="mono" style={{ color: C.dim }}>
                    {new Date(hook.created_at).toLocaleDateString()}
                  </span>
                </div>
                <div className="ep-actions" onClick={e => e.stopPropagation()}>
                  <button
                    type="button"
                    className="btn ghost sm"
                    onClick={() => testWebhook(hook.id)}
                    disabled={testingWebhookId === hook.id}
                  >
                    {testingWebhookId === hook.id ? 'Sending…' : 'Test'}
                  </button>
                  <button
                    type="button"
                    className="btn danger sm"
                    onClick={() => removeWebhook(hook.id)}
                  >
                    Remove
                  </button>
                  <svg className="chev" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6">
                    <path d="M4 6l4 4 4-4" />
                  </svg>
                </div>
              </div>

              <div className="ep-body">
                {/* secret + events meta */}
                <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--rule)', display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ color: C.muted, fontSize: 11, fontFamily: C.mono, flexShrink: 0 }}>signing secret</span>
                    <code
                      style={{
                        fontFamily: C.mono,
                        fontSize: 12,
                        color: C.text,
                        flex: 1,
                        wordBreak: 'break-all',
                        background: 'var(--panel-3)',
                        padding: '4px 8px',
                      }}
                    >
                      {revealedSecrets[hook.id] || hook.secret_key || '••••••••'}
                    </code>
                    <button
                      type="button"
                      className="btn ghost sm"
                      onClick={() => revealSecret(hook.id)}
                      title={revealedSecrets[hook.id] ? 'Hide' : 'Reveal'}
                    >
                      {revealedSecrets[hook.id]
                        ? <EyeSlashIcon style={{ width: 12, height: 12 }} />
                        : <EyeIcon style={{ width: 12, height: 12 }} />}
                    </button>
                    {revealedSecrets[hook.id] && (
                      <button
                        type="button"
                        className="btn ghost sm"
                        onClick={() => copyKey(revealedSecrets[hook.id])}
                        title="Copy secret"
                      >
                        <ClipboardDocumentIcon style={{ width: 12, height: 12 }} />
                      </button>
                    )}
                  </div>
                  {hook.events && hook.events.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      {hook.events.map(eventName => (
                        <span key={`${hook.id}-${eventName}`} className="pill">{eventName}</span>
                      ))}
                    </div>
                  )}
                </div>

                {/* delivery log */}
                <div style={{ padding: '14px 18px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                    <div style={{ fontFamily: C.mono, fontSize: 11, color: C.muted, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                      Recent deliveries
                    </div>
                    {webhookDeliveries[hook.id] && webhookDeliveries[hook.id].length > 0 && (
                      <div style={{ display: 'flex', border: `1px solid ${C.border}` }}>
                        <button
                          type="button"
                          onClick={() => setDeliveryViewMode(prev => ({ ...prev, [hook.id]: 'chronological' }))}
                          style={{
                            background: (deliveryViewMode[hook.id] || 'grouped') === 'chronological' ? C.text : 'transparent',
                            color: (deliveryViewMode[hook.id] || 'grouped') === 'chronological' ? C.bg : C.muted,
                            border: 'none', padding: '4px 10px', fontSize: 11, cursor: 'pointer', fontFamily: C.mono,
                          }}
                        >
                          Timeline
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeliveryViewMode(prev => ({ ...prev, [hook.id]: 'grouped' }))}
                          style={{
                            background: (deliveryViewMode[hook.id] || 'grouped') === 'grouped' ? C.text : 'transparent',
                            color: (deliveryViewMode[hook.id] || 'grouped') === 'grouped' ? C.bg : C.muted,
                            border: 'none', borderLeft: `1px solid ${C.border}`, padding: '4px 10px', fontSize: 11, cursor: 'pointer', fontFamily: C.mono,
                          }}
                        >
                          By session
                        </button>
                      </div>
                    )}
                  </div>
                  {(!webhookDeliveries[hook.id] || webhookDeliveries[hook.id].length === 0) ? (
                    <div style={{ fontFamily: C.mono, fontSize: 12, color: C.dim }}>
                      {deliveriesLoading === hook.id ? 'Loading…' : 'No deliveries yet'}
                    </div>
                  ) : (deliveryViewMode[hook.id] || 'grouped') === 'chronological' ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 240, overflowY: 'auto' }}>
                      {webhookDeliveries[hook.id].map(d => renderDeliveryItem(d, hook.id))}
                    </div>
                  ) : (
                    (() => {
                      const groups = groupDevDeliveries(webhookDeliveries[hook.id])
                      const defaultExpanded = new Set(groups.slice(0, 3).map(g => g.groupId))
                      const hookGroups = expandedSessionGroups[hook.id] ?? defaultExpanded

                      return (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 400, overflowY: 'auto' }}>
                          {groups.map(group => {
                            const isGroupExpanded = hookGroups.has(group.groupId)
                            const lifecycle = getDevLifecycleStatus(group.deliveries)
                            const toggleGroup = () => {
                              setExpandedSessionGroups(prev => {
                                const current = prev[hook.id] ?? defaultExpanded
                                const next = new Set(current)
                                next.has(group.groupId) ? next.delete(group.groupId) : next.add(group.groupId)
                                return { ...prev, [hook.id]: next }
                              })
                            }

                            return (
                              <div key={group.groupId}>
                                <div
                                  onClick={toggleGroup}
                                  style={{
                                    display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px',
                                    background: 'var(--panel-2)', border: `1px solid ${C.border}`,
                                    borderBottom: isGroupExpanded ? 'none' : `1px solid ${C.border}`,
                                    cursor: 'pointer',
                                  }}
                                >
                                  <span style={{ color: C.muted, fontSize: 10, transform: isGroupExpanded ? 'rotate(90deg)' : 'none', flexShrink: 0 }}>&#9656;</span>
                                  <span style={{ fontFamily: C.mono, color: C.text, fontSize: 12 }}>{group.label}</span>
                                  <span style={{ fontSize: 10, color: C.dim }}>{group.deliveries.length}</span>
                                  <span style={{ fontFamily: C.mono, fontSize: 9, fontWeight: 500, padding: '1px 6px', background: lifecycle.bg, color: lifecycle.color, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                    {lifecycle.label}
                                  </span>
                                  <span style={{ color: C.muted, fontSize: 10, marginLeft: 'auto', whiteSpace: 'nowrap' }}>{group.dateLabel}</span>
                                </div>
                                {isGroupExpanded && (
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '4px 4px 4px 20px', background: C.panel, border: `1px solid ${C.border}`, borderTop: 'none' }}>
                                    {group.deliveries.map(d => renderDeliveryItem(d, hook.id, { compact: true }))}
                                  </div>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      )
                    })()
                  )}
                </div>
              </div>
            </article>
          ))}
        </>
      )}

      {/* Payload example reference */}
      <details
        style={{ marginTop: 28, border: `1px solid ${C.border}`, background: C.panel }}
      >
        <summary
          style={{
            cursor: 'pointer',
            padding: '12px 18px',
            background: 'var(--panel-2)',
            borderBottom: `1px solid ${C.border}`,
            fontFamily: C.mono,
            fontSize: 11,
            color: C.muted,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            listStyle: 'none',
          }}
        >
          // example payload + signature verification
        </summary>
        <pre className="code-block" style={{ border: 'none' }}>
{`{
  "user_id": "a1b2c3d4-...",
  "verification_id": "e5f6g7h8-...",
  "status": "verification.completed",
  "timestamp": "2026-03-19T12:00:00.000Z",
  "data": {
    "ocr_data": {
      "full_name": "Jane Doe",
      "date_of_birth": "1990-01-15",
      "id_number": "D1234567"
    },
    "face_match_score": 0.94
  }
}

// Verify signature (Node.js)
const crypto = require('crypto');
const expected = 'sha256=' + crypto
  .createHmac('sha256', YOUR_WEBHOOK_SECRET)
  .update(rawBody, 'utf8')
  .digest('hex');
if (expected !== req.headers['x-idswyft-signature']) {
  throw new Error('Invalid signature');
}`}
        </pre>
      </details>
    </>
  )
}
