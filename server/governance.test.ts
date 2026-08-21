import assert from 'node:assert/strict';
import test from 'node:test';
import { openMajalDatabase } from './database';
import { assertKillSwitchClear, engageKillSwitch, isKillSwitchEngaged, killSwitchStatus, releaseKillSwitch } from './kill-switch';
import { createExposureGrant } from './secret-halflife';
import { computeContractDrift } from './contract-drift';
import { scanRoyaltyAnomalies, RadarSignals } from './royalty-radar';

async function seedActor(db: Awaited<ReturnType<typeof openMajalDatabase>>) {
  const now = new Date().toISOString();
  await db.prepare("INSERT INTO users(id,name,email,phone,role,status,password_hash,password_salt,created_at,updated_at) VALUES('u_admin','Admin User','a@example.test','','SUPER_ADMIN','ACTIVE','h','s',?,?)").run(now, now);
}

// --- Trust Kill Switch ---------------------------------------------------------------
test('kill switch engages, freezes reveals, and only freeze-type switches release', async () => {
  const db = await openMajalDatabase({ filename: ':memory:' });
  try {
    await seedActor(db);
    assert.equal(await isKillSwitchEngaged(db, 'RECIPE_REVEALS'), false);
    await engageKillSwitch(db, 'RECIPE_REVEALS', 'u_admin', 'suspected recipe leak', 'req-1');
    assert.equal(await isKillSwitchEngaged(db, 'RECIPE_REVEALS'), true);
    await releaseKillSwitch(db, 'RECIPE_REVEALS', 'u_admin', 'incident closed', 'req-2');
    assert.equal(await isKillSwitchEngaged(db, 'RECIPE_REVEALS'), false);

    // Action-type switches cannot be "released" (the effect already happened).
    await assert.rejects(() => releaseKillSwitch(db, 'SESSIONS', 'u_admin', 'x reason here', 'req-3'), /NOT_RELEASABLE/);
  } finally {
    await db.close();
  }
});

test('TEMP_GRANTS kill switch revokes active exposure grants without deleting data', async () => {
  const db = await openMajalDatabase({ filename: ':memory:' });
  try {
    await seedActor(db);
    const now = new Date().toISOString();
    await db.prepare("INSERT INTO organizations(id,commercial_name,organization_type,verification_status,created_at,updated_at) VALUES('org_1','H','HOST','VERIFIED',?,?)").run(now, now);
    await db.prepare("INSERT INTO creator_profiles(id,user_id,display_name,specialty,created_at,updated_at) VALUES('cr_1','u_admin','C','b',?,?)").run(now, now);
    await db.prepare("INSERT INTO products(id,creator_id,public_name,category,short_description,status,estimated_unit_cost_fils,target_price_fils,created_at,updated_at) VALUES('prd_1','cr_1','P','B','d','DRAFT',1,2,?,?)").run(now, now);
    await db.prepare("INSERT INTO recipe_versions(id,product_id,version_number,encrypted_payload,payload_sha256,created_by_user_id,created_at) VALUES('rv_1','prd_1',1,'{}','x','u_admin',?)").run(now);
    const grant = await createExposureGrant(db, { productId: 'prd_1', recipeVersionId: 'rv_1', organizationId: 'org_1', purpose: 'p', initialExposureBp: 5000, floorBp: 100, halfLifeSeconds: 86400, accessDecayBp: 0, hardExpiresInSeconds: 86400, grantedByUserId: 'u_admin' });

    const result = await engageKillSwitch(db, 'TEMP_GRANTS', 'u_admin', 'compromised host account', 'req-9');
    assert.ok(result.affectedCount >= 1);
    const row = await db.prepare('SELECT status FROM secret_exposure_grants WHERE id = ?').get<{ status: string }>(grant.id);
    assert.equal(row?.status, 'REVOKED'); // revoked, not deleted — the record still exists
    assert.ok((await killSwitchStatus(db)).some(s => s.name === 'TEMP_GRANTS' && s.state === 'ENGAGED'));
  } finally {
    await db.close();
  }
});

