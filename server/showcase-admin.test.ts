import assert from 'node:assert/strict';
import test from 'node:test';
import { randomBytes } from 'node:crypto';
import express from 'express';
import { AddressInfo } from 'node:net';
import { openTestDatabase } from './test-db';
import { createAuthRouter, createPublicRegistration, createUser } from './auth';
import { createShowcaseRouter, kuwaitToday } from './showcase';
import { createTeamRouter } from './team';

const config = {
  production: false, sessionSecret: 'test-session-secret-that-is-long-enough-123456',
  encryptionKey: 'test-encryption-key-that-is-long-enough-12345', sessionHours: 8, cookieName: 'majal_session', csrfCookieName: 'majal_csrf'
};
const password = `${randomBytes(12).toString('base64url')}-Aa1!`;
interface Session { cookie: string; csrf: string }

async function harness() {
  const db = await openTestDatabase();
  const app = express();
  app.use(express.json());
  app.use('/api/v1/auth', createAuthRouter(db, config));
  app.use('/api/v1/showcase', createShowcaseRouter(db, config));
  app.use('/api/v1/team', createTeamRouter(db, config));
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1`;
  const login = async (email: string): Promise<Session> => {
    const r = await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password }) });
    assert.equal(r.status, 200, `login ${email}`);
    const body = await r.json() as { csrfToken: string };
    return { cookie: r.headers.getSetCookie().map(c => c.split(';')[0]).join('; '), csrf: body.csrfToken };
  };
  const call = (s: Session, method: string, path: string, body?: unknown, raw?: Buffer) => fetch(`${base}${path}`, {
    method, headers: { cookie: s.cookie, 'x-csrf-token': s.csrf, ...(raw ? { 'content-type': 'image/png' } : body ? { 'content-type': 'application/json' } : {}) },
    body: raw ?? (body ? JSON.stringify(body) : undefined)
  });
  return { db, base, login, call, close: async () => { await new Promise<void>(r => server.close(() => r())); await db.close(); } };
}

/** A header-only PNG: enough for the sniffer, which reads magic bytes and the IHDR size. */
const png = (w: number, h: number) => {
  const b = Buffer.alloc(40);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b); b.write('IHDR', 12, 'ascii'); b.writeUInt32BE(w, 16); b.writeUInt32BE(h, 20);
  return b;
};
const campaign = (n: number, slot: string) => ({ company: `شركة ${n}`, headline: `عرض رقم ${n}`, linkUrl: `https://example.com/${n}`, slot });

test('admin reviews listings and campaigns; slot capacity, creatives and report links are enforced', async () => {
  const h = await harness();
  try {
    await createUser(h.db, { name: 'Admin', email: 'admin@show.test', password, role: 'ADMIN' });
    await createUser(h.db, { name: 'Buyer', email: 'buyer@show.test', password, role: 'CONSUMER' });
    const admin = await h.login('admin@show.test'), buyer = await h.login('buyer@show.test');

    // Non-admins are refused everywhere.
    assert.equal((await h.call(buyer, 'GET', '/showcase/admin/overview')).status, 403);
    assert.equal((await h.call(buyer, 'POST', '/showcase/admin/campaigns', campaign(1, 'MARKET'))).status, 403);

    // Listing: submit → pending in admin overview → approve → public.
    const submit = await fetch(`${h.base}/showcase/businesses`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: 'مقهى للبيع', sector: 'CAFE', city: 'حولي', summary: 'مقهى بعقد ساري ومعدات كاملة وزبائن ثابتين.', sellerName: 'سالم', contactPhone: '50001234', termsAccepted: true, contactPublic: true }) });
    const { id: listingId } = await submit.json();
    const overview = await (await h.call(admin, 'GET', '/showcase/admin/overview')).json();
    assert.equal(overview.listings[0].status, 'PENDING_REVIEW');
    assert.equal(overview.listings[0].sellerName, 'سالم');
    assert.equal((await h.call(admin, 'POST', `/showcase/admin/businesses/${listingId}/review`, { decision: 'NOPE' })).status, 400);
    assert.equal((await h.call(admin, 'POST', `/showcase/admin/businesses/${listingId}/review`, { decision: 'APPROVED' })).status, 200);
    assert.equal((await (await fetch(`${h.base}/showcase/businesses`)).json()).listings.length, 1);
    await h.call(admin, 'POST', `/showcase/admin/businesses/${listingId}/review`, { decision: 'SOLD' });
    assert.equal((await (await fetch(`${h.base}/showcase/businesses`)).json()).listings.length, 0);

    // Supplier directory: pending → approve → public; reject hides again.
    const sup = await fetch(`${h.base}/showcase/suppliers`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'مورد تجريبي', category: 'SPICES', region: 'المباركية', description: 'بهارات مطحونة بحسب الطلب.', contactName: 'سعد', contactPhone: '50002222', termsAccepted: true }) });
    const { id: supId } = await sup.json();
    assert.equal((await h.call(buyer, 'POST', `/showcase/admin/suppliers/${supId}/review`, { decision: 'APPROVED' })).status, 403);
    assert.equal((await h.call(admin, 'POST', `/showcase/admin/suppliers/${supId}/review`, { decision: 'X' })).status, 400);
    assert.equal((await h.call(admin, 'POST', '/showcase/admin/suppliers/nope/review', { decision: 'APPROVED' })).status, 404);
    assert.equal((await (await h.call(admin, 'GET', '/showcase/admin/overview')).json()).suppliers[0].contactName, 'سعد');
    assert.equal((await h.call(admin, 'POST', `/showcase/admin/suppliers/${supId}/review`, { decision: 'APPROVED' })).status, 200);
    assert.equal((await (await fetch(`${h.base}/showcase/suppliers`)).json()).suppliers.length, 1);
    await h.call(admin, 'POST', `/showcase/admin/suppliers/${supId}/review`, { decision: 'REJECTED' });
    assert.equal((await (await fetch(`${h.base}/showcase/suppliers`)).json()).suppliers.length, 0);

    // Sponsor slot is exclusive; market holds three.
    const ids: string[] = [];
    for (const [n, slot] of [[1, 'SPONSOR'], [2, 'SPONSOR'], [3, 'MARKET'], [4, 'MARKET'], [5, 'MARKET'], [6, 'MARKET']] as const) {
      const r = await h.call(admin, 'POST', '/showcase/admin/campaigns', campaign(n, slot));
      assert.equal(r.status, 201); const id = (await r.json()).campaign.id; ids.push(id);
      assert.equal((await h.call(admin, 'POST', `/showcase/admin/campaigns/${id}/billing`, { billing: 'COMPLIMENTARY' })).status, 200);
    }
    const approve = (i: number, extra: object = {}) => h.call(admin, 'POST', `/showcase/admin/campaigns/${ids[i]}/status`, { status: 'APPROVED', ...extra });
    assert.equal((await approve(0, { endsOn: '2098-12-31' })).status, 200);
    assert.equal((await approve(1)).status, 409);
    // …unless the dates do not overlap.
    assert.equal((await approve(1, { startsOn: '2099-01-01', endsOn: '2099-02-01' })).status, 200);
    for (const i of [2, 3, 4]) assert.equal((await approve(i)).status, 200);
    const full = await approve(5);
    assert.equal(full.status, 409); assert.equal((await full.json()).code, 'SLOT_FULL');
    assert.equal((await approve(5, { endsOn: '2000-01-01' })).status, 409, 'an already-ended campaign cannot be approved');
    assert.equal((await h.call(admin, 'POST', `/showcase/admin/campaigns/${ids[5]}/status`, { status: 'APPROVED', startsOn: '2030-05-01', endsOn: '2030-04-01' })).status, 400);
    assert.equal((await (await fetch(`${h.base}/showcase/promo/serve?slot=MARKET`)).json()).ads.length, 3);
    // The future sponsor campaign is approved but not serving yet.
    assert.equal((await (await fetch(`${h.base}/showcase/promo/serve?slot=SPONSOR`)).json()).ads[0].company, 'شركة 1');

    // Creatives: sniffed by content, size-checked, served only while live, removable.
    assert.equal((await h.call(admin, 'POST', `/showcase/admin/campaigns/${ids[2]}/image`, undefined, Buffer.from('<svg onload=alert(1)>'))).status, 422);
    assert.equal((await h.call(admin, 'POST', `/showcase/admin/campaigns/${ids[2]}/image`, undefined, png(100, 100))).status, 422);
    assert.equal((await h.call(admin, 'POST', `/showcase/admin/campaigns/${ids[2]}/image`, undefined, png(1000, 100))).status, 422);
    assert.equal((await h.call(admin, 'POST', `/showcase/admin/campaigns/${ids[2]}/image`, undefined, png(640, 320))).status, 200);
    const img = await fetch(`${h.base}/showcase/promo/img/${ids[2]}`);
    assert.equal(img.status, 200);
    assert.equal(img.headers.get('content-type'), 'image/png');
    assert.equal(img.headers.get('x-content-type-options'), 'nosniff');
    assert.equal((await (await fetch(`${h.base}/showcase/promo/serve?slot=MARKET`)).json()).ads.find((a: { id: string }) => a.id === ids[2]).hasImage, true);
    await h.call(admin, 'POST', `/showcase/admin/campaigns/${ids[2]}/status`, { status: 'PAUSED' });
    assert.equal((await fetch(`${h.base}/showcase/promo/img/${ids[2]}`)).status, 404, 'a paused campaign serves no image');
    await h.call(admin, 'POST', `/showcase/admin/campaigns/${ids[2]}/image/remove`);
    assert.equal((await fetch(`${h.base}/showcase/promo/img/${ids[2]}`)).status, 404);

    // Report link rotation invalidates the old token.
    const created = await (await h.call(admin, 'POST', '/showcase/admin/campaigns', campaign(9, 'PORTAL'))).json();
    const oldToken = created.reportToken;
    assert.equal((await fetch(`${h.base}/showcase/promo/report/${oldToken}`)).status, 200);
    const { reportToken } = await (await h.call(admin, 'POST', `/showcase/admin/campaigns/${created.campaign.id}/rotate-report`)).json();
    assert.equal((await fetch(`${h.base}/showcase/promo/report/${oldToken}`)).status, 404);
    assert.equal((await fetch(`${h.base}/showcase/promo/report/${reportToken}`)).status, 200);

    // Weekly numbers reach the admin overview.
    await fetch(`${h.base}/showcase/promo/event`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: ids[3], type: 'impression' }) });
    const again = await (await h.call(admin, 'GET', '/showcase/admin/overview')).json();
    assert.equal(again.campaigns.find((c: { id: string }) => c.id === ids[3]).weekImpressions, 1);
    assert.ok(kuwaitToday() >= '2026-01-01');
  } finally { await h.close(); }
});

