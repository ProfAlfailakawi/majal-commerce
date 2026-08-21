import { randomUUID } from 'node:crypto';
import { MajalDatabase } from './database';

/**
 * Contract Drift Detector
 * -----------------------
 * Compares what was AGREED (the accepted offer) against what is ACTUALLY happening
 * (real orders, real royalty accruals). Divergence is surfaced early — before it turns
 * into a dispute — with an explicit severity and the numbers behind it. It never
 * rewrites the contract; it only reports drift and stores an immutable snapshot.
 */

export type DriftSeverity = 'NONE' | 'INFO' | 'WARN' | 'CRITICAL';

export interface AgreedTerms {
  sellingPriceFils: number;
  creatorRoyaltyBasisPoints: number;
  platformFeeBasisPoints: number;
}
export interface ActualObservations {
  orderCount: number;
  paidUnits: number;
  actualRevenueFils: number;
  actualAvgUnitPriceFils: number;
  actualCreatorAccruedFils: number;
}
export interface DriftItem {
  metric: string;
  agreed: number;
  actual: number;
  deltaBp: number;      // signed divergence in basis points of the agreed value
  severity: DriftSeverity;
  note: string;
}

const SEVERITY_RANK: Record<DriftSeverity, number> = { NONE: 0, INFO: 1, WARN: 2, CRITICAL: 3 };
const severityForBp = (absBp: number): DriftSeverity => absBp >= 1500 ? 'CRITICAL' : absBp >= 500 ? 'WARN' : absBp >= 100 ? 'INFO' : 'NONE';
const bpDelta = (agreed: number, actual: number) => agreed === 0 ? (actual === 0 ? 0 : 10000) : Math.round((actual - agreed) / agreed * 10000);

/** Pure drift computation — deterministic and unit-testable with synthetic inputs. */
export function computeContractDrift(agreed: AgreedTerms, actual: ActualObservations): { items: DriftItem[]; maxSeverity: DriftSeverity } {
  const items: DriftItem[] = [];

  if (actual.paidUnits > 0) {
    const priceBp = bpDelta(agreed.sellingPriceFils, actual.actualAvgUnitPriceFils);
    items.push({ metric: 'SELLING_PRICE', agreed: agreed.sellingPriceFils, actual: actual.actualAvgUnitPriceFils, deltaBp: priceBp, severity: severityForBp(Math.abs(priceBp)), note: 'متوسط سعر البيع الفعلي مقابل المتفق عليه.' });

    // Effective royalty share of actual revenue vs the agreed rate.
    const effectiveRoyaltyBp = actual.actualRevenueFils > 0 ? Math.round(actual.actualCreatorAccruedFils / actual.actualRevenueFils * 10000) : 0;
    const royaltyBp = effectiveRoyaltyBp - agreed.creatorRoyaltyBasisPoints;
    items.push({ metric: 'CREATOR_ROYALTY', agreed: agreed.creatorRoyaltyBasisPoints, actual: effectiveRoyaltyBp, deltaBp: royaltyBp, severity: severityForBp(Math.abs(royaltyBp)), note: 'نسبة الإتاوة الفعلية المحتسبة مقابل المتفق عليها.' });
  }

  const maxSeverity = items.reduce<DriftSeverity>((worst, item) => SEVERITY_RANK[item.severity] > SEVERITY_RANK[worst] ? item.severity : worst, 'NONE');
  return { items, maxSeverity };
}

/** Gathers the actual observations for a collaboration from live order + accrual data. */
export async function gatherActuals(db: MajalDatabase, collaborationId: string): Promise<ActualObservations> {
  const orders = await db.prepare(`SELECT COUNT(*) AS order_count, COALESCE(SUM(o.units),0) AS units, COALESCE(SUM(o.total_fils),0) AS revenue
    FROM orders o JOIN launches l ON l.id = o.launch_id
    WHERE l.collaboration_id = ? AND o.status IN ('PAID','FULFILLED')`).get<{ order_count: number|string; units: number|string; revenue: number|string }>(collaborationId);
  const accrued = await db.prepare(`SELECT COALESCE(SUM(a.amount_fils),0) AS accrued
    FROM accruals a JOIN orders o ON o.id = a.order_id JOIN launches l ON l.id = o.launch_id
    WHERE l.collaboration_id = ?`).get<{ accrued: number|string }>(collaborationId);
  const paidUnits = Number(orders?.units || 0);
  const revenue = Number(orders?.revenue || 0);
  return {
    orderCount: Number(orders?.order_count || 0),
    paidUnits,
    actualRevenueFils: revenue,
    actualAvgUnitPriceFils: paidUnits > 0 ? Math.round(revenue / paidUnits) : 0,
    actualCreatorAccruedFils: Number(accrued?.accrued || 0)
  };
}

export async function loadAgreedTerms(db: MajalDatabase, collaborationId: string): Promise<AgreedTerms | undefined> {
  const offer = await db.prepare(`SELECT selling_price_fils, creator_royalty_basis_points, platform_fee_basis_points
    FROM offer_versions WHERE collaboration_id = ? AND status = 'ACCEPTED' ORDER BY version_number DESC LIMIT 1`)
    .get<{ selling_price_fils: number|string; creator_royalty_basis_points: number|string; platform_fee_basis_points: number|string }>(collaborationId);
  if (!offer) return undefined;
  return {
    sellingPriceFils: Number(offer.selling_price_fils),
    creatorRoyaltyBasisPoints: Number(offer.creator_royalty_basis_points),
    platformFeeBasisPoints: Number(offer.platform_fee_basis_points)
  };
}

/** Runs a full drift analysis and persists an immutable snapshot for the dispute trail. */
export async function recordDriftReport(db: MajalDatabase, collaborationId: string, createdByUserId: string) {
  const agreed = await loadAgreedTerms(db, collaborationId);
  if (!agreed) throw Object.assign(new Error('NO_ACCEPTED_OFFER'), { status: 409 });
  const actual = await gatherActuals(db, collaborationId);
  const { items, maxSeverity } = computeContractDrift(agreed, actual);
  const id = `drift_${randomUUID()}`;
  const createdAt = new Date().toISOString();
  await db.prepare(`INSERT INTO contract_drift_reports(id, collaboration_id, agreed_json, actual_json, drift_json, max_severity, created_by_user_id, created_at)
    VALUES(?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, collaborationId, JSON.stringify(agreed), JSON.stringify(actual), JSON.stringify(items), maxSeverity, createdByUserId, createdAt);
  return { id, collaborationId, agreed, actual, drift: items, maxSeverity, createdAt };
}
