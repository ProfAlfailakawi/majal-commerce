import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { Response, Router } from 'express';
import { rateLimit as expressRateLimit } from 'express-rate-limit';
import { AuthConfig, AuthenticatedRequest, requireAuth, requireCsrf } from './auth';
import express from 'express';
import { MajalDatabase, withTransaction } from './database';
import { creativeProblem, readImageMeta } from './image-meta';

/*
 * Showcase: (1) a free "business for sale" gate and (2) sponsor campaigns.
 *
 * Both follow the same rule as the jobs board: nothing a visitor submits is public until an
 * administrator approves it. Submissions need no account, so the public writes are rate
 * limited, carry a honeypot and never echo private fields back.
 */

export const BUSINESS_SECTORS = ['CAFE', 'RESTAURANT', 'BAKERY', 'CLOUD_KITCHEN', 'RETAIL', 'ONLINE_STORE', 'SALON', 'SERVICES', 'PRODUCTION', 'OTHER'] as const;
export const AD_SLOTS = ['SPONSOR', 'MARKET', 'PORTAL'] as const;
export const AD_ACCENTS = ['gold', 'emerald', 'sky', 'rose', 'violet'] as const;
export const AD_ICONS = ['megaphone', 'store', 'coffee', 'truck', 'package', 'sparkles', 'utensils', 'shopping-bag', 'printer', 'credit-card', 'leaf', 'gift'] as const;
/** How many approved campaigns may overlap in time in one slot. SPONSOR is exclusive. */
export const SLOT_CAPACITY: Record<(typeof AD_SLOTS)[number], number> = { SPONSOR: 1, MARKET: 3, PORTAL: 3 };

/** Everything but the (large) image payload. */
const CAMPAIGN_COLUMNS = 'id,company,headline,tagline,link_url,slot,accent,icon,contact_phone,status,starts_on,ends_on,admin_note,created_at,updated_at,image_mime';
const now = () => new Date().toISOString();
const text = (value: unknown, min = 1, max = 500) => {
  if (typeof value !== 'string') return undefined;
  const cleaned = value.trim().replace(/\s+/g, ' ');
  return cleaned.length >= min && cleaned.length <= max ? cleaned : undefined;
};
const jsonError = (res: Response, status: number, message: string, code: string) => res.status(status).json({ error: message, code });
const isAdmin = (req: AuthenticatedRequest) => ['ADMIN', 'SUPER_ADMIN'].includes(req.auth?.user.role || '');
const sha = (value: string) => createHash('sha256').update(value).digest('hex');
const oneOf = <T extends string>(value: unknown, list: readonly T[]): T | undefined => (typeof value === 'string' && (list as readonly string[]).includes(value) ? (value as T) : undefined);
const stringList = (value: unknown, maxItems: number, maxLen: number) =>
  Array.isArray(value) ? value.map(item => text(item, 1, maxLen)).filter((item): item is string => !!item).slice(0, maxItems) : [];
const parseList = (raw: string): string[] => {
  try { const parsed = JSON.parse(raw); return Array.isArray(parsed) ? parsed.map(String).slice(0, 20) : []; } catch { return []; }
};
/** Kuwait is UTC+3 all year; campaign dates are calendar days there. */
export const kuwaitToday = (at = new Date()) => new Date(at.getTime() + 3 * 3_600_000).toISOString().slice(0, 10);
const isDay = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
const optionalDay = (value: unknown): { value: string | null; valid: boolean } =>
  value === undefined || value === null || value === '' ? { value: null, valid: true } : isDay(value) ? { value, valid: true } : { value: null, valid: false };
