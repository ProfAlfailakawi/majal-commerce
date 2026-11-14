import assert from 'node:assert/strict';
import test from 'node:test';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import express from 'express';
import { AddressInfo } from 'node:net';
import { createAuthRouter, createUser } from './auth';
import { createPublicReviewsRouter } from './orders';
import { createSafetyRouter } from './safety';
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
  app.use('/api/v1/safety', createSafetyRouter(db, config));
  app.use('/api/v1/public', createPublicReviewsRouter(db));
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(r => server.once('listening', r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1`;
  const login = async (email: string) => {
    const res = await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password }) });
    assert.equal(res.status, 200);
    const body = await res.json() as { csrfToken: string };
    return { cookie: res.headers.getSetCookie().map(c => c.split(';')[0]).join('; '), csrf: body.csrfToken };
  };
  const call = (path: string, session: { cookie: string; csrf: string } | null, method = 'GET', body?: unknown, csrf = session?.csrf) =>
    fetch(`${base}${path}`, {
      method,
      headers: { 'content-type': 'application/json', ...(session ? { cookie: session.cookie } : {}), ...(csrf && method !== 'GET' ? { 'x-csrf-token': csrf } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    });
  return { db, base, login, call, close: async () => { server.close(); await db.close(); } };
}

async function seedReview(db: Awaited<ReturnType<typeof openTestDatabase>>, consumerId: string) {
  const now = new Date().toISOString();
  const creator = await createUser(db, { name: 'Creator', email: 'creator@safety.test', password, role: 'CREATOR' });
  await db.prepare("INSERT INTO creator_profiles(id,user_id,display_name,specialty,created_at,updated_at) VALUES('cr_s',?,'C','b',?,?)").run(creator.id, now, now);
  await db.prepare("INSERT INTO organizations(id,commercial_name,organization_type,verification_status,created_at,updated_at) VALUES('org_s','Host','HOST','VERIFIED',?,?)").run(now, now);
  await db.prepare("INSERT INTO products(id,creator_id,public_name,category,short_description,status,estimated_unit_cost_fils,target_price_fils,created_at,updated_at) VALUES('prod_s','cr_s','Cake','DESSERT','desc','LIVE_PERMANENT',500,10000,?,?)").run(now, now);
  await db.prepare("INSERT INTO collaborations(id,product_id,creator_id,organization_id,stage,created_at,updated_at) VALUES('col_s','prod_s','cr_s','org_s','LIVE_TRIAL',?,?)").run(now, now);
  await db.prepare("INSERT INTO launches(id,collaboration_id,product_id,organization_id,status,quantity_cap,starts_at,created_at,updated_at) VALUES('lch_s','col_s','prod_s','org_s','LIVE',100,?,?,?)").run(now, now, now);
  await db.prepare("INSERT INTO orders(id,launch_id,consumer_user_id,units,unit_price_fils,total_fils,status,created_at,updated_at) VALUES('ord_s','lch_s',?,1,10000,10000,'PAID',?,?)").run(consumerId, now, now);
  await db.prepare("INSERT INTO product_reviews(id,order_id,launch_id,product_id,reviewer_user_id,taste_rating,value_rating,portion_rating,keep_it_vote,comment,status,created_at,updated_at) VALUES('rev_s','ord_s','lch_s','prod_s',?,5,5,5,1,'rude text','PUBLISHED',?,?)").run(consumerId, now, now);
}

test('account deletion request: 401 without session, 403 for CSRF/other user id, re-auth required, only the caller is queued', async () => {
  const h = await harness();
  try {
    const a = await createUser(h.db, { name: 'Alice', email: 'a@safety.test', phone: '+96550000031', password, role: 'CONSUMER' });
    const b = await createUser(h.db, { name: 'Bobby', email: 'b@safety.test', phone: '+96550000032', password, role: 'CONSUMER' });
    await createUser(h.db, { name: 'Admin', email: 'admin@safety.test', phone: '+96550000033', password, role: 'ADMIN' });
    await seedReview(h.db, a.id);
    const path = '/safety/account/deletion-request';
    const queued = async () => Number((await h.db.prepare('SELECT COUNT(*) AS c FROM account_deletion_requests').get<{ c: number }>())?.c);

    assert.equal((await h.call(path, null, 'POST', { password })).status, 401, 'no session');

    const session = await h.login('a@safety.test');
    assert.equal((await h.call(path, session, 'POST', { password }, 'bad-csrf')).status, 403, 'bad CSRF token');
    assert.equal((await h.call(path, session, 'POST', { password, userId: b.id })).status, 403, 'another user id');
    assert.equal(await queued(), 0);

    // An old session alone is not enough: the password must be proven again in the request.
    await h.db.prepare('UPDATE sessions SET created_at = ? WHERE user_id = ?').run(new Date(Date.now() - 3_600_000).toISOString(), a.id);
    const stale = await h.call(path, session, 'POST', {});
    assert.equal(stale.status, 401);
    assert.equal((await stale.json() as { code: string }).code, 'REAUTH_REQUIRED');
    assert.equal((await h.call(path, session, 'POST', { password: 'not-the-password' })).status, 401);
    assert.equal(await queued(), 0);

    const adminSession = await h.login('admin@safety.test');
    assert.equal((await h.call(path, adminSession, 'POST', { password })).status, 409, 'staff accounts are not self-deleted here');

    const ok = await h.call(path, session, 'POST', { password, userId: a.id });
    assert.equal(ok.status, 201);
    const okBody = await ok.json() as { request: { status: string }; message: string };
    assert.equal(okBody.request.status, 'PENDING');
    assert.match(okBody.message, /خلال 30 يومًا/);
    assert.ok(ok.headers.getSetCookie().some(c => c.startsWith('majal_session=;')), 'session cookie is cleared');

    const rows = await h.db.prepare('SELECT user_id, status, requested_at FROM account_deletion_requests').all<{ user_id: string; status: string; requested_at: string }>();
    assert.deepEqual(rows.map(r => [r.user_id, r.status]), [[a.id, 'PENDING']]);
    assert.equal((await h.db.prepare('SELECT status FROM users WHERE id = ?').get<{ status: string }>(a.id))?.status, 'SUSPENDED');
    assert.equal((await h.db.prepare('SELECT status FROM users WHERE id = ?').get<{ status: string }>(b.id))?.status, 'ACTIVE');
    assert.equal(Number((await h.db.prepare('SELECT COUNT(*) AS c FROM sessions WHERE user_id = ?').get<{ c: number }>(a.id))?.c), 0);

    // The request signs out and disables login; it deletes no commercial or audit record.
    assert.equal((await h.call('/safety/account/deletion-request', session, 'POST', { password })).status, 401, 'old session is dead');
    const relogin = await fetch(`${h.base}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'a@safety.test', password }) });
    assert.equal(relogin.status, 401);
    assert.equal(Number((await h.db.prepare('SELECT COUNT(*) AS c FROM orders').get<{ c: number }>())?.c), 1);
    assert.equal(Number((await h.db.prepare('SELECT COUNT(*) AS c FROM product_reviews').get<{ c: number }>())?.c), 1);
    assert.equal(Number((await h.db.prepare("SELECT COUNT(*) AS c FROM domain_audit_events WHERE action = 'ACCOUNT_DELETION_REQUESTED' AND entity_id = ?").get<{ c: number }>(a.id))?.c), 1);
  } finally { await h.close(); }
});

