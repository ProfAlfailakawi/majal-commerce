import { authCsrfToken } from './authClient';
import { IS_DEMO_MODE } from './runtime';
import { demoShowcase } from '../data/demoShowcase';
import type { AdCampaign, AdSlot, BusinessListing, DirectorySupplier, PublicAd } from '../types/majal';

export class ShowcaseApiError extends Error {
  constructor(message: string, public readonly code?: string, public readonly status?: number) { super(message); }
}

async function request<T>(path: string, init: RequestInit = {}) {
  const method = (init.method || 'GET').toUpperCase();
  const response = await fetch(`/api/v1/showcase${path}`, {
    ...init,
    credentials: 'same-origin',
    headers: {
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(!['GET', 'HEAD'].includes(method) ? { 'X-CSRF-Token': authCsrfToken() } : {}),
      ...init.headers
    }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new ShowcaseApiError(payload.error || 'تعذّر إكمال الطلب.', payload.code, response.status);
  return payload as T;
}

export interface BusinessSubmission {
  title: string; sector: string; city: string; summary: string; sellerName: string; contactPhone: string;
  contactPublic: boolean; termsAccepted: boolean; highlights?: string[]; includes?: string[];
  askingPriceKwd?: number | null; revenueBand?: string; yearsOperating?: number | null; reason?: string; website?: string;
}
export interface AdRequest { company: string; headline: string; tagline?: string; linkUrl: string; contactPhone: string; slot?: AdSlot; accent?: string; icon?: string; audiences?: string[]; topics?: string[]; website?: string }

export const fetchBusinesses = (): Promise<{ listings: BusinessListing[] }> => IS_DEMO_MODE ? demoShowcase.businesses() : request('/businesses');
export const submitBusiness = (input: BusinessSubmission): Promise<{ id: string; reportToken?: string; message: string }> =>
  IS_DEMO_MODE ? demoShowcase.submitBusiness(input as never) : request('/businesses', { method: 'POST', body: JSON.stringify(input) });
export const requestAdSlot = (input: AdRequest): Promise<{ id: string; reportToken: string; message: string }> =>
  IS_DEMO_MODE ? demoShowcase.requestAd(input) : request('/promo/requests', { method: 'POST', body: JSON.stringify(input) });
export const fetchAds = (slot: AdSlot, audience: string = 'VISITOR', topic?: string): Promise<{ ads: PublicAd[] }> =>
  IS_DEMO_MODE ? demoShowcase.serve(slot, audience, topic) : request(`/promo/serve?slot=${slot}&audience=${encodeURIComponent(audience)}${topic ? `&topic=${encodeURIComponent(topic)}` : ''}`);
export const reportAdImpression = (id: string, audience: string = 'VISITOR') => {
  if (IS_DEMO_MODE) return demoShowcase.event(id, 'impression');
  void fetch('/api/v1/showcase/promo/event', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, type: 'impression', audience }), keepalive: true }).catch(() => undefined);
};
/** Clicks go through the server so they are counted and the target is the approved link. */
export const adClickHref = (id: string, audience: string = 'VISITOR', demo = IS_DEMO_MODE) => (demo ? 'https://example.com/demo' : `/api/v1/showcase/promo/click/${encodeURIComponent(id)}?a=${encodeURIComponent(audience)}`);
export const noteDemoAdClick = (id: string) => { if (IS_DEMO_MODE) demoShowcase.event(id, 'click'); };

export const fetchAdReport = (token: string): Promise<AdReport> => request(`/promo/report/${encodeURIComponent(token)}`);
export interface AdReport {
  campaign: { company: string; headline: string; slot: AdSlot; status: string; phase?: string; daysLeft?: number | null; startsOn: string | null; endsOn: string | null };
  totals: { impressions: number; clicks: number }; audiences?: { audience: string; impressions: number; clicks: number }[]; ctr: number; days: { day: string; impressions: number; clicks: number }[]; note: string;
}

export const fetchShowcaseOverview = (): Promise<{ listings: BusinessListing[]; campaigns: AdCampaign[]; suppliers: DirectorySupplier[] }> => IS_DEMO_MODE ? demoShowcase.overview() : request('/admin/overview');
export const reviewBusiness = (id: string, decision: 'APPROVED' | 'REJECTED' | 'SOLD', adminNote = ''): Promise<{ listing: BusinessListing }> =>
  IS_DEMO_MODE ? demoShowcase.reviewBusiness(id, decision, adminNote) : request(`/admin/businesses/${encodeURIComponent(id)}/review`, { method: 'POST', body: JSON.stringify({ decision, adminNote }) });
