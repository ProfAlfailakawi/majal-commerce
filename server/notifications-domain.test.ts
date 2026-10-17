import assert from 'node:assert/strict';
import test from 'node:test';
import { randomBytes } from 'node:crypto';
import express from 'express';
import { AddressInfo } from 'node:net';
import { createAuthRouter, createUser } from './auth';
import { createDomainRouter } from './domain';
import { openMajalDatabase } from './database';

const config = {
  production: false, sessionSecret: 'test-session-secret-that-is-long-enough-123456',
  encryptionKey: 'test-encryption-key-that-is-long-enough-12345', sessionHours: 8, cookieName: 'majal_session', csrfCookieName: 'majal_csrf'
};
const password = `${randomBytes(12).toString('base64url')}-Aa1!`;

test('the creator is told when a settlement is approved and again when it is paid; nobody else is', async () => {
  const secret = 'reconciliation-secret-that-is-at-least-32-chars';
  process.env.SETTLEMENT_RECONCILIATION_SECRET = secret;
  const db = await openMajalDatabase({ filename: ':memory:' });
  const app = express();
  app.use(express.json());
  app.use('/api/v1/auth', createAuthRouter(db, config));
  app.use('/api/v1/domain', createDomainRouter(db, config));
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(r => server.once('listening', r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1`;
  try {
    const now = new Date().toISOString();
    await db.prepare("INSERT INTO users(id,name,email,phone,role,status,password_hash,password_salt,created_at,updated_at) VALUES('u_c','Chef','chef@notif.test','','CREATOR','ACTIVE','h','s',?,?)").run(now, now);
    await db.prepare("INSERT INTO creator_profiles(id,user_id,display_name,specialty,created_at,updated_at) VALUES('cr_c','u_c','C','b',?,?)").run(now, now);
    await db.exec('PRAGMA foreign_keys = OFF;');
    await db.prepare("INSERT INTO accruals(id,order_id,creator_id,amount_fils,status,created_at,updated_at) VALUES('acc_c','ord_c','cr_c',9000,'ELIGIBLE',?,?)").run(now, now);
    await db.exec('PRAGMA foreign_keys = ON;');
    await createUser(db, { name: 'Admin', email: 'admin@notif.test', password, role: 'ADMIN' });
    const r = await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'admin@notif.test', password }) });
    const admin = { cookie: r.headers.getSetCookie().map(c => c.split(';')[0]).join('; '), csrf: ((await r.json()) as { csrfToken: string }).csrfToken };
    const call = (path: string, key: string, body: unknown = {}) => fetch(`${base}/domain${path}`, {
      method: 'POST', headers: { cookie: admin.cookie, 'x-csrf-token': admin.csrf, 'content-type': 'application/json', 'idempotency-key': key, 'x-reconciliation-secret': secret }, body: JSON.stringify(body)
    });
    const inbox = async (userId: string) => (await db.prepare('SELECT category, dedupe_key FROM notification_inbox WHERE user_id=? ORDER BY dedupe_key').all<{ category: string; dedupe_key: string }>(userId)).map(x => x.category);

    const approved = await call('/settlements/cr_c/approve', 'idem-approve-0001');
    assert.equal(approved.status, 201, await approved.clone().text());
    const batch = (await approved.json() as { id: string }).id;
    assert.deepEqual(await inbox('u_c'), ['SETTLEMENT']);

    const paid = await call(`/internal/settlements/${batch}/paid`, 'idem-paid-000001', { providerReference: 'bank-ref-0001' });
    assert.equal(paid.status, 200, await paid.clone().text());
    assert.deepEqual(await inbox('u_c'), ['SETTLEMENT', 'SETTLEMENT']);
    const admins = await db.prepare("SELECT id FROM users WHERE email='admin@notif.test'").get<{ id: string }>();
    assert.deepEqual(await inbox(admins!.id), [], 'the admin who acted is told nothing');
  } finally {
    delete process.env.SETTLEMENT_RECONCILIATION_SECRET;
    await new Promise<void>(r => server.close(() => r()));
    await db.close();
  }
});
