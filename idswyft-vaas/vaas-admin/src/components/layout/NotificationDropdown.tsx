import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bell,
  CheckCircle,
  XCircle,
  AlertTriangle,
  RotateCcw,
  UserPlus,
  Check,
} from 'lucide-react';
import { apiClient } from '../../services/api';
import type { AdminNotification, NotificationType } from '../../types';

const ICON_MAP: Record<NotificationType, { icon: React.ComponentType<{ className?: string }>; color: string }> = {
  'verification.completed': { icon: CheckCircle, color: 'text-emerald-400' },
  'verification.failed': { icon: XCircle, color: 'text-rose-400' },
  'verification.manual_review': { icon: AlertTriangle, color: 'text-amber-400' },
  'verification.overridden': { icon: RotateCcw, color: 'text-amber-400' },
  'webhook.delivery_failed': { icon: AlertTriangle, color: 'text-rose-400' },
  'user.created': { icon: UserPlus, color: 'text-cyan-400' },
};

function formatRelativeTime(dateString: string): string {
  const now = Date.now();
  const then = new Date(dateString).getTime();
  const diffMs = now - then;
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return 'just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 30) return `${diffDay}d ago`;
  return new Date(dateString).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function getNavTarget(n: AdminNotification): string {
  switch (n.type) {
    case 'verification.completed':
    case 'verification.failed':
    case 'verification.manual_review':
    case 'verification.overridden':
      return n.metadata?.session_id ? `/verifications` : '/verifications';
    case 'webhook.delivery_failed':
      return '/webhooks';
    case 'user.created':
      return '/users';
    default:
      return '/dashboard';
  }
}

export default function NotificationDropdown() {
  const [open, setOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState<AdminNotification[]>([]);
  const [loading, setLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  // Poll unread count every 30s (visibility-aware)
  const fetchUnreadCount = useCallback(async () => {
    try {
      const count = await apiClient.getUnreadNotificationCount();
      setUnreadCount(count);
    } catch {
      // Silently ignore — polling failures are expected
    }
  }, []);

  useEffect(() => {
    fetchUnreadCount();

    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        fetchUnreadCount();
      }
    }, 30_000);

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        fetchUnreadCount();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [fetchUnreadCount]);

  // Load notifications when dropdown opens
  useEffect(() => {
    if (!open) return;
    setLoading(true);
    apiClient.getNotifications({ per_page: 15 })
      .then(({ notifications }) => setNotifications(notifications))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [open]);

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const handleMarkAllRead = async () => {
    try {
      await apiClient.markAllNotificationsRead();
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
      setUnreadCount(0);
    } catch {
      // ignore
    }
  };

  const handleClickNotification = async (n: AdminNotification) => {
    if (!n.read) {
      apiClient.markNotificationRead(n.id).catch(() => {});
      setNotifications(prev => prev.map(x => x.id === n.id ? { ...x, read: true } : x));
      setUnreadCount(prev => Math.max(0, prev - 1));
    }
    setOpen(false);
    navigate(getNavTarget(n));
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setOpen(prev => !prev)}
        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
        aria-expanded={open}
        aria-haspopup="true"
        className={`relative rounded-md border p-2 transition ${
          open
            ? 'border-cyan-400/50 bg-cyan-400/10 text-cyan-200'
            : 'border-white/10 bg-slate-900/70 text-slate-400 hover:border-cyan-400/40 hover:text-cyan-200'
        }`}
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full border border-slate-950 bg-rose-500 px-1 text-[10px] font-bold text-white">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div role="menu" aria-label="Notifications" className="absolute right-0 top-full z-50 mt-2 w-[380px] animate-scale-in overflow-hidden rounded-xl border border-white/15 bg-slate-900/95 shadow-2xl backdrop-blur-xl">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
            <h3 className="text-sm font-semibold text-slate-100">Notifications</h3>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                className="flex items-center gap-1 text-xs font-medium text-cyan-300 hover:text-cyan-200 transition"
              >
                <Check className="h-3 w-3" />
                Mark all as read
              </button>
            )}
          </div>

          {/* List */}
          <div className="max-h-[400px] overflow-y-auto">
            {loading ? (
              <div className="py-8 text-center text-sm text-slate-500">Loading...</div>
            ) : notifications.length === 0 ? (
              <div className="py-8 text-center">
                <Bell className="mx-auto mb-2 h-8 w-8 text-slate-600" />
                <p className="text-sm text-slate-500">No notifications yet</p>
              </div>
            ) : (
              notifications.map(n => {
                const mapping = ICON_MAP[n.type] || ICON_MAP['user.created'];
                const Icon = mapping.icon;
                return (
                  <button
                    key={n.id}
                    onClick={() => handleClickNotification(n)}
                    className={`flex w-full items-start gap-3 px-4 py-3 text-left transition hover:bg-slate-800/60 ${
                      !n.read ? 'bg-cyan-400/[0.03]' : ''
                    }`}
                  >
                    <div className={`mt-0.5 flex-shrink-0 ${mapping.color}`}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium text-slate-200">{n.title}</span>
                        {!n.read && (
                          <span className="h-2 w-2 flex-shrink-0 rounded-full bg-cyan-400" />
                        )}
                      </div>
                      <p className="mt-0.5 truncate text-xs text-slate-400">{n.message}</p>
                      <p className="mt-1 text-[11px] text-slate-500">{formatRelativeTime(n.created_at)}</p>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