test('RECIPE_REVEALS guard blocks secret reveals and clears on release (regression)', async () => {
  // Regression for the review finding: the escrow-disclosure read path relies on this exact
  // guard to honour the breach-containment switch. It must throw 503 while engaged.
  const db = await openMajalDatabase({ filename: ':memory:' });
  try {
    await seedActor(db);
    await assertKillSwitchClear(db, 'RECIPE_REVEALS'); // clear → no throw
    await engageKillSwitch(db, 'RECIPE_REVEALS', 'u_admin', 'suspected leak in the wild', 'req-r');
    await assert.rejects(() => assertKillSwitchClear(db, 'RECIPE_REVEALS'), (e: unknown) => {
      const err = e as { status?: number; message?: string };
      assert.equal(err.status, 503);
      assert.match(String(err.message), /KILL_SWITCH_ENGAGED_RECIPE_REVEALS/);
      return true;
    });
    await releaseKillSwitch(db, 'RECIPE_REVEALS', 'u_admin', 'incident closed cleanly', 'req-r2');
    await assertKillSwitchClear(db, 'RECIPE_REVEALS'); // released → no throw
  } finally {
    await db.close();
  }
});

// --- Contract Drift Detector ---------------------------------------------------------
test('contract drift flags royalty and price divergence by severity', () => {
  const agreed = { sellingPriceFils: 1000, creatorRoyaltyBasisPoints: 2000, platformFeeBasisPoints: 500 };
  // Actual selling price 1000 (no drift), but creator got 1870 of 10000 revenue => 1870bp effective vs 2000 agreed.
  const clean = computeContractDrift(agreed, { orderCount: 10, paidUnits: 10, actualRevenueFils: 10000, actualAvgUnitPriceFils: 1000, actualCreatorAccruedFils: 2000 });
  assert.equal(clean.maxSeverity, 'NONE');

  // Creator got 1400 of 10000 revenue => 1400bp effective vs 2000bp agreed => 600bp shortfall => WARN.
  const drifted = computeContractDrift(agreed, { orderCount: 10, paidUnits: 10, actualRevenueFils: 10000, actualAvgUnitPriceFils: 1000, actualCreatorAccruedFils: 1400 });
  const royalty = drifted.items.find(i => i.metric === 'CREATOR_ROYALTY');
  assert.ok(royalty && royalty.deltaBp === -600);     // creator underpaid vs agreement
  assert.equal(royalty?.severity, 'WARN');
});

// --- Royalty Anomaly Radar -----------------------------------------------------------
test('royalty radar surfaces evidence-backed anomalies without accusing', () => {
  const base: RadarSignals = { paidOrderRevenueFils: 100000, refundedOrderFils: 0, ledgerCapturedFils: 100000, ledgerRefundedFils: 0, accruedCreatorFils: 20000, eligibleAccrualFils: 20000, settledFils: 0, paidOrderCount: 10, attributedOrderCount: 10 };
  assert.equal(scanRoyaltyAnomalies(base).length, 0);

  const leak = scanRoyaltyAnomalies({ ...base, ledgerCapturedFils: 90000 });
  assert.ok(leak.some(a => a.code === 'LEDGER_REVENUE_MISMATCH' && a.evidence.gapFils === 10000));

  const overpay = scanRoyaltyAnomalies({ ...base, settledFils: 30000 });
  const found = overpay.find(a => a.code === 'SETTLEMENT_OVERPAY');
  assert.ok(found && found.severity === 'CRITICAL' && found.evidence.overpayFils === 10000);

  const missing = scanRoyaltyAnomalies({ ...base, paidOrderCount: 10, accruedCreatorFils: 0 });
  assert.ok(missing.some(a => a.code === 'ACCRUAL_GAP'));
});
