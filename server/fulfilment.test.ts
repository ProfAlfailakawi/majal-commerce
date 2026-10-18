import assert from 'node:assert/strict';
import test from 'node:test';
import { randomBytes } from 'node:crypto';
import express from 'express';
import { AddressInfo } from 'node:net';
import { createAuthRouter, createPublicRegistration, createUser } from './auth';
import { createCommerceRouter } from './commerce-ops';
import { createDomainRouter } from './domain';
import { applyVerifiedPaymentEvent } from './payments';
import { openTestDatabase } from './test-db';

const config = {
  production: false, sessionSecret: 'test-session-secret-that-is-long-enough-123456',
  encryptionKey: 'test-encryption-key-that-is-long-enough-12345', sessionHours: 8, cookieName: 'majal_session', csrfCookieName: 'majal_csrf'
};
const password = `${randomBytes(12).toString('base64url')}-Aa1!`;

test('order fulfilment: staff mark PAID orders delivered, which releases the creator royalty exactly once', async () => {
  const db = await openTestDatabase();
  const app = express();
  app.use(express.json());
  app.use('/api/v1/auth', createAuthRouter(db, config));
  app.use('/api/v1/domain', createDomainRouter(db, config));
  app.use('/api/v1/commerce', createCommerceRouter(db, config));
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(r => server.once('listening', r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1`;
  type S = { cookie: string; csrf: string };
  const login = async (email: string): Promise<S> => {
    const r = await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password }) });
    assert.equal(r.status, 200, email);
    return { cookie: r.headers.getSetCookie().map(c => c.split(';')[0]).join('; '), csrf: ((await r.json()) as { csrfToken: string }).csrfToken };
  };
  const post = (s: S, path: string) => fetch(`${base}${path}`, { method: 'POST', headers: { cookie: s.cookie, 'x-csrf-token': s.csrf, 'content-type': 'application/json' }, body: '{}' });
  const get = (s: S, path: string) => fetch(`${base}${path}`, { headers: { cookie: s.cookie } });
  const accrual = async (orderId: string) => (await db.prepare('SELECT status FROM accruals WHERE order_id = ?').get<{ status: string }>(orderId))?.status;
  try {
    const now = new Date().toISOString();
    const host = await createPublicRegistration(db, { name: 'مالك', email: 'owner@ful.test', phone: '+96550000031', password, role: 'HOST_OWNER' }, { commercialName: 'مطبخ', businessType: 'CENTRAL_KITCHEN' });
    const other = await createPublicRegistration(db, { name: 'مالك آخر', email: 'owner2@ful.test', phone: '+96550000032', password, role: 'HOST_OWNER' }, { commercialName: 'مطبخ ثانٍ', businessType: 'BAKERY' });
    const creator = await createPublicRegistration(db, { name: 'مبدعة', email: 'creator@ful.test', phone: '+96550000033', password, role: 'CREATOR' });
    const buyer = await createUser(db, { name: 'مشتري', email: 'buyer@ful.test', phone: '+96550000034', password, role: 'CONSUMER' });
    const org = host.host_business_id as string;
    await createUser(db, { name: 'شيف', email: 'chef@ful.test', phone: '+96550000035', password, role: 'HOST_CHEF', hostBusinessId: org });
    await createUser(db, { name: 'مالية', email: 'fin@ful.test', phone: '+96550000036', password, role: 'HOST_FINANCE', hostBusinessId: org });
    await createUser(db, { name: 'أدمن', email: 'admin@ful.test', phone: '+96550000037', password, role: 'ADMIN' });
    await db.prepare("INSERT INTO organization_memberships(organization_id,user_id,role,status,created_at) SELECT ?, id, role, 'ACTIVE', ? FROM users WHERE email IN ('chef@ful.test','fin@ful.test')").run(org, now);
    await db.prepare("INSERT INTO products(id,creator_id,public_name,category,short_description,status,estimated_unit_cost_fils,target_price_fils,created_at,updated_at) VALUES('prod_f',?,'كنافة','DESSERT','d','LIVE_DROP',500,10000,?,?)").run(creator.creator_id, now, now);
    await db.prepare("INSERT INTO collaborations(id,product_id,creator_id,organization_id,stage,created_at,updated_at) VALUES('col_f','prod_f',?,?,'LIVE_TRIAL',?,?)").run(creator.creator_id, org, now, now);
    await db.prepare("INSERT INTO offer_versions(id,collaboration_id,version_number,sender_user_id,selling_price_fils,creator_royalty_basis_points,platform_fee_basis_points,status,terms_json,created_at) VALUES('off_f','col_f',1,?,10000,1500,1000,'ACCEPTED','{}',?)").run(creator.id, now);
    await db.prepare("INSERT INTO launches(id,collaboration_id,product_id,organization_id,status,created_at,updated_at) VALUES('lch_f','col_f','prod_f',?,'LIVE',?,?)").run(org, now, now);
    for (const n of [1, 2, 3]) {
      await db.prepare("INSERT INTO payment_intents(id,order_public_id,user_id,provider,amount_fils,currency,status,idempotency_key,provider_reference,created_at,updated_at) VALUES(?,?,?,'TEST',20000,'KWD','REDIRECT_REQUIRED',?,?,?,?)").run(`pi_${n}`, `ord_f${n}`, buyer.id, `idem-ful-${n}-0000`, `pref_f${n}`, now, now);
      await db.prepare("INSERT INTO orders(id,launch_id,consumer_user_id,payment_intent_id,units,unit_price_fils,total_fils,status,created_at,updated_at) VALUES(?,?,?,?,2,10000,20000,'PENDING_PAYMENT',?,?)").run(`ord_f${n}`, 'lch_f', buyer.id, `pi_${n}`, now, now);
    }
    // Order 1 and 2 get paid through the real webhook path; order 3 stays unpaid.
    for (const n of [1, 2]) await applyVerifiedPaymentEvent(db, { provider: 'TEST', eventId: `evt_${n}`, providerReference: `pref_f${n}`, status: 'PAID', amountFils: 20000, currency: 'KWD' }, Buffer.from(`{"n":${n}}`));
    assert.equal(await accrual('ord_f1'), 'PENDING', 'a paid order accrues a PENDING royalty, not an eligible one');

    const chef = await login('chef@ful.test'), fin = await login('fin@ful.test'), admin = await login('admin@ful.test');
    const owner = await login('owner@ful.test'), stranger = await login('owner2@ful.test'), buyerS = await login('buyer@ful.test');

    // The worklist shows only this establishment's paid orders.
    const list = await (await get(chef, '/commerce/host/orders')).json() as { awaiting: number; orders: { id: string; customer: string }[] };
    assert.deepEqual(list.orders.map(o => o.id).sort(), ['ord_f1', 'ord_f2']);
    assert.equal(list.awaiting, 2);
    assert.equal((await (await get(stranger, '/commerce/host/orders')).json() as { orders: unknown[] }).orders.length, 0);
    assert.equal((await get(fin, '/commerce/host/orders')).status, 403, 'finance does not see customer contact details');

    // Who may and may not.
    assert.equal((await post(buyerS, '/commerce/orders/ord_f1/fulfil')).status, 403, 'a customer cannot fulfil');
    assert.equal((await post(fin, '/commerce/orders/ord_f1/fulfil')).status, 403, 'finance does not deliver');
    assert.equal((await post(stranger, '/commerce/orders/ord_f1/fulfil')).status, 404, 'another establishment cannot see the order');
    assert.equal((await post(chef, '/commerce/orders/ord_f3/fulfil')).status, 409, 'an unpaid order cannot be fulfilled');
    assert.equal(await accrual('ord_f1'), 'PENDING');

    // Fulfil: the order, the royalty, the ledger, the audit trail and both notifications move together.
    const done = await post(chef, '/commerce/orders/ord_f1/fulfil');
    assert.equal(done.status, 200);
    assert.equal((await db.prepare("SELECT status, fulfilled_by_user_id FROM orders WHERE id='ord_f1'").get<{ status: string; fulfilled_by_user_id: string }>())?.status, 'FULFILLED');
    assert.equal(await accrual('ord_f1'), 'ELIGIBLE');
    assert.equal(Number((await db.prepare("SELECT COUNT(*) AS c FROM financial_ledger WHERE entity_id='ord_f1' AND entry_type='ORDER_FULFILLED'").get<{ c: number }>())?.c), 1);
    assert.equal(Number((await db.prepare("SELECT COUNT(*) AS c FROM domain_audit_events WHERE entity_id='ord_f1' AND action='ORDER_FULFILLED'").get<{ c: number }>())?.c), 1);
    assert.equal((await db.prepare("SELECT title FROM notification_inbox WHERE entity_id='ord_f1' AND category='ORDER' AND user_id=?").get<{ title: string }>(buyer.id))?.title, 'تم تنفيذ طلبك');
    assert.equal((await db.prepare("SELECT title FROM notification_inbox WHERE entity_id='ord_f1' AND category='SETTLEMENT' AND user_id=?").get<{ title: string }>(creator.id))?.title, 'استحقاق جديد مؤهل للتسوية');

    // Idempotent: a second click (or a second staff member) changes nothing and duplicates nothing.
    const again = await post(owner, '/commerce/orders/ord_f1/fulfil');
    assert.equal(again.status, 200);
    assert.equal((await again.json() as { alreadyFulfilled?: boolean }).alreadyFulfilled, true);
    assert.equal(Number((await db.prepare("SELECT COUNT(*) AS c FROM financial_ledger WHERE entity_id='ord_f1' AND entry_type='ORDER_FULFILLED'").get<{ c: number }>())?.c), 1);

    // Concurrent double submit on another order: exactly one wins the transition.
    const [a, b] = await Promise.all([post(chef, '/commerce/orders/ord_f2/fulfil'), post(owner, '/commerce/orders/ord_f2/fulfil')]);
    assert.deepEqual([a.status, b.status], [200, 200]);
    assert.equal(Number((await db.prepare("SELECT COUNT(*) AS c FROM financial_ledger WHERE entity_id='ord_f2' AND entry_type='ORDER_FULFILLED'").get<{ c: number }>())?.c), 1);

    // The creator's royalties are now settlement-eligible; a refund after delivery still reverses them.
    assert.equal(await accrual('ord_f2'), 'ELIGIBLE');
    await applyVerifiedPaymentEvent(db, { provider: 'TEST', eventId: 'evt_r2', providerReference: 'pref_f2', status: 'REFUNDED', amountFils: 20000, currency: 'KWD' }, Buffer.from('{"r":2}'));
    assert.equal(await accrual('ord_f2'), 'REVERSED');
    assert.equal((await post(admin, '/commerce/orders/ord_f2/fulfil')).status, 409, 'a refunded order cannot be fulfilled');
    const fulfilled = await (await get(chef, '/commerce/host/orders?status=FULFILLED')).json() as { orders: { id: string }[] };
    assert.deepEqual(fulfilled.orders.map(o => o.id), ['ord_f1']);
  } finally {
    server.close();
    await db.close();
  }
});
