import assert from 'node:assert/strict';
import test from 'node:test';
import { openMajalDatabase } from './database';
import { applySettlementPaid, canReadRecipeDisclosure } from './domain';
import { verifyLedgerChain } from './ledger';

/**
 * Settlement payout integrity
 * ---------------------------
 * A settlement batch may be marked PAID exactly once. Reconciliation is at-least-once
 * (client retries, duplicate workers), so a second/raced "paid" call MUST be a no-op and
 * must NOT append a second SETTLEMENT_PAID entry to the append-only, hash-chained ledger —
 * a duplicate payout there is unremovable and corrupts proof-of-reserves.
 */
async function settlementFixture(db: Awaited<ReturnType<typeof openMajalDatabase>>) {
  const now = new Date().toISOString();
  await db.prepare("INSERT INTO users(id,name,email,phone,role,status,password_hash,password_salt,created_at,updated_at) VALUES('u_s','Chef','settle@example.test','','CREATOR','ACTIVE','h','s',?,?)").run(now, now);
  await db.prepare("INSERT INTO creator_profiles(id,user_id,display_name,specialty,created_at,updated_at) VALUES('cr_s','u_s','C','b',?,?)").run(now, now);
  await db.prepare("INSERT INTO settlement_batches(id,creator_id,total_fils,status,created_at,updated_at) VALUES('stl_s','cr_s',9000,'APPROVED',?,?)").run(now, now);
  // A valid APPROVED batch has its accruals LOCKED to it, summing to total_fils. We insert a
  // matching accrual directly (FKs off for this fixture only — the full order→launch chain is
  // out of scope for a settlement-idempotency unit test) so applySettlementPaid's amount check
  // sees a consistent batch.
  await db.exec('PRAGMA foreign_keys = OFF;');
  await db.prepare("INSERT INTO accruals(id,order_id,creator_id,amount_fils,status,settlement_batch_id,created_at,updated_at) VALUES('acc_s','ord_s','cr_s',9000,'LOCKED','stl_s',?,?)").run(now, now);
  await db.exec('PRAGMA foreign_keys = ON;');
}

test('settlement paid is idempotent: a retried call never double-appends to the ledger', async () => {
  const db = await openMajalDatabase({ filename: ':memory:' });
  try {
    await settlementFixture(db);
    const first = await applySettlementPaid(db, 'stl_s', 'prov_ref_1');
    const second = await applySettlementPaid(db, 'stl_s', 'prov_ref_1');
    assert.deepEqual(first, { applied: true, status: 'PAID' });
    assert.equal(second.applied, false, 'the retry must be a no-op');

    const payouts = await db.prepare("SELECT COUNT(*) AS c FROM financial_ledger WHERE entity_id='stl_s' AND entry_type='SETTLEMENT_PAID'").get<{ c: number | string }>();
    assert.equal(Number(payouts?.c), 1, 'exactly one payout entry on the ledger');
    assert.equal((await verifyLedgerChain(db)).valid, true);
    assert.equal((await db.prepare("SELECT status FROM settlement_batches WHERE id='stl_s'").get<{ status: string }>())?.status, 'PAID');
  } finally {
    await db.close();
  }
});

test('settlement paid under concurrency captures the payout exactly once', async () => {
  const db = await openMajalDatabase({ filename: ':memory:' });
  try {
    await settlementFixture(db);
    const results = await Promise.all(Array.from({ length: 20 }, () => applySettlementPaid(db, 'stl_s', 'prov_ref_race')));
    assert.equal(results.filter(r => r.applied).length, 1, 'exactly one concurrent call applies the payout');
    const payouts = await db.prepare("SELECT COUNT(*) AS c FROM financial_ledger WHERE entity_id='stl_s' AND entry_type='SETTLEMENT_PAID'").get<{ c: number | string }>();
    assert.equal(Number(payouts?.c), 1);
    assert.equal((await verifyLedgerChain(db)).valid, true);
  } finally {
    await db.close();
  }
});

test('settlement paid on a missing batch fails closed', async () => {
  const db = await openMajalDatabase({ filename: ':memory:' });
  try {
    await assert.rejects(() => applySettlementPaid(db, 'stl_missing', 'ref'), /NOT_FOUND/);
  } finally {
    await db.close();
  }
});

/**
 * Recipe disclosure authorization (L3)
 * ------------------------------------
 * Decrypted recipe fragments are crown jewels. Only the collaborating org's HOST_CHEF (and
 * admins) may read them — mirroring canViewFullRecipe / VIEW_RECIPE_L3. Generic host staff
 * (owner/operations/finance) must be denied; the intended HOST_CHEF must be allowed.
 */
test('recipe disclosure is limited to the org HOST_CHEF, mirroring VIEW_RECIPE_L3', () => {
  const org = 'org_1';
  assert.equal(canReadRecipeDisclosure({ role: 'HOST_CHEF', hostBusinessId: org }, org), true);
  // The roles the old generic isHost() wrongly admitted:
  assert.equal(canReadRecipeDisclosure({ role: 'HOST_FINANCE', hostBusinessId: org }, org), false);
  assert.equal(canReadRecipeDisclosure({ role: 'HOST_OPERATIONS', hostBusinessId: org }, org), false);
  assert.equal(canReadRecipeDisclosure({ role: 'HOST_OWNER', hostBusinessId: org }, org), false);
  // Platform admins are denied full-secret visibility too (mirrors canViewFullRecipe(admin)===false):
  assert.equal(canReadRecipeDisclosure({ role: 'ADMIN', hostBusinessId: null }, org), false);
  assert.equal(canReadRecipeDisclosure({ role: 'SUPER_ADMIN', hostBusinessId: null }, org), false);
  // A HOST_CHEF of a different tenant must never read another org's disclosure:
  assert.equal(canReadRecipeDisclosure({ role: 'HOST_CHEF', hostBusinessId: 'org_2' }, org), false);
  assert.equal(canReadRecipeDisclosure({ role: 'HOST_CHEF', hostBusinessId: null }, org), false);
});
