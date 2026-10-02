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
  Accrual, AuditLog, Challenge, Collaboration, ComplianceRequirement, Contract, CreatorProduct, CreatorProfile,
  DealDecision, DisputeCase, HostBusiness, LabBatch, Launch, OfferTerms, Order, ProductMatch, RecipeAccessGrant,
  RecipeVersion, Review, SettlementBatch, TastingSession, User,
} from '../types/majal';
import {
  INITIAL_ACCRUALS, INITIAL_AUDIT_LOGS, INITIAL_COLLABORATIONS, INITIAL_CREATORS,
  INITIAL_HOSTS, INITIAL_LAUNCHES, INITIAL_ORDERS, INITIAL_PRODUCTS, INITIAL_REVIEWS,
  INITIAL_USERS, INITIAL_RECIPE_VERSIONS, INITIAL_CHALLENGES, INITIAL_OFFERS, INITIAL_CONTRACTS,
  INITIAL_RECIPE_GRANTS, INITIAL_COMPLIANCE,
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
  ['حلويات الهيل', 'حلويات مطوّرة', 'الجهراء، الكويت', 'خلطة هيل وزعفران ثابتة من 12 سنة، ما تغيرت ولا مرة.'],
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
  ['مطابخ القبلة المركزية', 'CENTRAL_KITCHEN', 'مطبخ مركزي كويتي مرخّص', 'بيوت الكويت والدواوين'],
  ['مخبز السالمية الحديث', 'BAKERY', 'مخبز حديث بخط إنتاج يومي', 'العائلات وسوق التوصيل'],
  ['مطعم الشرق التراثي', 'RESTAURANT', 'مطعم كويتي تراثي في قلب العاصمة', 'زوار المطاعم والسياحة الداخلية'],
  ['كافيه الرملة', 'CAFE', 'كافيه محلي بحضور قوي في حولي', 'الشباب ورواد المقاهي'],
  ['مصنع الخليج للأغذية', 'FACTORY', 'مصنع أغذية معتمد بشهادات سلامة', 'سلاسل التجزئة والجملة'],
  ['مطابخ الفروانية السحابية', 'CENTRAL_KITCHEN', 'مطبخ سحابي يشغّل عدة علامات', 'تطبيقات التوصيل'],
  ['مخبز الجهراء البلدي', 'BAKERY', 'مخبز بلدي بخبرة 25 سنة', 'أهالي المحافظة والمناسبات'],
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

/* Only the dish illustrations that ship in /public are referenced; no new asset is invented. */
const DISH_BY_CATEGORY: Record<string, string> = {
  'حلويات': '/dishes/qurs-ageili.svg', 'مخبوزات': '/dishes/qurs-ageili.svg', 'مشروبات': '/dishes/sobia.svg',
  'وجبات': '/dishes/machboos.svg', 'صلصات': '/dishes/machboos.svg', 'مقبلات': '/dishes/machboos.svg',
};

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
  // The supplier portal is its own surface; without a supplier identity in the
  // switcher it was unreachable in demo. Its profile lives in demoEcosystem.ts.
  const supplierUser: User = {
    id: 'usr_supplier_demo',
    name: 'مؤسسة الخليج لمواد التغليف',
    email: 'supplier@demo.majal.test',
    phone: '+965 2245 1180',
    role: 'CONSUMER',
    accountType: 'SUPPLIER',
    supplierId: 'sup_demo_main',
    status: 'ACTIVE',
    lastLoginAt: ago(1),
  };
  return [...base, supplierUser, ...creatorUsers, ...hostUsers];
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
        mediaUrls: [DISH_BY_CATEGORY[category] || '/dishes/qurs-ageili.svg'],
        // The last item of every catalogue stays open for matching, so each
        // creator's opportunity radar has hosts to rank.
        status: n === count - 1 ? 'AVAILABLE_FOR_MATCHING' : pick(PRODUCT_STATUSES, index),
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
  // Products waiting on the admin queue (and a couple the admin paused) so the
  // "products for review / paused" counters and approval lists carry real rows.
  const QUEUE: ReadonlyArray<readonly [CreatorProduct['status'], number]> = [
    ['SUBMITTED', 0], ['SUBMITTED', 1], ['SUBMITTED', 2], ['SCREENING', 3], ['SCREENING', 4], ['PAUSED', 5], ['PAUSED', 6],
  ];
  const queued = QUEUE.map(([status, n]) => {
    const creator = creators[2 + n];
    const [name, category, shortDescription, cost, price] = pick(PRODUCTS, 40 + n * 3);
    return {
      ...clone(template),
      id: `prod_rev_${n + 1}`,
      creatorId: creator.id,
      internalName: `${name} (دفعة جديدة) — ${creator.displayName}`,
      publicName: `${name} — إصدار ${['الربيع', 'الصيف', 'الخريف', 'الشتاء'][n % 4]}`,
      category,
      shortDescription,
      story: creator.story,
      status,
      estimatedUnitCostKwd: kwd(cost),
      targetSellingPriceKwd: kwd(price),
      createdAt: ago(2 + n * 2),
      currentRecipeVersion: 'V1.0',
    } as CreatorProduct;
  });
  return [...base, ...extras, ...queued];
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

  // Every creator trades at least one product: a creator whose products all sit in
  // the pipeline would open an earnings, sales and reviews screen full of dashes.
  const regularLaunch = (index: number) => index % 3 === 0;
  const extraLaunch = new Set<number>();
  creators.forEach(creator => {
    const own = tradable.map((p, i) => [p, i] as const).filter(([p]) => p.creatorId === creator.id);
    if (own.length && !own.some(([, i]) => regularLaunch(i))) extraLaunch.add(own[0][1]);
  });
  const trades = (index: number) => regularLaunch(index) || extraLaunch.has(index);

  tradable.forEach((product, index) => {
    // Launched products (every third) rotate through the verified hosts on their
    // own counter; otherwise index % 3 === 0 only ever lands on two hosts and the
    // rest open an empty war room.
    const host = pick(hosts.filter(h => h.verificationStatus === 'VERIFIED'), regularLaunch(index) ? index / 3 : index);
    const collaborationId = `col_demo_${index + 1}`;
    // Every deal in the pipeline has at least reached tasting, so every deal room has an offer to show.
    const pipeline = (['TASTING_COMPLETED', 'OFFER_SENT', 'COMMERCIAL_AGREED', 'SIGNED', 'PRE_LAUNCH', 'OFFER_SENT', 'SIGNED'] as const)[index % 7];
    // A product that trades is past the pipeline: its deal is live (except the one
    // launch parked behind the gate, which sits at pre-launch).
    const launched = trades(index);
    const stage: Collaboration['stage'] = launched ? (regularLaunch(index) && index / 3 === 7 ? 'PRE_LAUNCH' : 'LIVE') : pipeline;
    if (product.status !== 'AVAILABLE_FOR_MATCHING') {
      const launchType = (['LIMITED_DROP', 'TRIAL_PERIOD', 'PERMANENT_MENU', 'SEASONAL'] as const)[index % 4];
      const byStage: Partial<Record<Collaboration['stage'], CreatorProduct['status']>> = {
        INTEREST: 'IN_DISCUSSION', ACCESS_GRANTED: 'IN_DISCUSSION', TASTING_COMPLETED: 'TESTING', OFFER_SENT: 'COMMERCIAL_NEGOTIATION',
        COMMERCIAL_AGREED: 'COMMERCIAL_NEGOTIATION', SIGNED: 'CONTRACTING', PRE_LAUNCH: launched ? 'LAUNCH_GATE' : 'READY_TO_LAUNCH',
        LIVE: launchType === 'PERMANENT_MENU' ? 'LIVE_PERMANENT' : launchType === 'TRIAL_PERIOD' ? 'LIVE_TRIAL' : 'LIVE_DROP',
      };
      product.status = byStage[stage] || product.status;
    }
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
    if (!trades(index)) return;

    const launchId = `launch_demo_${index + 1}`;
    // One launch per verified host opens first and live (the war room needs it);
    // the one blocked by the gate comes later in the rotation.
    const round = regularLaunch(index) ? index / 3 : 99;
    const blocked = round === 7;
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
      status: blocked ? 'SCHEDULED' : round < 6 ? (round % 2 ? 'PERMANENT' : 'LIVE') : (['LIVE', 'PERMANENT', 'LIVE', 'COMPLETED', 'PAUSED'] as const)[index % 5],
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
        branchId: (host.branches.filter(b => b.isActive).slice(0, 2)[n % 2] || host.branches[0])?.id,
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

  // Hosts still in verification cannot launch, but they can already be talking
  // to creators. Without this their lab & deal tab rendered a blank panel.
  hosts.filter(h => h.verificationStatus !== 'VERIFIED').forEach((host, hi) => {
    const open = products.filter(p => p.status === 'AVAILABLE_FOR_MATCHING' && p.id.startsWith('prod_demo_'));
    (['INTEREST', 'ACCESS_REQUESTED'] as const).forEach((stage, n) => {
      const product = pick(open, hi * 2 + n);
      if (!product) return;
      collaborations.push({
        ...clone(collabTemplate),
        id: `col_demo_${host.id}_${n + 1}`,
        productId: product.id,
        creatorId: product.creatorId,
        hostBusinessId: host.id,
        stage,
        offerHistory: [],
        currentOffer: undefined,
        contract: undefined,
        activeLaunch: undefined,
        createdAt: ago(6 - n),
        updatedAt: ago(2 - n),
      } as Collaboration);
    });
  });

  // The war room splits live sales by branch. Any live branch with no tracked
  // order read «لا يوجد Branch Attribution»; give each one a few real orders.
  launches.filter(l => l.status === 'LIVE' || l.status === 'PERMANENT').forEach((launch, li) => {
    (launch.branches || []).forEach((branchId, bi) => {
      if (orders.some(o => o.launchId === launch.id && o.branchId === branchId && o.status === 'COMPLETED')) return;
      for (let n = 0; n < 3; n += 1) {
        const units = 1 + ((li + bi + n) % 3);
        const gross = kwd(launch.sellingPriceKwd * units);
        const royalty = kwd(gross * 0.12);
        const platformFee = kwd(gross * 0.05);
        orders.push({
          ...clone(orderTemplate),
          id: `ord_demo_${launch.id}_${branchId}_${n + 1}`,
          launchId: launch.id,
          productId: launch.productId,
          creatorId: launch.creatorId,
          hostBusinessId: launch.hostBusinessId,
          branchId,
          acquisitionSource: (['CREATOR', 'HOST', 'MAJAL'] as const)[n % 3],
          customerName: pick(CUSTOMER_NAMES, li * 3 + bi + n),
          customerPhone: undefined,
          grossAmountKwd: gross,
          unitsCount: units,
          creatorRoyaltyKwd: royalty,
          platformFeeKwd: platformFee,
          hostNetKwd: kwd(gross - royalty - platformFee),
          status: 'COMPLETED',
          createdAt: ago(1 + n + bi),
        } as Order);
        accruals.push({
          ...clone(accrualTemplate),
          id: `acc_demo_${launch.id}_${branchId}_${n + 1}`,
          creatorId: launch.creatorId,
          collaborationId: launch.collaborationId,
          orderId: `ord_demo_${launch.id}_${branchId}_${n + 1}`,
          grossSaleKwd: gross,
          royaltyRatePercent: 12,
          accruedAmountKwd: royalty,
          settlementStatus: 'ACCRUED',
          settlementBatchId: undefined,
          createdAt: ago(1 + n + bi),
        } as Accrual);
      }
    });
  });

  // A settlement run per earning creator, mostly closed with a couple still
  // awaiting approval — the super-admin screen needs something to approve.
  let batchIndex = 0;
  royaltyByCreator.forEach((_total, creatorId) => {
    const creator = creators.find(c => c.id === creatorId);
    const batchId = `set_demo_${creatorId}`;
    const inBatch = accruals.filter(a => a.settlementBatchId === batchId);
    // Every fourth earner has no run yet: their first accruals stay eligible so
    // the settlements board has a real batch waiting for approval.
    if (batchIndex % 4 === 0) {
      inBatch.forEach(a => { a.settlementStatus = 'SETTLEMENT_ELIGIBLE'; a.settlementBatchId = undefined; });
      batchIndex += 1;
      return;
    }
    const status: SettlementBatch['status'] = batchIndex % 4 === 1 ? 'APPROVED' : 'PAID';
    // Keep each accrual's state in step with the batch that carries it, so the
    // creator's statement and the admin's settlement board tell the same story.
    inBatch.forEach(a => { a.settlementStatus = status === 'PAID' ? 'PAID' : 'SETTLEMENT_LOCKED'; });
    settlements.push({
      id: batchId,
      creatorId,
      creatorName: creator?.displayName || creatorId,
      totalAmountKwd: kwd(inBatch.reduce((sum, a) => sum + a.accruedAmountKwd, 0)),
      periodStart: ago(30),
      periodEnd: ago(1),
      status,
      approvedAt: ago(2),
      approvedByAdmin: 'usr_super_admin',
      paidAt: status === 'PAID' ? ago(1) : undefined,
      createdAt: ago(3),
    });
    batchIndex += 1;
  });

  // The flagship creator is the one most demos open on; give her a closed, paid run so
  // the earnings screen shows the whole cycle (paid, awaiting approval, still accruing).
  if (!settlements.some(b => b.creatorId === 'cr_main')) {
    const older = accruals.filter(a => a.creatorId === 'cr_main' && a.settlementStatus === 'ACCRUED').slice(-3);
    if (older.length) {
      const batchId = 'set_demo_cr_main_paid';
      older.forEach(a => { a.settlementStatus = 'PAID'; a.settlementBatchId = batchId; });
      settlements.push({
        id: batchId,
        creatorId: 'cr_main',
        creatorName: creators.find(c => c.id === 'cr_main')?.displayName || 'cr_main',
        totalAmountKwd: kwd(older.reduce((sum, a) => sum + a.accruedAmountKwd, 0)),
        periodStart: ago(30),
        periodEnd: ago(4),
        status: 'PAID',
        approvedAt: ago(3),
        approvedByAdmin: 'usr_super_admin',
        paidAt: ago(2),
        createdAt: ago(4),
      } as SettlementBatch);
    }
  }

  const AUDIT_DETAILS: Partial<Record<AuditLog['action'], string>> = {
    RECIPE_VIEWED: 'فتح خزنة الوصفة بمستوى إفصاح 2', ACCESS_REQUESTED: 'طلب إذن الاطلاع على وصفة منتج', ACCESS_GRANTED: 'الموافقة على إذن إفصاح محدد المدة',
    ACCESS_REVOKED: 'سحب إذن الإفصاح بعد انتهاء الغرض', OFFER_CHANGED: 'تعديل نسبة المبدع في العرض التجاري', CONTRACT_SIGNED: 'توقيع العقد التجاري إلكترونياً',
    LAUNCH_PREPARED: 'تجهيز إطلاق جديد للمراجعة', LAUNCH_GATE_UPDATED: 'تحديث بند في بوابة الامتثال قبل الإطلاق', LAUNCH_ACTIVATED: 'تفعيل الإطلاق للبيع',
    ORDER_PLACED: 'حجز طلب جديد بانتظار الدفع', REVIEW_SUBMITTED: 'تقييم جديد من عميل', SETTLEMENT_APPROVED: 'اعتماد دفعة تسوية للمبدع',
    SETTLEMENT_PAID: 'تأكيد صرف دفعة التسوية', COMPLIANCE_STATUS_CHANGED: 'تغيّر حالة وثيقة امتثال', DISPUTE_UPDATED: 'تحديث حالة نزاع مفتوح',
    PRODUCT_PAUSED: 'إيقاف منتج مؤقتاً للمراجعة', RECIPE_EXPORTED: 'تصدير نسخة مراقبة بعلامة مائية',
  };
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
      details: AUDIT_DETAILS[action] ? `${AUDIT_DETAILS[action]} — ${creator.displayName}` : `${action} — ${creator.displayName}`,
      ipAddress: pick(IPS, index),
    } as AuditLog);
  }

  return { collaborations, launches, orders, accruals, reviews, settlements, auditLogs };
}

