import React, { useState, useEffect } from 'react';
import { Building, CheckCircle, UserCog, Activity } from 'lucide-react';
import { platformApi } from '../services/api';
import type { Organization, PlatformAdmin } from '../services/api';
import {
  sectionLabel,
  statNumber,
  monoXs,
  monoSm,
  cardSurface,
  tableHeaderClass,
  statusPill,
  getStatusAccent,
} from '../styles/tokens';

interface DashboardStats {
  orgCount: number;
  adminCount: number;
  verificationCount: string;
  systemStatus: string;
}

export default function Dashboard() {
  const [stats, setStats] = useState<DashboardStats>({
    orgCount: 0,
    adminCount: 0,
    verificationCount: '--',
    systemStatus: 'Healthy',
  });
  const [recentOrgs, setRecentOrgs] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        const [orgRes, admins] = await Promise.all([
          platformApi.listOrganizations({ limit: 5, sort: 'created_at', order: 'desc' }),
          platformApi.listPlatformAdmins(),
        ]);

        setStats({
          orgCount: orgRes.meta?.total ?? orgRes.organizations.length,
          adminCount: admins.length,
          verificationCount: '--',
          systemStatus: 'Healthy',
        });
        setRecentOrgs(orgRes.organizations.slice(0, 5));
      } catch (err) {
        console.error('Failed to load dashboard data:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, []);

  const statCards = [
    {
      label: 'Organizations',
      value: stats.orgCount,
      icon: Building,
      iconClass: 'icon-container-blue',
      iconColor: 'text-cyan-300',
    },
    {
      label: 'Total Verifications',
      value: stats.verificationCount,
      icon: CheckCircle,
      iconClass: 'icon-container-green',
      iconColor: 'text-emerald-300',
    },
    {
      label: 'Platform Admins',
      value: stats.adminCount,
      icon: UserCog,
      iconClass: 'icon-container-yellow',
      iconColor: 'text-amber-300',
    },
    {
      label: 'System Status',
      value: stats.systemStatus,
      icon: Activity,
      iconClass: 'icon-container-purple',
      iconColor: 'text-cyan-200',
    },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-400" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-8 animate-fade-in">
      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {statCards.map((card, i) => {
          const Icon = card.icon;
          return (
            <div
              key={card.label}
              className={`${cardSurface} p-5 hover-lift animate-slide-in-up`}
              style={{ animationDelay: `${i * 80}ms` }}
            >
              <div className="flex items-center gap-4">
                <div className={card.iconClass}>
                  <Icon className={`h-5 w-5 ${card.iconColor}`} />
                </div>
                <div>
                  <div className={statNumber}>
                    {typeof card.value === 'number' ? card.value.toLocaleString() : card.value}
                  </div>
                  <div className={sectionLabel}>{card.label}</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Recent Organizations */}
      <div
        className="animate-slide-in-up"
        style={{ animationDelay: '320ms' }}
      >
        <p className={`${sectionLabel} mb-4`}>Recent Organizations</p>
        <div className={`${cardSurface} overflow-hidden`}>
          <table className="w-full">
            <thead>
              <tr className="bg-slate-950/60">
                <th className={tableHeaderClass}>Name</th>
                <th className={tableHeaderClass}>Slug</th>
                <th className={tableHeaderClass}>Status</th>
                <th className={tableHeaderClass}>Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {recentOrgs.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-5 py-8 text-center text-slate-500">
                    No organizations yet
                  </td>
                </tr>
              ) : (
                recentOrgs.map((org) => (
                  <tr key={org.id} className="transition hover:bg-slate-800/40">
                    <td className={`px-5 py-3 ${monoSm} text-slate-100`}>{org.name}</td>
                    <td className={`px-5 py-3 ${monoXs} text-slate-400`}>{org.slug}</td>
                    <td className="px-5 py-3">
                      <span className={`${statusPill} ${getStatusAccent(org.billing_status || org.status).pill}`}>
                        {org.billing_status || org.status}
                      </span>
                    </td>
                    <td className={`px-5 py-3 ${monoXs} text-slate-500`}>
                      {new Date(org.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
