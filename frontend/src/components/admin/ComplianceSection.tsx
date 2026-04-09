import React, { useState, useRef } from 'react'
import toast from 'react-hot-toast'
import { API_BASE_URL } from '../../config/api'
import { csrfHeader } from '../../lib/csrf'
import { C } from '../../theme'
import {
  ChevronRightIcon,
  ChevronDownIcon,
  TrashIcon,
  PlusIcon,
  Bars3Icon,
  PlayIcon,
  ShieldCheckIcon,
} from '@heroicons/react/24/outline'
import { inputStyle, labelStyle, highlightJson } from '../developer/types'

// ─── Types ──────────────────────────────────────────────────────

interface Ruleset {
  id: string
  name: string
  description: string | null
  is_active: boolean
  priority: number
  rule_count: number
  created_at: string
  updated_at: string
}

interface Rule {
  id: string
  condition: unknown
  action: unknown
  description: string | null
  created_at: string
}

interface ConditionRow {
  id: string
  field: string
  op: string
  value: string
}

interface ActionForm {
  set_mode: string
  require_address: boolean
  require_liveness: string
  require_aml: boolean
  force_manual_review: boolean
  set_flag: string
}

// ─── Constants ──────────────────────────────────────────────────

const FIELDS = [
  { value: 'country', label: 'Country', type: 'string' as const },
  { value: 'document_type', label: 'Document Type', type: 'string' as const },
  { value: 'user_age', label: 'User Age', type: 'number' as const },
  { value: 'verification_mode', label: 'Verification Mode', type: 'string' as const },
  { value: 'risk_score', label: 'Risk Score', type: 'number' as const },
  { value: 'aml_risk_level', label: 'AML Risk Level', type: 'string' as const },
]

const OPERATORS: Record<string, { label: string; arrayValue?: boolean; noValue?: boolean }> = {
  eq: { label: 'equals' },
  neq: { label: 'not equals' },
  in: { label: 'in list', arrayValue: true },
  not_in: { label: 'not in list', arrayValue: true },
  gt: { label: '>' },
  gte: { label: '>=' },
  lt: { label: '<' },
  lte: { label: '<=' },
  exists: { label: 'exists', noValue: true },
  contains: { label: 'contains' },
}

const STRING_OPS = ['eq', 'neq', 'in', 'not_in', 'contains', 'exists']
const NUMBER_OPS = ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in', 'exists']

const MODES = ['age_only', 'document_only', 'identity', 'full']
const LIVENESS_OPTIONS = ['', 'passive', 'head_turn']

const emptyAction = (): ActionForm => ({
  set_mode: '', require_address: false, require_liveness: '',
  require_aml: false, force_manual_review: false, set_flag: '',
})

let rowIdCounter = 0
const nextRowId = () => `row-${++rowIdCounter}`

// ─── Helpers ────────────────────────────────────────────────────

function conditionRowsToJson(rows: ConditionRow[], combinator: 'all' | 'any'): unknown {
  const leaves = rows.map(r => {
    const fieldDef = FIELDS.find(f => f.value === r.field)
    const opDef = OPERATORS[r.op]
    let value: unknown = r.value
    if (opDef?.noValue) value = true
    else if (opDef?.arrayValue) value = r.value.split(',').map(s => s.trim()).filter(Boolean)
    else if (fieldDef?.type === 'number') value = Number(r.value)
    return { field: r.field, op: r.op, value }
  })
  if (leaves.length === 1) return leaves[0]
  return { [combinator]: leaves }
}

function actionFormToJson(form: ActionForm): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (form.set_mode) out.set_mode = form.set_mode
  if (form.require_address) out.require_address = true
  if (form.require_liveness) out.require_liveness = form.require_liveness
  if (form.require_aml) out.require_aml = true
  if (form.force_manual_review) out.force_manual_review = true
  if (form.set_flag.trim()) out.set_flag = form.set_flag.trim()
  return out
}

// ─── Condition Builder ──────────────────────────────────────────

