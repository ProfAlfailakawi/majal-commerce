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

test('admin audit screen reads the server audit trail: admin-only, newest first, paginated, no hashes', async () => {
  const db = await openTestDatabase();
  const app = express();
  app.use(express.json());
  app.use('/api/v1/auth', createAuthRouter(db, config));
  app.use('/api/v1/moderation', createModerationRouter(db, config));
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(r => server.once('listening', r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1`;
  try {
    const admin = await createUser(db, { name: 'مدير', email: 'admin@audit.test', phone: '+96550000031', password, role: 'ADMIN' });
    await createUser(db, { name: 'عميل', email: 'buyer@audit.test', phone: '+96550000032', password, role: 'CONSUMER' });
    for (let i = 1; i <= 3; i += 1) {
      await db.prepare(`INSERT INTO domain_audit_events(actor_user_id, actor_role, organization_id, action, entity_type, entity_id, before_sha256, after_sha256, request_id, session_hash, created_at)
        VALUES(?, 'ADMIN', NULL, 'PRODUCT_PAUSED', 'PRODUCT', ?, 'b', 'a', ?, 'secret-session-hash', ?)`)
        .run(admin.id, `prd_${i}`, `req_${i}`, new Date(Date.UTC(2026, 0, i)).toISOString());
    }
    const login = async (email: string) => {
      const res = await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password }) });
      assert.equal(res.status, 200);
      return res.headers.getSetCookie().map(c => c.split(';')[0]).join('; ');
    };
    const get = async (cookie: string | undefined, query = '') => {
      const res = await fetch(`${base}/moderation/audit-events${query}`, { headers: cookie ? { cookie } : {} });
      return { status: res.status, body: await res.json() as { events?: Array<Record<string, unknown>>; nextBefore?: number | null } };
    };

    assert.equal((await get(undefined)).status, 401, 'anonymous is rejected');
    assert.equal((await get(await login('buyer@audit.test'))).status, 403, 'non-admin is rejected');

    const cookie = await login('admin@audit.test');
    const first = await get(cookie, '?limit=2');
    assert.equal(first.status, 200);
    assert.deepEqual(first.body.events?.map(e => e.entityId), ['prd_3', 'prd_2'], 'newest first');
    assert.equal(first.body.events?.[0].actorUserId, admin.id);
    assert.equal(first.body.events?.[0].action, 'PRODUCT_PAUSED');
    for (const event of first.body.events ?? []) {
      assert.deepEqual(Object.keys(event).sort(), ['action', 'actorRole', 'actorUserId', 'createdAt', 'entityId', 'entityType', 'id', 'organizationId']);
    }
    assert.ok(first.body.nextBefore);

    const second = await get(cookie, `?limit=2&before=${first.body.nextBefore}`);
    assert.deepEqual(second.body.events?.map(e => e.entityId), ['prd_1']);
    assert.equal(second.body.nextBefore, null);

    assert.equal((await get(cookie, '?before=abc')).status, 400, 'invalid cursor is rejected');
  } finally {
    server.close();
    await db.close();
  }
});
