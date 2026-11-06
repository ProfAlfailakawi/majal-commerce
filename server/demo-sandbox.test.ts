import assert from 'node:assert/strict';
import test from 'node:test';
import { randomBytes } from 'node:crypto';
import { AddressInfo } from 'node:net';
import express from 'express';
import { openTestDatabase } from './test-db';
import { createAuthRouter, createPublicRegistration } from './auth';
import {
  DEMO_HEADER, createDemoIdSigner, createDemoAwareDb, createDemoRegistry, createDemoRouter, demoContext, demoGuard, demoEnabled, isDemoAllowedRoute
} from './demo-sandbox';
import { openMajalDatabase } from './database';

const config = {
  production: false, sessionSecret: 'test-session-secret-that-is-long-enough-123456',
  encryptionKey: 'test-encryption-key-that-is-long-enough-12345', sessionHours: 8, cookieName: 'majal_session', csrfCookieName: 'majal_csrf'
};
const password = `${randomBytes(12).toString('base64url')}-Aa1!`;
const SECRET = 'unit-test-server-secret-that-is-at-least-32-chars';
const signer = createDemoIdSigner(SECRET);
const newId = () => signer.issue();
const forgedId = () => `demo_${randomBytes(32).toString('hex')}`;
const passThrough: express.RequestHandler = (_req, _res, next) => next();

async function harness(options: { enabled?: () => boolean; maxSandboxes?: number; now?: () => number } = {}) {
  const real = await openTestDatabase();
  const registry = createDemoRegistry({ secret: SECRET, maxSandboxes: options.maxSandboxes, now: options.now, open: () => openMajalDatabase({ filename: ':memory:' }) });
  const db = createDemoAwareDb(real, registry);
  const enabled = options.enabled ?? (() => true);
  const app = express();
  app.use(demoGuard(registry, enabled));
  app.use(express.json());
  app.use(demoContext(registry, enabled));
  app.use('/api/v1/demo', createDemoRouter(registry, passThrough, enabled));
  app.use('/api/v1/auth', createAuthRouter(db, config));
  // مسار يقرأ القاعدة مباشرة ليُثبت أي قاعدة يرى المعالج بعد قراءة الجسم.
  app.get('/api/v1/public/user-count', async (_req, res) => { res.json(await db.prepare('SELECT COUNT(*) AS n FROM users').get()); });
  app.post('/api/v1/demo/probe-write', async (req, res) => {
    await db.prepare('INSERT INTO schema_migrations(version, applied_at) VALUES(?, ?)').run(9999, 'sandbox-write');
    res.json({ ok: true });
  });
  app.post('/api/v1/orders', (_req, res) => { res.json({ reached: true }); });
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return {
    real, registry, base,
    async close() { await new Promise<void>(resolve => server.close(() => resolve())); await registry.closeAll(); await real.close(); }
  };
}

test('ids must match the issued format; enable flag defaults on and obeys the kill switch', () => {
  assert.equal(demoEnabled({}), true);
  assert.equal(demoEnabled({ MAJAL_DEMO_ENABLED: 'false' }), false);
  assert.equal(demoEnabled({ MAJAL_DEMO_ENABLED: 'FALSE' }), false);
  assert.equal(isDemoAllowedRoute('GET', '/api/v1/auth/me'), true);
  assert.equal(isDemoAllowedRoute('POST', '/api/v1/auth/login'), false);
  assert.equal(isDemoAllowedRoute('POST', '/api/v1/payments/webhooks/x'), false);
  assert.equal(isDemoAllowedRoute('GET', '/api/v1/admin/metrics'), false);
});

test('a demo request can neither read nor write the real database', async () => {
  const h = await harness();
  try {
    await createPublicRegistration(h.real, { name: 'حقيقي', email: 'real@demo-test.test', phone: '+96550000011', password, role: 'CONSUMER' });
    const id = newId();
    const demoHeaders = { [DEMO_HEADER]: id };

    // قراءة: الحقيقية فيها مستخدم، والصندوق لا يراه.
    const realCount = await (await fetch(`${h.base}/api/v1/public/user-count`)).json() as { n: number };
    assert.equal(Number(realCount.n), 1);
    const demoCount = await (await fetch(`${h.base}/api/v1/public/user-count`, { headers: demoHeaders })).json() as { n: number };
    assert.equal(Number(demoCount.n), 0);

    // كتابة: داخل الصندوق وبعد قراءة جسم JSON (موضع ضياع السياق المحتمل).
    const write = await fetch(`${h.base}/api/v1/demo/probe-write`, { method: 'POST', headers: { ...demoHeaders, 'content-type': 'application/json' }, body: JSON.stringify({ a: 1 }) });
    assert.equal(write.status, 200);
    assert.equal(await h.real.prepare('SELECT 1 AS x FROM schema_migrations WHERE version = 9999').get(), undefined, 'sandbox write leaked into real DB');

    // ولا يرى الصندوق ما كتبه صندوق آخر.
    const other = { [DEMO_HEADER]: newId() };
    const otherView = await fetch(`${h.base}/api/v1/public/user-count`, { headers: other });
    assert.equal(otherView.status, 200);
  } finally { await h.close(); }
});

