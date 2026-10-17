import assert from 'node:assert/strict';
import test from 'node:test';
import { randomBytes } from 'node:crypto';
import express from 'express';
import { AddressInfo } from 'node:net';
import { createAuthRouter, createUser } from './auth';
import { adminMetrics, createAdminMetricsRouter } from './admin-metrics';
import { openTestDatabase } from './test-db';

const config = {
  production: false, sessionSecret: 'test-session-secret-that-is-long-enough-123456',
  encryptionKey: 'test-encryption-key-that-is-long-enough-12345', sessionHours: 8, cookieName: 'majal_session', csrfCookieName: 'majal_csrf'
};
const password = `${randomBytes(12).toString('base64url')}-Aa1!`;

async function seed(db: Awaited<ReturnType<typeof openTestDatabase>>) {
  const now = new Date().toISOString();
  const creator = await createUser(db, { name: 'مبدعة', email: 'creator@m.test', phone: '+96550000010', password, role: 'CREATOR' });
  await db.prepare("INSERT INTO creator_profiles(id,user_id,display_name,specialty,created_at,updated_at) VALUES('cr_m',?,'م','b',?,?)").run(creator.id, now, now);
  await db.prepare("INSERT INTO organizations(id,commercial_name,organization_type,verification_status,created_at,updated_at) VALUES('org_m1','مطبخ 1','HOST','VERIFIED',?,?)").run(now, now);
  await db.prepare("INSERT INTO organizations(id,commercial_name,organization_type,verification_status,created_at,updated_at) VALUES('org_m2','مطبخ 2','HOST','PENDING',?,?)").run(now, now);
  await db.prepare("INSERT INTO products(id,creator_id,public_name,category,short_description,status,estimated_unit_cost_fils,target_price_fils,created_at,updated_at) VALUES('prod_m','cr_m','منتج','MEAL','d','LIVE_DROP',500,10000,?,?)").run(now, now);
  // Collaboration 1 is live (fee 10%), collaboration 2 is in dispute.
  await db.prepare("INSERT INTO collaborations(id,product_id,creator_id,organization_id,stage,created_at,updated_at) VALUES('col_m1','prod_m','cr_m','org_m1','LIVE_TRIAL',?,?)").run(now, now);
  await db.prepare("INSERT INTO products(id,creator_id,public_name,category,short_description,status,estimated_unit_cost_fils,target_price_fils,created_at,updated_at) VALUES('prod_m2','cr_m','منتج 2','MEAL','d','LIVE_DROP',500,10000,?,?)").run(now, now);
  await db.prepare("INSERT INTO collaborations(id,product_id,creator_id,organization_id,stage,created_at,updated_at) VALUES('col_m2','prod_m2','cr_m','org_m2','DISPUTED',?,?)").run(now, now);
  // An older accepted offer (5%) must lose to the latest accepted one (10%).
  await db.prepare("INSERT INTO offer_versions(id,collaboration_id,version_number,sender_user_id,selling_price_fils,creator_royalty_basis_points,platform_fee_basis_points,status,terms_json,created_at) VALUES('off1','col_m1',1,?,10000,1500,500,'ACCEPTED','{}',?)").run(creator.id, now);
  await db.prepare("INSERT INTO offer_versions(id,collaboration_id,version_number,sender_user_id,selling_price_fils,creator_royalty_basis_points,platform_fee_basis_points,status,terms_json,created_at) VALUES('off2','col_m1',2,?,10000,1500,1000,'ACCEPTED','{}',?)").run(creator.id, now);
  await db.prepare("INSERT INTO launches(id,collaboration_id,product_id,organization_id,status,quantity_cap,starts_at,created_at,updated_at) VALUES('lch_m1','col_m1','prod_m','org_m1','LIVE',100,?,?,?)").run(now, now, now);
  await db.prepare("INSERT INTO contract_versions(id,collaboration_id,version_number,document_sha256,object_storage_key,status,created_at) VALUES('ctr1','col_m1',1,'h','k','FULLY_SIGNED',?)").run(now);
  await db.prepare("INSERT INTO contract_versions(id,collaboration_id,version_number,document_sha256,object_storage_key,status,created_at) VALUES('ctr2','col_m1',2,'h','k','FULLY_SIGNED',?)").run(now);
  const buyer = await createUser(db, { name: 'مشتري', email: 'buyer@m.test', phone: '+96550000011', password, role: 'CONSUMER' });
  const order = (id: string, units: number, status: string) => db.prepare('INSERT INTO orders(id,launch_id,consumer_user_id,units,unit_price_fils,total_fils,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)').run(id, 'lch_m1', buyer.id, units, 10000, units * 10000, status, now, now);
  await order('o1', 3, 'PAID'); await order('o2', 2, 'FULFILLED'); await order('o3', 5, 'PENDING_PAYMENT'); await order('o4', 4, 'CANCELLED'); await order('o5', 1, 'REFUNDED');
  await db.prepare("INSERT INTO accruals(id,order_id,creator_id,amount_fils,status,created_at,updated_at) VALUES('a1','o1','cr_m',4500,'ELIGIBLE',?,?)").run(now, now);
  await db.prepare("INSERT INTO accruals(id,order_id,creator_id,amount_fils,status,created_at,updated_at) VALUES('a2','o2','cr_m',3000,'ELIGIBLE',?,?)").run(now, now);
  await db.prepare("INSERT INTO settlement_batches(id,creator_id,total_fils,status,created_at,updated_at) VALUES('s1','cr_m',9000,'PAID',?,?)").run(now, now);
  await db.prepare("INSERT INTO settlement_batches(id,creator_id,total_fils,status,created_at,updated_at) VALUES('s2','cr_m',2500,'APPROVED',?,?)").run(now, now);
}

