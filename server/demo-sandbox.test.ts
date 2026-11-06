import assert from 'node:assert/strict';
import test from 'node:test';
import { randomBytes } from 'node:crypto';
import { AddressInfo } from 'node:net';
import express from 'express';
import { openTestDatabase } from './test-db';
import { createAuthRouter, createPublicRegistration } from './auth';
import {
  DEMO_HEADER, createDemoAwareDb, createDemoRegistry, createDemoRouter, demoContext, demoGuard, demoEnabled, isDemoAllowedRoute
} from './demo-sandbox';
import { openMajalDatabase } from './database';

const config = {
  production: false, sessionSecret: 'test-session-secret-that-is-long-enough-123456',
  encryptionKey: 'test-encryption-key-that-is-long-enough-12345', sessionHours: 8, cookieName: 'majal_session', csrfCookieName: 'majal_csrf'
};
const password = `${randomBytes(12).toString('base64url')}-Aa1!`;
const newId = () => `demo_${randomBytes(32).toString('hex')}`;
const passThrough: express.RequestHandler = (_req, _res, next) => next();

async function harness(options: { enabled?: () => boolean; maxSandboxes?: number; now?: () => number } = {}) {
  const real = await openTestDatabase();
  const registry = createDemoRegistry({ maxSandboxes: options.maxSandboxes, now: options.now, open: () => openMajalDatabase({ filename: ':memory:' }) });
  const db = createDemoAwareDb(real, registry);
  const enabled = options.enabled ?? (() => true);
  const app = express();
  app.use(demoGuard(enabled));
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
    const id = `demo_${randomBytes(32).toString('hex')}`;
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
