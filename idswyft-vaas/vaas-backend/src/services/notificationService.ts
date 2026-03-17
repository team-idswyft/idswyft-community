import { vaasSupabase } from '../config/database.js';
import { VaasAdminNotification, VaasNotificationType } from '../types/index.js';

export class NotificationService {
  async create(params: {
    organizationId: string;
    type: VaasNotificationType;
    title: string;
    message: string;
    metadata?: Record<string, any>;
  }): Promise<void> {
    try {
      await vaasSupabase
        .from('vaas_admin_notifications')
        .insert({
          organization_id: params.organizationId,
          type: params.type,
          title: params.title,
          message: params.message,
          metadata: params.metadata || {},
        });
    } catch (err: any) {
      // Fire-and-forget — notification failures must never block business logic
      console.error('[NotificationService] Failed to create notification:', err.message);
    }
  }

  async list(
    organizationId: string,
    params?: { read?: boolean; page?: number; per_page?: number }
  ): Promise<{ notifications: VaasAdminNotification[]; total: number }> {
    const page = params?.page || 1;
    const perPage = Math.min(params?.per_page || 20, 50);
    const offset = (page - 1) * perPage;

    let query = vaasSupabase
      .from('vaas_admin_notifications')
      .select('*', { count: 'exact' })
      .eq('organization_id', organizationId);

    if (params?.read !== undefined) {
      query = query.eq('read', params.read);
    }

    const { data, count, error } = await query
      .order('created_at', { ascending: false })
      .range(offset, offset + perPage - 1);

    if (error) {
      throw new Error(`Failed to list notifications: ${error.message}`);
    }

    return { notifications: data || [], total: count || 0 };
  }

  async unreadCount(organizationId: string): Promise<number> {
    const { count, error } = await vaasSupabase
      .from('vaas_admin_notifications')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .eq('read', false);

    if (error) {
      console.error('[NotificationService] Failed to get unread count:', error.message);
      return 0;
    }

    return count || 0;
  }

  async markRead(organizationId: string, notificationId: string): Promise<void> {
    const { error } = await vaasSupabase
      .from('vaas_admin_notifications')
      .update({ read: true })
      .eq('id', notificationId)
      .eq('organization_id', organizationId);

    if (error) {
      throw new Error(`Failed to mark notification as read: ${error.message}`);
    }
  }

  async markAllRead(organizationId: string): Promise<void> {
    const { error } = await vaasSupabase
      .from('vaas_admin_notifications')
      .update({ read: true })
      .eq('organization_id', organizationId)
      .eq('read', false);

    if (error) {
      throw new Error(`Failed to mark all notifications as read: ${error.message}`);
    }
  }
}

export const notificationService = new NotificationService();
