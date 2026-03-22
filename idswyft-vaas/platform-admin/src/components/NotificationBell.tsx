import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Bell } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import platformApi from '../services/api';
import { getStatusAccent, monoXs } from '../styles/tokens';

interface Notification {
  id: string;
  type: string;
  severity: string;
  title: string;
  message: string;
  read: boolean;
  created_at: string;
}

export default function NotificationBell() {
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const navigate = useNavigate();

  // Fetch unread count
  const fetchUnreadCount = useCallback(async () => {
    try {
      const count = await platformApi.getUnreadCount();
      setUnreadCount(count);
    } catch {
      // silent
    }
  }, []);

  // Fetch recent notifications for dropdown
  const fetchRecent = useCallback(async () => {
    setLoading(true);
    try {
      const { notifications: items } = await platformApi.listNotifications({ per_page: 8, page: 1 });
      setNotifications(items);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  // SSE connection
  useEffect(() => {
    const token = platformApi.getToken();
    if (!token) return;

    const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3002/api/platform';
    const url = `${API_BASE}/notifications/stream?token=${encodeURIComponent(token)}`;

    try {
      const es = new EventSource(url);
      eventSourceRef.current = es;

      es.onmessage = (event) => {
        try {
          const notification: Notification = JSON.parse(event.data);
          setNotifications((prev) => [notification, ...prev].slice(0, 8));
          setUnreadCount((prev) => prev + 1);
        } catch {
          // ignore malformed
        }
      };

      es.onerror = () => {
        // Fallback to polling on SSE failure
        es.close();
        eventSourceRef.current = null;
        if (!pollRef.current) {
          pollRef.current = setInterval(fetchUnreadCount, 30_000);
        }
      };
    } catch {
      // SSE not supported, use polling
      pollRef.current = setInterval(fetchUnreadCount, 30_000);
    }

    // Initial fetch
    fetchUnreadCount();

    return () => {
      eventSourceRef.current?.close();
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [fetchUnreadCount]);

  // Fetch recent when dropdown opens
  useEffect(() => {
    if (dropdownOpen) fetchRecent();
  }, [dropdownOpen, fetchRecent]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleMarkAllRead = async () => {
    try {
      await platformApi.markAllNotificationsRead();
      setUnreadCount(0);
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    } catch {
      // silent
    }
  };

  const timeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setDropdownOpen(!dropdownOpen)}
        className="relative rounded-lg border border-white/10 bg-slate-900/60 p-2 text-slate-400 transition hover:border-cyan-400/40 hover:text-cyan-200"
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {dropdownOpen && (
        <div className="absolute right-0 top-full z-[60] mt-2 w-80 animate-scale-in">
          <div className="rounded-xl border border-white/10 shadow-2xl backdrop-blur-xl" style={{ background: 'rgba(11, 17, 32, 0.98)' }}>
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
              <span className="text-sm font-semibold text-slate-100">Notifications</span>
              {unreadCount > 0 && (
                <button
                  onClick={handleMarkAllRead}
                  className="text-xs text-cyan-400 hover:text-cyan-300"
                >
                  Mark all read
                </button>
              )}
            </div>

            <div className="max-h-96 overflow-y-auto">
              {loading && notifications.length === 0 ? (
                <div className="flex items-center justify-center py-8">
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-cyan-400 border-t-transparent" />
                </div>
              ) : notifications.length === 0 ? (
                <div className="py-8 text-center text-sm text-slate-500">
                  No notifications yet
                </div>
              ) : (
                notifications.map((n) => {
                  const accent = getStatusAccent(n.severity);
                  return (
                    <div
                      key={n.id}
                      className={`border-b border-white/5 px-4 py-3 transition hover:bg-white/5 ${!n.read ? 'bg-cyan-500/5' : ''}`}
                    >
                      <div className="flex items-start gap-2">
                        <div className={`mt-1.5 h-2 w-2 flex-shrink-0 rounded-full ${accent.pill.split(' ')[0].replace('bg-', 'bg-').replace('/15', '')}`} />
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium text-slate-200 truncate">{n.title}</div>
                          <div className="mt-0.5 text-xs text-slate-400 line-clamp-2">{n.message}</div>
                          <div className={`mt-1 ${monoXs} text-slate-500`}>{timeAgo(n.created_at)}</div>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="border-t border-white/10 px-4 py-2">
              <button
                onClick={() => {
                  setDropdownOpen(false);
                  navigate('/notifications');
                }}
                className="w-full text-center text-xs text-cyan-400 hover:text-cyan-300"
              >
                View all notifications
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