function ConditionBuilder({ rows, setRows, combinator, setCombinator }: {
  rows: ConditionRow[]
  setRows: (rows: ConditionRow[]) => void
  combinator: 'all' | 'any'
  setCombinator: (c: 'all' | 'any') => void
}) {
  const dragIdx = useRef<number | null>(null)
  const [dragOver, setDragOver] = useState<number | null>(null)

  const updateRow = (id: string, patch: Partial<ConditionRow>) => {
    setRows(rows.map(r => r.id === id ? { ...r, ...patch } : r))
  }

  const addRow = () => {
    setRows([...rows, { id: nextRowId(), field: 'country', op: 'eq', value: '' }])
  }

  const removeRow = (id: string) => {
    if (rows.length <= 1) return
    setRows(rows.filter(r => r.id !== id))
  }

  const onDragStart = (idx: number) => (e: React.DragEvent) => {
    dragIdx.current = idx
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', String(idx))
  }

  const onDragOver = (idx: number) => (e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOver(idx)
  }

  const onDrop = (idx: number) => (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(null)
    const from = dragIdx.current
    if (from === null || from === idx) return
    const next = [...rows]
    const [moved] = next.splice(from, 1)
    next.splice(idx, 0, moved)
    setRows(next)
    dragIdx.current = null
  }

  const opsForField = (field: string) => {
    const def = FIELDS.find(f => f.value === field)
    const keys = def?.type === 'number' ? NUMBER_OPS : STRING_OPS
    return keys.map(k => ({ value: k, label: OPERATORS[k].label }))
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 11, color: C.muted }}>Match</span>
        <div style={{ display: 'flex', borderRadius: 4, overflow: 'hidden', border: `1px solid ${C.border}` }}>
          {(['all', 'any'] as const).map(c => (
            <button key={c} onClick={() => setCombinator(c)} style={{
              background: combinator === c ? C.cyanDim : 'transparent',
              color: combinator === c ? C.cyan : C.muted,
              border: 'none', padding: '3px 10px', fontSize: 11, cursor: 'pointer',
              fontFamily: C.mono, fontWeight: combinator === c ? 600 : 400,
              borderRight: c === 'all' ? `1px solid ${C.border}` : undefined,
            }}>{c === 'all' ? 'ALL' : 'ANY'}</button>
          ))}
        </div>
        <span style={{ fontSize: 11, color: C.muted }}>conditions</span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {rows.map((row, idx) => {
          const ops = opsForField(row.field)
          const opDef = OPERATORS[row.op]
          const isDragTarget = dragOver === idx

          return (
            <div
              key={row.id}
              draggable
              onDragStart={onDragStart(idx)}
              onDragOver={onDragOver(idx)}
              onDragLeave={() => setDragOver(null)}
              onDrop={onDrop(idx)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '6px 8px', borderRadius: 6,
                background: isDragTarget ? C.cyanDim : C.surface,
                border: `1px solid ${isDragTarget ? C.cyanBorder : C.border}`,
                transition: 'border-color 0.15s, background 0.15s',
              }}
            >
              <Bars3Icon style={{ width: 14, height: 14, color: C.dim, cursor: 'grab', flexShrink: 0 }} />

              <select
                value={row.field}
                onChange={e => {
                  const newField = e.target.value
                  const newDef = FIELDS.find(f => f.value === newField)
                  const validOps = newDef?.type === 'number' ? NUMBER_OPS : STRING_OPS
                  const newOp = validOps.includes(row.op) ? row.op : validOps[0]
                  updateRow(row.id, { field: newField, op: newOp })
                }}
                style={{ ...inputStyle, padding: '5px 8px', fontSize: 12, width: 'auto', minWidth: 130 }}
              >
                {FIELDS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
              </select>

              <select
                value={row.op}
                onChange={e => updateRow(row.id, { op: e.target.value })}
                style={{ ...inputStyle, padding: '5px 8px', fontSize: 12, width: 'auto', minWidth: 90, fontFamily: C.mono }}
              >
                {ops.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>

              {!opDef?.noValue && (
                <input
                  value={row.value}
                  onChange={e => updateRow(row.id, { value: e.target.value })}
                  placeholder={opDef?.arrayValue ? 'US, GB, DE' : 'value'}
                  style={{ ...inputStyle, padding: '5px 8px', fontSize: 12, flex: 1, minWidth: 80 }}
                />
              )}

              <button
                onClick={() => removeRow(row.id)}
                disabled={rows.length <= 1}
                style={{
                  background: 'none', border: 'none', cursor: rows.length > 1 ? 'pointer' : 'default',
                  color: rows.length > 1 ? C.red : C.dim, padding: 2, flexShrink: 0,
                }}
              >
                <TrashIcon style={{ width: 14, height: 14 }} />
              </button>
            </div>
          )
        })}
      </div>

      <button onClick={addRow} style={{
        background: 'none', border: `1px dashed ${C.border}`, borderRadius: 6,
        padding: '6px 12px', color: C.muted, fontSize: 11, cursor: 'pointer',
        display: 'flex', alignItems: 'center', gap: 4, marginTop: 8,
      }}>
        <PlusIcon style={{ width: 12, height: 12 }} /> Add condition
      </button>
    </div>
  )
}

