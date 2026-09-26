import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import { AddressInfo } from 'node:net';
import { AuthConfig, createAuthRouter, createUser } from './auth';
import { MajalDatabase, openMajalDatabase } from './database';
import { createOrdersRouter, createPublicReviewsRouter } from './orders';
import { createModerationRouter } from './moderation';
import { PaymentGateway, PaymentRegistry } from './payments';

/**
 * Order → review → moderation endpoints
 * -------------------------------------
 * The PAID → accrual → refund half of the pipeline is covered by orders.test.ts. These tests
 * cover the half that did not exist: creating the order at all, reviewing only what you
 * actually bought, and admin moderation that reaches the server instead of the browser tab.
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

class StubGateway implements PaymentGateway {
  readonly provider = 'STUB';
  constructor(readonly configured: boolean) {}
  async createIntent() {
    return { providerReference: `pref_${Math.random().toString(36).slice(2)}`, status: 'REDIRECT_REQUIRED' as const, checkoutUrl: 'https://pay.example.test/checkout' };
  }
  async verifyWebhook(): Promise<never> { throw new Error('NOT_USED'); }
}

const registryFor = (configured: boolean): PaymentRegistry => ({
  active: new StubGateway(configured),
  readiness: { configured, provider: configured ? 'STUB' : null, missing: [], settlementCurrency: 'KWD', contractVersion: 'test' }
});

/** Accepted offer prices the unit at 10.000 KWD; the launch caps the drop at 5 units. */
async function seedCatalog(db: MajalDatabase, quantityCap: number | null = 5) {
  const now = new Date().toISOString();
  const creator = await createUser(db, { name: 'Creator', email: 'creator@commerce.test', password: fixturePassword('Creator'), role: 'CREATOR' });
  await db.prepare("INSERT INTO creator_profiles(id,user_id,display_name,specialty,created_at,updated_at) VALUES('cr_c',?,'C','bakery',?,?)").run(creator.id, now, now);
  await db.prepare("INSERT INTO organizations(id,commercial_name,organization_type,verification_status,created_at,updated_at) VALUES('org_c','Host','HOST','VERIFIED',?,?)").run(now, now);
  await db.prepare("INSERT INTO products(id,creator_id,public_name,category,short_description,status,estimated_unit_cost_fils,target_price_fils,created_at,updated_at) VALUES('prod_c','cr_c','Cake','DESSERT','desc','LIVE_PERMANENT',500,10000,?,?)").run(now, now);
  await db.prepare("INSERT INTO collaborations(id,product_id,creator_id,organization_id,stage,created_at,updated_at) VALUES('col_c','prod_c','cr_c','org_c','LIVE',?,?)").run(now, now);
  await db.prepare("INSERT INTO offer_versions(id,collaboration_id,version_number,sender_user_id,selling_price_fils,creator_royalty_basis_points,platform_fee_basis_points,status,terms_json,created_at) VALUES('off_c','col_c',1,?,10000,1500,1000,'ACCEPTED','{}',?)").run(creator.id, now);
  await db.prepare("INSERT INTO launches(id,collaboration_id,product_id,organization_id,status,quantity_cap,starts_at,created_at,updated_at) VALUES('lch_c','col_c','prod_c','org_c','LIVE',?,?,?,?)").run(quantityCap, now, now, now);
}

interface Harness {
  baseUrl: string;
  db: MajalDatabase;
  close: () => Promise<void>;
}

async function harness(paymentsConfigured = true): Promise<Harness> {
  const db = await openMajalDatabase({ filename: ':memory:' });
  const app = express();
  app.use(express.json());
  app.use('/api/v1/auth', createAuthRouter(db, config));
  app.use('/api/v1/orders', createOrdersRouter(db, config, registryFor(paymentsConfigured)));
  app.use('/api/v1/moderation', createModerationRouter(db, config));
  app.use('/api/v1/public', createPublicReviewsRouter(db));
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return {
    baseUrl,
    db,
    close: async () => {
      await new Promise<void>(resolve => server.close(() => resolve()));
      await db.close();
    }
  };
}

interface Session { cookie: string; csrf: string; userId: string }