test('facility team: owner invites, role changes revoke sessions, tenants stay isolated', async () => {
  const h = await harness();
  try {
    const regA = await createPublicRegistration(h.db, { name: 'مالك أ', email: 'a@team.test', phone: '+96550000001', password, role: 'HOST_OWNER' }, { commercialName: 'منشأة أ', businessType: 'BAKERY' });
    await createPublicRegistration(h.db, { name: 'مالك ب', email: 'b@team.test', phone: '+96550000002', password, role: 'HOST_OWNER' }, { commercialName: 'منشأة ب', businessType: 'CAFE' });
    const ownerA = await h.login('a@team.test'), ownerB = await h.login('b@team.test');

    // Roles outside the team set, bad e-mails and existing accounts are refused.
    assert.equal((await h.call(ownerA, 'POST', '/team/invites', { email: 'x@y.test', role: 'HOST_OWNER' })).status, 400);
    assert.equal((await h.call(ownerA, 'POST', '/team/invites', { email: 'not-an-email', role: 'HOST_CHEF' })).status, 400);
    assert.equal((await h.call(ownerA, 'POST', '/team/invites', { email: 'b@team.test', role: 'HOST_CHEF' })).status, 409);

    const inv = await h.call(ownerA, 'POST', '/team/invites', { email: 'chef@team.test', role: 'HOST_CHEF' });
    assert.equal(inv.status, 201);
    const { link } = await inv.json();
    const token = link.split('invite=')[1];
    // Re-inviting the same address replaces the earlier link.
    const again = await (await h.call(ownerA, 'POST', '/team/invites', { email: 'chef@team.test', role: 'HOST_FINANCE' })).json();
    assert.equal((await fetch(`${h.base}/team/invites/${token}`)).status, 404);
    const token2 = again.link.split('invite=')[1];
    assert.equal((await (await fetch(`${h.base}/team/invites/${token2}`)).json()).role, 'HOST_FINANCE');

    const accept = await fetch(`${h.base}/team/invites/accept`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: token2, name: 'المالية', password }) });
    assert.equal(accept.status, 201);
    const team = await (await h.call(ownerA, 'GET', '/team')).json();
    assert.deepEqual(team.members.map((m: { role: string }) => m.role), ['HOST_OWNER', 'HOST_FINANCE']);
    assert.equal(team.invites.length, 0);
    const finance = team.members.find((m: { role: string }) => m.role === 'HOST_FINANCE');

    // A member cannot manage the team; the other tenant's owner cannot touch this member.
    const financeSession = await h.login('chef@team.test');
    assert.equal((await h.call(financeSession, 'GET', '/team')).status, 403);
    assert.equal((await h.call(ownerB, 'POST', `/team/members/${finance.userId}`, { role: 'HOST_CHEF' })).status, 404);
    assert.equal((await h.call(ownerB, 'POST', `/team/members/${finance.userId}/remove`)).status, 404);

    // Owner cannot edit themselves or be demoted; role change kills the member's sessions.
    assert.equal((await h.call(ownerA, 'POST', `/team/members/${regA.id}`, { role: 'HOST_CHEF' })).status, 409);
    assert.equal((await h.call(financeSession, 'GET', '/auth/me')).status, 200);
    assert.equal((await h.call(ownerA, 'POST', `/team/members/${finance.userId}`, { role: 'HOST_CHEF' })).status, 200);
    assert.equal((await h.call(financeSession, 'GET', '/auth/me')).status, 401);
    const asChef = await h.db.prepare('SELECT role FROM users WHERE id = ?').get<{ role: string }>(finance.userId);
    assert.equal(asChef?.role, 'HOST_CHEF');

    // Suspension blocks login; removal detaches the tenant.
    assert.equal((await h.call(ownerA, 'POST', `/team/members/${finance.userId}`, { status: 'SUSPENDED' })).status, 200);
    const blocked = await fetch(`${h.base}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'chef@team.test', password }) });
    assert.equal(blocked.status, 401);
    assert.equal((await h.call(ownerA, 'POST', `/team/members/${finance.userId}/remove`)).status, 200);
    const gone = await h.db.prepare('SELECT role, host_business_id FROM users WHERE id = ?').get<{ role: string; host_business_id: string | null }>(finance.userId);
    assert.deepEqual({ role: gone?.role, org: gone?.host_business_id }, { role: 'CONSUMER', org: null });
    assert.equal(Number((await h.db.prepare('SELECT COUNT(*) AS n FROM organization_memberships WHERE user_id = ?').get<{ n: number }>(finance.userId))?.n), 0);
  } finally { await h.close(); }
});

test('smart serving: role targeting, topic priority, even pacing, per-audience capacity and reports', async () => {
  const h = await harness();
  try {
    await createUser(h.db, { name: 'Admin', email: 'admin@smart.test', password, role: 'ADMIN' });
    const admin = await h.login('admin@smart.test');
    const make = async (n: number, slot: string, extra: object = {}) => {
      const r = await h.call(admin, 'POST', '/showcase/admin/campaigns', { ...campaign(n, slot), ...extra });
      assert.equal(r.status, 201); const made = await r.json() as { campaign: { id: string }; reportToken: string };
      assert.equal((await h.call(admin, 'POST', `/showcase/admin/campaigns/${made.campaign.id}/billing`, { billing: 'COMPLIMENTARY' })).status, 200);
      return made;
    };
    const approve = (id: string, extra: object = {}) => h.call(admin, 'POST', `/showcase/admin/campaigns/${id}/status`, { status: 'APPROVED', ...extra });
    const serve = async (slot: string, query = '') => ((await (await fetch(`${h.base}/showcase/promo/serve?slot=${slot}${query}`)).json()).ads as { id: string; company: string }[]);

    // Disjoint audiences share an "exclusive" slot; an overlapping one does not.
    const forHosts = await make(1, 'SPONSOR', { audiences: ['HOST'] });
    const forCreators = await make(2, 'SPONSOR', { audiences: ['CREATOR'] });
    const forEveryone = await make(3, 'SPONSOR');
    assert.equal((await approve(forHosts.campaign.id)).status, 200);
    assert.equal((await approve(forCreators.campaign.id)).status, 200, 'different audiences do not compete');
    assert.equal((await approve(forEveryone.campaign.id)).status, 409, 'a campaign for everyone overlaps both');
    assert.deepEqual((await serve('SPONSOR', '&audience=host')).map(a => a.company), ['شركة 1']);
    assert.deepEqual((await serve('SPONSOR', '&audience=CREATOR')).map(a => a.company), ['شركة 2']);
    assert.deepEqual(await serve('SPONSOR', '&audience=CONSUMER'), [], 'nobody targeted shoppers');
    assert.deepEqual(await serve('SPONSOR'), [], 'no audience means a plain visitor');
    assert.deepEqual(await serve('SPONSOR', '&audience=HACKER'), [], 'unknown roles fall back to visitor');

    // Narrowing is free; widening an approved campaign sends it back to review.
    const narrowed = await (await h.call(admin, 'POST', `/showcase/admin/campaigns/${forHosts.campaign.id}/targeting`, { audiences: ['HOST'], topics: ['حلويات'] })).json();
    assert.equal(narrowed.pausedForReview, false);
    const widened = await (await h.call(admin, 'POST', `/showcase/admin/campaigns/${forCreators.campaign.id}/targeting`, { audiences: ['CREATOR', 'HOST'] })).json();
    assert.equal(widened.pausedForReview, true);
    assert.equal(widened.campaign.status, 'PAUSED');
    assert.deepEqual(widened.campaign.audiences, ['CREATOR', 'HOST']);
    assert.equal((await approve(forCreators.campaign.id)).status, 409, 'now it overlaps the host campaign');
    // Junk in targeting is dropped, not stored.
    const junk = await (await h.call(admin, 'POST', `/showcase/admin/campaigns/${forCreators.campaign.id}/targeting`, { audiences: ['CREATOR', 'ADMIN', 7], topics: ['x'] })).json();
    assert.deepEqual([junk.campaign.audiences, junk.campaign.topics], [['CREATOR'], []]);

    // Market (3 slots): topic match first, neutral next, mismatched last; ties go to the least shown today.
    const m1 = await make(11, 'MARKET'), m2 = await make(12, 'MARKET', { topics: ['مخبوزات'] }), m3 = await make(13, 'MARKET', { topics: ['حلويات'] });
    for (const m of [m1, m2, m3]) assert.equal((await approve(m.campaign.id)).status, 200);
    assert.deepEqual((await serve('MARKET', `&topic=${encodeURIComponent('حلويات')}`)).map(a => a.company), ['شركة 13', 'شركة 11', 'شركة 12']);
    assert.deepEqual((await serve('MARKET', `&topic=${encodeURIComponent('مخبوزات')}`)).map(a => a.company), ['شركة 12', 'شركة 11', 'شركة 13']);
    assert.equal((await serve('MARKET', `&topic=${encodeURIComponent('غير معروف')}`)).length, 3, 'an unknown topic is ignored');

    // Pacing: with capacity trimmed, the least-shown neutral campaign leads the next rotation.
    const p1 = await make(21, 'PORTAL'), p2 = await make(22, 'PORTAL');
    await approve(p1.campaign.id); await approve(p2.campaign.id);
    for (let i = 0; i < 3; i++) await fetch(`${h.base}/showcase/promo/event`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: p1.campaign.id, type: 'impression', audience: 'HOST' }) });
    assert.equal((await serve('PORTAL', '&audience=HOST'))[0].company, 'شركة 22', 'the under-delivered campaign goes first');

    // The company sees which roles saw its ad.
    await fetch(`${h.base}/showcase/promo/event`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: p1.campaign.id, type: 'impression', audience: 'creator' }) });
    await fetch(`${h.base}/showcase/promo/click/${p1.campaign.id}?a=HOST`, { redirect: 'manual' });
    const report = await (await fetch(`${h.base}/showcase/promo/report/${p1.reportToken}`)).json();
    assert.deepEqual(report.audiences.map((a: { audience: string; impressions: number; clicks: number }) => [a.audience, a.impressions, a.clicks]).sort(), [['CREATOR', 1, 0], ['HOST', 3, 1]]);
    assert.equal(report.totals.impressions, 4);
  } finally { await h.close(); }
});

test('admins are told about every public submission; campaign phases and edits behave', async () => {
  const h = await harness();
  try {
    await createUser(h.db, { name: 'Admin', email: 'admin@notify.test', password, role: 'ADMIN' });
    await createUser(h.db, { name: 'Buyer', email: 'buyer@notify.test', password, role: 'CONSUMER' });
    const admin = await h.login('admin@notify.test'), buyer = await h.login('buyer@notify.test');
    const post = (path: string, body: unknown) => fetch(`${h.base}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

    // Three public submissions → three inbox kinds; a repeat coalesces instead of piling up.
    await post('/showcase/businesses', { title: 'مقهى للبيع', sector: 'CAFE', city: 'حولي', summary: 'مقهى بعقد ساري ومعدات كاملة وزبائن ثابتين.', sellerName: 'سالم', contactPhone: '50001234', termsAccepted: true });
    await post('/showcase/businesses', { title: 'مخبز للبيع', sector: 'BAKERY', city: 'السالمية', summary: 'مخبز بعقد ساري ومعدات كاملة وزبائن ثابتين.', sellerName: 'سعد', contactPhone: '50001235', termsAccepted: true });
    await post('/showcase/suppliers', { name: 'مورد', category: 'SPICES', region: 'المباركية', description: 'بهارات مطحونة بحسب الطلب.', contactName: 'سعد', contactPhone: '50002222', termsAccepted: true });
    const ad = await (await post('/showcase/promo/requests', { company: 'شركة التغليف', headline: 'علب مخصصة لمنتجك', linkUrl: 'https://example.com/pack', contactPhone: '50003333', slot: 'PORTAL', audiences: ['HOST', 'BOGUS'], topics: ['حلويات'], accent: 'sky', icon: 'package' })).json();
    const inbox = await h.db.prepare("SELECT dedupe_key, occurrence_count FROM notification_inbox WHERE category='ADMIN_REVIEW' ORDER BY dedupe_key").all<{ dedupe_key: string; occurrence_count: number | string }>();
    assert.deepEqual(inbox.map(r => [r.dedupe_key, Number(r.occurrence_count)]), [['admin-pending:ad', 1], ['admin-pending:business', 2], ['admin-pending:supplier', 1]]);
    assert.equal((await h.db.prepare("SELECT COUNT(*) AS n FROM notification_inbox WHERE user_id IN (SELECT id FROM users WHERE role='CONSUMER')").get<{ n: number | string }>())?.n.toString(), '0', 'shoppers get nothing');

    // The company's choices arrive as submitted (junk dropped) and the admin sees the phase.
    const overview = async () => (await (await h.call(admin, 'GET', '/showcase/admin/overview')).json()).campaigns as { id: string; slot: string; status: string; phase: string; daysLeft: number | null; audiences: string[]; topics: string[]; accent: string; icon: string }[];
    let c = (await overview()).find(x => x.id === ad.id)!;
    assert.deepEqual([c.slot, c.audiences, c.topics, c.accent, c.icon, c.phase], ['PORTAL', ['HOST'], ['حلويات'], 'sky', 'package', 'pending']);
    const dayPlus = (n: number) => kuwaitToday(new Date(Date.now() + n * 86_400_000));
    assert.equal((await h.call(admin, 'POST', `/showcase/admin/campaigns/${ad.id}/status`, { status: 'APPROVED', startsOn: dayPlus(2), endsOn: dayPlus(9) })).status, 409, 'no approval before billing is recorded');
    assert.equal((await h.call(admin, 'POST', `/showcase/admin/campaigns/${ad.id}/billing`, { billing: 'PAID', priceKwd: 150, note: 'تحويل بنكي' })).status, 200);
    assert.equal((await h.call(admin, 'POST', `/showcase/admin/campaigns/${ad.id}/status`, { status: 'APPROVED', startsOn: dayPlus(2), endsOn: dayPlus(9) })).status, 200);
    c = (await overview()).find(x => x.id === ad.id)!;
    assert.deepEqual([c.phase, c.daysLeft], ['scheduled', 9]);
    await h.call(admin, 'POST', `/showcase/admin/campaigns/${ad.id}/status`, { status: 'APPROVED', startsOn: dayPlus(-3), endsOn: dayPlus(5) });
    assert.deepEqual([(await overview()).find(x => x.id === ad.id)!.phase], ['live']);
    // A campaign whose end date has passed reads as ended, whatever its stored status.
    await h.db.prepare("UPDATE ad_campaigns SET ends_on=? WHERE id=?").run(dayPlus(-1), ad.id);
    assert.equal((await overview()).find(x => x.id === ad.id)!.phase, 'ended');
    await h.db.prepare("UPDATE ad_campaigns SET ends_on=? WHERE id=?").run(dayPlus(5), ad.id);

    // Editing words keeps it live; changing the link or slot sends it back to review.
    const edit = (body: object) => h.call(admin, 'POST', `/showcase/admin/campaigns/${ad.id}/edit`, { company: 'شركة التغليف', headline: 'علب مخصصة لمنتجك', linkUrl: 'https://example.com/pack', slot: 'PORTAL', ...body });
    assert.equal((await h.call(buyer, 'POST', `/showcase/admin/campaigns/${ad.id}/edit`, {})).status, 403);
    assert.equal((await edit({ linkUrl: 'http://insecure.example.com' })).status, 400);
    const words = await (await edit({ headline: 'علب أنيقة لمنتجك', tagline: 'كميات صغيرة' })).json();
    assert.deepEqual([words.pausedForReview, words.campaign.status, words.campaign.headline], [false, 'APPROVED', 'علب أنيقة لمنتجك']);
    const moved = await (await edit({ linkUrl: 'https://example.com/other' })).json();
    assert.deepEqual([moved.pausedForReview, moved.campaign.status], [true, 'PAUSED']);
    assert.deepEqual((await (await fetch(`${h.base}/showcase/promo/serve?slot=PORTAL&audience=HOST`)).json()).ads, [], 'a paused campaign stops serving');
  } finally { await h.close(); }
});