function demoDisputes(orders: Order[]): DisputeCase[] {
  const disputed = orders.filter(order => order.status === 'REFUNDED').slice(0, 6);
  const TYPES: DisputeCase['type'][] = ['QUALITY_COMPLAINT', 'PAYMENT_DISPUTE', 'SAFETY_ALLERGEN', 'QUALITY_COMPLAINT', 'IP_RECIPE_LEAK', 'PAYMENT_DISPUTE'];
  const TEXT: Record<DisputeCase['type'], [string, string]> = {
    QUALITY_COMPLAINT: ['شكوى جودة على دفعة إطلاق', 'الطلب وصل بجودة أقل من العينة المعتمدة في المختبر.'],
    PAYMENT_DISPUTE: ['اعتراض على مبلغ الطلب', 'السعر المحصّل يختلف عن السعر المتفق عليه في العقد.'],
    SAFETY_ALLERGEN: ['بلاغ مسببات حساسية', 'العميل أفاد بعدم ذكر السمسم على الملصق.'],
    IP_RECIPE_LEAK: ['اشتباه تسريب وصفة', 'منتج مشابه ظهر في فرع غير مرخّص له بالوصفة.'],
  };
  return disputed.map((order, index): DisputeCase => {
    const type = TYPES[index % TYPES.length];
    const status: DisputeCase['status'] = index % 4 === 0 ? 'OPEN' : index % 4 === 1 ? 'UNDER_INVESTIGATION' : index % 4 === 2 ? 'RESOLVED' : 'CLOSED';
    return {
      id: `dis_demo_${index + 1}`,
      type,
      title: `${TEXT[type][0]} — ${order.id}`,
      productId: order.productId,
      creatorId: order.creatorId,
      hostBusinessId: order.hostBusinessId,
      priority: type === 'SAFETY_ALLERGEN' ? 'CRITICAL' : type === 'IP_RECIPE_LEAK' ? 'HIGH' : 'MEDIUM',
      status,
      description: TEXT[type][1],
      evidence: [`طلب ${order.id}`, 'صورة من العميل', 'سجل الدفعة من المختبر'],
      resolutionNotes: status === 'RESOLVED' || status === 'CLOSED' ? 'تم استرجاع المبلغ وإعادة فحص الدفعة.' : undefined,
      createdAt: order.createdAt,
    };
  });
}

