import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import { AddressInfo } from 'node:net';
import { openMajalDatabase } from './database';

// SUPER_ADMIN_EMAILS is read at module load, so it must be set before auth is imported.
process.env.SUPER_ADMIN_EMAILS = 'owner@example.test';
const { createAuthRouter, ensureSuperAdminUser } = await import('./auth');

const config = {
  production: false,
  sessionSecret: 'test-session-secret-that-is-long-enough-123456',
  encryptionKey: 'test-encryption-key-that-is-long-enough-12345',
  sessionHours: 8,
  cookieName: 'majal_session',
  csrfCookieName: 'majal_csrf'
};

const password = ['Majal', 'Reserve', '2026!'].join('-');

test('public registration cannot claim a SUPER_ADMIN_EMAILS address', async () => {
  const db = await openMajalDatabase({ filename: ':memory:' });
  const app = express();
  app.use(express.json());
  app.use('/api/v1/auth', createAuthRouter(db, config));
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    const response = await fetch(`${baseUrl}/api/v1/auth/register`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Attacker', email: 'Owner@Example.test', phone: '+96550000009', password })
    });
    assert.equal(response.status, 403);
    assert.equal((await response.json()).code, 'RESERVED_ACCOUNT');
    assert.equal(response.headers.getSetCookie().length, 0);
    const row = await db.prepare('SELECT id FROM users WHERE email = ?').get('owner@example.test');
    assert.equal(row, undefined);
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    await db.close();
  }
});

test('boot never promotes an existing non-admin account named in SUPER_ADMIN_EMAILS', async () => {
  const db = await openMajalDatabase({ filename: ':memory:' });
  try {
    const { createUser } = await import('./auth');
    await createUser(db, { name: 'Squatter', email: 'owner@example.test', phone: '+96550000010', password, role: 'CONSUMER', status: 'ACTIVE' });
    await ensureSuperAdminUser(db);
    const row = await db.prepare('SELECT role FROM users WHERE email = ?').get<{ role: string }>('owner@example.test');
    assert.equal(row?.role, 'CONSUMER');
  } finally {
    await db.close();
  }
});