test('admin metrics are computed from paid orders, latest accepted offer, collaborations and settlements', async () => {
  const db = await openTestDatabase();
  try {
    assert.deepEqual((await adminMetrics(db)).sales, { paidOrders: 0, grossFils: 0, platformFeeFils: 0, pendingPaymentOrders: 0 }, 'an empty platform reports zeros, not errors');
    await seed(db);
    const m = await adminMetrics(db);
    // 5 units paid/fulfilled at 10.000 KWD; fee is 10% (the latest accepted offer), not 5%. Pending/cancelled/refunded are excluded.
    assert.deepEqual(m.sales, { paidOrders: 2, grossFils: 50000, platformFeeFils: 5000, pendingPaymentOrders: 1 });
    assert.equal(m.contracts.fullySigned, 1, 'two signed versions of one collaboration count once');
    assert.equal(m.disputes.open, 1);
    assert.deepEqual(m.hosts, { total: 2, verified: 1 });
    assert.equal(m.launches.live, 1);
    assert.equal(m.settlements.eligibleCreators, 1, 'two eligible accruals of one creator count once');
    assert.deepEqual([m.settlements.paidFils, m.settlements.approvedFils, m.settlements.batchesTotal], [9000, 2500, 2]);
  } finally { await db.close(); }
});

test('only administrators can read the metrics', async () => {
  const db = await openTestDatabase();
  const app = express();
  app.use(express.json());
  app.use('/api/v1/auth', createAuthRouter(db, config));
  app.use('/api/v1/admin', createAdminMetricsRouter(db, config));
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(r => server.once('listening', r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1`;
  const login = async (email: string) => {
    const r = await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password }) });
    assert.equal(r.status, 200, email);
    return r.headers.getSetCookie().map(c => c.split(';')[0]).join('; ');
  };
  try {
    await createUser(db, { name: 'أدمن', email: 'admin@m.test', phone: '+96550000012', password, role: 'ADMIN' });
    await createUser(db, { name: 'سوبر', email: 'super@m.test', phone: '+96550000013', password, role: 'SUPER_ADMIN' });
    await createUser(db, { name: 'مشتري', email: 'c@m.test', phone: '+96550000014', password, role: 'CONSUMER' });
    await createUser(db, { name: 'مبدع', email: 'cr@m.test', phone: '+96550000015', password, role: 'CREATOR' });
    assert.equal((await fetch(`${base}/admin/metrics`)).status, 401);
    assert.equal((await fetch(`${base}/admin/metrics`, { headers: { cookie: await login('c@m.test') } })).status, 403);
    assert.equal((await fetch(`${base}/admin/metrics`, { headers: { cookie: await login('cr@m.test') } })).status, 403);
    for (const who of ['admin@m.test', 'super@m.test']) {
      const r = await fetch(`${base}/admin/metrics`, { headers: { cookie: await login(who) } });
      assert.equal(r.status, 200, who);
      assert.equal(r.headers.get('cache-control'), 'no-store');
      assert.equal(typeof (await r.json() as { metrics: { sales: { paidOrders: number } } }).metrics.sales.paidOrders, 'number');
    }
  } finally { await new Promise<void>(r => server.close(() => r())); await db.close(); }
});
