import assert from 'node:assert/strict';
import test from 'node:test';
import { randomBytes } from 'node:crypto';
import express from 'express';
import { AddressInfo } from 'node:net';
import { AuthConfig, createAuthRouter, generateTotp } from './auth';
import { openMajalDatabase } from './database';

const config: AuthConfig = {
  production: false,
  sessionSecret: 'test-session-secret-that-is-long-enough-123456',
  encryptionKey: 'test-encryption-key-that-is-long-enough-12345',
  sessionHours: 8,
  cookieName: 'majal_session',
  csrfCookieName: 'majal_csrf'
};

test('SECURITY: an MFA code is single-use, including the enrollment code', async () => {
  const db = await openMajalDatabase({ filename: ':memory:' });
  const app = express();
  app.use(express.json());
  app.use('/api/v1/auth', createAuthRouter(db, config));
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const email = 'mfa-user@example.test';
  // Generated per run so no credential-shaped literal lives in the repository.
  const password = `${randomBytes(12).toString('base64url')}-Aa1!`;
  const post = (path: string, body: unknown, headers: Record<string, string> = {}) => fetch(`${baseUrl}/api/v1/auth${path}`, {
    method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body)
  });
  const login = (mfaCode: string) => post('/login', { email, password, mfaCode });

  try {
    const registered = await post('/register', { name: 'MFA User', email, phone: '+96550000011', password });
    assert.equal(registered.status, 201);
    const { csrfToken } = await registered.json() as { csrfToken: string };
    const cookie = registered.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
    const auth = { cookie, 'x-csrf-token': csrfToken };

    const enrolled = await post('/mfa/enroll', {}, auth);
    assert.equal(enrolled.status, 200);
    const { manualKey } = await enrolled.json() as { manualKey: string };

    const now = Date.now();
    const confirmCode = generateTotp(manualKey, now);
    assert.equal((await post('/mfa/confirm', { code: confirmCode }, auth)).status, 200);

    // The code used to confirm enrollment cannot be replayed to log in.
    const replayedEnrollment = await login(confirmCode);
    assert.equal(replayedEnrollment.status, 401);
    assert.equal((await replayedEnrollment.json()).code, 'INVALID_MFA_CODE');

    // The next code (within the ±1 step drift window) works exactly once.
    const nextCode = generateTotp(manualKey, now + 30_000);
    assert.equal((await login(nextCode)).status, 200);
    const replayed = await login(nextCode);
    assert.equal(replayed.status, 401);
    assert.equal(replayed.headers.getSetCookie().length, 0, 'a replayed code must not issue a session');
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    await db.close();
  }
});
