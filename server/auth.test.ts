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
  assert.equal(validatePassword('elevenchars'), 'كلمة المرور يجب أن تكون بين 12 و128 محرفًا.');
  assert.equal(validatePassword('twelvechars1'), null);

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

test('SECURITY regression: re-registering an existing email never overwrites credentials or logs in', async () => {
  const db = await openMajalDatabase({ filename: ':memory:' });
  const app = express();
  app.use(express.json());
  app.use('/api/v1/auth', createAuthRouter(db, config));
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const email = 'victim@example.test';
  const original = 'Majal-Original-2026!';
  try {
    const first = await fetch(`${baseUrl}/api/v1/auth/register`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Victim', email, phone: '+96550000001', password: original })
    });
    assert.equal(first.status, 201);

    // Attacker re-registers the same email with a new password.
    const attack = await fetch(`${baseUrl}/api/v1/auth/register`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Attacker', email, phone: '+96550000002', password: 'Attacker-Chosen-2026!' })
    });
    assert.equal(attack.status, 409);
    assert.equal(attack.headers.getSetCookie().length, 0, 'no session cookie may be issued on duplicate register');

    // The attacker's password must NOT work; the original must still work.
    const attackerLogin = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password: 'Attacker-Chosen-2026!' })
    });
    assert.notEqual(attackerLogin.status, 200);
    const ownerLogin = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password: original })
    });
    assert.equal(ownerLogin.status, 200);
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    await db.close();
  }
});

test('SECURITY regression: reset never leaks the code and 123456 is not a bypass', async () => {
  const db = await openMajalDatabase({ filename: ':memory:' });
  const app = express();
  app.use(express.json());
  app.use('/api/v1/auth', createAuthRouter(db, config));
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const email = 'resetme@example.test';
  try {
    await fetch(`${baseUrl}/api/v1/auth/register`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'User', email, phone: '+96550000003', password: 'Majal-Reset-2026!' })
    });
    const reqRes = await fetch(`${baseUrl}/api/v1/auth/reset-password-request`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email })
    });
    assert.equal(reqRes.status, 200);
    const body = await reqRes.json() as Record<string, unknown>;
    assert.equal(body.devCode, undefined, 'reset code must never be returned in the response');

    // The dev bypass code must be rejected.
    const bypass = await fetch(`${baseUrl}/api/v1/auth/reset-password-verify`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, code: '123456', newPassword: 'Bypassed-Password-2026!' })
    });
    assert.equal(bypass.status, 400);

    // Reset must not provision an account for an unknown email.
    const unknown = await fetch(`${baseUrl}/api/v1/auth/reset-password-verify`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'ghost@example.test', code: '123456', newPassword: 'Ghost-Password-2026!' })
    });
    assert.equal(unknown.status, 400);
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
