import assert from 'node:assert/strict';
import test from 'node:test';
import { randomBytes } from 'node:crypto';
import { openMajalDatabase } from './database';
import { combine, decodeShare, encodeShare, split } from './shamir';
import { createThresholdEscrow, revealThresholdEscrow, revokeThresholdEscrow } from './threshold-escrow';

async function seedRecipe(db: Awaited<ReturnType<typeof openMajalDatabase>>) {
  const now = new Date().toISOString();
  await db.prepare("INSERT INTO users(id,name,email,phone,role,status,password_hash,password_salt,created_at,updated_at) VALUES('u_c','Creator One','c@example.test','','CREATOR','ACTIVE','h','s',?,?)").run(now, now);
  await db.prepare("INSERT INTO creator_profiles(id,user_id,display_name,specialty,created_at,updated_at) VALUES('cr_1','u_c','C','b',?,?)").run(now, now);
  await db.prepare("INSERT INTO products(id,creator_id,public_name,category,short_description,status,estimated_unit_cost_fils,target_price_fils,created_at,updated_at) VALUES('prd_1','cr_1','P','B','d','DRAFT',1,2,?,?)").run(now, now);
  await db.prepare("INSERT INTO recipe_versions(id,product_id,version_number,encrypted_payload,payload_sha256,created_by_user_id,created_at) VALUES('rv_1','prd_1',1,'{}','sha','u_c',?)").run(now);
}

// --- Shamir Secret Sharing ------------------------------------------------------------
test('shamir: any k of n shares reconstruct; k-1 cannot', () => {
  const secret = randomBytes(32);
  const shares = split(secret, 5, 3);
  assert.equal(shares.length, 5);
  // Any 3 distinct shares reconstruct exactly.
  assert.ok(combine([shares[0], shares[2], shares[4]]).equals(secret));
  assert.ok(combine([shares[1], shares[3], shares[0]]).equals(secret));
  // Fewer than k gives the wrong answer (no information leak about the secret).
  assert.ok(!combine([shares[0], shares[1]]).equals(secret));
});

test('shamir: share encoding round-trips', () => {
  const [s] = split(Buffer.from('hello-secret'), 3, 2);
  const back = decodeShare(encodeShare(s));
  assert.equal(back.x, s.x);
  assert.ok(back.y.equals(s.y));
});

// --- Threshold Recipe Escrow ---------------------------------------------------------
test('threshold escrow reveals only with enough valid shares and never stores the key', async () => {
  const db = await openMajalDatabase({ filename: ':memory:' });
  try {
    await seedRecipe(db);
    const recipe = { steps: ['bloom yeast', 'fold thrice'], secretRatio: 0.618 };
    const sealed = await createThresholdEscrow(db, { productId: 'prd_1', recipeVersionId: 'rv_1', holders: [{ ref: 'creator' }, { ref: 'platform' }, { ref: 'neutral' }], threshold: 2, recipe, createdByUserId: 'u_c' });
    assert.equal(sealed.shares.length, 3);

    // The whole data key is never persisted — only the ciphertext and share commitments.
    const stored = await db.prepare('SELECT ciphertext, iv, tag FROM threshold_escrows WHERE id = ?').get<{ ciphertext: string; iv: string; tag: string }>(sealed.id);
    assert.ok(stored && !JSON.stringify(stored).includes('secretRatio'));

    // 1 share (platform alone) cannot reveal.
    await assert.rejects(() => revealThresholdEscrow(db, sealed.id, [sealed.shares[1].share]), /THRESHOLD_INSUFFICIENT_SHARES/);

    // 2 valid shares reveal the exact recipe.
    const revealed = await revealThresholdEscrow(db, sealed.id, [sealed.shares[0].share, sealed.shares[2].share]);
    assert.deepEqual(revealed.recipe, recipe);
    assert.equal(revealed.usedShareIndexes.length, 2);
  } finally {
    await db.close();
  }
});

test('threshold escrow rejects forged shares and revoked escrows', async () => {
  const db = await openMajalDatabase({ filename: ':memory:' });
  try {
    await seedRecipe(db);
    const sealed = await createThresholdEscrow(db, { productId: 'prd_1', recipeVersionId: 'rv_1', holders: [{ ref: 'a' }, { ref: 'b' }, { ref: 'c' }], threshold: 2, recipe: { x: 1 }, createdByUserId: 'u_c' });

    // A forged share (valid structure, wrong bytes) fails its commitment → treated as absent.
    const forged = encodeShare({ x: 1, y: Buffer.alloc(decodeShare(sealed.shares[0].share).y.length, 0xff) });
    await assert.rejects(() => revealThresholdEscrow(db, sealed.id, [forged, sealed.shares[1].share.replace(/.$/, 'A')]), /THRESHOLD_INSUFFICIENT_SHARES/);

    await revokeThresholdEscrow(db, sealed.id);
    await assert.rejects(() => revealThresholdEscrow(db, sealed.id, [sealed.shares[0].share, sealed.shares[1].share]), /THRESHOLD_ESCROW_REVOKED/);
  } finally {
    await db.close();
  }
});