test('sponsorship is paid: billing is recorded per campaign, validated, audited, and gates approval', async () => {
  const h = await harness();
  try {
    await createUser(h.db, { name: 'Owner', email: 'owner@bill.test', password, role: 'SUPER_ADMIN' });
    await createUser(h.db, { name: 'Buyer', email: 'buyer@bill.test', password, role: 'CONSUMER' });
    const owner = await h.login('owner@bill.test'), buyer = await h.login('buyer@bill.test');
    const created = await (await h.call(owner, 'POST', '/showcase/admin/campaigns', campaign(1, 'MARKET'))).json();
    const id = created.campaign.id as string;
    const bill = (body: object) => h.call(owner, 'POST', `/showcase/admin/campaigns/${id}/billing`, body);
    const approve = () => h.call(owner, 'POST', `/showcase/admin/campaigns/${id}/status`, { status: 'APPROVED' });
    assert.equal(created.campaign.billing, 'UNSET');
    assert.equal((await h.call(buyer, 'POST', `/showcase/admin/campaigns/${id}/billing`, { billing: 'PAID', priceKwd: 100 })).status, 403);
    assert.equal((await approve()).status, 409);
    assert.equal((await (await approve()).json()).code, 'PAYMENT_REQUIRED');
    assert.equal((await bill({ billing: 'PAID' })).status, 400, 'paid needs an amount');
    assert.equal((await bill({ billing: 'PAID', priceKwd: -5 })).status, 400);
    assert.equal((await bill({ billing: 'PAID', priceKwd: 12.5 })).status, 400, 'whole dinars only');
    assert.equal((await bill({ billing: 'MAYBE' })).status, 400);
    const paid = await (await bill({ billing: 'PAID', priceKwd: 250, note: 'تحويل رقم 123' })).json();
    assert.deepEqual([paid.campaign.billing, paid.campaign.priceKwd, paid.campaign.billingNote], ['PAID', 250, 'تحويل رقم 123']);
    assert.ok(paid.campaign.paidAt);
    assert.equal((await approve()).status, 200);
    assert.equal((await (await fetch(`${h.base}/showcase/promo/serve?slot=MARKET`)).json()).ads.length, 1);
    // Prices and billing never reach the public.
    const served = JSON.stringify(await (await fetch(`${h.base}/showcase/promo/serve?slot=MARKET`)).json());
    assert.ok(!/priceKwd|billing|250|123/.test(served));
    assert.ok(!JSON.stringify(await (await fetch(`${h.base}/showcase/promo/report/${created.reportToken}`)).json()).match(/priceKwd|billing|250/), 'the company report does not echo billing either');
    // Re-saving PAID keeps the original payment date; un-setting pauses an approved campaign.
    const again = await (await bill({ billing: 'PAID', priceKwd: 250 })).json();
    assert.equal(again.campaign.paidAt, paid.campaign.paidAt);
    const unset = await (await bill({ billing: 'UNSET' })).json();
    assert.deepEqual([unset.pausedForReview, unset.campaign.status, unset.campaign.priceKwd], [true, 'PAUSED', null]);
    assert.equal((await bill({ billing: 'COMPLIMENTARY', note: 'ضيافة' })).status, 200, 'explicit complimentary hosting is allowed');
    assert.equal((await approve()).status, 200);
  } finally { await h.close(); }
});

