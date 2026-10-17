import assert from 'node:assert/strict';
import test from 'node:test';
import { randomBytes } from 'node:crypto';
import express from 'express';
import { AddressInfo } from 'node:net';
import { createAuthRouter, createUser } from './auth';
import { createAudienceRouter } from './audience';
import { createShowcaseRouter, kuwaitToday } from './showcase';
import { openTestDatabase } from './test-db';

const config = {
  production: false, sessionSecret: 'test-session-secret-that-is-long-enough-123456',
  encryptionKey: 'test-encryption-key-that-is-long-enough-12345', sessionHours: 8, cookieName: 'majal_session', csrfCookieName: 'majal_csrf'
};
const password = `${randomBytes(12).toString('base64url')}-Aa1!`;

async function harness() {
  const db = await openTestDatabase();
  const app = express();
  app.use(express.json());
  app.use('/api/v1/auth', createAuthRouter(db, config));
  app.use('/api/v1/audience', createAudienceRouter(db, config));
  app.use('/api/v1/showcase', createShowcaseRouter(db, config));
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(r => server.once('listening', r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1`;
  const login = async (email: string) => {
    const r = await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password }) });
    const b = await r.json() as { csrfToken: string };
    return { cookie: r.headers.getSetCookie().map(c => c.split(';')[0]).join('; '), csrf: b.csrfToken };
  };
  const post = (path: string, body: unknown, s?: { cookie: string; csrf: string }) => fetch(`${base}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', ...(s ? { cookie: s.cookie, 'x-csrf-token': s.csrf } : {}) }, body: JSON.stringify(body) });
  return { db, base, login, post, close: async () => { await new Promise<void>(r => server.close(() => r())); await db.close(); } };
}

test('anonymous traffic counters: pages, roles, unique browsers per day; junk is ignored', async () => {
  const h = await harness();
  try {
    await createUser(h.db, { name: 'Owner', email: 'admin@aud.test', password, role: 'SUPER_ADMIN' });
    await createUser(h.db, { name: 'Buyer', email: 'buyer@aud.test', password, role: 'CONSUMER' });
    const admin = await h.login('admin@aud.test'), buyer = await h.login('buyer@aud.test');
    for (const body of [
      { surface: 'SHOWCASE', audience: 'VISITOR', firstToday: true }, { surface: 'DIRECTORY', audience: 'VISITOR' },
      { surface: 'CONSUMER', audience: 'consumer', firstToday: true }, { surface: 'HOST', audience: 'HOST', firstToday: true },
      { surface: 'ADMIN', audience: 'VISITOR', firstToday: true }, { surface: 'NOPE', audience: 'VISITOR' }, { surface: 'PUBLIC', audience: 'GOD' }
    ]) assert.equal((await h.post('/audience/pulse', body)).status, 204);
    assert.equal((await h.post('/audience/pulse', { nothing: true })).status, 204);

    // An ordinary administrator is refused too: these are the owner's marketing numbers.
    await createUser(h.db, { name: 'Moderator', email: 'mod@aud.test', password, role: 'ADMIN' });
    const moderator = await h.login('mod@aud.test');
    assert.equal((await fetch(`${h.base}/audience/admin/overview`, { headers: { cookie: moderator.cookie } })).status, 403);
    assert.equal((await h.post('/audience/admin/kit/rotate', {}, moderator)).status, 403);
    assert.equal((await fetch(`${h.base}/audience/admin/overview`)).status, 401);
    assert.equal((await fetch(`${h.base}/audience/admin/overview`, { headers: { cookie: buyer.cookie } })).status, 403);
    const o = await (await fetch(`${h.base}/audience/admin/overview`, { headers: { cookie: admin.cookie } })).json();
    // ADMIN and NOPE were not measured; PUBLIC/GOD fell back to VISITOR. firstToday on ADMIN is dropped with the page.
    assert.equal(o.traffic.totals.views30, 5, 'SHOWCASE, DIRECTORY, CONSUMER, HOST, PUBLIC');
    assert.equal(o.traffic.totals.browsersToday, 3, 'unique browsers come only from firstToday pulses of measured pages');
    assert.deepEqual(o.traffic.bySurface.map((x: { key: string }) => x.key).sort(), ['CONSUMER', 'DIRECTORY', 'HOST', 'PUBLIC', 'SHOWCASE']);
    assert.equal(o.traffic.daily.length, 30);
    assert.equal(o.traffic.daily.at(-1).day, kuwaitToday());
    assert.equal(o.traffic.byAudience.find((a: { key: string }) => a.key === 'VISITOR').visits, 3);
    assert.equal(o.traffic.measuringSince, kuwaitToday());
    assert.equal(o.kit.exists, false);
    assert.equal(o.ads.ctr, 0);
  } finally { await h.close(); }
});

test('gate events count only approved items and show up as top lists', async () => {
  const h = await harness();
  try {
    await createUser(h.db, { name: 'Owner', email: 'admin@gate.test', password, role: 'SUPER_ADMIN' });
    const admin = await h.login('admin@gate.test');
    const now = new Date().toISOString();
    for (const [id, status] of [['biz_a', 'APPROVED'], ['biz_p', 'PENDING_REVIEW']] as const) {
      await h.db.prepare(`INSERT INTO business_listings(id,title,sector,city,summary,seller_name,contact_phone,status,submitted_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)`).run(id, `مشروع ${id}`, 'CAFE', 'حولي', 'وصف طويل بما يكفي للاختبار', 'س', '50000000', status, now, now);
    }
    await h.db.prepare(`INSERT INTO supplier_directory(id,name,category,region,description,contact_name,contact_phone,status,submitted_at,updated_at) VALUES('sup_a','مورد أ','SPICES','المباركية','وصف طويل بما يكفي','س','50000000','APPROVED',?,?)`).run(now, now);
    for (const [kind, id] of [['listing_open', 'biz_a'], ['listing_open', 'biz_a'], ['listing_contact', 'biz_a'], ['listing_open', 'biz_p'], ['supplier_contact', 'sup_a'], ['bogus', 'biz_a'], ['listing_open', 'ghost']]) await h.post('/audience/gate-event', { kind, id });
    const o = await (await fetch(`${h.base}/audience/admin/overview`, { headers: { cookie: admin.cookie } })).json();
    assert.deepEqual([o.gates.listingOpens, o.gates.listingContacts, o.gates.supplierContacts], [2, 1, 1]);
    assert.deepEqual(o.gates.topListings, [{ id: 'biz_a', title: 'مشروع biz_a', opens: 2, contacts: 1 }]);
    assert.equal(o.gates.topSuppliers[0].title, 'مورد أ');
    assert.equal(o.facts.businessesForSale, 1);
    assert.equal(o.facts.directorySuppliers, 1);
  } finally { await h.close(); }
});

test('partner kit: private token, rotation kills the old link, nothing personal inside', async () => {
  const h = await harness();
  try {
    await createUser(h.db, { name: 'Owner', email: 'admin@kit.test', password, role: 'SUPER_ADMIN' });
    await createUser(h.db, { name: 'Buyer', email: 'buyer@kit.test', password, role: 'CONSUMER' });
    const admin = await h.login('admin@kit.test'), buyer = await h.login('buyer@kit.test');
    assert.equal((await h.post('/audience/admin/kit/rotate', {}, buyer)).status, 403);
    assert.equal((await fetch(`${h.base}/audience/partners/${'a'.repeat(48)}`)).status, 404, 'no kit yet');
    const { token } = await (await h.post('/audience/admin/kit/rotate', {}, admin)).json();
    await h.post('/audience/pulse', { surface: 'CONSUMER', audience: 'VISITOR', firstToday: true });
    const kit = await (await fetch(`${h.base}/audience/partners/${token}`)).json();
    assert.equal(kit.free, true);
    assert.equal(kit.traffic.totals.browsers30, 1);
    assert.deepEqual(kit.slots.map((s: { slot: string; capacity: number }) => [s.slot, s.capacity]), [['SPONSOR', 1], ['MARKET', 3], ['PORTAL', 3]]);
    assert.ok(!JSON.stringify(kit).match(/@|phone|email|password/i), 'no personal fields');
    assert.equal((await fetch(`${h.base}/audience/partners/${token.slice(0, -1)}x`)).status, 404);
    const { token: next } = await (await h.post('/audience/admin/kit/rotate', {}, admin)).json();
    assert.notEqual(next, token);
    assert.equal((await fetch(`${h.base}/audience/partners/${token}`)).status, 404);
    assert.equal((await fetch(`${h.base}/audience/partners/${next}`)).status, 200);
  } finally { await h.close(); }
});

test('seller and supplier get a private report link with their own opens and contact taps', async () => {
  const h = await harness();
  try {
    const listing = await (await h.post('/showcase/businesses', { title: 'مقهى للبيع', sector: 'CAFE', city: 'حولي', summary: 'مقهى بعقد ساري ومعدات كاملة وزبائن ثابتين.', sellerName: 'سالم', contactPhone: '50001234', termsAccepted: true, contactPublic: true })).json();
    const supplier = await (await h.post('/showcase/suppliers', { name: 'مورد', category: 'SPICES', region: 'المباركية', description: 'بهارات مطحونة بحسب الطلب.', contactName: 'سعد', contactPhone: '50002222', termsAccepted: true })).json();
    assert.match(listing.reportToken, /^[0-9a-f]{48}$/);
    assert.match(supplier.reportToken, /^[0-9a-f]{48}$/);
    assert.ok(!JSON.stringify(await (await fetch(`${h.base}/showcase/businesses`)).json()).includes(listing.reportToken));
    await h.db.prepare("UPDATE business_listings SET status='APPROVED', reviewed_at=?").run(new Date().toISOString());
    await h.db.prepare("UPDATE supplier_directory SET status='APPROVED', reviewed_at=?").run(new Date().toISOString());
    for (const [kind, id] of [['listing_open', listing.id], ['listing_open', listing.id], ['listing_contact', listing.id], ['supplier_contact', supplier.id]]) await h.post('/audience/gate-event', { kind, id });
    const l = await (await fetch(`${h.base}/audience/gate-report/${listing.reportToken}`)).json();
    assert.deepEqual([l.kind, l.title, l.totals], ['listing', 'مقهى للبيع', { opens: 2, contacts: 1 }]);
    assert.equal(l.daily.length, 30);
    const s = await (await fetch(`${h.base}/audience/gate-report/${supplier.reportToken}`)).json();
    assert.deepEqual([s.kind, s.totals], ['supplier', { opens: 0, contacts: 1 }]);
    assert.ok(!JSON.stringify(l).match(/50001234|سالم/), 'no personal data in the report');
    assert.equal((await fetch(`${h.base}/audience/gate-report/${'f'.repeat(48)}`)).status, 404);
    assert.equal((await fetch(`${h.base}/audience/gate-report/short`)).status, 404);
  } finally { await h.close(); }
});
