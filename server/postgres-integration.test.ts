import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import type { AddressInfo } from 'node:net';
import { createAuthRouter, type AuthConfig } from './auth';
import { createCatalogRouter } from './catalog';
import { openMajalDatabase } from './database';
import { createDomainRouter } from './domain';

const databaseUrl = process.env.TEST_DATABASE_URL?.trim();

test('PostgreSQL smoke: register, restore data and read the first catalog page', {
  skip: databaseUrl ? false : 'TEST_DATABASE_URL is not configured'
}, async () => {
  const db = await openMajalDatabase({ databaseUrl });
  const config: AuthConfig = {
    production: false,
    sessionSecret: 'postgres-test-session-secret-that-is-long-enough',
    encryptionKey: 'postgres-test-encryption-key-that-is-long-enough',
    sessionHours: 8,
    cookieName: 'majal_session',
    csrfCookieName: 'majal_csrf'
  };
  const app = express();
  app.use(express.json());
  app.use('/api/v1/auth', createAuthRouter(db, config));
  app.use('/api/v1/domain', createDomainRouter(db, config));
  app.use('/api/v1/catalog', createCatalogRouter(db, config));
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const email = `postgres-smoke-${Date.now()}@example.test`;
  const password = ['Majal', 'Postgres', 'Smoke', '2026!'].join('-');

  try {
    const registered = await fetch(`${baseUrl}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'PostgreSQL Smoke User',
        email,
        phone: '+96550008888',
        password,
        role: 'CONSUMER'
      })
    });
    assert.equal(registered.status, 201, registered.status === 201 ? undefined : await registered.text());
    const cookies = registered.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');

    // A safe authenticated read must not require a CSRF header, and the complete snapshot
    // query must execute on the same PostgreSQL dialect used in production.
    const snapshot = await fetch(`${baseUrl}/api/v1/domain/snapshot`, {
      headers: { cookie: cookies }
    });
    assert.equal(snapshot.status, 200, snapshot.status === 200 ? undefined : await snapshot.text());
    const snapshotBody = await snapshot.json() as Record<string, unknown>;
    assert.ok(Array.isArray(snapshotBody.products));
    assert.ok(Array.isArray(snapshotBody.marketLaunches));

    const catalog = await fetch(`${baseUrl}/api/v1/catalog`);
    assert.equal(catalog.status, 200, catalog.status === 200 ? undefined : await catalog.text());
    const catalogBody = await catalog.json() as { items?: unknown[]; nextCursor?: unknown };
    assert.ok(Array.isArray(catalogBody.items));
    assert.equal(catalogBody.nextCursor, null);
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    await db.prepare('DELETE FROM users WHERE email = ?').run(email);
    await db.close();
  }
});
