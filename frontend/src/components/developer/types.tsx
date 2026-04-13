import React from 'react'
import { C } from '../../theme'

// --- Types ---

export interface ApiKey {
  id: string
  name: string
  key_preview: string
  is_sandbox: boolean
  is_active: boolean
  last_used_at: string | null
  created_at: string
  expires_at: string | null
  status: 'active' | 'expired'
}

export interface DeveloperStats {
  total_requests: number
  successful_requests: number
  failed_requests: number
  monthly_usage: number
  monthly_limit: number
}

export interface ApiActivity {
  api_key_id?: string
  timestamp: string
  method: string
  endpoint: string
  status_code: number
  response_time_ms: number
  error_message?: string
  user_agent?: string
  ip_address?: string
}

export interface VerificationDetail {
  success: boolean
  verification_id: string
  is_sandbox?: boolean
  status: string
  current_step: number
  total_steps: number
  final_result: string | null
  front_document_uploaded?: boolean
  back_document_uploaded?: boolean
  live_capture_uploaded?: boolean
  cross_validation_results?: { overall_score: number; verdict: string; has_critical_failure?: boolean } | null
  face_match_results?: { similarity_score: number; passed: boolean; skipped_reason?: string } | null
  liveness_results?: { score: number; passed: boolean } | null
  risk_score?: { overall_score: number; risk_level: string; risk_factors?: unknown[] } | null
  ocr_data?: Record<string, unknown> | null
  barcode_data?: unknown | null
  aml_screening?: unknown | null
  rejection_reason?: string | null
  rejection_detail?: string | null
  failure_reason?: string | null
  manual_review_reason?: string | null
  created_at?: string
  updated_at?: string
  message?: string
}

export interface DeveloperWebhook {
  id: string
  url: string
  events?: string[]
  secret_key?: string | null
  api_key_id?: string | null
  api_key_preview?: string | null
  api_key_name?: string | null
  is_sandbox: boolean
  is_active: boolean
  created_at: string
}

export interface WebhookDeliveryLog {
  id: string
  event: string | null
  status: 'pending' | 'delivered' | 'failed'
  response_status: number | null
  attempts: number
  created_at: string
  delivered_at: string | null
  payload: Record<string, any> | null
  response_body: string | null
}

export const WEBHOOK_EVENTS: Record<string, string> = {
  'verification.started':            'Verification session created',
  'verification.document_processed': 'Document step completed (front or back)',
  'verification.completed':          'Verification passed',
  'verification.failed':             'Verification rejected',
  'verification.manual_review':      'Flagged for manual review',
  'document.expiry_warning':         'Document nearing or past expiry date',
  'verification.reverification_due': 'Scheduled re-verification is due',
}

export const WEBHOOK_EVENT_NAMES = Object.keys(WEBHOOK_EVENTS)

export type AuthStep = 'enter_email' | 'verify_otp' | 'complete_registration'

// --- Helper functions ---

/** Syntax-highlight JSON string with theme-consistent colors */
export function highlightJson(json: string): React.ReactNode[] {
  return json.split('\n').map((line, i) => {
    const highlighted = line
      .replace(/"([^"]+)"(?=\s*:)/g, `<span style="color:${C.cyan}">"$1"</span>`)
      .replace(/:\s*"([^"]*)"/g, `: <span style="color:${C.green}">"$1"</span>`)
      .replace(/:\s*(\d+\.?\d*)/g, `: <span style="color:${C.amber}">$1</span>`)
      .replace(/:\s*(true|false)/g, `: <span style="color:${C.purple}">$1</span>`)
      .replace(/:\s*(null)/g, `: <span style="color:${C.dim}">$1</span>`)
    return <span key={i} dangerouslySetInnerHTML={{ __html: highlighted + '\n' }} />
  })
}

export function getDevPortalSessionId(d: WebhookDeliveryLog): string | null {
  return d.payload?.verification_id ?? null
}

export function getDevLifecycleStatus(deliveries: WebhookDeliveryLog[]): { label: string; color: string; bg: string } {
  const events = deliveries.map(d => d.event || '')
  if (events.some(e => e.includes('approved') || e.includes('verified')))
    return { label: 'Approved', color: C.green, bg: C.greenDim }
  if (events.some(e => e.includes('rejected') || e.includes('failed')))
    return { label: 'Failed', color: C.red, bg: C.redDim }
  if (events.some(e => e.includes('manual_review')))
    return { label: 'Review', color: C.amber, bg: C.amberDim }
  if (events.some(e => e.includes('completed')))
    return { label: 'Completed', color: C.green, bg: C.greenDim }
  if (events.some(e => e.includes('expired')))
    return { label: 'Expired', color: C.red, bg: C.redDim }
  return { label: 'In Progress', color: C.muted, bg: 'rgba(255,255,255,0.04)' }
}

export interface DeliveryGroup {
  groupId: string
  label: string
  deliveries: WebhookDeliveryLog[]
  failedCount: number
  latestEvent: string
  dateLabel: string
}

export function groupDevDeliveries(deliveries: WebhookDeliveryLog[]): DeliveryGroup[] {
  const map = new Map<string, WebhookDeliveryLog[]>()
  for (const d of deliveries) {
    const sid = getDevPortalSessionId(d) ?? '__other__'
    if (!map.has(sid)) map.set(sid, [])
    map.get(sid)!.push(d)
  }
  for (const [, group] of map) {
    group.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
  }

  const buildGroup = (sid: string, group: WebhookDeliveryLog[]): DeliveryGroup => {
    const failedCount = group.filter(d => d.status === 'failed' || (d.response_status && d.response_status >= 400)).length
    const latestEvent = group[group.length - 1]?.event || ''
    const firstDate = new Date(group[0].created_at).toLocaleDateString()
    const lastDate = new Date(group[group.length - 1].created_at).toLocaleDateString()
    const dateLabel = firstDate === lastDate ? firstDate : `${firstDate} \u2192 ${lastDate}`
    const label = sid === '__other__' ? 'Other Events' : sid.substring(0, 8) + '\u2026'
    return { groupId: sid, label, deliveries: group, failedCount, latestEvent, dateLabel }
  }

  const result: DeliveryGroup[] = []
  for (const [sid, group] of map) {
    if (sid === '__other__') continue
    result.push(buildGroup(sid, group))
  }
  result.sort((a, b) => new Date(b.deliveries[0].created_at).getTime() - new Date(a.deliveries[0].created_at).getTime())
  const other = map.get('__other__')
  if (other) result.push(buildGroup('__other__', other))
  return result
}

// --- Shared styles ---

export const inputStyle: React.CSSProperties = {
  background: C.surface,
  border: `1px solid ${C.border}`,
  color: C.text,
  borderRadius: 6,
  padding: '10px 14px',
  width: '100%',
  fontSize: 14,
  fontFamily: C.sans,
  outline: 'none',
  boxSizing: 'border-box',
}

export const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 12,
  color: C.muted,
  marginBottom: 6,
  fontWeight: 500,
}

// --- Shared utility ---

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text)
    } else {
      // Fallback for non-HTTPS contexts (e.g. LAN IP in development)
      const textarea = document.createElement('textarea')
      textarea.value = text
      textarea.style.position = 'fixed'
      textarea.style.opacity = '0'
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
    }
    return true
  } catch {
    return false
  }
}
