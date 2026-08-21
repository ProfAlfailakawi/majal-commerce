import { randomUUID } from 'node:crypto';
import { MajalDatabase, withTransaction } from './database';

/**
 * Secret Half-Life (decaying exposure budget)
 * -------------------------------------------
 * Every recipe disclosure is a grant with an exposure "strength" that decays
 * exponentially with time and with each access. Access is permitted only while the
 * live strength stays at/above a floor; once it falls below, the grant self-revokes
 * server-side. The goal: the fewest people know the least of the secret for the
 * shortest necessary time — enforced quantitatively, not by manual clean-up.
 *
 * strength(t) = initial_bp * 0.5^(elapsed / halfLife) - accessCount * accessDecayBp
 */

export interface ExposureGrantRow {
  id: string;
  product_id: string;
  recipe_version_id: string;
  organization_id: string;
  purpose: string;
  initial_exposure_bp: number | string;
  floor_bp: number | string;
  half_life_seconds: number | string;
  access_decay_bp: number | string;
  status: string;
  access_count: number | string;
  granted_at: string;
  hard_expires_at: string;
}

export type ExposureDecision = 'ALLOWED' | 'DENIED_FLOOR' | 'DENIED_EXPIRED' | 'DENIED_REVOKED';

/** Pure decay model. `accessCountOverride` lets callers project the post-access value. */
export function computeExposureStrengthBp(grant: {
  initialExposureBp: number; floorBp: number; halfLifeSeconds: number; accessDecayBp: number;
  grantedAtMs: number; accessCount: number;
}, atMs: number, accessCountOverride?: number): number {
  const elapsedSeconds = Math.max(0, (atMs - grant.grantedAtMs) / 1000);
  const timeFactor = Math.pow(0.5, elapsedSeconds / grant.halfLifeSeconds);
  const accessCount = accessCountOverride ?? grant.accessCount;
  const raw = grant.initialExposureBp * timeFactor - accessCount * grant.accessDecayBp;
  return Math.max(0, Math.round(raw));
}

function toModel(row: ExposureGrantRow) {
  return {
    initialExposureBp: Number(row.initial_exposure_bp),
    floorBp: Number(row.floor_bp),
    halfLifeSeconds: Number(row.half_life_seconds),
    accessDecayBp: Number(row.access_decay_bp),
    grantedAtMs: new Date(row.granted_at).getTime(),
    accessCount: Number(row.access_count)
  };
}

export interface CreateExposureInput {
  productId: string;
  recipeVersionId: string;
  organizationId: string;
  purpose: string;
  initialExposureBp: number;
  floorBp: number;
  halfLifeSeconds: number;
  accessDecayBp: number;
  hardExpiresInSeconds: number;
  grantedByUserId: string;
}

export async function createExposureGrant(db: MajalDatabase, input: CreateExposureInput) {
  if (input.floorBp >= input.initialExposureBp) throw Object.assign(new Error('FLOOR_ABOVE_INITIAL'), { status: 400 });
  const id = `sxg_${randomUUID()}`;
  const now = new Date();
  const grantedAt = now.toISOString();
  const hardExpiresAt = new Date(now.getTime() + input.hardExpiresInSeconds * 1000).toISOString();
  await db.prepare(`INSERT INTO secret_exposure_grants(
      id, product_id, recipe_version_id, organization_id, purpose, initial_exposure_bp, floor_bp,
      half_life_seconds, access_decay_bp, status, access_count, granted_by_user_id, granted_at, hard_expires_at, updated_at)
    VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', 0, ?, ?, ?, ?)`)
    .run(id, input.productId, input.recipeVersionId, input.organizationId, input.purpose, input.initialExposureBp,
      input.floorBp, input.halfLifeSeconds, input.accessDecayBp, input.grantedByUserId, grantedAt, hardExpiresAt, grantedAt);
  return { id, status: 'ACTIVE' as const, grantedAt, hardExpiresAt, initialExposureBp: input.initialExposureBp, floorBp: input.floorBp };
}

export interface AccessResult {
  decision: ExposureDecision;
  allowed: boolean;
  strengthBpBefore: number;
  strengthBpAfter: number;
  grantStatus: string;
  reason: string;
}

/**
 * Evaluates one access attempt against the live decay curve and records the decision.
 * Serialized per-grant inside a transaction so concurrent readers cannot both consume
 * the last remaining budget. Auto-revokes (EXHAUSTED/EXPIRED) as a server-side effect.
 */
