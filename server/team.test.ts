import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash, randomBytes } from 'node:crypto';
import express from 'express';
import { AddressInfo } from 'node:net';
import { openTestDatabase } from './test-db';
import { createPublicRegistration } from './auth';
import { createTeamRouter } from './team';

const config = {
  production: false, sessionSecret: 'test-session-secret-that-is-long-enough-123456',
  encryptionKey: 'test-encryption-key-that-is-long-enough-12345', sessionHours: 8, cookieName: 'majal_session', csrfCookieName: 'majal_csrf'
};
const password = `${randomBytes(12).toString('base64url')}-Aa1!`;
const sha = (v: string) => createHash('sha256').update(v).digest('hex');

test('an invited colleague joins the owner\'s organization with exactly the invited role, once', async () => {
  const db = await openTestDatabase();
  const app = express();
  app.use(express.json());
  app.use('/api/v1/team', createTeamRouter(db, config));
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1/team`;
  const post = (path: string, body: unknown) => fetch(`${base}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  try {
    const owner = await createPublicRegistration(db, { name: 'مالك', email: 'owner@team.test', phone: '+96550000001', password, role: 'HOST_OWNER' }, { commercialName: 'مخبز الفريق', businessType: 'BAKERY' });
    const orgId = owner.host_business_id as string;
    assert.ok(orgId);
    const token = randomBytes(24).toString('hex');
    await db.prepare('INSERT INTO organization_invites(id, organization_id, email, role, token_hash, invited_by_user_id, expires_at, created_at) VALUES(?,?,?,?,?,?,?,?)')
      .run('inv_1', orgId, 'chef@team.test', 'HOST_CHEF', sha(token), owner.id, new Date(Date.now() + 86_400_000).toISOString(), new Date().toISOString());

    const preview = await (await fetch(`${base}/invites/${token}`)).json();
    assert.equal(preview.organizationName, 'مخبز الفريق');
    assert.equal(preview.role, 'HOST_CHEF');
    assert.equal((await fetch(`${base}/invites/${'z'.repeat(48)}`)).status, 404);

    assert.equal((await post('/invites/accept', { token, name: 'الشيف', password: 'short' })).status, 400);
    const accepted = await post('/invites/accept', { token, name: 'الشيف', password });
    assert.equal(accepted.status, 201);
    const user = await db.prepare('SELECT role, host_business_id FROM users WHERE email = ?').get<{ role: string; host_business_id: string }>('chef@team.test');
    assert.deepEqual({ role: user?.role, org: user?.host_business_id }, { role: 'HOST_CHEF', org: orgId });
    const membership = await db.prepare("SELECT role FROM organization_memberships WHERE organization_id = ? AND role = 'HOST_CHEF'").get<{ role: string }>(orgId);
    assert.equal(membership?.role, 'HOST_CHEF');
    // The same link cannot be replayed.
    assert.equal((await post('/invites/accept', { token, name: 'آخر', password })).status, 404);
    // Management endpoints need an owner session.
    assert.equal((await fetch(`${base}/`)).status, 401);
    assert.equal((await post('/invites', { email: 'x@y.test', role: 'HOST_OWNER' })).status, 401);
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    await db.close();
  }
});