/** Phone: digits with an optional leading +, 7–15 digits. Spaces and dashes are tolerated. */
const phoneOf = (value: unknown) => {
  const raw = text(value, 7, 24);
  if (!raw) return undefined;
  const compact = raw.replace(/[\s\-()]/g, '');
  return /^\+?\d{7,15}$/.test(compact) ? compact : undefined;
};
/** Only public https links to a named host: no IP literals, localhost or credentials. */
export const publicHttpsUrl = (value: unknown) => {
  const raw = text(value, 8, 500);
  if (!raw) return undefined;
  try {
    const url = new URL(raw);
    const host = url.hostname.toLowerCase();
    if (url.protocol !== 'https:' || url.username || url.password) return undefined;
    if (!host.includes('.') || host === 'localhost' || host.endsWith('.local') || /^[\d.]+$/.test(host) || host.includes(':') || host.startsWith('[')) return undefined;
    return url.toString();
  } catch { return undefined; }
};

type ListingRow = {
  id: string; title: string; sector: string; city: string; summary: string; highlights_json: string; includes_json: string;
  asking_price_kwd: number | string | null; revenue_band: string; years_operating: number | string | null; reason: string;
  seller_name: string; contact_phone: string; contact_public: number | string; status: string; admin_note: string;
  submitted_at: string; reviewed_at: string | null;
};
type CampaignRow = {
  id: string; company: string; headline: string; tagline: string; link_url: string; slot: string; accent: string; icon: string;
  contact_phone: string; status: string; starts_on: string | null; ends_on: string | null; admin_note: string; created_at: string; updated_at: string;
  image_mime: string | null; image_data?: string | null;
};
type StatRow = { campaign_id: string; impressions: number | string; clicks: number | string };

const num = (value: unknown) => (value === null || value === undefined ? null : Number(value));
const listingBase = (row: ListingRow) => ({
  id: row.id, title: row.title, sector: row.sector, city: row.city, summary: row.summary,
  highlights: parseList(row.highlights_json), includes: parseList(row.includes_json),
  askingPriceKwd: num(row.asking_price_kwd), revenueBand: row.revenue_band, yearsOperating: num(row.years_operating),
  reason: row.reason, contactPublic: Number(row.contact_public) === 1, status: row.status, submittedAt: row.submitted_at
});
/** Anonymous callers never receive the seller's name, admin notes — and the phone only with consent. */
const listingPublic = (row: ListingRow) => ({ ...listingBase(row), ...(Number(row.contact_public) === 1 ? { contactPhone: row.contact_phone } : {}) });
const listingAdmin = (row: ListingRow) => ({ ...listingBase(row), sellerName: row.seller_name, contactPhone: row.contact_phone, adminNote: row.admin_note || undefined, reviewedAt: row.reviewed_at });
const adPublic = (row: CampaignRow) => ({ id: row.id, company: row.company, headline: row.headline, tagline: row.tagline, slot: row.slot, accent: row.accent, icon: row.icon, hasImage: !!row.image_mime });
const campaignAdmin = (row: CampaignRow, stat?: { impressions: number; clicks: number }, week?: { impressions: number; clicks: number }) => ({
  ...adPublic(row), linkUrl: row.link_url, contactPhone: row.contact_phone || undefined, status: row.status,
  startsOn: row.starts_on, endsOn: row.ends_on, adminNote: row.admin_note || undefined, createdAt: row.created_at,
  impressions: stat?.impressions ?? 0, clicks: stat?.clicks ?? 0, weekImpressions: week?.impressions ?? 0, weekClicks: week?.clicks ?? 0
});

const isLive = (row: Pick<CampaignRow, 'status' | 'starts_on' | 'ends_on'>, today: string) =>
  row.status === 'APPROVED' && (!row.starts_on || row.starts_on <= today) && (!row.ends_on || row.ends_on >= today);
const overlaps = (a: { starts_on: string | null; ends_on: string | null }, b: { starts_on: string | null; ends_on: string | null }) =>
  (!a.ends_on || !b.starts_on || a.ends_on >= b.starts_on) && (!b.ends_on || !a.starts_on || b.ends_on >= a.starts_on);