export async function recordExposureAccess(db: MajalDatabase, grantId: string, actorUserId: string, atMs = Date.now()): Promise<AccessResult> {
  return withTransaction(db, async tx => {
    const forUpdate = tx.dialect === 'postgres' ? ' FOR UPDATE' : '';
    const row = await tx.prepare(`SELECT * FROM secret_exposure_grants WHERE id = ?${forUpdate}`).get<ExposureGrantRow>(grantId);
    if (!row) throw Object.assign(new Error('EXPOSURE_GRANT_NOT_FOUND'), { status: 404 });

    const model = toModel(row);
    const before = computeExposureStrengthBp(model, atMs);
    const record = async (decision: ExposureDecision, after: number, reason: string) => {
      await tx.prepare(`INSERT INTO secret_exposure_access_events(id, grant_id, actor_user_id, strength_bp_before, strength_bp_after, decision, reason, created_at)
        VALUES(?, ?, ?, ?, ?, ?, ?, ?)`).run(`sxe_${randomUUID()}`, grantId, actorUserId, before, after, decision, reason, new Date(atMs).toISOString());
    };

    if (row.status === 'REVOKED') { await record('DENIED_REVOKED', before, 'grant revoked'); return { decision: 'DENIED_REVOKED', allowed: false, strengthBpBefore: before, strengthBpAfter: before, grantStatus: 'REVOKED', reason: 'grant revoked' }; }
    if (atMs >= new Date(row.hard_expires_at).getTime()) {
      await tx.prepare("UPDATE secret_exposure_grants SET status = 'EXPIRED', closed_at = ?, updated_at = ? WHERE id = ? AND status = 'ACTIVE'").run(new Date(atMs).toISOString(), new Date(atMs).toISOString(), grantId);
      await record('DENIED_EXPIRED', before, 'hard expiry reached');
      return { decision: 'DENIED_EXPIRED', allowed: false, strengthBpBefore: before, strengthBpAfter: before, grantStatus: 'EXPIRED', reason: 'hard expiry reached' };
    }
    if (before < model.floorBp) {
      await tx.prepare("UPDATE secret_exposure_grants SET status = 'EXHAUSTED', closed_at = ?, updated_at = ? WHERE id = ? AND status = 'ACTIVE'").run(new Date(atMs).toISOString(), new Date(atMs).toISOString(), grantId);
      await record('DENIED_FLOOR', before, 'strength below floor');
      return { decision: 'DENIED_FLOOR', allowed: false, strengthBpBefore: before, strengthBpAfter: before, grantStatus: 'EXHAUSTED', reason: 'strength below floor' };
    }

    // Allowed: consume one access, then project the new strength and self-close if it drops under the floor.
    const nextAccessCount = model.accessCount + 1;
    const after = computeExposureStrengthBp(model, atMs, nextAccessCount);
    const nextStatus = after < model.floorBp ? 'EXHAUSTED' : 'ACTIVE';
    const stamp = new Date(atMs).toISOString();
    await tx.prepare(`UPDATE secret_exposure_grants SET access_count = ?, last_access_at = ?, status = ?, closed_at = ?, updated_at = ? WHERE id = ?`)
      .run(nextAccessCount, stamp, nextStatus, nextStatus === 'EXHAUSTED' ? stamp : null, stamp, grantId);
    await record('ALLOWED', after, 'within budget');
    return { decision: 'ALLOWED', allowed: true, strengthBpBefore: before, strengthBpAfter: after, grantStatus: nextStatus, reason: 'within budget' };
  });
}

export async function revokeExposureGrant(db: MajalDatabase, grantId: string, atMs = Date.now()) {
  const stamp = new Date(atMs).toISOString();
  const result = await db.prepare("UPDATE secret_exposure_grants SET status = 'REVOKED', closed_at = ?, updated_at = ? WHERE id = ? AND status <> 'REVOKED'").run(stamp, stamp, grantId);
  return { id: grantId, status: 'REVOKED' as const, changed: result.changes > 0 };
}

/** Read-only live snapshot without consuming budget. */
export async function exposureSnapshot(db: MajalDatabase, grantId: string, atMs = Date.now()) {
  const row = await db.prepare('SELECT * FROM secret_exposure_grants WHERE id = ?').get<ExposureGrantRow>(grantId);
  if (!row) return undefined;
  const model = toModel(row);
  const strengthBp = computeExposureStrengthBp(model, atMs);
  const expired = atMs >= new Date(row.hard_expires_at).getTime();
  return {
    id: row.id, productId: row.product_id, organizationId: row.organization_id, purpose: row.purpose,
    status: row.status, strengthBp, floorBp: model.floorBp, initialExposureBp: model.initialExposureBp,
    accessCount: model.accessCount, grantedAt: row.granted_at, hardExpiresAt: row.hard_expires_at,
    live: row.status === 'ACTIVE' && !expired && strengthBp >= model.floorBp
  };
}
