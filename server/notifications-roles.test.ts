import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash, randomBytes } from 'node:crypto';
import express from 'express';
import { AddressInfo } from 'node:net';
import { createAuthRouter, createPublicRegistration, createUser } from './auth';
import { createEcosystemRouter } from './ecosystem';
import { createTeamRouter } from './team';
import { openTestDatabase } from './test-db';

const config = {
  production: false, sessionSecret: 'test-session-secret-that-is-long-enough-123456',
  encryptionKey: 'test-encryption-key-that-is-long-enough-12345', sessionHours: 8, cookieName: 'majal_session', csrfCookieName: 'majal_csrf'
};
const password = `${randomBytes(12).toString('base64url')}-Aa1!`;
interface Session { cookie: string; csrf: string }
const job = { title: 'مشرف إنتاج', employmentType: 'FULL_TIME', location: 'الشويخ', description: 'الإشراف على خط الإنتاج والتأكد من مطابقة الوصفة المعتمدة في كل وردية.', requirements: [], salaryMinFils: 650000, salaryMaxFils: 850000 };

test('each role is told only about its own events: jobs, supplier verification and team joins', async () => {
  const db = await openTestDatabase();
  const app = express();
  app.use(express.json());
  app.use('/api/v1/auth', createAuthRouter(db, config));
  app.use('/api/v1/ecosystem', createEcosystemRouter(db, config));
  app.use('/api/v1/team', createTeamRouter(db, config));
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(r => server.once('listening', r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1`;
  const login = async (email: string): Promise<Session> => {
    const r = await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password }) });
    assert.equal(r.status, 200, email);
    return { cookie: r.headers.getSetCookie().map(c => c.split(';')[0]).join('; '), csrf: ((await r.json()) as { csrfToken: string }).csrfToken };
  };
  const call = (s: Session | null, method: string, path: string, body?: unknown) => fetch(`${base}${path}`, {
    method, headers: { ...(s ? { cookie: s.cookie, 'x-csrf-token': s.csrf } : {}), ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined
  });
  const inbox = async (email: string) => {
    const u = await db.prepare('SELECT id FROM users WHERE email = ?').get<{ id: string }>(email);
    return (await db.prepare('SELECT category, dedupe_key FROM notification_inbox WHERE user_id = ? ORDER BY dedupe_key').all<{ category: string; dedupe_key: string }>(u!.id)).map(r => `${r.category}|${r.dedupe_key}`);
  };
  try {
    const owner = await createPublicRegistration(db, { name: 'مالك', email: 'a@n.test', phone: '+96550000001', password, role: 'HOST_OWNER' }, { commercialName: 'مطبخ أ', businessType: 'CENTRAL_KITCHEN' });
    await createPublicRegistration(db, { name: 'مالك ب', email: 'b@n.test', phone: '+96550000002', password, role: 'HOST_OWNER' }, { commercialName: 'مخبز ب', businessType: 'BAKERY' });
    await createUser(db, { name: 'Admin', email: 'admin@n.test', password, role: 'ADMIN' });
    await createUser(db, { name: 'باحث', email: 'seeker@n.test', phone: '+96550000003', password, role: 'CONSUMER' });
    const [a, admin, seeker] = await Promise.all(['a', 'admin', 'seeker'].map(n => login(`${n}@n.test`)));

    const { job: posted } = await (await call(a, 'POST', '/ecosystem/jobs', job)).json();
    assert.deepEqual(await inbox('admin@n.test'), ['ADMIN_REVIEW|admin-pending:job']);
    assert.deepEqual(await inbox('a@n.test'), [], 'the poster is not told about their own submission');

    await call(admin, 'POST', `/ecosystem/admin/jobs/${posted.id}/review`, { decision: 'APPROVED' });
    assert.deepEqual(await inbox('a@n.test'), [`JOB_REVIEW|job-review:${posted.id}:APPROVED`]);
    assert.deepEqual(await inbox('admin@n.test'), ['ADMIN_REVIEW|admin-pending:job'], 'the reviewing admin is not told about their own decision');

    await call(seeker, 'POST', `/ecosystem/jobs/${posted.id}/apply`, { kuwaitiDeclaration: true, yearsExperience: 2 });
    assert.deepEqual(await inbox('a@n.test'), [`JOB_APPLICATION|job-app:${posted.id}`, `JOB_REVIEW|job-review:${posted.id}:APPROVED`]);
    assert.deepEqual(await inbox('seeker@n.test'), [], 'the applicant gets nothing');
    assert.deepEqual(await inbox('b@n.test'), [], 'another facility sees nothing');

    // Supplier verification: admins are told of the request, the supplier of the decision, nobody else.
    await createPublicRegistration(db, { name: 'مورد', email: 'sup@n.test', phone: '+96550000009', password, role: 'CONSUMER' }, { accountType: 'SUPPLIER', supplierCommercialName: 'مورد التغليف', supplierCategory: 'PACKAGING' });
    const sup = await login('sup@n.test');
    const submitted = await call(sup, 'POST', '/ecosystem/supplier/submit-verification', { commercialRegistrationNo: 'CR-12345' });
    assert.equal(submitted.status, 200);
    assert.ok((await inbox('admin@n.test')).includes('ADMIN_REVIEW|admin-pending:supplier-verification'));
    assert.deepEqual(await inbox('sup@n.test'), [], 'the supplier is not told about their own request');
    const supplierId = (await db.prepare("SELECT s.id FROM supplier_profiles s JOIN users u ON u.id=s.user_id WHERE u.email='sup@n.test'").get<{ id: string }>())!.id;
    assert.equal((await call(admin, 'POST', `/ecosystem/admin/suppliers/${supplierId}/review`, { decision: 'VERIFIED' })).status, 200);
    assert.deepEqual(await inbox('sup@n.test'), [`VERIFICATION|supplier-review:${supplierId}:VERIFIED`]);
    assert.deepEqual(await inbox('b@n.test'), [], 'another facility sees nothing');

    // Team: the owner is told when a colleague joins; nobody else is.
    const token = randomBytes(24).toString('hex');
    await db.prepare('INSERT INTO organization_invites(id, organization_id, email, role, token_hash, invited_by_user_id, expires_at, created_at) VALUES(?,?,?,?,?,?,?,?)')
      .run('inv_n', owner.host_business_id, 'chef@n.test', 'HOST_CHEF', createHash('sha256').update(token).digest('hex'), owner.id, new Date(Date.now() + 86_400_000).toISOString(), new Date().toISOString());
    assert.equal((await call(null, 'POST', '/team/invites/accept', { token, name: 'الشيف', password })).status, 201);
    assert.ok((await inbox('a@n.test')).includes('TEAM|team-joined:inv_n'));
    assert.deepEqual(await inbox('b@n.test'), []);
  } finally { await new Promise<void>(r => server.close(() => r())); await db.close(); }
});
