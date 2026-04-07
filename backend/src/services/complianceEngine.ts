import { supabase } from '@/config/database.js';
import { logger } from '@/utils/logger.js';

// ─── Types ──────────────────────────────────────────────────────

export interface ComplianceContext {
  country?: string;
  document_type?: string;
  user_age?: number;
  verification_mode?: string;
  risk_score?: number;
  aml_risk_level?: string;
  metadata?: Record<string, unknown>;
}

export type ComparisonOp = 'eq' | 'neq' | 'in' | 'not_in' | 'gt' | 'gte' | 'lt' | 'lte' | 'exists' | 'contains';

export interface LeafCondition {
  field: string;
  op: ComparisonOp;
  value: unknown;
}

export interface CombinatorCondition {
  all?: Condition[];
  any?: Condition[];
  not?: Condition;
}

export type Condition = LeafCondition | CombinatorCondition;

export interface ComplianceAction {
  set_mode?: string;
  require_address?: boolean;
  require_liveness?: string;
  require_aml?: boolean;
  set_flag?: string;
  force_manual_review?: boolean;
}

export interface MergedAction {
  set_mode?: string;
  require_address?: boolean;
  require_liveness?: string;
  require_aml?: boolean;
  force_manual_review?: boolean;
  flags?: string[];
}

export interface RuleMatch {
  ruleset_id: string;
  ruleset_name: string;
  rule_id: string;
  rule_description: string | null;
  action: ComplianceAction;
}

// ─── Condition Evaluator ────────────────────────────────────────

function resolveField(ctx: ComplianceContext, field: string): unknown {
  if (field.startsWith('metadata.')) {
    const key = field.slice(9);
    return ctx.metadata?.[key];
  }
  return (ctx as Record<string, unknown>)[field];
}

function evaluateLeaf(cond: LeafCondition, ctx: ComplianceContext): boolean {
  const actual = resolveField(ctx, cond.field);

  switch (cond.op) {
    case 'eq':
      return actual === cond.value;
    case 'neq':
      return actual !== cond.value;
    case 'in':
      return Array.isArray(cond.value) && cond.value.includes(actual);
    case 'not_in':
      return Array.isArray(cond.value) && !cond.value.includes(actual);
    case 'gt':
      return typeof actual === 'number' && typeof cond.value === 'number' && actual > cond.value;
    case 'gte':
      return typeof actual === 'number' && typeof cond.value === 'number' && actual >= cond.value;
    case 'lt':
      return typeof actual === 'number' && typeof cond.value === 'number' && actual < cond.value;
    case 'lte':
      return typeof actual === 'number' && typeof cond.value === 'number' && actual <= cond.value;
    case 'exists':
      return cond.value === true ? actual !== undefined && actual !== null : actual === undefined || actual === null;
    case 'contains':
      return typeof actual === 'string' && typeof cond.value === 'string' && actual.includes(cond.value);
    default:
      return false;
  }
}

function isCombinator(c: Condition): c is CombinatorCondition {
  return 'all' in c || 'any' in c || 'not' in c;
}

export function evaluateCondition(condition: Condition, ctx: ComplianceContext): boolean {
  if (isCombinator(condition)) {
    if ('all' in condition && condition.all) {
      return condition.all.every(c => evaluateCondition(c, ctx));
    }
    if ('any' in condition && condition.any) {
      return condition.any.some(c => evaluateCondition(c, ctx));
    }
    if ('not' in condition && condition.not) {
      return !evaluateCondition(condition.not, ctx);
    }
    return false;
  }
  return evaluateLeaf(condition as LeafCondition, ctx);
}

// ─── Action Merger ──────────────────────────────────────────────

const MODE_RESTRICTIVENESS: Record<string, number> = {
  age_only: 1,
  document_only: 2,
  identity: 3,
  full: 4,
};

export function mergeActions(actions: ComplianceAction[]): MergedAction {
  if (actions.length === 0) return {};

  const result: MergedAction = {};
  const flags: string[] = [];

  for (const action of actions) {
    if (action.set_mode) {
      const current = result.set_mode ? (MODE_RESTRICTIVENESS[result.set_mode] ?? 0) : 0;
      const incoming = MODE_RESTRICTIVENESS[action.set_mode] ?? 0;
      if (incoming > current) {
        result.set_mode = action.set_mode;
      }
    }

    if (action.require_address === true) result.require_address = true;
    if (action.require_aml === true) result.require_aml = true;
    if (action.force_manual_review === true) result.force_manual_review = true;

    if (action.require_liveness) {
      if (!result.require_liveness || action.require_liveness === 'head_turn') {
        result.require_liveness = action.require_liveness;
      }
    }

    if (action.set_flag) {
      flags.push(action.set_flag);
    }
  }

  if (flags.length > 0) result.flags = [...new Set(flags)];
  return result;
}