test('review reports: auth required, bad input 400, stored with the reporter, de-duplicated, visible to admins only, HIDE removes the review publicly', async () => {
  const h = await harness();
  try {
    const owner = await createUser(h.db, { name: 'Owner', email: 'owner@safety.test', phone: '+96550000041', password, role: 'CONSUMER' });
    const reporter = await createUser(h.db, { name: 'Reporter', email: 'reporter@safety.test', phone: '+96550000042', password, role: 'CONSUMER' });
    await createUser(h.db, { name: 'Admin', email: 'admin2@safety.test', phone: '+96550000043', password, role: 'ADMIN' });
    await seedReview(h.db, owner.id);
    const path = '/safety/reviews/rev_s/report';

    assert.equal((await h.call(path, null, 'POST', { reason: 'SPAM' })).status, 401);
    const session = await h.login('reporter@safety.test');
    assert.equal((await h.call(path, session, 'POST', { reason: 'nonsense' })).status, 400);
    assert.equal((await h.call(path, session, 'POST', { reason: 'SPAM', note: 'x'.repeat(501) })).status, 400);
    assert.equal((await h.call('/safety/reviews/rev_missing/report', session, 'POST', { reason: 'SPAM' })).status, 404);
    assert.equal(Number((await h.db.prepare('SELECT COUNT(*) AS c FROM review_reports').get<{ c: number }>())?.c), 0);

    assert.equal((await h.call(path, session, 'POST', { reason: 'ABUSE', note: 'offensive' })).status, 201);
    assert.equal((await h.call(path, session, 'POST', { reason: 'ABUSE' })).status, 200, 'repeat is acknowledged, not duplicated');
    const stored = await h.db.prepare('SELECT review_id, reporter_user_id, reason, status FROM review_reports').all<Record<string, string>>();
    assert.deepEqual(stored.map(r => ({ ...r })), [{ review_id: 'rev_s', reporter_user_id: reporter.id, reason: 'ABUSE', status: 'OPEN' }]);

    assert.equal((await h.call('/safety/admin/queues', null)).status, 401);
    assert.equal((await h.call('/safety/admin/queues', session)).status, 403, 'non-admins cannot read reports');
    const admin = await h.login('admin2@safety.test');
    const queues = await (await h.call('/safety/admin/queues', admin)).json() as { reviewReports: { id: string; reviewComment: string }[] };
    assert.equal(queues.reviewReports.length, 1);
    assert.equal(queues.reviewReports[0].reviewComment, 'rude text');
    assert.equal((await h.call(`/safety/admin/review-reports/${queues.reviewReports[0].id}/resolve`, session, 'POST', { decision: 'HIDE' })).status, 403);

    const before = await (await fetch(`${h.base}/public/launches/lch_s/reviews`)).json() as { reviews: unknown[] };
    assert.equal(before.reviews.length, 1);
    const resolved = await h.call(`/safety/admin/review-reports/${queues.reviewReports[0].id}/resolve`, admin, 'POST', { decision: 'HIDE' });
    assert.equal(resolved.status, 200);
    const after = await (await fetch(`${h.base}/public/launches/lch_s/reviews`)).json() as { reviews: unknown[] };
    assert.equal(after.reviews.length, 0, 'hidden review is no longer public');
    assert.equal((await h.db.prepare('SELECT status FROM review_reports').get<{ status: string }>())?.status, 'ACTIONED');
  } finally { await h.close(); }
});

test('the safety routes are rate limited and mounted behind auth', () => {
  const server = readFileSync(new URL('../server.ts', import.meta.url), 'utf8');
  assert.match(server, /app\.post\('\/api\/v1\/safety\/account\/deletion-request', expressRateLimit\(limitOptions\(5,/);
  assert.match(server, /app\.use\('\/api\/v1\/safety', expressRateLimit\(limitOptions\(60,[^)]*\)\), createSafetyRouter\(db, authConfig\)\)/);
});
