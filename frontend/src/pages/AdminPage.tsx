import React, { useState, useEffect } from 'react';
import { API_BASE_URL } from '../config/api';
import { exportUserData, deleteUserData } from '../lib/adminApiInstance';

interface VerificationRequest {
  id: string;
  user_id: string;
  status: string;
  verification_type: string;
  created_at: string;
  developer_name?: string;
  confidence_score?: number;
}

export const AdminPage: React.FC = () => {
  const [verifications, setVerifications] = useState<VerificationRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    total: 0,
    pending: 0,
    verified: 0,
    failed: 0,
    manual_review: 0
  });

  const [deletingData, setDeletingData] = useState<string | null>(null);

  useEffect(() => {
    // Check auth via cookie — try a protected endpoint
    fetch(`${API_BASE_URL}/api/admin/dashboard`, { credentials: 'include' })
      .then(res => {
        if (!res.ok) { window.location.href = '/admin/login'; return; }
        fetchVerifications();
        fetchStats();
      })
      .catch(() => { window.location.href = '/admin/login'; });
  }, []);

  const fetchVerifications = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/verifications`, {
        credentials: 'include',
      });

      if (response.ok) {
        const data = await response.json();
        setVerifications(data.verifications || []);
      } else if (response.status === 401) {
        window.location.href = '/admin/login';
      } else {
        // Mock data for demo
        setVerifications([
          {
            id: 'verif-1',
            user_id: 'user-123',
            status: 'verified',
            verification_type: 'document',
            created_at: new Date().toISOString(),
            developer_name: 'Test Developer',
            confidence_score: 0.95
          },
          {
            id: 'verif-2',
            user_id: 'user-456',
            status: 'pending',
            verification_type: 'selfie',
            created_at: new Date().toISOString(),
            developer_name: 'Demo Corp'
          }
        ]);
      }
    } catch (error) {
      console.error('Failed to fetch verifications:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/stats`, {
        credentials: 'include',
      });

      if (response.ok) {
        const data = await response.json();
        setStats(data.stats || stats);
      } else {
        // Mock stats for demo
        setStats({
          total: 150,
          pending: 12,
          verified: 125,
          failed: 8,
          manual_review: 5
        });
      }
    } catch (error) {
      console.error('Failed to fetch stats:', error);
    }
  };

  const handleStatusUpdate = async (verificationId: string, newStatus: string) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/verification/${verificationId}/review`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ status: newStatus }),
      });

      if (response.ok) {
        // Update local state
        setVerifications(prev => 
          prev.map(v => v.id === verificationId ? { ...v, status: newStatus } : v)
        );
      }
    } catch (error) {
      console.error('Failed to update verification status:', error);
    }
  };

  const handleLogout = () => {
    fetch(`${API_BASE_URL}/api/auth/logout`, { method: 'POST', credentials: 'include' }).catch(() => {});
    window.location.href = '/admin/login';
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'verified': return 'text-green-600 bg-green-50';
      case 'failed': return 'text-red-600 bg-red-50';
      case 'pending': return 'text-yellow-600 bg-yellow-50';
      case 'manual_review': return 'text-blue-600 bg-blue-50';
      default: return 'text-gray-600 bg-gray-50';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg">Loading admin dashboard...</div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-6">
      {/* Header */}
      <div className="bg-white rounded-lg shadow-md p-6 mb-6">
        <div className="flex justify-between items-center">
          <div className="flex items-center space-x-4">
            <img 
              src="/idswyft-logo.png" 
              alt="Idswyft" 
              className="h-8 w-auto"
              onError={(e) => {
                // Fallback to icon and text if image fails to load
                e.currentTarget.style.display = 'none';
                const fallback = e.currentTarget.nextSibling as HTMLElement;
                if (fallback) fallback.style.display = 'flex';
              }}
            />
            <div className="hidden items-center">
              <img 
                src="/idswyft-logo.png"
                alt="Idswyft"
                className="h-8 w-auto"
              />
            </div>
            <h1 className="text-3xl font-bold text-gray-900">Admin Dashboard</h1>
          </div>
          <button
            onClick={handleLogout}
            className="bg-red-600 text-white px-4 py-2 rounded-md hover:bg-red-700 transition"
          >
            Logout
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-8">
        <div className="bg-white p-6 rounded-lg shadow-md">
          <h3 className="text-sm font-medium text-gray-500">Total Verifications</h3>
          <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
        </div>
        <div className="bg-white p-6 rounded-lg shadow-md">
          <h3 className="text-sm font-medium text-gray-500">Pending</h3>
          <p className="text-2xl font-bold text-yellow-600">{stats.pending}</p>
        </div>
        <div className="bg-white p-6 rounded-lg shadow-md">
          <h3 className="text-sm font-medium text-gray-500">Verified</h3>
          <p className="text-2xl font-bold text-green-600">{stats.verified}</p>
        </div>
        <div className="bg-white p-6 rounded-lg shadow-md">
          <h3 className="text-sm font-medium text-gray-500">Failed</h3>
          <p className="text-2xl font-bold text-red-600">{stats.failed}</p>
        </div>
        <div className="bg-white p-6 rounded-lg shadow-md">
          <h3 className="text-sm font-medium text-gray-500">Manual Review</h3>
          <p className="text-2xl font-bold text-blue-600">{stats.manual_review}</p>
        </div>
      </div>

      {/* Verifications Table */}
      <div className="bg-white rounded-lg shadow-md">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-xl font-semibold">Recent Verification Requests</h2>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Verification ID
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  User ID
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Type
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Developer
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Confidence
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Created
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {verifications.map((verification) => (
                <tr key={verification.id}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {verification.id}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {verification.user_id}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {verification.verification_type}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(verification.status)}`}>
                      {verification.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {verification.developer_name || 'Unknown'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {verification.confidence_score ? `${(verification.confidence_score * 100).toFixed(1)}%` : '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {new Date(verification.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <div className="flex flex-col gap-2">
                      {verification.status === "pending" && (
                        <div className="flex space-x-2">
                          <button
                            onClick={() => handleStatusUpdate(verification.id, "verified")}
                            className="text-green-600 hover:text-green-800"
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => handleStatusUpdate(verification.id, "failed")}
                            className="text-red-600 hover:text-red-800"
                          >
                            Reject
                          </button>
                        </div>
                      )}
                      <div className="flex gap-2 mt-1">
                        <button
                          onClick={() => {
                            exportUserData(verification.user_id).catch((err: unknown) => {
                              alert('Export failed: ' + (err instanceof Error ? err.message : 'Unknown error'));
                            });
                          }}
                          className="px-3 py-1 text-xs border rounded-lg hover:bg-gray-50"
                        >
                          Export Data
                        </button>
                        <button
                          onClick={async () => {
                            if (!window.confirm("This permanently deletes all personal data for this user and cannot be undone.")) return;
                            setDeletingData(verification.user_id);
                            try {
                              await deleteUserData(verification.user_id);
                              // Remove all rows for this user — the GDPR delete wipes all their personal data
                              setVerifications(prev => prev.filter(v => v.user_id !== verification.user_id));
                              alert("User data deleted successfully.");
                            } catch (err: unknown) {
                              alert("Failed to delete: " + (err instanceof Error ? err.message : "Unknown error"));
                            } finally {
                              setDeletingData(null);
                            }
                          }}
                          disabled={deletingData === verification.user_id}
                          className="px-3 py-1 text-xs border border-red-200 text-red-600 rounded-lg hover:bg-red-50 disabled:opacity-50"
                        >
                          {deletingData === verification.user_id ? "Deleting..." : "Delete All Data"}
                        </button>
                      </div>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {verifications.length === 0 && (
          <div className="p-6 text-center text-gray-500">
            No verification requests found.
          </div>
        )}
      </div>
    </div>
  );
};