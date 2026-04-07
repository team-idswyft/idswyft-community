import express, { Request, Response } from 'express';
import { authenticateAPIKey } from '@/middleware/auth.js';
import { catchAsync } from '@/middleware/errorHandler.js';
import { supabase } from '@/config/database.js';
import {
  validateCondition,
  validateAction,
  loadActiveRulesForDeveloper,
  evaluateRules,
} from '@/services/complianceEngine.js';
import type { ComplianceContext } from '@/services/complianceEngine.js';

const router = express.Router();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ─── Rulesets ───────────────────────────────────────────────────

// POST /api/v2/compliance/rulesets — Create a new compliance ruleset
router.post('/rulesets',
  authenticateAPIKey as any,
  catchAsync(async (req: Request, res: Response) => {
    const developerId = (req as any).developer.id;
    const { name, description, is_active, priority } = req.body || {};

    if (!name || typeof name !== 'string' || name.length > 200) {
      return res.status(400).json({ error: 'name is required (max 200 chars)' });
    }

    const { data, error } = await supabase
      .from('compliance_rulesets')
      .insert({
        developer_id: developerId,
        name,
        description: description || null,
        is_active: is_active !== undefined ? is_active : true,
        priority: typeof priority === 'number' ? priority : 100,
      })
      .select('id, name, description, is_active, priority, created_at')
      .single();

    if (error) throw new Error(`Failed to create ruleset: ${error.message}`);

    res.status(201).json({ success: true, ruleset: data });
  })
);

// GET /api/v2/compliance/rulesets — List all rulesets for this developer
router.get('/rulesets',
  authenticateAPIKey as any,
  catchAsync(async (req: Request, res: Response) => {
    const developerId = (req as any).developer.id;

    const { data: rulesets, error } = await supabase
      .from('compliance_rulesets')
      .select('id, name, description, is_active, priority, created_at, updated_at')
      .eq('developer_id', developerId)
      .order('priority', { ascending: true });

    if (error) throw new Error(`Failed to list rulesets: ${error.message}`);

    const rulesetIds = (rulesets ?? []).map((r: { id: string }) => r.id);
    let ruleCounts: Record<string, number> = {};
    if (rulesetIds.length > 0) {
      const { data: rules } = await supabase
        .from('compliance_rules')
        .select('ruleset_id')
        .in('ruleset_id', rulesetIds);
      for (const r of (rules ?? []) as { ruleset_id: string }[]) {
        ruleCounts[r.ruleset_id] = (ruleCounts[r.ruleset_id] || 0) + 1;
      }
    }

    res.json({
      success: true,
      rulesets: (rulesets ?? []).map((rs: { id: string; name: string; description: string | null; is_active: boolean; priority: number; created_at: string; updated_at: string }) => ({
        ...rs,
        rule_count: ruleCounts[rs.id] || 0,
      })),
    });
  })
);

// GET /api/v2/compliance/rulesets/:id — Get a single ruleset with all its rules
router.get('/rulesets/:id',
  authenticateAPIKey as any,
  catchAsync(async (req: Request, res: Response) => {
    const developerId = (req as any).developer.id;
    const { id } = req.params;

    if (!UUID_RE.test(id)) return res.status(400).json({ error: 'Invalid ruleset ID' });

    const { data: ruleset } = await supabase
      .from('compliance_rulesets')
      .select('id, name, description, is_active, priority, created_at, updated_at')
      .eq('id', id)
      .eq('developer_id', developerId)
      .single();

    if (!ruleset) return res.status(404).json({ error: 'Ruleset not found' });

    const { data: rules } = await supabase
      .from('compliance_rules')
      .select('id, condition, action, description, created_at')
      .eq('ruleset_id', id)
      .order('created_at', { ascending: true });

    res.json({ success: true, ruleset: { ...ruleset, rules: rules ?? [] } });
  })
);

// PUT /api/v2/compliance/rulesets/:id — Update ruleset metadata
router.put('/rulesets/:id',
  authenticateAPIKey as any,
  catchAsync(async (req: Request, res: Response) => {
    const developerId = (req as any).developer.id;
    const { id } = req.params;
    const { name, description, is_active, priority } = req.body || {};

    if (!UUID_RE.test(id)) return res.status(400).json({ error: 'Invalid ruleset ID' });

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (name !== undefined) {
      if (typeof name !== 'string' || name.length > 200) {
        return res.status(400).json({ error: 'name must be a string (max 200 chars)' });
      }
      updates.name = name;
    }
    if (description !== undefined) updates.description = description;
    if (is_active !== undefined) {
      if (typeof is_active !== 'boolean') {
        return res.status(400).json({ error: 'is_active must be a boolean' });
      }
      updates.is_active = is_active;
    }
    if (priority !== undefined) {
      if (typeof priority !== 'number' || !Number.isInteger(priority)) {
        return res.status(400).json({ error: 'priority must be an integer' });
      }
      updates.priority = priority;
    }

    const { data, error } = await supabase
      .from('compliance_rulesets')
      .update(updates)
      .eq('id', id)
      .eq('developer_id', developerId)
      .select('id, name, description, is_active, priority, created_at, updated_at')
      .single();

    if (error) return res.status(404).json({ error: 'Ruleset not found' });

    res.json({ success: true, ruleset: data });
  })
);

// DELETE /api/v2/compliance/rulesets/:id — Delete a ruleset and all its rules (CASCADE)
router.delete('/rulesets/:id',
  authenticateAPIKey as any,
  catchAsync(async (req: Request, res: Response) => {
    const developerId = (req as any).developer.id;
    const { id } = req.params;

    if (!UUID_RE.test(id)) return res.status(400).json({ error: 'Invalid ruleset ID' });

    const { data, error } = await supabase
      .from('compliance_rulesets')
      .delete()
      .eq('id', id)
      .eq('developer_id', developerId)
      .select('id');

    if (error) throw new Error(`Failed to delete ruleset: ${error.message}`);
    if (!data?.length) return res.status(404).json({ error: 'Ruleset not found' });

    res.json({ success: true, message: 'Ruleset and all rules deleted' });
  })
);