export const setCampaignStatus = (id: string, status: 'APPROVED' | 'PAUSED' | 'REJECTED', dates: { startsOn?: string | null; endsOn?: string | null } = {}): Promise<{ campaign: AdCampaign }> =>
  IS_DEMO_MODE ? demoShowcase.setCampaignStatus(id, status, dates) : request(`/admin/campaigns/${encodeURIComponent(id)}/status`, { method: 'POST', body: JSON.stringify({ status, ...dates }) });
export const createCampaign = (input: { company: string; headline: string; tagline?: string; linkUrl: string; slot: AdSlot; accent?: string; icon?: string; contactPhone?: string; startsOn?: string | null; endsOn?: string | null; audiences?: string[]; topics?: string[] }): Promise<{ campaign: AdCampaign; reportToken: string }> =>
  IS_DEMO_MODE ? demoShowcase.requestAd({ ...input, contactPhone: input.contactPhone || '' }).then(r => ({ campaign: {} as AdCampaign, reportToken: r.reportToken })) : request('/admin/campaigns', { method: 'POST', body: JSON.stringify(input) });

/** Image creative: PNG/JPEG/WebP, ≤ 300 KB. The server sniffs the real type and size. */
export const uploadCampaignImage = async (id: string, file: File): Promise<{ width: number; height: number }> => {
  if (IS_DEMO_MODE) throw new ShowcaseApiError('رفع الصور غير متاح في العرض التجريبي.');
  const response = await fetch(`/api/v1/showcase/admin/campaigns/${encodeURIComponent(id)}/image`, {
    method: 'POST', credentials: 'same-origin', body: file,
    headers: { 'Content-Type': file.type || 'application/octet-stream', 'X-CSRF-Token': authCsrfToken() }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new ShowcaseApiError(payload.error || 'تعذّر رفع الصورة.', payload.code, response.status);
  return payload;
};
export const removeCampaignImage = (id: string) => IS_DEMO_MODE ? Promise.resolve({ ok: true }) : request<{ ok: boolean }>(`/admin/campaigns/${encodeURIComponent(id)}/image/remove`, { method: 'POST' });
export const rotateReportLink = (id: string): Promise<{ reportToken: string }> =>
  IS_DEMO_MODE ? Promise.resolve({ reportToken: 'demo-report-token-not-real' }) : request(`/admin/campaigns/${encodeURIComponent(id)}/rotate-report`, { method: 'POST' });
export const adImageSrc = (id: string) => `/api/v1/showcase/promo/img/${encodeURIComponent(id)}`;

export interface SupplierSubmission {
  name: string; category: string; region: string; description: string; contactName: string; contactPhone: string;
  contactPublic: boolean; termsAccepted: boolean; products?: string[]; minOrder?: string; delivers?: boolean; website?: string;
}
export const fetchDirectorySuppliers = (): Promise<{ suppliers: DirectorySupplier[] }> => IS_DEMO_MODE ? demoShowcase.suppliers() : request('/suppliers');
export const submitDirectorySupplier = (input: SupplierSubmission): Promise<{ id: string; reportToken?: string; message: string }> =>
  IS_DEMO_MODE ? demoShowcase.submitSupplier(input as never) : request('/suppliers', { method: 'POST', body: JSON.stringify(input) });
export const reviewDirectorySupplier = (id: string, decision: 'APPROVED' | 'REJECTED', adminNote = ''): Promise<{ supplier: DirectorySupplier }> =>
  IS_DEMO_MODE ? demoShowcase.reviewSupplier(id, decision, adminNote) : request(`/admin/suppliers/${encodeURIComponent(id)}/review`, { method: 'POST', body: JSON.stringify({ decision, adminNote }) });
export const setCampaignTargeting = (id: string, audiences: string[], topics: string[]): Promise<{ campaign: AdCampaign; pausedForReview: boolean }> =>
  IS_DEMO_MODE ? demoShowcase.setTargeting(id, audiences, topics) : request(`/admin/campaigns/${encodeURIComponent(id)}/targeting`, { method: 'POST', body: JSON.stringify({ audiences, topics }) });
export const editCampaign = (id: string, input: { company: string; headline: string; tagline?: string; linkUrl: string; slot: AdSlot; accent?: string; icon?: string }): Promise<{ campaign: AdCampaign; pausedForReview: boolean }> =>
  IS_DEMO_MODE ? demoShowcase.editCampaign(id, input) : request(`/admin/campaigns/${encodeURIComponent(id)}/edit`, { method: 'POST', body: JSON.stringify(input) });
export const setCampaignBilling = (id: string, billing: 'UNSET' | 'PAID' | 'COMPLIMENTARY', priceKwd: number | null, note = ''): Promise<{ campaign: AdCampaign; pausedForReview: boolean }> =>
  IS_DEMO_MODE ? demoShowcase.setBilling(id, billing, priceKwd, note) : request(`/admin/campaigns/${encodeURIComponent(id)}/billing`, { method: 'POST', body: JSON.stringify({ billing, priceKwd, note }) });
