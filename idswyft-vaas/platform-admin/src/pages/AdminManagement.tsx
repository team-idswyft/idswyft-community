import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Shield } from 'lucide-react';
import { platformApi } from '../services/api';
import type { PlatformAdmin } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import Modal, { ConfirmationModal } from '../components/ui/Modal';
import {
  sectionLabel,
  monoXs,
  monoSm,
  cardSurface,
  tableHeaderClass,
  statusPill,
  getStatusAccent,
} from '../styles/tokens';

export default function AdminManagement() {
  const { admin: currentAdmin } = useAuth();
  const [admins, setAdmins] = useState<PlatformAdmin[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [createForm, setCreateForm] = useState({
    email: '',
    password: '',
    first_name: '',
    last_name: '',
    role: 'admin',
  });
  const [createError, setCreateError] = useState('');
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    fetchAdmins();
  }, []);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  async function fetchAdmins() {
    setLoading(true);
    try {
      const data = await platformApi.listPlatformAdmins();
      setAdmins(data);
    } catch (err) {
      console.error('Failed to load admins:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreateError('');
    setCreating(true);

    try {
      await platformApi.createPlatformAdmin(createForm);
      setShowCreateModal(false);
      setCreateForm({ email: '', password: '', first_name: '', last_name: '', role: 'admin' });
      setToast({ type: 'success', message: 'Admin created successfully' });
      fetchAdmins();
    } catch (err: any) {
      setCreateError(err.message || 'Failed to create admin');
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(id: string) {
    setDeleting(true);
    try {
      await platformApi.deletePlatformAdmin(id);
      setDeleteConfirm(null);
      setToast({ type: 'success', message: 'Admin deleted' });
      fetchAdmins();
    } catch (err: any) {
      setToast({ type: 'error', message: err.message || 'Failed to delete admin' });
      setDeleteConfirm(null);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <p className={sectionLabel}>Platform Admins</p>
          <p className="text-sm text-slate-500 mt-1">Manage platform administrator accounts</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="btn btn-primary text-sm"
        >
          <Plus className="h-4 w-4" />
          Add Admin
        </button>
      </div>

      {/* Toast */}
      {toast && (
        <div
          className={`rounded-lg p-4 animate-slide-in-up ${
            toast.type === 'success'
              ? 'bg-emerald-500/12 border border-emerald-400/30'
              : 'bg-rose-500/12 border border-rose-400/30'
          }`}
        >
          <span className={`${monoXs} ${toast.type === 'success' ? 'text-emerald-300' : 'text-rose-300'}`}>
            {toast.message}
          </span>
        </div>
      )}

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
                <th className={tableHeaderClass}>Email</th>
                <th className={tableHeaderClass}>Name</th>
                <th className={tableHeaderClass}>Role</th>
                <th className={tableHeaderClass}>Status</th>
                <th className={tableHeaderClass}>Last Login</th>
                <th className={tableHeaderClass}>Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {admins.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-8 text-center text-slate-500">
                    No admins found
                  </td>
                </tr>
              ) : (
                admins.map((admin) => {
                  const isSelf = currentAdmin?.id === admin.id;
                  return (
                    <tr key={admin.id} className="transition hover:bg-slate-800/40">
                      <td className={`px-5 py-3 ${monoSm} text-slate-100`}>{admin.email}</td>
                      <td className={`px-5 py-3 text-sm text-slate-300`}>
                        {admin.first_name} {admin.last_name}
                      </td>
                      <td className="px-5 py-3">
                        {admin.role === 'super_admin' ? (
                          <span className="badge badge-info">
                            <Shield className="h-3 w-3" />
                            super_admin
                          </span>
                        ) : (
                          <span className="badge badge-glass">admin</span>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        <span className={`${statusPill} ${getStatusAccent(admin.status || 'active').pill}`}>
                          {admin.status || 'active'}
                        </span>
                      </td>
                      <td className={`px-5 py-3 ${monoXs} text-slate-500`}>
                        {(admin as any).last_login_at
                          ? new Date((admin as any).last_login_at).toLocaleString()
                          : '--'}
                      </td>
                      <td className="px-5 py-3">
                        {!isSelf && (
                          <button
                            onClick={() => setDeleteConfirm(admin.id)}
                            className="text-slate-500 hover:text-rose-400 transition"
                            title="Delete admin"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* Delete Confirmation */}
      <ConfirmationModal
        isOpen={!!deleteConfirm}
        onClose={() => setDeleteConfirm(null)}
        onConfirm={() => { if (deleteConfirm) handleDelete(deleteConfirm); }}
        title="Delete Admin"
        message="Are you sure you want to delete this admin? This action cannot be undone."
        confirmText={deleting ? 'Deleting...' : 'Delete'}
        confirmVariant="danger"
      />

      {/* Create Admin Modal */}
      <Modal isOpen={showCreateModal} onClose={() => setShowCreateModal(false)} title="Add Admin" size="md">
        {createError && (
          <div className="bg-rose-500/12 border border-rose-400/30 rounded-lg p-3 mb-4">
            <span className={`${monoXs} text-rose-300`}>{createError}</span>
          </div>
        )}

        <form onSubmit={handleCreate} className="space-y-4">
          <div className="form-group">
            <label className="form-label">Email</label>
            <input
              type="email"
              required
              value={createForm.email}
              onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
              className="form-input"
              placeholder="admin@idswyft.app"
            />
          </div>

          <div className="form-group">
            <label className="form-label">Password</label>
            <input
              type="password"
              required
              minLength={8}
              value={createForm.password}
              onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
              className="form-input"
              placeholder="Min 8 characters"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="form-group">
              <label className="form-label">First Name</label>
              <input
                type="text"
                required
                value={createForm.first_name}
                onChange={(e) => setCreateForm({ ...createForm, first_name: e.target.value })}
                className="form-input"
              />
            </div>
            <div className="form-group">
              <label className="form-label">Last Name</label>
              <input
                type="text"
                required
                value={createForm.last_name}
                onChange={(e) => setCreateForm({ ...createForm, last_name: e.target.value })}
                className="form-input"
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Role</label>
            <select
              value={createForm.role}
              onChange={(e) => setCreateForm({ ...createForm, role: e.target.value })}
              className="form-input"
            >
              <option value="admin">Admin</option>
              <option value="super_admin">Super Admin</option>
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
              {creating ? 'Creating...' : 'Create Admin'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
