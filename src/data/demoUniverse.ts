/**
 * The demo universe.
 *
 * The seed data ships one creator, one host, three products and two orders —
 * enough to prove a screen renders, far too little to show anyone what MAJAL
 * is. A marketplace with a single creator has no marketplace in it: no rival
 * offers, no settlement run worth approving, no review feed, no dispute to
 * arbitrate. This module amplifies the seed into a platform that looks like it
 * has been trading for a season.
 *
 * It is only ever read inside an explicitly-entered demo session
 * (see `runtime.ts`). Live accounts never touch it, and the store's live
 * branches still route every mutation through the server exactly as before.
 *
 * Everyone and everything below is invented. The names are Kuwaiti-shaped so
 * the screens read naturally; they correspond to no real person or business.
 */
import type {
  Accrual, AuditLog, Collaboration, CreatorProduct, CreatorProfile, DisputeCase,
  HostBusiness, Launch, Order, Review, SettlementBatch, User,
} from '../types/majal';
import {
  INITIAL_ACCRUALS, INITIAL_AUDIT_LOGS, INITIAL_COLLABORATIONS, INITIAL_CREATORS,
  INITIAL_HOSTS, INITIAL_LAUNCHES, INITIAL_ORDERS, INITIAL_PRODUCTS, INITIAL_REVIEWS,
  INITIAL_USERS,
} from './seedData';

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const day = 86_400_000;
const ago = (days: number) => new Date(Date.now() - days * day).toISOString();
const ahead = (days: number) => new Date(Date.now() + days * day).toISOString();
const kwd = (value: number) => Number(value.toFixed(3));

/* Seeded, not random: the same board every time, so a screenshot for a deck
 * stays reproducible and two people in a meeting see the same numbers. */
function makeRandom(seed: number): () => number {
  let state = seed >>> 0 || 0x9e3779b9;
  return () => {
    state ^= state << 13; state >>>= 0;
    state ^= state >> 17;
    state ^= state << 5; state >>>= 0;
    return state / 0x100000000;
  };
}
const pick = <T>(items: readonly T[], index: number): T => items[index % items.length];

const CREATORS: ReadonlyArray<readonly [string, string, string, string]> = [
  ['أم عبدالعزيز', 'حلويات كويتية تقليدية', 'العاصمة، الكويت', 'وصفات بيت انتقلت من الجدة، أول مرة تنزل السوق بكمية تجارية.'],
  ['بيت الدرويش', 'مخبوزات ومعجنات', 'حولي، الكويت', 'مخبز بيتي صغير كبر على طلبات الدواوين والمناسبات.'],
  ['مطبخ نورة', 'أكل كويتي بيتي', 'الفروانية، الكويت', 'وجبات جاهزة بنفس طعم البيت، بدون نكهات صناعية.'],
  ['حلويات الهيل', 'حلويات مطوّرة', 'الجهراء، الكويت', 'خلطة هيل وزعفران ثابتة من ١٢ سنة، ما تغيرت ولا مرة.'],
  ['شيف بدر', 'صلصات وتوابل', 'مبارك الكبير، الكويت', 'دقّوس وصلصات محمّصة بالبيت، وصلت المطاعم قبل ما توصل الرفوف.'],
  ['أم جاسم', 'مشروبات تقليدية', 'الأحمدي، الكويت', 'سوبيا ولبن وشراب رمضاني يُعبّأ طازج كل يوم.'],
  ['فرن الرملة', 'خبز وفطائر', 'حولي، الكويت', 'خبز تنور يومي على الطريقة القديمة، بفرن حجري.'],
  ['حلا الديرة', 'كيك وحلا بارد', 'العاصمة، الكويت', 'حلا بارد كويتي بطبقات، بدأ من طلبات الأهل.'],
  ['مطبخ الوالدة', 'مقبلات ومخللات', 'الفروانية، الكويت', 'مخلل ومقبلات بيتية بنِسَب ما تتغير.'],
  ['شيف مشاري', 'برجر ومشاوي', 'الأحمدي، الكويت', 'وصفة برجر بتتبيلة بيتية طوّرها على مدى سنتين.'],
  ['حلويات أم فهد', 'تمر ومعمول', 'الجهراء، الكويت', 'معمول تمر بحشوة خلاص، بنفس عجينة الجدة.'],
  ['بيت القهوة', 'قهوة وتحميص', 'العاصمة، الكويت', 'تحميص قهوة عربية على درجة ثابتة، هيل وزعفران بنسبة مضبوطة.'],
];

