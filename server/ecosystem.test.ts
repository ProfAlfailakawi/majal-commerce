import assert from 'node:assert/strict';
import test from 'node:test';
import { randomBytes } from 'node:crypto';
import express from 'express';
import { AddressInfo } from 'node:net';
import { createAuthRouter, createPublicRegistration, createUser } from './auth';
import { createEcosystemRouter } from './ecosystem';
import { openTestDatabase } from './test-db';

const config = {
  production: false, sessionSecret: 'test-session-secret-that-is-long-enough-123456',
  encryptionKey: 'test-encryption-key-that-is-long-enough-12345', sessionHours: 8, cookieName: 'majal_session', csrfCookieName: 'majal_csrf'
};
const password = `${randomBytes(12).toString('base64url')}-Aa1!`;
interface Session { cookie: string; csrf: string }

const job = { title: 'مشرف إنتاج', employmentType: 'FULL_TIME', location: 'الشويخ', description: 'الإشراف على خط الإنتاج والتأكد من مطابقة الوصفة المعتمدة في كل وردية.', requirements: ['خبرة سنتين'], salaryMinFils: 650000, salaryMaxFils: 850000 };

test('Kuwaiti jobs, real mode: employer posts, admin approves, public sees, applicants apply, tenants stay apart', async () => {
  const db = await openTestDatabase();
  const app = express();
  app.use(express.json());
  app.use('/api/v1/auth', createAuthRouter(db, config));
  app.use('/api/v1/ecosystem', createEcosystemRouter(db, config));
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(r => server.once('listening', r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1`;
  const login = async (email: string): Promise<Session> => {
    const r = await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password }) });
    assert.equal(r.status, 200, email);
    return { cookie: r.headers.getSetCookie().map(c => c.split(';')[0]).join('; '), csrf: ((await r.json()) as { csrfToken: string }).csrfToken };
  };
  const call = (s: Session | null, method: string, path: string, body?: unknown) => fetch(`${base}/ecosystem${path}`, {
    method, headers: { ...(s ? { cookie: s.cookie, 'x-csrf-token': s.csrf } : {}), ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined
  });
  try {
    await createPublicRegistration(db, { name: 'مالك أ', email: 'a@jobs.test', phone: '+96550000001', password, role: 'HOST_OWNER' }, { commercialName: 'مطبخ أ', businessType: 'CENTRAL_KITCHEN' });
    await createPublicRegistration(db, { name: 'مالك ب', email: 'b@jobs.test', phone: '+96550000002', password, role: 'HOST_OWNER' }, { commercialName: 'مخبز ب', businessType: 'BAKERY' });
    await createUser(db, { name: 'Admin', email: 'admin@jobs.test', password, role: 'ADMIN' });
    await createUser(db, { name: 'باحث', email: 'seeker@jobs.test', phone: '+96550000003', password, role: 'CONSUMER' });
    await createUser(db, { name: 'باحث ثان', email: 'seeker2@jobs.test', phone: '+96550000004', password, role: 'CONSUMER' });
    const [a, b, admin, seeker, seeker2] = await Promise.all(['a', 'b', 'admin', 'seeker', 'seeker2'].map(n => login(`${n}@jobs.test`)));

    // Posting needs an employer identity and valid data.
    assert.equal((await call(seeker, 'POST', '/jobs', job)).status, 403);
    assert.equal((await call(null, 'POST', '/jobs', job)).status, 401);
    assert.equal((await call(a, 'POST', '/jobs', { ...job, employmentType: 'FREELANCE' })).status, 400);
    assert.equal((await call(a, 'POST', '/jobs', { ...job, salaryMinFils: 900000, salaryMaxFils: 100000 })).status, 400);
    const created = await call(a, 'POST', '/jobs', job);
    assert.equal(created.status, 201);
    const { job: posted } = await created.json();
    assert.equal(posted.status, 'PENDING_REVIEW');
    assert.equal(posted.employerName, 'مطبخ أ');

    // Not public until approved; neither the other employer nor a seeker can approve or read applications.
    assert.deepEqual((await (await fetch(`${base}/ecosystem/public`)).json()).jobs, []);
    assert.equal((await call(a, 'POST', `/admin/jobs/${posted.id}/review`, { decision: 'APPROVED' })).status, 403);
    assert.equal((await call(seeker, 'POST', `/jobs/${posted.id}/apply`, { kuwaitiDeclaration: true })).status, 404, 'cannot apply to an unapproved job');
    assert.equal((await call(admin, 'POST', `/admin/jobs/${posted.id}/review`, { decision: 'MAYBE' })).status, 400);
    assert.equal((await (await call(admin, 'GET', '/admin/review-queue')).json()).jobs.length, 1);
    assert.equal((await call(admin, 'POST', `/admin/jobs/${posted.id}/review`, { decision: 'APPROVED' })).status, 200);
    const pub = (await (await fetch(`${base}/ecosystem/public`)).json()).jobs;
    assert.deepEqual(pub.map((j: { id: string }) => j.id), [posted.id]);
    assert.equal((await (await call(admin, 'GET', '/admin/review-queue')).json()).jobs.length, 0);

    // Applying: declaration required, one application per person, employer-only visibility.
    assert.equal((await call(seeker, 'POST', `/jobs/${posted.id}/apply`, { summary: 'خبرة' })).status, 400);
    const applied = await call(seeker, 'POST', `/jobs/${posted.id}/apply`, { summary: 'مشرف وردية 3 سنوات', yearsExperience: 3, kuwaitiDeclaration: true });
    assert.equal(applied.status, 201);
    const again = await call(seeker, 'POST', `/jobs/${posted.id}/apply`, { kuwaitiDeclaration: true });
    assert.equal(again.status, 409); assert.equal((await again.json()).code, 'ALREADY_APPLIED');
    assert.equal((await call(seeker2, 'POST', `/jobs/${posted.id}/apply`, { kuwaitiDeclaration: true, yearsExperience: 99 })).status, 400);
    assert.equal((await call(seeker2, 'POST', `/jobs/${posted.id}/apply`, { kuwaitiDeclaration: true, yearsExperience: 1 })).status, 201);
    assert.equal((await call(seeker, 'GET', `/jobs/${posted.id}/applications`)).status, 403);
    assert.equal((await call(b, 'GET', `/jobs/${posted.id}/applications`)).status, 403, 'another facility cannot read them');
    const apps = await (await call(a, 'GET', `/jobs/${posted.id}/applications`)).json();
    assert.equal(apps.applications.length, 2);
    assert.ok(!JSON.stringify(await (await fetch(`${base}/ecosystem/public`)).json()).includes('seeker@jobs.test'), 'applicant data is never public');
    const mine = await (await call(a, 'GET', '/me')).json();
    assert.deepEqual(mine.jobs.map((j: { id: string }) => j.id), [posted.id]);
    assert.deepEqual((await (await call(b, 'GET', '/me')).json()).jobs, []);

    // Closing: only the owner; a closed job leaves the public board and refuses applications.
    assert.equal((await call(b, 'POST', `/jobs/${posted.id}/close`)).status, 403);
    assert.equal((await call(a, 'POST', `/jobs/${posted.id}/close`)).status, 200);
    assert.deepEqual((await (await fetch(`${base}/ecosystem/public`)).json()).jobs, []);
    assert.equal((await call(seeker2, 'POST', `/jobs/${posted.id}/apply`, { kuwaitiDeclaration: true })).status, 404);
    assert.equal((await call(admin, 'POST', `/admin/jobs/${posted.id}/review`, { decision: 'APPROVED' })).status, 409, 'a closed job cannot be re-approved');
  } finally { await new Promise<void>(r => server.close(() => r())); await db.close(); }
});
