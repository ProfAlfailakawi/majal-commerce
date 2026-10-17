/**
 * Two-variant ad test (shared by the server, which decides, and the demo, which imitates it). A recommendation only: nothing is applied automatically, and a verdict needs
 * enough impressions on BOTH variants, otherwise a lucky streak would be reported as a result.
 */
export interface VariantCount { impressions: number; clicks: number }
export type AbVerdict =
  | { state: 'not_enough_data'; needed: number }
  | { state: 'no_difference'; zScore: number }
  | { state: 'winner'; winner: 'A' | 'B'; liftPercent: number; zScore: number };

/** Impressions each variant needs before a verdict is given. */
export const AB_MIN_IMPRESSIONS = 500;

export function abVerdict(a: VariantCount, b: VariantCount): AbVerdict {
  if (a.impressions < AB_MIN_IMPRESSIONS || b.impressions < AB_MIN_IMPRESSIONS) return { state: 'not_enough_data', needed: AB_MIN_IMPRESSIONS };
  const pA = a.clicks / a.impressions, pB = b.clicks / b.impressions;
  const pooled = (a.clicks + b.clicks) / (a.impressions + b.impressions);
  const se = Math.sqrt(pooled * (1 - pooled) * (1 / a.impressions + 1 / b.impressions));
  // No clicks at all (or every impression clicked) leaves nothing to compare.
  if (se === 0) return { state: 'no_difference', zScore: 0 };
  const z = (pB - pA) / se;
  const rounded = Math.round(z * 100) / 100;
  if (Math.abs(z) < 1.96) return { state: 'no_difference', zScore: rounded };
  const winner = z > 0 ? 'B' : 'A';
  const base = winner === 'B' ? pA : pB;
  return { state: 'winner', winner, zScore: rounded, liftPercent: base > 0 ? Math.round(((winner === 'B' ? pB : pA) / base - 1) * 100) : 100 };
}