const HOSTS: ReadonlyArray<readonly [string, HostBusiness['businessType'], string, string]> = [
  ['مطابخ الديرة المركزية', 'CENTRAL_KITCHEN', 'مطبخ مركزي كويتي مرخّص', 'بيوت الكويت والدواوين'],
  ['مخبز السالمية الحديث', 'BAKERY', 'مخبز حديث بخط إنتاج يومي', 'العائلات وسوق التوصيل'],
  ['مطعم الشرق التراثي', 'RESTAURANT', 'مطعم كويتي تراثي في قلب العاصمة', 'زوار المطاعم والسياحة الداخلية'],
  ['كافيه الرملة', 'CAFE', 'كافيه محلي بحضور قوي في حولي', 'الشباب ورواد المقاهي'],
  ['مصنع الخليج للأغذية', 'FACTORY', 'مصنع أغذية معتمد بشهادات سلامة', 'سلاسل التجزئة والجملة'],
  ['مطابخ الفروانية السحابية', 'CENTRAL_KITCHEN', 'مطبخ سحابي يشغّل عدة علامات', 'تطبيقات التوصيل'],
  ['مخبز الجهراء البلدي', 'BAKERY', 'مخبز بلدي بخبرة ٢٥ سنة', 'أهالي المحافظة والمناسبات'],
  ['مطعم الأحمدي البحري', 'RESTAURANT', 'مطعم بحري بخط إنتاج منفصل للحلويات', 'العائلات ومحبي المأكولات البحرية'],
];

const AREAS = ['العاصمة', 'حولي', 'الفروانية', 'الأحمدي', 'الجهراء', 'مبارك الكبير'];

const PRODUCTS: ReadonlyArray<readonly [string, string, string, number, number]> = [
  ['قرص عقيلي بالزعفران', 'حلويات', 'قرص عقيلي هش بالزعفران والهيل بوجه ذهبي.', 1.15, 4.5],
  ['مچبوس دجاج بيتي', 'وجبات', 'مچبوس دجاج بأرز بسمتي وبهارات محمّصة بالبيت.', 1.1, 3.25],
  ['سوبيا التمر', 'مشروبات', 'سوبيا كويتية باردة محلّاة بالتمر مع هيل.', 0.65, 2.25],
  ['معمول تمر خلاص', 'حلويات', 'معمول بعجينة سمن بلدي وحشوة تمر خلاص.', 0.85, 3.0],
  ['دقّوس محمّص', 'صلصات', 'دقّوس طماطم محمّص بالثوم والكزبرة.', 0.35, 1.5],
  ['خبز تنور حجري', 'مخبوزات', 'خبز تنور يومي مخبوز على حجر.', 0.2, 0.75],
  ['لقيمات بدبس التمر', 'حلويات', 'لقيمات مقرمشة بدبس تمر كويتي.', 0.55, 2.0],
  ['برجر التتبيلة البيتية', 'وجبات', 'برجر لحم طازج بتتبيلة محضّرة بالبيت.', 1.45, 4.25],
  ['حلا الديرة البارد', 'حلويات', 'حلا بارد بطبقات قشطة وبسكويت.', 0.95, 3.5],
  ['مخلل الوالدة', 'مقبلات', 'مخلل خضار بيتي بنِسَب ثابتة.', 0.4, 1.75],
  ['قهوة عربية محمّصة', 'مشروبات', 'قهوة عربية بتحميص فاتح وهيل وزعفران.', 0.7, 2.75],
  ['بلاليط بالبيض', 'وجبات', 'بلاليط كويتي بالشعيرية الحلوة والبيض.', 0.6, 2.5],
  ['غريبة الهيل', 'حلويات', 'غريبة سائحة بالهيل والسمن البلدي.', 0.5, 2.25],
  ['رقاق باللحم', 'مخبوزات', 'رقاق رقيق محشو لحم متبّل.', 0.75, 2.75],
  ['شراب الليمون بالنعناع', 'مشروبات', 'شراب ليمون طازج بالنعناع بدون مركزات.', 0.3, 1.5],
  ['كبة بالصنوبر', 'وجبات', 'كبة محشوة لحم وصنوبر مقلية طازجة.', 1.05, 3.75],
  ['عصيدة بالتمر', 'حلويات', 'عصيدة كويتية بدبس التمر والسمن.', 0.65, 2.5],
  ['صلصة الشطة البيتية', 'صلصات', 'شطة حارة بخلطة فلفل مجفف.', 0.3, 1.25],
];

