import {
  Collaboration,
  CreatorProduct,
  DisclosureLevel,
  HostBusiness,
  OfferTerms,
  RecipeAccessGrant,
  User
} from '../types/majal';
import { hasPermission } from './permissions';

type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH';

export interface IntelligenceGuardrail {
  code: string;
  label: string;
  enforcedBy: 'SYSTEM' | 'HUMAN_APPROVAL' | 'LEGAL_COUNSEL' | 'FINANCE';
}

export interface DealRoomCopilotIntelligence {
  summary: string;
  optionSummaries: string[];
  risks: { level: RiskLevel; text: string }[];
  openQuestions: string[];
  blockedActions: IntelligenceGuardrail[];
}

const guardrail = (code: string, label: string, enforcedBy: IntelligenceGuardrail['enforcedBy']): IntelligenceGuardrail => ({
  code,
  label,
  enforcedBy
});

const financialLegalGuardrails = [
  guardrail('NO_CONTRACT_EXECUTION', 'لا يوقع أو ينشئ أثرًا قانونيًا.', 'LEGAL_COUNSEL'),
  guardrail('NO_FINANCIAL_DECISION', 'لا يعتمد عرضًا أو تسوية أو سعرًا نيابة عن الأطراف.', 'FINANCE'),
  guardrail('NO_PERMISSION_CHANGE', 'لا يمنح أو يرفع صلاحيات L1/L2/L3.', 'SYSTEM')
];

export function marketQueryForProduct(product: CreatorProduct, region = 'Kuwait'): string {
  return `${product.category} ${product.publicName} food trend ${region} delivery demand`;
}

export function effectiveRecipeDisclosureLevel(user: User, product: CreatorProduct, grant?: RecipeAccessGrant, requestedLevel: DisclosureLevel = 1): DisclosureLevel {
  const creatorOwnsProduct = user.role === 'CREATOR' && user.creatorId === product.creatorId;
  if (creatorOwnsProduct) return 3;
  const roleMax: DisclosureLevel = hasPermission(user, 'VIEW_RECIPE_L3') ? 3 : hasPermission(user, 'VIEW_RECIPE_L2') ? 2 : hasPermission(user, 'VIEW_RECIPE_L1') ? 1 : 0;
  const grantValid = grant?.status === 'APPROVED' && (!grant.expiresAt || new Date(grant.expiresAt).getTime() > Date.now());
  const grantLevel: DisclosureLevel = grantValid ? grant.disclosureLevel : 0;
  return Math.min(requestedLevel, roleMax, grantLevel) as DisclosureLevel;
}

export function buildDealRoomCopilot(args: {
  collaboration: Collaboration;
  product?: CreatorProduct;
  host?: HostBusiness;
  offers: OfferTerms[];
  gatePassed?: boolean;
}): DealRoomCopilotIntelligence {
  const latestOffer = args.offers[0] || args.collaboration.currentOffer;
  const optionSummaries = args.offers.slice(0, 3).map(offer =>
    `V${offer.version}: سعر ${offer.sellingPriceKwd.toFixed(3)} د.ك، royalty ${offer.creatorRoyaltyRatePercent}%، fee ${offer.platformFeePercent}%، مدة ${offer.termMonths} شهر.`
  );
  const risks: { level: RiskLevel; text: string }[] = [];
  if (!latestOffer) risks.push({ level: 'MEDIUM', text: 'لا يوجد عرض تجاري قابل للمقارنة.' });
  if (latestOffer && latestOffer.creatorRoyaltyRatePercent + latestOffer.platformFeePercent >= 45) risks.push({ level: 'HIGH', text: 'مجموع النسب قد يضغط هامش المنشأة ويحتاج مراجعة مالية.' });
  if (!args.gatePassed) risks.push({ level: 'MEDIUM', text: 'Launch Gate ليست مكتملة؛ لا يصلح اعتبار الصفقة جاهزة للإطلاق.' });
  if (args.collaboration.contract?.status !== 'FULLY_SIGNED') risks.push({ level: 'HIGH', text: 'العقد غير مكتمل التوقيع؛ أي تنفيذ تجاري يحتاج المسار القانوني الحالي.' });

  return {
    summary: `${args.product?.publicName || 'منتج'} مع ${args.host?.commercialName || 'منشأة'} في مرحلة ${args.collaboration.stage}. التحليل يلخص ولا يقرر.`,
    optionSummaries: optionSummaries.length ? optionSummaries : ['لا توجد خيارات عروض محفوظة.'],
    risks,
    openQuestions: [
      'هل الشروط الحالية راجعها الطرف المالي المخول؟',
      'هل نسخة الوصفة الإنتاجية معتمدة من المختبر؟',
      'هل العقد النهائي مطابق للتفاهم التجاري الأخير؟'
    ],
    blockedActions: financialLegalGuardrails
  };
}