test('a real session cookie sent with a demo header is dropped: no identity, cookie not cleared', async () => {
  const h = await harness();
  try {
    await createPublicRegistration(h.real, { name: 'حقيقي', email: 'real2@demo-test.test', phone: '+96550000012', password, role: 'CONSUMER' });
    const login = await fetch(`${h.base}/api/v1/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'real2@demo-test.test', password }) });
    assert.equal(login.status, 200);
    const cookie = login.headers.getSetCookie().map(c => c.split(';')[0]).join('; ');
    assert.match(cookie, /majal_session=/);

    const asReal = await fetch(`${h.base}/api/v1/auth/me`, { headers: { cookie } });
    assert.equal(asReal.status, 200);

    const asDemo = await fetch(`${h.base}/api/v1/auth/me`, { headers: { cookie, [DEMO_HEADER]: newId() } });
    assert.equal(asDemo.status, 401, 'demo request must not authenticate a real session');
    assert.equal(asDemo.headers.getSetCookie().length, 0, 'demo request must not touch real cookies');
    // الجلسة الحقيقية ما زالت صالحة.
    assert.equal((await fetch(`${h.base}/api/v1/auth/me`, { headers: { cookie } })).status, 200);

    // الدخول الحقيقي ببيانات حقيقية محجوب داخل الصندوق.
    const loginInDemo = await fetch(`${h.base}/api/v1/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json', [DEMO_HEADER]: newId() }, body: JSON.stringify({ email: 'real2@demo-test.test', password }) });
    assert.equal(loginInDemo.status, 403);
  } finally { await h.close(); }
});

test('everything outside the allow-list is blocked before any router runs', async () => {
  const h = await harness();
  try {
    const headers = { [DEMO_HEADER]: newId(), 'content-type': 'application/json' };
    const orders = await fetch(`${h.base}/api/v1/orders`, { method: 'POST', headers, body: '{}' });
    assert.equal(orders.status, 403);
    assert.equal(((await orders.json()) as { code: string }).code, 'DEMO_SANDBOX_BLOCKED');
    assert.equal((await fetch(`${h.base}/api/v1/orders`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).status, 200, 'non-demo traffic unchanged');
    for (const path of ['/api/v1/payments/webhooks/stripe', '/api/v1/paci/internal/callback', '/api/ai/deal-room', '/api/v1/admin/overview']) {
      assert.equal((await fetch(`${h.base}${path}`, { method: 'POST', headers, body: '{}' })).status, 403, path);
    }
  } finally { await h.close(); }
});

test('malformed ids are ignored (treated as normal traffic, never creating a sandbox)', async () => {
  const h = await harness();
  try {
    for (const bad of ['demo_short', `demo_${'g'.repeat(64)}`, 'x'.repeat(70)]) {
      const r = await fetch(`${h.base}/api/v1/public/user-count`, { headers: { [DEMO_HEADER]: bad } });
      assert.equal(r.status, 200);
    }
    assert.equal(h.registry.size(), 0);
  } finally { await h.close(); }
});

test('enter issues a sandbox; cap, TTL expiry, reset and exit behave', async () => {
  let clock = 1_000_000;
  const h = await harness({ maxSandboxes: 2, now: () => clock });
  try {
    const enter = async () => fetch(`${h.base}/api/v1/demo/enter`, { method: 'POST' });
    const a = await enter();
    assert.equal(a.status, 200);
    const body = await a.json() as { sessionId: string; sandbox: boolean };
    assert.match(body.sessionId, /^demo_[0-9a-f]{64}$/);
    assert.equal(body.sandbox, true);
    assert.equal((await enter()).status, 200);
    assert.equal((await enter()).status, 503, 'cap reached');

    // انتهاء المهلة يحرّر مكانًا.
    clock += h.registry.ttlMs + 1;
    assert.equal((await enter()).status, 200);
    assert.equal(h.registry.has(body.sessionId), false);

    // reset يُبقي المعرّف ويفرغ الصندوق؛ exit يهدمه.
    const id = newId();
    clock += h.registry.ttlMs + 1; await h.registry.sweep();
    assert.equal(await h.registry.create(id), true);
    const reset = await fetch(`${h.base}/api/v1/demo/reset`, { method: 'POST', headers: { [DEMO_HEADER]: id } });
    assert.equal(reset.status, 200);
    assert.equal(h.registry.has(id), true);
    await fetch(`${h.base}/api/v1/demo/exit`, { method: 'POST', headers: { [DEMO_HEADER]: id } });
    assert.equal(h.registry.has(id), false);
  } finally { await h.close(); }
});

test('kill switch: enter and any demo-tagged request answer 404, never real data', async () => {
  const h = await harness({ enabled: () => false });
  try {
    assert.equal((await fetch(`${h.base}/api/v1/demo/enter`, { method: 'POST' })).status, 404);
    const tagged = await fetch(`${h.base}/api/v1/public/user-count`, { headers: { [DEMO_HEADER]: newId() } });
    assert.equal(tagged.status, 404);
    assert.equal((await fetch(`${h.base}/api/v1/public/user-count`)).status, 200);
  } finally { await h.close(); }
});

test('re-creating a missing sandbox is rate limited, so forged ids cannot exhaust the cap', async () => {
  const real = await openTestDatabase();
  const registry = createDemoRegistry({ secret: SECRET, maxSandboxes: 40, open: () => openMajalDatabase({ filename: ':memory:' }) });
  let allowed = 2;
  const limiter: express.RequestHandler = (_req, res, next) => (allowed-- > 0 ? next() : void res.status(429).json({ error: 'limit' }));
  const app = express();
  app.use(demoGuard(registry, () => true));
  app.use(express.json());
  app.use(demoContext(registry, () => true, limiter));
  app.get('/api/version', (_req, res) => { res.json({ ok: true }); });
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    const statuses: number[] = [];
    for (let i = 0; i < 5; i++) statuses.push((await fetch(`${base}/api/version`, { headers: { [DEMO_HEADER]: newId() } })).status);
    assert.deepEqual(statuses, [200, 200, 429, 429, 429]);
    assert.equal(registry.size(), 2, 'only limiter-approved ids allocate a database');
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); await registry.closeAll(); await real.close(); }
});