const PRODUCT_STATUSES: CreatorProduct['status'][] = [
  'AVAILABLE_FOR_MATCHING', 'IN_DISCUSSION', 'TESTING', 'COMMERCIAL_NEGOTIATION',
  'CONTRACTING', 'LAUNCH_GATE', 'READY_TO_LAUNCH', 'LIVE_DROP', 'LIVE_TRIAL', 'LIVE_PERMANENT',
];

const CUSTOMER_NAMES = [
  'عبدالله ا.', 'دانة م.', 'فهد ع.', 'مريم س.', 'ناصر خ.', 'شهد ف.', 'يوسف ب.', 'لولوة ر.',
  'طلال ح.', 'نورة ج.', 'سلمان و.', 'هيا ق.', 'بدر ن.', 'العنود ط.', 'مشاري د.', 'جنى ص.',
];

const REVIEW_COMMENTS = [
  'طعمه بيتي فعلاً، مو طعم مطاعم. بنعيد الطلب.',
  'الكمية ممتازة والسعر عادل، بس التوصيل تأخر شوي.',
  'أفضل قرص عقيلي جربته برّا البيت.',
  'حلو بس أتمنى الحجم يكون أكبر شوي.',
  'البهارات مضبوطة، واضح إنها محمّصة طازج.',
  'وصل بارد ومغلّف زين. ممتاز.',
  'جربته بالديوانية وكل الربع سألوا عنه.',
  'السعر أعلى من المتوقع، لكن الجودة تستاهل.',
];

const IPS = ['10.0.0.12', '10.0.0.34', '10.0.0.51', '10.0.0.77', '10.0.0.91'];

function demoUsers(creators: CreatorProfile[], hosts: HostBusiness[]): User[] {
  const base = clone(INITIAL_USERS);
  const creatorUsers: User[] = creators.slice(1).map((creator, index) => ({
    id: creator.userId,
    name: creator.displayName,
    email: `creator${index + 2}@demo.majal.test`,
    phone: `+965 5${String(1000000 + index * 7919).slice(0, 7)}`,
    role: 'CREATOR',
    status: 'ACTIVE',
    creatorId: creator.id,
    lastLoginAt: ago(index % 9),
  }));
  const hostUsers: User[] = hosts.slice(1).map((host, index) => ({
    id: `usr_host_${index + 2}`,
    name: `مدير ${host.commercialName}`,
    email: `host${index + 2}@demo.majal.test`,
    phone: `+965 6${String(2000000 + index * 4211).slice(0, 7)}`,
    role: 'HOST_OWNER',
    status: 'ACTIVE',
    hostBusinessId: host.id,
    lastLoginAt: ago((index + 3) % 11),
  }));
  return [...base, ...creatorUsers, ...hostUsers];
}

