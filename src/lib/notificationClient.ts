import { SurfaceType } from '../types/majal';
import { authCsrfToken } from './authClient';

export interface NotificationItem {
  id: string;
  category: string;
  priority: 'URGENT' | 'NOW' | 'SOON' | 'WATCH';
  title: string;
  body: string;
  action_label?: string | null;
  action_surface?: SurfaceType | null;
  occurrence_count: number;
  status: 'UNREAD' | 'READ';
  last_occurred_at: string;
}

export interface NotificationPage {
  items: NotificationItem[];
  unreadCount: number;
  nextCursor: string | null;
}

async function request<T>(url: string, init: RequestInit = {}) {
  const response = await fetch(url, {
    ...init,
    credentials: 'same-origin',
    headers: {
      ...(init.method && init.method !== 'GET' ? { 'X-CSRF-Token': authCsrfToken() } : {}),
      ...init.headers
    }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || 'تعذّر تحميل مركز القرار.');
  return payload as T;
}

export function fetchNotifications(limit = 20) {
  return request<NotificationPage>(`/api/v1/notifications?limit=${Math.max(1, Math.min(50, limit))}`);
}

export function markNotificationRead(id: string) {
  return request<{ updated: boolean }>(`/api/v1/notifications/${encodeURIComponent(id)}/read`, { method: 'POST' });
}

export function markAllNotificationsRead() {
  return request<{ updated: number }>('/api/v1/notifications/read-all', { method: 'POST' });
}
