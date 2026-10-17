import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { Response, Router } from 'express';
import { rateLimit as expressRateLimit } from 'express-rate-limit';
import { AuthConfig, AuthenticatedRequest, requireAuth, requireCsrf } from './auth';
import { MajalDatabase } from './database';
import { AD_AUDIENCES, kuwaitToday } from './showcase';

/*
 * Audience measurement and the partner kit.
 *
 * Everything counted here is anonymous and aggregate: the client reports "one browser opened this
 * page today as role X" at most once per day per page; the server stores a counter. No IP, user id,
 * cookie or fingerprint is written, so there is nothing to disclose about any individual.
 */

/** Pages that are measured. Administrator surfaces are deliberately absent. */
export const MEASURED_SURFACES = ['PUBLIC', 'SHOWCASE', 'DIRECTORY', 'CONSUMER', 'CREATOR', 'HOST', 'SUPPLIER'] as const;
/** Pseudo-surface that holds "unique browsers per day" (bumped once per browser per day). */
const DAY_ROW = '_DAY';
export const GATE_KINDS = ['listing_open', 'listing_contact', 'supplier_contact'] as const;

const sha = (v: string) => createHash('sha256').update(v).digest('hex');
const jsonError = (res: Response, status: number, message: string, code: string) => res.status(status).json({ error: message, code });
/** The audience dashboard and the partner link are the owner's marketing tools: SUPER_ADMIN only, not ordinary administrators. */
const isOwner = (req: AuthenticatedRequest) => req.auth?.user.role === 'SUPER_ADMIN';
const oneOf = <T extends string>(v: unknown, list: readonly T[]): T | undefined => (typeof v === 'string' && (list as readonly string[]).includes(v) ? (v as T) : undefined);
const dayMinus = (n: number) => kuwaitToday(new Date(Date.now() - n * 86_400_000));

const limit = (max: number, windowMs: number, scope: string) => expressRateLimit({
  windowMs, limit: max, standardHeaders: 'draft-6', legacyHeaders: false, keyGenerator: req => `${req.ip}:aud-${scope}`,
  validate: { trustProxy: false, xForwardedForHeader: false },
  handler: (_req, res) => { res.status(429).json({ error: 'تم تجاوز الحد المؤقت للطلبات.' }); }, passOnStoreError: true
});

const count = async (db: MajalDatabase, sql: string, ...params: unknown[]) => Number((await db.prepare(sql).get<{ n: number | string }>(...params))?.n ?? 0);

/** Real figures about the platform itself (counts only, no names, no money). */
export async function platformFacts(db: MajalDatabase) {
  const [creators, hosts, suppliers, liveLaunches, jobs, listings, directory] = await Promise.all([
    count(db, 'SELECT COUNT(*) AS n FROM creator_profiles'),
    count(db, "SELECT COUNT(*) AS n FROM organizations WHERE organization_type='HOST' AND verification_status='VERIFIED'"),
    count(db, "SELECT COUNT(*) AS n FROM supplier_profiles WHERE verification_status='VERIFIED'"),
    count(db, "SELECT COUNT(*) AS n FROM launches WHERE status IN ('LIVE','PERMANENT')"),
    count(db, "SELECT COUNT(*) AS n FROM job_posts WHERE status='APPROVED'"),
    count(db, "SELECT COUNT(*) AS n FROM business_listings WHERE status='APPROVED'"),
    count(db, "SELECT COUNT(*) AS n FROM supplier_directory WHERE status='APPROVED'"),
  ]);
  return { creators, verifiedFacilities: hosts, verifiedSuppliers: suppliers, liveLaunches, openJobs: jobs, businessesForSale: listings, directorySuppliers: directory };
}

type DailyRow = { day: string; surface: string; audience: string; visits: number | string };

