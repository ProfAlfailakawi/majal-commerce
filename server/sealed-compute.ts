import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from 'node:crypto';
import { MajalDatabase } from './database';

/**
 * Sealed Compute Reveal
 * ---------------------
 * Instead of ever sending the recipe to the host, the host sends its INPUTS (how many units,
 * which constraints) and the server returns only aggregate OUTPUTS — batch count, total cost,
 * total prep time, allergen set, ingredient count — computed inside a trusted boundary. The
 * formula (ingredient names, exact grams, ratios, steps) never leaves storage. "Least
 * disclosure" becomes ZERO disclosure.
 */

export interface SealedRecipe {
  yieldUnits: number;                 // units produced per batch
  prepMinutesPerBatch: number;
  steps: string[];                    // secret — never returned
  ingredients: { name: string; grams: number; costFilsPerKg: number; allergens?: string[] }[]; // secret
}

export interface ComputeRequest {
  requestedUnits: number;
}

export interface SealedOutput {
  requestedUnits: number;
  batches: number;
  producibleUnits: number;
  totalCostFils: number;
  totalPrepMinutes: number;
  ingredientCount: number;
  allergens: string[];
  // Deliberately omits: ingredient names, grams, ratios, and steps.
}

/** Pure aggregate computation over the sealed recipe. Returns nothing that reveals the formula. */
export function computeSealedOutput(recipe: SealedRecipe, request: ComputeRequest): SealedOutput {
  if (!recipe.yieldUnits || recipe.yieldUnits <= 0) throw Object.assign(new Error('SEALED_RECIPE_INVALID'), { status: 400 });
  if (!Number.isInteger(request.requestedUnits) || request.requestedUnits <= 0) throw Object.assign(new Error('SEALED_REQUEST_INVALID'), { status: 400 });
  const batches = Math.ceil(request.requestedUnits / recipe.yieldUnits);
  const perBatchCostFils = recipe.ingredients.reduce((sum, ing) => sum + Math.round(ing.grams / 1000 * ing.costFilsPerKg), 0);
  const allergens = [...new Set(recipe.ingredients.flatMap(ing => ing.allergens ?? []))].sort();
  return {
    requestedUnits: request.requestedUnits,
    batches,
    producibleUnits: batches * recipe.yieldUnits,
    totalCostFils: perBatchCostFils * batches,
    totalPrepMinutes: recipe.prepMinutesPerBatch * batches,
    ingredientCount: recipe.ingredients.length,
    allergens
  };
}

function sealKey(): Buffer {
  const secret = process.env.SEALED_COMPUTE_KEY?.trim();
  if (!secret || secret.length < 32) throw Object.assign(new Error('SEALED_COMPUTE_NOT_CONFIGURED'), { status: 503 });
  return createHash('sha256').update(secret).digest();
}

export async function createSealedProfile(db: MajalDatabase, productId: string, recipeVersionId: string, recipe: SealedRecipe, createdByUserId: string) {
  computeSealedOutput(recipe, { requestedUnits: recipe.yieldUnits }); // validate shape before sealing
  const key = sealKey();
  const id = `seal_${randomUUID()}`;
  const iv = randomBytes(12);
  const aad = Buffer.from(`${id}|${recipeVersionId}`);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(aad);
  const ciphertext = Buffer.concat([cipher.update(Buffer.from(JSON.stringify(recipe), 'utf8')), cipher.final()]);
  const tag = cipher.getAuthTag();
  const now = new Date().toISOString();
  await db.prepare(`INSERT INTO sealed_compute_profiles(id, product_id, recipe_version_id, ciphertext, iv, tag, aad, status, created_by_user_id, created_at, updated_at)
    VALUES(?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?, ?)`)
    .run(id, productId, recipeVersionId, ciphertext.toString('base64'), iv.toString('base64url'), tag.toString('base64url'), aad.toString('base64url'), createdByUserId, now, now);
  return { id, status: 'ACTIVE' as const, productId, recipeVersionId, createdAt: now };
}

/** Decrypts the sealed recipe INTERNALLY, computes aggregates, and returns only the outputs. */
export async function runSealedCompute(db: MajalDatabase, profileId: string, request: ComputeRequest): Promise<SealedOutput> {
  const row = await db.prepare("SELECT * FROM sealed_compute_profiles WHERE id = ? AND status = 'ACTIVE'").get<Record<string, unknown>>(profileId);
  if (!row) throw Object.assign(new Error('SEALED_PROFILE_NOT_FOUND'), { status: 404 });
  const key = sealKey();
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(String(row.iv), 'base64url'));
  decipher.setAAD(Buffer.from(String(row.aad), 'base64url'));
  decipher.setAuthTag(Buffer.from(String(row.tag), 'base64url'));
  const plaintext = Buffer.concat([decipher.update(Buffer.from(String(row.ciphertext), 'base64')), decipher.final()]);
  const recipe = JSON.parse(plaintext.toString('utf8')) as SealedRecipe;
  const output = computeSealedOutput(recipe, request);
  plaintext.fill(0); // wipe the secret from memory after computing
  return output;
}

export async function revokeSealedProfile(db: MajalDatabase, profileId: string) {
  const now = new Date().toISOString();
  const result = await db.prepare("UPDATE sealed_compute_profiles SET status = 'REVOKED', updated_at = ? WHERE id = ? AND status <> 'REVOKED'").run(now, profileId);
  return { id: profileId, status: 'REVOKED' as const, changed: result.changes > 0 };
}