// ─── Rules ──────────────────────────────────────────────────────

// POST /api/v2/compliance/rulesets/:id/rules — Add a rule to a ruleset
router.post('/rulesets/:id/rules',
  authenticateAPIKey as any,
  catchAsync(async (req: Request, res: Response) => {
    const developerId = (req as any).developer.id;
    const { id: rulesetId } = req.params;
    const { condition, action, description } = req.body || {};

    if (!UUID_RE.test(rulesetId)) return res.status(400).json({ error: 'Invalid ruleset ID' });

    // Verify ownership
    const { data: ruleset } = await supabase
      .from('compliance_rulesets')
      .select('id')
      .eq('id', rulesetId)
      .eq('developer_id', developerId)
      .single();

    if (!ruleset) return res.status(404).json({ error: 'Ruleset not found' });

    const condErr = validateCondition(condition);
    if (condErr) return res.status(400).json({ error: `Invalid condition: ${condErr}` });

    const actErr = validateAction(action);
    if (actErr) return res.status(400).json({ error: `Invalid action: ${actErr}` });

    const { data, error } = await supabase
      .from('compliance_rules')
      .insert({
        ruleset_id: rulesetId,
        condition,
        action,
        description: description || null,
      })
      .select('id, condition, action, description, created_at')
      .single();

    if (error) throw new Error(`Failed to create rule: ${error.message}`);

    res.status(201).json({ success: true, rule: data });
  })
);

// PUT /api/v2/compliance/rules/:id — Update a rule's condition, action, or description
router.put('/rules/:id',
  authenticateAPIKey as any,
  catchAsync(async (req: Request, res: Response) => {
    const developerId = (req as any).developer.id;
    const { id } = req.params;
    const { condition, action, description } = req.body || {};

    if (!UUID_RE.test(id)) return res.status(400).json({ error: 'Invalid rule ID' });

    // Verify ownership through ruleset
    const { data: rule } = await supabase
      .from('compliance_rules')
      .select('id, ruleset_id')
      .eq('id', id)
      .single();

    if (!rule) return res.status(404).json({ error: 'Rule not found' });

    const { data: ruleset } = await supabase
      .from('compliance_rulesets')
      .select('id')
      .eq('id', rule.ruleset_id)
      .eq('developer_id', developerId)
      .single();

    if (!ruleset) return res.status(404).json({ error: 'Rule not found' });

    const updates: Record<string, unknown> = {};

    if (condition !== undefined) {
      const condErr = validateCondition(condition);
      if (condErr) return res.status(400).json({ error: `Invalid condition: ${condErr}` });
      updates.condition = condition;
    }
    if (action !== undefined) {
      const actErr = validateAction(action);
      if (actErr) return res.status(400).json({ error: `Invalid action: ${actErr}` });
      updates.action = action;
    }
    if (description !== undefined) updates.description = description;

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    const { data: updated, error } = await supabase
      .from('compliance_rules')
      .update(updates)
      .eq('id', id)
      .select('id, condition, action, description, created_at')
      .single();

    if (error) throw new Error(`Failed to update rule: ${error.message}`);

    res.json({ success: true, rule: updated });
  })
);

// DELETE /api/v2/compliance/rules/:id — Delete a single rule
router.delete('/rules/:id',
  authenticateAPIKey as any,
  catchAsync(async (req: Request, res: Response) => {
    const developerId = (req as any).developer.id;
    const { id } = req.params;

    if (!UUID_RE.test(id)) return res.status(400).json({ error: 'Invalid rule ID' });

    // Verify ownership through ruleset
    const { data: rule } = await supabase
      .from('compliance_rules')
      .select('id, ruleset_id')
      .eq('id', id)
      .single();

    if (!rule) return res.status(404).json({ error: 'Rule not found' });

    const { data: ruleset } = await supabase
      .from('compliance_rulesets')
      .select('id')
      .eq('id', rule.ruleset_id)
      .eq('developer_id', developerId)
      .single();

    if (!ruleset) return res.status(404).json({ error: 'Rule not found' });

    const { error } = await supabase
      .from('compliance_rules')
      .delete()
      .eq('id', id);

    if (error) throw new Error(`Failed to delete rule: ${error.message}`);

    res.json({ success: true, message: 'Rule deleted' });
  })
);

// ─── Evaluate (Dry-Run) ────────────────────────────────────────

// POST /api/v2/compliance/evaluate — Dry-run: test a context against active rulesets
router.post('/evaluate',
  authenticateAPIKey as any,
  catchAsync(async (req: Request, res: Response) => {
    const developerId = (req as any).developer.id;
    const { context } = req.body || {};

    if (!context || typeof context !== 'object') {
      return res.status(400).json({ error: 'context object is required' });
    }

    const ctx: ComplianceContext = {
      country: context.country,
      document_type: context.document_type,
      user_age: context.user_age,
      verification_mode: context.verification_mode,
      risk_score: context.risk_score,
      aml_risk_level: context.aml_risk_level,
      metadata: context.metadata,
    };

    const rulesets = await loadActiveRulesForDeveloper(developerId);
    const { matches, merged } = evaluateRules(rulesets, ctx);

    res.json({
      success: true,
      matched_rules: matches.length,
      matches: matches.map(m => ({
        ruleset: m.ruleset_name,
        rule: m.rule_description || m.rule_id,
        action: m.action,
      })),
      resolved_action: merged,
    });
  })
);

export default router;
