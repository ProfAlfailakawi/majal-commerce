import {
  Accrual,
  Collaboration,
  CreatorProduct,
  DisclosureLevel,
  HostBusiness,
  LabBatch,
  Launch,
  OfferTerms,
  Order,
  RecipeAccessGrant,
  RecipeVersion,
  Review,
  User
} from '../types/majal';
import { hasPermission } from './permissions';

type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH';
type SourceType = 'INTERNAL' | 'GOOGLE_SEARCH' | 'USER_GRANTED';

export interface IntelligenceEvidence {
  label: string;
  value: string;
  source: SourceType;
}

export interface IntelligenceGuardrail {
  code: string;
  label: string;
  enforcedBy: 'SYSTEM' | 'HUMAN_APPROVAL' | 'LEGAL_COUNSEL' | 'FINANCE';
}

export interface DeterministicEligibility {
  eligible: boolean;
  passed: string[];
  blockers: string[];
  summaryAr: string;
}

export interface SemanticMatchIntelligence {
  deterministicEligibility: DeterministicEligibility;
  semanticScore: number;
  confidence: 'LOW' | 'MEDIUM' | 'HIGH';
  reasons: string[];
  risks: string[];
  evidence: IntelligenceEvidence[];
  guardrails: IntelligenceGuardrail[];
  decisionAuthority: 'SYSTEM_ELIGIBILITY_THEN_HUMAN';
}

export interface GroundedMarketSignal {
  title: string;
  summary: string;
  query: string;
  citations: { title: string; uri: string }[];
}

export interface OpportunityRadarIntelligence {
  marketSearchQuery: string;
  groundedSignals: GroundedMarketSignal[];
  internalSignals: string[];
  nextQuestions: string[];
  guardrails: IntelligenceGuardrail[];
}

export interface RecipeLabIntelligence {
  effectiveDisclosureLevel: DisclosureLevel;
  visibleContext: string[];
  hiddenContext: string[];
  suggestions: string[];
  risks: string[];
  guardrails: IntelligenceGuardrail[];
}

export interface DealRoomCopilotIntelligence {
  summary: string;
  optionSummaries: string[];
  risks: { level: RiskLevel; text: string }[];
  openQuestions: string[];
  blockedActions: IntelligenceGuardrail[];
}

