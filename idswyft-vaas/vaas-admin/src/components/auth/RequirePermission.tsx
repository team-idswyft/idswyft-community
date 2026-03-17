import { Navigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import type { AdminPermissions } from '../../types';

interface RequirePermissionProps {
  permission: keyof AdminPermissions;
  children: React.ReactNode;
}

/** Route guard — renders children only if the admin has the required permission (or is owner/super_admin). */
export default function RequirePermission({ permission, children }: RequirePermissionProps) {
  const { admin } = useAuth();

  if (!admin) return <Navigate to="/login" replace />;

  const hasPermission =
    admin.role === 'owner' ||
    admin.is_super_admin ||
    admin.permissions?.[permission];

  if (!hasPermission) return <Navigate to="/dashboard" replace />;

  return <>{children}</>;
}
