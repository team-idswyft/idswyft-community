import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { Admin, AdminPermissions } from '../../types.js';
import { Users, UserPlus, MoreVertical, Edit, Trash2, Shield, Eye, EyeOff } from 'lucide-react';

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

  const getRoleBadgeColor = (role: Admin['role']) => {
    switch (role) {
      case 'owner': return 'bg-purple-100 text-purple-800';
      case 'admin': return 'bg-blue-100 text-blue-800';
      case 'operator': return 'bg-green-100 text-green-800';
      case 'viewer': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusBadgeColor = (status: Admin['status']) => {
    switch (status) {
      case 'active': return 'bg-green-100 text-green-800';
      case 'inactive': return 'bg-gray-100 text-gray-800';
      case 'pending': return 'bg-yellow-100 text-yellow-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  if (isLoading) {
    return (
      <div className="bg-white shadow rounded-lg p-6">
        <div className="animate-pulse">
          <div className="h-4 bg-gray-300 rounded w-1/4 mb-4"></div>
          <div className="space-y-3">
            <div className="h-4 bg-gray-300 rounded"></div>
            <div className="h-4 bg-gray-300 rounded w-5/6"></div>
            <div className="h-4 bg-gray-300 rounded w-4/6"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white shadow rounded-lg">
      <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
        <div className="flex items-center">
          <Users className="h-5 w-5 text-gray-400 mr-2" />
          <h3 className="text-lg font-medium text-gray-900">Admin Users</h3>
        </div>
        {canManageAdmins && (
          <button
            onClick={() => setShowInviteForm(true)}
            className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            <UserPlus className="h-4 w-4 mr-1" />
            Invite Admin
          </button>
        )}
      </div>
      
      <div className="overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Admin
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Role
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Last Login
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Permissions
              </th>
              {canManageAdmins && (
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              )}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
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

      {showInviteForm && (
        <InviteAdminModal
          onClose={() => setShowInviteForm(false)}
          onInvite={(inviteData) => {
            // TODO: Implement invite functionality
            console.log('Inviting admin:', inviteData);
            setShowInviteForm(false);
          }}
        />
      )}
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

  const getRoleBadgeColor = (role: Admin['role']) => {
    switch (role) {
      case 'owner': return 'bg-purple-100 text-purple-800';
      case 'admin': return 'bg-blue-100 text-blue-800';
      case 'operator': return 'bg-green-100 text-green-800';
      case 'viewer': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusBadgeColor = (status: Admin['status']) => {
    switch (status) {
      case 'active': return 'bg-green-100 text-green-800';
      case 'inactive': return 'bg-gray-100 text-gray-800';
      case 'pending': return 'bg-yellow-100 text-yellow-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const countPermissions = (permissions: AdminPermissions) => {
    return Object.values(permissions).filter(Boolean).length;
  };

  return (
    <tr>
      <td className="px-6 py-4 whitespace-nowrap">
        <div className="flex items-center">
          <div className="flex-shrink-0 h-10 w-10">
            <div className="h-10 w-10 rounded-full bg-gray-300 flex items-center justify-center">
              <span className="text-sm font-medium text-gray-700">
                {admin.first_name?.[0]}{admin.last_name?.[0]}
              </span>
            </div>
          </div>
          <div className="ml-4">
            <div className="text-sm font-medium text-gray-900">
              {admin.first_name} {admin.last_name}
              {admin.id === currentAdminId && (
                <span className="ml-2 text-xs text-gray-500">(You)</span>
              )}
            </div>
            <div className="text-sm text-gray-500">{admin.email}</div>
            {!admin.email_verified && (
              <div className="text-xs text-red-500">Email not verified</div>
            )}
          </div>
        </div>
      </td>
      <td className="px-6 py-4 whitespace-nowrap">
        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${getRoleBadgeColor(admin.role)}`}>
          {admin.role}
        </span>
      </td>
      <td className="px-6 py-4 whitespace-nowrap">
        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${getStatusBadgeColor(admin.status)}`}>
          {admin.status}
        </span>
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
        {admin.last_login_at ? (
          <div>
            <div>{new Date(admin.last_login_at).toLocaleDateString()}</div>
            <div className="text-xs text-gray-500">
              {admin.login_count} login{admin.login_count !== 1 ? 's' : ''}
            </div>
          </div>
        ) : (
          <span className="text-gray-500">Never</span>
        )}
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
        <button
          onClick={() => setShowPermissions(!showPermissions)}
          className="inline-flex items-center text-blue-600 hover:text-blue-800"
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
        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
          <div className="relative">
            <button
              onClick={() => setShowDropdown(!showDropdown)}
              className="text-gray-400 hover:text-gray-600"
              disabled={admin.role === 'owner' && admin.id === currentAdminId}
            >
              <MoreVertical className="h-4 w-4" />
            </button>
            {showDropdown && (
              <div className="origin-top-right absolute right-0 mt-2 w-48 rounded-md shadow-lg bg-white ring-1 ring-black ring-opacity-5 z-10">
                <div className="py-1">
                  <button
                    onClick={() => {
                      onEdit(admin);
                      setShowDropdown(false);
                    }}
                    className="flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 w-full text-left"
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
                      className="flex items-center px-4 py-2 text-sm text-red-700 hover:bg-red-50 w-full text-left"
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
  onClose: () => void;
  onInvite: (inviteData: { email: string; role: Admin['role']; permissions: Partial<AdminPermissions> }) => void;
}

function InviteAdminModal({ onClose, onInvite }: InviteAdminModalProps) {
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
    <div className="fixed inset-0 z-[120] overflow-y-auto h-full w-full bg-slate-950/70 backdrop-blur-sm">
      <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
        <div className="mt-3">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-medium text-gray-900">Invite Admin</h3>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
            >
              ×
            </button>
          </div>
          
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Email Address
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                required
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Role
              </label>
              <select
                value={role}
                onChange={(e) => {
                  const newRole = e.target.value as Admin['role'];
                  setRole(newRole);
                  setPermissions(getDefaultPermissions(newRole));
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="viewer">Viewer</option>
                <option value="operator">Operator</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            
            <div className="flex justify-end space-x-3 pt-4">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                <Shield className="h-4 w-4 inline mr-1" />
                Send Invitation
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