function demoCreators(): CreatorProfile[] {
  const random = makeRandom(0x4d41);
  const base = clone(INITIAL_CREATORS);
  const template = base[0];
  const extras = CREATORS.map(([displayName, specialty, region, story], index) => {
    const unitsSold = Math.floor(random() * 2400);
    return {
      ...clone(template),
      id: `cr_demo_${index + 1}`,
      userId: `usr_creator_demo_${index + 1}`,
      displayName,
      legalName: `${displayName} — مشروع منزلي مرخّص`,
      creatorType: (['CREATOR', 'MAKER', 'BRAND_CREATOR', 'EXPERT_CREATOR'] as const)[index % 4],
      specialty,
      bio: `${specialty} — ${region}. حساب عرض ببيانات مصطنعة.`,
      region,
      completionScore: 55 + Math.floor(random() * 45),
      badges: unitsSold > 1500 ? ['SIGNATURE_CREATOR', 'PROVEN', 'LAUNCHED', 'TESTED']
        : unitsSold > 700 ? ['PROVEN', 'LAUNCHED', 'TESTED']
        : unitsSold > 150 ? ['LAUNCHED', 'TESTED'] : ['TESTED'],
      unitsSold,
      repeatPurchaseRate: Number((18 + random() * 52).toFixed(1)),
      story,
      isAvailableForMatching: index % 6 !== 0,
      hasSecretRecipe: index % 3 !== 0,
      createdAt: ago(40 + index * 11),
    } as CreatorProfile;
  });
  return [...base, ...extras];
}

function demoHosts(): HostBusiness[] {
  const base = clone(INITIAL_HOSTS);
  const template = base[0];
  const extras = HOSTS.map(([commercialName, businessType, brandPositioning, targetAudience], index) => ({
    ...clone(template),
    id: `hb_demo_${index + 1}`,
    commercialName,
    businessType,
    commercialRegistrationNo: `DEMO-ONLY-${String(1000 + index)}`,
    // Not every host is spotless. A verification board where every row is green
    // has nothing to demonstrate.
    verificationStatus: (index % 7 === 0 ? 'PENDING' : index % 5 === 0 ? 'NEEDS_ACTION' : 'VERIFIED') as HostBusiness['verificationStatus'],
    branches: Array.from({ length: 2 + (index % 3) }, (_, b) => ({
      id: `br_demo_${index + 1}_${b + 1}`,
      name: `فرع ${pick(AREAS, index + b)}`,
      area: pick(AREAS, index + b),
      isActive: !(index === 4 && b === 2),
    })),
    brandPositioning,
    targetAudience,
    contacts: [{ name: `مدير ${commercialName}`, role: 'مدير العمليات', phone: `+965 6${String(3000000 + index * 5171).slice(0, 7)}`, email: `host${index + 1}@demo.majal.test` }],
    createdAt: ago(60 + index * 9),
  } as HostBusiness));
  return [...base, ...extras];
}

function demoProducts(creators: CreatorProfile[]): CreatorProduct[] {
  const base = clone(INITIAL_PRODUCTS);
  const template = base[0];
  const extras: CreatorProduct[] = [];
  // Every creator carries a small catalogue, so a host browsing the marketplace
  // sees depth per creator rather than one item each.
  creators.slice(1).forEach((creator, creatorIndex) => {
    const count = 2 + (creatorIndex % 4);
    for (let n = 0; n < count; n += 1) {
      const index = creatorIndex * 3 + n;
      const [name, category, shortDescription, cost, price] = pick(PRODUCTS, index);
      extras.push({
        ...clone(template),
        id: `prod_demo_${creatorIndex + 1}_${n + 1}`,
        creatorId: creator.id,
        internalName: `${name} — ${creator.displayName}`,
        publicName: name,
        category,
        shortDescription,
        story: creator.story,
        status: pick(PRODUCT_STATUSES, index),
        estimatedUnitCostKwd: kwd(cost),
        targetSellingPriceKwd: kwd(price),
        estimatedPrepTimeMinutes: 15 + ((index * 7) % 50),
        isSecretRecipe: index % 3 !== 0,
        acceptsExclusivity: index % 4 !== 0,
        createdAt: ago(35 - (index % 30)),
        currentRecipeVersion: `V1.${index % 4}`,
      } as CreatorProduct);
    }
  });
  return [...base, ...extras];
}

const OPEN_GATE: Launch['gateChecklist'] = {
  hostVerified: true, requiredDocsValid: true, contractSigned: true, productionRecipeApproved: true,
  productNamePriceApproved: true, allergensCompleted: true, packagingDataCompleted: true,
  productionLocationSelected: true, branchAvailabilitySelected: true, settlementConfigApproved: true,
  photosReady: true, allRequirementsPassed: true,
};
/* One launch deliberately sits behind an unmet gate. The gate is the product's
 * whole safety argument; a demo where it never blocks anything fails to make it. */
