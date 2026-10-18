import assert from 'node:assert/strict';
import test from 'node:test';
import { randomBytes } from 'node:crypto';
import express from 'express';
import { AddressInfo } from 'node:net';
import { createAuthRouter, createUser } from './auth';
import { createModerationRouter } from './moderation';
import { openTestDatabase } from './test-db';

const config = {
  production: false, sessionSecret: 'test-session-secret-that-is-long-enough-123456',
  encryptionKey: 'test-encryption-key-that-is-long-enough-12345', sessionHours: 8, cookieName: 'majal_session', csrfCookieName: 'majal_csrf'
};
const password = `${randomBytes(12).toString('base64url')}-Aa1!`;

test('super admin can find an account by name or email without paging through everyone; wildcards are literal', async () => {
  const db = await openTestDatabase();
  const app = express();
  app.use(express.json());
  app.use('/api/v1/auth', createAuthRouter(db, config));
  app.use('/api/v1/moderation', createModerationRouter(db, config));
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(r => server.once('listening', r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1`;
  try {
    await createUser(db, { name: 'مدير النظام', email: 'root@search.test', phone: '+96550000021', password, role: 'SUPER_ADMIN' });
    await createUser(db, { name: 'سارة العتيبي', email: 'sara@search.test', phone: '+96550000022', password, role: 'CONSUMER' });
    await createUser(db, { name: '100% عميل', email: 'pct@search.test', phone: '+96550000023', password, role: 'CONSUMER' });
    const login = await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'root@search.test', password }) });
    const cookie = login.headers.getSetCookie().map(c => c.split(';')[0]).join('; ');
    const find = async (q: string) => {
      const res = await fetch(`${base}/moderation/users?q=${encodeURIComponent(q)}`, { headers: { cookie } });
      return { status: res.status, body: await res.json() as { users?: { email: string }[] } };
    };
    assert.deepEqual((await find('العتيبي')).body.users?.map(u => u.email), ['sara@search.test']);
    assert.deepEqual((await find('SARA@')).body.users?.map(u => u.email), ['sara@search.test'], 'case-insensitive');
    assert.deepEqual((await find('0%')).body.users?.map(u => u.email), ['pct@search.test'], '% is a literal, not a wildcard');
    assert.deepEqual((await find('__')).body.users, [], '_ is a literal, not a wildcard');
    assert.equal((await find('a')).status, 400, 'single character is rejected');
  } finally {
    server.close();
    await db.close();
  }
});
