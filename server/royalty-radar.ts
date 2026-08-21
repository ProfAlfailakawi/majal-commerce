import { MajalDatabase } from './database';

/**
 * Royalty Anomaly Radar
 * ---------------------
 * Cross-checks the money story across orders, ledger, refunds, accruals and settlements
 * for a collaboration, and surfaces DISCREPANCIES with the evidence behind them. It never
 * concludes fraud: every finding is an advisory anomaly + evidence + a confidence score,
 * for a human to investigate.
 */

export type AnomalyCode =
  | 'LEDGER_REVENUE_MISMATCH'
  | 'REFUND_SPIKE'
  | 'ACCRUAL_GAP'
  | 'SETTLEMENT_OVERPAY'
  | 'MISSING_ATTRIBUTION';

export interface Anomaly {
  code: AnomalyCode;
  severity: 'INFO' | 'WARN' | 'CRITICAL';
  confidence: number;         // 0..1
  message: string;
  evidence: Record<string, number>;
}

export interface RadarSignals {
  paidOrderRevenueFils: number;      // Σ orders.total_fils where PAID/FULFILLED
  refundedOrderFils: number;         // Σ orders.total_fils where REFUNDED
  ledgerCapturedFils: number;        // Σ ledger PAYMENT_CAPTURED for those orders' intents
  ledgerRefundedFils: number;        // Σ ledger PAYMENT_REFUNDED (absolute)
  accruedCreatorFils: number;        // Σ accruals for the collaboration
  eligibleAccrualFils: number;       // Σ accruals not yet paid
  settledFils: number;               // Σ settlement_batches PAID linked to creator
  paidOrderCount: number;
  attributedOrderCount: number;      // orders that have a value_attribution row set
}

/** Pure anomaly scan — deterministic, testable with synthetic signal sets. */
export function scanRoyaltyAnomalies(signals: RadarSignals): Anomaly[] {
  const anomalies: Anomaly[] = [];

  // 1. Ledger must corroborate the orders' revenue (leakage / missing sales / bug).
  const revenueGap = signals.paidOrderRevenueFils - signals.ledgerCapturedFils;
  if (Math.abs(revenueGap) > 0) {
    const ratio = signals.paidOrderRevenueFils > 0 ? Math.abs(revenueGap) / signals.paidOrderRevenueFils : 1;
    anomalies.push({ code: 'LEDGER_REVENUE_MISMATCH', severity: ratio >= 0.05 ? 'CRITICAL' : 'WARN', confidence: Math.min(1, 0.6 + ratio), message: 'إجمالي الطلبات المدفوعة لا يطابق ما سجّله دفتر القيود.', evidence: { paidOrderRevenueFils: signals.paidOrderRevenueFils, ledgerCapturedFils: signals.ledgerCapturedFils, gapFils: revenueGap } });
  }

  // 2. Refund concentration (refund abuse / reversal error).
  const refundBase = signals.paidOrderRevenueFils + signals.refundedOrderFils;
  const refundRatio = refundBase > 0 ? signals.refundedOrderFils / refundBase : 0;
  if (refundRatio >= 0.2) {
    anomalies.push({ code: 'REFUND_SPIKE', severity: refundRatio >= 0.4 ? 'CRITICAL' : 'WARN', confidence: Math.min(1, refundRatio + 0.2), message: 'نسبة الاسترداد مرتفعة بشكل غير معتاد.', evidence: { refundedOrderFils: signals.refundedOrderFils, refundBaseFils: refundBase, refundRatioBp: Math.round(refundRatio * 10000) } });
  }

  // 3. Paid orders exist but no creator accrual was recorded (missing royalty).
  if (signals.paidOrderCount > 0 && signals.accruedCreatorFils === 0) {
    anomalies.push({ code: 'ACCRUAL_GAP', severity: 'CRITICAL', confidence: 0.9, message: 'توجد طلبات مدفوعة دون أي إتاوة محتسبة للمبدع.', evidence: { paidOrderCount: signals.paidOrderCount, accruedCreatorFils: signals.accruedCreatorFils } });
  }

  // 4. Settlement paid out more than was ever eligible (settlement bug / overpay).
  if (signals.settledFils > signals.accruedCreatorFils) {
    anomalies.push({ code: 'SETTLEMENT_OVERPAY', severity: 'CRITICAL', confidence: 0.95, message: 'إجمالي التسويات المدفوعة يتجاوز الإتاوات المحتسبة.', evidence: { settledFils: signals.settledFils, accruedCreatorFils: signals.accruedCreatorFils, overpayFils: signals.settledFils - signals.accruedCreatorFils } });
  }

  // 5. Paid orders lacking a value-attribution breakdown (incomplete reporting).
  if (signals.paidOrderCount > signals.attributedOrderCount) {
    anomalies.push({ code: 'MISSING_ATTRIBUTION', severity: 'INFO', confidence: 0.7, message: 'بعض الطلبات المدفوعة بلا تفصيل إسناد قيمة.', evidence: { paidOrderCount: signals.paidOrderCount, attributedOrderCount: signals.attributedOrderCount } });
  }

  return anomalies;
}

