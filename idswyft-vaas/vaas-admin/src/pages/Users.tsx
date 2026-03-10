import React, { useState, useEffect } from 'react';
import { 
  Search, 
  Filter, 
  Download, 
  Plus,
  Eye, 
  Edit2,
  Trash2,
  User,
  Calendar,
  Mail,
  Phone,
  Tag,
  Shield,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Clock,
  Send
} from 'lucide-react';
import { apiClient } from '../services/api';
import type { EndUser } from '../types.js';

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
    } catch (error) {
      console.error('Failed to load users:', error);
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
    } catch (error) {
      console.error('Failed to delete user:', error);
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
      
      // Show success message
      alert(`✅ Verification invitation sent successfully to ${selectedUser.email}!`);
      
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
      
      alert(`❌ ${errorMessage}`);
    } finally {
      setSendingInvitation(false);
    }
  };

  const getStatusIcon = (status: VerificationStatus) => {
    switch (status) {
      case 'verified':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'failed':
        return <XCircle className="w-4 h-4 text-red-500" />;
      case 'manual_review':
        return <AlertTriangle className="w-4 h-4 text-yellow-500" />;
      case 'in_progress':
        return <Clock className="w-4 h-4 text-blue-500" />;
      case 'expired':
        return <XCircle className="w-4 h-4 text-slate-500" />;
      default:
        return <Clock className="w-4 h-4 text-slate-500" />;
    }
  };

  const getStatusBadge = (status: VerificationStatus) => {
    const baseClass = "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium";
    
    switch (status) {
      case 'verified':
        return `${baseClass} bg-green-100 text-green-800`;
      case 'failed':
        return `${baseClass} bg-red-100 text-red-800`;
      case 'manual_review':
        return `${baseClass} bg-yellow-100 text-yellow-800`;
      case 'in_progress':
        return `${baseClass} bg-cyan-500/15 text-cyan-200`;
      case 'pending':
        return `${baseClass} bg-cyan-500/15 text-cyan-200`;
      case 'expired':
        return `${baseClass} bg-slate-800/70 text-slate-200`;
      default:
        return `${baseClass} bg-slate-800/70 text-slate-200`;
    }
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
    } catch (error) {
      console.error('Failed to export users:', error);
    }
  };

  return (
    <div className="p-6 space-y-8">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-semibold text-slate-100">End Users</h1>
          <p className="text-slate-400 mt-1">Manage and monitor end user accounts and verification status</p>
        </div>
        
        <div className="flex space-x-3">
          <button
            onClick={exportUsers}
            className="btn btn-secondary"
            disabled={loading}
          >
            <Download className="w-4 h-4 mr-2" />
            Export CSV
          </button>
          <button
            onClick={() => setShowCreateForm(true)}
            className="btn btn-primary"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add User
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="content-card-glass p-6">
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
            className="btn btn-secondary mr-3"
          >
            Clear Filters
          </button>
          <button
            onClick={() => {
              setCurrentPage(1);
              loadUsers();
            }}
            className="btn btn-primary"
          >
            <Filter className="w-4 h-4 mr-2" />
            Apply Filters
          </button>
        </div>
      </div>

      {/* User List */}
      <div className="content-card-glass">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-slate-900/60">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  User
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Contact
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Verification Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Tags
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Created
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-slate-900/55 backdrop-blur-sm divide-y divide-white/20">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-4 text-center text-slate-500">
                    <div className="flex items-center justify-center">
                      <div className="w-5 h-5 border-2 border-primary-600 border-t-transparent rounded-full animate-spin mr-2"></div>
                      Loading users...
                    </div>
                  </td>
                </tr>
              ) : !users || users.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-4 text-center text-slate-500">
                    No users found matching your criteria
                  </td>
                </tr>
              ) : (
                users.map((user) => (
                  <tr key={user.id} className="hover:bg-slate-900/60">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <User className="w-8 h-8 text-slate-500 mr-3" />
                        <div>
                          <div className="text-sm font-medium text-slate-100">
                            {user.first_name && user.last_name 
                              ? `${user.first_name} ${user.last_name}` 
                              : user.email || 'Anonymous User'}
                          </div>
                          <div className="text-sm text-slate-500">
                            ID: {user.id.substring(0, 8)}...
                          </div>
                          {user.external_id && (
                            <div className="text-xs text-slate-500">
                              External: {user.external_id}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-slate-100">
                        {user.email && (
                          <div className="flex items-center mb-1">
                            <Mail className="w-3 h-3 mr-1 text-slate-500" />
                            {user.email}
                          </div>
                        )}
                        {user.phone && (
                          <div className="flex items-center">
                            <Phone className="w-3 h-3 mr-1 text-slate-500" />
                            {user.phone}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        {getStatusIcon(user.verification_status)}
                        <span className={`ml-2 ${getStatusBadge(user.verification_status)}`}>
                          {user.verification_status.replace('_', ' ')}
                        </span>
                      </div>
                      {user.verification_completed_at && (
                        <div className="text-xs text-slate-500 mt-1">
                          Completed: {formatDate(user.verification_completed_at)}
                        </div>
                      )}
                      {user.invitation_sent && (
                        <div className="text-xs text-green-600 mt-1 flex items-center">
                          <Send className="w-3 h-3 mr-1" />
                          Invitation sent {user.invitation_sent_at && formatDate(user.invitation_sent_at)}
                        </div>
                      )}
                      {!user.invitation_sent && user.email && user.verification_status === 'pending' && (
                        <div className="text-xs text-orange-600 mt-1 flex items-center">
                          <AlertTriangle className="w-3 h-3 mr-1" />
                          Ready to send invitation
                        </div>
                      )}
                      {!user.invitation_sent && !user.email && user.verification_status === 'pending' && (
                        <div className="text-xs text-red-600 mt-1 flex items-center">
                          <AlertTriangle className="w-3 h-3 mr-1" />
                          Email required for invitation
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex flex-wrap gap-1">
                        {user.tags && user.tags.length > 0 ? (
                          user.tags.slice(0, 3).map((tag, index) => (
                            <span
                              key={index}
                              className="inline-flex items-center px-2 py-1 text-xs font-medium rounded-md bg-cyan-500/15 text-cyan-200"
                            >
                              <Tag className="w-3 h-3 mr-1" />
                              {tag}
                            </span>
                          ))
                        ) : (
                          <span className="text-sm text-slate-500">No tags</span>
                        )}
                        {user.tags && user.tags.length > 3 && (
                          <span className="text-xs text-slate-500">
                            +{user.tags.length - 3} more
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                      <div className="flex items-center">
                        <Calendar className="w-4 h-4 mr-1" />
                        {formatDate(user.created_at)}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => {
                            setSelectedUser(user);
                            setShowDetails(true);
                          }}
                          className="text-primary-600 hover:text-primary-900"
                          title="View Details"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => {
                            setSelectedUser(user);
                            setShowEditForm(true);
                          }}
                          className="text-cyan-300 hover:text-cyan-200"
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
                            className="text-emerald-300 hover:text-emerald-200 bg-emerald-500/15 hover:bg-emerald-500/25 p-1.5 rounded"
                            title="Send Verification Link"
                          >
                            <Send className="w-4 h-4" />
                          </button>
                        )}
                        {!user.email && (
                          <div className="text-slate-500 p-1.5" title="No email address - cannot send invitation">
                            <Send className="w-4 h-4 opacity-30" />
                          </div>
                        )}
                        <button
                          onClick={() => setDeleteConfirm(user.id)}
                          className="text-red-600 hover:text-red-900"
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
          <div className="bg-slate-900/70 backdrop-blur-sm px-4 py-3 flex items-center justify-between border-t border-white/20 sm:px-6">
            <div className="flex-1 flex justify-between sm:hidden">
              <button
                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                disabled={currentPage === 1}
                className="relative inline-flex items-center px-4 py-2 border border-white/15 text-sm font-medium rounded-md text-slate-300 bg-slate-900 hover:bg-slate-900/60 disabled:opacity-50"
              >
                Previous
              </button>
              <button
                onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                disabled={currentPage === totalPages}
                className="ml-3 relative inline-flex items-center px-4 py-2 border border-white/15 text-sm font-medium rounded-md text-slate-300 bg-slate-900 hover:bg-slate-900/60 disabled:opacity-50"
              >
                Next
              </button>
            </div>
            <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
              <div>
                <p className="text-sm text-slate-300">
                  Page <span className="font-medium">{currentPage}</span> of{' '}
                  <span className="font-medium">{totalPages}</span>
                </p>
              </div>
              <div>
                <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px">
                  <button
                    onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                    disabled={currentPage === 1}
                    className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-white/15 bg-slate-900 text-sm font-medium text-slate-500 hover:bg-slate-900/60 disabled:opacity-50"
                  >
                    Previous
                  </button>
                  <button
                    onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                    disabled={currentPage === totalPages}
                    className="relative inline-flex items-center px-2 py-2 rounded-r-md border border-white/15 bg-slate-900 text-sm font-medium text-slate-500 hover:bg-slate-900/60 disabled:opacity-50"
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
            } catch (error) {
              console.error('Failed to create user:', error);
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
            } catch (error) {
              console.error('Failed to update user:', error);
            }
          }}
        />
      )}

      {/* Send Verification Invitation Modal */}
      {showInvitationModal && selectedUser && (
        <div className="fixed inset-0 z-[120] overflow-y-auto h-full w-full bg-slate-950/70 backdrop-blur-sm">
          <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-slate-900">
            <div className="flex items-center mb-4">
              <Send className="w-6 h-6 text-green-500 mr-3" />
              <h3 className="text-lg font-semibold text-slate-100">Send Verification Link</h3>
            </div>
            
            <div className="mb-6">
              <p className="text-slate-400 mb-4">
                Send a verification invitation email to <strong>{selectedUser.first_name} {selectedUser.last_name}</strong> at <strong>{selectedUser.email}</strong>.
              </p>
              
              <div className="bg-cyan-500/10 border border-cyan-500/25 rounded-lg p-4 mb-4">
                <h4 className="text-sm font-medium text-cyan-200 mb-2">What happens next:</h4>
                <ul className="text-sm text-blue-700 space-y-1">
                  <li>• User receives an email with a verification link</li>
                  <li>• Link is valid for 7 days</li>
                  <li>• User completes verification on your branded portal</li>
                  <li>• You'll receive notification of completion</li>
                </ul>
              </div>
              
              <div className="mb-4">
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Custom Message (Optional)
                </label>
                <textarea
                  id="customMessage"
                  rows={3}
                  className="w-full px-3 py-2 border border-white/15 rounded-md focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500"
                  placeholder="Add a personalized message to the invitation email..."
                />
              </div>
            </div>
            
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => {
                  setShowInvitationModal(false);
                  setSelectedUser(null);
                }}
                className="px-4 py-2 border border-white/15 rounded-md text-slate-300 bg-slate-900 hover:bg-slate-900/60"
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
                className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
              >
                {sendingInvitation && (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
                )}
                {sendingInvitation ? 'Sending...' : 'Send Invitation'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-[120] overflow-y-auto h-full w-full bg-slate-950/70 backdrop-blur-sm">
          <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-slate-900">
            <div className="flex items-center mb-4">
              <AlertTriangle className="w-6 h-6 text-red-500 mr-3" />
              <h3 className="text-lg font-semibold text-slate-100">Delete User</h3>
            </div>
            <p className="text-slate-400 mb-6">
              Are you sure you want to delete this user? This action cannot be undone.
            </p>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="btn btn-secondary"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDeleteUser(deleteConfirm)}
                className="btn btn-danger"
              >
                Delete User
              </button>
            </div>
          </div>
        </div>
      )}
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
    <div className="fixed inset-0 z-[120] overflow-y-auto h-full w-full bg-slate-950/70 backdrop-blur-sm">
      <div className="relative top-8 mx-auto p-5 border w-11/12 max-w-4xl shadow-lg rounded-md bg-slate-900 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-start mb-6">
          <div>
            <h3 className="text-lg font-semibold text-slate-100">User Details</h3>
            <p className="text-sm text-slate-500 mt-1">ID: {user.id}</p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-500 hover:text-slate-400"
          >
            <XCircle className="w-6 h-6" />
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* User Information */}
          <div className="space-y-4">
            <div className="bg-slate-900/60 p-4 rounded-lg">
              <h4 className="font-medium text-slate-100 mb-3 flex items-center">
                <User className="w-4 h-4 mr-2" />
                User Information
              </h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-500">Name:</span>
                  <span className="font-medium">
                    {user.first_name && user.last_name 
                      ? `${user.first_name} ${user.last_name}` 
                      : 'Not provided'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Email:</span>
                  <span className="font-medium">{user.email || 'Not provided'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Phone:</span>
                  <span className="font-medium">{user.phone || 'Not provided'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">External ID:</span>
                  <span className="font-medium">{user.external_id || 'Not provided'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Status:</span>
                  <span className={`font-medium ${user.verification_status === 'verified' ? 'text-green-600' : user.verification_status === 'failed' ? 'text-red-600' : 'text-yellow-600'}`}>
                    {user.verification_status.replace('_', ' ')}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Created:</span>
                  <span className="font-medium">{new Date(user.created_at).toLocaleDateString()}</span>
                </div>
                {user.verification_completed_at && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">Verified:</span>
                    <span className="font-medium">{new Date(user.verification_completed_at).toLocaleDateString()}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Tags */}
            <div className="bg-slate-900/60 p-4 rounded-lg">
              <h4 className="font-medium text-slate-100 mb-3 flex items-center">
                <Tag className="w-4 h-4 mr-2" />
                Tags
              </h4>
              <div className="flex flex-wrap gap-2">
                {user.tags && user.tags.length > 0 ? (
                  user.tags.map((tag, index) => (
                    <span
                      key={index}
                      className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-cyan-500/15 text-cyan-200"
                    >
                      {tag}
                    </span>
                  ))
                ) : (
                  <span className="text-slate-500 text-sm">No tags assigned</span>
                )}
              </div>
            </div>

            {/* Metadata */}
            {user.metadata && Object.keys(user.metadata).length > 0 && (
              <div className="bg-slate-900/60 p-4 rounded-lg">
                <h4 className="font-medium text-slate-100 mb-3">Custom Metadata</h4>
                <div className="space-y-2 text-sm">
                  {Object.entries(user.metadata).map(([key, value]) => (
                    <div key={key} className="flex justify-between">
                      <span className="text-slate-500">{key}:</span>
                      <span className="font-medium">{String(value)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Verification History */}
          <div>
            <h4 className="font-medium text-slate-100 mb-3 flex items-center">
              <Shield className="w-4 h-4 mr-2" />
              Verification History
            </h4>
            {loadingVerifications ? (
              <div className="flex items-center justify-center py-8">
                <div className="w-5 h-5 border-2 border-primary-600 border-t-transparent rounded-full animate-spin mr-2"></div>
                Loading verifications...
              </div>
            ) : verifications.length === 0 ? (
              <p className="text-slate-500 text-center py-8">No verifications found</p>
            ) : (
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {verifications.map((verification, index) => (
                  <div key={index} className="border border-white/10 rounded-lg p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium">
                        Verification #{verification.id?.substring(0, 8)}...
                      </span>
                      <span className={`text-xs px-2 py-1 rounded-full ${
                        verification.status === 'completed' ? 'bg-green-100 text-green-800' :
                        verification.status === 'failed' ? 'bg-red-100 text-red-800' :
                        'bg-yellow-100 text-yellow-800'
                      }`}>
                        {verification.status}
                      </span>
                    </div>
                    <div className="text-xs text-slate-500">
                      {new Date(verification.created_at).toLocaleDateString()}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
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
    <div className="fixed inset-0 z-[120] overflow-y-auto h-full w-full bg-slate-950/70 backdrop-blur-sm">
      <div className="relative top-8 mx-auto p-5 border w-11/12 max-w-2xl shadow-lg rounded-md bg-slate-900 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-start mb-6">
          <h3 className="text-lg font-semibold text-slate-100">{title}</h3>
          <button
            onClick={onClose}
            className="text-slate-500 hover:text-slate-400"
          >
            <XCircle className="w-6 h-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Basic Information */}
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
            <label className="form-label">Tags</label>
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
                  className="btn btn-secondary"
                >
                  Add Tag
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {formData.tags.map((tag, index) => (
                  <span
                    key={index}
                    className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-cyan-500/15 text-cyan-200"
                  >
                    {tag}
                    <button
                      type="button"
                      onClick={() => removeTag(tag)}
                      className="ml-1 hover:text-cyan-300"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Metadata */}
          <div>
            <label className="form-label">Custom Metadata</label>
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
                    className="btn btn-secondary"
                  >
                    Add
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                {Object.entries(formData.metadata).map(([key, value]) => (
                  <div key={key} className="flex items-center justify-between bg-slate-900/60 p-2 rounded">
                    <span className="text-sm">
                      <strong>{key}:</strong> {value}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeMetadata(key)}
                      className="text-red-600 hover:text-red-800"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Submit Buttons */}
          <div className="flex justify-end space-x-3 pt-6 border-t">
            <button
              type="button"
              onClick={onClose}
              className="btn btn-secondary"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="btn btn-primary"
            >
              {loading ? 'Saving...' : user ? 'Update User' : 'Create User'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

