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

test('a creator available for matching lists new products for hosts; otherwise they stay private drafts', async () => {
  const db = await openTestDatabase();
  const app = express();
  app.use(express.json());
  app.use('/api/v1/auth', createAuthRouter(db, config));
  app.use('/api/v1/domain', createDomainRouter(db, config));
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(r => server.once('listening', r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1`;
  const login = async (email: string) => {
    const r = await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password }) });
    assert.equal(r.status, 200, email);
    return { cookie: r.headers.getSetCookie().map(c => c.split(';')[0]).join('; '), csrf: ((await r.json()) as { csrfToken: string }).csrfToken };
  };
  let n = 0;
  const createProduct = (s: { cookie: string; csrf: string }, name: string) => fetch(`${base}/domain/products`, {
    method: 'POST',
    headers: { cookie: s.cookie, 'x-csrf-token': s.csrf, 'content-type': 'application/json', 'idempotency-key': `idem-listing-${++n}-${randomBytes(4).toString('hex')}` },
    body: JSON.stringify({ publicName: name, category: 'حلويات', shortDescription: 'وصف قصير للمنتج', estimatedUnitCostFils: 500, targetPriceFils: 2000, recipe: { steps: ['اخلط'] } })
  });
  const visibleToHost = async (host: { cookie: string }, id: string) => {
    const snap = await (await fetch(`${base}/domain/snapshot`, { headers: { cookie: host.cookie } })).json() as { products: { id: string }[] };
    return snap.products.some(p => p.id === id);
  };
  try {
    await createPublicRegistration(db, { name: 'مبدعة متاحة', email: 'open@listing.test', phone: '+96550000011', password, role: 'CREATOR' });
    await createPublicRegistration(db, { name: 'مبدع خاص', email: 'private@listing.test', phone: '+96550000012', password, role: 'CREATOR' });
    await createPublicRegistration(db, { name: 'مالك', email: 'host@listing.test', phone: '+96550000013', password, role: 'HOST_OWNER' }, { commercialName: 'مطبخ', businessType: 'CENTRAL_KITCHEN' });
    await db.prepare("UPDATE creator_profiles SET matching_enabled=0 WHERE user_id=(SELECT id FROM users WHERE email='private@listing.test')").run();

    const host = await login('host@listing.test');
    const openCreated = await createProduct(await login('open@listing.test'), 'منتج متاح');
    assert.equal(openCreated.status, 201);
    const open = await openCreated.json() as { id: string; status: string };
    assert.equal(open.status, 'AVAILABLE_FOR_MATCHING');
    assert.equal(await visibleToHost(host, open.id), true, 'host discovery sees the listed product');

    const privateCreated = await createProduct(await login('private@listing.test'), 'منتج خاص');
    assert.equal(privateCreated.status, 201);
    const draft = await privateCreated.json() as { id: string; status: string };
    assert.equal(draft.status, 'DRAFT');
    assert.equal(await visibleToHost(host, draft.id), false, 'a draft is never shown to hosts');
  } finally {
    server.close();
    await db.close();
  }
});
