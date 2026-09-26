import { idempotencyKey, request } from './domainClient';

/*
 * Client for the server-authoritative checkout and Drop operations. Prices, fees, stock and
 * compliance status all come from the server; nothing here computes money that is charged.
 */

export interface CheckoutBranch {
  id: string; name: string; area: string | null;
  deliveryZones: { id: string; nameAr: string; feeFils: number; etaMinutes: number }[];
  pickupSlots: { id: string; label: string; available: boolean }[];
  remainingUnits: number | null; orderingOpen: boolean;
}
export interface CheckoutOptions { launchId: string; unitPriceFils: number | null; holdMinutes: number; quantityCap: number | null; remainingUnits: number | null; branches: CheckoutBranch[] }
export interface TrustItem { key: string; labelAr: string; status: 'PASS' | 'EXPIRING' | 'DECLARED' | 'PENDING_REVIEW' | 'EXPIRED' | 'MISSING'; expiresAt: string | null; detail: string }
export interface TrustChecklist { launchId: string; items: TrustItem[]; allPassed: boolean; checkedAt: string }
export interface PlaceOrderInput { launchId: string; units: number; contactPhone: string; branchId?: string; fulfillmentType: 'PICKUP' | 'DELIVERY'; deliveryZoneId?: string; pickupSlotId?: string }
export interface PlacedOrder { order: { id: string; units: number; unitPriceFils: number; totalFils: number; deliveryFeeFils: number; status: string }; checkoutUrl: string | null; paymentStatus: string | null; holdExpiresAt: string | null; replayed?: boolean }
export interface StatementLine {
  accrualId: string; orderId: string; productName: string; units: number; orderedAt: string;
  grossFils: number; commissionFils: number; hostShareFils: number; creatorPayoutFils: number;
  stage: 'PENDING' | 'APPROVED' | 'PAID' | 'REVERSED';
  timeline: { pendingAt: string; approvedAt: string | null; paidAt: string | null };
  providerReference: string | null;
}
export interface CreatorStatement { creatorId: string; currency: 'KWD'; lines: StatementLine[]; totals: Record<'grossFils' | 'commissionFils' | 'hostShareFils' | 'creatorPayoutFils' | 'pendingFils' | 'approvedFils' | 'paidFils', number> }
export interface WarRoomBranch { branchId: string; name: string; configured: boolean; capacityUnits?: number; reservedUnits?: number; remainingUnits?: number; utilizationPct?: number; level?: 'OK' | 'WARNING' | 'CUTOFF'; manualCutoff?: boolean; alertThresholdPct?: number }
export interface WarRoom {
  organizationId: string;
  launches: { launchId: string; title: string; status: string; pendingPaymentOrders: number; paidAwaitingFulfilment: number; branches: WarRoomBranch[] }[];
  alerts: { launchId: string; branchId: string; level: 'WARNING' | 'CUTOFF'; messageAr: string }[];
  cannedReplies: { id: string; titleAr: string; bodyAr: string }[];
}

/** One key per checkout attempt: a retried submit replays the same order instead of a second one. */
export const newCheckoutKey = () => idempotencyKey('checkout');

const enc = encodeURIComponent;
export const commerceClient = {
  checkoutOptions: (launchId: string) => request<CheckoutOptions>(`/api/v1/public/launches/${enc(launchId)}/checkout-options`),
  trust: (launchId: string) => request<TrustChecklist>(`/api/v1/public/launches/${enc(launchId)}/trust`),
  placeOrder: (input: PlaceOrderInput, key: string) => request<PlacedOrder>('/api/v1/orders', { method: 'POST', body: JSON.stringify(input) }, undefined, key),
  joinWaitlist: (launchId: string, phone: string) => request<{ waitlisted: boolean; waiting: number }>(`/api/v1/commerce/launches/${enc(launchId)}/waitlist`, { method: 'POST', body: JSON.stringify({ phone, whatsappOptIn: true }) }),
  leaveWaitlist: (launchId: string) => request<{ waitlisted: boolean }>(`/api/v1/commerce/launches/${enc(launchId)}/waitlist`, { method: 'DELETE' }),
  myWaitlist: () => request<{ launchIds: string[] }>('/api/v1/commerce/waitlist/mine'),
  follow: (creatorId: string) => request<{ following: boolean }>(`/api/v1/commerce/creators/${enc(creatorId)}/follow`, { method: 'POST', body: '{}' }),
  unfollow: (creatorId: string) => request<{ following: boolean }>(`/api/v1/commerce/creators/${enc(creatorId)}/follow`, { method: 'DELETE' }),
  follows: () => request<{ follows: { creatorId: string; alerts: boolean }[] }>('/api/v1/commerce/follows'),
  statement: () => request<CreatorStatement>('/api/v1/commerce/creator/statement'),
  statementCsvUrl: '/api/v1/commerce/creator/statement.csv',
  warRoom: () => request<WarRoom>('/api/v1/commerce/host/war-room'),
  setBranchStock: (launchId: string, branchId: string, body: { capacityUnits: number; alertThresholdPct?: number; manualCutoff?: boolean }) =>
    request<WarRoomBranch>(`/api/v1/commerce/launches/${enc(launchId)}/branches/${enc(branchId)}/stock`, { method: 'PUT', body: JSON.stringify(body) }),
};

/** Mirrors server/checkout.ts normalizeKuwaitPhone for instant feedback; the server re-validates. */
export function normalizeKuwaitPhone(value: string): string | undefined {
  const match = /^(?:\+965|00965|965)?([24569]\d{7})$/.exec(value.replace(/[\s\-()]/g, ''));
  return match ? `+965${match[1]}` : undefined;
}
