import assert from 'node:assert/strict';
import test from 'node:test';
import { openMajalDatabase } from './database';
import { computeCanaryCode, issueCanary, traceCanary } from './canary';
import { computeCounterfactual, OfferTerms } from './counterfactual';
import { computeCalibration, forecastWithTwin, TwinSample } from './operational-twin';

async function seedRecipe(db: Awaited<ReturnType<typeof openMajalDatabase>>) {
  const now = new Date().toISOString();
  await db.prepare("INSERT INTO users(id,name,email,phone,role,status,password_hash,password_salt,created_at,updated_at) VALUES('u_c','Creator One','c@example.test','','CREATOR','ACTIVE','h','s',?,?)").run(now, now);
  await db.prepare("INSERT INTO organizations(id,commercial_name,organization_type,verification_status,created_at,updated_at) VALUES('org_a','A','HOST','VERIFIED',?,?)").run(now, now);
  await db.prepare("INSERT INTO organizations(id,commercial_name,organization_type,verification_status,created_at,updated_at) VALUES('org_b','B','HOST','VERIFIED',?,?)").run(now, now);
  await db.prepare("INSERT INTO creator_profiles(id,user_id,display_name,specialty,created_at,updated_at) VALUES('cr_1','u_c','C','b',?,?)").run(now, now);
  await db.prepare("INSERT INTO products(id,creator_id,public_name,category,short_description,status,estimated_unit_cost_fils,target_price_fils,created_at,updated_at) VALUES('prd_1','cr_1','P','B','d','DRAFT',1,2,?,?)").run(now, now);
  await db.prepare("INSERT INTO recipe_versions(id,product_id,version_number,encrypted_payload,payload_sha256,created_by_user_id,created_at) VALUES('rv_1','prd_1',1,'{}','sha','u_c',?)").run(now);
}

// --- Recipe Canary Fingerprint -------------------------------------------------------
test('canary codes are per-recipient, deterministic, and trace to their source', async () => {
  process.env.CANARY_SIGNING_SECRET = 'canary-signing-secret-at-least-32-bytes!';
  const db = await openMajalDatabase({ filename: ':memory:' });
  try {
    await seedRecipe(db);
    const a = await issueCanary(db, 'rv_1', 'org_a', 'tasting', 'u_c');
    const b = await issueCanary(db, 'rv_1', 'org_b', 'tasting', 'u_c');
    assert.notEqual(a.canaryCode, b.canaryCode);                 // different recipients → different marks
    assert.equal(computeCanaryCode('rv_1', 'org_a', a.nonce, 'canary-signing-secret-at-least-32-bytes!'), a.canaryCode);

    const trace = await traceCanary(db, b.canaryCode);
    assert.equal(trace.matched, true);
    assert.equal(trace.organizationId, 'org_b');                 // leaked copy → identifies org_b
    assert.equal(trace.integrityValid, true);
    assert.equal((await traceCanary(db, 'deadbeef'.repeat(4))).matched, false);
  } finally {
    delete process.env.CANARY_SIGNING_SECRET;
    await db.close();
  }
});

// --- Counterfactual Deal Engine ------------------------------------------------------
test('counterfactual compares two offers with an uncertainty band', () => {
  const offerA: OfferTerms = { sellingPriceFils: 1000, creatorRoyaltyBasisPoints: 2000, platformFeeBasisPoints: 500 };
  const offerB: OfferTerms = { sellingPriceFils: 1200, creatorRoyaltyBasisPoints: 2000, platformFeeBasisPoints: 500 };
  const cf = computeCounterfactual(offerA, offerB, { unitsPerMonth: 1000, unitCostFils: 400, marketingFilsPerMonth: 100000, demandVarianceBp: 3000 });
  const twelve = cf.deltaHostResidualFils.find(d => d.months === 12)!;
  assert.ok(twelve.base > 0);                                    // higher price → more host residual
  assert.ok(twelve.high >= twelve.base && twelve.base >= twelve.low); // ordered uncertainty band
  assert.equal(typeof cf.recommendationNote, 'string');
  assert.equal(cf.offerA.base.length, 3);                        // 3/6/12 horizons
});

// --- Operational Twin ----------------------------------------------------------------
test('operational twin learns bias and recalibrates forecasts toward reality', () => {
  // Consistently under-predicted demand (actual ~1.5x) and under-estimated prep (~1.2x).
  const samples: TwinSample[] = Array.from({ length: 10 }, () => ({ predictedUnits: 100, actualUnits: 150, predictedPrepMinutes: 50, actualPrepMinutes: 60 }));
  const cal = computeCalibration(samples);
  assert.ok(Math.abs(cal.unitsBias - 1.5) < 1e-6);
  assert.ok(Math.abs(cal.prepBias - 1.2) < 1e-6);
  assert.ok(cal.unitsConfidence > 0.9);                          // 10 tight samples → high confidence

  const forecast = forecastWithTwin(200, 40, cal);
  assert.ok(forecast.calibratedUnits > 200 && forecast.calibratedUnits <= 300); // nudged up toward reality
  assert.ok(forecast.calibratedPrepMinutes > 40);

  // No history → identity calibration, forecast unchanged.
  const cold = computeCalibration([]);
  assert.equal(cold.unitsBias, 1);
  assert.equal(forecastWithTwin(200, 40, cold).calibratedUnits, 200);
});