async function statsFor(db: MajalDatabase, ids: string[]) {
  const map = new Map<string, { impressions: number; clicks: number }>();
  if (!ids.length) return map;
  const rows = await db.prepare(`SELECT campaign_id, SUM(impressions) AS impressions, SUM(clicks) AS clicks FROM ad_daily_stats WHERE campaign_id IN (${ids.map(() => '?').join(',')}) GROUP BY campaign_id`).all<StatRow>(...ids);
  for (const row of rows) map.set(row.campaign_id, { impressions: Number(row.impressions), clicks: Number(row.clicks) });
  return map;
}
/** Last seven Kuwait days, for the "copy this week's summary" action. */
async function weekFor(db: MajalDatabase, ids: string[]) {
  const map = new Map<string, { impressions: number; clicks: number }>();
  if (!ids.length) return map;
  const since = kuwaitToday(new Date(Date.now() - 6 * 86_400_000));
  const rows = await db.prepare(`SELECT campaign_id, SUM(impressions) AS impressions, SUM(clicks) AS clicks FROM ad_daily_stats WHERE day >= ? AND campaign_id IN (${ids.map(() => '?').join(',')}) GROUP BY campaign_id`).all<StatRow>(since, ...ids);
  for (const row of rows) map.set(row.campaign_id, { impressions: Number(row.impressions), clicks: Number(row.clicks) });
  return map;
}
async function bump(db: MajalDatabase, id: string, field: 'impressions' | 'clicks') {
  const column = field === 'clicks' ? 'clicks' : 'impressions';
  await db.prepare(`INSERT INTO ad_daily_stats(campaign_id, day, ${column}) VALUES(?,?,1)
    ON CONFLICT(campaign_id, day) DO UPDATE SET ${column} = ad_daily_stats.${column} + 1`).run(id, kuwaitToday());
}

async function audit(db: MajalDatabase, req: AuthenticatedRequest, action: string, entityType: string, entityId: string, after?: unknown) {
  const auth = req.auth!;
  await db.prepare(`INSERT INTO domain_audit_events(
    actor_user_id,actor_role,organization_id,action,entity_type,entity_id,before_sha256,after_sha256,request_id,session_hash,created_at
  ) VALUES(?,?,?,?,?,?,?,?,?,?,?)`).run(
    auth.user.id, auth.user.role, null, action, entityType, entityId, null,
    after === undefined ? null : sha(JSON.stringify(after)),
    text(req.header('x-request-id'), 8, 128) || randomUUID(), sha(auth.tokenHash), now()
  );
}

const publicLimit = (limit: number, windowMs: number, scope: string) => expressRateLimit({
  windowMs, limit, standardHeaders: 'draft-6', legacyHeaders: false,
  keyGenerator: req => `${req.ip}:showcase-${scope}`,
  validate: { trustProxy: false, xForwardedForHeader: false },
  handler: (_req, res) => { res.status(429).json({ error: 'تم تجاوز الحد المؤقت للطلبات. حاول لاحقًا.' }); },
  passOnStoreError: true
});

