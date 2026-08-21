import { MajalDatabase } from './database';

/**
 * Counterfactual Deal Engine
 * --------------------------
 * "What would have happened if we accepted offer B instead of offer A?" Projects revenue,
 * margins, creator royalty and platform fee for both offers across 3/6/12 months, with an
 * explicit uncertainty band driven by demand variance — presented as a DIFFERENCE, never
 * as a certain truth. Pure and deterministic; assumptions are surfaced with the result.
 */

export interface OfferTerms {
  sellingPriceFils: number;
  creatorRoyaltyBasisPoints: number;
  platformFeeBasisPoints: number;
}
export interface CounterfactualAssumptions {
  unitsPerMonth: number;
  unitCostFils: number;
  marketingFilsPerMonth: number;
  demandVarianceBp: number;   // e.g. 3000 = ±30% demand band
}

interface HorizonProjection {
  months: number;
  revenueFils: number;
  creatorFils: number;
  platformFils: number;
  operationsFils: number;
  marketingFils: number;
  hostResidualFils: number;
  hostMarginBp: number;
}
interface OfferProjection {
  base: HorizonProjection[];
  low: HorizonProjection[];   // demand at (1 - variance)
  high: HorizonProjection[];  // demand at (1 + variance)
}

function project(terms: OfferTerms, a: CounterfactualAssumptions, demandFactor: number): HorizonProjection[] {
  return [3, 6, 12].map(months => {
    const units = Math.max(0, Math.round(a.unitsPerMonth * demandFactor)) * months;
    const revenue = terms.sellingPriceFils * units;
    const creator = Math.round(revenue * terms.creatorRoyaltyBasisPoints / 10_000);
    const platform = Math.round(revenue * terms.platformFeeBasisPoints / 10_000);
    const operations = a.unitCostFils * units;
    const marketing = a.marketingFilsPerMonth * months;
    const host = revenue - creator - platform - operations - marketing;
    return { months, revenueFils: revenue, creatorFils: creator, platformFils: platform, operationsFils: operations, marketingFils: marketing, hostResidualFils: host, hostMarginBp: revenue ? Math.round(host * 10_000 / revenue) : 0 };
  });
}

function projectOffer(terms: OfferTerms, a: CounterfactualAssumptions): OfferProjection {
  const variance = Math.max(0, Math.min(9000, a.demandVarianceBp)) / 10_000;
  return { base: project(terms, a, 1), low: project(terms, a, 1 - variance), high: project(terms, a, 1 + variance) };
}

export interface CounterfactualResult {
  assumptions: CounterfactualAssumptions;
  offerA: OfferProjection;
  offerB: OfferProjection;
  deltaHostResidualFils: { months: number; base: number; low: number; high: number }[];
  recommendationNote: string;
}

/** Pure counterfactual comparison of two offers. */
export function computeCounterfactual(offerA: OfferTerms, offerB: OfferTerms, assumptions: CounterfactualAssumptions): CounterfactualResult {
  const a = projectOffer(offerA, assumptions);
  const b = projectOffer(offerB, assumptions);
  const delta = [0, 1, 2].map(i => ({
    months: a.base[i].months,
    base: b.base[i].hostResidualFils - a.base[i].hostResidualFils,
    low: b.low[i].hostResidualFils - a.low[i].hostResidualFils,
    high: b.high[i].hostResidualFils - a.high[i].hostResidualFils
  }));
  const twelve = delta[2];
  const note = twelve.low > 0 ? 'العرض B يتفوّق للمضيف عبر كامل نطاق الطلب المفترض (بما فيه السيناريو المنخفض).'
    : twelve.high < 0 ? 'العرض A يتفوّق للمضيف عبر كامل نطاق الطلب المفترض.'
    : 'النتيجة تعتمد على الطلب الفعلي؛ الفارق غير محسوم ضمن نطاق عدم اليقين.';
  return { assumptions, offerA: a, offerB: b, deltaHostResidualFils: delta, recommendationNote: note };
}

export async function loadOfferTerms(db: MajalDatabase, collaborationId: string, offerId: string): Promise<OfferTerms | undefined> {
  const row = await db.prepare('SELECT selling_price_fils, creator_royalty_basis_points, platform_fee_basis_points FROM offer_versions WHERE id = ? AND collaboration_id = ?')
    .get<{ selling_price_fils: number|string; creator_royalty_basis_points: number|string; platform_fee_basis_points: number|string }>(offerId, collaborationId);
  if (!row) return undefined;
  return { sellingPriceFils: Number(row.selling_price_fils), creatorRoyaltyBasisPoints: Number(row.creator_royalty_basis_points), platformFeeBasisPoints: Number(row.platform_fee_basis_points) };
}
