import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { Admin, AdminPermissions } from '../../types.js';
import { sectionLabel, monoXs, monoSm, cardSurface, statusPill, tableHeaderClass, infoPanel, getStatusAccent } from '../../styles/tokens';
import Modal from '../ui/Modal';
import { UserPlus, MoreVertical, Edit, Trash2, Shield, Eye, EyeOff } from 'lucide-react';

/** Role → accent mapping (matches statusAccent convention) */
const roleAccent: Record<string, { pill: string }> = {
  owner:    { pill: 'bg-purple-500/15 text-purple-300 border-purple-500/30' },
  admin:    { pill: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30' },
  operator: { pill: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' },
  viewer:   { pill: 'bg-slate-500/15 text-slate-300 border-slate-500/30' },
};

function getRoleAccent(role: string) {
  return roleAccent[role?.toLowerCase()] || roleAccent.viewer;
}

interface AdminManagementProps {
  organizationId: string;
  canManageAdmins: boolean;
}

export default function AdminManagement({ organizationId, canManageAdmins }: AdminManagementProps) {
  const { admin: currentAdmin } = useAuth();
  const [admins, setAdmins] = useState<Admin[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showInviteForm, setShowInviteForm] = useState(false);

  useEffect(() => {
    loadAdmins();
  }, [organizationId]);

  const loadAdmins = async () => {
    try {
      setIsLoading(true);
      // TODO: Implement API call to fetch organization admins
      // const response = await apiClient.getOrganizationAdmins(organizationId);
      // setAdmins(response);

      // Mock data for now
      const mockAdmins: Admin[] = [
        {
          id: '1',
          organization_id: organizationId,
          email: 'admin@example.com',
          first_name: 'John',
          last_name: 'Doe',
          role: 'owner',
          permissions: {
            manage_organization: true,
            manage_admins: true,
            manage_billing: true,
            view_users: true,
            manage_users: true,
            export_users: true,
            view_verifications: true,
            review_verifications: true,
            approve_verifications: true,
            manage_settings: true,
            manage_webhooks: true,
            manage_integrations: true,
            view_analytics: true,
            export_analytics: true,
          },
          status: 'active',
          email_verified: true,
          email_verified_at: '2024-01-01T00:00:00Z',
          last_login_at: '2024-01-15T10:30:00Z',
          login_count: 25,
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-15T10:30:00Z',
        }
      ];
      setAdmins(mockAdmins);
    } catch (error) {
      console.error('Failed to load admins:', error);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className={`${cardSurface} p-6`}>
        <div className="animate-pulse">
          <div className="h-4 bg-slate-700/50 rounded w-1/4 mb-4"></div>
          <div className="space-y-3">
            <div className="h-4 bg-slate-700/50 rounded"></div>
            <div className="h-4 bg-slate-700/50 rounded w-5/6"></div>
            <div className="h-4 bg-slate-700/50 rounded w-4/6"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={cardSurface}>
      <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
        <p className={sectionLabel}>Admin Users</p>
        {canManageAdmins && (
          <button
            onClick={() => setShowInviteForm(true)}
            className="inline-flex items-center px-3 py-2 bg-cyan-500/20 border border-cyan-400/40 text-cyan-200 hover:bg-cyan-500/30 font-mono text-sm rounded-lg transition-colors"
          >
            <UserPlus className="h-4 w-4 mr-1" />
            Invite Admin
          </button>
        )}
      </div>

      <div className="overflow-hidden">
        <table className="min-w-full divide-y divide-white/10">
          <thead className="bg-slate-900/40">
            <tr>
              <th className={tableHeaderClass}>Admin</th>
              <th className={tableHeaderClass}>Role</th>
              <th className={tableHeaderClass}>Status</th>
              <th className={tableHeaderClass}>Last Login</th>
              <th className={tableHeaderClass}>Permissions</th>
              {canManageAdmins && (
                <th className={`${tableHeaderClass} text-right`}>Actions</th>
              )}
            </tr>
          </thead>
          <tbody className="bg-slate-900/40 divide-y divide-white/10">
            {admins.map((admin) => (
              <AdminRow
                key={admin.id}
                admin={admin}
                currentAdminId={currentAdmin?.id || ''}
                canManage={canManageAdmins}
                onEdit={(admin) => {/* TODO: Implement edit functionality */}}
                onDelete={(adminId) => {/* TODO: Implement delete functionality */}}
              />
            ))}
          </tbody>
        </table>
      </div>

      <InviteAdminModal
        isOpen={showInviteForm}
        onClose={() => setShowInviteForm(false)}
        onInvite={(inviteData) => {
          // TODO: Implement invite functionality
          console.log('Inviting admin:', inviteData);
          setShowInviteForm(false);
        }}
      />
    </div>
  );
}

interface AdminRowProps {
  admin: Admin;
  currentAdminId: string;
  canManage: boolean;
  onEdit: (admin: Admin) => void;
  onDelete: (adminId: string) => void;
}

function AdminRow({ admin, currentAdminId, canManage, onEdit, onDelete }: AdminRowProps) {
  const [showDropdown, setShowDropdown] = useState(false);
  const [showPermissions, setShowPermissions] = useState(false);

  const countPermissions = (permissions: AdminPermissions) => {
    return Object.values(permissions).filter(Boolean).length;
  };

  return (
    <tr className="hover:bg-slate-800/40 transition-colors">
      <td className="px-5 py-4 whitespace-nowrap">
        <div className="flex items-center">
          <div className="flex-shrink-0 h-10 w-10">
            <div className="h-10 w-10 rounded-full bg-slate-700/50 flex items-center justify-center">
              <span className={`${monoXs} font-medium text-slate-300`}>
                {admin.first_name?.[0]}{admin.last_name?.[0]}
              </span>
            </div>
          </div>
          <div className="ml-4">
            <div className="text-sm font-medium text-slate-100">
              {admin.first_name} {admin.last_name}
              {admin.id === currentAdminId && (
                <span className={`ml-2 ${monoXs} text-slate-500`}>(You)</span>
              )}
            </div>
            <div className={`${monoSm} text-slate-500`}>{admin.email}</div>
            {!admin.email_verified && (
              <div className={`${monoXs} text-rose-400`}>Email not verified</div>
            )}
          </div>
        </div>
      </td>
      <td className="px-5 py-4 whitespace-nowrap">
        <span className={`${statusPill} ${getRoleAccent(admin.role).pill} capitalize`}>
          {admin.role}
        </span>
      </td>
      <td className="px-5 py-4 whitespace-nowrap">
        <span className={`${statusPill} ${getStatusAccent(admin.status).pill} capitalize`}>
          {admin.status}
        </span>
      </td>
      <td className="px-5 py-4 whitespace-nowrap">
        {admin.last_login_at ? (
          <div>
            <div className={`${monoXs} text-slate-100`}>
              {new Date(admin.last_login_at).toLocaleDateString()}
            </div>
            <div className={`${monoXs} text-slate-500`}>
              {admin.login_count} login{admin.login_count !== 1 ? 's' : ''}
            </div>
          </div>
        ) : (
          <span className={`${monoXs} text-slate-500`}>Never</span>
        )}
      </td>
      <td className="px-5 py-4 whitespace-nowrap">
        <button
          onClick={() => setShowPermissions(!showPermissions)}
          className={`inline-flex items-center ${monoXs} text-cyan-400 hover:text-cyan-300 transition-colors`}
        >
          {showPermissions ? (
            <EyeOff className="h-4 w-4 mr-1" />
          ) : (
            <Eye className="h-4 w-4 mr-1" />
          )}
          {countPermissions(admin.permissions)} permissions
        </button>
      </td>
      {canManage && (
        <td className="px-5 py-4 whitespace-nowrap text-right text-sm font-medium">
          <div className="relative">
            <button
              onClick={() => setShowDropdown(!showDropdown)}
              className="text-slate-500 hover:text-slate-400 transition-colors"
              disabled={admin.role === 'owner' && admin.id === currentAdminId}
            >
              <MoreVertical className="h-4 w-4" />
            </button>
            {showDropdown && (
              <div className={`origin-top-right absolute right-0 mt-2 w-48 rounded-lg ${cardSurface} shadow-xl z-10`}>
                <div className="py-1">
                  <button
                    onClick={() => {
                      onEdit(admin);
                      setShowDropdown(false);
                    }}
                    className="flex items-center px-4 py-2 text-sm text-slate-300 hover:bg-slate-800/40 transition-colors w-full text-left font-mono"
                  >
                    <Edit className="h-4 w-4 mr-2" />
                    Edit Admin
                  </button>
                  {admin.id !== currentAdminId && admin.role !== 'owner' && (
                    <button
                      onClick={() => {
                        onDelete(admin.id);
                        setShowDropdown(false);
                      }}
                      className="flex items-center px-4 py-2 text-sm text-rose-400 hover:bg-rose-500/10 transition-colors w-full text-left font-mono"
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Remove Admin
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </td>
      )}
    </tr>
  );
}

interface InviteAdminModalProps {
  isOpen: boolean;
  onClose: () => void;
  onInvite: (inviteData: { email: string; role: Admin['role']; permissions: Partial<AdminPermissions> }) => void;
}

function InviteAdminModal({ isOpen, onClose, onInvite }: InviteAdminModalProps) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Admin['role']>('viewer');
  const [permissions, setPermissions] = useState<Partial<AdminPermissions>>({});

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onInvite({ email, role, permissions });
  };

  const getDefaultPermissions = (role: Admin['role']): AdminPermissions => {
    switch (role) {
      case 'owner':
        return {
          manage_organization: true,
          manage_admins: true,
          manage_billing: true,
          view_users: true,
          manage_users: true,
          export_users: true,
          view_verifications: true,
          review_verifications: true,
          approve_verifications: true,
          manage_settings: true,
          manage_webhooks: true,
          manage_integrations: true,
          view_analytics: true,
          export_analytics: true,
        };
      case 'admin':
        return {
          manage_organization: true,
          manage_admins: false,
          manage_billing: false,
          view_users: true,
          manage_users: true,
          export_users: true,
          view_verifications: true,
          review_verifications: true,
          approve_verifications: true,
          manage_settings: true,
          manage_webhooks: true,
          manage_integrations: true,
          view_analytics: true,
          export_analytics: true,
        };
      case 'operator':
        return {
          manage_organization: false,
          manage_admins: false,
          manage_billing: false,
          view_users: true,
          manage_users: false,
          export_users: false,
          view_verifications: true,
          review_verifications: true,
          approve_verifications: false,
          manage_settings: false,
          manage_webhooks: false,
          manage_integrations: false,
          view_analytics: true,
          export_analytics: false,
        };
      case 'viewer':
        return {
          manage_organization: false,
          manage_admins: false,
          manage_billing: false,
          view_users: true,
          manage_users: false,
          export_users: false,
          view_verifications: true,
          review_verifications: false,
          approve_verifications: false,
          manage_settings: false,
          manage_webhooks: false,
          manage_integrations: false,
          view_analytics: true,
          export_analytics: false,
        };
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Invite Admin" size="md">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <p className={sectionLabel}>Email Address</p>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={`w-full mt-2 px-3 py-2 border border-white/10 rounded-lg bg-slate-800/50 text-slate-100 ${monoSm} focus:outline-none focus:ring-1 focus:ring-cyan-500 focus:border-cyan-500 transition-colors`}
            required
          />
        </div>

        <div>
          <p className={sectionLabel}>Role</p>
          <div className={`${infoPanel} mt-2`}>
            <select
              value={role}
              onChange={(e) => {
                const newRole = e.target.value as Admin['role'];
                setRole(newRole);
                setPermissions(getDefaultPermissions(newRole));
              }}
              className={`w-full px-3 py-2 border border-white/10 rounded-lg bg-slate-800/50 text-slate-100 ${monoSm} focus:outline-none focus:ring-1 focus:ring-cyan-500 focus:border-cyan-500 transition-colors`}
            >
              <option value="viewer">Viewer</option>
              <option value="operator">Operator</option>
              <option value="admin">Admin</option>
            </select>
          </div>
        </div>

        <div className="flex justify-end space-x-3 pt-4">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 border border-white/10 rounded-lg font-mono text-sm text-slate-300 hover:bg-slate-800/40 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="px-4 py-2 bg-cyan-500/20 border border-cyan-400/40 text-cyan-200 hover:bg-cyan-500/30 font-mono text-sm rounded-lg transition-colors"
          >
            <Shield className="h-4 w-4 inline mr-1" />
            Send Invitation
          </button>
        </div>
      </form>
    </Modal>
  );
}