const BLOCKED_GATE: Launch['gateChecklist'] = {
  ...OPEN_GATE, photosReady: false, settlementConfigApproved: false, allRequirementsPassed: false,
};

interface Trading {
  collaborations: Collaboration[];
  launches: Launch[];
  orders: Order[];
  accruals: Accrual[];
  reviews: Review[];
  settlements: SettlementBatch[];
  auditLogs: AuditLog[];
}

function demoTrading(products: CreatorProduct[], hosts: HostBusiness[], creators: CreatorProfile[]): Trading {
  const random = makeRandom(0x6a6d);
  const collaborations = clone(INITIAL_COLLABORATIONS);
  const launches = clone(INITIAL_LAUNCHES);
  const orders = clone(INITIAL_ORDERS);
  const accruals = clone(INITIAL_ACCRUALS);
  const reviews = clone(INITIAL_REVIEWS);
  const settlements: SettlementBatch[] = [];
  const auditLogs = clone(INITIAL_AUDIT_LOGS);

  const launchTemplate = launches[0];
  const orderTemplate = orders[0];
  const accrualTemplate = accruals[0];
  const reviewTemplate = reviews[0];
  const collabTemplate = collaborations[0];

  const tradable = products.filter(product => product.id.startsWith('prod_demo_'));
  const royaltyByCreator = new Map<string, number>();

  tradable.forEach((product, index) => {
    const host = pick(hosts.filter(h => h.verificationStatus === 'VERIFIED'), index);
    const collaborationId = `col_demo_${index + 1}`;
    const stage = (['INTEREST', 'ACCESS_GRANTED', 'TASTING_COMPLETED', 'OFFER_SENT', 'COMMERCIAL_AGREED', 'SIGNED', 'PRE_LAUNCH'] as const)[index % 7];
    collaborations.push({
      ...clone(collabTemplate),
      id: collaborationId,
      productId: product.id,
      creatorId: product.creatorId,
      hostBusinessId: host.id,
      stage,
      offerHistory: [],
      createdAt: ago(30 - (index % 28)),
      updatedAt: ago(Math.max(0, 14 - (index % 14))),
    } as Collaboration);

    // Only products that actually reached the market carry a launch, orders and
    // royalties. The rest sit at earlier stages, which is what a real pipeline
    // looks like.
    if (index % 3 !== 0) return;

    const launchId = `launch_demo_${index + 1}`;
    const blocked = index === 6;
    const unitsSold = 20 + Math.floor(random() * 480);
    const royaltyPercent = 8 + Math.floor(random() * 8);
    launches.push({
      ...clone(launchTemplate),
      id: launchId,
      collaborationId,
      productId: product.id,
      creatorId: product.creatorId,
      hostBusinessId: host.id,
      launchType: (['LIMITED_DROP', 'TRIAL_PERIOD', 'PERMANENT_MENU', 'SEASONAL'] as const)[index % 4],
      title: `إطلاق ${product.publicName} مع ${host.commercialName}`,
      sellingPriceKwd: product.targetSellingPriceKwd,
      quantityCapUnits: 100 + (index % 5) * 150,
      unitsSold,
      branches: host.branches.filter(b => b.isActive).slice(0, 2).map(b => b.id),
      startDate: ago(25 - (index % 24)),
      endDate: index % 4 === 0 ? ahead(5 + (index % 20)) : undefined,
      status: blocked ? 'SCHEDULED' : (['LIVE', 'PERMANENT', 'LIVE', 'COMPLETED', 'PAUSED'] as const)[index % 5],
      gateChecklist: blocked ? { ...BLOCKED_GATE } : { ...OPEN_GATE },
      createdAt: ago(26 - (index % 24)),
    } as Launch);

    const orderCount = 6 + Math.floor(random() * 10);
    for (let n = 0; n < orderCount; n += 1) {
      const units = 1 + Math.floor(random() * 4);
      const gross = kwd(product.targetSellingPriceKwd * units);
      const royalty = kwd(gross * (royaltyPercent / 100));
      const platformFee = kwd(gross * 0.05);
      const orderId = `ord_demo_${index + 1}_${n + 1}`;
      const refunded = (index + n) % 17 === 0;
      orders.push({
        ...clone(orderTemplate),
        id: orderId,
        launchId,
        productId: product.id,
        creatorId: product.creatorId,
        hostBusinessId: host.id,
        branchId: host.branches[0]?.id,
        acquisitionSource: (['CREATOR', 'HOST', 'MAJAL', 'UNKNOWN'] as const)[(index + n) % 4],
        customerName: pick(CUSTOMER_NAMES, index * 5 + n),
        customerPhone: undefined,
        grossAmountKwd: gross,
        unitsCount: units,
        creatorRoyaltyKwd: royalty,
        platformFeeKwd: platformFee,
        hostNetKwd: kwd(gross - royalty - platformFee),
        status: refunded ? 'REFUNDED' : (index + n) % 11 === 0 ? 'PENDING_PAYMENT' : 'COMPLETED',
        createdAt: ago(Math.max(0, 22 - (index % 20) - Math.floor(n / 2))),
      } as Order);

      if (!refunded) {
        royaltyByCreator.set(product.creatorId, kwd((royaltyByCreator.get(product.creatorId) || 0) + royalty));
        accruals.push({
          ...clone(accrualTemplate),
          id: `acc_demo_${index + 1}_${n + 1}`,
          creatorId: product.creatorId,
          collaborationId,
          orderId,
          grossSaleKwd: gross,
          royaltyRatePercent: royaltyPercent,
          accruedAmountKwd: royalty,
          settlementStatus: n < 3 ? 'PAID' : n < 6 ? 'SETTLEMENT_ELIGIBLE' : 'ACCRUED',
          settlementBatchId: n < 3 ? `set_demo_${product.creatorId}` : undefined,
          createdAt: ago(Math.max(0, 22 - (index % 20) - Math.floor(n / 2))),
        } as Accrual);
      }

      // Not every buyer reviews. Roughly one in three does, which keeps the
      // review count believable against the order count.
      if (n % 3 === 0) {
        const taste = 3 + Math.floor(random() * 3);
        reviews.push({
          ...clone(reviewTemplate),
          id: `rev_demo_${index + 1}_${n + 1}`,
          launchId,
          productId: product.id,
          creatorId: product.creatorId,
          customerName: pick(CUSTOMER_NAMES, index * 7 + n),
          tasteRating: taste,
          valueRating: Math.max(1, Math.min(5, taste - ((index + n) % 2))),
          portionRating: Math.max(1, Math.min(5, taste + ((n % 2) ? 0 : -1))),
          wouldBuyAgain: taste >= 4,
          comment: pick(REVIEW_COMMENTS, index * 3 + n),
          keepItVote: taste >= 4,
          isVerifiedPurchase: true,
          createdAt: ago(Math.max(0, 20 - (index % 18) - Math.floor(n / 2))),
        } as Review);
      }
    }
  });

  // A settlement run per earning creator, mostly closed with a couple still
  // awaiting approval — the super-admin screen needs something to approve.
  let batchIndex = 0;
  royaltyByCreator.forEach((total, creatorId) => {
    const creator = creators.find(c => c.id === creatorId);
    settlements.push({
      id: `set_demo_${creatorId}`,
      creatorId,
      periodStart: ago(30),
      periodEnd: ago(0),
      totalAccruedKwd: total,
      accrualIds: [],
      status: batchIndex % 4 === 0 ? 'PENDING_APPROVAL' : batchIndex % 4 === 1 ? 'APPROVED' : 'PAID',
      approvedBy: batchIndex % 4 === 0 ? undefined : 'usr_super_admin',
      approvedAt: batchIndex % 4 === 0 ? undefined : ago(2),
      createdAt: ago(3),
      notes: `تسوية شهرية — ${creator?.displayName || creatorId}`,
    } as unknown as SettlementBatch);
    batchIndex += 1;
  });

  const ACTIONS: AuditLog['action'][] = [
    'RECIPE_VIEWED', 'ACCESS_REQUESTED', 'ACCESS_GRANTED', 'ACCESS_REVOKED', 'OFFER_CHANGED',
    'CONTRACT_SIGNED', 'LAUNCH_PREPARED', 'LAUNCH_GATE_UPDATED', 'LAUNCH_ACTIVATED',
    'ORDER_PLACED', 'REVIEW_SUBMITTED', 'SETTLEMENT_APPROVED', 'SETTLEMENT_PAID',
    'COMPLIANCE_STATUS_CHANGED', 'DISPUTE_UPDATED', 'PRODUCT_PAUSED', 'RECIPE_EXPORTED',
  ];
  for (let index = 0; index < 180; index += 1) {
    const action = pick(ACTIONS, index);
    const creator = pick(creators, index);
    auditLogs.push({
      id: `aud_demo_${index + 1}`,
      timestamp: ago(Math.floor(index / 8)),
      actorUserId: index % 5 === 0 ? 'usr_super_admin' : creator.userId,
      actorName: index % 5 === 0 ? 'مشرف المنصة' : creator.displayName,
      actorRole: index % 5 === 0 ? 'SUPER_ADMIN' : 'CREATOR',
      action,
      entityType: action.startsWith('RECIPE') ? 'RecipeVersion' : action.startsWith('LAUNCH') ? 'Launch' : action.startsWith('SETTLEMENT') ? 'SettlementBatch' : 'Collaboration',
      entityId: `ent_demo_${index + 1}`,
      details: `${action} — سجل تدقيق مصطنع في البيئة التجريبية.`,
      ipAddress: pick(IPS, index),
    } as AuditLog);
  }

  return { collaborations, launches, orders, accruals, reviews, settlements, auditLogs };
}

