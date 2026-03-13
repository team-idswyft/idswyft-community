import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Plus, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { platformApi } from '../services/api';
import type { Organization } from '../services/api';
import {
  sectionLabel,
  monoXs,
  monoSm,
  cardSurface,
  tableHeaderClass,
  statusPill,
  getStatusAccent,
} from '../styles/tokens';

export default function Organizations() {
  const navigate = useNavigate();
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState({
    name: '',
    slug: '',
    contact_email: '',
    subscription_tier: 'free',
  });
  const [createError, setCreateError] = useState('');
  const [creating, setCreating] = useState(false);

  const limit = 20;

  useEffect(() => {
    fetchOrganizations();
  }, [page, search]);

  async function fetchOrganizations() {
    setLoading(true);
    try {
      const params: Record<string, any> = { limit, offset: (page - 1) * limit };
      if (search) params.search = search;

      const res = await platformApi.listOrganizations(params);
      setOrganizations(res.organizations);
      const total = res.meta?.total ?? res.organizations.length;
      setTotalPages(Math.max(1, Math.ceil(total / limit)));
    } catch (err) {
      console.error('Failed to load organizations:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreateError('');
    setCreating(true);

    try {
      await platformApi.createOrganization(createForm);
      setShowCreateModal(false);
      setCreateForm({ name: '', slug: '', contact_email: '', subscription_tier: 'free' });
      fetchOrganizations();
    } catch (err: any) {
      setCreateError(err.message || 'Failed to create organization');
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <p className={sectionLabel}>All Organizations</p>
        <div className="flex items-center gap-3">
          {/* Search */}
          <div className="relative">
            <div className="form-icon">
              <Search className="form-icon-svg" />
            </div>
            <input
              type="text"
              placeholder="Search organizations..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="form-input form-input-icon w-64"
            />
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            className="btn btn-primary text-sm"
          >
            <Plus className="h-4 w-4" />
            Create Organization
          </button>
        </div>
      </div>

      {/* Table */}
      <div className={`${cardSurface} overflow-hidden`}>
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-400" />
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="bg-slate-950/60">
                <th className={tableHeaderClass}>Name</th>
                <th className={tableHeaderClass}>Slug</th>
                <th className={tableHeaderClass}>Plan</th>
                <th className={tableHeaderClass}>Status</th>
                <th className={tableHeaderClass}>Members</th>
                <th className={tableHeaderClass}>Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {organizations.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-8 text-center text-slate-500">
                    No organizations found
                  </td>
                </tr>
              ) : (
                organizations.map((org) => (
                  <tr
                    key={org.id}
                    onClick={() => navigate(`/organizations/${org.id}`)}
                    className="cursor-pointer transition hover:bg-slate-800/40"
                  >
                    <td className={`px-5 py-3 ${monoSm} text-slate-100`}>{org.name}</td>
                    <td className={`px-5 py-3 ${monoXs} text-slate-400`}>{org.slug}</td>
                    <td className={`px-5 py-3 ${monoXs} text-slate-300`}>
                      {org.subscription_tier || '--'}
                    </td>
                    <td className="px-5 py-3">
                      <span className={`${statusPill} ${getStatusAccent(org.billing_status || org.status).pill}`}>
                        {org.billing_status || org.status}
                      </span>
                    </td>
                    <td className={`px-5 py-3 ${monoXs} text-slate-400`}>
                      {org.member_count ?? '--'}
                    </td>
                    <td className={`px-5 py-3 ${monoXs} text-slate-500`}>
                      {new Date(org.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-white/10 px-5 py-3">
            <span className={`${monoXs} text-slate-500`}>
              Page {page} of {totalPages}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="btn btn-ghost text-sm px-3 py-1.5"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="btn btn-ghost text-sm px-3 py-1.5"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Create Organization Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="fixed inset-0 bg-slate-950/65 backdrop-blur-[2px]"
            onClick={() => setShowCreateModal(false)}
          />
          <div className="relative glass-panel rounded-xl p-6 w-full max-w-md animate-scale-in">
            <div className="flex items-center justify-between mb-6">
              <p className={sectionLabel}>Create Organization</p>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-slate-400 hover:text-slate-200 transition"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {createError && (
              <div className="bg-rose-500/12 border border-rose-400/30 rounded-lg p-3 mb-4">
                <span className={`${monoXs} text-rose-300`}>{createError}</span>
              </div>
            )}

            <form onSubmit={handleCreate} className="space-y-4">
              <div className="form-group">
                <label className="form-label">Organization Name</label>
                <input
                  type="text"
                  required
                  value={createForm.name}
                  onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                  className="form-input"
                  placeholder="Acme Corp"
                />
              </div>

              <div className="form-group">
                <label className="form-label">Slug</label>
                <input
                  type="text"
                  required
                  value={createForm.slug}
                  onChange={(e) => setCreateForm({ ...createForm, slug: e.target.value })}
                  className="form-input"
                  placeholder="acme-corp"
                />
              </div>

              <div className="form-group">
                <label className="form-label">Contact Email</label>
                <input
                  type="email"
                  required
                  value={createForm.contact_email}
                  onChange={(e) => setCreateForm({ ...createForm, contact_email: e.target.value })}
                  className="form-input"
                  placeholder="admin@acme.com"
                />
              </div>

              <div className="form-group">
                <label className="form-label">Subscription Tier</label>
                <select
                  value={createForm.subscription_tier}
                  onChange={(e) => setCreateForm({ ...createForm, subscription_tier: e.target.value })}
                  className="form-input"
                >
                  <option value="free">Free</option>
                  <option value="starter">Starter</option>
                  <option value="growth">Growth</option>
                  <option value="enterprise">Enterprise</option>
                </select>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="btn btn-ghost text-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="btn btn-primary text-sm"
                >
                  {creating ? 'Creating...' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
