import assert from 'node:assert/strict';
import test from 'node:test';
import { randomBytes } from 'node:crypto';
import express from 'express';
import { AddressInfo } from 'node:net';
import { createAuthRouter, createPublicRegistration } from './auth';
import { createDomainRouter } from './domain';
import { openTestDatabase } from './test-db';

const config = {
  production: false, sessionSecret: 'test-session-secret-that-is-long-enough-123456',
  encryptionKey: 'test-encryption-key-that-is-long-enough-12345', sessionHours: 8, cookieName: 'majal_session', csrfCookieName: 'majal_csrf'
};
const password = `${randomBytes(12).toString('base64url')}-Aa1!`;
interface Session { cookie: string; csrf: string }

test('recipe access and offers tell the other side, never the actor or a third facility', async () => {
  const db = await openTestDatabase();
  const app = express();
  app.use(express.json());
  app.use('/api/v1/auth', createAuthRouter(db, config));
  app.use('/api/v1/domain', createDomainRouter(db, config));
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(r => server.once('listening', r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1`;
  const login = async (email: string): Promise<Session> => {
    const r = await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password }) });
    assert.equal(r.status, 200, email);
    return { cookie: r.headers.getSetCookie().map(c => c.split(';')[0]).join('; '), csrf: ((await r.json()) as { csrfToken: string }).csrfToken };
  };
  let keyNo = 0;
  const call = (s: Session, path: string, body: unknown = {}) => fetch(`${base}/domain${path}`, {
    method: 'POST', headers: { cookie: s.cookie, 'x-csrf-token': s.csrf, 'content-type': 'application/json', 'idempotency-key': `idem-key-${++keyNo}-${randomBytes(4).toString('hex')}` }, body: JSON.stringify(body)
  });
  const inbox = async (email: string) => {
    const u = await db.prepare('SELECT id FROM users WHERE email = ?').get<{ id: string }>(email);
    return (await db.prepare('SELECT dedupe_key FROM notification_inbox WHERE user_id = ? ORDER BY dedupe_key').all<{ dedupe_key: string }>(u!.id)).map(r => r.dedupe_key);
  };
  try {
    const host = await createPublicRegistration(db, { name: 'مالك', email: 'host@deal.test', phone: '+96550000001', password, role: 'HOST_OWNER' }, { commercialName: 'مطبخ', businessType: 'CENTRAL_KITCHEN' });
    await createPublicRegistration(db, { name: 'مالك آخر', email: 'other@deal.test', phone: '+96550000002', password, role: 'HOST_OWNER' }, { commercialName: 'مخبز آخر', businessType: 'BAKERY' });
    const creator = await createPublicRegistration(db, { name: 'مبدع', email: 'creator@deal.test', phone: '+96550000003', password, role: 'CREATOR' });
    const now = new Date().toISOString();
    await db.prepare(`INSERT INTO products(id,creator_id,public_name,category,short_description,status,estimated_unit_cost_fils,target_price_fils,is_secret_recipe,created_at,updated_at) VALUES('prd_d',?,?,?,?,'READY_FOR_PITCH',1000,2500,1,?,?)`)
      .run(creator.creator_id, 'منتج', 'FOOD', 'وصف المنتج للاختبار', now, now);
    const [h, o, c] = await Promise.all(['host', 'other', 'creator'].map(n => login(`${n}@deal.test`)));

    const req = await call(h, '/recipe-access', { productId: 'prd_d', disclosureLevel: 2, purpose: 'تقييم الجدوى' });
    assert.equal(req.status, 201, await req.clone().text());
    const grant = await req.json() as { id: string; collaborationId: string };
    assert.deepEqual(await inbox('creator@deal.test'), ['recipe-access:prd_d:' + host.host_business_id]);
    assert.deepEqual(await inbox('host@deal.test'), [], 'the requester is told nothing');
    assert.deepEqual(await inbox('other@deal.test'), [], 'another facility sees nothing');

    assert.equal((await call(c, `/recipe-access/${grant.id}/approve`, { days: 14 })).status, 200);
    assert.deepEqual(await inbox('host@deal.test'), [`recipe-access-granted:${grant.id}`]);
    assert.deepEqual(await inbox('creator@deal.test'), ['recipe-access:prd_d:' + host.host_business_id], 'the approver is told nothing new');

    const offer = await call(h, `/collaborations/${grant.collaborationId}/offers`, { sellingPriceFils: 2500, creatorRoyaltyBasisPoints: 1500, platformFeeBasisPoints: 500 });
    assert.equal(offer.status, 201, await offer.clone().text());
    const offerId = (await offer.json() as { id: string }).id;
    assert.ok((await inbox('creator@deal.test')).includes(`offer:${grant.collaborationId}`));
    assert.ok(!(await inbox('host@deal.test')).includes(`offer:${grant.collaborationId}`), 'the sender is not told about their own offer');
    assert.deepEqual(await inbox('other@deal.test'), []);

    const accepted = await call(c, `/collaborations/${grant.collaborationId}/offers/${offerId}/accept`);
    assert.equal(accepted.status, 200, await accepted.clone().text());
    assert.ok((await inbox('host@deal.test')).includes(`offer-accepted:${offerId}`), 'the offer sender is told it was accepted');

    assert.equal((await call(c, `/recipe-access/${grant.id}/revoke`)).status, 200);
    assert.ok((await inbox('host@deal.test')).includes(`recipe-access-revoked:${grant.id}`));
    assert.deepEqual(await inbox('other@deal.test'), []);
    void o;
  } finally { await new Promise<void>(r => server.close(() => r())); await db.close(); }
});
