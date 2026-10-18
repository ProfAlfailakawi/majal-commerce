import { authCsrfToken } from './authClient';
import { IS_DEMO_MODE } from './runtime';
import type { AdAudience } from './adAudience';
import type { SurfaceType } from '../types/majal';
import { apiFetch } from './apiFetch';

export interface DailyPoint { day: string; browsers: number; views: number }
export interface Traffic {
  measuringSince: string | null;
  totals: { browsersToday: number; browsers7: number; browsers30: number; views7: number; views30: number };
  daily: DailyPoint[];
  bySurface: { key: string; visits: number }[];
  byAudience: { key: string; visits: number }[];
  browsersByAudience: { key: string; visits: number }[];
  /** Unique browsers per weekday over the window, Sunday = 0. */
  weekday: number[];
}
export interface PlatformFacts { creators: number; verifiedFacilities: number; verifiedSuppliers: number; liveLaunches: number; openJobs: number; businessesForSale: number; directorySuppliers: number }
export interface SlotLoad { slot: 'SPONSOR' | 'MARKET' | 'PORTAL'; capacity: number; live: number }
export interface GateTop { id: string; title: string; opens: number; contacts: number }
export interface AudienceOverview {
  traffic: Traffic; facts: PlatformFacts; slots: SlotLoad[];
  gates: { listingOpens: number; listingContacts: number; supplierContacts: number; topListings: GateTop[]; topSuppliers: GateTop[] };
  ads: { impressions: number; clicks: number; ctr: number; liveCampaigns: number };
  kit: { exists: boolean; createdAt?: string; rotatedAt?: string | null };
  /** Advertiser payments in whole KWD (owner-only). */
  revenue: { paid30: number; paidTotal: number; awaitingBilling: number; complimentary: number };
  /** True when these numbers are generated for the demo, never measured. */
  demo?: boolean;
}
export interface PartnerKit { traffic: Traffic; facts: PlatformFacts; slots: SlotLoad[]; free: true; demo?: boolean }

async function request<T>(path: string, init: RequestInit = {}) {
  const method = (init.method || 'GET').toUpperCase();
  const response = await apiFetch(`/api/v1/audience${path}`, {
    ...init, credentials: 'same-origin',
    headers: { ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...(method !== 'GET' ? { 'X-CSRF-Token': authCsrfToken() } : {}), ...init.headers }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || 'تعذّر إكمال الطلب.');
  return payload as T;
}

/* ───────── measurement: at most one report per browser per page per day ───────── */
const today = () => new Date(Date.now() + 3 * 3_600_000).toISOString().slice(0, 10);
const store = {
  get: (k: string) => { try { return window.localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string) => { try { window.localStorage.setItem(k, v); } catch { /* storage may be blocked: then we simply count nothing */ } },
};
const MEASURED = new Set<SurfaceType>(['PUBLIC', 'SHOWCASE', 'DIRECTORY', 'CONSUMER', 'CREATOR', 'HOST', 'SUPPLIER']);

/** Reports that this browser opened `surface` today. Never in demo (it has no server) and never for administrators. */
export function reportPageView(surface: SurfaceType, audience: AdAudience, isStaff: boolean) {
  if (IS_DEMO_MODE || isStaff || !MEASURED.has(surface) || typeof window === 'undefined') return;
  const day = today(), key = `aud:${day}:${surface}:${audience}`;
  if (store.get(key)) return;
  store.set(key, '1');
  const firstToday = !store.get(`aud:first:${day}`);
  if (firstToday) store.set(`aud:first:${day}`, '1');
  void fetch('/api/v1/audience/pulse', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ surface, audience, firstToday }), keepalive: true }).catch(() => undefined);
}

/** Opens and contact taps on listings/suppliers; deduplicated per browser per day. */
export function reportGateEvent(kind: 'listing_open' | 'listing_contact' | 'supplier_contact', id: string) {
  if (IS_DEMO_MODE || typeof window === 'undefined') return;
  const key = `aud:gate:${today()}:${kind}:${id}`;
  if (store.get(key)) return;
  store.set(key, '1');
  void fetch('/api/v1/audience/gate-event', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind, id }), keepalive: true }).catch(() => undefined);
}

