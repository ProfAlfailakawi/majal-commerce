import assert from 'node:assert/strict';
import test from 'node:test';
import { createUser } from './auth';
import { openMajalDatabase } from './database';
import { buildDomainSnapshot } from './domain';

/**
 * Server read-model completeness
 * ------------------------------
 * Proves buildDomainSnapshot() returns the full nested model each portal needs — a product
 * with its migration-16 profile fields, and a collaboration hydrated with offers, the latest
 * contract + signatures, the launch + derived gate, recipe-version metadata and access grants —
 * scoped to the caller, with money left in fils. No seed, all from the server.
 */
async function seed(db: Awaited<ReturnType<typeof openMajalDatabase>>) {
  const now = new Date().toISOString();
  const creatorUser = await createUser(db, { name: 'Creator', email: 'snap-creator@example.test', password: 'Majal-Creator-2026!', role: 'CREATOR' });
  const hostUser = await createUser(db, { name: 'Host', email: 'snap-host@example.test', password: 'Majal-Host-2026!', role: 'HOST_OWNER' });
  await db.prepare("INSERT INTO creator_profiles(id,user_id,display_name,specialty,completion_score,matching_enabled,created_at,updated_at) VALUES('cr_s',?,'مبدع الاختبار','حلويات',80,1,?,?)").run(creatorUser.id, now, now);
  await db.prepare("INSERT INTO organizations(id,commercial_name,organization_type,verification_status,created_at,updated_at) VALUES('org_s','مطبخ الاختبار','HOST','VERIFIED',?,?)").run(now, now);
  // Product carrying the full migration-16 profile.
  await db.prepare(`INSERT INTO products(id,creator_id,public_name,category,short_description,status,estimated_unit_cost_fils,target_price_fils,is_secret_recipe,created_at,updated_at,internal_name,story,media_json,general_ingredients_json,allergens_json,dietary_tags_json,serving_size,shelf_life,prep_time_minutes,expected_equipment_json,accepts_exclusivity,desired_partnership_type)
    VALUES('prod_s','cr_s','كنافة','DESSERT','وصف','TESTING',500,10000,1,?,?, 'كنافة داخلية','قصة', '["m1"]','["جبن","قطر"]','["حليب"]','["حلال"]','٦ قطع','٣ أيام',45,'["فرن"]',1,'PERCENTAGE_ROYALTY')`).run(now, now);
  await db.prepare("INSERT INTO recipe_versions(id,product_id,version_number,encrypted_payload,payload_sha256,created_by_user_id,created_at) VALUES('rcp_s','prod_s',1,'{}','sha',?,?)").run(creatorUser.id, now);
  await db.prepare("INSERT INTO collaborations(id,product_id,creator_id,organization_id,stage,created_at,updated_at) VALUES('col_s','prod_s','cr_s','org_s','SIGNED',?,?)").run(now, now);
  await db.prepare("INSERT INTO offer_versions(id,collaboration_id,version_number,sender_user_id,selling_price_fils,creator_royalty_basis_points,platform_fee_basis_points,status,terms_json,created_at) VALUES('off_s','col_s',1,?,10000,1500,500,'ACCEPTED',?,?)").run(hostUser.id, JSON.stringify({ notes: 'ملاحظة العرض' }), now);
  await db.prepare("INSERT INTO contract_versions(id,collaboration_id,version_number,document_sha256,object_storage_key,status,created_at) VALUES('ctr_s','col_s',1,'docsha','key','FULLY_SIGNED',?)").run(now);
  // Two signatures require two distinct PACI request rows (FK).
  await db.prepare("INSERT INTO paci_auth_requests(id,user_id,civil_id_hash,purpose,status,request_nonce_hash,expires_at,created_at,updated_at) VALUES('paci_c',?,'h','CONTRACT','VERIFIED','n1',?,?,?)").run(creatorUser.id, now, now, now);
  await db.prepare("INSERT INTO paci_auth_requests(id,user_id,civil_id_hash,purpose,status,request_nonce_hash,expires_at,created_at,updated_at) VALUES('paci_h',?,'h','CONTRACT','VERIFIED','n2',?,?,?)").run(hostUser.id, now, now, now);
  await db.prepare("INSERT INTO contract_signatures(id,contract_id,signer_user_id,signer_side,paci_request_id,document_sha256,signature_evidence_sha256,signed_at) VALUES('sig_c','ctr_s',?,'CREATOR','paci_c','docsha','ev',?)").run(creatorUser.id, now);
  await db.prepare("INSERT INTO contract_signatures(id,contract_id,signer_user_id,signer_side,paci_request_id,document_sha256,signature_evidence_sha256,signed_at) VALUES('sig_h','ctr_s',?,'HOST','paci_h','docsha','ev',?)").run(hostUser.id, now);
  await db.prepare("INSERT INTO launches(id,collaboration_id,product_id,organization_id,status,quantity_cap,starts_at,created_at,updated_at) VALUES('lch_s','col_s','prod_s','org_s','LIVE',100,?,?,?)").run(now, now, now);
  await db.prepare("INSERT INTO recipe_access_grants(id,product_id,creator_id,organization_id,disclosure_level,status,purpose,requested_by_user_id,created_at,updated_at) VALUES('grn_s','prod_s','cr_s','org_s',2,'APPROVED','اختبار مخبري',?,?,?)").run(hostUser.id, now, now);
  return { creatorUser, hostUser };
}