/** 30 days of anonymous traffic, shaped for charts. */
export async function trafficSummary(db: MajalDatabase, days = 30) {
  const since = dayMinus(days - 1);
  const rows = await db.prepare('SELECT day, surface, audience, visits FROM audience_daily WHERE day >= ?').all<DailyRow>(since);
  const perDay = new Map<string, { browsers: number; views: number }>();
  for (let i = days - 1; i >= 0; i--) perDay.set(dayMinus(i), { browsers: 0, views: 0 });
  const bySurface = new Map<string, number>(), byAudience = new Map<string, number>(), browsersByAudience = new Map<string, number>();
  for (const r of rows) {
    const v = Number(r.visits), slot = perDay.get(r.day);
    if (r.surface === DAY_ROW) {
      if (slot) slot.browsers += v;
      browsersByAudience.set(r.audience, (browsersByAudience.get(r.audience) ?? 0) + v);
    } else {
      if (slot) slot.views += v;
      bySurface.set(r.surface, (bySurface.get(r.surface) ?? 0) + v);
      byAudience.set(r.audience, (byAudience.get(r.audience) ?? 0) + v);
    }
  }
  const daily = [...perDay.entries()].map(([day, x]) => ({ day, ...x }));
  const sum = (n: number, key: 'browsers' | 'views') => daily.slice(-n).reduce((a, d) => a + d[key], 0);
  const first = await db.prepare('SELECT MIN(day) AS d FROM audience_daily').get<{ d: string | null }>();
  const weekday = new Array(7).fill(0) as number[];
  for (const d of daily) weekday[new Date(`${d.day}T00:00:00Z`).getUTCDay()] += d.browsers;
  const sorted = (m: Map<string, number>) => [...m.entries()].map(([key, visits]) => ({ key, visits })).sort((a, b) => b.visits - a.visits);
  return {
    measuringSince: first?.d ?? null,
    totals: { browsersToday: sum(1, 'browsers'), browsers7: sum(7, 'browsers'), browsers30: sum(30, 'browsers'), views7: sum(7, 'views'), views30: sum(30, 'views') },
    daily, bySurface: sorted(bySurface), byAudience: sorted(byAudience), browsersByAudience: sorted(browsersByAudience), weekday
  };
}