// ─── Validation ─────────────────────────────────────────────────

const VALID_OPS: Set<string> = new Set(['eq', 'neq', 'in', 'not_in', 'gt', 'gte', 'lt', 'lte', 'exists', 'contains']);
const VALID_MODES: Set<string> = new Set(['full', 'document_only', 'identity', 'age_only']);

export function validateCondition(condition: unknown): string | null {
  if (!condition || typeof condition !== 'object') return 'Condition must be an object';

  const c = condition as Record<string, unknown>;

  if ('all' in c) {
    if (!Array.isArray(c.all) || c.all.length === 0) return '"all" must be a non-empty array';
    for (const sub of c.all) {
      const err = validateCondition(sub);
      if (err) return err;
    }
    return null;
  }
  if ('any' in c) {
    if (!Array.isArray(c.any) || c.any.length === 0) return '"any" must be a non-empty array';
    for (const sub of c.any) {
      const err = validateCondition(sub);
      if (err) return err;
    }
    return null;
  }
  if ('not' in c) {
    return validateCondition(c.not);
  }

  if (!c.field || typeof c.field !== 'string') return 'Leaf condition must have a "field" string';
  if (!c.op || !VALID_OPS.has(c.op as string)) return `Invalid operator "${c.op}". Valid: ${[...VALID_OPS].join(', ')}`;
  if (c.value === undefined) return 'Leaf condition must have a "value"';

  return null;
}

export function validateAction(action: unknown): string | null {
  if (!action || typeof action !== 'object') return 'Action must be an object';

  const a = action as Record<string, unknown>;
  const keys = Object.keys(a);
  if (keys.length === 0) return 'Action must have at least one field';

  const VALID_KEYS = new Set(['set_mode', 'require_address', 'require_liveness', 'require_aml', 'set_flag', 'force_manual_review']);
  for (const k of keys) {
    if (!VALID_KEYS.has(k)) return `Unknown action key: "${k}"`;
  }

  if (a.set_mode !== undefined && !VALID_MODES.has(a.set_mode as string)) {
    return `Invalid mode "${a.set_mode}". Valid: ${[...VALID_MODES].join(', ')}`;
  }

  return null;
}

// ─── Database Operations ────────────────────────────────────────

export async function loadActiveRulesForDeveloper(
  developerId: string,
): Promise<{ ruleset_id: string; ruleset_name: string; priority: number; rules: { id: string; condition: Condition; action: ComplianceAction; description: string | null }[] }[]> {
  const { data: rulesets, error } = await supabase
    .from('compliance_rulesets')
    .select('id, name, priority')
    .eq('developer_id', developerId)
    .eq('is_active', true)
    .order('priority', { ascending: true });

  if (error || !rulesets?.length) return [];

  const rulesetIds = rulesets.map(r => r.id);
  const { data: rules } = await supabase
    .from('compliance_rules')
    .select('id, ruleset_id, condition, action, description')
    .in('ruleset_id', rulesetIds);

  const rulesByRuleset = new Map<string, typeof rules>();
  for (const rule of rules ?? []) {
    const list = rulesByRuleset.get(rule.ruleset_id) ?? [];
    list.push(rule);
    rulesByRuleset.set(rule.ruleset_id, list);
  }

  return rulesets.map(rs => ({
    ruleset_id: rs.id,
    ruleset_name: rs.name,
    priority: rs.priority,
    rules: (rulesByRuleset.get(rs.id) ?? []).map(r => ({
      id: r.id,
      condition: r.condition as Condition,
      action: r.action as ComplianceAction,
      description: r.description,
    })),
  }));
}

export function evaluateRules(
  rulesets: Awaited<ReturnType<typeof loadActiveRulesForDeveloper>>,
  ctx: ComplianceContext,
): { matches: RuleMatch[]; merged: MergedAction } {
  const matches: RuleMatch[] = [];

  for (const rs of rulesets) {
    for (const rule of rs.rules) {
      if (evaluateCondition(rule.condition, ctx)) {
        matches.push({
          ruleset_id: rs.ruleset_id,
          ruleset_name: rs.ruleset_name,
          rule_id: rule.id,
          rule_description: rule.description,
          action: rule.action,
        });
      }
    }
  }

  const merged = mergeActions(matches.map(m => m.action));

  if (matches.length > 0) {
    logger.info('[Compliance] Rules evaluated', {
      matched: matches.length,
      merged_mode: merged.set_mode,
      flags: merged.flags,
    });
  }

  return { matches, merged };
}
