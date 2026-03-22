import { statusDb } from '../config/database.js';
import type { Incident, IncidentUpdate } from '../types/index.js';

interface CreateIncidentPayload {
  title: string;
  severity: 'minor' | 'major' | 'critical';
  affected_services: string[];
  status?: 'investigating' | 'identified' | 'monitoring' | 'resolved';
  created_by?: string;
}

interface UpdateIncidentPayload {
  title?: string;
  severity?: 'minor' | 'major' | 'critical';
  status?: 'investigating' | 'identified' | 'monitoring' | 'resolved';
  affected_services?: string[];
}

interface CreateUpdatePayload {
  message: string;
  status?: string;
  created_by?: string;
}

class IncidentService {
  async create(payload: CreateIncidentPayload): Promise<Incident> {
    const row = {
      title: payload.title,
      status: payload.status || 'investigating',
      severity: payload.severity,
      affected_services: payload.affected_services,
      created_by: payload.created_by || null,
    };

    const { data, error } = await statusDb
      .from('incidents')
      .insert(row)
      .select()
      .single();

    if (error) throw new Error(`Failed to create incident: ${error.message}`);
    return data as Incident;
  }

  async update(id: string, payload: UpdateIncidentPayload): Promise<Incident> {
    const updates: Record<string, any> = {};
    if (payload.title !== undefined) updates.title = payload.title;
    if (payload.severity !== undefined) updates.severity = payload.severity;
    if (payload.affected_services !== undefined) updates.affected_services = payload.affected_services;
    if (payload.status !== undefined) {
      updates.status = payload.status;
      if (payload.status === 'resolved') {
        updates.resolved_at = new Date().toISOString();
      } else {
        // Re-opening: clear resolved_at
        updates.resolved_at = null;
      }
    }

    const { data, error } = await statusDb
      .from('incidents')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error(`Failed to update incident: ${error.message}`);
    return data as Incident;
  }

  async addUpdate(incidentId: string, payload: CreateUpdatePayload): Promise<IncidentUpdate> {
    const { data, error } = await statusDb
      .from('incident_updates')
      .insert({
        incident_id: incidentId,
        message: payload.message,
        status: payload.status || null,
        created_by: payload.created_by || null,
      })
      .select()
      .single();

    if (error) throw new Error(`Failed to add update: ${error.message}`);

    // If status provided, also update the parent incident
    if (payload.status) {
      await this.update(incidentId, { status: payload.status as any });
    }

    return data as IncidentUpdate;
  }

  async delete(id: string): Promise<void> {
    const { error } = await statusDb.from('incidents').delete().eq('id', id);
    if (error) throw new Error(`Failed to delete incident: ${error.message}`);
  }

  async getAll(): Promise<Incident[]> {
    // Active first (by created_at DESC), then resolved (by resolved_at DESC)
    const { data: active, error: activeErr } = await statusDb
      .from('incidents')
      .select('*')
      .neq('status', 'resolved')
      .order('created_at', { ascending: false });

    const { data: resolved, error: resolvedErr } = await statusDb
      .from('incidents')
      .select('*')
      .eq('status', 'resolved')
      .order('resolved_at', { ascending: false })
      .limit(100);

    if (activeErr) throw new Error(activeErr.message);
    if (resolvedErr) throw new Error(resolvedErr.message);

    return [...(active || []), ...(resolved || [])] as Incident[];
  }

  async getById(id: string): Promise<Incident & { updates: IncidentUpdate[] }> {
    const { data: incident, error: incErr } = await statusDb
      .from('incidents')
      .select('*')
      .eq('id', id)
      .single();

    if (incErr) throw new Error(incErr.message);

    const { data: updates, error: updErr } = await statusDb
      .from('incident_updates')
      .select('*')
      .eq('incident_id', id)
      .order('created_at', { ascending: true });

    if (updErr) throw new Error(updErr.message);

    return { ...(incident as Incident), updates: (updates || []) as IncidentUpdate[] };
  }
}

export const incidentService = new IncidentService();
