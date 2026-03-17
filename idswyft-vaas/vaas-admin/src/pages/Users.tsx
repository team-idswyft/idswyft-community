import React, { useState, useEffect } from 'react';
import {
  Search,
  Filter,
  Download,
  Plus,
  Eye,
  Edit2,
  Trash2,
  Send
} from 'lucide-react';
import { apiClient } from '../services/api';
import { showToast } from '../lib/toast';
import type { EndUser } from '../types.js';
import { sectionLabel, statNumber, monoXs, monoSm, cardSurface, statusPill, tableHeaderClass, infoPanel, getStatusAccent } from '../styles/tokens';
import Modal from '../components/ui/Modal';

// Type alias for EndUser verification status
type VerificationStatus = EndUser['verification_status'];

interface UserFilters {
  status: VerificationStatus | 'all';
  search: string;
  tags: string[];
}

interface UserFormData {
  email: string;
  phone: string;
  first_name: string;
  last_name: string;
  external_id: string;
  tags: string[];
  metadata: Record<string, string>;
}

export default function Users() {
  const [users, setUsers] = useState<EndUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<UserFilters>({
    status: 'all',
    search: '',
    tags: []
  });
  const [selectedUser, setSelectedUser] = useState<EndUser | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showEditForm, setShowEditForm] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [showInvitationModal, setShowInvitationModal] = useState(false);
  const [sendingInvitation, setSendingInvitation] = useState(false);

  useEffect(() => {
    loadUsers();
  }, [currentPage, filters]);

  const loadUsers = async () => {
    try {
      setLoading(true);
      setError(null);
      const params: any = {
        page: currentPage,
        per_page: 20
      };

      if (filters.status !== 'all') {
        params.status = filters.status;
      }
      if (filters.search) {
        params.search = filters.search;
      }
      if (filters.tags.length > 0) {
        params.tags = filters.tags;
      }

      const result = await apiClient.listEndUsers(params);
      setUsers(result.users || []);

      // Handle pagination meta safely
      const totalPages = result.meta?.pagination?.total_pages ||
                        result.meta?.pages ||
                        Math.ceil((result.meta?.total || 0) / 20) || 1;
      setTotalPages(totalPages);
    } catch (err: unknown) {
      console.error('Failed to load users:', err);
      setError(err instanceof Error ? err.message : 'Failed to load users');
      setUsers([]);
      setTotalPages(1);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteUser = async (userId: string) => {
    try {
      await apiClient.deleteEndUser(userId);
      setUsers(prev => prev.filter(user => user.id !== userId));
      setDeleteConfirm(null);
    } catch (err: unknown) {
      showToast.error('Failed to delete user');
    }
  };

  const handleSendVerificationInvitation = async (customMessage?: string) => {
    if (!selectedUser) return;

    try {
      setSendingInvitation(true);

      console.log('Sending verification invitation for user:', selectedUser.id);
      const updatedUser = await apiClient.sendVerificationInvitation(selectedUser.id, {
        custom_message: customMessage,
        expiration_days: 7
      });

      // Update the user in the list
      setUsers(prev => prev.map(user =>
        user.id === updatedUser.id ? updatedUser : user
      ));

      showToast.success(`Verification invitation sent to ${selectedUser.email}`);

      setShowInvitationModal(false);
      setSelectedUser(null);
    } catch (error: any) {
      console.error('Failed to send verification invitation:', error);

      // Show detailed error message
      let errorMessage = 'Failed to send verification invitation. ';
      if (error.response?.data?.error?.message) {
        errorMessage += error.response.data.error.message;
      } else if (error.response?.status === 404) {
        errorMessage += 'API endpoint not found. Please check if the backend server is running and the endpoint is implemented.';
      } else if (error.response?.status === 403) {
        errorMessage += 'You do not have permission to send verification invitations.';
      } else if (error.response?.status === 500) {
        errorMessage += 'Server error occurred. Please try again later.';
      } else if (error.message) {
        errorMessage += error.message;
      } else {
        errorMessage += 'Please check your network connection and try again.';
      }

      showToast.error(errorMessage);
    } finally {
      setSendingInvitation(false);
    }
  };

  const getStatusBadge = (status: VerificationStatus) => {
    return `${statusPill} ${getStatusAccent(status).pill}`;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const exportUsers = async () => {
    try {
      const params: any = {};
      if (filters.status !== 'all') params.status = filters.status;
      if (filters.search) params.search = filters.search;
      if (filters.tags.length > 0) params.tags = filters.tags;

      const blob = await apiClient.exportEndUsers(params);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `end-users-${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err: unknown) {
      showToast.error('Failed to export users');
    }
  };

  return (
    <div className="p-6 space-y-8">
      {/* Page Header */}
      <div className="flex justify-between items-start">
        <div>
          <p className={sectionLabel}>End Users</p>
          <p className="text-sm text-slate-500 mt-1">Manage and monitor end user accounts and verification status</p>
        </div>

        <div className="flex space-x-3">
          <button
            onClick={exportUsers}
            className="inline-flex items-center border border-white/10 rounded-lg font-mono text-sm px-4 py-2 text-slate-300 hover:bg-slate-800/40 transition-colors disabled:opacity-50"
            disabled={loading}
          >
            <Download className="w-4 h-4 mr-2" />
            Export CSV
          </button>
          <button
            onClick={() => setShowCreateForm(true)}
            className="inline-flex items-center bg-cyan-500/20 border border-cyan-400/40 text-cyan-200 hover:bg-cyan-500/30 rounded-lg font-mono text-sm px-4 py-2 transition-colors"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add User
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-rose-500/12 border border-rose-500/25 rounded-lg text-rose-300 text-sm flex items-center justify-between">
          <span>{error}</span>
          <button onClick={loadUsers} className="ml-4 text-rose-200 hover:text-white underline text-xs font-mono">Retry</button>
        </div>
      )}

      {/* Filters */}
      <div className={`${cardSurface} p-6`}>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div>
            <label className="form-label">Search</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-500 w-4 h-4" />
              <input
                type="text"
                className="form-input pl-10"
                placeholder="Search by name, email, or ID..."
                value={filters.search}
                onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value }))}
              />
            </div>
          </div>

          <div>
            <label className="form-label">Verification Status</label>
            <select
              className="form-input"
              value={filters.status}
              onChange={(e) => setFilters(prev => ({ ...prev, status: e.target.value as VerificationStatus | 'all' }))}
            >
              <option value="all">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="in_progress">In Progress</option>
              <option value="verified">Verified</option>
              <option value="failed">Failed</option>
              <option value="manual_review">Manual Review</option>
              <option value="expired">Expired</option>
            </select>
          </div>

          <div>
            <label className="form-label">Tags Filter</label>
            <input
              type="text"
              className="form-input"
              placeholder="Enter tags (comma-separated)"
              value={filters.tags.join(', ')}
              onChange={(e) => setFilters(prev => ({
                ...prev,
                tags: e.target.value.split(',').map(tag => tag.trim()).filter(Boolean)
              }))}
            />
          </div>
        </div>

        <div className="flex justify-end mt-4">
          <button
            onClick={() => {
              setFilters({
                status: 'all',
                search: '',
                tags: []
              });
              setCurrentPage(1);
            }}
            className="inline-flex items-center border border-white/10 rounded-lg font-mono text-sm px-4 py-2 text-slate-300 hover:bg-slate-800/40 transition-colors mr-3"
          >
            Clear Filters
          </button>
          <button
            onClick={() => {
              setCurrentPage(1);
              loadUsers();
            }}
            className="inline-flex items-center bg-cyan-500/20 border border-cyan-400/40 text-cyan-200 hover:bg-cyan-500/30 rounded-lg font-mono text-sm px-4 py-2 transition-colors"
          >
            <Filter className="w-4 h-4 mr-2" />
            Apply Filters
          </button>
        </div>
      </div>

      {/* User List */}
      <div className={cardSurface}>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-white/10">
            <thead>
              <tr>
                <th className={tableHeaderClass}>User</th>
                <th className={tableHeaderClass}>Contact</th>
                <th className={tableHeaderClass}>Verification Status</th>
                <th className={tableHeaderClass}>Tags</th>
                <th className={tableHeaderClass}>Created</th>
                <th className={tableHeaderClass}>Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td className="px-5 py-4">
                      <div className="flex items-center space-x-3">
                        <div className="w-8 h-8 bg-slate-700/50 rounded-full" />
                        <div className="space-y-2">
                          <div className="h-3 w-28 bg-slate-700/50 rounded" />
                          <div className="h-2.5 w-16 bg-slate-700/50 rounded" />
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4"><div className="h-3 w-32 bg-slate-700/50 rounded" /></td>
                    <td className="px-5 py-4"><div className="h-5 w-20 bg-slate-700/50 rounded-full" /></td>
                    <td className="px-5 py-4"><div className="h-5 w-14 bg-slate-700/50 rounded" /></td>
                    <td className="px-5 py-4"><div className="h-3 w-24 bg-slate-700/50 rounded" /></td>
                    <td className="px-5 py-4"><div className="h-3 w-16 bg-slate-700/50 rounded" /></td>
                  </tr>
                ))
              ) : !users || users.length === 0 ? (
                <tr>
                  <td colSpan={6} className={`px-5 py-8 text-center text-slate-500 ${monoSm}`}>
                    No users found matching your criteria
                  </td>
                </tr>
              ) : (
                users.map((user) => (
                  <tr key={user.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="px-5 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="w-8 h-8 rounded-full bg-slate-800 border border-white/10 flex items-center justify-center text-slate-400 text-xs font-mono mr-3">
                          {user.first_name && user.last_name
                            ? `${user.first_name[0]}${user.last_name[0]}`
                            : user.email ? user.email[0].toUpperCase() : '?'}
                        </div>
                        <div>
                          <div className={`${monoSm} text-slate-100`}>
                            {user.first_name && user.last_name
                              ? `${user.first_name} ${user.last_name}`
                              : user.email || 'Anonymous User'}
                          </div>
                          <div className={`${monoXs} text-slate-500`}>
                            {user.id.substring(0, 8)}...
                          </div>
                          {user.external_id && (
                            <div className={`${monoXs} text-slate-500`}>
                              ext: {user.external_id}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4 whitespace-nowrap">
                      <div className="space-y-1">
                        {user.email && (
                          <div className={`${monoSm} text-slate-300`}>
                            {user.email}
                          </div>
                        )}
                        {user.phone && (
                          <div className={`${monoXs} text-slate-500`}>
                            {user.phone}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-4 whitespace-nowrap">
                      <div>
                        <span className={getStatusBadge(user.verification_status)}>
                          {user.verification_status.replace('_', ' ')}
                        </span>
                      </div>
                      {user.verification_completed_at && (
                        <div className={`${monoXs} text-slate-500 mt-1`}>
                          Completed: {formatDate(user.verification_completed_at)}
                        </div>
                      )}
                      {user.invitation_sent && (
                        <div className={`${monoXs} text-emerald-400 mt-1`}>
                          Invitation sent {user.invitation_sent_at && formatDate(user.invitation_sent_at)}
                        </div>
                      )}
                      {!user.invitation_sent && user.email && user.verification_status === 'pending' && (
                        <div className={`${monoXs} text-amber-400 mt-1`}>
                          Ready to send invitation
                        </div>
                      )}
                      {!user.invitation_sent && !user.email && user.verification_status === 'pending' && (
                        <div className={`${monoXs} text-rose-400 mt-1`}>
                          Email required for invitation
                        </div>
                      )}
                    </td>
                    <td className="px-5 py-4 whitespace-nowrap">
                      <div className="flex flex-wrap gap-1">
                        {user.tags && user.tags.length > 0 ? (
                          user.tags.slice(0, 3).map((tag, index) => (
                            <span
                              key={index}
                              className={`${monoXs} px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-300 border border-cyan-500/20`}
                            >
                              {tag}
                            </span>
                          ))
                        ) : (
                          <span className={`${monoXs} text-slate-600`}>--</span>
                        )}
                        {user.tags && user.tags.length > 3 && (
                          <span className={`${monoXs} text-slate-500`}>
                            +{user.tags.length - 3}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className={`px-5 py-4 whitespace-nowrap ${monoXs} text-slate-500`}>
                      {formatDate(user.created_at)}
                    </td>
                    <td className="px-5 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => {
                            setSelectedUser(user);
                            setShowDetails(true);
                          }}
                          className="p-1.5 text-slate-400 hover:text-cyan-300 hover:bg-slate-800/40 rounded transition-colors"
                          title="View Details"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => {
                            setSelectedUser(user);
                            setShowEditForm(true);
                          }}
                          className="p-1.5 text-slate-400 hover:text-cyan-300 hover:bg-slate-800/40 rounded transition-colors"
                          title="Edit User"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        {!user.invitation_sent && user.email && (
                          <button
                            onClick={() => {
                              setSelectedUser(user);
                              setShowInvitationModal(true);
                            }}
                            className="p-1.5 text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 rounded transition-colors"
                            title="Send Verification Link"
                          >
                            <Send className="w-4 h-4" />
                          </button>
                        )}
                        {!user.email && (
                          <div className="p-1.5 text-slate-600" title="No email address - cannot send invitation">
                            <Send className="w-4 h-4" />
                          </div>
                        )}
                        <button
                          onClick={() => setDeleteConfirm(user.id)}
                          className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded transition-colors"
                          title="Delete User"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="px-5 py-3 flex items-center justify-between border-t border-white/10">
            <div className="flex-1 flex justify-between sm:hidden">
              <button
                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                disabled={currentPage === 1}
                className="border border-white/10 rounded-lg font-mono text-sm px-4 py-2 text-slate-300 hover:bg-slate-800/40 transition-colors disabled:opacity-50"
              >
                Previous
              </button>
              <button
                onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                disabled={currentPage === totalPages}
                className="border border-white/10 rounded-lg font-mono text-sm px-4 py-2 text-slate-300 hover:bg-slate-800/40 transition-colors disabled:opacity-50"
              >
                Next
              </button>
            </div>
            <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
              <div>
                <p className={`${monoXs} text-slate-500`}>
                  Page <span className="text-slate-300">{currentPage}</span> of{' '}
                  <span className="text-slate-300">{totalPages}</span>
                </p>
              </div>
              <div>
                <nav className="inline-flex items-center space-x-1">
                  <button
                    onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                    disabled={currentPage === 1}
                    className="border border-white/10 rounded-lg font-mono text-sm px-3 py-1.5 text-slate-400 hover:bg-slate-800/40 transition-colors disabled:opacity-50"
                  >
                    Previous
                  </button>
                  <button
                    onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                    disabled={currentPage === totalPages}
                    className="border border-white/10 rounded-lg font-mono text-sm px-3 py-1.5 text-slate-400 hover:bg-slate-800/40 transition-colors disabled:opacity-50"
                  >
                    Next
                  </button>
                </nav>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* User Details Modal */}
      {showDetails && selectedUser && (
        <UserDetailsModal
          user={selectedUser}
          onClose={() => {
            setShowDetails(false);
            setSelectedUser(null);
          }}
          onUserUpdated={() => loadUsers()}
        />
      )}

      {/* Create User Modal */}
      {showCreateForm && (
        <UserFormModal
          title="Add New User"
          onClose={() => setShowCreateForm(false)}
          onSubmit={async (userData) => {
            try {
              await apiClient.createEndUser(userData);
              setShowCreateForm(false);
              loadUsers();
              showToast.success('User created');
            } catch (err: unknown) {
              showToast.error(`Failed to create user: ${err instanceof Error ? err.message : 'Unknown error'}`);
            }
          }}
        />
      )}

      {/* Edit User Modal */}
      {showEditForm && selectedUser && (
        <UserFormModal
          title="Edit User"
          user={selectedUser}
          onClose={() => {
            setShowEditForm(false);
            setSelectedUser(null);
          }}
          onSubmit={async (userData) => {
            try {
              await apiClient.updateEndUser(selectedUser.id, userData);
              setShowEditForm(false);
              setSelectedUser(null);
              loadUsers();
              showToast.success('User updated');
            } catch (err: unknown) {
              showToast.error(`Failed to update user: ${err instanceof Error ? err.message : 'Unknown error'}`);
            }
          }}
        />
      )}

      {/* Send Verification Invitation Modal */}
      <Modal
        isOpen={showInvitationModal && !!selectedUser}
        onClose={() => {
          setShowInvitationModal(false);
          setSelectedUser(null);
        }}
        title="Send Verification Link"
        size="md"
      >
        {selectedUser && (
          <div className="space-y-5">
            <p className="text-slate-400 text-sm">
              Send a verification invitation email to{' '}
              <span className={`${monoSm} text-slate-200`}>{selectedUser.first_name} {selectedUser.last_name}</span>{' '}
              at <span className={`${monoSm} text-slate-200`}>{selectedUser.email}</span>.
            </p>

            <div className={infoPanel}>
              <p className={sectionLabel}>What happens next</p>
              <ul className={`${monoXs} text-slate-400 space-y-1.5 mt-2`}>
                <li>User receives an email with a verification link</li>
                <li>Link is valid for 7 days</li>
                <li>User completes verification on your branded portal</li>
                <li>You will receive notification of completion</li>
              </ul>
            </div>

            <div>
              <label className={`${sectionLabel} block mb-2`}>
                Custom Message (Optional)
              </label>
              <textarea
                id="customMessage"
                rows={3}
                className="w-full px-3 py-2 border border-white/10 rounded-lg bg-slate-800/50 text-slate-100 placeholder-slate-600 focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 font-mono text-sm"
                placeholder="Add a personalized message to the invitation email..."
              />
            </div>

            <div className="flex justify-end space-x-3 pt-2">
              <button
                onClick={() => {
                  setShowInvitationModal(false);
                  setSelectedUser(null);
                }}
                className="px-4 py-2 border border-white/10 rounded-lg font-mono text-sm text-slate-300 hover:bg-slate-800/40 transition-colors"
                disabled={sendingInvitation}
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const customMessage = (document.getElementById('customMessage') as HTMLTextAreaElement)?.value;
                  handleSendVerificationInvitation(customMessage);
                }}
                disabled={sendingInvitation}
                className="px-4 py-2 bg-cyan-500/20 border border-cyan-400/40 text-cyan-200 hover:bg-cyan-500/30 rounded-lg font-mono text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
              >
                {sendingInvitation && (
                  <div className="w-4 h-4 border-2 border-cyan-300 border-t-transparent rounded-full animate-spin mr-2"></div>
                )}
                {sendingInvitation ? 'Sending...' : 'Send Invitation'}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={!!deleteConfirm}
        onClose={() => setDeleteConfirm(null)}
        title="Delete User"
        size="sm"
      >
        <div className="space-y-5">
          <div className={infoPanel}>
            <p className="text-slate-300 text-sm">
              Are you sure you want to delete this user? This action cannot be undone.
            </p>
          </div>
          <div className="flex justify-end space-x-3 pt-2">
            <button
              onClick={() => setDeleteConfirm(null)}
              className="px-4 py-2 border border-white/10 rounded-lg font-mono text-sm text-slate-300 hover:bg-slate-800/40 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => deleteConfirm && handleDeleteUser(deleteConfirm)}
              className="px-4 py-2 bg-rose-500/20 border border-rose-400/40 text-rose-200 hover:bg-rose-500/30 rounded-lg font-mono text-sm transition-colors"
            >
              Delete User
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// User Details Modal Component
interface UserDetailsModalProps {
  user: EndUser;
  onClose: () => void;
  onUserUpdated: () => void;
}

function UserDetailsModal({ user, onClose, onUserUpdated }: UserDetailsModalProps) {
  const [verifications, setVerifications] = useState<any[]>([]);
  const [loadingVerifications, setLoadingVerifications] = useState(true);

  useEffect(() => {
    loadUserVerifications();
  }, [user.id]);

  const loadUserVerifications = async () => {
    try {
      setLoadingVerifications(true);
      const result = await apiClient.getEndUserVerifications(user.id);
      setVerifications(result.verifications);
    } catch (error) {
      console.error('Failed to load user verifications:', error);
    } finally {
      setLoadingVerifications(false);
    }
  };

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title="User Details"
      size="xl"
    >
      <div className="space-y-1 mb-6">
        <p className={`${monoXs} text-slate-500`}>ID: {user.id}</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* User Information */}
        <div className="space-y-4">
          <div className={infoPanel}>
            <p className={sectionLabel}>User Information</p>
            <div className="space-y-2.5 text-sm mt-3">
              <div className="flex justify-between">
                <span className="text-slate-500">Name</span>
                <span className={`${monoSm} text-slate-200`}>
                  {user.first_name && user.last_name
                    ? `${user.first_name} ${user.last_name}`
                    : 'Not provided'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Email</span>
                <span className={`${monoSm} text-slate-200`}>{user.email || 'Not provided'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Phone</span>
                <span className={`${monoSm} text-slate-200`}>{user.phone || 'Not provided'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">External ID</span>
                <span className={`${monoXs} text-slate-200`}>{user.external_id || 'Not provided'}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Status</span>
                <span className={`${statusPill} ${getStatusAccent(user.verification_status).pill}`}>
                  {user.verification_status.replace('_', ' ')}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Created</span>
                <span className={`${monoXs} text-slate-200`}>{new Date(user.created_at).toLocaleDateString()}</span>
              </div>
              {user.verification_completed_at && (
                <div className="flex justify-between">
                  <span className="text-slate-500">Verified</span>
                  <span className={`${monoXs} text-slate-200`}>{new Date(user.verification_completed_at).toLocaleDateString()}</span>
                </div>
              )}
            </div>
          </div>

          {/* Tags */}
          <div className={infoPanel}>
            <p className={sectionLabel}>Tags</p>
            <div className="flex flex-wrap gap-2 mt-3">
              {user.tags && user.tags.length > 0 ? (
                user.tags.map((tag, index) => (
                  <span
                    key={index}
                    className={`${monoXs} px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-300 border border-cyan-500/20`}
                  >
                    {tag}
                  </span>
                ))
              ) : (
                <span className={`${monoXs} text-slate-600`}>No tags assigned</span>
              )}
            </div>
          </div>

          {/* Metadata */}
          {user.metadata && Object.keys(user.metadata).length > 0 && (
            <div className={infoPanel}>
              <p className={sectionLabel}>Custom Metadata</p>
              <div className="space-y-2 text-sm mt-3">
                {Object.entries(user.metadata).map(([key, value]) => (
                  <div key={key} className="flex justify-between">
                    <span className="text-slate-500">{key}</span>
                    <span className={`${monoXs} text-slate-200`}>{String(value)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Verification History */}
        <div>
          <p className={`${sectionLabel} mb-3`}>Verification History</p>
          {loadingVerifications ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className={`${cardSurface} p-3 animate-pulse`}>
                  <div className="flex justify-between mb-2">
                    <div className="h-3 w-28 bg-slate-700/50 rounded" />
                    <div className="h-5 w-16 bg-slate-700/50 rounded-full" />
                  </div>
                  <div className="h-2.5 w-20 bg-slate-700/50 rounded" />
                </div>
              ))}
            </div>
          ) : verifications.length === 0 ? (
            <div className={infoPanel}>
              <p className={`${monoXs} text-slate-500 text-center py-4`}>No verifications found</p>
            </div>
          ) : (
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {verifications.map((verification, index) => (
                <div key={index} className={`${cardSurface} border-l-[3px] ${getStatusAccent(verification.status).border} p-3`}>
                  <div className="flex items-center justify-between mb-2">
                    <span className={`${monoSm} text-slate-200`}>
                      #{verification.id?.substring(0, 8)}...
                    </span>
                    <span className={`${statusPill} ${getStatusAccent(verification.status).pill}`}>
                      {verification.status}
                    </span>
                  </div>
                  <div className={`${monoXs} text-slate-500`}>
                    {new Date(verification.created_at).toLocaleDateString()}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

// User Form Modal Component
interface UserFormModalProps {
  title: string;
  user?: EndUser;
  onClose: () => void;
  onSubmit: (userData: Partial<EndUser>) => Promise<void>;
}

function UserFormModal({ title, user, onClose, onSubmit }: UserFormModalProps) {
  const [formData, setFormData] = useState<UserFormData>({
    email: user?.email || '',
    phone: user?.phone || '',
    first_name: user?.first_name || '',
    last_name: user?.last_name || '',
    external_id: user?.external_id || '',
    tags: user?.tags || [],
    metadata: user?.metadata || {}
  });
  const [loading, setLoading] = useState(false);
  const [newTag, setNewTag] = useState('');
  const [newMetadataKey, setNewMetadataKey] = useState('');
  const [newMetadataValue, setNewMetadataValue] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await onSubmit({
        ...formData,
        tags: formData.tags.filter(Boolean),
        metadata: Object.fromEntries(
          Object.entries(formData.metadata).filter(([_, v]) => v.trim() !== '')
        )
      });
    } catch (error) {
      console.error('Form submission error:', error);
    } finally {
      setLoading(false);
    }
  };

  const addTag = () => {
    if (newTag.trim() && !formData.tags.includes(newTag.trim())) {
      setFormData(prev => ({
        ...prev,
        tags: [...prev.tags, newTag.trim()]
      }));
      setNewTag('');
    }
  };

  const removeTag = (tagToRemove: string) => {
    setFormData(prev => ({
      ...prev,
      tags: prev.tags.filter(tag => tag !== tagToRemove)
    }));
  };

  const addMetadata = () => {
    if (newMetadataKey.trim() && newMetadataValue.trim()) {
      setFormData(prev => ({
        ...prev,
        metadata: {
          ...prev.metadata,
          [newMetadataKey.trim()]: newMetadataValue.trim()
        }
      }));
      setNewMetadataKey('');
      setNewMetadataValue('');
    }
  };

  const removeMetadata = (keyToRemove: string) => {
    setFormData(prev => ({
      ...prev,
      metadata: Object.fromEntries(
        Object.entries(prev.metadata).filter(([key]) => key !== keyToRemove)
      )
    }));
  };

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title={title}
      size="lg"
      closeOnOverlayClick={false}
    >
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Basic Information */}
        <div>
          <p className={`${sectionLabel} mb-3`}>Basic Information</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="form-label">First Name</label>
              <input
                type="text"
                className="form-input"
                value={formData.first_name}
                onChange={(e) => setFormData(prev => ({ ...prev, first_name: e.target.value }))}
                placeholder="Enter first name"
              />
            </div>
            <div>
              <label className="form-label">Last Name</label>
              <input
                type="text"
                className="form-input"
                value={formData.last_name}
                onChange={(e) => setFormData(prev => ({ ...prev, last_name: e.target.value }))}
                placeholder="Enter last name"
              />
            </div>
          </div>
        </div>

        <div>
          <p className={`${sectionLabel} mb-3`}>Contact</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="form-label">Email *</label>
              <input
                type="email"
                className="form-input"
                value={formData.email}
                onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                placeholder="Enter email address"
                required
              />
            </div>
            <div>
              <label className="form-label">Phone</label>
              <input
                type="tel"
                className="form-input"
                value={formData.phone}
                onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
                placeholder="Enter phone number"
              />
            </div>
          </div>
        </div>

        <div>
          <label className="form-label">External ID</label>
          <input
            type="text"
            className="form-input"
            value={formData.external_id}
            onChange={(e) => setFormData(prev => ({ ...prev, external_id: e.target.value }))}
            placeholder="Enter external system ID (optional)"
          />
        </div>

        {/* Tags */}
        <div>
          <p className={`${sectionLabel} mb-3`}>Tags</p>
          <div className="space-y-3">
            <div className="flex gap-2">
              <input
                type="text"
                className="form-input flex-1"
                placeholder="Add a tag"
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addTag())}
              />
              <button
                type="button"
                onClick={addTag}
                className="px-4 py-2 border border-white/10 rounded-lg font-mono text-sm text-slate-300 hover:bg-slate-800/40 transition-colors"
              >
                Add Tag
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {formData.tags.map((tag, index) => (
                <span
                  key={index}
                  className={`${monoXs} inline-flex items-center px-2.5 py-1 rounded bg-cyan-500/10 text-cyan-300 border border-cyan-500/20`}
                >
                  {tag}
                  <button
                    type="button"
                    onClick={() => removeTag(tag)}
                    className="ml-1.5 hover:text-cyan-100 transition-colors"
                  >
                    x
                  </button>
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Metadata */}
        <div>
          <p className={`${sectionLabel} mb-3`}>Custom Metadata</p>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <input
                type="text"
                className="form-input"
                placeholder="Metadata key"
                value={newMetadataKey}
                onChange={(e) => setNewMetadataKey(e.target.value)}
              />
              <div className="flex gap-2">
                <input
                  type="text"
                  className="form-input flex-1"
                  placeholder="Metadata value"
                  value={newMetadataValue}
                  onChange={(e) => setNewMetadataValue(e.target.value)}
                />
                <button
                  type="button"
                  onClick={addMetadata}
                  className="px-4 py-2 border border-white/10 rounded-lg font-mono text-sm text-slate-300 hover:bg-slate-800/40 transition-colors"
                >
                  Add
                </button>
              </div>
            </div>
            <div className="space-y-2">
              {Object.entries(formData.metadata).map(([key, value]) => (
                <div key={key} className={`flex items-center justify-between ${infoPanel} !p-2.5 !space-y-0`}>
                  <span className={monoXs}>
                    <span className="text-slate-400">{key}:</span>{' '}
                    <span className="text-slate-200">{value}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => removeMetadata(key)}
                    className="text-rose-400 hover:text-rose-300 transition-colors p-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Submit Buttons */}
        <div className="flex justify-end space-x-3 pt-6 border-t border-white/10">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 border border-white/10 rounded-lg font-mono text-sm text-slate-300 hover:bg-slate-800/40 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading}
            className="px-4 py-2 bg-cyan-500/20 border border-cyan-400/40 text-cyan-200 hover:bg-cyan-500/30 rounded-lg font-mono text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Saving...' : user ? 'Update User' : 'Create User'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
