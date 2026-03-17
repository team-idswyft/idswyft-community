import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { User, Mail, Building, Shield, Clock, Key } from 'lucide-react';
import { sectionLabel, monoSm, monoXs, cardSurface, statusPill, getStatusAccent } from '../styles/tokens';

export default function Profile() {
  const { admin, organization } = useAuth();

  const infoRow = (icon: React.ReactNode, label: string, value: string | undefined | null) => (
    <div className="flex items-center gap-4 border-b border-white/5 py-4 last:border-0">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-slate-800/60 text-slate-400">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className={sectionLabel}>{label}</p>
        <p className={`${monoSm} mt-0.5 truncate text-slate-100`}>{value || '—'}</p>
      </div>
    </div>
  );

  return (
    <div className="mx-auto max-w-2xl p-6 space-y-6">
      {/* Header */}
      <div>
        <p className={sectionLabel}>Profile</p>
        <p className="mt-1 text-sm text-slate-400">Your account information and role within the organization.</p>
      </div>

      {/* Admin Info Card */}
      <div className={cardSurface}>
        <div className="border-b border-white/10 px-6 py-5">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-xl border border-cyan-400/30 bg-cyan-400/10 text-cyan-200">
              <User className="h-6 w-6" />
            </div>
            <div className="min-w-0">
              <h2 className="truncate text-lg font-semibold text-slate-100">
                {admin?.first_name} {admin?.last_name}
              </h2>
              <div className="mt-1 flex items-center gap-2">
                <span className={`${statusPill} ${getStatusAccent(admin?.status || 'active').pill}`}>
                  {admin?.status}
                </span>
                <span className={`${statusPill} ${getStatusAccent('info').pill}`}>
                  {admin?.role}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="px-6 py-2">
          {infoRow(<Mail className="h-4 w-4" />, 'Email', admin?.email)}
          {infoRow(<Building className="h-4 w-4" />, 'Organization', organization?.name)}
          {infoRow(<Shield className="h-4 w-4" />, 'Role', admin?.role)}
          {infoRow(
            <Clock className="h-4 w-4" />,
            'Last Login',
            admin?.last_login_at
              ? new Date(admin.last_login_at).toLocaleString()
              : 'Never'
          )}
          {infoRow(
            <Key className="h-4 w-4" />,
            'Login Count',
            admin?.login_count?.toString() || '0'
          )}
        </div>
      </div>

      {/* Permissions Card */}
      <div className={cardSurface}>
        <div className="border-b border-white/10 px-6 py-4">
          <p className={sectionLabel}>Permissions</p>
        </div>
        <div className="grid grid-cols-2 gap-2 px-6 py-4">
          {admin?.permissions && Object.entries(admin.permissions).map(([key, value]) => (
            <div key={key} className="flex items-center gap-2 py-1">
              <span className={`h-2 w-2 rounded-full ${value ? 'bg-emerald-400' : 'bg-slate-600'}`} />
              <span className={`${monoXs} ${value ? 'text-slate-300' : 'text-slate-600'}`}>
                {key.replace(/_/g, ' ')}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Password Reset Note */}
      <div className={`${cardSurface} px-6 py-5`}>
        <p className={sectionLabel}>Password</p>
        <p className="mt-2 text-sm text-slate-400">
          To change your password, use the{' '}
          <Link to="/forgot-password" className="text-cyan-300 hover:text-cyan-200 transition">
            password reset flow
          </Link>.
          A reset link will be sent to your email address.
        </p>
      </div>
    </div>
  );
}