/* The workbench: recipe versions, lab batches, deal-room decisions and host
 * challenges. Without them every deal room read «لا توجد نسخة», every lab
 * showed «ما فيه دفعات محفوظة» and only one host had a challenge board. */
const STAGE_ORDER: Collaboration['stage'][] = ['INTEREST', 'ACCESS_REQUESTED', 'ACCESS_GRANTED', 'TASTING_PLANNED', 'TASTING_COMPLETED', 'LAB_ACTIVE', 'OFFER_SENT', 'COUNTERED', 'COMMERCIAL_AGREED', 'CONTRACT_DRAFTED', 'SIGNED', 'PRE_LAUNCH', 'LIVE', 'REVIEW', 'RENEWED', 'ENDED'];
const reached = (stage: Collaboration['stage'], target: Collaboration['stage']) =>
  STAGE_ORDER.indexOf(stage) >= STAGE_ORDER.indexOf(target);

function demoWorkbench(products: CreatorProduct[], collaborations: Collaboration[], hosts: HostBusiness[], creators: CreatorProfile[]) {
  const recipeVersions: RecipeVersion[] = clone(INITIAL_RECIPE_VERSIONS);
  const template = recipeVersions[0];
  products.forEach((product, index) => {
    if (recipeVersions.some(v => v.productId === product.id && v.versionNumber === product.currentRecipeVersion)) return;
    const creator = creators.find(c => c.id === product.creatorId);
    const cost = product.estimatedUnitCostKwd || 0.8;
    recipeVersions.push({
      ...clone(template),
      id: `rv_demo_${product.id}`,
      productId: product.id,
      versionNumber: product.currentRecipeVersion || 'V1.0',
      createdById: creator?.userId || template.createdById,
      createdAt: ago(20 + (index % 15)),
      yield: 12,
      batchSize: `دفعة 12 وحدة — ${product.publicName}`,
      ingredients: [
        { name: 'المكوّن الأساسي', quantity: 1, unit: 'كجم', estimatedCostKwd: kwd(cost * 5) },
        { name: 'سمن بلدي / زيت', quantity: 250, unit: 'جم', estimatedCostKwd: kwd(cost * 2) },
        { name: `خلطة ${creator?.displayName || 'المبدع'} الخاصة`, quantity: 40, unit: 'جم', estimatedCostKwd: kwd(cost * 3), isSecretPart: true },
      ],
      preparationSteps: ['تجهيز المكوّنات بالأوزان المعتمدة.', 'التحضير حسب خطوات المبدع الموثقة.', 'فحص الجودة قبل التغليف.'],
      criticalSecrets: `نِسب خلطة ${product.publicName} وتوقيت إضافتها.`,
      equipmentNeeded: ['أفران غاز معتمدة'],
      qualityCheckpoints: ['اللون والقوام مطابقان للعينة المعتمدة', 'الوزن ضمن ±3%'],
      allergenNotes: product.category === 'مشروبات' ? 'قد يحتوي على الحليب' : 'يحتوي على الجلوتين وقد يحتوي على المكسرات',
      changeLogNote: index % 2 ? 'تعديل نسبة الملح بعد تجربة المختبر' : 'النسخة المعتمدة للإنتاج التجاري',
    });
  });

  const labBatches: LabBatch[] = [];
  const dealDecisions: DealDecision[] = [];
  const RESULTS = ['القوام ممتاز والطعم مطابق للعينة المنزلية.', 'يحتاج تقليل السكر 10٪ ليتماشى مع ذوق الفرع.', 'اللون أغمق من المطلوب — خفض حرارة الفرن 10 درجات.'];
  collaborations.forEach((col, index) => {
    const product = products.find(p => p.id === col.productId);
    const creator = creators.find(c => c.id === col.creatorId);
    const host = hosts.find(h => h.id === col.hostBusinessId);
    const version = product?.currentRecipeVersion || 'V1.0';
    if (reached(col.stage, 'TASTING_COMPLETED') || col.stage === 'ACCESS_GRANTED') {
      const count = col.stage === 'ACCESS_GRANTED' ? 1 : 2;
      for (let n = 0; n < count; n += 1) {
        const cost = kwd((product?.estimatedUnitCostKwd || 0.9) * (1.08 - n * 0.06));
        labBatches.push({
          id: `lab_demo_${col.id}_${n + 1}`,
          collaborationId: col.id,
          recipeVersion: version,
          batchDate: ago(14 - n * 5 - (index % 4)),
          yieldQuantity: 20 + n * 20,
          measuredCostKwd: cost,
          prepTimeMinutes: (product?.estimatedPrepTimeMinutes || 30) + (n ? 0 : 8),
          wastePercentage: n ? 4 : 9,
          tastingResult: RESULTS[(index + n) % RESULTS.length],
          photos: [],
          proposedChanges: n ? 'لا تغييرات — جاهزة للإنتاج.' : 'تثبيت درجة الحرارة وتقليل زمن الراحة.',
          decision: n === count - 1 && count > 1 ? 'PRODUCTION_CANDIDATE' : 'APPROVE_NEXT',
          createdAt: ago(14 - n * 5 - (index % 4)),
        });
      }
    }
    const hostName = host ? `مدير ${host.commercialName}` : 'مدير المنشأة';
    const entries: Array<[DealDecision['category'], string, boolean]> = [
      ['MILESTONE', `بدء التعاون على ${product?.publicName || 'المنتج'} مع ${creator?.displayName || 'المبدع'}.`, true],
      ['NOTE', 'تم الاتفاق على تجربة أولى بكمية 20 وحدة في المطبخ المركزي.', false],
    ];
    if (reached(col.stage, 'TASTING_COMPLETED')) entries.push(['DECISION', 'نتيجة التذوق مقبولة — ننتقل لصياغة العرض التجاري.', false]);
    if (reached(col.stage, 'OFFER_SENT')) entries.push(['RISK', 'هامش المنشأة حساس لسعر الزعفران؛ نثبت السعر لـ3 أشهر.', true]);
    entries.forEach(([category, text, byHost], n) => dealDecisions.push({
      id: `dd_demo_${col.id}_${n + 1}`,
      collaborationId: col.id,
      authorUserId: byHost ? (col.hostBusinessId === 'hb_main' ? 'usr_host_owner' : `usr_host_${hosts.findIndex(h => h.id === col.hostBusinessId) + 1}`) : (creator?.userId || 'usr_creator_main'),
      authorName: byHost ? hostName : (creator?.displayName || 'المبدع'),
      authorRole: byHost ? 'HOST_OWNER' : 'CREATOR',
      text,
      category,
      createdAt: ago(18 - n * 3 - (index % 3)),
    }));
  });

  const challenges: Challenge[] = clone(INITIAL_CHALLENGES);
  const IDEAS: Array<[string, string, string, number, number]> = [
    ['تحدي حلى رمضان 2027', 'حلى كويتي يتحمّل التوصيل ويقدَّم في الغبقات.', 'حلويات', 3.75, 1.1],
    ['تحدي فطور الدوام', 'فطيرة أو معجنات صباحية بسعر مناسب للموظفين.', 'مخبوزات', 1.25, 0.35],
    ['تحدي مشروب الصيف', 'مشروب بارد تقليدي بلمسة جديدة بدون سكر مضاف.', 'مشروبات', 1.9, 0.5],
    ['تحدي طبق الديوانية', 'طبق مشاركة للدواوين يُحضَّر بكميات.', 'وجبات', 6.5, 2.0],
  ];
  hosts.filter(h => h.id !== 'hb_main').forEach((host, index) => {
    const [title, brief, category, price, ceiling] = pick(IDEAS, index);
    challenges.push({
      id: `ch_demo_${host.id}`,
      hostBusinessId: host.id,
      title: `${title} — ${host.commercialName}`,
      brief,
      category,
      targetPriceKwd: price,
      costCeilingKwd: ceiling,
      estimatedVolumeUnits: 150 + index * 50,
      deadline: ahead(10 + index * 3),
      equipmentAvailable: ['أفران غاز معتمدة', 'غرفة تبريد وتجميد'],
      dietaryConstraints: ['حلال معتمد'],
      exclusivityPreference: index % 2 === 0,
      status: index % 3 === 2 ? 'IN_REVIEW' : 'OPEN',
      createdAt: ago(3 + index),
    });
  });
  return { recipeVersions, labBatches, dealDecisions, challenges };
}


