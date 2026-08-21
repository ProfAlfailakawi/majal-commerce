import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { MajalDatabase } from './database';

/**
 * Recipe Canary Fingerprint
 * -------------------------
 * When a recipe version is disclosed to a specific recipient, we issue a unique canary
 * marker bound to (recipeVersion, organization, nonce) and signed with a platform secret.
 * The marker is NON-MATERIAL: it does not change ingredients, quantities, safety, or
 * allergen profile — it lives only in the per-recipient rendering/metadata. If a copy
 * later leaks, tracing the embedded canary reveals which recipient it came from.
 *
 * NOTE (legal): using a canary as legal evidence requires prior legal review; this module
 * only provides the technical trace, never a legal conclusion.
 */

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

function canarySecret(): string {
  const secret = process.env.CANARY_SIGNING_SECRET?.trim();
  if (!secret || secret.length < 32) throw Object.assign(new Error('CANARY_NOT_CONFIGURED'), { status: 503 });
  return secret;
}

/** Deterministic, unforgeable canary code. Same inputs + secret → same code. */
export function computeCanaryCode(recipeVersionId: string, organizationId: string, nonce: string, secret: string): string {
  return createHmac('sha256', secret).update(`MAJAL_CANARY_V1|${recipeVersionId}|${organizationId}|${nonce}`).digest('hex').slice(0, 32);
}

export interface CanaryRecord {
  id: string;
  recipeVersionId: string;
  organizationId: string;
  purpose: string;
  canaryCode: string;
  nonce: string;
  issuedAt: string;
}

/** Issues a fresh per-recipient canary. The recipe content is untouched. */
export async function issueCanary(db: MajalDatabase, recipeVersionId: string, organizationId: string, purpose: string, issuedByUserId: string): Promise<CanaryRecord> {
  const secret = canarySecret();
  const nonce = randomBytes(12).toString('base64url');
  const canaryCode = computeCanaryCode(recipeVersionId, organizationId, nonce, secret);
  const markerSha256 = sha256(`${canaryCode}|${recipeVersionId}|${organizationId}`);
  const id = `can_${randomUUID()}`;
  const issuedAt = new Date().toISOString();
  await db.prepare('INSERT INTO recipe_canaries(id, recipe_version_id, organization_id, purpose, canary_code, marker_sha256, nonce, status, issued_by_user_id, issued_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(id, recipeVersionId, organizationId, purpose, canaryCode, markerSha256, nonce, 'ACTIVE', issuedByUserId, issuedAt);
  return { id, recipeVersionId, organizationId, purpose, canaryCode, nonce, issuedAt };
}

export interface TraceResult {
  matched: boolean;
  recipeVersionId?: string;
  organizationId?: string;
  purpose?: string;
  status?: string;
  issuedAt?: string;
  integrityValid?: boolean;
}

/**
 * Traces a recovered canary code back to its recipient. Also recomputes the code from the
 * stored (recipeVersion, org, nonce) to prove the record itself was not tampered with.
 */
export async function traceCanary(db: MajalDatabase, canaryCode: string): Promise<TraceResult> {
  const secret = canarySecret();
  const row = await db.prepare('SELECT recipe_version_id, organization_id, purpose, nonce, canary_code, status, issued_at FROM recipe_canaries WHERE canary_code = ?')
    .get<{ recipe_version_id: string; organization_id: string; purpose: string; nonce: string; canary_code: string; status: string; issued_at: string }>(canaryCode);
  if (!row) return { matched: false };
  const recomputed = computeCanaryCode(row.recipe_version_id, row.organization_id, row.nonce, secret);
  const a = Buffer.from(recomputed), b = Buffer.from(row.canary_code);
  const integrityValid = a.length === b.length && timingSafeEqual(a, b);
  return { matched: true, recipeVersionId: row.recipe_version_id, organizationId: row.organization_id, purpose: row.purpose, status: row.status, issuedAt: row.issued_at, integrityValid };
}

export async function revokeCanary(db: MajalDatabase, id: string) {
  const result = await db.prepare("UPDATE recipe_canaries SET status = 'REVOKED' WHERE id = ? AND status <> 'REVOKED'").run(id);
  return { id, status: 'REVOKED' as const, changed: result.changes > 0 };
}
