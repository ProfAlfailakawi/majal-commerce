import { MajalDatabase } from './database';

/**
 * Deal Blast Radius
 * -----------------
 * Before accepting a contract or a material change, answers: "if this party fails, or is
 * N days late, what does it take down with it?" — across launches, inventory, revenue,
 * creators, kitchens, customers and settlements. Then it proposes containment options
 * BEFORE the problem happens. Pure model over live facts; never mutates anything.
 */

export type BlastSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'SEVERE';

export interface BlastFacts {
  stage: string;
  launchLive: boolean;
  quantityCap: number;               // 0 = uncapped/unknown
  pendingOrders: number;             // orders awaiting payment/fulfilment
  pendingRevenueFils: number;        // revenue tied up in pending orders
  liveInventoryUnits: number;        // catalog inventory tied to this collaboration
  dependentCustomers: number;        // distinct consumers with open orders
  eligibleAccrualFils: number;       // creator money awaiting settlement
  lockedSettlementFils: number;      // settlement batches mid-flight
  activeCapacityBookings: number;    // kitchen slots reserved for this work
}

export interface BlastImpact {
  scenario: { party: 'CREATOR' | 'HOST' | 'EITHER'; delayDays: number };
  severity: BlastSeverity;
  score: number;                     // 0..100 composite exposure
  affected: {
    launches: number;
    ordersAtRisk: number;
    revenueAtRiskFils: number;
    inventoryUnitsAtRisk: number;
    customersAffected: number;
    creatorMoneyAtRiskFils: number;
    kitchenBookingsAtRisk: number;
  };
  containment: string[];
}

const severityForScore = (score: number): BlastSeverity => score >= 75 ? 'SEVERE' : score >= 50 ? 'HIGH' : score >= 25 ? 'MEDIUM' : 'LOW';

/** Deterministic exposure model — testable with synthetic facts. */
export function computeBlastRadius(facts: BlastFacts, scenario: { party: 'CREATOR' | 'HOST' | 'EITHER'; delayDays: number }): BlastImpact {
  const revenueAtRisk = facts.pendingRevenueFils;
  const creatorMoneyAtRisk = facts.eligibleAccrualFils + facts.lockedSettlementFils;

  // Composite score weights money and live customer exposure most, scaled by lateness.
  const delayFactor = Math.min(2, 1 + scenario.delayDays / 14);
  const raw =
    (facts.launchLive ? 25 : 0) +
    Math.min(25, revenueAtRisk / 100_000) +          // 1 point / 100 KWD (fils/100000)
    Math.min(20, creatorMoneyAtRisk / 100_000) +
    Math.min(15, facts.dependentCustomers) +
    Math.min(10, facts.pendingOrders / 5) +
    Math.min(5, facts.activeCapacityBookings * 2);
  const score = Math.round(Math.min(100, raw * delayFactor));

  const containment: string[] = [];
  if (facts.launchLive) containment.push('تفعيل إيقاف مؤقت للإطلاق قبل قبول الطلبات الجديدة.');
  if (revenueAtRisk > 0) containment.push('تجميد الطلبات المعلّقة وإخطار العملاء المتأثرين باستباقية.');
  if (creatorMoneyAtRisk > 0) containment.push('تعليق دفعة التسوية الجارية حتى تأكيد التسليم.');
  if (facts.activeCapacityBookings > 0) containment.push('إعادة جدولة حجوزات سعة المطبخ إلى نافذة بديلة.');
  if (scenario.delayDays >= 7) containment.push('تفعيل غرفة إنقاذ الصفقة وتعيين مالك قرار بمهلة صارمة.');
  if (!containment.length) containment.push('لا يوجد تعرّض تشغيلي حرج؛ يكفي المتابعة الدورية.');

  return {
    scenario, severity: severityForScore(score), score,
    affected: {
      launches: facts.launchLive || facts.stage !== 'INTEREST' ? 1 : 0,
      ordersAtRisk: facts.pendingOrders,
      revenueAtRiskFils: revenueAtRisk,
      inventoryUnitsAtRisk: facts.liveInventoryUnits,
      customersAffected: facts.dependentCustomers,
      creatorMoneyAtRiskFils: creatorMoneyAtRisk,
      kitchenBookingsAtRisk: facts.activeCapacityBookings
    },
    containment
  };
}

export async function gatherBlastFacts(db: MajalDatabase, collaborationId: string): Promise<BlastFacts | undefined> {
  const col = await db.prepare('SELECT id, product_id, organization_id, creator_id, stage FROM collaborations WHERE id = ?')
    .get<{ id: string; product_id: string; organization_id: string; creator_id: string; stage: string }>(collaborationId);
  if (!col) return undefined;

  const launch = await db.prepare("SELECT status, quantity_cap FROM launches WHERE collaboration_id = ?").get<{ status: string; quantity_cap: number | string | null }>(collaborationId);
  const pending = await db.prepare(`SELECT COUNT(*) AS c, COALESCE(SUM(o.total_fils),0) AS revenue, COUNT(DISTINCT o.consumer_user_id) AS customers
    FROM orders o JOIN launches l ON l.id = o.launch_id WHERE l.collaboration_id = ? AND o.status IN ('PENDING_PAYMENT','PAID')`)
    .get<{ c: number|string; revenue: number|string; customers: number|string }>(collaborationId);
  const inventory = await db.prepare("SELECT COALESCE(SUM(inventory_units),0) AS units FROM catalog_records WHERE tenant_id = ? AND status = 'LIVE'").get<{ units: number|string }>(col.organization_id);
  const accrual = await db.prepare(`SELECT COALESCE(SUM(CASE WHEN a.status IN ('ELIGIBLE','PENDING') THEN a.amount_fils ELSE 0 END),0) AS eligible
    FROM accruals a JOIN orders o ON o.id = a.order_id JOIN launches l ON l.id = o.launch_id WHERE l.collaboration_id = ?`).get<{ eligible: number|string }>(collaborationId);
  const locked = await db.prepare("SELECT COALESCE(SUM(total_fils),0) AS locked FROM settlement_batches WHERE creator_id = ? AND status IN ('APPROVED','PROCESSING')").get<{ locked: number|string }>(col.creator_id);
  const bookings = await db.prepare(`SELECT COUNT(*) AS c FROM kitchen_capacity_bookings b JOIN kitchen_capacity_slots s ON s.id = b.slot_id
    WHERE s.organization_id = ? AND b.status IN ('HELD','CONFIRMED')`).get<{ c: number|string }>(col.organization_id);

  return {
    stage: col.stage,
    launchLive: launch?.status === 'LIVE',
    quantityCap: Number(launch?.quantity_cap || 0),
    pendingOrders: Number(pending?.c || 0),
    pendingRevenueFils: Number(pending?.revenue || 0),
    liveInventoryUnits: Number(inventory?.units || 0),
    dependentCustomers: Number(pending?.customers || 0),
    eligibleAccrualFils: Number(accrual?.eligible || 0),
    lockedSettlementFils: Number(locked?.locked || 0),
    activeCapacityBookings: Number(bookings?.c || 0)
  };
}
