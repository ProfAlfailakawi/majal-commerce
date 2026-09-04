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
  snapshot: () => request<{products: unknown[]; collaborations: unknown[]}>('/api/v1/domain/snapshot'),
  createProduct: (body: unknown) => request<{id:string;recipeVersionId:string;status:string;recipeSha256:string}>('/api/v1/domain/products', { method: 'POST', body: JSON.stringify(body) }, 'product'),
  requestRecipeAccess: (body: unknown) => request<{id:string;status:string}>('/api/v1/domain/recipe-access', { method: 'POST', body: JSON.stringify(body) }, 'recipe-access'),
  approveRecipeAccess: (id: string, body: unknown) => request<any>(`/api/v1/domain/recipe-access/${encodeURIComponent(id)}/approve`, { method: 'POST', body: JSON.stringify(body) }),
  revokeRecipeAccess: (id: string) => request<any>(`/api/v1/domain/recipe-access/${encodeURIComponent(id)}/revoke`, { method: 'POST', body: '{}' }),
  createOffer: (collaborationId: string, body: unknown) => request<any>(`/api/v1/domain/collaborations/${encodeURIComponent(collaborationId)}/offers`, { method:'POST', body: JSON.stringify(body) }, 'offer'),
  acceptOffer: (collaborationId: string, offerId: string) => request<any>(`/api/v1/domain/collaborations/${encodeURIComponent(collaborationId)}/offers/${encodeURIComponent(offerId)}/accept`, { method:'POST', body:'{}' }, 'offer-accept'),
  signContract: (contractId: string, paciRequestId: string) => request<any>(`/api/v1/domain/contracts/${encodeURIComponent(contractId)}/sign`, { method:'POST', body: JSON.stringify({ paciRequestId }) }),
  prepareLaunch: (collaborationId: string) => request<any>(`/api/v1/domain/collaborations/${encodeURIComponent(collaborationId)}/launch`, { method:'POST', body:'{}' }),
  setLaunchGate: (collaborationId: string, key: string, value: boolean, evidence: unknown = {}) => request<any>(`/api/v1/domain/collaborations/${encodeURIComponent(collaborationId)}/launch-gate/${encodeURIComponent(key)}`, { method:'PUT', body: JSON.stringify({ value, evidence }) }),
  activateLaunch: (collaborationId: string) => request<any>(`/api/v1/domain/collaborations/${encodeURIComponent(collaborationId)}/launch/activate`, { method:'POST', body:'{}' }),
  approveSettlement: (creatorId: string) => request<any>(`/api/v1/domain/settlements/${encodeURIComponent(creatorId)}/approve`, { method:'POST', body:'{}' }, 'settlement'),
  listLaunches: () => request<{launches: any[]}>('/api/v1/domain/launches'),
  listMyOrders: () => request<{orders: any[]}>('/api/v1/domain/me/orders'),
  listLaunchReviews: (launchId: string) => request<any>(`/api/v1/domain/launches/${encodeURIComponent(launchId)}/reviews`),
  createOrder: (launchId: string, units: number) => request<any>(`/api/v1/domain/launches/${encodeURIComponent(launchId)}/orders`, { method:'POST', body: JSON.stringify({ units }) }, 'order'),
  createReview: (launchId: string, body: { tasteRating: number; wouldBuyAgain: boolean; keepItVote: boolean; comment?: string }) => request<any>(`/api/v1/domain/launches/${encodeURIComponent(launchId)}/reviews`, { method:'POST', body: JSON.stringify(body) }, 'review'),
};
