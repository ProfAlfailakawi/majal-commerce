import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import { AddressInfo } from 'node:net';
import { AuthConfig, createAuthRouter, createUser } from './auth';
import { MajalDatabase, openMajalDatabase } from './database';
import { createOrdersRouter, createPublicReviewsRouter } from './orders';
import { createCommercePublicRouter, createCommerceRouter, creatorStatement, statementCsv } from './commerce-ops';
import { expireStaleHolds, normalizeKuwaitPhone } from './checkout';
import { PaymentGateway, PaymentRegistry, applyVerifiedPaymentEvent } from './payments';

/*
 * Checkout v2 + Drop operations: server-side validation (phone/branch/zone/slot), DB-level
 * per-branch stock reservation with auto cutoff, pending-payment holds that release stock
 * on expiry or failed payment, and the commerce-ops endpoints built on the same model.
 */

const fixturePassword = (tag: string) => ['Majal', tag, '2026!'].join('-');
const config: AuthConfig = {
  production: false,
  sessionSecret: 'test-session-secret-that-is-long-enough-123456',
  encryptionKey: 'test-encryption-key-that-is-long-enough-12345',
  sessionHours: 8,
  cookieName: 'majal_session',
  csrfCookieName: 'majal_csrf'
};

let refCounter = 0;
class StubGateway implements PaymentGateway {
  readonly provider = 'STUB';
  readonly configured = true;
  async createIntent() {
    refCounter += 1;
    return { providerReference: `pref_${refCounter}`, status: 'REDIRECT_REQUIRED' as const, checkoutUrl: 'https://pay.example.test/checkout' };
  }
  async verifyWebhook(): Promise<never> { throw new Error('NOT_USED'); }
}
const registry: PaymentRegistry = {
  active: new StubGateway(),
  readiness: { configured: true, provider: 'STUB', missing: [], settlementCurrency: 'KWD', contractVersion: 'test' }
};

async function seed(db: MajalDatabase) {
  const now = new Date().toISOString();
  const creator = await createUser(db, { name: 'Creator', email: 'creator@checkout.test', password: fixturePassword('Creator'), role: 'CREATOR' });
  await db.prepare("INSERT INTO creator_profiles(id,user_id,display_name,specialty,created_at,updated_at) VALUES('cr_k',?,'نورة','bakery',?,?)").run(creator.id, now, now);
  await db.prepare("UPDATE users SET creator_id='cr_k' WHERE id=?").run(creator.id);
  await db.prepare(`INSERT INTO organizations(id,commercial_name,organization_type,verification_status,branches_json,created_at,updated_at)
    VALUES('org_k','مطبخ الشرق','HOST','VERIFIED',?,?,?)`).run(JSON.stringify([
    { id: 'br_salmiya', name: 'السالمية', area: 'حولي', isActive: true },
    { id: 'br_jahra', name: 'الجهراء', area: 'الجهراء', isActive: true },
    { id: 'br_closed', name: 'مغلق', area: 'x', isActive: false }
  ]), now, now);
  await db.prepare(`INSERT INTO products(id,creator_id,public_name,category,short_description,status,estimated_unit_cost_fils,target_price_fils,allergens_json,dietary_tags_json,created_at,updated_at)
    VALUES('prod_k','cr_k','مجبوس','MAIN','desc','LIVE_DROP',500,3500,'["سمسم"]','["HALAL"]',?,?)`).run(now, now);
  await db.prepare("INSERT INTO collaborations(id,product_id,creator_id,organization_id,stage,created_at,updated_at) VALUES('col_k','prod_k','cr_k','org_k','LIVE',?,?)").run(now, now);
  // 3.500 KWD per unit, 15% creator royalty, 10% platform fee.
  await db.prepare("INSERT INTO offer_versions(id,collaboration_id,version_number,sender_user_id,selling_price_fils,creator_royalty_basis_points,platform_fee_basis_points,status,terms_json,created_at) VALUES('off_k','col_k',1,?,3500,1500,1000,'ACCEPTED','{}',?)").run(creator.id, now);
  await db.prepare("INSERT INTO launches(id,collaboration_id,product_id,organization_id,status,quantity_cap,starts_at,created_at,updated_at) VALUES('lch_k','col_k','prod_k','org_k','LIVE',100,?,?,?)").run(now, now, now);
  return { creatorEmail: 'creator@checkout.test' };
}

