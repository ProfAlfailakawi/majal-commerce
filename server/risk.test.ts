import assert from 'node:assert/strict';
import test from 'node:test';
import { openMajalDatabase } from './database';
import { computeBlastRadius, BlastFacts } from './blast-radius';
import { addLineageEdge, buildLineageGraph } from './lineage';
import { computeCreatorTrustClaims, signClaims, verifyClaims, TrustClaims } from './trust-proof';

async function seedProductWithVersions(db: Awaited<ReturnType<typeof openMajalDatabase>>) {
  const now = new Date().toISOString();
  await db.prepare("INSERT INTO users(id,name,email,phone,role,status,password_hash,password_salt,created_at,updated_at) VALUES('u_creator','Creator One','c@example.test','','CREATOR','ACTIVE','h','s',?,?)").run(now, now);
  await db.prepare("INSERT INTO creator_profiles(id,user_id,display_name,specialty,created_at,updated_at) VALUES('cr_1','u_creator','C','b',?,?)").run(now, now);
  await db.prepare("INSERT INTO products(id,creator_id,public_name,category,short_description,status,estimated_unit_cost_fils,target_price_fils,created_at,updated_at) VALUES('prd_1','cr_1','P','B','d','DRAFT',1,2,?,?)").run(now, now);
  for (let v = 1; v <= 3; v++) {
    await db.prepare("INSERT INTO recipe_versions(id,product_id,version_number,encrypted_payload,payload_sha256,created_by_user_id,created_at) VALUES(?,?,?,'{}',?, 'u_creator',?)").run(`rv_${v}`, 'prd_1', v, `sha_${v}`, now);
  }
}

// --- Deal Blast Radius ---------------------------------------------------------------
test('blast radius escalates with live launch, money and lateness', () => {
  const quiet: BlastFacts = { stage: 'INTEREST', launchLive: false, quantityCap: 0, pendingOrders: 0, pendingRevenueFils: 0, liveInventoryUnits: 0, dependentCustomers: 0, eligibleAccrualFils: 0, lockedSettlementFils: 0, activeCapacityBookings: 0 };
  const low = computeBlastRadius(quiet, { party: 'EITHER', delayDays: 1 });
  assert.equal(low.severity, 'LOW');
  assert.ok(low.containment.length >= 1);

  const hot: BlastFacts = { stage: 'LIVE_TRIAL', launchLive: true, quantityCap: 1000, pendingOrders: 60, pendingRevenueFils: 3_000_000, liveInventoryUnits: 500, dependentCustomers: 40, eligibleAccrualFils: 1_500_000, lockedSettlementFils: 800_000, activeCapacityBookings: 3 };
  const severe = computeBlastRadius(hot, { party: 'HOST', delayDays: 14 });
  assert.ok(severe.score > low.score);
  assert.equal(severe.severity, 'SEVERE');
  assert.equal(severe.affected.revenueAtRiskFils, 3_000_000);
  assert.equal(severe.affected.creatorMoneyAtRiskFils, 2_300_000);
});

// --- Recipe Lineage Graph ------------------------------------------------------------
test('lineage builds provenance without exposing payload and rejects cycles', async () => {
  const db = await openMajalDatabase({ filename: ':memory:' });
  try {
    await seedProductWithVersions(db);
    await addLineageEdge(db, { productId: 'prd_1', parentRecipeVersionId: null, childRecipeVersionId: 'rv_1', relation: 'ORIGIN', note: '', createdByUserId: 'u_creator' });
    await addLineageEdge(db, { productId: 'prd_1', parentRecipeVersionId: 'rv_1', childRecipeVersionId: 'rv_2', relation: 'REVISION', note: 'tuned salt', createdByUserId: 'u_creator' });
    await addLineageEdge(db, { productId: 'prd_1', parentRecipeVersionId: 'rv_2', childRecipeVersionId: 'rv_3', relation: 'APPROVED_VARIANT', note: '', createdByUserId: 'u_creator' });

    const graph = await buildLineageGraph(db, 'prd_1');
    assert.equal(graph.nodes.length, 3);
    assert.equal(graph.edges.length, 3);
    // Nodes expose only commitment metadata — never the encrypted payload.
    assert.ok(graph.nodes.every(n => !('encrypted_payload' in n) && typeof n.payloadSha256 === 'string'));

    // rv_3 → rv_1 would close a loop (rv_1→rv_2→rv_3 already exists).
    await assert.rejects(() => addLineageEdge(db, { productId: 'prd_1', parentRecipeVersionId: 'rv_3', childRecipeVersionId: 'rv_1', relation: 'REVISION', note: '', createdByUserId: 'u_creator' }), /LINEAGE_CYCLE_FORBIDDEN/);
  } finally {
    await db.close();
  }
});

// --- Reputation Without Disclosure ---------------------------------------------------
test('trust claims are aggregate-only and the signature detects tampering', async () => {
  const db = await openMajalDatabase({ filename: ':memory:' });
  try {
    const now = new Date().toISOString();
    await db.prepare("INSERT INTO users(id,name,email,phone,role,status,password_hash,password_salt,created_at,updated_at) VALUES('u_c','Creator','c@example.test','','CREATOR','ACTIVE','h','s',?,?)").run(now, now);
    await db.prepare("INSERT INTO creator_profiles(id,user_id,display_name,specialty,created_at,updated_at) VALUES('cr_1','u_c','C','b',?,?)").run(now, now);
    await db.prepare("INSERT INTO organizations(id,commercial_name,organization_type,verification_status,created_at,updated_at) VALUES('org_1','H','HOST','VERIFIED',?,?)").run(now, now);
    for (const [id, stage] of [['co_1', 'ENDED'], ['co_2', 'LIVE'], ['co_3', 'DISPUTED'], ['co_4', 'OFFER_SENT']] as const) {
      await db.prepare("INSERT INTO products(id,creator_id,public_name,category,short_description,status,estimated_unit_cost_fils,target_price_fils,created_at,updated_at) VALUES(?,'cr_1','P','B','d','DRAFT',1,2,?,?)").run(`prd_${id}`, now, now);
      await db.prepare("INSERT INTO collaborations(id,product_id,creator_id,organization_id,stage,created_at,updated_at) VALUES(?,?,?,?,?,?,?)").run(id, `prd_${id}`, 'cr_1', 'org_1', stage, now, now);
    }

    const claims = await computeCreatorTrustClaims(db, 'cr_1');
    assert.equal(claims.totalDeals, 4);
    assert.equal(claims.successfulDeals, 2);        // ENDED + LIVE
    assert.equal(claims.majorDisputeCount, 1);
    assert.equal(claims.commitmentRateBp, 5000);    // 2/4
    // Claims never carry deal ids — only counts.
    assert.ok(!JSON.stringify(claims).includes('co_1'));

    const secret = 'platform-trust-signing-secret-32-bytes-long';
    const sig = signClaims(claims, secret);
    assert.equal(verifyClaims(claims, sig, secret), true);
    const tampered: TrustClaims = { ...claims, successfulDeals: 99 };
    assert.equal(verifyClaims(tampered, sig, secret), false);
  } finally {
    await db.close();
  }
});