/** Aggregates the live signals for one collaboration from the operational tables. */
export async function gatherRadarSignals(db: MajalDatabase, collaborationId: string, creatorId: string): Promise<RadarSignals> {
  const orders = await db.prepare(`SELECT
      COALESCE(SUM(CASE WHEN o.status IN ('PAID','FULFILLED') THEN o.total_fils ELSE 0 END),0) AS paid_rev,
      COALESCE(SUM(CASE WHEN o.status = 'REFUNDED' THEN o.total_fils ELSE 0 END),0) AS refunded,
      COALESCE(SUM(CASE WHEN o.status IN ('PAID','FULFILLED') THEN 1 ELSE 0 END),0) AS paid_count
    FROM orders o JOIN launches l ON l.id = o.launch_id WHERE l.collaboration_id = ?`)
    .get<{ paid_rev: number|string; refunded: number|string; paid_count: number|string }>(collaborationId);

  const ledger = await db.prepare(`SELECT
      COALESCE(SUM(CASE WHEN fl.entry_type = 'PAYMENT_CAPTURED' THEN fl.amount_fils ELSE 0 END),0) AS captured,
      COALESCE(SUM(CASE WHEN fl.entry_type = 'PAYMENT_REFUNDED' THEN -fl.amount_fils ELSE 0 END),0) AS refunded
    FROM financial_ledger fl WHERE fl.entity_type = 'PAYMENT_INTENT' AND fl.entity_id IN (
      SELECT o.payment_intent_id FROM orders o JOIN launches l ON l.id = o.launch_id
      WHERE l.collaboration_id = ? AND o.payment_intent_id IS NOT NULL)`)
    .get<{ captured: number|string; refunded: number|string }>(collaborationId);

  const accrual = await db.prepare(`SELECT
      COALESCE(SUM(a.amount_fils),0) AS accrued,
      COALESCE(SUM(CASE WHEN a.status IN ('ELIGIBLE','PENDING') THEN a.amount_fils ELSE 0 END),0) AS eligible
    FROM accruals a JOIN orders o ON o.id = a.order_id JOIN launches l ON l.id = o.launch_id
    WHERE l.collaboration_id = ?`).get<{ accrued: number|string; eligible: number|string }>(collaborationId);

  const settled = await db.prepare("SELECT COALESCE(SUM(total_fils),0) AS settled FROM settlement_batches WHERE creator_id = ? AND status = 'PAID'")
    .get<{ settled: number|string }>(creatorId);

  const attributed = await db.prepare(`SELECT COUNT(DISTINCT va.order_id) AS c
    FROM value_attribution_entries va JOIN orders o ON o.id = va.order_id JOIN launches l ON l.id = o.launch_id
    WHERE l.collaboration_id = ?`).get<{ c: number|string }>(collaborationId);

  return {
    paidOrderRevenueFils: Number(orders?.paid_rev || 0),
    refundedOrderFils: Number(orders?.refunded || 0),
    ledgerCapturedFils: Number(ledger?.captured || 0),
    ledgerRefundedFils: Number(ledger?.refunded || 0),
    accruedCreatorFils: Number(accrual?.accrued || 0),
    eligibleAccrualFils: Number(accrual?.eligible || 0),
    settledFils: Number(settled?.settled || 0),
    paidOrderCount: Number(orders?.paid_count || 0),
    attributedOrderCount: Number(attributed?.c || 0)
  };
}
