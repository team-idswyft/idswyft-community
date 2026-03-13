import React, { useState } from 'react';
import { Lock, CheckCircle } from 'lucide-react';
import { platformApi } from '../services/api';
import {
  sectionLabel,
  monoXs,
  cardSurface,
} from '../styles/tokens';

export default function Settings() {
  const [form, setForm] = useState({
    current_password: '',
    new_password: '',
    confirm_new_password: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  function validate(): string | null {
    if (form.new_password.length < 8) {
      return 'New password must be at least 8 characters';
    }
    if (form.new_password !== form.confirm_new_password) {
      return 'Passwords do not match';
    }
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSuccess('');

    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setSaving(true);

    try {
      await platformApi.changePassword(form.current_password, form.new_password);
      setSuccess('Password changed successfully');
      setForm({ current_password: '', new_password: '', confirm_new_password: '' });
    } catch (err: any) {
      setError(err.message || 'Failed to change password');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <div>
        <p className={sectionLabel}>Account Settings</p>
        <p className="text-sm text-slate-500 mt-1">Manage your account security</p>
      </div>

      <div className={`${cardSurface} p-6 max-w-lg`}>
        <div className="flex items-center gap-3 mb-6">
          <div className="icon-container-yellow">
            <Lock className="h-5 w-5 text-amber-300" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-100">Change Password</p>
            <p className="text-xs text-slate-500">Update your platform admin password</p>
          </div>
        </div>

        {error && (
          <div className="bg-rose-500/12 border border-rose-400/30 rounded-lg p-3 mb-4">
            <span className={`${monoXs} text-rose-300`}>{error}</span>
          </div>
        )}

        {success && (
          <div className="bg-emerald-500/12 border border-emerald-400/30 rounded-lg p-3 mb-4 flex items-center gap-2">
            <CheckCircle className="h-4 w-4 text-emerald-400" />
            <span className={`${monoXs} text-emerald-300`}>{success}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="form-group">
            <label className="form-label">Current Password</label>
            <input
              type="password"
              required
              value={form.current_password}
              onChange={(e) => setForm({ ...form, current_password: e.target.value })}
              className="form-input"
              placeholder="Enter current password"
            />
          </div>

          <div className="form-group">
            <label className="form-label">New Password</label>
            <input
              type="password"
              required
              minLength={8}
              value={form.new_password}
              onChange={(e) => setForm({ ...form, new_password: e.target.value })}
              className="form-input"
              placeholder="Min 8 characters"
            />
          </div>

          <div className="form-group">
            <label className="form-label">Confirm New Password</label>
            <input
              type="password"
              required
              value={form.confirm_new_password}
              onChange={(e) => setForm({ ...form, confirm_new_password: e.target.value })}
              className={`form-input ${
                form.confirm_new_password && form.new_password !== form.confirm_new_password
                  ? 'form-input-error'
                  : ''
              }`}
              placeholder="Repeat new password"
            />
            {form.confirm_new_password && form.new_password !== form.confirm_new_password && (
              <p className="text-xs text-rose-400 mt-1">Passwords do not match</p>
            )}
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={saving}
              className="btn btn-primary text-sm"
            >
              <Lock className="h-4 w-4" />
              {saving ? 'Saving...' : 'Change Password'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
