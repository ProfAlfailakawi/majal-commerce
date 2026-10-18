import assert from 'node:assert/strict';
import test from 'node:test';
import { randomBytes } from 'node:crypto';
import express from 'express';
import { AddressInfo } from 'node:net';
import { createAuthRouter, createPublicRegistration, createUser } from './auth';
import { createDomainRouter } from './domain';
import { createModerationRouter } from './moderation';
import { openTestDatabase } from './test-db';

const config = {
  production: false, sessionSecret: 'test-session-secret-that-is-long-enough-123456',
  encryptionKey: 'test-encryption-key-that-is-long-enough-12345', sessionHours: 8, cookieName: 'majal_session', csrfCookieName: 'majal_csrf'
};
const password = `${randomBytes(12).toString('base64url')}-Aa1!`;

test('product approval: new products stay pending, only approved ones reach hosts, decisions are audited and notified', async () => {
  const db = await openTestDatabase();
  const app = express();
  app.use(express.json());
  app.use('/api/v1/auth', createAuthRouter(db, config));
  app.use('/api/v1/domain', createDomainRouter(db, config));
  app.use('/api/v1/moderation', createModerationRouter(db, config));
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(r => server.once('listening', r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1`;
  type S = { cookie: string; csrf: string };
  const login = async (email: string): Promise<S> => {
    const r = await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password }) });
    assert.equal(r.status, 200, email);
    return { cookie: r.headers.getSetCookie().map(c => c.split(';')[0]).join('; '), csrf: ((await r.json()) as { csrfToken: string }).csrfToken };
  };
  let n = 0;
  const call = (s: S, method: string, path: string, body: unknown = {}) => fetch(`${base}${path}`, {
    method,
    headers: { cookie: s.cookie, 'x-csrf-token': s.csrf, 'content-type': 'application/json', 'idempotency-key': `idem-approval-${++n}-${randomBytes(4).toString('hex')}` },
    body: JSON.stringify(body)
  });
  const productBody = (name: string) => ({ publicName: name, category: 'حلويات', shortDescription: 'وصف قصير للمنتج', estimatedUnitCostFils: 500, targetPriceFils: 2000, recipe: { steps: ['اخلط'] } });
  const snapshot = async (s: S) => await (await fetch(`${base}/domain/snapshot`, { headers: { cookie: s.cookie } })).json() as { products: { id: string; status: string; approvalStatus?: string; approvalReason?: string }[] };
  const row = async <T,>(sql: string, ...p: unknown[]) => await db.prepare(sql).get<T>(...p);
  try {
    await createPublicRegistration(db, { name: 'مبدعة', email: 'creator@approval.test', phone: '+96550000011', password, role: 'CREATOR' });
    await createPublicRegistration(db, { name: 'مبدع آخر', email: 'other@approval.test', phone: '+96550000014', password, role: 'CREATOR' });
    await createPublicRegistration(db, { name: 'مالك', email: 'host@approval.test', phone: '+96550000013', password, role: 'HOST_OWNER' }, { commercialName: 'مطبخ', businessType: 'CENTRAL_KITCHEN' });
    await createUser(db, { name: 'أدمن', email: 'admin@approval.test', phone: '+96550000015', password, role: 'ADMIN' });
    const creator = await login('creator@approval.test'), other = await login('other@approval.test'), host = await login('host@approval.test'), admin = await login('admin@approval.test');

    // 1. A new product is pending, invisible to hosts, and cannot be targeted with a recipe request.
    const created = await call(creator, 'POST', '/domain/products', productBody('منتج أول'));
    assert.equal(created.status, 201);
    const first = await created.json() as { id: string; status: string; approvalStatus: string };
    assert.deepEqual({ status: first.status, approval: first.approvalStatus }, { status: 'DRAFT', approval: 'PENDING' });
    assert.equal((await snapshot(host)).products.some(p => p.id === first.id), false);
    const blocked = await call(host, 'POST', '/domain/recipe-access', { productId: first.id, disclosureLevel: 1, purpose: 'تقييم الجدوى' });
    assert.equal(blocked.status, 404, 'server-side: a pending product cannot be requested by a host');
    assert.equal((await snapshot(creator)).products.find(p => p.id === first.id)?.approvalStatus, 'PENDING');

    // 2. Only admins decide.
    assert.equal((await call(creator, 'POST', `/moderation/products/${first.id}/approve`)).status, 403);
    assert.equal((await call(host, 'POST', `/moderation/products/${first.id}/reject`, { reason: 'لا' })).status, 403);

    // 3. Approval lists it, notifies the creator and is audited.
    const approved = await call(admin, 'POST', `/moderation/products/${first.id}/approve`, { reason: 'منتج واضح ومكتمل' });
    assert.equal(approved.status, 200);
    assert.equal((await approved.json() as { product: { status: string } }).product.status, 'AVAILABLE_FOR_MATCHING');
    assert.equal((await snapshot(host)).products.some(p => p.id === first.id), true);
    assert.equal((await call(host, 'POST', '/domain/recipe-access', { productId: first.id, disclosureLevel: 1, purpose: 'تقييم الجدوى' })).status, 201);
    const note = await row<{ title: string }>("SELECT title FROM notification_inbox WHERE category='PRODUCT_REVIEW' AND entity_id=? ORDER BY first_occurred_at DESC", first.id);
    assert.equal(note?.title, 'اعتُمد منتجك');
    assert.equal(Number((await row<{ c: number }>("SELECT COUNT(*) AS c FROM moderation_actions WHERE target_id=? AND action='PRODUCT_APPROVED'", first.id))?.c), 1);
    assert.equal(Number((await row<{ c: number }>("SELECT COUNT(*) AS c FROM domain_audit_events WHERE entity_id=? AND action='PRODUCT_APPROVED'", first.id))?.c), 1);
    assert.equal((await call(admin, 'POST', `/moderation/products/${first.id}/approve`)).status, 409, 'approving twice is refused');
    assert.equal((await call(creator, 'PUT', `/domain/products/${first.id}`, productBody('تعديل بعد الاعتماد'))).status, 409, 'an approved product is not editable');

    // 4. Rejection keeps it hidden, carries the reason, and the creator can edit and resubmit.
    const second = await (await call(creator, 'POST', '/domain/products', productBody('منتج ثانٍ'))).json() as { id: string };
    assert.equal((await call(admin, 'POST', `/moderation/products/${second.id}/reject`, { reason: 'x' })).status, 400, 'a too-short reason is refused');
    assert.equal((await call(admin, 'POST', `/moderation/products/${second.id}/reject`, { reason: 'الوصف غير كافٍ، أضف المكونات' })).status, 200);
    assert.equal((await snapshot(host)).products.some(p => p.id === second.id), false);
    const seen = (await snapshot(creator)).products.find(p => p.id === second.id);
    assert.deepEqual({ approval: seen?.approvalStatus, reason: seen?.approvalReason }, { approval: 'REJECTED', reason: 'الوصف غير كافٍ، أضف المكونات' });
    assert.equal((await call(other, 'PUT', `/domain/products/${second.id}`, productBody('اختراق'))).status, 404, 'another creator cannot edit it');
    const resubmitted = await call(creator, 'PUT', `/domain/products/${second.id}`, { ...productBody('منتج ثانٍ معدّل'), shortDescription: 'وصف أطول يتضمن المكونات الأساسية' });
    assert.equal(resubmitted.status, 200);
    const after = (await snapshot(creator)).products.find(p => p.id === second.id) as { approvalStatus?: string; approvalReason?: string } | undefined;
    assert.deepEqual({ approval: after?.approvalStatus, reason: after?.approvalReason }, { approval: 'PENDING', reason: undefined });
    assert.equal((await call(admin, 'POST', `/moderation/products/${second.id}/reject`, { reason: 'ما زال ناقصًا' })).status, 200);
    assert.equal((await call(admin, 'POST', `/moderation/products/${second.id}/approve`)).status, 200, 'an admin may reverse a rejection');
    assert.equal(Number((await row<{ c: number }>("SELECT COUNT(*) AS c FROM recipe_versions WHERE product_id=?", second.id))?.c), 2, 'a resubmitted recipe becomes a new immutable version');
  } finally {
    server.close();
    await db.close();
  }
});