test('snapshot hydrates a creator collaboration with full nested detail', async () => {
  const db = await openMajalDatabase({ filename: ':memory:' });
  try {
    await seed(db);
    const snap = await buildDomainSnapshot(db, { role: 'CREATOR', creatorId: 'cr_s' });

    assert.equal(snap.products.length, 1);
    const product = snap.products[0] as Record<string, unknown>;
    assert.equal(product.internalName, 'كنافة داخلية');
    assert.deepEqual(product.generalIngredients, ['جبن', 'قطر']);
    assert.deepEqual(product.allergens, ['حليب']);
    assert.equal(product.estimatedPrepTimeMinutes, 45);
    assert.equal(product.acceptsExclusivity, true);
    assert.equal(product.targetPriceFils, 10000); // money stays in fils

    assert.equal(snap.collaborations.length, 1);
    const collab = snap.collaborations[0] as any;
    assert.equal(collab.offers.length, 1);
    assert.equal(collab.offers[0].sellingPriceFils, 10000);
    assert.equal(collab.offers[0].creatorRoyaltyBasisPoints, 1500);
    assert.equal(collab.offers[0].notes, 'ملاحظة العرض');
    assert.equal(collab.contract.status, 'FULLY_SIGNED');
    assert.equal(collab.contract.signatures.length, 2);
    assert.equal(collab.launch.status, 'LIVE');
    assert.equal(collab.launch.gate.contractSigned, true);
    assert.equal(collab.launch.gate.hostVerified, true);
    assert.equal(collab.recipeVersions.length, 1);
    assert.equal(collab.recipeAccessGrants.length, 1);
    assert.equal(collab.recipeAccessGrants[0].disclosureLevel, 2);
  } finally {
    await db.close();
  }
});

test('snapshot scopes to the caller: a foreign creator sees nothing', async () => {
  const db = await openMajalDatabase({ filename: ':memory:' });
  try {
    await seed(db);
    const snap = await buildDomainSnapshot(db, { role: 'CREATOR', creatorId: 'cr_other' });
    assert.equal(snap.products.length, 0);
    assert.equal(snap.collaborations.length, 0);
  } finally {
    await db.close();
  }
});

test('snapshot for the collaborating host includes the same collaboration', async () => {
  const db = await openMajalDatabase({ filename: ':memory:' });
  try {
    await seed(db);
    const snap = await buildDomainSnapshot(db, { role: 'HOST_OWNER', hostBusinessId: 'org_s' });
    assert.equal(snap.collaborations.length, 1);
    assert.equal((snap.collaborations[0] as any).offers.length, 1);
  } finally {
    await db.close();
  }
});