export function createAudienceRouter(db: MajalDatabase, authConfig: AuthConfig) {
  const router = Router();

  /* ───────── public, anonymous ───────── */
  router.post('/pulse', limit(240, 60_000, 'pulse'), async (req, res) => {
    const surface = oneOf(req.body?.surface, MEASURED_SURFACES);
    const audience = oneOf(typeof req.body?.audience === 'string' ? req.body.audience.toUpperCase() : '', AD_AUDIENCES) ?? 'VISITOR';
    if (!surface) return res.status(204).end();
    const day = kuwaitToday();
    const bump = (s: string) => db.prepare(`INSERT INTO audience_daily(day, surface, audience, visits) VALUES(?,?,?,1)
      ON CONFLICT(day, surface, audience) DO UPDATE SET visits = audience_daily.visits + 1`).run(day, s, audience);
    await bump(surface);
    // The client marks the first page it opens each day; that is what "one browser" means.
    if (req.body?.firstToday === true) await bump(DAY_ROW);
    res.status(204).end();
  });

  router.post('/gate-event', limit(240, 60_000, 'gate'), async (req, res) => {
    const kind = oneOf(req.body?.kind, GATE_KINDS);
    const id = typeof req.body?.id === 'string' ? req.body.id.slice(0, 80) : '';
    if (!kind || !id) return res.status(204).end();
    const exists = kind.startsWith('listing')
      ? await count(db, "SELECT COUNT(*) AS n FROM business_listings WHERE id=? AND status='APPROVED'", id)
      : await count(db, "SELECT COUNT(*) AS n FROM supplier_directory WHERE id=? AND status='APPROVED'", id);
    if (exists) {
      await db.prepare(`INSERT INTO gate_events(day, kind, ref_id, total) VALUES(?,?,?,1)
        ON CONFLICT(day, kind, ref_id) DO UPDATE SET total = gate_events.total + 1`).run(kuwaitToday(), kind, id);
    }
    res.status(204).end();
  });

  /* A seller's / supplier's own private numbers: how many opened and contacted, by day. */
  router.get('/gate-report/:token', limit(60, 60_000, 'gate-report'), async (req, res) => {
    const token = typeof req.params.token === 'string' ? req.params.token : '';
    if (token.length < 20 || token.length > 200) return jsonError(res, 404, 'التقرير غير موجود.', 'NOT_FOUND');
    const hash = sha(token);
    const listing = await db.prepare('SELECT id, title AS name, status FROM business_listings WHERE report_token_hash=?').get<{ id: string; name: string; status: string }>(hash);
    const supplier = listing ? undefined : await db.prepare('SELECT id, name, status FROM supplier_directory WHERE report_token_hash=?').get<{ id: string; name: string; status: string }>(hash);
    const row = listing ?? supplier;
    if (!row) return jsonError(res, 404, 'التقرير غير موجود.', 'NOT_FOUND');
    const since = dayMinus(29);
    const events = await db.prepare('SELECT day, kind, total FROM gate_events WHERE ref_id=? AND day >= ?').all<{ day: string; kind: string; total: number | string }>(row.id, since);
    const perDay = new Map<string, { opens: number; contacts: number }>();
    for (let i = 29; i >= 0; i--) perDay.set(dayMinus(i), { opens: 0, contacts: 0 });
    for (const e of events) { const d = perDay.get(e.day); if (d) { if (e.kind.endsWith('_contact')) d.contacts += Number(e.total); else d.opens += Number(e.total); } }
    const daily = [...perDay.entries()].map(([day, v]) => ({ day, ...v }));
    res.setHeader('Cache-Control', 'no-store');
    res.json({
      kind: listing ? 'listing' : 'supplier', title: row.name, status: row.status,
      totals: { opens: daily.reduce((a, d) => a + d.opens, 0), contacts: daily.reduce((a, d) => a + d.contacts, 0) }, daily,
      note: 'يُحسب كل متصفح مرة واحدة في اليوم، ولا نحفظ هوية الزائر. القياس يبدأ من اعتماد الإعلان.'
    });
  });

  /* The private partner kit: aggregate figures for a company deciding whether to advertise. */
  router.get('/partners/:token', limit(60, 60_000, 'kit'), async (req, res) => {
    const token = typeof req.params.token === 'string' ? req.params.token : '';
    const row = token.length >= 20 && token.length <= 200 ? await db.prepare('SELECT token_hash FROM partner_kit WHERE id=?').get<{ token_hash: string }>('main') : undefined;
    if (!row || row.token_hash !== sha(token)) return jsonError(res, 404, 'الرابط غير صالح أو تم تجديده.', 'NOT_FOUND');
    const [traffic, facts, slots] = await Promise.all([trafficSummary(db), platformFacts(db), liveSlots(db)]);
    res.setHeader('Cache-Control', 'no-store');
    res.json({ traffic, facts, slots, free: true });
  });

  /* ───────── admin ───────── */
  const authenticated = requireAuth(db, authConfig);
  const csrfProtected = requireCsrf(authConfig);

  router.get('/admin/overview', authenticated, async (req: AuthenticatedRequest, res) => {
    if (!isOwner(req)) return jsonError(res, 403, 'لوحة الجمهور لمالك المنصة فقط.', 'OWNER_REQUIRED');
    const since = dayMinus(29);
    const [traffic, facts, kit, ads, slots] = await Promise.all([
      trafficSummary(db), platformFacts(db),
      db.prepare('SELECT created_at, rotated_at FROM partner_kit WHERE id=?').get<{ created_at: string; rotated_at: string | null }>('main'),
      db.prepare(`SELECT COALESCE(SUM(impressions),0) AS impressions, COALESCE(SUM(clicks),0) AS clicks FROM ad_daily_stats WHERE day >= ?`).get<{ impressions: number | string; clicks: number | string }>(since),
      liveSlots(db)
    ]);
    const gates = await gateSummary(db, since);
    const impressions = Number(ads?.impressions ?? 0), clicks = Number(ads?.clicks ?? 0);
    res.json({
      traffic, facts, slots, gates,
      ads: { impressions, clicks, ctr: impressions ? Math.round((clicks / impressions) * 1000) / 10 : 0, liveCampaigns: slots.reduce((a, s) => a + s.live, 0) },
      kit: kit ? { exists: true, createdAt: kit.created_at, rotatedAt: kit.rotated_at } : { exists: false }
    });
  });

  /** Creates the partner link, or replaces it (the old one stops working). The token is shown once. */
  router.post('/admin/kit/rotate', authenticated, csrfProtected, async (req: AuthenticatedRequest, res) => {
    if (!isOwner(req)) return jsonError(res, 403, 'لمالك المنصة فقط.', 'OWNER_REQUIRED');
    const token = randomBytes(24).toString('hex'), at = new Date().toISOString();
    await db.prepare(`INSERT INTO partner_kit(id, token_hash, created_at) VALUES('main',?,?)
      ON CONFLICT(id) DO UPDATE SET token_hash = excluded.token_hash, rotated_at = excluded.created_at`).run(sha(token), at);
    await db.prepare(`INSERT INTO domain_audit_events(actor_user_id,actor_role,organization_id,action,entity_type,entity_id,before_sha256,after_sha256,request_id,session_hash,created_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?)`).run(req.auth!.user.id, req.auth!.user.role, null, 'PARTNER_KIT_ROTATED', 'PARTNER_KIT', 'main', null, null, randomUUID(), sha(req.auth!.tokenHash), at);
    res.status(201).json({ token });
  });

  return router;
}


