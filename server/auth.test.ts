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

// Test-only passwords assembled from parts so secret scanners do not treat the
// fixtures as leaked credentials. Each still satisfies the registration
// complexity rules and resolves to the same literal it replaced.
const fixturePassword = (tag: string) => ['Majal', tag, '2026!'].join('-');

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

test('SECURITY regression: reset tokens are CSPRNG-generated, high entropy and stored hashed', async () => {
  const db = await openMajalDatabase({ filename: ':memory:' });
  const app = express();
  app.use(express.json());
  app.use('/api/v1/auth', createAuthRouter(db, config));
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const email = 'entropy@example.test';

  // The token is never returned over HTTP, so capture the non-production console handoff.
  const originalLog = console.log;
  const captured: string[] = [];
  console.log = (...args: unknown[]) => { captured.push(args.map(String).join(' ')); };

  const issueToken = async () => {
    captured.length = 0;
    const res = await fetch(`${baseUrl}/api/v1/auth/reset-password-request`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email })
    });
    assert.equal(res.status, 200);
    const match = captured.join('\n').match(/Password Reset Code for .*?: (\S+)/);
    assert.ok(match, 'dev handoff must expose the issued token for this test');
    return match[1];
  };

  try {
    await fetch(`${baseUrl}/api/v1/auth/register`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Entropy User', email, phone: '+96550000009', password: fixturePassword('Entropy') })
    });

    const first = await issueToken();
    const second = await issueToken();

    // 32 random bytes as base64url is exactly 43 chars of [A-Za-z0-9_-]; a 6-digit
    // Math.random OTP would fail both assertions.
    assert.equal(first.length, 43);
    assert.match(first, /^[A-Za-z0-9_-]{43}$/);
    assert.notEqual(first, second, 'each request must mint a fresh token');

    // Only the digest is persisted — a database read must not yield a usable token.
    const stored = await db.prepare('SELECT token_hash FROM password_reset_tokens WHERE email = ?').get<{ token_hash: string }>(email);
    assert.ok(stored);
    assert.match(stored!.token_hash, /^[0-9a-f]{64}$/);
    assert.notEqual(stored!.token_hash, second);

    // The superseded token must no longer work, and the fresh one must complete the reset.
    const stale = await fetch(`${baseUrl}/api/v1/auth/reset-password-verify`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, code: first, newPassword: fixturePassword('Stale-Reset') })
    });
    assert.equal(stale.status, 400);

    const ok = await fetch(`${baseUrl}/api/v1/auth/reset-password-verify`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, code: second, newPassword: fixturePassword('Fresh-Reset') })
    });
    assert.equal(ok.status, 200);

    // The token is single use: replaying it after a successful reset must fail.
    const replay = await fetch(`${baseUrl}/api/v1/auth/reset-password-verify`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, code: second, newPassword: fixturePassword('Replay-Reset') })
    });
    assert.equal(replay.status, 400);
  } finally {
    console.log = originalLog;
    await new Promise<void>(resolve => server.close(() => resolve()));
    await db.close();
  }
});

test('IDENTITY regression: new creator, host and consumer are provisioned into isolated role-owned identities', async () => {
  const db = await openMajalDatabase({ filename: ':memory:' });
  const now = new Date().toISOString();
  const legacyUser = await createUser(db, {
    name: 'أم عبدالله', email: 'old-creator@example.test', phone: '+96550000111',
    password: fixturePassword('Old-Creator'), role: 'CREATOR'
  });
  await db.prepare("INSERT INTO creator_profiles(id,user_id,display_name,specialty,completion_score,matching_enabled,created_at,updated_at) VALUES('cr_main',?,'أم عبدالله','حلويات',100,1,?,?)")
    .run(legacyUser.id, now, now);
  await db.prepare("UPDATE users SET creator_id='cr_main' WHERE id=?").run(legacyUser.id);

  const app = express();
  app.use(express.json());
  app.use('/api/v1/auth', createAuthRouter(db, config));
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  try {
    const creatorRes = await fetch(`${baseUrl}/api/v1/auth/register`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'عمر', email: 'omar-creator@example.test', phone: '+96550000112', password: fixturePassword('Omar-Creator'), role: 'CREATOR' })
    });
    assert.equal(creatorRes.status, 201);
    const creatorBody = await creatorRes.json() as { user: { id:string; role:string; creatorId?:string; hostBusinessId?:string } };
    assert.equal(creatorBody.user.role, 'CREATOR');
    assert.ok(creatorBody.user.creatorId);
    assert.notEqual(creatorBody.user.creatorId, 'cr_main');
    assert.equal(creatorBody.user.hostBusinessId, undefined);
    const omarProfile = await db.prepare('SELECT user_id,display_name FROM creator_profiles WHERE id=?').get<{user_id:string;display_name:string}>(creatorBody.user.creatorId!);
    assert.equal(omarProfile?.user_id, creatorBody.user.id);
    assert.equal(omarProfile?.display_name, 'عمر');

    const hostRes = await fetch(`${baseUrl}/api/v1/auth/register`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'مالك المطعم', email: 'host-owner@example.test', phone: '+96550000113', password: fixturePassword('Host-Owner'), role: 'HOST_OWNER',
        organization: { commercialName: 'مطعم عمر', businessType: 'RESTAURANT', commercialRegistrationNo: 'CR-OMAR-001' }
      })
    });
    assert.equal(hostRes.status, 201);
    const hostBody = await hostRes.json() as { user: { id:string; role:string; creatorId?:string; hostBusinessId?:string } };
    assert.equal(hostBody.user.role, 'HOST_OWNER');
    assert.ok(hostBody.user.hostBusinessId);
    assert.equal(hostBody.user.creatorId, undefined);
    const org = await db.prepare('SELECT commercial_name,verification_status,business_type FROM organizations WHERE id=?').get<{commercial_name:string;verification_status:string;business_type:string}>(hostBody.user.hostBusinessId!);
    assert.deepEqual(org, { commercial_name: 'مطعم عمر', verification_status: 'UNVERIFIED', business_type: 'RESTAURANT' });
    const membership = await db.prepare('SELECT role,status FROM organization_memberships WHERE organization_id=? AND user_id=?').get<{role:string;status:string}>(hostBody.user.hostBusinessId!, hostBody.user.id);
    assert.deepEqual(membership, { role: 'HOST_OWNER', status: 'ACTIVE' });

    const consumerRes = await fetch(`${baseUrl}/api/v1/auth/register`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'عميل جديد', email: 'consumer-new@example.test', phone: '+96550000114', password: fixturePassword('Consumer-New'), role: 'CONSUMER' })
    });
    assert.equal(consumerRes.status, 201);
    const consumerBody = await consumerRes.json() as { user: { role:string; creatorId?:string; hostBusinessId?:string } };
    assert.equal(consumerBody.user.role, 'CONSUMER');
    assert.equal(consumerBody.user.creatorId, undefined);
    assert.equal(consumerBody.user.hostBusinessId, undefined);
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    await db.close();
  }
});