export interface LaunchIntelligence {
  internalReadout: string[];
  marketReadout: string[];
  risks: { level: RiskLevel; text: string }[];
  noInventedNumbers: boolean;
  guardrails: IntelligenceGuardrail[];
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

const tokenize = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(token => token.length > 2);

const overlapRatio = (left: string[], right: string[]) => {
  if (!left.length || !right.length) return 0;
  const rightSet = new Set(right);
  const overlap = left.filter(token => rightSet.has(token)).length;
  return overlap / Math.max(left.length, right.length);
};

export function buildDeterministicEligibility(product: CreatorProduct, host: HostBusiness): DeterministicEligibility {
  const blockers: string[] = [];
  const passed: string[] = [];
  const matchableStatuses = ['APPROVED_FOR_MARKETPLACE', 'AVAILABLE_FOR_MATCHING', 'IN_DISCUSSION', 'TESTING', 'COMMERCIAL_NEGOTIATION', 'CONTRACTING'];

  if (matchableStatuses.includes(product.status)) passed.push('حالة المنتج تسمح بالمطابقة.');
  else blockers.push(`حالة المنتج الحالية ${product.status} لا تسمح بالمطابقة التجارية.`);

  if (host.verificationStatus === 'VERIFIED') passed.push('المنشأة موثقة.');
  else blockers.push(`المنشأة ليست VERIFIED؛ حالتها ${host.verificationStatus}.`);

  if (product.targetSellingPriceKwd > product.estimatedUnitCostKwd) passed.push('السعر المستهدف أعلى من التكلفة المسجلة.');
  else blockers.push('السعر المستهدف لا يغطي التكلفة المسجلة.');

  const equipmentMatched = product.expectedEquipment.some(eq =>
    host.capabilities.equipment.some(hostEq => hostEq.toLowerCase().includes(eq.toLowerCase()) || eq.toLowerCase().includes(hostEq.toLowerCase()))
  );
  if (!product.expectedEquipment.length || equipmentMatched) passed.push('المعدات المطلوبة مغطاة أو غير محددة كقيد حاسم.');
  else blockers.push('لا يوجد تطابق معدات حتمي بين المنتج والمنشأة.');

  const eligible = blockers.length === 0;
  return {
    eligible,
    passed,
    blockers,
    summaryAr: eligible
      ? 'اجتاز المنتج والمنشأة فحص الأهلية الحتمي؛ يمكن تشغيل التحليل الدلالي بعده.'
      : 'توقف التحليل عند فحص الأهلية الحتمي؛ لا يتم ترقية المطابقة دلاليًا قبل معالجة الموانع.'
  };
}

export function buildSemanticMatchIntelligence(product: CreatorProduct, host: HostBusiness): SemanticMatchIntelligence {
  const deterministicEligibility = buildDeterministicEligibility(product, host);
  const productText = tokenize([
    product.publicName,
    product.internalName,
    product.category,
    product.shortDescription,
    product.story,
    product.servingSize,
    product.shelfLife,
    ...product.generalIngredients,
    ...product.dietaryTags
  ].join(' '));
  const hostText = tokenize([
    host.commercialName,
    host.businessType,
    host.brandPositioning,
    host.targetAudience,
    ...host.capabilities.cuisines,
    ...host.capabilities.dietary,
    ...host.capabilities.packaging,
    ...host.capabilities.serviceModels
  ].join(' '));

  const semantic = deterministicEligibility.eligible ? Math.round(65 + overlapRatio(productText, hostText) * 35) : 0;
  const margin = product.targetSellingPriceKwd
    ? Math.round(((product.targetSellingPriceKwd - product.estimatedUnitCostKwd) / product.targetSellingPriceKwd) * 100)
    : 0;
  const equipmentMatches = product.expectedEquipment.filter(eq =>
    host.capabilities.equipment.some(hostEq => hostEq.toLowerCase().includes(eq.toLowerCase()) || eq.toLowerCase().includes(hostEq.toLowerCase()))
  );

  return {
    deterministicEligibility,
    semanticScore: semantic,
    confidence: deterministicEligibility.eligible && (productText.length + hostText.length > 20) ? 'MEDIUM' : 'LOW',
    reasons: deterministicEligibility.eligible ? [
      `تداخل دلالي بين فئة ${product.category} وتموضع المنشأة: ${host.brandPositioning}.`,
      equipmentMatches.length ? `معدات متقاطعة: ${equipmentMatches.join('، ')}.` : 'لم تُستخدم معدات سرية في المطابقة؛ الاعتماد على الملاءمة العامة.',
      `الهامش المسجل داخليًا يقارب ${margin}% قبل أي تفاوض أو اعتماد مالي.`
    ] : [],
    risks: deterministicEligibility.blockers,
    evidence: [
      { label: 'Product status', value: product.status, source: 'INTERNAL' },
      { label: 'Host verification', value: host.verificationStatus, source: 'INTERNAL' },
      { label: 'Target audience', value: host.targetAudience, source: 'INTERNAL' },
      { label: 'Unit economics', value: `${product.estimatedUnitCostKwd.toFixed(3)} -> ${product.targetSellingPriceKwd.toFixed(3)} KWD`, source: 'INTERNAL' }
    ],
    guardrails: [
      guardrail('DETERMINISTIC_FIRST', 'الأهلية الحتمية تسبق التحليل الدلالي دائمًا.', 'SYSTEM'),
      ...financialLegalGuardrails
    ],
    decisionAuthority: 'SYSTEM_ELIGIBILITY_THEN_HUMAN'
  };
}

export function marketQueryForProduct(product: CreatorProduct, region = 'Kuwait'): string {
  return `${product.category} ${product.publicName} food trend ${region} delivery demand`;
}

export function buildOpportunityRadar(product: CreatorProduct, matchesCount: number, groundedSignals: GroundedMarketSignal[] = []): OpportunityRadarIntelligence {
  return {
    marketSearchQuery: marketQueryForProduct(product),
    groundedSignals,
    internalSignals: [
      `${matchesCount} مطابقة داخلية متاحة لهذا المنتج.`,
      `سعر البيع المستهدف ${product.targetSellingPriceKwd.toFixed(3)} د.ك والتكلفة المسجلة ${product.estimatedUnitCostKwd.toFixed(3)} د.ك.`,
      `حالة المنتج: ${product.status}.`
    ],
    nextQuestions: [
      'هل توجد قيود موسمية أو توريد تؤثر على الإطلاق؟',
      'هل تتطلب القناة المستهدفة تغليفًا أو مدة حفظ مختلفة؟'
    ],
    guardrails: [
      guardrail('GOOGLE_GROUNDED_ONLY', 'إشارات السوق الخارجية يجب أن تكون مرفقة بمصدر أو تُعرض كغير متاحة.', 'SYSTEM'),
      ...financialLegalGuardrails
    ]
  };
}

export function effectiveRecipeDisclosureLevel(user: User, product: CreatorProduct, grant?: RecipeAccessGrant, requestedLevel: DisclosureLevel = 1): DisclosureLevel {
  const creatorOwnsProduct = user.role === 'CREATOR' && user.creatorId === product.creatorId;
  if (creatorOwnsProduct) return 3;
  const roleMax: DisclosureLevel = hasPermission(user, 'VIEW_RECIPE_L3') ? 3 : hasPermission(user, 'VIEW_RECIPE_L2') ? 2 : hasPermission(user, 'VIEW_RECIPE_L1') ? 1 : 0;
  const grantValid = grant?.status === 'APPROVED' && (!grant.expiresAt || new Date(grant.expiresAt).getTime() > Date.now());
  const grantLevel: DisclosureLevel = grantValid ? grant.disclosureLevel : 0;
  return Math.min(requestedLevel, roleMax, grantLevel) as DisclosureLevel;
}

export function buildRecipeLabIntelligence(args: {
  user: User;
  product: CreatorProduct;
  recipe?: RecipeVersion;
  grant?: RecipeAccessGrant;
  requestedLevel?: DisclosureLevel;
  batches: LabBatch[];
}): RecipeLabIntelligence {
  const level = effectiveRecipeDisclosureLevel(args.user, args.product, args.grant, args.requestedLevel ?? 1);
  const latest = args.batches[0];
  const visibleContext = [
    `المنتج: ${args.product.publicName}`,
    `الفئة: ${args.product.category}`,
    `المكونات العامة: ${args.product.generalIngredients.join('، ') || 'غير مسجلة'}`,
    `الحساسية: ${args.product.allergens.join('، ') || 'غير مكتملة'}`
  ];
  const hiddenContext: string[] = [];
  if (level >= 2 && args.recipe) {
    visibleContext.push(`نسخة الوصفة: ${args.recipe.versionNumber}`);
    visibleContext.push(`خطوات تشغيلية مرئية: ${args.recipe.preparationSteps.length}`);
    hiddenContext.push('أسماء/كميات المكونات السرية محجوبة ما لم يكن L3.');
  } else {
    hiddenContext.push('خطوات التحضير والكميات والمكونات الدقيقة محجوبة عند L1 أو دون grant.');
  }
  if (level < 3) hiddenContext.push('criticalSecrets غير داخل سياق الذكاء.');
  else if (args.recipe?.criticalSecrets) visibleContext.push('السر التجاري متاح لصاحب المنتج أو L3 فقط.');

  return {
    effectiveDisclosureLevel: level,
    visibleContext,
    hiddenContext,
    suggestions: [
      latest ? `راجع آخر دفعة: تكلفة ${latest.measuredCostKwd.toFixed(3)} د.ك، زمن ${latest.prepTimeMinutes}د، هدر ${latest.wastePercentage}%.` : 'لا توجد دفعات مختبر؛ ابدأ بتجربة صغيرة موثقة.',
      args.product.allergens.length ? 'بيانات الحساسية موجودة ويمكن ربطها ببوابة الإطلاق.' : 'أكمل بيانات الحساسية قبل أي إطلاق.',
      'أي اعتماد إنتاج أو رفع L3 يجب أن يبقى من النظام الحالي أو موافقة بشرية.'
    ],
    risks: [
      ...(level < 2 ? ['تحليل المختبر محدود لأن grant لا يسمح بتفاصيل تشغيلية.'] : []),
      ...(latest && latest.wastePercentage > 12 ? ['الهدر المقاس مرتفع ويحتاج قرار تشغيل بشري.'] : [])
    ],
    guardrails: [
      guardrail('LITERAL_L_GRANTS', `السياق ملتزم حرفيًا بمستوى L${level}.`, 'SYSTEM'),
      ...financialLegalGuardrails
    ]
  };
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

export function buildLaunchIntelligence(args: {
  launch: Launch;
  product?: CreatorProduct;
  orders: Order[];
  reviews: Review[];
  accruals: Accrual[];
  marketSignals?: GroundedMarketSignal[];
  canSeeFinance: boolean;
}): LaunchIntelligence {
  const units = args.launch.unitsSold || args.orders.reduce((sum, order) => sum + order.unitsCount, 0);
  const cap = args.launch.quantityCapUnits;
  const sellThrough = cap ? Math.round((units / cap) * 100) : undefined;
  const repeatIntent = args.reviews.length ? Math.round(args.reviews.filter(review => review.wouldBuyAgain).length / args.reviews.length * 100) : undefined;
  const internalReadout = [
    `الوحدات المسجلة: ${units}.`,
    cap ? `Sell-through من بيانات الإطلاق: ${sellThrough}%.` : 'لا يوجد quantity cap مسجل، لذلك لا تُعرض نسبة نفاد.',
    repeatIntent === undefined ? 'لا توجد تقييمات كافية لإشارة إعادة الشراء.' : `نية إعادة الشراء من التقييمات الداخلية: ${repeatIntent}%.`,
    args.canSeeFinance ? `عدد accrual records المرتبطة: ${args.accruals.length}.` : 'الأرقام المالية محجوبة حسب صلاحية الحساب.'
  ];
  const risks: { level: RiskLevel; text: string }[] = [];
  if (sellThrough !== undefined && sellThrough > 80) risks.push({ level: 'MEDIUM', text: 'الكمية المتاحة قاربت النفاد بناءً على بيانات الإطلاق.' });
  if (repeatIntent !== undefined && repeatIntent < 50) risks.push({ level: 'MEDIUM', text: 'إشارة إعادة الشراء أقل من نصف التقييمات المسجلة.' });
  if (!args.launch.gateChecklist.allRequirementsPassed) risks.push({ level: 'HIGH', text: 'Launch Gate غير مكتملة؛ لا ينبغي للذكاء تجاوزها.' });

  return {
    internalReadout,
    marketReadout: args.marketSignals?.length
      ? args.marketSignals.map(signal => `${signal.title}: ${signal.summary}`)
      : ['لا توجد إشارة سوق خارجية grounded مرفقة، لذلك لا توجد أرقام سوقية معروضة.'],
    risks,
    noInventedNumbers: true,
    guardrails: [
      guardrail('INTERNAL_NUMBERS_ONLY', 'كل رقم معروض مشتق من orders/reviews/launch/accruals أو مخفي.', 'SYSTEM'),
      guardrail('NO_GO_LIVE_OVERRIDE', 'لا يستطيع الذكاء تفعيل الإطلاق أو تجاوز Launch Gate.', 'SYSTEM'),
      ...financialLegalGuardrails
    ]
  };
}