/* ───────── demo numbers: deterministic and clearly labelled, never presented as measured ───────── */
function demoTraffic(): Traffic {
  const daily: DailyPoint[] = [];
  const rnd = (n: number) => { const x = Math.sin(n * 9301 + 49297) * 233280; return x - Math.floor(x); };
  for (let i = 29; i >= 0; i--) {
    const d = new Date(Date.now() + 3 * 3_600_000 - i * 86_400_000), dow = d.getUTCDay();
    const base = 55 + (29 - i) * 2.4 + (dow === 4 || dow === 5 ? 28 : 0) + rnd(i) * 22;
    daily.push({ day: d.toISOString().slice(0, 10), browsers: Math.round(base), views: Math.round(base * (2.2 + rnd(i + 7))) });
  }
  const sum = (n: number, k: 'browsers' | 'views') => daily.slice(-n).reduce((a, x) => a + x[k], 0);
  const weekday = new Array(7).fill(0) as number[];
  daily.forEach(d => { weekday[new Date(`${d.day}T00:00:00Z`).getUTCDay()] += d.browsers; });
  const split = (parts: [string, number][], total: number) => parts.map(([key, w]) => ({ key, visits: Math.round(total * w) }));
  return {
    measuringSince: daily[0].day,
    totals: { browsersToday: daily.at(-1)!.browsers, browsers7: sum(7, 'browsers'), browsers30: sum(30, 'browsers'), views7: sum(7, 'views'), views30: sum(30, 'views') },
    daily,
    bySurface: split([['CONSUMER', 0.34], ['PUBLIC', 0.22], ['SHOWCASE', 0.17], ['DIRECTORY', 0.12], ['HOST', 0.07], ['CREATOR', 0.06], ['SUPPLIER', 0.02]], sum(30, 'views')),
    byAudience: split([['VISITOR', 0.46], ['CONSUMER', 0.27], ['CREATOR', 0.11], ['HOST', 0.12], ['SUPPLIER', 0.04]], sum(30, 'views')),
    browsersByAudience: split([['VISITOR', 0.5], ['CONSUMER', 0.26], ['CREATOR', 0.1], ['HOST', 0.11], ['SUPPLIER', 0.03]], sum(30, 'browsers')),
    weekday,
  };
}
const demoFacts: PlatformFacts = { creators: 13, verifiedFacilities: 6, verifiedSuppliers: 3, liveLaunches: 12, openJobs: 6, businessesForSale: 6, directorySuppliers: 8 };
const demoSlots: SlotLoad[] = [{ slot: 'SPONSOR', capacity: 1, live: 1 }, { slot: 'MARKET', capacity: 3, live: 2 }, { slot: 'PORTAL', capacity: 3, live: 2 }];

export const fetchAudienceOverview = (): Promise<AudienceOverview> => IS_DEMO_MODE
  ? Promise.resolve({
    traffic: demoTraffic(), facts: demoFacts, slots: demoSlots, demo: true,
    gates: { listingOpens: 214, listingContacts: 37, supplierContacts: 52, topListings: [{ id: 'd1', title: 'مقهى مختص في حولي — جاهز للتشغيل', opens: 61, contacts: 12 }, { id: 'd2', title: 'مطبخ سحابي للوجبات البيتية', opens: 48, contacts: 9 }, { id: 'd3', title: 'مخبز حرفي بعلامة معروفة', opens: 39, contacts: 7 }], topSuppliers: [{ id: 's1', title: 'الندى للتغليف الغذائي', opens: 0, contacts: 18 }, { id: 's2', title: 'بهارات الديرة', opens: 0, contacts: 14 }] },
    ads: { impressions: 12_740, clicks: 514, ctr: 4, liveCampaigns: 5 }, revenue: { paid30: 1_150, paidTotal: 3_400, awaitingBilling: 1, complimentary: 0 }, kit: { exists: true, createdAt: new Date().toISOString() },
  })
  : request('/admin/overview');
export const rotatePartnerKit = (): Promise<{ token: string }> => IS_DEMO_MODE ? Promise.resolve({ token: 'demo-partner-kit-token-not-real' }) : request('/admin/kit/rotate', { method: 'POST', body: '{}' });
export const fetchPartnerKit = (token: string): Promise<PartnerKit> =>
  IS_DEMO_MODE ? Promise.resolve({ traffic: demoTraffic(), facts: demoFacts, slots: demoSlots, free: true, demo: true }) : request(`/partners/${encodeURIComponent(token)}`);

/* ───────── a seller's / supplier's own private numbers ───────── */
export interface GateReport {
  kind: 'listing' | 'supplier'; title: string; status: string;
  totals: { opens: number; contacts: number };
  daily: { day: string; opens: number; contacts: number }[]; note: string; demo?: boolean;
}
export const fetchGateReport = (token: string): Promise<GateReport> => {
  if (IS_DEMO_MODE) {
    const daily = demoTraffic().daily.map((d, i) => ({ day: d.day, opens: Math.round(d.browsers / 9) + (i % 3), contacts: i % 4 === 0 ? 2 : i % 5 === 0 ? 1 : 0 }));
    return Promise.resolve({ kind: 'listing', title: 'مشروعك التجريبي', status: 'APPROVED', totals: { opens: daily.reduce((a, d) => a + d.opens, 0), contacts: daily.reduce((a, d) => a + d.contacts, 0) }, daily, note: 'أرقام تجريبية مولّدة للعرض.', demo: true });
  }
  return request(`/gate-report/${encodeURIComponent(token)}`);
};