test('forged and tampered ids are rejected before reserving anything; the cap cannot be exhausted by them', async () => {
  const h = await harness({ maxSandboxes: 3 });
  try {
    const probe = (id: string) => fetch(`${h.base}/api/version-probe`, { headers: { [DEMO_HEADER]: id } });
    // 25 well-formed but unsigned ids: 403 each, zero sandboxes.
    for (let i = 0; i < 25; i++) assert.equal((await probe(forgedId())).status, 403);
    assert.equal(h.registry.size(), 0);
    // a valid id with one flipped signature character is forged too
    const good = newId();
    const last = good.slice(-1) === '0' ? '1' : '0';
    assert.equal((await probe(good.slice(0, -1) + last)).status, 403);
    // an id signed with a different secret (stale/rotated or attacker-made) is rejected
    assert.equal((await probe(createDemoIdSigner('another-secret-another-secret-another-secret').issue())).status, 403);
    assert.equal(h.registry.size(), 0);
    assert.equal(await h.registry.create(forgedId()), false);
    // legitimate entries still fill the cap exactly, unaffected by the forged traffic
    for (let i = 0; i < 3; i++) assert.equal((await fetch(`${h.base}/api/v1/demo/enter`, { method: 'POST' })).status, 200);
    assert.equal((await fetch(`${h.base}/api/v1/demo/enter`, { method: 'POST' })).status, 503);
  } finally { await h.close(); }
});

test('a signed id survives a restart: a fresh registry with the same secret rebuilds the sandbox', async () => {
  const id = newId();
  const a = createDemoRegistry({ secret: SECRET, open: () => openMajalDatabase({ filename: ':memory:' }) });
  const b = createDemoRegistry({ secret: SECRET, open: () => openMajalDatabase({ filename: ':memory:' }) });
  const other = createDemoRegistry({ secret: 'a-completely-different-server-secret-0000', open: () => openMajalDatabase({ filename: ':memory:' }) });
  try {
    assert.equal(await a.create(id), true);
    assert.equal(await b.create(id), true, 'after restart / another instance');
    assert.equal(await other.create(id), false, 'different secret');
  } finally { await a.closeAll(); await b.closeAll(); await other.closeAll(); }
});
