import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash, randomBytes } from 'node:crypto';
import express from 'express';
import { AddressInfo } from 'node:net';
import { createAuthRouter, createPublicRegistration, createUser } from './auth';
import { createDomainRouter } from './domain';
import { createTeamRouter } from './team';
import { msUntilNextLaunchEvent } from './launch-schedule';
import { openTestDatabase } from './test-db';

const config = {
  production: false, sessionSecret: 'test-session-secret-that-is-long-enough-123456',
  encryptionKey: 'test-encryption-key-that-is-long-enough-12345', sessionHours: 8, cookieName: 'majal_session', csrfCookieName: 'majal_csrf'
};
const password = `${randomBytes(12).toString('base64url')}-Aa1!`;
const sha = (v: string) => createHash('sha256').update(v).digest('hex');

async function harness() {
  const db = await openTestDatabase();
  const app = express();
  app.use(express.json());
  app.use('/api/v1/auth', createAuthRouter(db, config));
  app.use('/api/v1/domain', createDomainRouter(db, config));
  app.use('/api/v1/team', createTeamRouter(db, config));
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(r => server.once('listening', r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1`;
  const login = async (email: string) => {
    const r = await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password }) });
    assert.equal(r.status, 200, email);
    return { cookie: r.headers.getSetCookie().map(c => c.split(';')[0]).join('; '), csrf: ((await r.json()) as { csrfToken: string }).csrfToken };
  };
  const post = (s: { cookie: string; csrf: string } | null, path: string, body: unknown = {}) => fetch(`${base}${path}`, {
    method: 'POST', headers: { ...(s ? { cookie: s.cookie, 'x-csrf-token': s.csrf } : {}), 'content-type': 'application/json' }, body: JSON.stringify(body)
  });
  const close = async () => { await new Promise<void>(r => server.close(() => r())); await db.close(); };
  return { db, login, post, close };
}

test('a launch the platform paused cannot be switched back to LIVE by the host', async () => {
  const { db, login, post, close } = await harness();
  try {
    const now = new Date().toISOString();
    const host = await createPublicRegistration(db, { name: 'مالك', email: 'host@pause.test', phone: '+96550000001', password, role: 'HOST_OWNER' }, { commercialName: 'مطبخ', businessType: 'CENTRAL_KITCHEN' });
    const creator = await createPublicRegistration(db, { name: 'مبدعة', email: 'creator@pause.test', phone: '+96550000002', password, role: 'CREATOR' });
    const org = host.host_business_id as string;
    await db.prepare("UPDATE organizations SET verification_status='VERIFIED' WHERE id=?").run(org);
    // State right after POST /moderation/products/:id/pause on a live launch.
    await db.prepare("INSERT INTO products(id,creator_id,public_name,category,short_description,status,estimated_unit_cost_fils,target_price_fils,created_at,updated_at) VALUES('prod_p',?,'مجبوس','MEAL','d','PAUSED',500,10000,?,?)").run(creator.creator_id, now, now);
    await db.prepare("INSERT INTO collaborations(id,product_id,creator_id,organization_id,stage,created_at,updated_at) VALUES('col_p','prod_p',?,?,'LIVE_TRIAL',?,?)").run(creator.creator_id, org, now, now);
    await db.prepare("INSERT INTO contract_versions(id,collaboration_id,version_number,document_sha256,object_storage_key,status,created_at) VALUES('ctr_p','col_p',1,'h','k','FULLY_SIGNED',?)").run(now);
    for (const key of ['productionRecipeApproved', 'productNamePriceApproved', 'packagingDataCompleted', 'productionLocationSelected', 'settlementConfigApproved'])
      await db.prepare("INSERT INTO launch_gate_items(collaboration_id,gate_key,value,updated_by_user_id,updated_at) VALUES('col_p',?,1,?,?)").run(key, host.id, now);
    await db.prepare("INSERT INTO launches(id,collaboration_id,product_id,organization_id,status,quantity_cap,created_at,updated_at) VALUES('lch_p','col_p','prod_p',?,'PAUSED',100,?,?)").run(org, now, now);

    const h = await login('host@pause.test');
    const refused = await post(h, '/domain/collaborations/col_p/launch/activate', {});
    assert.equal(refused.status, 409);
    assert.equal((await refused.json() as { code: string }).code, 'PRODUCT_PAUSED');
    assert.equal((await db.prepare("SELECT status FROM launches WHERE id='lch_p'").get<{ status: string }>())?.status, 'PAUSED');

    // After the admin resumes the product, the documented path (pass the gate again, activate) works.
    await db.prepare("UPDATE products SET status='AVAILABLE_FOR_MATCHING' WHERE id='prod_p'").run();
    const resumed = await post(h, '/domain/collaborations/col_p/launch/activate', {});
    assert.equal(resumed.status, 200, await resumed.clone().text());
  } finally { await close(); }
});

test('a launch opened immediately does not keep the schedule sweeper awake', async () => {
  const db = await openTestDatabase();
  try {
    const at = new Date();
    const now = at.toISOString();
    const creator = await createPublicRegistration(db, { name: 'مبدعة', email: 'creator@sweep.test', phone: '+96550000002', password, role: 'CREATOR' });
    const host = await createPublicRegistration(db, { name: 'مالك', email: 'host@sweep.test', phone: '+96550000001', password, role: 'HOST_OWNER' }, { commercialName: 'مطبخ', businessType: 'CENTRAL_KITCHEN' });
    const org = host.host_business_id as string;
    await db.prepare("INSERT INTO products(id,creator_id,public_name,category,short_description,status,estimated_unit_cost_fils,target_price_fils,created_at,updated_at) VALUES('prod_s',?,'مجبوس','MEAL','d','LIVE_DROP',500,10000,?,?)").run(creator.creator_id, now, now);
    await db.prepare("INSERT INTO collaborations(id,product_id,creator_id,organization_id,stage,created_at,updated_at) VALUES('col_s','prod_s',?,?,'LIVE_TRIAL',?,?)").run(creator.creator_id, org, now, now);
    // Exactly what /launch/activate writes without opensAt: starts now, opening already announced.
    await db.prepare("INSERT INTO launches(id,collaboration_id,product_id,organization_id,status,starts_at,open_notified_at,opens_reminded_at,created_at,updated_at) VALUES('lch_s','col_s','prod_s',?,'LIVE',?,?,NULL,?,?)").run(org, now, now, now, now);
    assert.equal(await msUntilNextLaunchEvent(db, new Date(at.getTime() + 60_000)), null, 'nothing left to remind or announce');

    // A scheduled launch still wakes the sweeper an hour before it opens.
    const later = new Date(at.getTime() + 3 * 3_600_000).toISOString();
    await db.prepare("UPDATE launches SET starts_at=?, open_notified_at=NULL WHERE id='lch_s'").run(later);
    assert.equal(await msUntilNextLaunchEvent(db, at), 2 * 3_600_000);
  } finally { await db.close(); }
});

test('a facility owner cannot lift a platform suspension through the team screen', async () => {
  const { db, login, post, close } = await harness();
  try {
    const owner = await createPublicRegistration(db, { name: 'مالك', email: 'owner@susp.test', phone: '+96550000001', password, role: 'HOST_OWNER' }, { commercialName: 'مخبز', businessType: 'BAKERY' });
    const org = owner.host_business_id as string;
    const chef = await createUser(db, { name: 'شيف', email: 'chef@susp.test', phone: '+96550000005', password, role: 'HOST_CHEF', hostBusinessId: org });
    await db.prepare("INSERT INTO organization_memberships(organization_id,user_id,role,status,created_at) VALUES(?,?,?,?,?)").run(org, chef.id, 'HOST_CHEF', 'ACTIVE', new Date().toISOString());
    // What POST /moderation/users/:id/status {SUSPENDED} does: the account, not the membership.
    await db.prepare("UPDATE users SET status='SUSPENDED' WHERE id=?").run(chef.id);

    const o = await login('owner@susp.test');
    const changed = await post(o, `/team/members/${chef.id}`, { role: 'HOST_OPERATIONS' });
    assert.equal(changed.status, 200, await changed.clone().text());
    const row = await db.prepare('SELECT role, status FROM users WHERE id=?').get<{ role: string; status: string }>(chef.id);
    assert.deepEqual([row?.role, row?.status], ['HOST_OPERATIONS', 'SUSPENDED'], 'role changes, suspension stays');
    await post(o, `/team/members/${chef.id}`, { status: 'ACTIVE' });
    assert.equal((await db.prepare('SELECT status FROM users WHERE id=?').get<{ status: string }>(chef.id))?.status, 'SUSPENDED');

    // The owner's own suspend / reactivate still round-trips.
    const other = await createUser(db, { name: 'موظف', email: 'staff@susp.test', phone: '+96550000006', password, role: 'HOST_SUPPORT', hostBusinessId: org });
    await db.prepare("INSERT INTO organization_memberships(organization_id,user_id,role,status,created_at) VALUES(?,?,?,?,?)").run(org, other.id, 'HOST_SUPPORT', 'ACTIVE', new Date().toISOString());
    await post(o, `/team/members/${other.id}`, { status: 'SUSPENDED' });
    assert.equal((await db.prepare('SELECT status FROM users WHERE id=?').get<{ status: string }>(other.id))?.status, 'SUSPENDED');
    await post(o, `/team/members/${other.id}`, { status: 'ACTIVE' });
    assert.equal((await db.prepare('SELECT status FROM users WHERE id=?').get<{ status: string }>(other.id))?.status, 'ACTIVE');
  } finally { await close(); }
});

test('an invite accepted with a malformed phone is a 400 and the invite stays usable', async () => {
  const { db, post, close } = await harness();
  try {
    const owner = await createPublicRegistration(db, { name: 'مالك', email: 'owner@phone.test', phone: '+96550000001', password, role: 'HOST_OWNER' }, { commercialName: 'مخبز', businessType: 'BAKERY' });
    const token = randomBytes(24).toString('hex');
    await db.prepare('INSERT INTO organization_invites(id, organization_id, email, role, token_hash, invited_by_user_id, expires_at, created_at) VALUES(?,?,?,?,?,?,?,?)')
      .run('inv_p', owner.host_business_id, 'chef@phone.test', 'HOST_CHEF', sha(token), owner.id, new Date(Date.now() + 86_400_000).toISOString(), new Date().toISOString());
    const bad = await post(null, '/team/invites/accept', { token, name: 'الشيف', password, phone: 'abcdefgh' });
    assert.equal(bad.status, 400);
    assert.equal((await bad.json() as { code: string }).code, 'INVALID_PHONE');
    const ok = await post(null, '/team/invites/accept', { token, name: 'الشيف', password, phone: '+96550000007' });
    assert.equal(ok.status, 201);
  } finally { await close(); }
});

test('approving a revoked recipe-access request is refused', async () => {
  const { db, login, post, close } = await harness();
  try {
    const now = new Date().toISOString();
    const host = await createPublicRegistration(db, { name: 'مالك', email: 'host@grant.test', phone: '+96550000001', password, role: 'HOST_OWNER' }, { commercialName: 'مطبخ', businessType: 'CENTRAL_KITCHEN' });
    const creator = await createPublicRegistration(db, { name: 'مبدعة', email: 'creator@grant.test', phone: '+96550000002', password, role: 'CREATOR' });
    await db.prepare("INSERT INTO products(id,creator_id,public_name,category,short_description,status,estimated_unit_cost_fils,target_price_fils,created_at,updated_at) VALUES('prod_g',?,'مجبوس','MEAL','d','AVAILABLE_FOR_MATCHING',500,10000,?,?)").run(creator.creator_id, now, now);
    await db.prepare("INSERT INTO recipe_access_grants(id,product_id,creator_id,organization_id,requested_by_user_id,disclosure_level,status,purpose,created_at,updated_at) VALUES('gr_1','prod_g',?,?,?,2,'REVOKED','r',?,?)")
      .run(creator.creator_id, host.host_business_id, host.id, now, now);
    const c = await login('creator@grant.test');
    const res = await post(c, '/domain/recipe-access/gr_1/approve', { disclosureLevel: 2, days: 7 });
    assert.equal(res.status, 409);
    assert.equal((await db.prepare("SELECT status FROM recipe_access_grants WHERE id='gr_1'").get<{ status: string }>())?.status, 'REVOKED');
  } finally { await close(); }
});
