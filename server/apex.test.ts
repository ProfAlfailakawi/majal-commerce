import assert from 'node:assert/strict';
import test from 'node:test';
import { openMajalDatabase } from './database';
import { buildMerkleTree, merkleProof, verifyMerkleProof } from './merkle';
import { recordLedgerEntry } from './ledger';
import { buildReserveAttestation, reserveProofForCreator, verifyReserveInclusion } from './proof-of-reserves';
import { createTimeAnchor, verifyTimeAnchors } from './time-anchor';
import { computeSealedOutput, createSealedProfile, runSealedCompute } from './sealed-compute';

async function seedCreatorsWithAccruals(db: Awaited<ReturnType<typeof openMajalDatabase>>) {
  const now = new Date().toISOString();
  for (const [cr, user] of [['cr_1', 'u1'], ['cr_2', 'u2'], ['cr_3', 'u3']] as const) {
    await db.prepare("INSERT INTO users(id,name,email,phone,role,status,password_hash,password_salt,created_at,updated_at) VALUES(?,?,?,'','CREATOR','ACTIVE','h','s',?,?)").run(user, `Creator ${user}`, `${user}@example.test`, now, now);
    await db.prepare("INSERT INTO creator_profiles(id,user_id,display_name,specialty,created_at,updated_at) VALUES(?,?,?,?,?,?)").run(cr, user, cr, 'b', now, now);
  }
  // Minimal order graph so accruals satisfy their foreign keys.
  await db.prepare("INSERT INTO organizations(id,commercial_name,organization_type,verification_status,created_at,updated_at) VALUES('org_1','H','HOST','VERIFIED',?,?)").run(now, now);
  await db.prepare("INSERT INTO products(id,creator_id,public_name,category,short_description,status,estimated_unit_cost_fils,target_price_fils,created_at,updated_at) VALUES('prd_1','cr_1','P','B','d','DRAFT',1,2,?,?)").run(now, now);
  await db.prepare("INSERT INTO collaborations(id,product_id,creator_id,organization_id,stage,created_at,updated_at) VALUES('co_1','prd_1','cr_1','org_1','LIVE',?,?)").run(now, now);
  await db.prepare("INSERT INTO launches(id,collaboration_id,product_id,organization_id,status,created_at,updated_at) VALUES('l_1','co_1','prd_1','org_1','LIVE',?,?)").run(now, now);
  const amounts: Record<string, number> = { cr_1: 5000, cr_2: 3000, cr_3: 2000 };
  let i = 0;
  for (const [cr, amount] of Object.entries(amounts)) {
    await db.prepare("INSERT INTO orders(id,launch_id,consumer_user_id,units,unit_price_fils,total_fils,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)").run(`o_${i}`, 'l_1', 'u1', 1, amount, amount, 'PAID', now, now);
    await db.prepare("INSERT INTO accruals(id,order_id,creator_id,amount_fils,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?)").run(`a_${i}`, `o_${i}`, cr, amount, 'ELIGIBLE', now, now);
    i += 1;
  }
}

// --- Merkle -------------------------------------------------------------------------
test('merkle proofs verify for every leaf and reject a wrong leaf', () => {
  const leaves = ['a', 'b', 'c', 'd', 'e'].map(s => Buffer.from(s));
  const tree = buildMerkleTree(leaves);
  for (let i = 0; i < leaves.length; i += 1) {
    assert.equal(verifyMerkleProof(leaves[i], merkleProof(tree, i), tree.root), true);
  }
  assert.equal(verifyMerkleProof(Buffer.from('x'), merkleProof(tree, 0), tree.root), false);
});

// --- Proof-of-Reserves --------------------------------------------------------------
test('reserves: each creator proves inclusion; solvency reflects the ledger', async () => {
  const db = await openMajalDatabase({ filename: ':memory:' });
  try {
    await seedCreatorsWithAccruals(db);
    // Ledger shows 12,000 captured >= 10,000 liabilities => solvent.
    await recordLedgerEntry(db, { scope: 'PAYMENT', entryType: 'PAYMENT_CAPTURED', entityType: 'PAYMENT_INTENT', entityId: 'pi_1', amountFils: 12000 });

    const attestation = await buildReserveAttestation(db, 'u1');
    assert.equal(attestation.totalLiabilitiesFils, 10000);
    assert.equal(attestation.reserveFils, 12000);
    assert.equal(attestation.solvent, true);
    assert.equal(attestation.leafCount, 3);

    const proof = await reserveProofForCreator(db, attestation.id, 'cr_2');
    assert.ok(proof && proof.verified === true);
    assert.equal(proof.amountFils, 3000);
    // Stateless re-verification with only the public root + my leaf + path.
    assert.equal(verifyReserveInclusion('cr_2', 3000, proof.salt, proof.proof, attestation.merkleRoot), true);
    // A creditor cannot forge a different amount under the same path.
    assert.equal(verifyReserveInclusion('cr_2', 9999, proof.salt, proof.proof, attestation.merkleRoot), false);
  } finally {
    await db.close();
  }
});