/** How many campaigns are live now in each slot, against its capacity. */
async function liveSlots(db: MajalDatabase) {
  const today = kuwaitToday();
  const rows = await db.prepare("SELECT slot, starts_on, ends_on FROM ad_campaigns WHERE status='APPROVED'").all<{ slot: string; starts_on: string | null; ends_on: string | null }>();
  const cap = { SPONSOR: 1, MARKET: 3, PORTAL: 3 } as const;
  return (Object.keys(cap) as (keyof typeof cap)[]).map(slot => ({
    slot, capacity: cap[slot],
    live: rows.filter(r => r.slot === slot && (!r.starts_on || r.starts_on <= today) && (!r.ends_on || r.ends_on >= today)).length
  }));
}

/** Opens and contact taps on listings and suppliers, with the five most-viewed of each. */
async function gateSummary(db: MajalDatabase, since: string) {
  const rows = await db.prepare('SELECT kind, ref_id, SUM(total) AS total FROM gate_events WHERE day >= ? GROUP BY kind, ref_id').all<{ kind: string; ref_id: string; total: number | string }>(since);
  const sumOf = (kind: string) => rows.filter(r => r.kind === kind).reduce((a, r) => a + Number(r.total), 0);
  const top = async (kinds: string[], table: 'business_listings' | 'supplier_directory', column: 'title' | 'name') => {
    const byRef = new Map<string, { opens: number; contacts: number }>();
    for (const r of rows.filter(x => kinds.includes(x.kind))) {
      const cur = byRef.get(r.ref_id) ?? { opens: 0, contacts: 0 };
      if (r.kind.endsWith('_contact')) cur.contacts += Number(r.total); else cur.opens += Number(r.total);
      byRef.set(r.ref_id, cur);
    }
    const ranked = [...byRef.entries()].sort((a, b) => (b[1].opens + b[1].contacts * 3) - (a[1].opens + a[1].contacts * 3)).slice(0, 5);
    const out: { id: string; title: string; opens: number; contacts: number }[] = [];
    for (const [id, v] of ranked) {
      const r = await db.prepare(`SELECT ${column} AS t FROM ${table} WHERE id=?`).get<{ t: string }>(id);
      if (r) out.push({ id, title: r.t, ...v });
    }
    return out;
  };
  return {
    listingOpens: sumOf('listing_open'), listingContacts: sumOf('listing_contact'), supplierContacts: sumOf('supplier_contact'),
    topListings: await top(['listing_open', 'listing_contact'], 'business_listings', 'title'),
    topSuppliers: await top(['supplier_contact'], 'supplier_directory', 'name')
  };
}
