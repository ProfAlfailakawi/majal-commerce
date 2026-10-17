import { authCsrfToken } from './authClient';
import { IS_DEMO_MODE } from './runtime';
import { demoShowcase } from '../data/demoShowcase';
import type { AdCampaign, AdSlot, BusinessListing, PublicAd } from '../types/majal';

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
export interface AdRequest { company: string; headline: string; tagline?: string; linkUrl: string; contactPhone: string; slot?: AdSlot; website?: string }

export const fetchBusinesses = (): Promise<{ listings: BusinessListing[] }> => IS_DEMO_MODE ? demoShowcase.businesses() : request('/businesses');
export const submitBusiness = (input: BusinessSubmission): Promise<{ id: string; message: string }> =>
  IS_DEMO_MODE ? demoShowcase.submitBusiness(input as never) : request('/businesses', { method: 'POST', body: JSON.stringify(input) });
export const requestAdSlot = (input: AdRequest): Promise<{ id: string; reportToken: string; message: string }> =>
  IS_DEMO_MODE ? demoShowcase.requestAd(input) : request('/ads/requests', { method: 'POST', body: JSON.stringify(input) });
export const fetchAds = (slot: AdSlot): Promise<{ ads: PublicAd[] }> => IS_DEMO_MODE ? demoShowcase.serve(slot) : request(`/ads/serve?slot=${slot}`);
export const reportAdImpression = (id: string) => {
  if (IS_DEMO_MODE) return demoShowcase.event(id, 'impression');
  void fetch('/api/v1/showcase/ads/event', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, type: 'impression' }), keepalive: true }).catch(() => undefined);
};
/** Clicks go through the server so they are counted and the target is the approved link. */
export const adClickHref = (id: string, demo = IS_DEMO_MODE) => (demo ? 'https://example.com/demo' : `/api/v1/showcase/ads/click/${encodeURIComponent(id)}`);
export const noteDemoAdClick = (id: string) => { if (IS_DEMO_MODE) demoShowcase.event(id, 'click'); };

export const fetchAdReport = (token: string): Promise<AdReport> => request(`/ads/report/${encodeURIComponent(token)}`);
export interface AdReport {
  campaign: { company: string; headline: string; slot: AdSlot; status: string; startsOn: string | null; endsOn: string | null };
  totals: { impressions: number; clicks: number }; ctr: number; days: { day: string; impressions: number; clicks: number }[]; note: string;
}

export const fetchShowcaseOverview = (): Promise<{ listings: BusinessListing[]; campaigns: AdCampaign[] }> => IS_DEMO_MODE ? demoShowcase.overview() : request('/admin/overview');
export const reviewBusiness = (id: string, decision: 'APPROVED' | 'REJECTED' | 'SOLD', adminNote = ''): Promise<{ listing: BusinessListing }> =>
  IS_DEMO_MODE ? demoShowcase.reviewBusiness(id, decision, adminNote) : request(`/admin/businesses/${encodeURIComponent(id)}/review`, { method: 'POST', body: JSON.stringify({ decision, adminNote }) });
export const setCampaignStatus = (id: string, status: 'APPROVED' | 'PAUSED' | 'REJECTED', dates: { startsOn?: string | null; endsOn?: string | null } = {}): Promise<{ campaign: AdCampaign }> =>
  IS_DEMO_MODE ? demoShowcase.setCampaignStatus(id, status, dates) : request(`/admin/campaigns/${encodeURIComponent(id)}/status`, { method: 'POST', body: JSON.stringify({ status, ...dates }) });
export const createCampaign = (input: { company: string; headline: string; tagline?: string; linkUrl: string; slot: AdSlot; accent?: string; icon?: string; contactPhone?: string; startsOn?: string | null; endsOn?: string | null }): Promise<{ campaign: AdCampaign; reportToken: string }> =>
  IS_DEMO_MODE ? demoShowcase.requestAd({ ...input, contactPhone: input.contactPhone || '' }).then(r => ({ campaign: {} as AdCampaign, reportToken: r.reportToken })) : request('/admin/campaigns', { method: 'POST', body: JSON.stringify(input) });
