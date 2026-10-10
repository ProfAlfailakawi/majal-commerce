/*
 * Which stations of the payout stepper to show for a statement line. For a REVERSED line the
 * server reports approvedAt/paidAt as null even when the settlement had already been locked
 * or paid (server/commerce-ops.ts creatorStatement), so how far it got is NOT known to the
 * client. We show only what is known (pending, then the reversal) and never claim that the
 * approval or payment stations were skipped.
 */
export type PayoutStage = 'PENDING' | 'APPROVED' | 'PAID' | 'REVERSED';
export type PayoutStation = 'PENDING' | 'APPROVED' | 'PAID';

export const PAYOUT_STATIONS: PayoutStation[] = ['PENDING', 'APPROVED', 'PAID'];
const rank: Record<PayoutStage, number> = { PENDING: 0, APPROVED: 1, PAID: 2, REVERSED: -1 };

export function visiblePayoutStations(stage: PayoutStage): PayoutStation[] {
  return stage === 'REVERSED' ? ['PENDING'] : PAYOUT_STATIONS;
}

export function payoutStationDone(stage: PayoutStage, station: PayoutStation): boolean {
  if (stage === 'REVERSED') return station === 'PENDING';
  return rank[stage] >= PAYOUT_STATIONS.indexOf(station);
}
