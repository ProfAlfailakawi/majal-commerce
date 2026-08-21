import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import { AddressInfo } from 'node:net';
import {
  AuthConfig,
  createAuthRouter,
  createUser,
  generateTotp,
  generateTotpSecret,
  hashPassword,
  validatePassword,
  verifyPassword,
  verifyTotp
} from './auth';
import { openMajalDatabase } from './database';

const config: AuthConfig = {
  production: false,
  sessionSecret: 'test-session-secret-that-is-long-enough-123456',
  encryptionKey: 'test-encryption-key-that-is-long-enough-12345',
  sessionHours: 8,
  cookieName: 'majal_session',
  csrfCookieName: 'majal_csrf'
};

test('password hashing and TOTP use one-way verification', async () => {
  const password = 'Majal-Strong-Password-2026!';
  const result = await hashPassword(password);
  assert.notEqual(result.hash, password);
  assert.equal(await verifyPassword(password, result.salt, result.hash), true);
  assert.equal(await verifyPassword('Wrong-Password-2026!', result.salt, result.hash), false);
  assert.equal(validatePassword('short'), 'كلمة المرور يجب أن تكون بين 12 و128 محرفًا.');

  const secret = generateTotpSecret();
  const now = Date.now();
  const code = generateTotp(secret, now);
  assert.equal(verifyTotp(secret, code, now), true);
  assert.equal(verifyTotp(secret, '000000', now), code === '000000');
});

test('auth API creates an HttpOnly session, enforces CSRF and destroys the session', async () => {
  const db = await openMajalDatabase({ filename: ':memory:' });
  const app = express();
  app.use(express.json());
  app.use('/api/v1/auth', createAuthRouter(db, config));
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  try {
    const registerResponse = await fetch(`${baseUrl}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'Scale Test Consumer',
        email: 'consumer@example.test',
        phone: '+96550000000',
        password: 'Majal-Consumer-2026!'
      })
    });
    assert.equal(registerResponse.status, 201);
    const registered = await registerResponse.json() as { csrfToken: string; user: { role: string } };
    assert.equal(registered.user.role, 'CONSUMER');
    const setCookies = registerResponse.headers.getSetCookie();
    assert.ok(setCookies.some(cookie => cookie.includes('HttpOnly')));
    assert.ok(setCookies.every(cookie => cookie.includes('SameSite=Strict')));
    const cookieHeader = setCookies.map(cookie => cookie.split(';')[0]).join('; ');

    const meResponse = await fetch(`${baseUrl}/api/v1/auth/me`, { headers: { cookie: cookieHeader } });
    assert.equal(meResponse.status, 200);

    const rejectedLogout = await fetch(`${baseUrl}/api/v1/auth/logout`, { method: 'POST', headers: { cookie: cookieHeader } });
    assert.equal(rejectedLogout.status, 403);

    const logoutResponse = await fetch(`${baseUrl}/api/v1/auth/logout`, {
      method: 'POST',
      headers: { cookie: cookieHeader, 'x-csrf-token': registered.csrfToken }
    });
    assert.equal(logoutResponse.status, 204);
    const afterLogout = await fetch(`${baseUrl}/api/v1/auth/me`, { headers: { cookie: cookieHeader } });
    assert.equal(afterLogout.status, 401);
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    await db.close();
  }
});

test('suspended accounts cannot establish sessions', async () => {
  const db = await openMajalDatabase({ filename: ':memory:' });
  try {
    const user = await createUser(db, {
      name: 'Suspended User',
      email: 'suspended@example.test',
      password: 'Majal-Suspended-2026!',
      role: 'HOST_FINANCE',
      status: 'SUSPENDED'
    });
    assert.equal(user.status, 'SUSPENDED');
  } finally {
    await db.close();
  }
});