// ─── Action Picker ──────────────────────────────────────────────

function ActionPicker({ form, setForm }: { form: ActionForm; setForm: (f: ActionForm) => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div>
        <label style={labelStyle}>Verification Mode</label>
        <select value={form.set_mode} onChange={e => setForm({ ...form, set_mode: e.target.value })}
          style={{ ...inputStyle, padding: '6px 10px', fontSize: 12 }}>
          <option value="">— no override —</option>
          {MODES.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
      </div>
      <div>
        <label style={labelStyle}>Require Liveness</label>
        <select value={form.require_liveness} onChange={e => setForm({ ...form, require_liveness: e.target.value })}
          style={{ ...inputStyle, padding: '6px 10px', fontSize: 12 }}>
          <option value="">— no override —</option>
          {LIVENESS_OPTIONS.filter(Boolean).map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14 }}>
        {([
          ['require_address', 'Require Address'],
          ['require_aml', 'Require AML'],
          ['force_manual_review', 'Force Manual Review'],
        ] as const).map(([key, label]) => (
          <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 12, color: C.text }}>
            <input type="checkbox" checked={(form as any)[key]}
              onChange={e => setForm({ ...form, [key]: e.target.checked })}
              style={{ accentColor: C.cyan, width: 14, height: 14 }} />
            {label}
          </label>
        ))}
      </div>
      <div>
        <label style={labelStyle}>Flag (optional)</label>
        <input value={form.set_flag} onChange={e => setForm({ ...form, set_flag: e.target.value })}
          placeholder="e.g. high_risk_country"
          style={{ ...inputStyle, padding: '6px 10px', fontSize: 12 }} />
      </div>
    </div>
  )
}

// ─── Main Component ─────────────────────────────────────────────

interface ComplianceSectionProps {
  token: string
}