interface Harness { baseUrl: string; db: MajalDatabase; close: () => Promise<void> }
async function harness(): Promise<Harness> {
  const db = await openMajalDatabase({ filename: ':memory:' });
  const app = express();
  app.use(express.json());
  app.use('/api/v1/auth', createAuthRouter(db, config));
  app.use('/api/v1/orders', createOrdersRouter(db, config, registry));
  app.use('/api/v1/public', createPublicReviewsRouter(db));
  app.use('/api/v1/public', createCommercePublicRouter(db));
  app.use('/api/v1/commerce', createCommerceRouter(db, config));
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  await seed(db);
  return { baseUrl, db, close: async () => { await new Promise<void>(r => server.close(() => r())); await db.close(); } };
}

interface Session { cookie: string; csrf: string; userId: string }
let emailCounter = 0;
async function register(baseUrl: string): Promise<Session> {
  emailCounter += 1;
  const response = await fetch(`${baseUrl}/api/v1/auth/register`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Test Person', email: `user${emailCounter}@checkout.test`, phone: '+96550000000', password: fixturePassword('Buyer'), termsAccepted: true, privacyAccepted: true })
  });
  assert.equal(response.status, 201);
  const body = await response.json() as { csrfToken: string; user: { id: string } };
  return { cookie: response.headers.getSetCookie().map(e => e.split(';')[0]).join('; '), csrf: body.csrfToken, userId: body.user.id };
}
async function login(baseUrl: string, email: string, password: string): Promise<Session> {
  const response = await fetch(`${baseUrl}/api/v1/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password }) });
  assert.equal(response.status, 200);
  const body = await response.json() as { csrfToken: string; user: { id: string } };
  return { cookie: response.headers.getSetCookie().map(e => e.split(';')[0]).join('; '), csrf: body.csrfToken, userId: body.user.id };
}
async function hostSession(h: Harness, role = 'HOST_OWNER') {
  const s = await register(h.baseUrl);
  await h.db.prepare("INSERT INTO organization_memberships(organization_id,user_id,role,status,created_at) VALUES('org_k',?,?,'ACTIVE',?)").run(s.userId, role, new Date().toISOString());
  await h.db.prepare("UPDATE users SET role=?, host_business_id='org_k' WHERE id=?").run(role, s.userId);
  return s;
}
const call = (h: Harness, method: string, path: string, session?: Session, body?: unknown, headers: Record<string, string> = {}) =>
  fetch(`${h.baseUrl}${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(session ? { cookie: session.cookie, 'x-csrf-token': session.csrf } : {}), ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
let keyCounter = 0;
const order = (h: Harness, s: Session, body: Record<string, unknown>) =>
  call(h, 'POST', '/api/v1/orders', s, { launchId: 'lch_k', units: 1, contactPhone: '+965 5000 0000', branchId: 'br_salmiya', ...body }, { 'idempotency-key': `checkout-key-${++keyCounter}-000000` });

test('Kuwaiti phone normalisation accepts +965 8-digit numbers only', () => {
  assert.equal(normalizeKuwaitPhone('+965 5000 0000'), '+96550000000');
  assert.equal(normalizeKuwaitPhone('0096599112233'), '+96599112233');
  assert.equal(normalizeKuwaitPhone('65123456'), '+96565123456');
  assert.equal(normalizeKuwaitPhone('+966500000000'), undefined);
  assert.equal(normalizeKuwaitPhone('5000000'), undefined);
  assert.equal(normalizeKuwaitPhone('+96510000000'), undefined);
});

test('checkout validates phone, branch, zone and slot on the server', async () => {
  const h = await harness();
  try {
    const buyer = await register(h.baseUrl);
    const host = await hostSession(h);
    assert.equal((await call(h, 'PUT', '/api/v1/commerce/branches/br_salmiya/logistics', host, {
      deliveryZones: [{ id: 'z_hawalli', nameAr: 'حولي', feeFils: 750, etaMinutes: 45 }],
      pickupSlots: [{ id: 's_7pm', label: '7:00 م', capacityOrders: 1 }]
    })).status, 200);

    const badPhone = await order(h, buyer, { contactPhone: '12345' });
    assert.equal((await badPhone.json() as { code: string }).code, 'INVALID_PHONE');
    const badBranch = await order(h, buyer, { branchId: 'br_closed' });
    assert.equal((await badBranch.json() as { code: string }).code, 'INVALID_BRANCH');
    const noBranch = await order(h, buyer, { branchId: undefined });
    assert.equal((await noBranch.json() as { code: string }).code, 'INVALID_BRANCH', 'two active branches: one must be chosen');
    const badQty = await order(h, buyer, { units: 21 });
    assert.equal((await badQty.json() as { code: string }).code, 'INVALID_UNITS');
    const badZone = await order(h, buyer, { fulfillmentType: 'DELIVERY', deliveryZoneId: 'z_nowhere' });
    assert.equal((await badZone.json() as { code: string }).code, 'INVALID_DELIVERY_ZONE');

    const delivered = await order(h, buyer, { units: 2, fulfillmentType: 'DELIVERY', deliveryZoneId: 'z_hawalli' });
    assert.equal(delivered.status, 201);
    const body = await delivered.json() as { order: { totalFils: number; deliveryFeeFils: number; branchId: string; holdExpiresAt: string }; holdExpiresAt: string };
    assert.equal(body.order.totalFils, 2 * 3500 + 750, 'delivery fee is server-priced');
    assert.equal(body.order.branchId, 'br_salmiya');
    assert.ok(Date.parse(body.holdExpiresAt) > Date.now() + 14 * 60_000, 'a 15-minute payment hold is returned');
    const stored = await h.db.prepare("SELECT contact_phone FROM orders WHERE branch_id='br_salmiya'").get<{ contact_phone: string }>();
    assert.equal(stored?.contact_phone, '+96550000000');

    assert.equal((await order(h, buyer, { pickupSlotId: 's_7pm' })).status, 201);
    const full = await order(h, buyer, { pickupSlotId: 's_7pm' });
    assert.equal((await full.json() as { code: string }).code, 'PICKUP_SLOT_FULL');

    const options = await (await call(h, 'GET', '/api/v1/public/launches/lch_k/checkout-options')).json() as { branches: Array<{ id: string; deliveryZones: unknown[]; pickupSlots: Array<{ available: boolean }> }>; remainingUnits: number };
    assert.deepEqual(options.branches.map(b => b.id), ['br_salmiya', 'br_jahra'], 'inactive branches are hidden');
    assert.equal(options.branches[0].pickupSlots[0].available, false);
    assert.equal(options.remainingUnits, 100 - 3);
  } finally { await h.close(); }
});

test('per-branch stock is reserved atomically and cuts off automatically at capacity', async () => {
  const h = await harness();
  try {
    const host = await hostSession(h, 'HOST_OPERATIONS');
    const stock = await call(h, 'PUT', '/api/v1/commerce/launches/lch_k/branches/br_jahra/stock', host, { capacityUnits: 5, alertThresholdPct: 60 });
    assert.equal(stock.status, 200);
    const buyers = await Promise.all(Array.from({ length: 4 }, () => register(h.baseUrl)));
    // 8 units requested concurrently against 5 units of capacity.
    const results = await Promise.all(buyers.map(b => order(h, b, { branchId: 'br_jahra', units: 2 })));
    const created = results.filter(r => r.status === 201).length;
    assert.equal(created, 2, 'exactly floor(5/2) orders fit');
    const row = await h.db.prepare("SELECT reserved_units FROM launch_branch_stock WHERE launch_id='lch_k' AND branch_id='br_jahra'").get<{ reserved_units: number }>();
    assert.equal(Number(row?.reserved_units), 4);
    const refused = results.find(r => r.status === 409)!;
    assert.equal((await refused.json() as { code: string }).code, 'BRANCH_SOLD_OUT');

    const warRoom = await (await call(h, 'GET', '/api/v1/commerce/host/war-room', host)).json() as { alerts: Array<{ level: string; branchId: string }>; cannedReplies: unknown[] };
    assert.equal(warRoom.alerts[0].branchId, 'br_jahra');
    assert.equal(warRoom.alerts[0].level, 'WARNING', '4/5 = 80% ≥ 60% threshold');
    assert.ok(warRoom.cannedReplies.length >= 5);

    const last = await register(h.baseUrl);
    assert.equal((await order(h, last, { branchId: 'br_jahra', units: 1 })).status, 201);
    const after = await (await call(h, 'GET', '/api/v1/commerce/host/war-room', host)).json() as { alerts: Array<{ level: string }> };
    assert.equal(after.alerts[0].level, 'CUTOFF');
    const opts = await (await call(h, 'GET', '/api/v1/public/launches/lch_k/checkout-options')).json() as { branches: Array<{ id: string; orderingOpen: boolean; remainingUnits: number }> };
    assert.equal(opts.branches.find(b => b.id === 'br_jahra')?.orderingOpen, false);

    // Capacity can't drop under what is already held.
    const shrink = await call(h, 'PUT', '/api/v1/commerce/launches/lch_k/branches/br_jahra/stock', host, { capacityUnits: 2 });
    assert.equal(shrink.status, 409);
    // Support staff cannot change capacity.
    const support = await hostSession(h, 'HOST_SUPPORT');
    assert.equal((await call(h, 'PUT', '/api/v1/commerce/launches/lch_k/branches/br_jahra/stock', support, { capacityUnits: 9 })).status, 403);
    assert.equal((await call(h, 'GET', '/api/v1/commerce/host/canned-replies', support)).status, 200);
  } finally { await h.close(); }
});

test('expired holds and failed payments release reserved stock; PAID keeps it', async () => {
  const h = await harness();
  try {
    const host = await hostSession(h);
    await call(h, 'PUT', '/api/v1/commerce/launches/lch_k/branches/br_salmiya/stock', host, { capacityUnits: 3 });
    const buyer = await register(h.baseUrl);
    const a = await (await order(h, buyer, { units: 1 })).json() as { order: { id: string } };
    const b = await (await order(h, buyer, { units: 1 })).json() as { order: { id: string } };
    const c = await (await order(h, buyer, { units: 1 })).json() as { order: { id: string } };
    const reserved = async () => Number((await h.db.prepare("SELECT reserved_units FROM launch_branch_stock WHERE branch_id='br_salmiya'").get<{ reserved_units: number }>())?.reserved_units);
    assert.equal(await reserved(), 3);

    // Hold expiry releases A.
    await h.db.prepare("UPDATE orders SET hold_expires_at='2000-01-01T00:00:00.000Z' WHERE id=?").run(a.order.id);
    assert.equal(await expireStaleHolds(h.db), 1);
    assert.equal(await expireStaleHolds(h.db), 0, 'idempotent');
    assert.equal(await reserved(), 2);

    // A FAILED webhook releases B.
    const refB = await h.db.prepare('SELECT p.provider_reference, p.amount_fils FROM orders o JOIN payment_intents p ON p.id=o.payment_intent_id WHERE o.id=?').get<{ provider_reference: string; amount_fils: number }>(b.order.id);
    await applyVerifiedPaymentEvent(h.db, { provider: 'STUB', eventId: 'evt_fail', providerReference: refB!.provider_reference, status: 'FAILED', amountFils: Number(refB!.amount_fils), currency: 'KWD' }, Buffer.from('fail'));
    assert.equal(await reserved(), 1);
    assert.equal((await h.db.prepare('SELECT status FROM orders WHERE id=?').get<{ status: string }>(b.order.id))?.status, 'CANCELLED');

    // PAID keeps C's stock and clears the hold; the royalty excludes nothing here (pickup).
    const refC = await h.db.prepare('SELECT p.provider_reference, p.amount_fils FROM orders o JOIN payment_intents p ON p.id=o.payment_intent_id WHERE o.id=?').get<{ provider_reference: string; amount_fils: number }>(c.order.id);
    await applyVerifiedPaymentEvent(h.db, { provider: 'STUB', eventId: 'evt_paid', providerReference: refC!.provider_reference, status: 'PAID', amountFils: Number(refC!.amount_fils), currency: 'KWD' }, Buffer.from('paid'));
    const paid = await h.db.prepare('SELECT status, hold_expires_at FROM orders WHERE id=?').get<{ status: string; hold_expires_at: string | null }>(c.order.id);
    assert.equal(paid?.status, 'PAID');
    assert.equal(paid?.hold_expires_at, null);
    assert.equal(await reserved(), 1);
  } finally { await h.close(); }
});

test('delivery fee is excluded from the creator royalty; statement splits price/commission/host share', async () => {
  const h = await harness();
  try {
    const host = await hostSession(h);
    await call(h, 'PUT', '/api/v1/commerce/branches/br_salmiya/logistics', host, { deliveryZones: [{ id: 'z1', nameAr: 'السالمية', feeFils: 1000, etaMinutes: 30 }], pickupSlots: [] });
    const buyer = await register(h.baseUrl);
    const created = await (await order(h, buyer, { units: 2, fulfillmentType: 'DELIVERY', deliveryZoneId: 'z1' })).json() as { order: { id: string } };
    const ref = await h.db.prepare('SELECT p.provider_reference, p.amount_fils FROM orders o JOIN payment_intents p ON p.id=o.payment_intent_id WHERE o.id=?').get<{ provider_reference: string; amount_fils: number }>(created.order.id);
    assert.equal(Number(ref?.amount_fils), 8000);
    await applyVerifiedPaymentEvent(h.db, { provider: 'STUB', eventId: 'evt_p2', providerReference: ref!.provider_reference, status: 'PAID', amountFils: 8000, currency: 'KWD' }, Buffer.from('p2'));

    const statement = await creatorStatement(h.db, 'cr_k');
    const line = statement.lines[0];
    assert.equal(line.grossFils, 7000);
    assert.equal(line.creatorPayoutFils, 1050, '15% of 7.000, not of 8.000');
    assert.equal(line.commissionFils, 700);
    assert.equal(line.hostShareFils, 7000 - 700 - 1050);
    assert.equal(line.stage, 'PENDING');

    // Approved batch without a provider reference is never "paid".
    const now = new Date().toISOString();
    await h.db.prepare("INSERT INTO settlement_batches(id,creator_id,total_fils,status,created_at,updated_at) VALUES('stl_1','cr_k',1050,'APPROVED',?,?)").run(now, now);
    await h.db.prepare("UPDATE accruals SET status='PAID', settlement_batch_id='stl_1'").run();
    assert.equal((await creatorStatement(h.db, 'cr_k')).lines[0].stage, 'APPROVED');
    await h.db.prepare("UPDATE settlement_batches SET status='PAID', provider_reference='BANK-TRX-991' WHERE id='stl_1'").run();
    const paid = await creatorStatement(h.db, 'cr_k');
    assert.equal(paid.lines[0].stage, 'PAID');
    assert.equal(paid.lines[0].providerReference, 'BANK-TRX-991');
    assert.equal(paid.totals.paidFils, 1050);

    const csv = statementCsv(paid);
    assert.ok(csv.startsWith('﻿"رقم الطلب"'), 'BOM + Arabic header');
    assert.match(csv, /"7\.000","0\.700","5\.250","1\.050","مدفوع"/);

    // HTTP: the creator reads their own statement; a consumer is refused.
    const creator = await login(h.baseUrl, 'creator@checkout.test', fixturePassword('Creator'));
    const viaApi = await call(h, 'GET', '/api/v1/commerce/creator/statement', creator);
    assert.equal(viaApi.status, 200);
    const csvRes = await call(h, 'GET', '/api/v1/commerce/creator/statement.csv', creator);
    assert.match(csvRes.headers.get('content-type') || '', /text\/csv/);
    assert.equal((await call(h, 'GET', '/api/v1/commerce/creator/statement', buyer)).status, 403);
  } finally { await h.close(); }
});

test('public Launch Gate checklist reflects licence, allergens, halal and food-safety expiry', async () => {
  const h = await harness();
  try {
    const host = await hostSession(h);
    const before = await (await call(h, 'GET', '/api/v1/public/launches/lch_k/trust')).json() as { items: Array<{ key: string; status: string; detail: string }> };
    const item = (list: typeof before.items, key: string) => list.find(i => i.key === key)!;
    assert.equal(item(before.items, 'LICENCE').status, 'PASS', 'verified organisation');
    assert.equal(item(before.items, 'ALLERGENS').status, 'PASS');
    assert.match(item(before.items, 'ALLERGENS').detail, /سمسم/);
    assert.equal(item(before.items, 'HALAL').status, 'DECLARED');
    assert.equal(item(before.items, 'FOOD_SAFETY').status, 'MISSING');

    const soon = new Date(Date.now() + 10 * 86_400_000).toISOString();
    assert.equal((await call(h, 'PUT', '/api/v1/commerce/compliance/FOOD_SAFETY_CERT', host, { reference: 'KFSA-2026-1', expiresAt: soon })).status, 200);
    const pending = await (await call(h, 'GET', '/api/v1/public/launches/lch_k/trust')).json() as typeof before;
    assert.equal(item(pending.items, 'FOOD_SAFETY').status, 'PENDING_REVIEW', 'host declarations need admin verification');
    await h.db.prepare("UPDATE compliance_documents SET verified=1 WHERE doc_type='FOOD_SAFETY_CERT'").run();
    const verified = await (await call(h, 'GET', '/api/v1/public/launches/lch_k/trust')).json() as typeof before & { items: Array<{ expiresAt: string }> };
    assert.equal(item(verified.items, 'FOOD_SAFETY').status, 'EXPIRING');
    assert.ok(!JSON.stringify(verified).includes('KFSA-2026-1'), 'document references stay private');
  } finally { await h.close(); }
});

test('waitlist needs WhatsApp consent, host gets wa.me links; follows are per user', async () => {
  const h = await harness();
  try {
    const buyer = await register(h.baseUrl);
    const noConsent = await call(h, 'POST', '/api/v1/commerce/launches/lch_k/waitlist', buyer, { phone: '99112233' });
    assert.equal((await noConsent.json() as { code: string }).code, 'CONSENT_REQUIRED');
    const joined = await call(h, 'POST', '/api/v1/commerce/launches/lch_k/waitlist', buyer, { phone: '99112233', whatsappOptIn: true });
    assert.equal(joined.status, 201);
    assert.equal((await joined.json() as { waiting: number }).waiting, 1);
    // Re-joining does not duplicate.
    await call(h, 'POST', '/api/v1/commerce/launches/lch_k/waitlist', buyer, { phone: '99112233', whatsappOptIn: true });
    const mine = await (await call(h, 'GET', '/api/v1/commerce/waitlist/mine', buyer)).json() as { launchIds: string[] };
    assert.deepEqual(mine.launchIds, ['lch_k']);

    const host = await hostSession(h, 'HOST_MARKETING');
    const list = await (await call(h, 'GET', '/api/v1/commerce/launches/lch_k/waitlist', host)).json() as { entries: Array<{ whatsappUrl: string }> };
    assert.equal(list.entries.length, 1);
    assert.match(list.entries[0].whatsappUrl, /^https:\/\/wa\.me\/96599112233\?text=/);
    assert.equal((await call(h, 'GET', '/api/v1/commerce/launches/lch_k/waitlist', buyer)).status, 403);
    const notified = await (await call(h, 'POST', '/api/v1/commerce/launches/lch_k/waitlist/notify', host, {})).json() as { notified: number };
    assert.equal(notified.notified, 1);
    const inbox = await h.db.prepare("SELECT COUNT(*) AS c FROM notification_inbox WHERE user_id=? AND category='DROP_WAITLIST'").get<{ c: number }>(buyer.userId);
    assert.equal(Number(inbox?.c), 1);

    assert.equal((await call(h, 'POST', '/api/v1/commerce/creators/cr_k/follow', buyer, {})).status, 201);
    assert.equal((await call(h, 'POST', '/api/v1/commerce/creators/cr_missing/follow', buyer, {})).status, 404);
    const followers = await (await call(h, 'GET', '/api/v1/public/creators/cr_k/followers')).json() as { followers: number };
    assert.equal(followers.followers, 1);
    const { notifyCreatorFollowers } = await import('./commerce-ops');
    assert.equal(await notifyCreatorFollowers(h.db, 'lch_k'), 1);
    await call(h, 'DELETE', '/api/v1/commerce/creators/cr_k/follow', buyer);
    const follows = await (await call(h, 'GET', '/api/v1/commerce/follows', buyer)).json() as { follows: unknown[] };
    assert.equal(follows.follows.length, 0);
  } finally { await h.close(); }
});