export function createShowcaseRouter(db: MajalDatabase, authConfig: AuthConfig) {
  const router = Router();

  /* ───────── public: businesses for sale ───────── */
  router.get('/businesses', publicLimit(120, 60_000, 'read'), async (_req, res) => {
    const rows = await db.prepare("SELECT * FROM business_listings WHERE status='APPROVED' ORDER BY reviewed_at DESC, submitted_at DESC LIMIT 60").all<ListingRow>();
    res.json({ listings: rows.map(listingPublic) });
  });

  router.post('/businesses', publicLimit(5, 60 * 60_000, 'submit'), async (req, res) => {
    // A hidden field real people never fill; bots do. Answer as if accepted.
    if (typeof req.body?.website === 'string' && req.body.website.trim()) return res.status(201).json({ message: 'وصل طلبك وسيُراجع قبل الظهور.' });
    const title = text(req.body?.title, 3, 120), summary = text(req.body?.summary, 20, 1200);
    const sector = oneOf(req.body?.sector, BUSINESS_SECTORS), city = text(req.body?.city, 2, 80);
    const sellerName = text(req.body?.sellerName, 2, 80), phone = phoneOf(req.body?.contactPhone);
    if (!title || !summary || !sector || !city || !sellerName || !phone) return jsonError(res, 400, 'أكمل العنوان والنشاط والمدينة والوصف واسمك ورقم تواصل صحيحًا.', 'INVALID_LISTING');
    if (req.body?.termsAccepted !== true) return jsonError(res, 400, 'يلزم الإقرار بأن البيانات صحيحة وأن المراجعة شكلية.', 'TERMS_REQUIRED');
    const price = req.body?.askingPriceKwd === null || req.body?.askingPriceKwd === undefined || req.body?.askingPriceKwd === '' ? null : Number(req.body.askingPriceKwd);
    if (price !== null && (!Number.isInteger(price) || price < 0 || price > 100_000_000)) return jsonError(res, 400, 'السعر المطلوب غير صالح.', 'INVALID_PRICE');
    const years = req.body?.yearsOperating === null || req.body?.yearsOperating === undefined || req.body?.yearsOperating === '' ? null : Number(req.body.yearsOperating);
    if (years !== null && (!Number.isInteger(years) || years < 0 || years > 80)) return jsonError(res, 400, 'سنوات التشغيل غير صالحة.', 'INVALID_YEARS');
    const id = `biz_${randomUUID()}`, at = now();
    await db.prepare(`INSERT INTO business_listings(
      id,title,sector,city,summary,highlights_json,includes_json,asking_price_kwd,revenue_band,years_operating,reason,
      seller_name,contact_phone,contact_public,status,submitted_at,updated_at
    ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,'PENDING_REVIEW',?,?)`).run(
      id, title, sector, city, summary, JSON.stringify(stringList(req.body?.highlights, 4, 80)), JSON.stringify(stringList(req.body?.includes, 6, 60)),
      price, text(req.body?.revenueBand, 0, 60) ?? '', years, text(req.body?.reason, 0, 300) ?? '',
      sellerName, phone, req.body?.contactPublic === true ? 1 : 0, at, at
    );
    res.status(201).json({ id, message: 'وصل طلبك. لن يظهر للجمهور قبل مراجعة الإدارة، وهي خدمة مجانية.' });
  });

  /* ───────── public: ads ───────── */
  router.get('/ads/serve', publicLimit(300, 60_000, 'serve'), async (req, res) => {
    const slot = oneOf(typeof req.query.slot === 'string' ? req.query.slot.toUpperCase() : '', AD_SLOTS);
    if (!slot) return jsonError(res, 400, 'موقع الإعلان غير معروف.', 'INVALID_SLOT');
    const rows = await db.prepare(`SELECT ${CAMPAIGN_COLUMNS} FROM ad_campaigns WHERE status='APPROVED' AND slot=? ORDER BY created_at ASC LIMIT 20`).all<CampaignRow>(slot);
    const today = kuwaitToday();
    res.setHeader('Cache-Control', 'no-store');
    res.json({ ads: rows.filter(row => isLive(row, today)).slice(0, SLOT_CAPACITY[slot]).map(adPublic) });
  });

  router.post('/ads/event', publicLimit(240, 60_000, 'event'), async (req, res) => {
    const id = text(req.body?.id, 4, 80);
    if (!id || req.body?.type !== 'impression') return res.status(204).end();
    const row = await db.prepare(`SELECT ${CAMPAIGN_COLUMNS} FROM ad_campaigns WHERE id=? LIMIT 1`).get<CampaignRow>(id);
    if (row && isLive(row, kuwaitToday())) await bump(db, id, 'impressions');
    res.status(204).end();
  });

  // The only redirect target is the https link an administrator approved, never a caller value.
  router.get('/ads/click/:id', publicLimit(120, 60_000, 'click'), async (req, res) => {
    const row = await db.prepare(`SELECT ${CAMPAIGN_COLUMNS} FROM ad_campaigns WHERE id=? LIMIT 1`).get<CampaignRow>(req.params.id);
    if (!row || !isLive(row, kuwaitToday())) return res.redirect(302, '/');
    await bump(db, row.id, 'clicks');
    const target = new URL(row.link_url);
    if (![...target.searchParams.keys()].some(key => key.startsWith('utm_'))) {
      target.searchParams.set('utm_source', 'majal');
      target.searchParams.set('utm_medium', 'sponsor');
      target.searchParams.set('utm_campaign', row.id);
    }
    res.redirect(302, target.toString());
  });

  /* A company asks for a slot; it is a PENDING_REVIEW campaign until an administrator decides. */
  router.post('/ads/requests', publicLimit(5, 60 * 60_000, 'ad-request'), async (req, res) => {
    if (typeof req.body?.website === 'string' && req.body.website.trim()) return res.status(201).json({ message: 'وصل طلبك.' });
    const company = text(req.body?.company, 2, 80), headline = text(req.body?.headline, 4, 70);
    const link = publicHttpsUrl(req.body?.linkUrl), phone = phoneOf(req.body?.contactPhone);
    if (!company || !headline || !link || !phone) return jsonError(res, 400, 'أكمل اسم الشركة والعنوان ورابط https عامًا ورقم تواصل.', 'INVALID_AD_REQUEST');
    const id = `ad_${randomUUID()}`, at = now(), token = randomBytes(24).toString('hex');
    await db.prepare(`INSERT INTO ad_campaigns(id,company,headline,tagline,link_url,slot,accent,icon,contact_phone,status,report_token_hash,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,'PENDING_REVIEW',?,?,?)`).run(
      id, company, headline, text(req.body?.tagline, 0, 120) ?? '', link, oneOf(req.body?.slot, AD_SLOTS) ?? 'MARKET',
      oneOf(req.body?.accent, AD_ACCENTS) ?? 'gold', oneOf(req.body?.icon, AD_ICONS) ?? 'megaphone', phone, sha(token), at, at
    );
    // The requester keeps this private link; it is the only way to see the campaign's numbers.
    res.status(201).json({ id, reportToken: token, message: 'وصل طلب الإعلان. لا يظهر قبل اعتماد الإدارة وتحديد المدة. احتفظ برابط التقرير.' });
  });

  // The creative is served only while its campaign is live, as an inert image: nosniff and a
  // CSP that forbids everything, so even a mislabelled file cannot execute.
  router.get('/ads/img/:id', publicLimit(300, 60_000, 'img'), async (req, res) => {
    const row = await db.prepare('SELECT status, starts_on, ends_on, image_mime, image_data FROM ad_campaigns WHERE id=? LIMIT 1').get<Pick<CampaignRow, 'status' | 'starts_on' | 'ends_on' | 'image_mime' | 'image_data'>>(req.params.id);
    if (!row?.image_mime || !row.image_data || !isLive(row, kuwaitToday())) return res.status(404).end();
    res.setHeader('Content-Type', row.image_mime);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'");
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.send(Buffer.from(row.image_data, 'base64'));
  });

  /* Company report: the token is the identity. Aggregate numbers only. */
  router.get('/ads/report/:token', publicLimit(60, 60_000, 'report'), async (req, res) => {
    const token = text(req.params.token, 20, 200);
    if (!token) return jsonError(res, 404, 'التقرير غير موجود.', 'NOT_FOUND');
    const row = await db.prepare(`SELECT ${CAMPAIGN_COLUMNS} FROM ad_campaigns WHERE report_token_hash=? LIMIT 1`).get<CampaignRow>(sha(token));
    if (!row) return jsonError(res, 404, 'التقرير غير موجود.', 'NOT_FOUND');
    const days = await db.prepare('SELECT day, impressions, clicks FROM ad_daily_stats WHERE campaign_id=? ORDER BY day DESC LIMIT 30').all<{ day: string; impressions: number | string; clicks: number | string }>(row.id);
    const total = days.reduce((acc, d) => ({ impressions: acc.impressions + Number(d.impressions), clicks: acc.clicks + Number(d.clicks) }), { impressions: 0, clicks: 0 });
    res.json({
      campaign: { company: row.company, headline: row.headline, slot: row.slot, status: row.status, startsOn: row.starts_on, endsOn: row.ends_on },
      totals: total, ctr: total.impressions ? Math.round((total.clicks / total.impressions) * 1000) / 10 : 0,
      days: days.map(d => ({ day: d.day, impressions: Number(d.impressions), clicks: Number(d.clicks) })).reverse(),
      note: 'الظهور يُعدّ مرة لكل متصفح لكل جلسة بعد أن يُرى الإعلان فعلًا. لا نحفظ عنوان IP ولا هوية الزائر.'
    });
  });

  /* ───────── admin ───────── */
  const authenticated = requireAuth(db, authConfig);
  const csrfProtected = requireCsrf(authConfig);

  router.get('/admin/overview', authenticated, async (req: AuthenticatedRequest, res) => {
    if (!isAdmin(req)) return jsonError(res, 403, 'هذه الصفحة للإدارة فقط.', 'ADMIN_REQUIRED');
    const listings = await db.prepare("SELECT * FROM business_listings WHERE status IN ('PENDING_REVIEW','APPROVED') ORDER BY CASE status WHEN 'PENDING_REVIEW' THEN 0 ELSE 1 END, submitted_at DESC LIMIT 200").all<ListingRow>();
    const campaigns = await db.prepare(`SELECT ${CAMPAIGN_COLUMNS} FROM ad_campaigns ORDER BY CASE status WHEN 'PENDING_REVIEW' THEN 0 WHEN 'APPROVED' THEN 1 ELSE 2 END, created_at DESC LIMIT 200`).all<CampaignRow>();
    const ids = campaigns.map(c => c.id);
    const [stats, week] = await Promise.all([statsFor(db, ids), weekFor(db, ids)]);
    res.json({ listings: listings.map(listingAdmin), campaigns: campaigns.map(c => campaignAdmin(c, stats.get(c.id), week.get(c.id))) });
  });

  router.post('/admin/businesses/:id/review', authenticated, csrfProtected, async (req: AuthenticatedRequest, res) => {
    if (!isAdmin(req)) return jsonError(res, 403, 'الاعتماد للإدارة فقط.', 'ADMIN_REQUIRED');
    const decision = oneOf(req.body?.decision, ['APPROVED', 'REJECTED', 'SOLD'] as const);
    if (!decision) return jsonError(res, 400, 'قرار غير صالح.', 'INVALID_DECISION');
    const before = await db.prepare('SELECT * FROM business_listings WHERE id=? LIMIT 1').get<ListingRow>(req.params.id);
    if (!before) return jsonError(res, 404, 'الإعلان غير موجود.', 'NOT_FOUND');
    const adminNote = text(req.body?.adminNote, 0, 1000) ?? '', at = now();
    await withTransaction(db, async tx => {
      await tx.prepare('UPDATE business_listings SET status=?,admin_note=?,reviewed_by_user_id=?,reviewed_at=?,updated_at=? WHERE id=?').run(decision, adminNote, req.auth!.user.id, at, at, before.id);
      await audit(tx, req, 'BUSINESS_LISTING_REVIEWED', 'BUSINESS_LISTING', before.id, { decision, adminNote });
    });
    const row = await db.prepare('SELECT * FROM business_listings WHERE id=?').get<ListingRow>(before.id);
    res.json({ listing: listingAdmin(row!) });
  });

  router.post('/admin/campaigns', authenticated, csrfProtected, async (req: AuthenticatedRequest, res) => {
    if (!isAdmin(req)) return jsonError(res, 403, 'إنشاء الحملات للإدارة فقط.', 'ADMIN_REQUIRED');
    const company = text(req.body?.company, 2, 80), headline = text(req.body?.headline, 4, 70), link = publicHttpsUrl(req.body?.linkUrl);
    const slot = oneOf(req.body?.slot, AD_SLOTS), starts = optionalDay(req.body?.startsOn), ends = optionalDay(req.body?.endsOn);
    if (!company || !headline || !link || !slot) return jsonError(res, 400, 'أكمل الشركة والعنوان ورابط https عامًا والموقع.', 'INVALID_CAMPAIGN');
    if (!starts.valid || !ends.valid || (starts.value && ends.value && ends.value < starts.value)) return jsonError(res, 400, 'تواريخ الحملة غير صالحة.', 'INVALID_DATES');
    const id = `ad_${randomUUID()}`, at = now(), token = randomBytes(24).toString('hex');
    await db.prepare(`INSERT INTO ad_campaigns(id,company,headline,tagline,link_url,slot,accent,icon,contact_phone,status,starts_on,ends_on,report_token_hash,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,'PENDING_REVIEW',?,?,?,?,?)`).run(
      id, company, headline, text(req.body?.tagline, 0, 120) ?? '', link, slot, oneOf(req.body?.accent, AD_ACCENTS) ?? 'gold',
      oneOf(req.body?.icon, AD_ICONS) ?? 'megaphone', phoneOf(req.body?.contactPhone) ?? '', starts.value, ends.value, sha(token), at, at
    );
    await audit(db, req, 'AD_CAMPAIGN_CREATED', 'AD_CAMPAIGN', id, { company, slot });
    const row = await db.prepare(`SELECT ${CAMPAIGN_COLUMNS} FROM ad_campaigns WHERE id=?`).get<CampaignRow>(id);
    // The report token is shown exactly once; only its hash is stored.
    res.status(201).json({ campaign: campaignAdmin(row!), reportPath: `/?ad-report=${token}`, reportToken: token });
  });

  router.post('/admin/campaigns/:id/status', authenticated, csrfProtected, async (req: AuthenticatedRequest, res) => {
    if (!isAdmin(req)) return jsonError(res, 403, 'الاعتماد للإدارة فقط.', 'ADMIN_REQUIRED');
    const status = oneOf(req.body?.status, ['APPROVED', 'PAUSED', 'REJECTED'] as const);
    if (!status) return jsonError(res, 400, 'حالة غير صالحة.', 'INVALID_STATUS');
    const before = await db.prepare(`SELECT ${CAMPAIGN_COLUMNS} FROM ad_campaigns WHERE id=? LIMIT 1`).get<CampaignRow>(req.params.id);
    if (!before) return jsonError(res, 404, 'الحملة غير موجودة.', 'NOT_FOUND');
    const starts = req.body?.startsOn === undefined ? { value: before.starts_on, valid: true } : optionalDay(req.body.startsOn);
    const ends = req.body?.endsOn === undefined ? { value: before.ends_on, valid: true } : optionalDay(req.body.endsOn);
    if (!starts.valid || !ends.valid || (starts.value && ends.value && ends.value < starts.value)) return jsonError(res, 400, 'تواريخ الحملة غير صالحة.', 'INVALID_DATES');
    if (status === 'APPROVED') {
      if (ends.value && ends.value < kuwaitToday()) return jsonError(res, 409, 'تاريخ انتهاء الحملة مضى.', 'CAMPAIGN_ENDED');
      const slot = before.slot as (typeof AD_SLOTS)[number];
      const others = await db.prepare(`SELECT ${CAMPAIGN_COLUMNS} FROM ad_campaigns WHERE status='APPROVED' AND slot=? AND id<>?`).all<CampaignRow>(slot, before.id);
      const clashes = others.filter(o => overlaps(o, { starts_on: starts.value, ends_on: ends.value })).length;
      if (clashes >= SLOT_CAPACITY[slot]) return jsonError(res, 409, slot === 'SPONSOR' ? 'موقع الراعي حصري وفيه حملة معتمدة في هذه الفترة.' : 'امتلأ هذا الموقع في الفترة المحددة.', 'SLOT_FULL');
    }
    const adminNote = text(req.body?.adminNote, 0, 1000) ?? '', at = now();
    await withTransaction(db, async tx => {
      await tx.prepare('UPDATE ad_campaigns SET status=?,starts_on=?,ends_on=?,admin_note=?,updated_at=? WHERE id=?').run(status, starts.value, ends.value, adminNote, at, before.id);
      await audit(tx, req, 'AD_CAMPAIGN_STATUS', 'AD_CAMPAIGN', before.id, { status, startsOn: starts.value, endsOn: ends.value });
    });
    const row = await db.prepare(`SELECT ${CAMPAIGN_COLUMNS} FROM ad_campaigns WHERE id=?`).get<CampaignRow>(before.id);
    const stats = await statsFor(db, [before.id]);
    res.json({ campaign: campaignAdmin(row!, stats.get(before.id)) });
  });

  router.post('/admin/campaigns/:id/image', authenticated, csrfProtected, express.raw({ type: () => true, limit: '400kb' }), async (req: AuthenticatedRequest, res) => {
    if (!isAdmin(req)) return jsonError(res, 403, 'رفع الصور للإدارة فقط.', 'ADMIN_REQUIRED');
    const row = await db.prepare('SELECT id FROM ad_campaigns WHERE id=? LIMIT 1').get<{ id: string }>(req.params.id);
    if (!row) return jsonError(res, 404, 'الحملة غير موجودة.', 'NOT_FOUND');
    const body = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    const meta = readImageMeta(body);
    const problem = creativeProblem(meta, body.length);
    if (problem || !meta) return jsonError(res, 422, problem || 'صورة غير صالحة.', 'INVALID_CREATIVE');
    await withTransaction(db, async tx => {
      await tx.prepare('UPDATE ad_campaigns SET image_mime=?, image_data=?, updated_at=? WHERE id=?').run(meta.mime, body.toString('base64'), now(), row.id);
      await audit(tx, req, 'AD_CREATIVE_UPLOADED', 'AD_CAMPAIGN', row.id, { mime: meta.mime, width: meta.width, height: meta.height, bytes: body.length });
    });
    res.json({ ok: true, width: meta.width, height: meta.height });
  });

  router.post('/admin/campaigns/:id/image/remove', authenticated, csrfProtected, async (req: AuthenticatedRequest, res) => {
    if (!isAdmin(req)) return jsonError(res, 403, 'الصور للإدارة فقط.', 'ADMIN_REQUIRED');
    await db.prepare('UPDATE ad_campaigns SET image_mime=NULL, image_data=NULL, updated_at=? WHERE id=?').run(now(), req.params.id);
    await audit(db, req, 'AD_CREATIVE_REMOVED', 'AD_CAMPAIGN', req.params.id, {});
    res.json({ ok: true });
  });

  /** Issues a fresh private report link; the old one stops working immediately. */
  router.post('/admin/campaigns/:id/rotate-report', authenticated, csrfProtected, async (req: AuthenticatedRequest, res) => {
    if (!isAdmin(req)) return jsonError(res, 403, 'للإدارة فقط.', 'ADMIN_REQUIRED');
    const row = await db.prepare('SELECT id FROM ad_campaigns WHERE id=? LIMIT 1').get<{ id: string }>(req.params.id);
    if (!row) return jsonError(res, 404, 'الحملة غير موجودة.', 'NOT_FOUND');
    const token = randomBytes(24).toString('hex');
    await db.prepare('UPDATE ad_campaigns SET report_token_hash=?, updated_at=? WHERE id=?').run(sha(token), now(), row.id);
    await audit(db, req, 'AD_REPORT_ROTATED', 'AD_CAMPAIGN', row.id, {});
    res.json({ reportToken: token });
  });

  return router;
}