async function register(baseUrl: string, email: string, tag: string): Promise<Session> {
  const response = await fetch(`${baseUrl}/api/v1/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Test Person', email, phone: '+96550000000', password: fixturePassword(tag), termsAccepted: true, privacyAccepted: true })
  });
  assert.equal(response.status, 201);
  const body = await response.json() as { csrfToken: string; user: { id: string } };
  const cookie = response.headers.getSetCookie().map(entry => entry.split(';')[0]).join('; ');
  return { cookie, csrf: body.csrfToken, userId: body.user.id };
}

const post = (baseUrl: string, path: string, session: Session, body: unknown, extraHeaders: Record<string, string> = {}) =>
  fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: session.cookie, 'x-csrf-token': session.csrf, ...extraHeaders },
    body: JSON.stringify(body)
  });

const orderKey = (suffix: string) => ({ 'idempotency-key': `order-key-${suffix}-000000` });

test('an order is priced from the accepted offer, never from the client', async () => {
  const h = await harness();
  try {
    await seedCatalog(h.db);
    const buyer = await register(h.baseUrl, 'buyer1@commerce.test', 'Buyer');
    // The client attempts to dictate a price of 1 fils per unit.
    const response = await post(h.baseUrl, '/api/v1/orders', buyer,
      { launchId: 'lch_c', contactPhone: '+96550000000', units: 2, unitPriceFils: 1, totalFils: 2 }, orderKey('a'));
    assert.equal(response.status, 201);
    const body = await response.json() as { order: { unitPriceFils: number; totalFils: number; status: string }; checkoutUrl: string };
    assert.equal(body.order.unitPriceFils, 10000);
    assert.equal(body.order.totalFils, 20000);
    assert.equal(body.order.status, 'PENDING_PAYMENT');
    assert.equal(body.checkoutUrl, 'https://pay.example.test/checkout');
  } finally {
    await h.close();
  }
});

test('with no payment provider wired the order is refused and nothing is written', async () => {
  const h = await harness(false);
  try {
    await seedCatalog(h.db);
    const buyer = await register(h.baseUrl, 'buyer2@commerce.test', 'Buyer');
    const response = await post(h.baseUrl, '/api/v1/orders', buyer, { launchId: 'lch_c', contactPhone: '+96550000000', units: 1 }, orderKey('b'));
    assert.equal(response.status, 503);
    assert.equal((await response.json() as { code: string }).code, 'PAYMENT_NOT_CONFIGURED');
    const count = await h.db.prepare('SELECT COUNT(*) AS c FROM orders').get<{ c: number }>();
    assert.equal(Number(count?.c), 0, 'a refused order must not leave a row behind');
  } finally {
    await h.close();
  }
});

test('the launch quantity cap is enforced against rows actually written', async () => {
  const h = await harness();
  try {
    await seedCatalog(h.db, 5);
    const buyer = await register(h.baseUrl, 'buyer3@commerce.test', 'Buyer');
    assert.equal((await post(h.baseUrl, '/api/v1/orders', buyer, { launchId: 'lch_c', contactPhone: '+96550000000', units: 4 }, orderKey('c1'))).status, 201);
    const overflow = await post(h.baseUrl, '/api/v1/orders', buyer, { launchId: 'lch_c', contactPhone: '+96550000000', units: 2 }, orderKey('c2'));
    assert.equal(overflow.status, 409);
    assert.equal((await overflow.json() as { code: string }).code, 'QUANTITY_CAP_EXCEEDED');
    // The remaining single unit still sells.
    assert.equal((await post(h.baseUrl, '/api/v1/orders', buyer, { launchId: 'lch_c', contactPhone: '+96550000000', units: 1 }, orderKey('c3'))).status, 201);
  } finally {
    await h.close();
  }
});

test('replaying an idempotency key returns the same order instead of charging twice', async () => {
  const h = await harness();
  try {
    await seedCatalog(h.db, null);
    const buyer = await register(h.baseUrl, 'buyer4@commerce.test', 'Buyer');
    const first = await post(h.baseUrl, '/api/v1/orders', buyer, { launchId: 'lch_c', contactPhone: '+96550000000', units: 2 }, orderKey('d'));
    const second = await post(h.baseUrl, '/api/v1/orders', buyer, { launchId: 'lch_c', contactPhone: '+96550000000', units: 2 }, orderKey('d'));
    assert.equal(first.status, 201);
    assert.equal(second.status, 200);
    const firstBody = await first.json() as { order: { id: string } };
    const secondBody = await second.json() as { order: { id: string }; replayed: boolean };
    assert.equal(secondBody.order.id, firstBody.order.id);
    assert.equal(secondBody.replayed, true);
    const count = await h.db.prepare('SELECT COUNT(*) AS c FROM orders').get<{ c: number }>();
    assert.equal(Number(count?.c), 1);
  } finally {
    await h.close();
  }
});

test('a launch that is not live cannot be ordered', async () => {
  const h = await harness();
  try {
    await seedCatalog(h.db);
    await h.db.prepare("UPDATE launches SET status='PAUSED' WHERE id='lch_c'").run();
    const buyer = await register(h.baseUrl, 'buyer5@commerce.test', 'Buyer');
    const response = await post(h.baseUrl, '/api/v1/orders', buyer, { launchId: 'lch_c', contactPhone: '+96550000000', units: 1 }, orderKey('e'));
    assert.equal(response.status, 409);
    assert.equal((await response.json() as { code: string }).code, 'LAUNCH_NOT_ORDERABLE');
  } finally {
    await h.close();
  }
});

test('a review requires a paid order that belongs to the reviewer, and only one per order', async () => {
  const h = await harness();
  try {
    await seedCatalog(h.db, null);
    const buyer = await register(h.baseUrl, 'buyer6@commerce.test', 'Buyer');
    const stranger = await register(h.baseUrl, 'stranger@commerce.test', 'Stranger');
    const created = await post(h.baseUrl, '/api/v1/orders', buyer, { launchId: 'lch_c', contactPhone: '+96550000000', units: 1 }, orderKey('f'));
    const orderId = (await created.json() as { order: { id: string } }).order.id;
    const rating = { tasteRating: 5, valueRating: 4, portionRating: 4, keepItVote: true, comment: 'ممتاز' };

    // Unpaid order cannot be reviewed.
    const tooEarly = await post(h.baseUrl, `/api/v1/orders/${orderId}/review`, buyer, rating);
    assert.equal(tooEarly.status, 409);
    assert.equal((await tooEarly.json() as { code: string }).code, 'ORDER_NOT_PAID');

    await h.db.prepare("UPDATE orders SET status='PAID' WHERE id=?").run(orderId);

    // Someone else's paid order is invisible, not merely forbidden.
    assert.equal((await post(h.baseUrl, `/api/v1/orders/${orderId}/review`, stranger, rating)).status, 404);

    assert.equal((await post(h.baseUrl, `/api/v1/orders/${orderId}/review`, buyer, rating)).status, 201);
    const duplicate = await post(h.baseUrl, `/api/v1/orders/${orderId}/review`, buyer, rating);
    assert.equal(duplicate.status, 409);
    assert.equal((await duplicate.json() as { code: string }).code, 'REVIEW_ALREADY_EXISTS');

    // The public summary exposes ratings but no reviewer identity.
    const publicView = await fetch(`${h.baseUrl}/api/v1/public/launches/lch_c/reviews`);
    const summary = await publicView.json() as { summary: { count: number; taste: number; keepItPercent: number }; reviews: Array<Record<string, unknown>> };
    assert.equal(summary.summary.count, 1);
    assert.equal(summary.summary.taste, 5);
    assert.equal(summary.summary.keepItPercent, 100);
    assert.equal(summary.reviews[0].verifiedPurchase, true);
    assert.ok(!('reviewerUserId' in summary.reviews[0]), 'reviewer identity must not leak');
  } finally {
    await h.close();
  }
});

test('suspending an account is enforced server-side and revokes its live sessions', async () => {
  const h = await harness();
  try {
    const victim = await register(h.baseUrl, 'victim@commerce.test', 'Victim');
    const adminUser = await createUser(h.db, { name: 'Admin', email: 'admin@commerce.test', password: fixturePassword('Admin'), role: 'ADMIN' });
    assert.ok(adminUser.id);
    const admin = await register(h.baseUrl, 'adminsession@commerce.test', 'AdminTwo');
    await h.db.prepare("UPDATE users SET role='ADMIN' WHERE id=?").run(admin.userId);

    // The victim's session works before the suspension.
    assert.equal((await fetch(`${h.baseUrl}/api/v1/auth/me`, { headers: { cookie: victim.cookie } })).status, 200);

    const response = await post(h.baseUrl, `/api/v1/moderation/users/${victim.userId}/status`, admin,
      { status: 'SUSPENDED', reason: 'مخالفة شروط الاستخدام' });
    assert.equal(response.status, 200);
    assert.equal((await response.json() as { sessionsRevoked: boolean }).sessionsRevoked, true);

    const stored = await h.db.prepare('SELECT status FROM users WHERE id=?').get<{ status: string }>(victim.userId);
    assert.equal(stored?.status, 'SUSPENDED');
    // The already-issued session is dead, which the client-only version could never do.
    assert.equal((await fetch(`${h.baseUrl}/api/v1/auth/me`, { headers: { cookie: victim.cookie } })).status, 401);
  } finally {
    await h.close();
  }
});

test('role changes need SUPER_ADMIN, refuse self-service, and require a reason', async () => {
  const h = await harness();
  try {
    const target = await register(h.baseUrl, 'target@commerce.test', 'Target');
    const admin = await register(h.baseUrl, 'admin2@commerce.test', 'AdminThree');
    await h.db.prepare("UPDATE users SET role='ADMIN' WHERE id=?").run(admin.userId);

    // A plain ADMIN cannot hand out roles.
    assert.equal((await post(h.baseUrl, `/api/v1/moderation/users/${target.userId}/role`, admin,
      { role: 'ADMIN', reason: 'ترقية' })).status, 403);

    const root = await register(h.baseUrl, 'root@commerce.test', 'Root');
    await h.db.prepare("UPDATE users SET role='SUPER_ADMIN' WHERE id=?").run(root.userId);

    // No reason recorded, no change applied.
    assert.equal((await post(h.baseUrl, `/api/v1/moderation/users/${target.userId}/role`, root, { role: 'ADMIN' })).status, 400);
    // Nobody rewrites their own role.
    assert.equal((await post(h.baseUrl, `/api/v1/moderation/users/${root.userId}/role`, root,
      { role: 'CONSUMER', reason: 'تجربة' })).status, 409);

    const ok = await post(h.baseUrl, `/api/v1/moderation/users/${target.userId}/role`, root,
      { role: 'HOST_OWNER', reason: 'تعيين مالك منشأة بعد التحقق' });
    assert.equal(ok.status, 200);
    const stored = await h.db.prepare('SELECT role FROM users WHERE id=?').get<{ role: string }>(target.userId);
    assert.equal(stored?.role, 'HOST_OWNER');

    // The action is on the moderation log with its reason intact.
    const log = await fetch(`${h.baseUrl}/api/v1/moderation/actions?targetType=USER`, { headers: { cookie: root.cookie, 'x-csrf-token': root.csrf } });
    const entries = (await log.json() as { actions: Array<{ action: string; previousValue: string; newValue: string; reason: string }> }).actions;
    const roleChange = entries.find(entry => entry.action === 'ROLE_CHANGED');
    assert.equal(roleChange?.previousValue, 'CONSUMER');
    assert.equal(roleChange?.newValue, 'HOST_OWNER');
    assert.ok(roleChange?.reason.includes('تعيين مالك منشأة'));
  } finally {
    await h.close();
  }
});

test('pausing a product actually stops its live launches from selling', async () => {
  const h = await harness();
  try {
    await seedCatalog(h.db, null);
    const admin = await register(h.baseUrl, 'admin3@commerce.test', 'AdminFour');
    await h.db.prepare("UPDATE users SET role='ADMIN' WHERE id=?").run(admin.userId);
    const buyer = await register(h.baseUrl, 'buyer7@commerce.test', 'Buyer');

    const response = await post(h.baseUrl, '/api/v1/moderation/products/prod_c/pause', admin, { reason: 'شكوى سلامة غذائية' });
    assert.equal(response.status, 200);
    assert.equal((await response.json() as { pausedLaunches: number }).pausedLaunches, 1);

    // The real test: the storefront stops accepting money for it.
    const blocked = await post(h.baseUrl, '/api/v1/orders', buyer, { launchId: 'lch_c', contactPhone: '+96550000000', units: 1 }, orderKey('g'));
    assert.equal(blocked.status, 409);
    assert.equal((await blocked.json() as { code: string }).code, 'LAUNCH_NOT_ORDERABLE');

    // Resuming does not silently put a paused launch back on sale.
    assert.equal((await post(h.baseUrl, '/api/v1/moderation/products/prod_c/resume', admin, { reason: 'انتهت المراجعة' })).status, 200);
    const launch = await h.db.prepare("SELECT status FROM launches WHERE id='lch_c'").get<{ status: string }>();
    assert.equal(launch?.status, 'PAUSED');
  } finally {
    await h.close();
  }
});
