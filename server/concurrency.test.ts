import assert from 'node:assert/strict';
import test from 'node:test';
import { createUser } from './auth';
import { openMajalDatabase } from './database';
import { applyVerifiedPaymentEvent } from './payments';
import { verifyLedgerChain } from './ledger';
import { createExposureGrant, recordExposureAccess } from './secret-halflife';

/**
 * Idempotency & concurrency fuzzer
 * --------------------------------
 * Hammers the most sensitive money/secret paths with parallel duplicate and conflicting
 * requests, asserting the invariants that must survive multi-replica load:
 *   - a payment is captured exactly once, no matter how many duplicate webhooks land;
 *   - the amount can never be mutated by a replay;
 *   - the tamper-evident ledger records the capture exactly once and stays valid;
 *   - a decaying secret budget is never double-spent by concurrent readers.
 *
 * Runs on SQLite (serialized single connection). In production PostgreSQL provides the
 * same guarantee via per-connection transactions + advisory/row locks; this suite is the
 * always-on regression that proves the LOGIC is race-safe. Real multi-replica load
 * (k6 against Postgres) remains an external step, documented as such.
 */

async function paymentFixture(db: Awaited<ReturnType<typeof openMajalDatabase>>) {
  const user = await createUser(db, { name: 'Buyer', email: `buyer_${Math.floor(performance.now())}@example.test`, password: 'Majal-Buyer-2026!', role: 'CONSUMER' });
  const now = new Date().toISOString();
  await db.prepare(`INSERT INTO payment_intents(id, order_public_id, user_id, provider, amount_fils, currency, status, idempotency_key, provider_reference, created_at, updated_at)
    VALUES('pay_fuzz','ord_fuzz',?, 'TEST', 15500, 'KWD', 'REDIRECT_REQUIRED', 'idem_fuzz_key_123456','prov_ref_fuzz',?,?)`).run(user.id, now, now);
}

test('fuzz: 40 duplicate PAID webhooks capture the payment exactly once', async () => {
  const db = await openMajalDatabase({ filename: ':memory:' });
  try {
    await paymentFixture(db);
    const event = { provider: 'TEST', eventId: 'evt_paid_1', providerReference: 'prov_ref_fuzz', status: 'PAID' as const, amountFils: 15500, currency: 'KWD' as const };
    const raw = Buffer.from('{"event":"paid"}');
    const results = await Promise.all(Array.from({ length: 40 }, () => applyVerifiedPaymentEvent(db, event, raw)));

    const firstProcessed = results.filter(r => r.duplicate === false);
    assert.equal(firstProcessed.length, 1, 'exactly one non-duplicate processing');
    assert.ok(results.every(r => r.processed === true));

    const intent = await db.prepare('SELECT status, amount_fils FROM payment_intents WHERE id = ?').get<{ status: string; amount_fils: number | string }>('pay_fuzz');
    assert.equal(intent?.status, 'PAID');
    assert.equal(Number(intent?.amount_fils), 15500);

    // Ledger recorded the capture exactly once and the chain is intact.
    const captures = await db.prepare("SELECT COUNT(*) AS c FROM financial_ledger WHERE entity_id = 'pay_fuzz' AND entry_type = 'PAYMENT_CAPTURED'").get<{ c: number | string }>();
    assert.equal(Number(captures?.c), 1);
    assert.equal((await verifyLedgerChain(db)).valid, true);
  } finally {
    await db.close();
  }
});

test('fuzz: a replay with a different amount is always rejected', async () => {
  const db = await openMajalDatabase({ filename: ':memory:' });
  try {
    await paymentFixture(db);
    const good = { provider: 'TEST', eventId: 'evt_ok', providerReference: 'prov_ref_fuzz', status: 'PAID' as const, amountFils: 15500, currency: 'KWD' as const };
    await applyVerifiedPaymentEvent(db, good, Buffer.from('{"event":"paid"}'));
    await assert.rejects(
      () => applyVerifiedPaymentEvent(db, { ...good, eventId: 'evt_tamper', amountFils: 99999 }, Buffer.from('{"event":"tamper"}')),
      /PAYMENT_AMOUNT_MISMATCH/
    );
    assert.equal(Number((await db.prepare('SELECT amount_fils FROM payment_intents WHERE id = ?').get<{ amount_fils: number | string }>('pay_fuzz'))?.amount_fils), 15500);
  } finally {
    await db.close();
  }
});

test('fuzz: concurrent readers cannot double-spend the last exposure budget unit', async () => {
  const db = await openMajalDatabase({ filename: ':memory:' });
  try {
    const now = new Date().toISOString();
    await db.prepare("INSERT INTO users(id,name,email,phone,role,status,password_hash,password_salt,created_at,updated_at) VALUES('u_c','Chef','c@example.test','','CREATOR','ACTIVE','h','s',?,?)").run(now, now);
    await db.prepare("INSERT INTO organizations(id,commercial_name,organization_type,verification_status,created_at,updated_at) VALUES('org_1','H','HOST','VERIFIED',?,?)").run(now, now);
    await db.prepare("INSERT INTO creator_profiles(id,user_id,display_name,specialty,created_at,updated_at) VALUES('cr_1','u_c','C','b',?,?)").run(now, now);
    await db.prepare("INSERT INTO products(id,creator_id,public_name,category,short_description,status,estimated_unit_cost_fils,target_price_fils,created_at,updated_at) VALUES('prd_1','cr_1','P','B','d','DRAFT',1,2,?,?)").run(now, now);
    await db.prepare("INSERT INTO recipe_versions(id,product_id,version_number,encrypted_payload,payload_sha256,created_by_user_id,created_at) VALUES('rv_1','prd_1',1,'{}','x','u_c',?)").run(now);

    // Budget allows exactly one access before dropping under the floor.
    const grant = await createExposureGrant(db, {
      productId: 'prd_1', recipeVersionId: 'rv_1', organizationId: 'org_1', purpose: 'single-use',
      initialExposureBp: 2000, floorBp: 900, halfLifeSeconds: 86400, accessDecayBp: 1200, hardExpiresInSeconds: 86400, grantedByUserId: 'u_c'
    });
    const results = await Promise.all(Array.from({ length: 25 }, () => recordExposureAccess(db, grant.id, 'u_c')));
    const allowed = results.filter(r => r.allowed);
    assert.equal(allowed.length, 1, 'exactly one concurrent access may spend the last budget unit');
    assert.ok(results.filter(r => !r.allowed).every(r => r.decision === 'DENIED_FLOOR'));
  } finally {
    await db.close();
  }
});
