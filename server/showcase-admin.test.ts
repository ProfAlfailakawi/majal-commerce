import assert from 'node:assert/strict';
import test from 'node:test';
import { randomBytes } from 'node:crypto';
import express from 'express';
import { AddressInfo } from 'node:net';
import { openMajalDatabase } from './database';
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
  const db = await openMajalDatabase({ filename: ':memory:' });
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

    // Sponsor slot is exclusive; market holds three.
    const ids: string[] = [];
    for (const [n, slot] of [[1, 'SPONSOR'], [2, 'SPONSOR'], [3, 'MARKET'], [4, 'MARKET'], [5, 'MARKET'], [6, 'MARKET']] as const) {
      const r = await h.call(admin, 'POST', '/showcase/admin/campaigns', campaign(n, slot));
      assert.equal(r.status, 201); ids.push((await r.json()).campaign.id);
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
    assert.equal((await (await fetch(`${h.base}/showcase/ads/serve?slot=MARKET`)).json()).ads.length, 3);
    // The future sponsor campaign is approved but not serving yet.
    assert.equal((await (await fetch(`${h.base}/showcase/ads/serve?slot=SPONSOR`)).json()).ads[0].company, 'شركة 1');

    // Creatives: sniffed by content, size-checked, served only while live, removable.
    assert.equal((await h.call(admin, 'POST', `/showcase/admin/campaigns/${ids[2]}/image`, undefined, Buffer.from('<svg onload=alert(1)>'))).status, 422);
    assert.equal((await h.call(admin, 'POST', `/showcase/admin/campaigns/${ids[2]}/image`, undefined, png(100, 100))).status, 422);
    assert.equal((await h.call(admin, 'POST', `/showcase/admin/campaigns/${ids[2]}/image`, undefined, png(1000, 100))).status, 422);
    assert.equal((await h.call(admin, 'POST', `/showcase/admin/campaigns/${ids[2]}/image`, undefined, png(640, 320))).status, 200);
    const img = await fetch(`${h.base}/showcase/ads/img/${ids[2]}`);
    assert.equal(img.status, 200);
    assert.equal(img.headers.get('content-type'), 'image/png');
    assert.equal(img.headers.get('x-content-type-options'), 'nosniff');
    assert.equal((await (await fetch(`${h.base}/showcase/ads/serve?slot=MARKET`)).json()).ads.find((a: { id: string }) => a.id === ids[2]).hasImage, true);
    await h.call(admin, 'POST', `/showcase/admin/campaigns/${ids[2]}/status`, { status: 'PAUSED' });
    assert.equal((await fetch(`${h.base}/showcase/ads/img/${ids[2]}`)).status, 404, 'a paused campaign serves no image');
    await h.call(admin, 'POST', `/showcase/admin/campaigns/${ids[2]}/image/remove`);
    assert.equal((await fetch(`${h.base}/showcase/ads/img/${ids[2]}`)).status, 404);

    // Report link rotation invalidates the old token.
    const created = await (await h.call(admin, 'POST', '/showcase/admin/campaigns', campaign(9, 'PORTAL'))).json();
    const oldToken = created.reportToken;
    assert.equal((await fetch(`${h.base}/showcase/ads/report/${oldToken}`)).status, 200);
    const { reportToken } = await (await h.call(admin, 'POST', `/showcase/admin/campaigns/${created.campaign.id}/rotate-report`)).json();
    assert.equal((await fetch(`${h.base}/showcase/ads/report/${oldToken}`)).status, 404);
    assert.equal((await fetch(`${h.base}/showcase/ads/report/${reportToken}`)).status, 200);

    // Weekly numbers reach the admin overview.
    await fetch(`${h.base}/showcase/ads/event`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: ids[3], type: 'impression' }) });
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
    assert.equal((await h.db.prepare('SELECT COUNT(*) AS n FROM organization_memberships WHERE user_id = ?').get<{ n: number }>(finance.userId))?.n, 0);
  } finally { await h.close(); }
});
