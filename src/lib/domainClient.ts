import { authCsrfToken } from './authClient';

export class DomainApiError extends Error {
  constructor(message: string, public readonly code?: string, public readonly status?: number) { super(message); }
}

function idempotencyKey(scope: string) {
  const random = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `majal-${scope}-${random}`;
}

async function request<T>(url: string, init: RequestInit = {}, idempotencyScope?: string): Promise<T> {
  const method = (init.method || 'GET').toUpperCase();
  const response = await fetch(url, {
    ...init,
    credentials: 'same-origin',
    headers: {
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(!['GET', 'HEAD'].includes(method) ? { 'X-CSRF-Token': authCsrfToken() } : {}),
      ...(idempotencyScope ? { 'Idempotency-Key': idempotencyKey(idempotencyScope) } : {}),
      ...init.headers
    }
  });
  if (response.status === 204) return undefined as T;
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new DomainApiError(payload.error || 'تعذّر إكمال العملية على الخادم.', payload.code, response.status);
  return payload as T;
}

export const domainClient = {
  snapshot: () => request<{ products: any[]; collaborations: any[]; creators?: any[]; organizations?: any[]; marketLaunches?: any[] }>('/api/v1/domain/snapshot'),
  profiles: () => request<any[]>('/api/v1/domain/profiles'),
  listOrganizations: () => request<any[]>('/api/v1/domain/organizations'),
  createProduct: (body: unknown) => request<{id:string;recipeVersionId:string;status:string;recipeSha256:string}>('/api/v1/domain/products', { method: 'POST', body: JSON.stringify(body) }, 'product'),
  requestRecipeAccess: (body: unknown) => request<{id:string;status:string;disclosureLevel?:number;collaborationId?:string}>('/api/v1/domain/recipe-access', { method: 'POST', body: JSON.stringify(body) }, 'recipe-access'),
  approveRecipeAccess: (id: string, body: unknown) => request<any>(`/api/v1/domain/recipe-access/${encodeURIComponent(id)}/approve`, { method: 'POST', body: JSON.stringify(body) }),
  revokeRecipeAccess: (id: string) => request<any>(`/api/v1/domain/recipe-access/${encodeURIComponent(id)}/revoke`, { method: 'POST', body: '{}' }),
  createOffer: (collaborationId: string, body: unknown) => request<any>(`/api/v1/domain/collaborations/${encodeURIComponent(collaborationId)}/offers`, { method:'POST', body: JSON.stringify(body) }, 'offer'),
  acceptOffer: (collaborationId: string, offerId: string) => request<any>(`/api/v1/domain/collaborations/${encodeURIComponent(collaborationId)}/offers/${encodeURIComponent(offerId)}/accept`, { method:'POST', body:'{}' }, 'offer-accept'),
  signContract: (contractId: string, paciRequestId: string) => request<any>(`/api/v1/domain/contracts/${encodeURIComponent(contractId)}/sign`, { method:'POST', body: JSON.stringify({ paciRequestId }) }),
  prepareLaunch: (collaborationId: string) => request<any>(`/api/v1/domain/collaborations/${encodeURIComponent(collaborationId)}/launch`, { method:'POST', body:'{}' }),
  setLaunchGate: (collaborationId: string, key: string, value: boolean, evidence: unknown = {}) => request<any>(`/api/v1/domain/collaborations/${encodeURIComponent(collaborationId)}/launch-gate/${encodeURIComponent(key)}`, { method:'PUT', body: JSON.stringify({ value, evidence }) }),
  activateLaunch: (collaborationId: string) => request<any>(`/api/v1/domain/collaborations/${encodeURIComponent(collaborationId)}/launch/activate`, { method:'POST', body:'{}' }),
  approveSettlement: (creatorId: string) => request<any>(`/api/v1/domain/settlements/${encodeURIComponent(creatorId)}/approve`, { method:'POST', body:'{}' }, 'settlement'),

  // دورة الشراء والتقييم. السعر يُحسب على الخادم من العرض المعتمد، فلا يُرسل من هنا إطلاقاً.
  placeOrder: (launchId: string, units: number) => request<{ order: { id: string; units: number; unitPriceFils: number; totalFils: number; status: string }; checkoutUrl: string | null; paymentStatus: string | null; replayed?: boolean }>('/api/v1/orders', { method: 'POST', body: JSON.stringify({ launchId, units }) }, 'order'),
  myOrders: () => request<{ orders: any[] }>('/api/v1/orders'),
  submitReview: (orderId: string, body: unknown) => request<{ review: any }>(`/api/v1/orders/${encodeURIComponent(orderId)}/review`, { method: 'POST', body: JSON.stringify(body) }),
  launchReviews: (launchId: string) => request<{ summary: { count: number; taste: number; value: number; portion: number; keepItPercent: number }; reviews: any[] }>(`/api/v1/public/launches/${encodeURIComponent(launchId)}/reviews`),
};

/** إجراءات الإشراف الإدارية — كلها تتطلب سبباً مكتوباً يُحفظ في سجل التدقيق. */
export const moderationClient = {
  changeUserRole: (userId: string, role: string, reason: string) => request<{ user: { id: string; role: string; status: string }; changed: boolean }>(`/api/v1/moderation/users/${encodeURIComponent(userId)}/role`, { method: 'POST', body: JSON.stringify({ role, reason }) }),
  setUserStatus: (userId: string, status: string, reason: string) => request<{ user: { id: string; role: string; status: string }; changed: boolean }>(`/api/v1/moderation/users/${encodeURIComponent(userId)}/status`, { method: 'POST', body: JSON.stringify({ status, reason }) }),
  pauseProduct: (productId: string, reason: string) => request<{ product: { id: string; status: string }; pausedLaunches: number }>(`/api/v1/moderation/products/${encodeURIComponent(productId)}/pause`, { method: 'POST', body: JSON.stringify({ reason }) }),
  resumeProduct: (productId: string, reason: string) => request<{ product: { id: string; status: string }; note: string }>(`/api/v1/moderation/products/${encodeURIComponent(productId)}/resume`, { method: 'POST', body: JSON.stringify({ reason }) }),
  actions: (targetType?: 'USER' | 'PRODUCT') => request<{ actions: any[] }>(`/api/v1/moderation/actions${targetType ? `?targetType=${targetType}` : ''}`),
};