function demoDisputes(orders: Order[]): DisputeCase[] {
  const disputed = orders.filter(order => order.status === 'REFUNDED').slice(0, 6);
  return disputed.map((order, index) => ({
    id: `dis_demo_${index + 1}`,
    orderId: order.id,
    launchId: order.launchId,
    creatorId: order.creatorId,
    hostBusinessId: order.hostBusinessId,
    raisedBy: index % 2 === 0 ? 'CONSUMER' : 'CREATOR',
    reason: index % 3 === 0 ? 'QUALITY' : index % 3 === 1 ? 'DELIVERY' : 'PRICING',
    description: index % 3 === 0 ? 'الطلب وصل بجودة أقل من العينة المعتمدة.'
      : index % 3 === 1 ? 'تأخر التوصيل أكثر من ساعتين عن الموعد.'
      : 'السعر المعروض يختلف عن السعر المتفق عليه في العقد.',
    status: index % 4 === 0 ? 'OPEN' : index % 4 === 1 ? 'UNDER_REVIEW' : 'RESOLVED',
    amountKwd: order.grossAmountKwd,
    createdAt: order.createdAt,
    updatedAt: order.createdAt,
  } as unknown as DisputeCase));
}

export interface DemoUniverse {
  users: User[];
  creators: CreatorProfile[];
  hosts: HostBusiness[];
  products: CreatorProduct[];
  collaborations: Collaboration[];
  launches: Launch[];
  orders: Order[];
  accruals: Accrual[];
  reviews: Review[];
  settlements: SettlementBatch[];
  disputes: DisputeCase[];
  auditLogs: AuditLog[];
}

let cached: DemoUniverse | null = null;

/** Built once per page load and shared by reference-free clones at each read site. */
export function buildDemoUniverse(): DemoUniverse {
  if (cached) return cached;
  const creators = demoCreators();
  const hosts = demoHosts();
  const products = demoProducts(creators);
  const trading = demoTrading(products, hosts, creators);
  cached = {
    users: demoUsers(creators, hosts),
    creators,
    hosts,
    products,
    collaborations: trading.collaborations,
    launches: trading.launches,
    orders: trading.orders,
    accruals: trading.accruals,
    reviews: trading.reviews,
    settlements: trading.settlements,
    disputes: demoDisputes(trading.orders),
    auditLogs: trading.auditLogs,
  };
  return cached;
}
