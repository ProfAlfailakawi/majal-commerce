import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import { AddressInfo } from 'node:net';
import { openTestDatabase } from './test-db';
import { createShowcaseRouter, kuwaitToday, publicHttpsUrl } from './showcase';

const config = {
  production: false, sessionSecret: 'test-session-secret-that-is-long-enough-123456',
  encryptionKey: 'test-encryption-key-that-is-long-enough-12345', sessionHours: 8, cookieName: 'majal_session', csrfCookieName: 'majal_csrf'
};

async function withApp(run: (base: string, db: Awaited<ReturnType<typeof openTestDatabase>>) => Promise<void>) {
  const db = await openTestDatabase();
  const app = express();
  app.use(express.json());
  app.use('/api/v1/showcase', createShowcaseRouter(db, config));
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  try { await run(`http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1/showcase`, db); }
  finally { await new Promise<void>(resolve => server.close(() => resolve())); await db.close(); }
}
const post = (url: string, body: unknown) => fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

const listing = { title: 'مقهى جاهز للتسليم', sector: 'CAFE', city: 'حولي', summary: 'مقهى بعقد إيجار ساري ومعدات كاملة وقاعدة زبائن ثابتة.', sellerName: 'سالم', contactPhone: '+965 5000 1234', termsAccepted: true };

test('a submitted business stays hidden until approved, and the phone only shows with consent', async () => {
  await withApp(async (base, db) => {
    const created = await post(`${base}/businesses`, { ...listing, contactPublic: false });
    assert.equal(created.status, 201);
    assert.deepEqual((await (await fetch(`${base}/businesses`)).json()).listings, []);
    await db.prepare("UPDATE business_listings SET status='APPROVED', reviewed_at=?").run(new Date().toISOString());
    const [hidden] = (await (await fetch(`${base}/businesses`)).json()).listings;
    assert.equal(hidden.title, listing.title);
    assert.equal('contactPhone' in hidden, false);
    assert.equal('sellerName' in hidden, false);
    await db.prepare('UPDATE business_listings SET contact_public=1').run();
    const [shown] = (await (await fetch(`${base}/businesses`)).json()).listings;
    assert.equal(shown.contactPhone, '+96550001234');
  });
});

test('invalid or unconfirmed submissions are rejected and honeypot hits are silently dropped', async () => {
  await withApp(async (base, db) => {
    assert.equal((await post(`${base}/businesses`, { ...listing, contactPhone: 'abc' })).status, 400);
    assert.equal((await post(`${base}/businesses`, { ...listing, termsAccepted: false })).status, 400);
    assert.equal((await post(`${base}/businesses`, { ...listing, askingPriceKwd: -5 })).status, 400);
    assert.equal((await post(`${base}/businesses`, { ...listing, website: 'http://spam.example' })).status, 201);
    assert.equal(Number((await db.prepare('SELECT COUNT(*) AS n FROM business_listings').get<{ n: number }>())?.n), 0);
  });
});

test('admin routes require a session', async () => {
  await withApp(async base => {
    assert.equal((await fetch(`${base}/admin/overview`)).status, 401);
    assert.equal((await post(`${base}/admin/campaigns`, {})).status, 401);
  });
});

test('ads: pending requests never serve; live ones count impressions and clicks and redirect only to the approved link', async () => {
  await withApp(async (base, db) => {
    const req = await post(`${base}/promo/requests`, { company: 'شركة التغليف', headline: 'علب مخصصة لمنتجك', linkUrl: 'https://example.com/pack', contactPhone: '+96550001111', slot: 'MARKET' });
    assert.equal(req.status, 201);
    const { id, reportToken } = await req.json();
    assert.deepEqual((await (await fetch(`${base}/promo/serve?slot=MARKET`)).json()).ads, []);
    await db.prepare("UPDATE ad_campaigns SET status='APPROVED' WHERE id=?").run(id);
    const { ads } = await (await fetch(`${base}/promo/serve?slot=MARKET`)).json();
    assert.equal(ads.length, 1);
    assert.ok(!('linkUrl' in ads[0]) && !('contactPhone' in ads[0]));
    assert.equal((await post(`${base}/promo/event`, { id, type: 'impression' })).status, 204);
    const click = await fetch(`${base}/promo/click/${id}`, { redirect: 'manual' });
    assert.equal(click.status, 302);
    assert.ok(click.headers.get('location')!.startsWith('https://example.com/pack?utm_source=majal'));
    const report = await (await fetch(`${base}/promo/report/${reportToken}`)).json();
    assert.deepEqual(report.totals, { impressions: 1, clicks: 1 });
    assert.equal(report.ctr, 100);
    assert.equal((await fetch(`${base}/promo/report/${'x'.repeat(48)}`)).status, 404);
    // Outside its dates the campaign stops serving and clicking.
    await db.prepare("UPDATE ad_campaigns SET ends_on='2000-01-01' WHERE id=?").run(id);
    assert.deepEqual((await (await fetch(`${base}/promo/serve?slot=MARKET`)).json()).ads, []);
    assert.equal((await fetch(`${base}/promo/click/${id}`, { redirect: 'manual' })).headers.get('location'), '/');
    assert.equal((await fetch(`${base}/promo/serve?slot=NOPE`)).status, 400);
  });
});

test('ad links must be public https URLs', () => {
  assert.ok(publicHttpsUrl('https://shop.example.com/a'));
  for (const bad of ['http://example.com', 'https://localhost/x', 'https://127.0.0.1/x', 'javascript:alert(1)', 'https://user:pw@example.com', 'https://intranet/x']) assert.equal(publicHttpsUrl(bad), undefined, bad);
  assert.match(kuwaitToday(), /^\d{4}-\d{2}-\d{2}$/);
});

const supplier = { name: 'مؤسسة الندى للتغليف', category: 'PACKAGING', region: 'الري', description: 'علب وأكياس تغليف غذائي بكميات صغيرة وكبيرة.', contactName: 'ندى', contactPhone: '+965 6000 7777', termsAccepted: true };

test('supplier directory: hidden until approved, phone only with consent, invalid input refused', async () => {
  await withApp(async (base, db) => {
    assert.equal((await post(`${base}/suppliers`, { ...supplier, category: 'NOPE' })).status, 400);
    assert.equal((await post(`${base}/suppliers`, { ...supplier, termsAccepted: false })).status, 400);
    assert.equal((await post(`${base}/suppliers`, { ...supplier, contactPhone: 'x' })).status, 400);
    assert.equal((await post(`${base}/suppliers`, { ...supplier, website: 'spam' })).status, 201);
    assert.equal(Number((await db.prepare('SELECT COUNT(*) AS n FROM supplier_directory').get<{ n: number }>())?.n), 0, 'honeypot writes nothing');
    assert.equal((await post(`${base}/suppliers`, { ...supplier, products: ['علب', 'أكياس'], delivers: true })).status, 201);
    assert.deepEqual((await (await fetch(`${base}/suppliers`)).json()).suppliers, []);
    await db.prepare("UPDATE supplier_directory SET status='APPROVED', reviewed_at=?").run(new Date().toISOString());
    const [hidden] = (await (await fetch(`${base}/suppliers`)).json()).suppliers;
    assert.deepEqual([hidden.name, hidden.delivers, hidden.products], ['مؤسسة الندى للتغليف', true, ['علب', 'أكياس']]);
    assert.ok(!('contactPhone' in hidden) && !('contactName' in hidden));
    await db.prepare('UPDATE supplier_directory SET contact_public=1').run();
    assert.equal((await (await fetch(`${base}/suppliers`)).json()).suppliers[0].contactPhone, '+96560007777');
  });
});