test('A/B test: a second headline is served 50/50, counted per variant, reported with a verdict, and reset when reworded', async () => {
  const h = await harness();
  try {
    await createUser(h.db, { name: 'Admin', email: 'admin@ab.test', password, role: 'ADMIN' });
    const admin = await h.login('admin@ab.test');
    const created = await (await h.call(admin, 'POST', '/showcase/admin/campaigns', campaign(1, 'MARKET'))).json();
    const id = created.campaign.id as string;
    const send = (path: string, body: object) => h.call(admin, 'POST', `/showcase/admin/campaigns/${id}${path}`, body);
    assert.equal((await send('/billing', { billing: 'COMPLIMENTARY' })).status, 200);
    assert.equal((await send('/status', { status: 'APPROVED' })).status, 200);
    const serve = async () => ((await (await fetch(`${h.base}/showcase/promo/serve?slot=MARKET`)).json()).ads as { headline: string; tagline: string; variant?: 'A' | 'B' }[])[0];
    const edit = (extra: object) => send('/edit', { company: 'شركة 1', headline: 'العنوان الأول للإعلان', linkUrl: 'https://example.com/1', slot: 'MARKET', ...extra });

    // No test yet: no variant marker in the payload.
    assert.equal((await serve()).variant, undefined);
    assert.equal((await edit({ bHeadline: 'ب' })).status, 200, 'a too-short B headline just means no test');
    assert.equal((await serve()).variant, undefined);

    const started = await (await edit({ bHeadline: 'العنوان الثاني الأقوى', bTagline: 'سطر ثانٍ' })).json();
    assert.equal(started.campaign.variants.verdict.state, 'not_enough_data');
    const seen = new Set<string>();
    for (let i = 0; i < 60; i++) {
      const ad = await serve();
      seen.add(ad.variant!);
      assert.equal(ad.headline, ad.variant === 'B' ? 'العنوان الثاني الأقوى' : 'العنوان الأول للإعلان');
      if (ad.variant === 'B') assert.equal(ad.tagline, 'سطر ثانٍ');
    }
    assert.deepEqual([...seen].sort(), ['A', 'B'], 'both variants are served');

    // Counting through the public endpoints (rate-limited, so a handful); unknown variants and junk are ignored.
    const event = (variant: unknown) => fetch(`${h.base}/showcase/promo/event`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id, type: 'impression', variant }) });
    for (let i = 0; i < 3; i++) await event('A');
    await event('B'); await event('Z');
    await fetch(`${h.base}/showcase/promo/click/${id}?v=B`, { redirect: 'manual' });
    await fetch(`${h.base}/showcase/promo/click/${id}?v=nope`, { redirect: 'manual' });
    const early = (await (await h.call(admin, 'GET', '/showcase/admin/overview')).json()).campaigns.find((c: { id: string }) => c.id === id);
    assert.deepEqual([early.variants.A, early.variants.B], [{ impressions: 3, clicks: 0 }, { impressions: 1, clicks: 1 }]);
    // A realistic volume goes straight into the counters so the verdict can be checked.
    await h.db.prepare("UPDATE ad_variant_stats SET impressions=1000, clicks=40 WHERE campaign_id=? AND variant='A'").run(id);
    await h.db.prepare("UPDATE ad_variant_stats SET impressions=1000, clicks=70 WHERE campaign_id=? AND variant='B'").run(id);
    const overview = (await (await h.call(admin, 'GET', '/showcase/admin/overview')).json()).campaigns.find((c: { id: string }) => c.id === id);
    assert.deepEqual([overview.variants.A, overview.variants.B], [{ impressions: 1000, clicks: 40 }, { impressions: 1000, clicks: 70 }]);
    assert.equal(overview.variants.verdict.state, 'winner');
    assert.equal(overview.variants.verdict.winner, 'B');
    assert.equal(overview.variants.verdict.liftPercent, 75);
    const report = await (await fetch(`${h.base}/showcase/promo/report/${created.reportToken}`)).json();
    assert.equal(report.variants.verdict.winner, 'B');

    // Rewording starts a fresh experiment; clearing B ends it.
    const reworded = await (await edit({ bHeadline: 'عنوان ثانٍ جديد' })).json();
    assert.deepEqual([reworded.campaign.variants.A, reworded.campaign.variants.B], [{ impressions: 0, clicks: 0 }, { impressions: 0, clicks: 0 }]);
    const ended = await (await edit({})).json();
    assert.equal(ended.campaign.variants, undefined);
    assert.equal((await serve()).variant, undefined);
  } finally { await h.close(); }
});
