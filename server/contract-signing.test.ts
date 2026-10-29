import assert from 'node:assert/strict';
import test from 'node:test';
import { randomBytes } from 'node:crypto';
import express from 'express';
import { AddressInfo } from 'node:net';
import { createAuthRouter, createPublicRegistration, createUser } from './auth';
import { createDomainRouter } from './domain';
import { openTestDatabase } from './test-db';

const config = {
  production: false, sessionSecret: 'test-session-secret-that-is-long-enough-123456',
  encryptionKey: 'test-encryption-key-that-is-long-enough-12345', sessionHours: 8, cookieName: 'majal_session', csrfCookieName: 'majal_csrf'
};
// Generated per run so no credential-shaped literal lives in the repository.
const password = `${randomBytes(12).toString('base64url')}-Aa1!`;
interface Session { cookie: string; csrf: string }

test('SECURITY: contracts are signed only by the real parties and only while awaiting signatures', async () => {
  const db = await openTestDatabase();
  const app = express();
  app.use(express.json());
  app.use('/api/v1/auth', createAuthRouter(db, config));
  app.use('/api/v1/domain', createDomainRouter(db, config));
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(r => server.once('listening', r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1`;
  const login = async (email: string): Promise<Session> => {
    const r = await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password }) });
    assert.equal(r.status, 200, email);
    return { cookie: r.headers.getSetCookie().map(c => c.split(';')[0]).join('; '), csrf: ((await r.json()) as { csrfToken: string }).csrfToken };
  };
  let keyNo = 0;
  const call = (s: Session, path: string, body: unknown = {}) => fetch(`${base}/domain${path}`, {
    method: 'POST', headers: { cookie: s.cookie, 'x-csrf-token': s.csrf, 'content-type': 'application/json', 'idempotency-key': `idem-key-${++keyNo}-${randomBytes(4).toString('hex')}` }, body: JSON.stringify(body)
  });
  let paciNo = 0;
  const now = new Date().toISOString();
  const paci = async (email: string) => {
    const u = await db.prepare('SELECT id FROM users WHERE email=?').get<{ id: string }>(email);
    const id = `paci_sig_${++paciNo}`;
    await db.prepare("INSERT INTO paci_auth_requests(id,user_id,civil_id_hash,purpose,status,provider_reference,request_nonce_hash,expires_at,created_at,updated_at) VALUES(?,?,?,?,'VERIFIED',?,?,?,?,?)")
      .run(id, u!.id, 'h', 'CONTRACT_SIGN', `ref_${paciNo}`, 'n', new Date(Date.now() + 3_600_000).toISOString(), now, now);
    return id;
  };
  const sign = async (s: Session, email: string, contractId: string) => call(s, `/contracts/${contractId}/sign`, { paciRequestId: await paci(email) });
  const code = async (r: Response) => ((await r.json()) as { code?: string }).code;
  const contractStatus = async (id: string) => (await db.prepare('SELECT status FROM contract_versions WHERE id=?').get<{ status: string }>(id))!.status;
  const signatures = async (id: string) => Number((await db.prepare('SELECT COUNT(*) AS c FROM contract_signatures WHERE contract_id=?').get<{ c: number | string }>(id))!.c);

  try {
    await createPublicRegistration(db, { name: 'مالك', email: 'host@sign.test', phone: '+96550000101', password, role: 'HOST_OWNER' }, { commercialName: 'مطبخ', businessType: 'CENTRAL_KITCHEN' });
    const creator = await createPublicRegistration(db, { name: 'مبدع', email: 'creator@sign.test', phone: '+96550000103', password, role: 'CREATOR' });
    await createUser(db, { name: 'أدمن', email: 'admin@sign.test', phone: '+96550000104', password, role: 'ADMIN' });
    await createUser(db, { name: 'سوبر', email: 'super@sign.test', phone: '+96550000105', password, role: 'SUPER_ADMIN' });
    await db.prepare(`INSERT INTO products(id,creator_id,public_name,category,short_description,status,estimated_unit_cost_fils,target_price_fils,is_secret_recipe,created_at,updated_at) VALUES('prd_sig',?,?,?,?,'READY_FOR_PITCH',1000,2500,1,?,?)`)
      .run(creator.creator_id, 'منتج', 'FOOD', 'وصف المنتج للاختبار', now, now);
    const [h, c, admin, superAdmin] = await Promise.all(['host', 'creator', 'admin', 'super'].map(n => login(`${n}@sign.test`)));

    const grantRes = await call(h, '/recipe-access', { productId: 'prd_sig', disclosureLevel: 2, purpose: 'تقييم الجدوى' });
    assert.equal(grantRes.status, 201, await grantRes.clone().text());
    const grant = await grantRes.json() as { id: string; collaborationId: string };
    assert.equal((await call(c, `/recipe-access/${grant.id}/approve`, { days: 14 })).status, 200);
    const makeContract = async () => {
      const offer = await call(h, `/collaborations/${grant.collaborationId}/offers`, { sellingPriceFils: 2500, creatorRoyaltyBasisPoints: 1500, platformFeeBasisPoints: 500 });
      assert.equal(offer.status, 201, await offer.clone().text());
      const offerId = (await offer.json() as { id: string }).id;
      const accepted = await call(c, `/collaborations/${grant.collaborationId}/offers/${offerId}/accept`);
      assert.equal(accepted.status, 200, await accepted.clone().text());
      return (await accepted.json() as { contractId: string }).contractId;
    };

    // A second accepted offer voids the first contract.
    const voided = await makeContract();
    const current = await makeContract();
    assert.equal(await contractStatus(voided), 'VOID');
    assert.equal(await contractStatus(current), 'PENDING_SIGNATURES');

    // VOID contracts cannot be signed by either party, so they can never become FULLY_SIGNED.
    for (const [s, email] of [[h, 'host@sign.test'], [c, 'creator@sign.test']] as const) {
      const r = await sign(s, email, voided);
      assert.equal(r.status, 409);
      assert.equal(await code(r), 'CONTRACT_NOT_SIGNABLE');
    }
    assert.equal(await signatures(voided), 0);
    assert.equal(await contractStatus(voided), 'VOID');

    // Platform admins cannot sign on either party's behalf.
    for (const [s, email] of [[admin, 'admin@sign.test'], [superAdmin, 'super@sign.test']] as const) {
      const r = await sign(s, email, current);
      assert.equal(r.status, 403);
      assert.equal(await code(r), 'FORBIDDEN');
    }
    assert.equal(await signatures(current), 0);

    // The real creator and host owner sign; the contract becomes FULLY_SIGNED.
    const hostSign = await sign(h, 'host@sign.test', current);
    assert.equal(hostSign.status, 200, await hostSign.clone().text());
    assert.equal((await hostSign.json() as { side: string }).side, 'HOST');
    const creatorSign = await sign(c, 'creator@sign.test', current);
    assert.equal(creatorSign.status, 200, await creatorSign.clone().text());
    const signed = await creatorSign.json() as { side: string; status: string };
    assert.equal(signed.side, 'CREATOR');
    assert.equal(signed.status, 'FULLY_SIGNED');

    // Once fully signed it is no longer signable.
    const again = await sign(c, 'creator@sign.test', current);
    assert.equal(again.status, 409);
    assert.equal(await code(again), 'CONTRACT_NOT_SIGNABLE');
  } finally {
    await new Promise<void>(r => server.close(() => r()));
    await db.close();
  }
});
