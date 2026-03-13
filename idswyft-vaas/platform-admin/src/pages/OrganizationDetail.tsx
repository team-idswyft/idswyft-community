import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Building, Users, CheckCircle, Key, Webhook } from 'lucide-react';
import { platformApi } from '../services/api';
import type { Organization } from '../services/api';
import {
  sectionLabel,
  statNumber,
  monoXs,
  monoSm,
  cardSurface,
  statusPill,
  getStatusAccent,
} from '../styles/tokens';

interface OrgStats {
  admins: number;
  end_users: number;
  verifications: number;
  api_keys: number;
  webhooks: number;
}

export default function OrganizationDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [org, setOrg] = useState<Organization | null>(null);
  const [stats, setStats] = useState<OrgStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id) return;
    fetchOrg();
  }, [id]);

  async function fetchOrg() {
    setLoading(true);
    try {
      const [orgData, orgStats] = await Promise.all([
        platformApi.getOrganization(id!),
        platformApi.getOrgStats(id!).catch(() => null),
      ]);
      setOrg(orgData);
      if (orgStats) {
        setStats({
          admins: orgStats.admins ?? orgStats.admin_count ?? 0,
          end_users: orgStats.end_users ?? orgStats.end_user_count ?? 0,
          verifications: orgStats.verifications ?? orgStats.verification_count ?? 0,
          api_keys: orgStats.api_keys ?? orgStats.api_key_count ?? 0,
          webhooks: orgStats.webhooks ?? orgStats.webhook_count ?? 0,
        });
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load organization');
    } finally {
      setLoading(false);
    }
  }

  async function handleStatusToggle() {
    if (!org) return;
    setActionLoading(true);
    setError('');

    const newStatus = org.billing_status === 'active' ? 'suspended' : 'active';

    try {
      const updated = await platformApi.updateOrgStatus(org.id, newStatus);
      setOrg(updated);
    } catch (err: any) {
      setError(err.message || 'Failed to update status');
    } finally {
      setActionLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-400" />
      </div>
    );
  }

  if (!org) {
    return (
      <div className="p-6">
        <p className="text-slate-400">Organization not found.</p>
        <button onClick={() => navigate('/organizations')} className="btn btn-ghost text-sm mt-4">
          <ArrowLeft className="h-4 w-4" />
          Back to Organizations
        </button>
      </div>
    );
  }

  const statCards = [
    { label: 'Admins', value: stats?.admins ?? 0, icon: Users, iconClass: 'icon-container-blue', iconColor: 'text-cyan-300' },
    { label: 'End Users', value: stats?.end_users ?? 0, icon: Users, iconClass: 'icon-container-green', iconColor: 'text-emerald-300' },
    { label: 'Verifications', value: stats?.verifications ?? 0, icon: CheckCircle, iconClass: 'icon-container-yellow', iconColor: 'text-amber-300' },
    { label: 'API Keys', value: stats?.api_keys ?? 0, icon: Key, iconClass: 'icon-container-purple', iconColor: 'text-cyan-200' },
    { label: 'Webhooks', value: stats?.webhooks ?? 0, icon: Webhook, iconClass: 'icon-container-blue', iconColor: 'text-cyan-300' },
  ];

  const billingStatus = org.billing_status || org.status || 'active';

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      {/* Back Button */}
      <button
        onClick={() => navigate('/organizations')}
        className="btn btn-ghost text-sm"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Organizations
      </button>

      {error && (
        <div className="bg-rose-500/12 border border-rose-400/30 rounded-lg p-4">
          <span className={`${monoXs} text-rose-300`}>{error}</span>
        </div>
      )}

      {/* Org Info Card */}
      <div className={`${cardSurface} p-6 animate-slide-in-up`}>
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="icon-container-blue">
                <Building className="h-5 w-5 text-cyan-300" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-slate-100">{org.name}</h2>
                <p className={`${monoXs} text-slate-500`}>{org.slug}</p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2 mt-4">
              <div>
                <span className={`${sectionLabel} block`}>Contact Email</span>
                <span className={`${monoSm} text-slate-300`}>{org.contact_email || '--'}</span>
              </div>
              <div>
                <span className={`${sectionLabel} block`}>Subscription Tier</span>
                <span className={`${monoSm} text-slate-300`}>{org.subscription_tier || '--'}</span>
              </div>
              <div>
                <span className={`${sectionLabel} block`}>Billing Status</span>
                <span className={`${statusPill} ${getStatusAccent(billingStatus).pill}`}>
                  {billingStatus}
                </span>
              </div>
              <div>
                <span className={`${sectionLabel} block`}>Created</span>
                <span className={`${monoXs} text-slate-400`}>
                  {new Date(org.created_at).toLocaleString()}
                </span>
              </div>
            </div>
          </div>

          {/* Status Toggle */}
          <div className="flex-shrink-0">
            {billingStatus === 'active' ? (
              <button
                onClick={handleStatusToggle}
                disabled={actionLoading}
                className="btn btn-danger text-sm"
              >
                {actionLoading ? 'Updating...' : 'Suspend'}
              </button>
            ) : (
              <button
                onClick={handleStatusToggle}
                disabled={actionLoading}
                className="btn btn-primary text-sm"
              >
                {actionLoading ? 'Updating...' : 'Reactivate'}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Stats Section */}
      <div>
        <p className={`${sectionLabel} mb-4`}>Organization Stats</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {statCards.map((card, i) => {
            const Icon = card.icon;
            return (
              <div
                key={card.label}
                className={`${cardSurface} p-4 hover-lift animate-slide-in-up`}
                style={{ animationDelay: `${i * 60}ms` }}
              >
                <div className="flex items-center gap-3">
                  <div className={card.iconClass}>
                    <Icon className={`h-5 w-5 ${card.iconColor}`} />
                  </div>
                  <div>
                    <div className={statNumber}>{card.value.toLocaleString()}</div>
                    <div className={sectionLabel}>{card.label}</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
