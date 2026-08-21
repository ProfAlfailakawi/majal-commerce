import { authCsrfToken } from './authClient';

export interface PaciAuthRequest {
  requestId: string;
  status: 'PENDING';
  expiresAt: string;
  deepLink?: string | null;
  qrPayload?: string | null;
  legalEffect: string;
}

async function post<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: 'POST', credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': authCsrfToken() },
    body: JSON.stringify(body)
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || 'تعذّر الاتصال بخدمة PACI.');
  return payload as T;
}

export const paciClient = {
  requestAuth: (civilId: string, purpose: 'AUTHENTICATION' | 'CONTRACT_SIGNATURE') =>
    post<PaciAuthRequest>('/api/v1/paci/request-auth', { civilId, purpose }),
  verifyStatus: (requestId: string) =>
    post<{id:string;purpose:string;status:string;expires_at:string;verified:boolean;legalEffect:string}>('/api/v1/paci/verify-status', { authRequestId: requestId })
};
