import assert from 'node:assert/strict';
import test from 'node:test';
import { openMajalDatabase } from './database';
import { GENESIS_HASH, computeEntryHash, recordLedgerEntry, verifyLedgerChain } from './ledger';
import { computeExposureStrengthBp, createExposureGrant, recordExposureAccess, revokeExposureGrant } from './secret-halflife';

async function seedRecipe(db: Awaited<ReturnType<typeof openMajalDatabase>>) {
  const now = new Date().toISOString();
  await db.prepare("INSERT INTO users(id,name,email,phone,role,status,password_hash,password_salt,created_at,updated_at) VALUES('u_creator','Creator','c@example.test','',?,'ACTIVE','h','s',?,?)").run('CREATOR', now, now);
  await db.prepare("INSERT INTO organizations(id,commercial_name,organization_type,verification_status,created_at,updated_at) VALUES('org_1','Host','HOST','VERIFIED',?,?)").run(now, now);
  await db.prepare("INSERT INTO creator_profiles(id,user_id,display_name,specialty,created_at,updated_at) VALUES('cr_1','u_creator','C','bakery',?,?)").run(now, now);
  await db.prepare("INSERT INTO products(id,creator_id,public_name,category,short_description,status,estimated_unit_cost_fils,target_price_fils,created_at,updated_at) VALUES('prd_1','cr_1','P','BAKERY','desc','DRAFT',100,500,?,?)").run(now, now);
  await db.prepare("INSERT INTO recipe_versions(id,product_id,version_number,encrypted_payload,payload_sha256,created_by_user_id,created_at) VALUES('rv_1','prd_1',1,'{}','abc','u_creator',?)").run(now);
}

test('ledger entry hash is deterministic and order-sensitive', () => {
  const core = { seq: 1, scope: 'PAYMENT', entryType: 'PAYMENT_CAPTURED', entityType: 'PAYMENT_INTENT', entityId: 'pay_1', amountFils: 15500, currency: 'KWD', metaSha256: 'm', occurredAt: '2026-08-20T00:00:00.000Z' };
  const a = computeEntryHash(GENESIS_HASH, core);
  const b = computeEntryHash(GENESIS_HASH, core);
  assert.equal(a, b);
  assert.notEqual(a, computeEntryHash(GENESIS_HASH, { ...core, amountFils: 15501 }));
  assert.notEqual(a, computeEntryHash('ff'.repeat(32), core));
});

test('ledger chain verifies and detects a tampered amount', async () => {
  const db = await openMajalDatabase({ filename: ':memory:' });
  try {
    await recordLedgerEntry(db, { scope: 'PAYMENT', entryType: 'PAYMENT_CAPTURED', entityType: 'PAYMENT_INTENT', entityId: 'pay_1', amountFils: 15500 });
    await recordLedgerEntry(db, { scope: 'SETTLEMENT', entryType: 'SETTLEMENT_PAID', entityType: 'SETTLEMENT_BATCH', entityId: 'stl_1', amountFils: -9000 });
    const ok = await verifyLedgerChain(db);
    assert.equal(ok.valid, true);
    assert.equal(ok.count, 2);

    // Tamper directly with a stored amount — the chain must now fail at that seq.
    await db.prepare('UPDATE financial_ledger SET amount_fils = ? WHERE seq = 1').run(999999);
    const broken = await verifyLedgerChain(db);
    assert.equal(broken.valid, false);
    assert.equal(broken.brokenAtSeq, 1);
    assert.equal(broken.reason, 'ENTRY_HASH_MISMATCH');
  } finally {
    await db.close();
  }
});

test('concurrent ledger appends stay contiguous with no duplicate seq', async () => {
  const db = await openMajalDatabase({ filename: ':memory:' });
  try {
    const N = 50;
    await Promise.all(Array.from({ length: N }, (_v, i) =>
      recordLedgerEntry(db, { scope: 'PAYMENT', entryType: 'PAYMENT_CAPTURED', entityType: 'PAYMENT_INTENT', entityId: `pay_${i}`, amountFils: 1000 + i })
    ));
    const verification = await verifyLedgerChain(db);
    assert.equal(verification.valid, true);
    assert.equal(verification.count, N);
    const distinctSeq = await db.prepare('SELECT COUNT(DISTINCT seq) AS c FROM financial_ledger').get<{ c: number | string }>();
    assert.equal(Number(distinctSeq?.c), N);
  } finally {
    await db.close();
  }
});

test('exposure strength decays by half every half-life and floors at zero', () => {
  const g = { initialExposureBp: 8000, floorBp: 1000, halfLifeSeconds: 100, accessDecayBp: 0, grantedAtMs: 0, accessCount: 0 };
  assert.equal(computeExposureStrengthBp(g, 0), 8000);
  assert.equal(computeExposureStrengthBp(g, 100_000), 4000);   // one half-life
  assert.equal(computeExposureStrengthBp(g, 200_000), 2000);   // two half-lives
  assert.ok(computeExposureStrengthBp(g, 10_000_000) >= 0);    // never negative
});

test('exposure access self-revokes below the floor and denies afterwards', async () => {
  const db = await openMajalDatabase({ filename: ':memory:' });
  try {
    await seedRecipe(db);
    const grant = await createExposureGrant(db, {
      productId: 'prd_1', recipeVersionId: 'rv_1', organizationId: 'org_1', purpose: 'production tuning',
      initialExposureBp: 3000, floorBp: 900, halfLifeSeconds: 3600, accessDecayBp: 1200, hardExpiresInSeconds: 86400, grantedByUserId: 'u_creator'
    });
    // 3000 → 1800 → 600(<900 floor → EXHAUSTED on this very access).
    const first = await recordExposureAccess(db, grant.id, 'u_creator');
    assert.equal(first.allowed, true);
    const second = await recordExposureAccess(db, grant.id, 'u_creator');
    assert.equal(second.allowed, true);
    assert.equal(second.grantStatus, 'EXHAUSTED');
    const denied = await recordExposureAccess(db, grant.id, 'u_creator');
    assert.equal(denied.allowed, false);
    assert.equal(denied.decision, 'DENIED_FLOOR');
  } finally {
    await db.close();
  }
});

test('revoked exposure grant denies all further access', async () => {
  const db = await openMajalDatabase({ filename: ':memory:' });
  try {
    await seedRecipe(db);
    const grant = await createExposureGrant(db, {
      productId: 'prd_1', recipeVersionId: 'rv_1', organizationId: 'org_1', purpose: 'tasting',
      initialExposureBp: 9000, floorBp: 100, halfLifeSeconds: 86400, accessDecayBp: 0, hardExpiresInSeconds: 86400, grantedByUserId: 'u_creator'
    });
    await revokeExposureGrant(db, grant.id);
    const denied = await recordExposureAccess(db, grant.id, 'u_creator');
    assert.equal(denied.decision, 'DENIED_REVOKED');
    assert.equal(denied.allowed, false);
  } finally {
    await db.close();
  }
});