/* The commercial paper trail: offers, contracts, recipe-access grants, matches,
 * tasting sessions and compliance documents. The seed carried these for the
 * three founding deals only, so every other deal room read «لا يوجد عرض», the
 * admin access tab listed a single grant and the match engine showed 0%. Each
 * record below follows from the stage the collaboration already sits at. */
interface Deals {
  offers: OfferTerms[];
  contracts: Contract[];
  recipeGrants: RecipeAccessGrant[];
  matches: ProductMatch[];
  tastings: TastingSession[];
  compliance: ComplianceRequirement[];
}

const SCORERS: ReadonlyArray<readonly [string, string, string]> = [
  ['مطبخك يغطي معدات الوصفة', 'هامش الربح يتجاوز الحد الأدنى', 'الوصفة تنسجم مع هوية العلامة'],
  ['السعة اليومية تكفي الطلب المتوقع', 'السعر المستهدف قريب من سلة المنشأة', 'جمهور المنشأة يطابق جمهور المنتج'],
  ['ينقص معدة واحدة يمكن استئجارها', 'الهامش مقبول بعد التفاوض', 'قرب جغرافي من فروع المنشأة'],
];

function demoDeals(
  products: CreatorProduct[], collaborations: Collaboration[], hosts: HostBusiness[], creators: CreatorProfile[], accruals: Accrual[],
): Deals {
  const random = makeRandom(0x7d31);
  const offers: OfferTerms[] = clone(INITIAL_OFFERS);
  const contracts: Contract[] = clone(INITIAL_CONTRACTS);
  const recipeGrants: RecipeAccessGrant[] = clone(INITIAL_RECIPE_GRANTS);
  const tastings: TastingSession[] = [];
  const hostUserId = (hostId: string) => hostId === 'hb_main' ? 'usr_host_owner' : `usr_host_${hosts.findIndex(h => h.id === hostId) + 1}`;

  collaborations.forEach((col, index) => {
    const product = products.find(p => p.id === col.productId);
    const creator = creators.find(c => c.id === col.creatorId);
    const host = hosts.find(h => h.id === col.hostBusinessId);
    if (!product || !creator || !host) return;
    const seeded = offers.some(o => o.collaborationId === col.id);

    if (!seeded) {
      col.currentOffer = undefined;
      col.contract = undefined;
      col.offerHistory = [];
      const rank = STAGE_ORDER.indexOf(col.stage);
      if (rank >= STAGE_ORDER.indexOf('TASTING_COMPLETED')) {
        const accrual = accruals.find(a => a.collaborationId === col.id);
        const royalty = accrual?.royaltyRatePercent ?? 9 + Math.floor(random() * 6);
        const base = (status: OfferTerms['status'], version: number, senderRole: 'HOST' | 'CREATOR', days: number, price: number, rate: number): OfferTerms => ({
          id: `off_demo_${col.id}_v${version}`,
          version,
          collaborationId: col.id,
          senderRole,
          sellingPriceKwd: kwd(price),
          creatorRoyaltyModel: 'PERCENTAGE',
          creatorRoyaltyRatePercent: rate,
          fixedAmountPerUnitKwd: 0,
          platformFeePercent: 5,
          termMonths: [6, 12, 12, 18][index % 4],
          exclusivityType: product.acceptsExclusivity && index % 2 === 0 ? 'EXCLUSIVE' : 'NON_EXCLUSIVE',
          territory: 'دولة الكويت',
          channels: index % 3 === 0 ? ['DELIVERY', 'PICKUP', 'DINE_IN'] : ['DELIVERY', 'PICKUP'],
          minimumCommitmentUnits: 100 + (index % 5) * 100,
          notes: version === 1 ? 'العرض الأول من المنشأة بعد نتيجة التذوق.' : 'تعديل على نسبة العائد مقابل التزام أعلى بالكمية.',
          status,
          createdAt: ago(days),
        });
        const history: OfferTerms[] = [];
        const price = product.targetSellingPriceKwd;
        if (col.stage === 'TASTING_COMPLETED') {
          history.push(base('PENDING', 1, 'HOST', 3, price, royalty));
        } else if (col.stage === 'OFFER_SENT') {
          history.push(base('COUNTERED', 1, 'HOST', 9, price, Math.max(5, royalty - 3)));
          history.push(base('PENDING', 2, 'CREATOR', 4, price, royalty));
        } else {
          history.push(base('COUNTERED', 1, 'HOST', 14, price, Math.max(5, royalty - 3)));
          history.push(base('ACCEPTED', 2, 'CREATOR', 8, price, royalty));
        }
        offers.push(...history);
        col.offerHistory = history;
        col.currentOffer = history[history.length - 1];
        if (rank >= STAGE_ORDER.indexOf('COMMERCIAL_AGREED')) {
          const signed = rank >= STAGE_ORDER.indexOf('SIGNED');
          const contract: Contract = {
            id: `ctr_demo_${col.id}`,
            collaborationId: col.id,
            versionNumber: 'V1.0',
            terms: col.currentOffer,
            creatorLegalName: creator.legalName,
            hostCommercialName: host.commercialName,
            contractPdfUrl: '#',
            creatorSignedAt: ago(6),
            creatorSignerIp: 'local-demo:creator',
            hostSignedAt: signed ? ago(5) : undefined,
            hostSignerIp: signed ? 'local-demo:host' : undefined,
            status: signed ? 'FULLY_SIGNED' : 'PENDING_HOST_SIGNATURE',
            createdAt: ago(7),
          };
          contracts.push(contract);
          col.contract = contract;
        }
      }
    }

    // Recipe access follows the pipeline: asked for at interest, granted from then on.
    if (!recipeGrants.some(g => g.productId === col.productId && g.hostBusinessId === col.hostBusinessId)) {
      const granted = STAGE_ORDER.indexOf(col.stage) >= STAGE_ORDER.indexOf('ACCESS_GRANTED');
      const lapsed = index % 11 === 4;
      recipeGrants.push({
        id: `grant_demo_${col.id}`,
        productId: col.productId,
        creatorId: col.creatorId,
        hostBusinessId: col.hostBusinessId,
        disclosureLevel: ([1, 2, 2, 3] as const)[index % 4],
        status: !granted ? 'REQUESTED' : lapsed ? 'REVOKED' : 'APPROVED',
        requestedByUserId: hostUserId(col.hostBusinessId),
        requestedAt: ago(24 - (index % 12)),
        grantedByUserId: granted ? creator.userId : undefined,
        grantedAt: granted ? ago(22 - (index % 12)) : undefined,
        expiresAt: granted && !lapsed ? ahead(40 + (index % 50)) : undefined,
        revokedAt: granted && lapsed ? ago(3) : undefined,
        purpose: `تجربة وإعداد ${product.publicName} في مطبخ ${host.commercialName}.`,
      });
    }

    // Tasting sessions: planned while access is fresh, scored once tasting is done.
    if (!tastings.some(t => t.collaborationId === col.id) && (col.stage === 'ACCESS_GRANTED' || STAGE_ORDER.indexOf(col.stage) >= STAGE_ORDER.indexOf('TASTING_COMPLETED'))) {
      const done = col.stage !== 'ACCESS_GRANTED';
      const names: ReadonlyArray<readonly [string, string]> = [['مدير المطبخ', 'HOST_OPERATIONS'], ['رئيس الطهاة', 'HOST_OPERATIONS'], ['مسؤول العلامة', 'HOST_OWNER']];
      const scorecards = done ? names.map(([evaluatorName, evaluatorRole], n) => {
        const score = (offset: number) => Math.max(6, Math.min(10, 7 + Math.floor(random() * 3) + offset));
        const taste = score(n === 0 ? 1 : 0);
        const parts = [taste, score(0), score(-1), score(0), score(-1), score(0), score(0)];
        return {
          evaluatorName, evaluatorRole,
          tasteScore: parts[0], appearanceScore: parts[1], differentiationScore: parts[2], productionFeasibilityScore: parts[3],
          deliveryResilienceScore: parts[4], costPotentialScore: parts[5], brandFitScore: parts[6],
          overallScore: Number((parts.reduce((a, b) => a + b, 0) / parts.length).toFixed(1)),
          notes: ['الطعم مطابق للعينة والقوام ثابت.', 'قابل للتوسع بدون تغيير الخلطة.', 'يحتاج تغليفًا يحافظ على الحرارة أثناء التوصيل.'][n],
        };
      }) : [];
      tastings.push({
        id: `tast_demo_${col.id}`,
        collaborationId: col.id,
        hostBusinessId: col.hostBusinessId,
        location: `مطبخ ${host.commercialName} — ${host.branches[0]?.area || 'العاصمة'}`,
        date: done ? ago(16 - (index % 6)) : ahead(2 + (index % 5)),
        isBlindMode: index % 2 === 0,
        scorecards,
        aggregateOverallScore: done ? Number((scorecards.reduce((a, c) => a + c.overallScore, 0) / scorecards.length).toFixed(1)) : 0,
        status: done ? 'COMPLETED' : 'PLANNED',
      });
    }
  });

  // Match engine output: every open product against two verified hosts.
  const verified = hosts.filter(h => h.verificationStatus === 'VERIFIED');
  const matches: ProductMatch[] = [];
  products.filter(p => p.status === 'AVAILABLE_FOR_MATCHING').forEach((product, pi) => {
    [0, 1].forEach(offset => {
      const host = pick(verified, pi + offset * 3 + 1);
      const fit = () => 55 + Math.floor(random() * 43);
      const parts = { equipmentFit: fit(), marginFit: fit(), brandFit: fit(), capacityFit: fit(), priceFit: fit() };
      const overall = Math.round((parts.equipmentFit + parts.marginFit + parts.brandFit + parts.capacityFit + parts.priceFit) / 5);
      const [e, m, b] = pick(SCORERS, pi + offset);
      const col = collaborations.find(c => c.productId === product.id && c.hostBusinessId === host.id);
      matches.push({
        id: `match_demo_${pi + 1}_${offset + 1}`,
        productId: product.id,
        hostBusinessId: host.id,
        matchScore: {
          overallScore: overall, ...parts,
          tastingScore: col ? 78 + Math.floor(random() * 20) : undefined,
          demandSignalScore: 50 + Math.floor(random() * 45),
          explanationAr: `${e}؛ ${m}؛ ${b}.`,
          explanationEn: 'Equipment, margin and brand fit were scored against the host profile.',
        },
        status: col ? (col.stage === 'INTEREST' ? 'INTEREST_EXPRESSED' : 'ACCESS_GRANTED') : (['DISCOVERED', 'DISCOVERED', 'INTEREST_EXPRESSED', 'DECLINED'] as const)[(pi + offset) % 4],
        createdAt: ago(1 + ((pi * 2 + offset) % 25)),
      });
    });
  });

  // Compliance documents for every host. The verified ones are in date (one is
  // Hosts that are still in verification carry the problem papers (one inside the
  // warning window, one rejected, one expired); a verified host with a lapsed paper
  // would contradict its own live launches.
  const DOCS: ReadonlyArray<readonly [ComplianceRequirement['documentType'], string, string]> = [
    ['COMMERCIAL_LICENSE', 'DEMO-LIC', 'وزارة التجارة والصناعة — الكويت'],
    ['HEALTH_PERMIT', 'DEMO-HLT', 'الهيئة العامة للغذاء والتغذية'],
    ['HYGIENE_CERT', 'DEMO-HYG', 'بلدية الكويت — إدارة الرقابة الغذائية'],
    ['FIRE_SAFETY', 'DEMO-FIR', 'الإدارة العامة للإطفاء'],
  ];
  const compliance: ComplianceRequirement[] = clone(INITIAL_COMPLIANCE);
  hosts.forEach((host, hi) => {
    DOCS.forEach(([documentType, prefix, issuingAuthority], di) => {
      if (compliance.some(c => c.hostBusinessId === host.id && c.documentType === documentType)) return;
      let expiresIn = 120 + ((hi * 37 + di * 53) % 260);
      let status: ComplianceRequirement['status'] = 'VALID';
      if (host.id === 'hb_demo_8' && di === 1) { expiresIn = 18; status = 'EXPIRING_SOON'; }
      if (host.id === 'hb_demo_6' && di === 3) status = 'REJECTED';
      if (host.id === 'hb_demo_6' && di === 2) { expiresIn = -12; status = 'EXPIRED'; }
      compliance.push({
        id: `comp_demo_${hi}_${di}`,
        hostBusinessId: host.id,
        documentType,
        documentNumber: `${prefix}-${String(40000 + hi * 311 + di * 97)}`,
        issuingAuthority,
        issueDate: ago(365 - expiresIn),
        expiryDate: expiresIn >= 0 ? ahead(expiresIn) : ago(-expiresIn),
        status,
        fileUrl: '#',
      });
    });
  });

  return { offers, contracts, recipeGrants, matches, tastings, compliance };
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
  recipeVersions: RecipeVersion[];
  labBatches: LabBatch[];
  dealDecisions: DealDecision[];
  challenges: Challenge[];
  offers: OfferTerms[];
  contracts: Contract[];
  recipeGrants: RecipeAccessGrant[];
  matches: ProductMatch[];
  tastings: TastingSession[];
  compliance: ComplianceRequirement[];
}

let cached: DemoUniverse | null = null;

/** Built once per page load and shared by reference-free clones at each read site. */
export function buildDemoUniverse(): DemoUniverse {
  if (cached) return cached;
  const creators = demoCreators();
  const hosts = demoHosts();
  const products = demoProducts(creators);
  const trading = demoTrading(products, hosts, creators);
  const deals = demoDeals(products, trading.collaborations, hosts, creators, trading.accruals);
  const workbench = demoWorkbench(products, trading.collaborations, hosts, creators);
  cached = {
    ...workbench,
    ...deals,
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