// --- Tamper-Evident Time ------------------------------------------------------------
test('time anchors detect a rewritten ledger prefix', async () => {
  const db = await openMajalDatabase({ filename: ':memory:' });
  try {
    await recordLedgerEntry(db, { scope: 'PAYMENT', entryType: 'PAYMENT_CAPTURED', entityType: 'PAYMENT_INTENT', entityId: 'pi_1', amountFils: 1000 });
    await recordLedgerEntry(db, { scope: 'PAYMENT', entryType: 'PAYMENT_CAPTURED', entityType: 'PAYMENT_INTENT', entityId: 'pi_2', amountFils: 2000 });
    const anchor = await createTimeAnchor(db);
    assert.equal(anchor.source, 'LOCAL_UNVERIFIED'); // no TSA configured in tests
    assert.equal((await verifyTimeAnchors(db)).valid, true);

    // Tamper with an anchored entry — verification must now fail at that seq.
    await db.prepare('UPDATE financial_ledger SET amount_fils = 999999 WHERE seq = 1').run();
    const broken = await verifyTimeAnchors(db);
    assert.equal(broken.valid, false);
    assert.equal(broken.reason, 'ANCHOR_HASH_DIVERGED');
  } finally {
    await db.close();
  }
});

// --- Sealed Compute Reveal ----------------------------------------------------------
test('sealed compute returns aggregates only and never the formula', async () => {
  process.env.SEALED_COMPUTE_KEY = 'sealed-compute-key-at-least-32-bytes!!';
  const db = await openMajalDatabase({ filename: ':memory:' });
  try {
    const now = new Date().toISOString();
    await db.prepare("INSERT INTO users(id,name,email,phone,role,status,password_hash,password_salt,created_at,updated_at) VALUES('u1','Creator One','c@example.test','','CREATOR','ACTIVE','h','s',?,?)").run(now, now);
    await db.prepare("INSERT INTO creator_profiles(id,user_id,display_name,specialty,created_at,updated_at) VALUES('cr_1','u1','C','b',?,?)").run(now, now);
    await db.prepare("INSERT INTO products(id,creator_id,public_name,category,short_description,status,estimated_unit_cost_fils,target_price_fils,created_at,updated_at) VALUES('prd_1','cr_1','P','B','d','DRAFT',1,2,?,?)").run(now, now);
    await db.prepare("INSERT INTO recipe_versions(id,product_id,version_number,encrypted_payload,payload_sha256,created_by_user_id,created_at) VALUES('rv_1','prd_1',1,'{}','x','u1',?)").run(now);
    const recipe = { yieldUnits: 10, prepMinutesPerBatch: 45, steps: ['secret step A', 'secret step B'], ingredients: [{ name: 'Secret Spice', grams: 200, costFilsPerKg: 5000, allergens: ['nuts'] }, { name: 'Flour', grams: 1000, costFilsPerKg: 300 }] };

    // Pure aggregate is correct: 25 units => 3 batches; cost = (1000+300)*3.
    const pure = computeSealedOutput(recipe, { requestedUnits: 25 });
    assert.equal(pure.batches, 3);
    assert.equal(pure.totalCostFils, (Math.round(200 / 1000 * 5000) + Math.round(1000 / 1000 * 300)) * 3);
    assert.deepEqual(pure.allergens, ['nuts']);
    assert.ok(!JSON.stringify(pure).toLowerCase().includes('secret'));

    const profile = await createSealedProfile(db, 'prd_1', 'rv_1', recipe, 'u1');
    const stored = await db.prepare('SELECT ciphertext FROM sealed_compute_profiles WHERE id = ?').get<{ ciphertext: string }>(profile.id);
    assert.ok(stored && !Buffer.from(stored.ciphertext, 'base64').toString('utf8').includes('Secret Spice')); // formula encrypted at rest

    const output = await runSealedCompute(db, profile.id, { requestedUnits: 25 });
    assert.deepEqual(output, pure); // host gets the same aggregates, never the ingredients/steps
  } finally {
    delete process.env.SEALED_COMPUTE_KEY;
    await db.close();
  }
});
