import assert from 'node:assert/strict';
import test from 'node:test';
import { randomBytes } from 'node:crypto';
import express from 'express';
import { AddressInfo } from 'node:net';
import { createAuthRouter, createPublicRegistration, createUser } from './auth';
import { createDomainRouter } from './domain';
import { createCommercePublicRouter } from './commerce-ops';
import { createOrdersRouter } from './orders';
import { sweepLaunchSchedule } from './launch-schedule';
import { PaymentGateway, PaymentRegistry } from './payments';
import { openTestDatabase } from './test-db';

const config = {
  production: false, sessionSecret: 'test-session-secret-that-is-long-enough-123456',
  encryptionKey: 'test-encryption-key-that-is-long-enough-12345', sessionHours: 8, cookieName: 'majal_session', csrfCookieName: 'majal_csrf'
};
const password = `${randomBytes(12).toString('base64url')}-Aa1!`;
class Stub implements PaymentGateway {
  readonly provider = 'STUB'; readonly configured = true;
  async createIntent() { return { providerReference: `pref_${randomBytes(4).toString('hex')}`, status: 'REDIRECT_REQUIRED' as const, checkoutUrl: 'https://pay.example.test/c' }; }
  async verifyWebhook(): Promise<never> { throw new Error('NOT_USED'); }
}
const registry: PaymentRegistry = { active: new Stub(), readiness: { configured: true, provider: 'STUB', missing: [], settlementCurrency: 'KWD', contractVersion: 'test' } };