export function ComplianceSection({ token }: ComplianceSectionProps) {
  const authHeaders = (token === 'session' ? {} : { Authorization: `Bearer ${token}` }) as Record<string, string>
  const fetchOpts = { headers: authHeaders, credentials: 'include' as RequestCredentials }

  // Rulesets state
  const [rulesets, setRulesets] = useState<Ruleset[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [rulesMap, setRulesMap] = useState<Record<string, Rule[]>>({})
  const [rulesLoading, setRulesLoading] = useState<string | null>(null)

  // Create ruleset form
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [newPriority, setNewPriority] = useState(100)
  const [newActive, setNewActive] = useState(true)
  const [creating, setCreating] = useState(false)

  // Add rule form (per ruleset)
  const [addingRuleTo, setAddingRuleTo] = useState<string | null>(null)
  const [ruleRows, setRuleRows] = useState<ConditionRow[]>([{ id: nextRowId(), field: 'country', op: 'eq', value: '' }])
  const [ruleCombinator, setRuleCombinator] = useState<'all' | 'any'>('all')
  const [ruleAction, setRuleAction] = useState<ActionForm>(emptyAction())
  const [ruleDesc, setRuleDesc] = useState('')
  const [savingRule, setSavingRule] = useState(false)

  // Dry-run tester
  const [showDryRun, setShowDryRun] = useState(false)
  const [dryCtx, setDryCtx] = useState({ country: '', document_type: '', user_age: '', verification_mode: '' })
  const [dryResult, setDryResult] = useState<any>(null)
  const [dryLoading, setDryLoading] = useState(false)

  // Fetch rulesets on mount
  React.useEffect(() => {
    if (!token) return
    fetchRulesets()
  }, [token])

  const fetchRulesets = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/v2/compliance/rulesets`, fetchOpts)
      if (res.ok) {
        const data = await res.json()
        setRulesets(data.rulesets ?? [])
      }
    } catch { /* network error */ }
    finally { setLoading(false) }
  }

  const createRuleset = async () => {
    if (!newName.trim()) { toast.error('Name is required'); return }
    setCreating(true)
    try {
      const res = await fetch(`${API_BASE_URL}/api/v2/compliance/rulesets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders, ...csrfHeader() },
        credentials: 'include',
        body: JSON.stringify({ name: newName.trim(), description: newDesc.trim() || undefined, priority: newPriority, is_active: newActive }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to create ruleset')
      setRulesets(prev => [...prev, { ...data.ruleset, rule_count: 0 }])
      setNewName(''); setNewDesc(''); setNewPriority(100); setNewActive(true); setShowCreate(false)
      toast.success('Ruleset created')
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to create ruleset')
    } finally { setCreating(false) }
  }

  const deleteRuleset = async (id: string) => {
    if (!confirm('Delete this ruleset and all its rules?')) return
    try {
      const res = await fetch(`${API_BASE_URL}/api/v2/compliance/rulesets/${id}`, {
        method: 'DELETE', headers: { ...authHeaders, ...csrfHeader() }, credentials: 'include',
      })
      if (!res.ok) throw new Error('Failed to delete')
      setRulesets(prev => prev.filter(r => r.id !== id))
      if (expandedId === id) setExpandedId(null)
      toast.success('Ruleset deleted')
    } catch { toast.error('Failed to delete ruleset') }
  }

  const toggleActive = async (rs: Ruleset) => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/v2/compliance/rulesets/${rs.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...authHeaders, ...csrfHeader() },
        credentials: 'include',
        body: JSON.stringify({ is_active: !rs.is_active }),
      })
      if (!res.ok) throw new Error('Failed to update')
      setRulesets(prev => prev.map(r => r.id === rs.id ? { ...r, is_active: !r.is_active } : r))
    } catch { toast.error('Failed to toggle ruleset') }
  }

  const expandRuleset = async (id: string) => {
    if (expandedId === id) { setExpandedId(null); return }
    setExpandedId(id)
    if (rulesMap[id]) return
    setRulesLoading(id)
    try {
      const res = await fetch(`${API_BASE_URL}/api/v2/compliance/rulesets/${id}`, fetchOpts)
      if (res.ok) {
        const data = await res.json()
        setRulesMap(prev => ({ ...prev, [id]: data.ruleset?.rules ?? [] }))
      }
    } catch { /* network error */ }
    finally { setRulesLoading(null) }
  }

  const startAddRule = (rulesetId: string) => {
    setAddingRuleTo(rulesetId)
    setRuleRows([{ id: nextRowId(), field: 'country', op: 'eq', value: '' }])
    setRuleCombinator('all')
    setRuleAction(emptyAction())
    setRuleDesc('')
  }

  const saveRule = async () => {
    if (!addingRuleTo) return
    const condition = conditionRowsToJson(ruleRows, ruleCombinator)
    const action = actionFormToJson(ruleAction)
    if (Object.keys(action).length === 0) { toast.error('Select at least one action'); return }
    setSavingRule(true)
    try {
      const res = await fetch(`${API_BASE_URL}/api/v2/compliance/rulesets/${addingRuleTo}/rules`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders, ...csrfHeader() },
        credentials: 'include',
        body: JSON.stringify({ condition, action, description: ruleDesc.trim() || undefined }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to create rule')
      setRulesMap(prev => ({ ...prev, [addingRuleTo!]: [...(prev[addingRuleTo!] ?? []), data.rule] }))
      setRulesets(prev => prev.map(r => r.id === addingRuleTo ? { ...r, rule_count: r.rule_count + 1 } : r))
      setAddingRuleTo(null)
      toast.success('Rule added')
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to add rule')
    } finally { setSavingRule(false) }
  }

  const deleteRule = async (rulesetId: string, ruleId: string) => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/v2/compliance/rules/${ruleId}`, {
        method: 'DELETE', headers: { ...authHeaders, ...csrfHeader() }, credentials: 'include',
      })
      if (!res.ok) throw new Error('Failed to delete')
      setRulesMap(prev => ({ ...prev, [rulesetId]: (prev[rulesetId] ?? []).filter(r => r.id !== ruleId) }))
      setRulesets(prev => prev.map(r => r.id === rulesetId ? { ...r, rule_count: Math.max(0, r.rule_count - 1) } : r))
      toast.success('Rule deleted')
    } catch { toast.error('Failed to delete rule') }
  }

  const runDryRun = async () => {
    const context: Record<string, unknown> = {}
    if (dryCtx.country.trim()) context.country = dryCtx.country.trim()
    if (dryCtx.document_type.trim()) context.document_type = dryCtx.document_type.trim()
    if (dryCtx.user_age.trim()) context.user_age = Number(dryCtx.user_age)
    if (dryCtx.verification_mode.trim()) context.verification_mode = dryCtx.verification_mode.trim()
    if (Object.keys(context).length === 0) { toast.error('Fill in at least one context field'); return }
    setDryLoading(true)
    try {
      const res = await fetch(`${API_BASE_URL}/api/v2/compliance/evaluate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders, ...csrfHeader() },
        credentials: 'include',
        body: JSON.stringify({ context }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Evaluation failed')
      setDryResult(data)
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Evaluation failed')
    } finally { setDryLoading(false) }
  }

  // ─── Render ─────────────────────────────────────────────────

  const pillStyle = (active: boolean): React.CSSProperties => ({
    fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 8,
    background: active ? C.greenDim : 'rgba(255,255,255,0.04)',
    color: active ? C.green : C.dim,
  })

  const priorityPill: React.CSSProperties = {
    fontSize: 10, fontFamily: C.mono, padding: '2px 6px', borderRadius: 4,
    background: C.cyanDim, color: C.cyan,
  }

  return (
    <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 10, padding: 24, marginTop: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <ShieldCheckIcon style={{ width: 18, height: 18, color: C.cyan }} />
        <span style={{ fontWeight: 600, fontSize: 14, color: C.text }}>Compliance Rules</span>
      </div>
      <div style={{ color: C.muted, fontSize: 13, marginBottom: 16 }}>
        Define rules that automatically adjust verification requirements based on country, document type, user age, and more.
      </div>

      {/* Create ruleset button / form */}
      {!showCreate ? (
        <button onClick={() => setShowCreate(true)} style={{
          background: C.cyan, border: 'none', color: C.bg, borderRadius: 6,
          padding: '8px 16px', cursor: 'pointer', fontSize: 13, fontWeight: 600, marginBottom: 16,
        }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <PlusIcon style={{ width: 14, height: 14 }} /> New Ruleset
          </span>
        </button>
      ) : (
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: 16, marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 12 }}>Create Ruleset</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div>
              <label style={labelStyle}>Name *</label>
              <input value={newName} onChange={e => setNewName(e.target.value)}
                placeholder="e.g. EU Compliance" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Description</label>
              <input value={newDesc} onChange={e => setNewDesc(e.target.value)}
                placeholder="Optional description" style={inputStyle} />
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>Priority</label>
                <input type="number" value={newPriority} onChange={e => setNewPriority(Number(e.target.value))}
                  style={{ ...inputStyle, width: '100%' }} />
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 12, color: C.text, paddingTop: 20 }}>
                <input type="checkbox" checked={newActive} onChange={e => setNewActive(e.target.checked)}
                  style={{ accentColor: C.cyan, width: 14, height: 14 }} />
                Active
              </label>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            <button onClick={createRuleset} disabled={creating} style={{
              background: C.cyan, border: 'none', color: C.bg, borderRadius: 6,
              padding: '8px 16px', cursor: 'pointer', fontSize: 13, fontWeight: 600,
              opacity: creating ? 0.6 : 1,
            }}>{creating ? 'Creating...' : 'Create'}</button>
            <button onClick={() => setShowCreate(false)} style={{
              background: 'none', border: `1px solid ${C.border}`, color: C.muted,
              borderRadius: 6, padding: '8px 16px', cursor: 'pointer', fontSize: 13,
            }}>Cancel</button>
          </div>
        </div>
      )}

      {/* Rulesets list */}
      {loading ? (
        <div style={{ color: C.muted, fontSize: 13, fontStyle: 'italic' }}>Loading rulesets...</div>
      ) : rulesets.length === 0 ? (
        <div style={{ color: C.muted, fontSize: 13, fontStyle: 'italic' }}>No rulesets yet. Create one to get started.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {rulesets.map(rs => {
            const isExpanded = expandedId === rs.id
            const rules = rulesMap[rs.id]
            return (
              <div key={rs.id} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, overflow: 'hidden' }}>
                {/* Ruleset header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px', cursor: 'pointer' }}
                  onClick={() => expandRuleset(rs.id)}>
                  {isExpanded
                    ? <ChevronDownIcon style={{ width: 14, height: 14, color: C.muted, flexShrink: 0 }} />
                    : <ChevronRightIcon style={{ width: 14, height: 14, color: C.muted, flexShrink: 0 }} />}
                  <span style={{ fontSize: 13, fontWeight: 600, color: C.text, flex: 1 }}>{rs.name}</span>
                  <span style={pillStyle(rs.is_active)}>{rs.is_active ? 'Active' : 'Inactive'}</span>
                  <span style={priorityPill}>P{rs.priority}</span>
                  <span style={{ fontSize: 10, color: C.muted, fontFamily: C.mono }}>{rs.rule_count} rule{rs.rule_count !== 1 ? 's' : ''}</span>
                </div>

                {/* Expanded: rules + controls */}
                {isExpanded && (
                  <div style={{ borderTop: `1px solid ${C.border}`, padding: 14 }}>
                    {rs.description && (
                      <div style={{ color: C.muted, fontSize: 12, marginBottom: 10 }}>{rs.description}</div>
                    )}

                    {/* Active toggle + delete */}
                    <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                      <button onClick={(e) => { e.stopPropagation(); toggleActive(rs) }} style={{
                        background: 'none', border: `1px solid ${C.border}`, borderRadius: 6,
                        padding: '4px 10px', fontSize: 11, color: rs.is_active ? C.amber : C.green, cursor: 'pointer',
                      }}>{rs.is_active ? 'Deactivate' : 'Activate'}</button>
                      <button onClick={(e) => { e.stopPropagation(); deleteRuleset(rs.id) }} style={{
                        background: 'none', border: `1px solid ${C.border}`, borderRadius: 6,
                        padding: '4px 10px', fontSize: 11, color: C.red, cursor: 'pointer',
                      }}>Delete</button>
                    </div>

                    {/* Rules list */}
                    {rulesLoading === rs.id ? (
                      <div style={{ color: C.muted, fontSize: 12, fontStyle: 'italic' }}>Loading rules...</div>
                    ) : (rules ?? []).length === 0 ? (
                      <div style={{ color: C.muted, fontSize: 12, fontStyle: 'italic', marginBottom: 8 }}>No rules. Add one below.</div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
                        {(rules ?? []).map(rule => (
                          <div key={rule.id} style={{
                            background: C.panel, border: `1px solid ${C.border}`, borderRadius: 6, padding: '8px 10px',
                          }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                              <span style={{ fontSize: 12, color: C.text, flex: 1 }}>
                                {rule.description || <span style={{ fontStyle: 'italic', color: C.dim }}>Unnamed rule</span>}
                              </span>
                              <button onClick={() => deleteRule(rs.id, rule.id)} style={{
                                background: 'none', border: 'none', color: C.red, cursor: 'pointer', padding: 2,
                              }}>
                                <TrashIcon style={{ width: 12, height: 12 }} />
                              </button>
                            </div>
                            <div style={{ display: 'flex', gap: 12, fontSize: 10 }}>
                              <div style={{ flex: 1 }}>
                                <div style={{ color: C.muted, fontWeight: 600, marginBottom: 2, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Condition</div>
                                <pre style={{
                                  margin: 0, padding: 6, background: C.codeBg, borderRadius: 4,
                                  fontSize: 10, fontFamily: C.mono, color: C.code, lineHeight: 1.5,
                                  overflowX: 'auto', maxHeight: 80, whiteSpace: 'pre',
                                }}>{highlightJson(JSON.stringify(rule.condition, null, 2))}</pre>
                              </div>
                              <div style={{ flex: 1 }}>
                                <div style={{ color: C.muted, fontWeight: 600, marginBottom: 2, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Action</div>
                                <pre style={{
                                  margin: 0, padding: 6, background: C.codeBg, borderRadius: 4,
                                  fontSize: 10, fontFamily: C.mono, color: C.code, lineHeight: 1.5,
                                  overflowX: 'auto', maxHeight: 80, whiteSpace: 'pre',
                                }}>{highlightJson(JSON.stringify(rule.action, null, 2))}</pre>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Add rule form */}
                    {addingRuleTo === rs.id ? (
                      <div style={{ background: C.panel, border: `1px solid ${C.cyanBorder}`, borderRadius: 8, padding: 14 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: C.cyan, marginBottom: 10 }}>New Rule</div>
                        <div style={{ marginBottom: 10 }}>
                          <label style={labelStyle}>Description</label>
                          <input value={ruleDesc} onChange={e => setRuleDesc(e.target.value)}
                            placeholder="e.g. Require full verification for minors"
                            style={{ ...inputStyle, fontSize: 12 }} />
                        </div>
                        <div style={{ marginBottom: 12 }}>
                          <label style={{ ...labelStyle, marginBottom: 8 }}>Conditions</label>
                          <ConditionBuilder rows={ruleRows} setRows={setRuleRows}
                            combinator={ruleCombinator} setCombinator={setRuleCombinator} />
                        </div>
                        <div style={{ marginBottom: 12 }}>
                          <label style={{ ...labelStyle, marginBottom: 8 }}>Actions</label>
                          <ActionPicker form={ruleAction} setForm={setRuleAction} />
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button onClick={saveRule} disabled={savingRule} style={{
                            background: C.cyan, border: 'none', color: C.bg, borderRadius: 6,
                            padding: '7px 14px', cursor: 'pointer', fontSize: 12, fontWeight: 600,
                            opacity: savingRule ? 0.6 : 1,
                          }}>{savingRule ? 'Saving...' : 'Save Rule'}</button>
                          <button onClick={() => setAddingRuleTo(null)} style={{
                            background: 'none', border: `1px solid ${C.border}`, color: C.muted,
                            borderRadius: 6, padding: '7px 14px', cursor: 'pointer', fontSize: 12,
                          }}>Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <button onClick={() => startAddRule(rs.id)} style={{
                        background: 'none', border: `1px dashed ${C.border}`, borderRadius: 6,
                        padding: '8px 14px', color: C.cyan, fontSize: 12, cursor: 'pointer',
                        display: 'flex', alignItems: 'center', gap: 4,
                      }}>
                        <PlusIcon style={{ width: 12, height: 12 }} /> Add Rule
                      </button>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Dry-Run Tester */}
      <div style={{ border: `1px solid ${C.border}`, borderRadius: 8, overflow: 'hidden', marginTop: 16 }}>
        <button onClick={() => setShowDryRun(prev => !prev)} style={{
          width: '100%', background: C.surface, border: 'none', padding: '10px 14px',
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <span style={{ color: C.muted, fontSize: 12, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6 }}>
            <PlayIcon style={{ width: 14, height: 14 }} /> Dry-Run Tester
          </span>
          {showDryRun
            ? <ChevronDownIcon style={{ width: 14, height: 14, color: C.muted }} />
            : <ChevronRightIcon style={{ width: 14, height: 14, color: C.muted }} />}
        </button>
        {showDryRun && (
          <div style={{ padding: 14 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
              <div>
                <label style={labelStyle}>Country</label>
                <input value={dryCtx.country} onChange={e => setDryCtx(p => ({ ...p, country: e.target.value }))}
                  placeholder="US" style={{ ...inputStyle, fontSize: 12 }} />
              </div>
              <div>
                <label style={labelStyle}>Document Type</label>
                <input value={dryCtx.document_type} onChange={e => setDryCtx(p => ({ ...p, document_type: e.target.value }))}
                  placeholder="passport" style={{ ...inputStyle, fontSize: 12 }} />
              </div>
              <div>
                <label style={labelStyle}>User Age</label>
                <input type="number" value={dryCtx.user_age} onChange={e => setDryCtx(p => ({ ...p, user_age: e.target.value }))}
                  placeholder="25" style={{ ...inputStyle, fontSize: 12 }} />
              </div>
              <div>
                <label style={labelStyle}>Verification Mode</label>
                <input value={dryCtx.verification_mode} onChange={e => setDryCtx(p => ({ ...p, verification_mode: e.target.value }))}
                  placeholder="full" style={{ ...inputStyle, fontSize: 12 }} />
              </div>
            </div>
            <button onClick={runDryRun} disabled={dryLoading} style={{
              background: C.cyan, border: 'none', color: C.bg, borderRadius: 6,
              padding: '8px 16px', cursor: 'pointer', fontSize: 12, fontWeight: 600,
              opacity: dryLoading ? 0.6 : 1,
            }}>{dryLoading ? 'Evaluating...' : 'Evaluate'}</button>

            {dryResult && (
              <div style={{ marginTop: 12, background: C.codeBg, borderRadius: 6, padding: 12, border: `1px solid ${C.border}` }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: C.muted, marginBottom: 6 }}>
                  {dryResult.matched_rules} rule{dryResult.matched_rules !== 1 ? 's' : ''} matched
                </div>
                {dryResult.matches?.length > 0 && (
                  <div style={{ marginBottom: 8 }}>
                    {dryResult.matches.map((m: any, i: number) => (
                      <div key={i} style={{ fontSize: 11, color: C.text, padding: '2px 0' }}>
                        <span style={{ color: C.cyan }}>{m.ruleset}</span>
                        <span style={{ color: C.dim }}> / </span>
                        <span>{m.rule}</span>
                      </div>
                    ))}
                  </div>
                )}
                <div style={{ fontSize: 10, fontWeight: 600, color: C.muted, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Resolved Action</div>
                <pre style={{
                  margin: 0, padding: 8, background: C.bg, borderRadius: 4,
                  fontSize: 11, fontFamily: C.mono, color: C.code, lineHeight: 1.5,
                  overflowX: 'auto', whiteSpace: 'pre',
                }}>{highlightJson(JSON.stringify(dryResult.resolved_action ?? {}, null, 2))}</pre>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
