import { MajalDatabase } from './database';

/*
 * Checkout primitives shared by the order route, the payment webhook and the hold sweeper.
 * Everything that touches stock goes through reserveBranchStock / releaseOrderReservation so
 * the reservation ledger (launch_branch_stock) can never drift from the orders it backs.
 */

/** Pending-payment hold: the reservation lives this long before the sweeper releases it. */
export const PAYMENT_HOLD_MINUTES = 15;

/**
 * Kuwaiti numbers are 8 digits (mobiles start 4/5/6/9, landlines 2). Accepts "+965 5xxx xxxx",
 * "00965…", "965…" or the bare 8 digits and returns the canonical "+965XXXXXXXX".
 */
export function normalizeKuwaitPhone(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const compact = value.replace(/[\s\-()]/g, '');
  const match = /^(?:\+965|00965|965)?([24569]\d{7})$/.exec(compact);
  return match ? `+965${match[1]}` : undefined;
}

export interface DeliveryZone { id: string; nameAr: string; feeFils: number; etaMinutes: number }
export interface PickupSlot { id: string; label: string; capacityOrders: number }

const str = (v: unknown, max: number) => typeof v === 'string' && v.trim() && v.trim().length <= max ? v.trim() : undefined;
const int = (v: unknown, min: number, max: number) => Number.isInteger(v) && (v as number) >= min && (v as number) <= max ? v as number : undefined;

export function parseZones(raw: unknown): DeliveryZone[] {
  const list = Array.isArray(raw) ? raw : safeParse(raw);
  return (Array.isArray(list) ? list : []).flatMap(item => {
    const id = str(item?.id, 60), nameAr = str(item?.nameAr, 80), feeFils = int(item?.feeFils, 0, 20_000), etaMinutes = int(item?.etaMinutes, 5, 600);
    return id && nameAr && feeFils !== undefined && etaMinutes !== undefined ? [{ id, nameAr, feeFils, etaMinutes }] : [];
  }).slice(0, 40);
}

export function parseSlots(raw: unknown): PickupSlot[] {
  const list = Array.isArray(raw) ? raw : safeParse(raw);
  return (Array.isArray(list) ? list : []).flatMap(item => {
    const id = str(item?.id, 60), label = str(item?.label, 80), capacityOrders = int(item?.capacityOrders, 1, 1_000);
    return id && label && capacityOrders ? [{ id, label, capacityOrders }] : [];
  }).slice(0, 48);
}

export function safeParse(raw: unknown): unknown {
  if (raw && typeof raw === 'object') return raw;
  if (typeof raw !== 'string' || !raw) return undefined;
  try { return JSON.parse(raw); } catch { return undefined; }
}

export interface Branch { id: string; name: string; area?: string; isActive?: boolean }
export function parseBranches(raw: unknown): Branch[] {
  const parsed = safeParse(raw);
  return Array.isArray(parsed)
    ? parsed.filter(b => b && typeof b.id === 'string').map(b => ({ id: String(b.id), name: String(b.name || b.id), area: b.area ? String(b.area) : undefined, isActive: b.isActive !== false }))
    : [];
}

export async function organizationBranches(db: MajalDatabase, organizationId: string): Promise<Branch[]> {
  const row = await db.prepare('SELECT branches_json FROM organizations WHERE id = ? LIMIT 1').get<{ branches_json: unknown }>(organizationId);
  return parseBranches(row?.branches_json);
}

/**
 * Atomic reservation. The conditional UPDATE is the whole concurrency story: under any
 * isolation level two buyers cannot both pass `reserved + units <= capacity`, because the
 * second UPDATE re-evaluates against the first one's committed row (row lock in Postgres,
 * database lock in SQLite). Returns NO_STOCK_ROW when the branch has no configured stock.
 */
export async function reserveBranchStock(tx: MajalDatabase, launchId: string, branchId: string, units: number, at: string) {
  const row = await tx.prepare('SELECT capacity_units, reserved_units, manual_cutoff FROM launch_branch_stock WHERE launch_id = ? AND branch_id = ?')
    .get<{ capacity_units: number | string; reserved_units: number | string; manual_cutoff: number | string }>(launchId, branchId);
  if (!row) return 'NO_STOCK_ROW' as const;
  if (Number(row.manual_cutoff) === 1) return 'CUTOFF' as const;
  const result = await tx.prepare(
    'UPDATE launch_branch_stock SET reserved_units = reserved_units + ?, updated_at = ? WHERE launch_id = ? AND branch_id = ? AND manual_cutoff = 0 AND reserved_units + ? <= capacity_units'
  ).run(units, at, launchId, branchId, units);
  return result.changes === 1 ? 'RESERVED' as const : 'SOLD_OUT' as const;
}

/**
 * Moves an order out of a stock-holding state and returns its units to the branch in the
 * SAME statement pair. The status guard makes it idempotent: a second release (retried
 * webhook, sweeper racing a webhook) changes zero order rows and so releases nothing.
 */
export async function releaseOrderReservation(tx: MajalDatabase, orderId: string, nextStatus: 'CANCELLED' | 'REFUNDED', fromStatuses: string[], at: string) {
  const order = await tx.prepare('SELECT launch_id, branch_id, units, status FROM orders WHERE id = ?')
    .get<{ launch_id: string; branch_id: string | null; units: number | string; status: string }>(orderId);
  if (!order || !fromStatuses.includes(order.status)) return false;
  const placeholders = fromStatuses.map(() => '?').join(',');
  const moved = await tx.prepare(`UPDATE orders SET status = ?, updated_at = ? WHERE id = ? AND status IN (${placeholders})`)
    .run(nextStatus, at, orderId, ...fromStatuses);
  if (moved.changes !== 1) return false;
  if (order.branch_id) {
    await tx.prepare('UPDATE launch_branch_stock SET reserved_units = reserved_units - ?, updated_at = ? WHERE launch_id = ? AND branch_id = ? AND reserved_units >= ?')
      .run(Number(order.units), at, order.launch_id, order.branch_id, Number(order.units));
  }
  return true;
}

/**
 * Releases holds whose payment window elapsed. Only intents that never reached the provider's
 * authorised state are cancelled; an AUTHORIZED intent is awaiting capture and keeps its stock.
 */
export async function expireStaleHolds(db: MajalDatabase, at = new Date().toISOString()) {
  const stale = await db.prepare(
    `SELECT o.id, o.payment_intent_id FROM orders o LEFT JOIN payment_intents p ON p.id = o.payment_intent_id
     WHERE o.status = 'PENDING_PAYMENT' AND o.hold_expires_at IS NOT NULL AND o.hold_expires_at <= ?
       AND (p.id IS NULL OR p.status IN ('PENDING_PROVIDER', 'REDIRECT_REQUIRED')) LIMIT 200`
  ).all<{ id: string; payment_intent_id: string | null }>(at);
  let released = 0;
  for (const row of stale) {
    const done = await db.transaction(async tx => {
      const ok = await releaseOrderReservation(tx, row.id, 'CANCELLED', ['PENDING_PAYMENT'], at);
      if (ok && row.payment_intent_id) {
        await tx.prepare("UPDATE payment_intents SET status = 'CANCELLED', failure_code = 'HOLD_EXPIRED', updated_at = ? WHERE id = ? AND status IN ('PENDING_PROVIDER', 'REDIRECT_REQUIRED')")
          .run(at, row.payment_intent_id);
      }
      return ok;
    });
    if (done) released += 1;
  }
  return released;
}

/** KWD has three decimals (1 KWD = 1000 fils). */
export const filsToKwd = (fils: number) => (fils / 1000).toFixed(3);