test('a scheduled launch refuses orders until it opens, exposes its opening time, then announces itself', async () => {
  const db = await openTestDatabase();
  const app = express();
  app.use(express.json());
  app.use('/api/v1/auth', createAuthRouter(db, config));
  app.use('/api/v1/domain', createDomainRouter(db, config));
  app.use('/api/v1/orders', createOrdersRouter(db, config, registry));
  app.use('/api/v1/public', createCommercePublicRouter(db));
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(r => server.once('listening', r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1`;
  const login = async (email: string) => {
    const r = await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password }) });
    assert.equal(r.status, 200, email);
    return { cookie: r.headers.getSetCookie().map(c => c.split(';')[0]).join('; '), csrf: ((await r.json()) as { csrfToken: string }).csrfToken };
  };
  let n = 0;
  const post = (s: { cookie: string; csrf: string }, path: string, body: unknown = {}) => fetch(`${base}${path}`, {
    method: 'POST', headers: { cookie: s.cookie, 'x-csrf-token': s.csrf, 'content-type': 'application/json', 'idempotency-key': `idem-open-${++n}-${randomBytes(4).toString('hex')}` }, body: JSON.stringify(body)
  });
  const inbox = async (email: string) => {
    const u = await db.prepare('SELECT id FROM users WHERE email=?').get<{ id: string }>(email);
    return (await db.prepare('SELECT dedupe_key FROM notification_inbox WHERE user_id=? ORDER BY dedupe_key').all<{ dedupe_key: string }>(u!.id)).map(r => r.dedupe_key);
  };
  try {
    const now = new Date().toISOString();
    const host = await createPublicRegistration(db, { name: 'مالك', email: 'host@open.test', phone: '+96550000001', password, role: 'HOST_OWNER' }, { commercialName: 'مطبخ', businessType: 'CENTRAL_KITCHEN' });
    const creator = await createPublicRegistration(db, { name: 'مبدعة', email: 'creator@open.test', phone: '+96550000002', password, role: 'CREATOR' });
    const buyer = await createUser(db, { name: 'مشتري', email: 'buyer@open.test', phone: '+96550000003', password, role: 'CONSUMER' });
    const follower = await createUser(db, { name: 'متابع', email: 'follower@open.test', phone: '+96550000004', password, role: 'CONSUMER' });
    const org = host.host_business_id as string;
    await db.prepare("UPDATE organizations SET verification_status='VERIFIED' WHERE id=?").run(org);
    await db.prepare("INSERT INTO products(id,creator_id,public_name,category,short_description,status,estimated_unit_cost_fils,target_price_fils,created_at,updated_at) VALUES('prod_o',?,'مجبوس','MEAL','d','LIVE_DROP',500,10000,?,?)").run(creator.creator_id, now, now);
    await db.prepare("INSERT INTO collaborations(id,product_id,creator_id,organization_id,stage,created_at,updated_at) VALUES('col_o','prod_o',?,?,'SIGNED',?,?)").run(creator.creator_id, org, now, now);
    await db.prepare("INSERT INTO offer_versions(id,collaboration_id,version_number,sender_user_id,selling_price_fils,creator_royalty_basis_points,platform_fee_basis_points,status,terms_json,created_at) VALUES('off_o','col_o',1,?,10000,1500,1000,'ACCEPTED','{}',?)").run(creator.id, now);
    await db.prepare("INSERT INTO contract_versions(id,collaboration_id,version_number,document_sha256,object_storage_key,status,created_at) VALUES('ctr_o','col_o',1,'h','k','FULLY_SIGNED',?)").run(now);
    for (const key of ['productionRecipeApproved', 'productNamePriceApproved', 'packagingDataCompleted', 'productionLocationSelected', 'settlementConfigApproved'])
      await db.prepare("INSERT INTO launch_gate_items(collaboration_id,gate_key,value,updated_by_user_id,updated_at) VALUES('col_o',?,1,?,?)").run(key, host.id, now);
    await db.prepare("INSERT INTO launches(id,collaboration_id,product_id,organization_id,status,quantity_cap,created_at,updated_at) VALUES('lch_o','col_o','prod_o',?,'PREPARING',100,?,?)").run(org, now, now);
    await db.prepare("INSERT INTO creator_follows(user_id,creator_id,alerts_opt_in,created_at) VALUES(?,?,1,?)").run(follower.id, creator.creator_id, now);

    const h = await login('host@open.test'), b = await login('buyer@open.test');
    assert.equal((await post(h, '/domain/collaborations/col_o/launch/activate', { opensAt: 'tomorrow-ish' })).status, 400);
    assert.equal((await post(h, '/domain/collaborations/col_o/launch/activate', { opensAt: new Date(Date.now() + 10_000).toISOString() })).status, 400, 'under two minutes ahead');

    const opensAt = new Date(Date.now() + 3 * 3_600_000).toISOString();
    const activated = await post(h, '/domain/collaborations/col_o/launch/activate', { opensAt });
    assert.equal(activated.status, 200, await activated.clone().text());
    const body = await activated.json() as { scheduled: boolean; startsAt: string };
    assert.deepEqual([body.scheduled, body.startsAt], [true, opensAt]);
    const row = await db.prepare("SELECT status, starts_at, open_notified_at FROM launches WHERE id='lch_o'").get<{ status: string; starts_at: string; open_notified_at: string | null }>();
    assert.deepEqual([row?.status, row?.starts_at, row?.open_notified_at], ['LIVE', opensAt, null]);
    assert.deepEqual(await inbox('follower@open.test'), [], 'followers are not told at scheduling time');

    // Visible and countable, but not orderable.
    const options = await (await fetch(`${base}/public/launches/lch_o/checkout-options`)).json() as { startsAt: string; serverNow: string };
    assert.equal(options.startsAt, opensAt);
    assert.ok(Math.abs(Date.parse(options.serverNow) - Date.now()) < 60_000);
    const early = await post(b, '/orders', { launchId: 'lch_o', units: 1, contactPhone: '+96550000003', fulfillmentType: 'PICKUP' });
    assert.equal(early.status, 409);
    assert.equal((await early.json() as { code: string }).code, 'LAUNCH_NOT_STARTED');

    // The hour before: reminder; then it opens and the follower hears about it.
    await db.prepare("UPDATE launches SET starts_at=? WHERE id='lch_o'").run(new Date(Date.now() + 30 * 60_000).toISOString());
    assert.deepEqual(await sweepLaunchSchedule(db), { reminded: 1, opened: 0 });
    assert.deepEqual(await inbox('follower@open.test'), ['launch-soon:lch_o']);
    await db.prepare("UPDATE launches SET starts_at=? WHERE id='lch_o'").run(new Date(Date.now() - 1_000).toISOString());
    assert.deepEqual(await sweepLaunchSchedule(db), { reminded: 0, opened: 1 });
    assert.deepEqual(await inbox('follower@open.test'), ['follow-launch:lch_o', 'launch-soon:lch_o']);
    assert.deepEqual(await inbox('buyer@open.test'), [], 'someone on neither list is told nothing');

    const open = await post(b, '/orders', { launchId: 'lch_o', units: 1, contactPhone: '+96550000003', fulfillmentType: 'PICKUP' });
    assert.notEqual((await open.clone().json() as { code?: string }).code, 'LAUNCH_NOT_STARTED', 'once open, the start-time guard no longer refuses');
  } finally { await new Promise<void>(r => server.close(() => r())); await db.close(); }
});
