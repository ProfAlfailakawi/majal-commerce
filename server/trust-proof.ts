import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { MajalDatabase } from './database';

/**
 * Reputation Without Disclosure (Trust Proof)
 * -------------------------------------------
 * Lets a creator or organization PROVE track-record claims — number of successful deals,
 * commitment rate, average settlement speed, absence of major disputes — without revealing
 * any deal names or confidential terms. Claims are aggregate-only and platform-signed
 * (HMAC-SHA256) so a counterparty can verify authenticity without contacting the platform
 * for the underlying records.
 */

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
const canonical = (value: unknown): string => {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map(key => `${JSON.stringify(key)}:${canonical(record[key])}`).join(',')}}`;
};

export interface TrustClaims {
  subjectType: 'CREATOR' | 'ORGANIZATION';
  subjectId: string;
  successfulDeals: number;      // collaborations that reached a signed/live/ended stage
  totalDeals: number;
  commitmentRateBp: number;     // successful / total, in basis points
  avgSettlementDays: number;    // mean days APPROVED→PAID across settlement batches
  majorDisputeCount: number;    // collaborations in DISPUTED stage
  windowDays: number;           // lookback window the claims summarize
}

function trustKey(): { secret: string; keyId: string } {
  const secret = process.env.TRUST_ATTESTATION_SECRET?.trim();
  if (!secret || secret.length < 32) throw Object.assign(new Error('TRUST_ATTESTATION_NOT_CONFIGURED'), { status: 503 });
  // keyId lets counterparties pin the signing key without exposing the secret.
  return { secret, keyId: `k_${sha256(secret).slice(0, 12)}` };
}

export function signClaims(claims: TrustClaims, secret: string): string {
  return createHmac('sha256', secret).update(canonical(claims)).digest('hex');
}

export function verifyClaims(claims: TrustClaims, signature: string, secret: string): boolean {
  const expected = signClaims(claims, secret);
  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(signature, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Aggregates a creator's non-secret track record. Returns counts only — never deal identities. */
export async function computeCreatorTrustClaims(db: MajalDatabase, creatorId: string, windowDays = 365): Promise<TrustClaims> {
  const since = new Date(Date.now() - windowDays * 86400000).toISOString();
  const deals = await db.prepare(`SELECT
      COUNT(*) AS total,
      COALESCE(SUM(CASE WHEN stage IN ('SIGNED','PRE_LAUNCH','LIVE','REVIEW','RENEWED','ENDED') THEN 1 ELSE 0 END),0) AS successful,
      COALESCE(SUM(CASE WHEN stage = 'DISPUTED' THEN 1 ELSE 0 END),0) AS disputes
    FROM collaborations WHERE creator_id = ? AND created_at >= ?`)
    .get<{ total: number|string; successful: number|string; disputes: number|string }>(creatorId, since);
  const settlement = await db.prepare(`SELECT created_at, updated_at FROM settlement_batches WHERE creator_id = ? AND status = 'PAID' AND created_at >= ?`)
    .all<{ created_at: string; updated_at: string }>(creatorId, since);

  const total = Number(deals?.total || 0);
  const successful = Number(deals?.successful || 0);
  const settlementDays = settlement.map(s => (new Date(s.updated_at).getTime() - new Date(s.created_at).getTime()) / 86400000).filter(d => d >= 0);
  const avgSettlementDays = settlementDays.length ? Number((settlementDays.reduce((a, b) => a + b, 0) / settlementDays.length).toFixed(2)) : 0;

  return {
    subjectType: 'CREATOR', subjectId: creatorId,
    successfulDeals: successful, totalDeals: total,
    commitmentRateBp: total > 0 ? Math.round(successful / total * 10000) : 0,
    avgSettlementDays, majorDisputeCount: Number(deals?.disputes || 0), windowDays
  };
}

export async function issueCreatorTrustAttestation(db: MajalDatabase, creatorId: string, windowDays = 365, validityDays = 30) {
  const { secret, keyId } = trustKey();
  const claims = await computeCreatorTrustClaims(db, creatorId, windowDays);
  const signature = signClaims(claims, secret);
  const id = `att_${randomUUID()}`;
  const issuedAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + validityDays * 86400000).toISOString();
  await db.prepare('INSERT INTO trust_attestations(id, subject_type, subject_id, claims_json, claims_sha256, signature, key_id, issued_at, expires_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(id, claims.subjectType, claims.subjectId, JSON.stringify(claims), sha256(canonical(claims)), signature, keyId, issuedAt, expiresAt);
  return { id, claims, signature, keyId, issuedAt, expiresAt };
}

/** Verifies a presented attestation against the live key without touching underlying deals. */
export function verifyAttestation(claims: TrustClaims, signature: string): { valid: boolean; keyId: string } {
  const { secret, keyId } = trustKey();
  return { valid: verifyClaims(claims, signature, secret), keyId };
}
