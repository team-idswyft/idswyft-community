import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../contexts/AuthContext';
import apiClient from '../services/api';
import Modal, { ConfirmationModal } from '../components/ui/Modal';
import type {
  AdminRole,
  AdminUser,
  AdminUserFormData,
  AdminUserUpdateData,
  AdminUserInvite,
  AdminUserStats,
  AdminUserFilters,
  AdminStatus
} from '../types';
import {
  Users,
  Search,
  Filter,
  Plus,
  Edit,
  Trash2,
  Eye,
  UserCheck,
  UserX,
  UserPlus,

  Unlock,
  RefreshCw,
  MoreHorizontal,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  X
} from 'lucide-react';

import { sectionLabel, monoXs, monoSm, statusPill, cardSurface, statusAccent, tableHeaderClass } from '../styles/tokens';

const ITEMS_PER_PAGE = 20;

// ─── Portal dropdown hook ───────────────────────────────────────────────────
function usePortalDropdown() {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  const toggle = useCallback(() => {
    if (!open && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      setPos({
        top: rect.bottom + 4,
        left: Math.max(8, rect.right - 176), // 176px = w-44
      });
    }
    setOpen(prev => !prev);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      const t = e.target as Node;
      if (btnRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    const dismiss = () => setOpen(false);
    document.addEventListener('mousedown', close);
    window.addEventListener('scroll', dismiss, true);
    window.addEventListener('resize', dismiss);
    return () => {
      document.removeEventListener('mousedown', close);
      window.removeEventListener('scroll', dismiss, true);
      window.removeEventListener('resize', dismiss);
    };
  }, [open]);

  return { open, setOpen, toggle, btnRef, menuRef, pos };
}

// ─── ActionDropdown component ───────────────────────────────────────────────
function ActionDropdown({ user, canModify, onView, onEdit, onSuspend, onActivate, onUnlock, onDelete, actionLoading }: {
  user: AdminUser;
  canModify: boolean;
  onView: () => void;
  onEdit: () => void;
  onSuspend: () => void;
  onActivate: () => void;
  onUnlock: () => void;
  onDelete: () => void;
  actionLoading: boolean;
}) {
  const { open, setOpen, toggle, btnRef, menuRef, pos } = usePortalDropdown();

  return (
    <>
      <button
        ref={btnRef}
        onClick={toggle}
        className="p-1.5 rounded-lg hover:bg-slate-800/80 transition-colors text-slate-400 hover:text-slate-200"
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {open && createPortal(
        <div
          ref={menuRef}
          className="fixed z-[9999] w-44 bg-slate-900/95 backdrop-blur-sm border border-white/10 rounded-xl shadow-xl py-1 animate-scale-in"
          style={{ top: pos.top, left: pos.left }}
        >
          <button onClick={() => { onView(); setOpen(false); }} className="w-full text-left flex items-center gap-2 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800/80 rounded-lg mx-1" style={{ width: 'calc(100% - 0.5rem)' }}>
            <Eye className="h-3.5 w-3.5" /> View Details
          </button>
          {canModify && (
            <>
              <button onClick={() => { onEdit(); setOpen(false); }} className="w-full text-left flex items-center gap-2 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800/80 rounded-lg mx-1" style={{ width: 'calc(100% - 0.5rem)' }}>
                <Edit className="h-3.5 w-3.5" /> Edit
              </button>
              {user.status === 'active' && (
                <button onClick={() => { onSuspend(); setOpen(false); }} disabled={actionLoading} className="w-full text-left flex items-center gap-2 px-3 py-2 text-sm text-rose-300 hover:bg-slate-800/80 rounded-lg mx-1 disabled:opacity-50" style={{ width: 'calc(100% - 0.5rem)' }}>
                  <UserX className="h-3.5 w-3.5" /> Suspend
                </button>
              )}
              {user.status === 'suspended' && (
                <button onClick={() => { onActivate(); setOpen(false); }} disabled={actionLoading} className="w-full text-left flex items-center gap-2 px-3 py-2 text-sm text-emerald-300 hover:bg-slate-800/80 rounded-lg mx-1 disabled:opacity-50" style={{ width: 'calc(100% - 0.5rem)' }}>
                  <UserCheck className="h-3.5 w-3.5" /> Activate
                </button>
              )}
              {user.status === 'locked' && (
                <button onClick={() => { onUnlock(); setOpen(false); }} disabled={actionLoading} className="w-full text-left flex items-center gap-2 px-3 py-2 text-sm text-amber-300 hover:bg-slate-800/80 rounded-lg mx-1 disabled:opacity-50" style={{ width: 'calc(100% - 0.5rem)' }}>
                  <Unlock className="h-3.5 w-3.5" /> Unlock
                </button>
              )}
              <div className="my-1 border-t border-white/10 mx-2" />
              <button onClick={() => { onDelete(); setOpen(false); }} className="w-full text-left flex items-center gap-2 px-3 py-2 text-sm text-rose-300 hover:bg-slate-800/80 rounded-lg mx-1" style={{ width: 'calc(100% - 0.5rem)' }}>
                <Trash2 className="h-3.5 w-3.5" /> Delete
              </button>
            </>
          )}
        </div>,
        document.body
      )}
    </>
  );
}

// ─── InviteActionDropdown ───────────────────────────────────────────────────
function InviteActionDropdown({ onResend, onRevoke }: {
  onResend: () => void;
  onRevoke: () => void;
}) {
  const { open, setOpen, toggle, btnRef, menuRef, pos } = usePortalDropdown();

  return (
    <>
      <button
        ref={btnRef}
        onClick={toggle}
        className="p-1.5 rounded-lg hover:bg-slate-800/80 transition-colors text-slate-400 hover:text-slate-200"
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {open && createPortal(
        <div
          ref={menuRef}
          className="fixed z-[9999] w-36 bg-slate-900/95 backdrop-blur-sm border border-white/10 rounded-xl shadow-xl py-1 animate-scale-in"
          style={{ top: pos.top, left: Math.max(8, pos.left + 32) }}
        >
          <button onClick={() => { onResend(); setOpen(false); }} className="w-full text-left flex items-center gap-2 px-3 py-2 text-sm text-cyan-300 hover:bg-slate-800/80 rounded-lg mx-1" style={{ width: 'calc(100% - 0.5rem)' }}>
            <RefreshCw className="h-3.5 w-3.5" /> Resend
          </button>
          <button onClick={() => { onRevoke(); setOpen(false); }} className="w-full text-left flex items-center gap-2 px-3 py-2 text-sm text-rose-300 hover:bg-slate-800/80 rounded-lg mx-1" style={{ width: 'calc(100% - 0.5rem)' }}>
            <X className="h-3.5 w-3.5" /> Revoke
          </button>
        </div>,
        document.body
      )}
    </>
  );
}

// ─── Main component ─────────────────────────────────────────────────────────
export default function AdminUserManagement() {
  const { organization, admin } = useAuth();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [roles, setRoles] = useState<AdminRole[]>([]);
  const [invites, setInvites] = useState<AdminUserInvite[]>([]);
  const [stats, setStats] = useState<AdminUserStats | null>(null);

  const [loading, setLoading] = useState(true);
  const [statsLoading, setStatsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  // Filters
  const [filters, setFilters] = useState<AdminUserFilters>({});
  const [showFilters, setShowFilters] = useState(false);
  const [search, setSearch] = useState('');

  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showUserModal, setShowUserModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  // Form data
  const [createFormData, setCreateFormData] = useState<AdminUserFormData>({
    email: '',
    first_name: '',
    last_name: '',
    role_id: '',
    phone_number: '',
    timezone: '',
    language: 'en',
    send_invite: true,
  });

  const [editFormData, setEditFormData] = useState<AdminUserUpdateData>({});
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);

  // ─── Data loading ───────────────────────────────────────────────────────
  const loadUsers = useCallback(async (page = 1, newFilters = filters) => {
    if (!organization?.id) return;
    setLoading(true);
    try {
      const params = {
        ...newFilters,
        page,
        per_page: ITEMS_PER_PAGE,
        search: search.trim() || undefined,
      };
      const response = await apiClient.getAdminUsers(organization.id, params);
      setUsers(response.users);
      setTotalPages(response.total_pages);
      setTotal(response.total);
      setCurrentPage(page);
    } catch (error) {
      console.error('Failed to load admin users:', error);
    } finally {
      setLoading(false);
    }
  }, [organization?.id, filters, search]);

  const loadRoles = useCallback(async () => {
    if (!organization?.id) return;
    try {
      const rolesData = await apiClient.getAdminRoles(organization.id);
      setRoles(rolesData);
    } catch (error) {
      console.error('Failed to load roles and permissions:', error);
    }
  }, [organization?.id]);

  const loadInvites = useCallback(async () => {
    if (!organization?.id) return;
    try {
      const invitesData = await apiClient.getAdminUserInvites(organization.id);
      setInvites(invitesData);
    } catch (error) {
      console.error('Failed to load admin invites:', error);
    }
  }, [organization?.id]);

  const loadStats = useCallback(async () => {
    if (!organization?.id) return;
    setStatsLoading(true);
    try {
      const statsData = await apiClient.getAdminUserStats(organization.id);
      setStats(statsData);
    } catch (error) {
      console.error('Failed to load admin user stats:', error);
    } finally {
      setStatsLoading(false);
    }
  }, [organization?.id]);

  useEffect(() => {
    loadUsers();
    loadRoles();
    loadInvites();
    loadStats();
  }, [loadUsers, loadRoles, loadInvites, loadStats]);

  // ─── Filter & search handlers ──────────────────────────────────────────
  const handleFilterChange = (key: keyof AdminUserFilters, value: string) => {
    const newFilters: AdminUserFilters = { ...filters };
    if (value) {
      switch (key) {
        case 'status':
          newFilters.status = value as AdminStatus;
          break;
        default:
          (newFilters as any)[key] = value;
      }
    } else {
      delete newFilters[key];
    }
    setFilters(newFilters);
    loadUsers(1, newFilters);
  };

  const handleSearch = () => loadUsers(1);

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([loadUsers(currentPage), loadRoles(), loadInvites(), loadStats()]);
    setRefreshing(false);
  };

  // ─── CRUD handlers ─────────────────────────────────────────────────────
  const handleCreateUser = async () => {
    if (!organization?.id) return;
    try {
      await apiClient.createAdminUser(organization.id, createFormData);
      setShowCreateModal(false);
      setCreateFormData({ email: '', first_name: '', last_name: '', role_id: '', phone_number: '', timezone: '', language: 'en', send_invite: true });
      await Promise.all([loadUsers(), loadInvites(), loadStats()]);
    } catch (error) {
      console.error('Failed to create admin user:', error);
    }
  };

  const handleUpdateUser = async () => {
    if (!organization?.id || !selectedUser?.id) return;
    try {
      await apiClient.updateAdminUser(organization.id, selectedUser.id, editFormData);
      setShowEditModal(false);
      setEditFormData({});
      setSelectedUser(null);
      await loadUsers();
    } catch (error) {
      console.error('Failed to update admin user:', error);
    }
  };

  const handleDeleteUser = async () => {
    if (!organization?.id || !selectedUser?.id) return;
    try {
      await apiClient.deleteAdminUser(organization.id, selectedUser.id);
      setShowDeleteModal(false);
      setSelectedUser(null);
      await Promise.all([loadUsers(), loadStats()]);
    } catch (error) {
      console.error('Failed to delete admin user:', error);
    }
  };

  const withActionLoading = async (userId: string, action: () => Promise<void>) => {
    setActionLoading(prev => ({ ...prev, [userId]: true }));
    try {
      await action();
    } finally {
      setActionLoading(prev => ({ ...prev, [userId]: false }));
    }
  };

  const handleSuspendUser = (user: AdminUser) =>
    withActionLoading(user.id, async () => {
      if (!organization?.id) return;
      await apiClient.suspendAdminUser(organization.id, user.id, 'Suspended by admin');
      await loadUsers();
    });

  const handleActivateUser = (user: AdminUser) =>
    withActionLoading(user.id, async () => {
      if (!organization?.id) return;
      await apiClient.activateAdminUser(organization.id, user.id);
      await loadUsers();
    });

  const handleUnlockUser = (user: AdminUser) =>
    withActionLoading(user.id, async () => {
      if (!organization?.id) return;
      await apiClient.unlockAdminUser(organization.id, user.id);
      await loadUsers();
    });

  const handleResendInvite = async (invite: AdminUserInvite) => {
    if (!organization?.id) return;
    try {
      await apiClient.resendAdminInvite(organization.id, invite.id);
      await loadInvites();
    } catch (error) {
      console.error('Failed to resend invite:', error);
    }
  };

  const handleRevokeInvite = async (invite: AdminUserInvite) => {
    if (!organization?.id) return;
    try {
      await apiClient.revokeAdminInvite(organization.id, invite.id);
      await loadInvites();
    } catch (error) {
      console.error('Failed to revoke invite:', error);
    }
  };

  // ─── Helpers ────────────────────────────────────────────────────────────
  const openViewModal = (user: AdminUser) => { setSelectedUser(user); setShowUserModal(true); };

  const openEditModal = (user: AdminUser) => {
    setSelectedUser(user);
    setEditFormData({
      first_name: user.first_name,
      last_name: user.last_name,
      role_id: user.role_id,
      phone_number: user.phone_number || '',
      timezone: user.timezone || '',
      language: user.language || 'en',
    });
    setShowEditModal(true);
  };

  const openDeleteModal = (user: AdminUser) => { setSelectedUser(user); setShowDeleteModal(true); };

  const formatTimestamp = (timestamp: string) => new Date(timestamp).toLocaleString();

  const getRelativeTime = (timestamp: string) => {
    const diff = Math.floor((Date.now() - new Date(timestamp).getTime()) / 1000);
    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  };

  const getInitials = (u: AdminUser) => `${u.first_name.charAt(0)}${u.last_name.charAt(0)}`;

  // ─── Loading skeleton ──────────────────────────────────────────────────
  if (loading && users.length === 0) {
    return (
      <div className="p-6 max-w-7xl mx-auto">
        <div className="animate-pulse space-y-6">
          {/* Header skeleton */}
          <div className="flex items-center justify-between">
            <div>
              <div className="h-5 bg-slate-700/50 rounded w-16 mb-2" />
              <div className="h-3 bg-slate-700/50 rounded w-48" />
            </div>
            <div className="h-9 bg-slate-700/50 rounded w-28" />
          </div>
          {/* Search skeleton */}
          <div className="h-10 bg-slate-700/50 rounded-xl" />
          {/* Table skeleton */}
          <div className={`${cardSurface} overflow-hidden`}>
            <div className="h-10 bg-slate-900/60 border-b border-white/10" />
            {[1, 2, 3, 4, 5, 6].map(i => (
              <div key={i} className="flex items-center gap-4 px-5 py-3.5 border-b border-white/5">
                <div className="h-8 w-8 rounded-full bg-slate-700/50 shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-slate-700/50 rounded w-32" />
                  <div className="h-3 bg-slate-700/50 rounded w-44" />
                </div>
                <div className="h-3 bg-slate-700/50 rounded w-16 hidden md:block" />
                <div className="h-5 bg-slate-700/50 rounded-full w-14" />
                <div className="h-3 bg-slate-700/50 rounded w-12 hidden md:block" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Pending invites that should appear in the grid
  const pendingInvites = invites.filter(i => i.status === 'pending');

  // ─── Render ─────────────────────────────────────────────────────────────
  return (
    <div className="p-6 space-y-4 max-w-7xl mx-auto">

      {/* ══════ INLINE HEADER ══════ */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-slate-100">Team</h1>
          {stats && !statsLoading && (
            <p className={`${monoXs} text-slate-500 mt-1`}>
              {stats.total_admins} members
              {stats.active_admins > 0 && <> · <span className="text-emerald-400">{stats.active_admins} active</span></>}
              {stats.pending_invites > 0 && <> · <span className="text-amber-400">{stats.pending_invites} pending</span></>}
              {stats.suspended_admins > 0 && <> · <span className="text-rose-400">{stats.suspended_admins} suspended</span></>}
            </p>
          )}
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="p-2 border border-white/10 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 disabled:opacity-50 transition-colors self-start"
          title="Refresh"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* ══════ SEARCH + FILTERS + ADD ══════ */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
          <input
            type="text"
            placeholder="Search by name, email, or role..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            className="form-input pl-10"
          />
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`btn ${showFilters ? 'bg-cyan-500/12 border-cyan-400/35 text-cyan-200' : 'btn-secondary'}`}
          >
            <Filter className="h-4 w-4" />
            Filters
            <ChevronDown className={`h-4 w-4 transition-transform ${showFilters ? 'rotate-180' : ''}`} />
          </button>
          <button onClick={() => setShowCreateModal(true)} className="btn btn-primary">
            <Plus className="h-4 w-4" />
            Add Member
          </button>
        </div>
      </div>

      {/* Advanced filters panel */}
      {showFilters && (
        <div className={`${cardSurface} p-4`}>
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
            <div>
              <label className="form-label">Role</label>
              <select value={filters.role_id || ''} onChange={(e) => handleFilterChange('role_id', e.target.value)} className="form-input">
                <option value="">All Roles</option>
                {roles.map(role => <option key={role.id} value={role.id}>{role.display_name}</option>)}
              </select>
            </div>
            <div>
              <label className="form-label">Status</label>
              <select value={filters.status || ''} onChange={(e) => handleFilterChange('status', e.target.value)} className="form-input">
                <option value="">All Statuses</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="pending">Pending</option>
                <option value="suspended">Suspended</option>
                <option value="locked">Locked</option>
              </select>
            </div>
            <div>
              <label className="form-label">Last Login From</label>
              <input type="datetime-local" value={filters.last_login_from || ''} onChange={(e) => handleFilterChange('last_login_from', e.target.value)} className="form-input" />
            </div>
            <div className="flex items-end">
              <button
                onClick={() => { setFilters({}); setSearch(''); loadUsers(1, {}); }}
                className="w-full btn btn-secondary"
              >
                Clear All
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Loading indicator */}
      {loading && users.length > 0 && (
        <div className="flex items-center gap-2 text-slate-500">
          <RefreshCw className="h-3.5 w-3.5 animate-spin" />
          <span className={monoXs}>Loading...</span>
        </div>
      )}

      {/* ══════ TABLE (members + invites) ══════ */}
      {(users.length > 0 || pendingInvites.length > 0) && (
        <div className={`${cardSurface} overflow-hidden`}>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-white/10">
              <thead className="bg-slate-900/60 backdrop-blur-sm">
                <tr>
                  <th className={tableHeaderClass}>Member</th>
                  <th className={tableHeaderClass}>Role</th>
                  <th className={tableHeaderClass}>Status</th>
                  <th className={`${tableHeaderClass} hidden md:table-cell`}>Last Login</th>
                  <th className={`${tableHeaderClass} w-12`}>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {/* ── Member rows ── */}
                {users.map(user => {
                  const accent = statusAccent[user.status] || statusAccent.inactive;
                  const canModify = admin?.id !== user.id;
                  return (
                    <tr key={user.id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 shrink-0 rounded-full bg-cyan-500/15 border border-cyan-400/30 flex items-center justify-center">
                            <span className="text-cyan-300 font-medium text-xs font-mono">{getInitials(user)}</span>
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-slate-100 truncate">{user.first_name} {user.last_name}</p>
                            <p className={`${monoXs} text-slate-500 truncate`}>{user.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3.5">
                        <span className={`${monoXs} text-slate-300`}>{user.role.display_name}</span>
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2">
                          <span className={`${statusPill} ${accent.pill}`}>{user.status}</span>
                          {user.two_factor_enabled && (
                            <span className="font-mono text-[0.65rem] px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">2FA</span>
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-3.5 hidden md:table-cell">
                        <span className={`${monoXs} text-slate-500`}>
                          {user.last_login_at ? getRelativeTime(user.last_login_at) : 'Never'}
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
                        <ActionDropdown
                          user={user}
                          canModify={canModify}
                          onView={() => openViewModal(user)}
                          onEdit={() => openEditModal(user)}
                          onSuspend={() => handleSuspendUser(user)}
                          onActivate={() => handleActivateUser(user)}
                          onUnlock={() => handleUnlockUser(user)}
                          onDelete={() => openDeleteModal(user)}
                          actionLoading={!!actionLoading[user.id]}
                        />
                      </td>
                    </tr>
                  );
                })}

                {/* ── Invite rows (amber) ── */}
                {pendingInvites.map(invite => (
                  <tr key={`invite-${invite.id}`} className="hover:bg-slate-800/40 transition-colors bg-amber-500/[0.03]">
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 shrink-0 rounded-full bg-amber-500/15 border border-amber-400/30 flex items-center justify-center">
                          <UserPlus className="h-3.5 w-3.5 text-amber-300" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-100 truncate">{invite.email}</p>
                          <p className={`${monoXs} text-slate-500`}>Invited by {invite.invited_by_name}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className={`${monoXs} text-slate-300`}>{invite.role?.display_name ?? 'Unknown'}</span>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className={`${statusPill} bg-amber-500/15 text-amber-300 border-amber-500/30`}>Invited</span>
                    </td>
                    <td className="px-5 py-3.5 hidden md:table-cell">
                      <span className={`${monoXs} text-slate-500`}>Expires {formatTimestamp(invite.expires_at)}</span>
                    </td>
                    <td className="px-5 py-3.5">
                      <InviteActionDropdown
                        onResend={() => handleResendInvite(invite)}
                        onRevoke={() => handleRevokeInvite(invite)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ══════ Empty state ══════ */}
      {users.length === 0 && pendingInvites.length === 0 && !loading && (
        <div className="text-center py-16">
          <Users className="mx-auto h-10 w-10 text-slate-600" />
          <p className={`${sectionLabel} mt-4`}>No Members Found</p>
          <p className="text-sm text-slate-500 mt-2 max-w-sm mx-auto">
            {Object.keys(filters).length > 0 || search
              ? 'Try adjusting your search criteria or filters.'
              : 'Get started by adding your first team member.'}
          </p>
          {!Object.keys(filters).length && !search && (
            <button onClick={() => setShowCreateModal(true)} className="btn btn-primary mt-6">
              <UserPlus className="h-4 w-4" />
              Add Member
            </button>
          )}
        </div>
      )}

      {/* ══════ Pagination ══════ */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <p className={`${monoXs} text-slate-500`}>
            {((currentPage - 1) * ITEMS_PER_PAGE) + 1}–{Math.min(currentPage * ITEMS_PER_PAGE, total)} of {total.toLocaleString()}
          </p>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => loadUsers(currentPage - 1)}
              disabled={currentPage === 1 || loading}
              className="p-1.5 border border-white/10 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            {[...Array(Math.min(5, totalPages))].map((_, i) => {
              const page = Math.max(1, Math.min(totalPages - 4, currentPage - 2)) + i;
              return (
                <button
                  key={page}
                  onClick={() => loadUsers(page)}
                  disabled={loading}
                  className={`h-8 w-8 rounded-lg text-sm font-mono transition-colors ${
                    page === currentPage
                      ? 'bg-cyan-500/20 border border-cyan-400/40 text-cyan-200'
                      : 'text-slate-400 border border-white/10 hover:bg-slate-800/60 hover:text-slate-200'
                  } disabled:opacity-40`}
                >
                  {page}
                </button>
              );
            })}
            <button
              onClick={() => loadUsers(currentPage + 1)}
              disabled={currentPage === totalPages || loading}
              className="p-1.5 border border-white/10 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          MODALS
         ══════════════════════════════════════════════════════════════════ */}

      {/* ── Create User Modal ── */}
      <Modal isOpen={showCreateModal} onClose={() => setShowCreateModal(false)} title="Add Team Member" size="md">
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="form-label">First Name</label>
              <input type="text" placeholder="Jane" value={createFormData.first_name} onChange={(e) => setCreateFormData({ ...createFormData, first_name: e.target.value })} className="form-input" />
            </div>
            <div>
              <label className="form-label">Last Name</label>
              <input type="text" placeholder="Smith" value={createFormData.last_name} onChange={(e) => setCreateFormData({ ...createFormData, last_name: e.target.value })} className="form-input" />
            </div>
          </div>
          <div>
            <label className="form-label">Email</label>
            <input type="email" placeholder="jane@company.com" value={createFormData.email} onChange={(e) => setCreateFormData({ ...createFormData, email: e.target.value })} className="form-input" />
          </div>
          <div>
            <label className="form-label">Role</label>
            <select value={createFormData.role_id} onChange={(e) => setCreateFormData({ ...createFormData, role_id: e.target.value })} className="form-input">
              <option value="">Select Role</option>
              {roles.map(role => <option key={role.id} value={role.id}>{role.display_name}</option>)}
            </select>
          </div>
          <div>
            <label className="form-label">Phone Number (Optional)</label>
            <input type="tel" value={createFormData.phone_number || ''} onChange={(e) => setCreateFormData({ ...createFormData, phone_number: e.target.value })} className="form-input" />
          </div>
          <label className="flex items-center gap-2 rounded-lg border border-white/10 bg-slate-800/70 px-3 py-2.5 text-sm text-slate-300 cursor-pointer">
            <input type="checkbox" checked={createFormData.send_invite} onChange={(e) => setCreateFormData({ ...createFormData, send_invite: e.target.checked })} className="h-4 w-4 rounded border-white/20 bg-slate-900 text-cyan-400" />
            Send invitation email immediately
          </label>
          <div className="flex justify-end gap-3 pt-2">
            <button onClick={() => setShowCreateModal(false)} className="btn btn-secondary">Cancel</button>
            <button onClick={handleCreateUser} disabled={!createFormData.email || !createFormData.first_name || !createFormData.last_name || !createFormData.role_id} className="btn btn-primary">
              Add Member
            </button>
          </div>
        </div>
      </Modal>

      {/* ── View Details Modal ── */}
      <Modal isOpen={showUserModal} onClose={() => { setShowUserModal(false); setSelectedUser(null); }} title="View Details" size="lg">
        {selectedUser && (() => {
          const u = selectedUser;
          const accent = statusAccent[u.status] || statusAccent.inactive;
          return (
            <div className="space-y-5">
              {/* Profile header */}
              <div className={`${cardSurface} p-4 flex items-center gap-4`}>
                <div className="h-12 w-12 shrink-0 rounded-full bg-cyan-500/15 border border-cyan-400/30 flex items-center justify-center">
                  <span className="text-cyan-300 font-semibold text-sm font-mono">{getInitials(u)}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-lg font-semibold text-slate-100">{u.first_name} {u.last_name}</p>
                  <p className={`${monoSm} text-slate-500`}>{u.email}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`${statusPill} ${accent.pill}`}>{u.status}</span>
                  {u.two_factor_enabled && (
                    <span className="font-mono text-[0.65rem] px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">2FA</span>
                  )}
                </div>
              </div>

              {/* Profile info */}
              <div>
                <p className={`${sectionLabel} mb-2`}>Profile</p>
                <div className="bg-slate-800/50 rounded-lg p-4 space-y-3">
                  {([
                    ['Role', u.role.display_name],
                    ['Phone', u.phone_number || '—'],
                    ['Timezone', u.timezone || '—'],
                    ['Language', u.language || 'en'],
                  ] as const).map(([label, value]) => (
                    <div key={label} className="flex items-center justify-between">
                      <span className="text-sm text-slate-500">{label}</span>
                      <span className={`${monoSm} text-slate-200`}>{value}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Security */}
              <div>
                <p className={`${sectionLabel} mb-2`}>Security</p>
                <div className="bg-slate-800/50 rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-500">Two-Factor</span>
                    <span className={`${monoSm} ${u.two_factor_enabled ? 'text-emerald-300' : 'text-slate-500'}`}>
                      {u.two_factor_enabled ? 'Enabled' : 'Disabled'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-500">Failed Logins</span>
                    <span className={`${monoSm} text-slate-200`}>{u.failed_login_attempts}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-500">Email Verified</span>
                    <span className={`${monoSm} ${u.email_verified ? 'text-emerald-300' : 'text-amber-300'}`}>
                      {u.email_verified ? 'Yes' : 'No'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Activity */}
              <div>
                <p className={`${sectionLabel} mb-2`}>Activity</p>
                <div className="bg-slate-800/50 rounded-lg p-4 space-y-3">
                  {([
                    ['Last Login', u.last_login_at ? formatTimestamp(u.last_login_at) : 'Never'],
                    ['IP Address', u.last_ip_address || '—'],
                    ['Created', formatTimestamp(u.created_at)],
                    ['Updated', formatTimestamp(u.updated_at)],
                  ] as const).map(([label, value]) => (
                    <div key={label} className="flex items-center justify-between">
                      <span className="text-sm text-slate-500">{label}</span>
                      <span className={`${monoSm} text-slate-200`}>{value}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Permissions */}
              {u.role.permissions && u.role.permissions.length > 0 && (
                <div>
                  <p className={`${sectionLabel} mb-2`}>Permissions</p>
                  <div className="flex flex-wrap gap-2">
                    {u.role.permissions.map(perm => (
                      <span key={perm.id} className="font-mono text-[0.65rem] px-2 py-1 rounded-lg bg-cyan-500/10 border border-cyan-400/20 text-cyan-300">
                        {perm.display_name}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Footer buttons */}
              <div className="flex justify-end gap-3 pt-2">
                {admin?.id !== u.id && (
                  <button
                    onClick={() => { setShowUserModal(false); openEditModal(u); }}
                    className="btn btn-primary"
                  >
                    Edit User
                  </button>
                )}
                <button onClick={() => { setShowUserModal(false); setSelectedUser(null); }} className="btn btn-secondary">
                  Close
                </button>
              </div>
            </div>
          );
        })()}
      </Modal>

      {/* ── Edit User Modal ── */}
      <Modal isOpen={showEditModal} onClose={() => { setShowEditModal(false); setSelectedUser(null); }} title="Edit Team Member" size="md">
        {selectedUser && (
          <div className="space-y-4">
            {/* Identity header */}
            <div className="flex items-center gap-3 pb-3 border-b border-white/10">
              <div className="h-9 w-9 shrink-0 rounded-full bg-cyan-500/15 border border-cyan-400/30 flex items-center justify-center">
                <span className="text-cyan-300 font-medium text-xs font-mono">{getInitials(selectedUser)}</span>
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-100">{selectedUser.first_name} {selectedUser.last_name}</p>
                <p className={`${monoXs} text-slate-500`}>{selectedUser.email}</p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="form-label">First Name</label>
                <input type="text" value={editFormData.first_name || ''} onChange={(e) => setEditFormData({ ...editFormData, first_name: e.target.value })} className="form-input" />
              </div>
              <div>
                <label className="form-label">Last Name</label>
                <input type="text" value={editFormData.last_name || ''} onChange={(e) => setEditFormData({ ...editFormData, last_name: e.target.value })} className="form-input" />
              </div>
            </div>
            <div>
              <label className="form-label">Role</label>
              <select value={editFormData.role_id || ''} onChange={(e) => setEditFormData({ ...editFormData, role_id: e.target.value })} className="form-input">
                <option value="">Select Role</option>
                {roles.map(role => <option key={role.id} value={role.id}>{role.display_name}</option>)}
              </select>
            </div>
            <div>
              <label className="form-label">Phone (Optional)</label>
              <input type="tel" value={editFormData.phone_number || ''} onChange={(e) => setEditFormData({ ...editFormData, phone_number: e.target.value })} className="form-input" />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="form-label">Timezone</label>
                <input type="text" value={editFormData.timezone || ''} onChange={(e) => setEditFormData({ ...editFormData, timezone: e.target.value })} className="form-input" placeholder="e.g. America/New_York" />
              </div>
              <div>
                <label className="form-label">Language</label>
                <select value={editFormData.language || 'en'} onChange={(e) => setEditFormData({ ...editFormData, language: e.target.value })} className="form-input">
                  <option value="en">English</option>
                  <option value="es">Spanish</option>
                  <option value="fr">French</option>
                  <option value="de">German</option>
                  <option value="pt">Portuguese</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => { setShowEditModal(false); setSelectedUser(null); }} className="btn btn-secondary">Cancel</button>
              <button onClick={handleUpdateUser} className="btn btn-primary">Save Changes</button>
            </div>
          </div>
        )}
      </Modal>

      {/* ── Delete Confirmation Modal ── */}
      <ConfirmationModal
        isOpen={showDeleteModal}
        onClose={() => { setShowDeleteModal(false); setSelectedUser(null); }}
        onConfirm={handleDeleteUser}
        title="Delete Team Member"
        message={selectedUser ? `Are you sure you want to remove ${selectedUser.first_name} ${selectedUser.last_name} (${selectedUser.email}) from the team? This action cannot be undone.` : ''}
        confirmText="Delete Member"
        cancelText="Cancel"
        confirmVariant="danger"
      />
    </div>
  );
}
