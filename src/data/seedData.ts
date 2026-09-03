import {
  User,
  CreatorProfile,
  HostBusiness,
  CreatorProduct,
  RecipeVersion,
  RecipeAccessGrant,
  ProductMatch,
  Challenge,
  TastingSession,
  Collaboration,
  OfferTerms,
  Contract,
  Launch,
  Order,
  Accrual,
  SettlementBatch,
  Review,
  ComplianceRequirement,
  DisputeCase,
  AuditLog,
  LabBatch
} from '../types/majal';

export const INITIAL_USERS: User[] = [
  {
    id: 'usr_super_admin',
    name: 'مشرف المنصة الرئيسي',
    email: 'ah_f@hotmail.com',
    phone: '+965 99999999',
    role: 'SUPER_ADMIN',
    status: 'ACTIVE',
    avatar: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=crop&q=80&w=200'
  },
  {
    id: 'usr_consumer_demo',
    name: 'زائر مجال',
    email: 'consumer@example.test',
    phone: '+965 50000000',
    role: 'CONSUMER',
    status: 'ACTIVE'
  },
  {
    // The public landing offers an "explore the admin layer" entry, and the demo role
    // switcher lists every role it finds here. Without an ADMIN account both silently
    // fall back to PUBLIC, because canAccessSurface('ADMIN') is evaluated against the
    // user that never changed. ADMIN is deliberately tenant-less: it governs compliance
    // and settlements across the platform and owns no creator or host record.
    id: 'usr_admin_ops',
    name: 'أدمن التشغيل والامتثال',
    email: 'admin@example.test',
    phone: '+965 50000001',
    role: 'ADMIN',
    status: 'ACTIVE'
  },
  {
    id: 'usr_creator_main',
    name: 'المبدع التجريبي',
    email: 'creator@example.test',
    phone: '+965 50000003',
    role: 'CREATOR',
    status: 'ACTIVE',
    creatorId: 'cr_main',
    avatar: 'https://images.unsplash.com/photo-1577219491135-ce391730fb2c?auto=format&fit=crop&q=80&w=200'
  },
  {
    id: 'usr_host_owner',
    name: 'مالك المنشأة التجريبي',
    email: 'host-owner@example.test',
    phone: '+965 50000004',
    role: 'HOST_OWNER',
    status: 'ACTIVE',
    hostBusinessId: 'hb_main',
    avatar: 'https://images.unsplash.com/photo-1560250097-0b93528c311a?auto=format&fit=crop&q=80&w=200'
  },
  ...([
    ['usr_host_operations', 'مسؤول التشغيل التجريبي', 'host-operations@example.test', '+965 50000005', 'HOST_OPERATIONS'],
    ['usr_host_chef', 'شيف المنشأة التجريبي', 'host-chef@example.test', '+965 50000006', 'HOST_CHEF'],
    ['usr_host_finance', 'مسؤول المالية التجريبي', 'host-finance@example.test', '+965 50000007', 'HOST_FINANCE'],
    ['usr_host_marketing', 'مسؤول التسويق التجريبي', 'host-marketing@example.test', '+965 50000008', 'HOST_MARKETING'],
    ['usr_host_support', 'مسؤول الدعم التجريبي', 'host-support@example.test', '+965 50000009', 'HOST_SUPPORT']
  ] as const).map(([id, name, email, phone, role]) => ({
    id,
    name,
    email,
    phone,
    role,
    status: 'ACTIVE' as const,
    hostBusinessId: 'hb_main'
  }))
];

export const INITIAL_CREATORS: CreatorProfile[] = [
  {
    id: 'cr_main',
    userId: 'usr_creator_main',
    displayName: 'الشيف المبدع',
    legalName: 'مبدع طهي معتمد',
    creatorType: 'CREATOR',
    specialty: 'مطبخ سحابي ووصفات تجارية مبتكرة',
    bio: 'حساب عرض ببيانات مصطنعة لاختبار رحلة المبدع قبل ربط الهوية الخلفية.',
    region: 'العاصمة، الكويت',
    completionScore: 100,
    badges: ['SIGNATURE_CREATOR'],
    unitsSold: 0,
    repeatPurchaseRate: 0,
    story: 'شغف ابتكار النكهات وتحويلها إلى امتياز تجاري ناجح.',
    isAvailableForMatching: true,
    hasSecretRecipe: true,
    avatarUrl: 'https://images.unsplash.com/photo-1577219491135-ce391730fb2c?auto=format&fit=crop&q=80&w=200',
    createdAt: new Date().toISOString()
  }
];

export const INITIAL_HOSTS: HostBusiness[] = [
  {
    id: 'hb_main',
    commercialName: 'المطبخ السحابي المرخص — الكويت',
    businessType: 'CENTRAL_KITCHEN',
    commercialRegistrationNo: 'DEMO-ONLY-0001',
    verificationStatus: 'VERIFIED',
    branches: [
      { id: 'br_cap', name: 'فرع العاصمة (الشرق)', area: 'العاصمة', isActive: true },
      { id: 'br_haw', name: 'فرع حولي والسالمية', area: 'حولي', isActive: true }
    ],
    capabilities: {
      equipment: ['أفران غاز معتمدة', 'صاج جريل عالي التحمل', 'قلايات أوتوماتيكية', 'غرفة تبريد وتجميد'],
      cuisines: ['برجر وسندويشات', 'مخبوزات وحلويات', 'مأكولات عصرية'],
      dietary: ['حلال معتمد', 'خيارات خالية من الجلوتين'],
      packaging: ['تغليف حراري معتمد', 'علب كرتون صديقة للبيئة'],
      storage: ['مستودع جاف', 'غرفة تجميد -18C'],
      batchCapacityMin: 10,
      batchCapacityMax: 500,
      serviceModels: ['DELIVERY', 'PICKUP'],
      priceBand: '2.5 - 8.0 KWD',
      leadTimeDays: 2
    },
    brandPositioning: 'مطابخ سحابية مرخصة بمعايير سلامة غذائية فائقة',
    targetAudience: 'عملاء منصات التوصيل السريع والمناسبات',
    contacts: [
      { name: 'مدير تشغيل تجريبي', role: 'مدير العمليات', phone: '+965 50000004', email: 'host@example.test' }
    ],
    logoUrl: 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&q=80&w=200',
    createdAt: new Date().toISOString()
  }
];

// Clean seeded collections ready for immediate interactive demo and live display
export const INITIAL_PRODUCTS: CreatorProduct[] = [
  {
    id: 'prod_date_cake',
    creatorId: 'cr_main',
    internalName: 'كيكة التمر الكويتية بالكراميل المملح',
    publicName: 'كيكة التمر الفاخرة بالكراميل والهيل',
    category: 'حلويات',
    shortDescription: 'كيكة تمر كويتية هشة بصلصة الكراميل المملحة ولمسة هيل فاخرة.',
    story: 'وصفة مبتكرة تجمع النكهة الأصيلة للتمر الكويتي الممتاز مع صوص الكراميل العصري.',
    status: 'AVAILABLE_FOR_MATCHING',
    mediaUrls: [
      'https://images.unsplash.com/photo-1578985545062-69928b1d9587?auto=format&fit=crop&q=80&w=800',
      'https://images.unsplash.com/photo-1587314168485-3236d6710814?auto=format&fit=crop&q=80&w=800'
    ],
    generalIngredients: ['تمر خلاص كويتي', 'دقيق كويتي فاخر', 'زبدة نقية', 'كراميل مملح', 'هيل ناعم'],
    allergens: ['مكسرات', 'حليب', 'جلوتين'],
    dietaryTags: ['حلال', 'بدون حافظة'],
    servingSize: 'قطعة دائرية (180 جرام)',
    shelfLife: '3 أيام في درجة حرارة الغرفة / 7 أيام تبريد',
    estimatedPrepTimeMinutes: 25,
    estimatedUnitCostKwd: 1.150,
    targetSellingPriceKwd: 4.500,
    expectedEquipment: ['أفران غاز معتمدة', 'خلاط كيك صناعي'],
    isSecretRecipe: true,
    acceptsExclusivity: true,
    desiredPartnershipType: 'PERCENTAGE_ROYALTY',
    createdAt: new Date(Date.now() - 30 * 86400000).toISOString(),
    currentRecipeVersion: 'V1.0'
  },
  {
    id: 'prod_wagyu_burger',
    creatorId: 'cr_main',
    internalName: 'وافيو برجر بالصلصة السحرية والكراميل',
    publicName: 'وافيو برجر مع صلصة الكمأة الحصرية',
    category: 'وجبات',
    shortDescription: 'شريحة لحم واجيو طازجة مع جبن شيدر معتق وخيار مخلل وصوص الكمأة الخاص.',
    story: 'ابتكار طهي عصري لتجربة برجر سحابية فاخرة تُحضر وتُسلم بأعلى جودة.',
    status: 'AVAILABLE_FOR_MATCHING',
    mediaUrls: [
      'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&q=80&w=800'
    ],
    generalIngredients: ['لحم واجيو كويتي', 'خبز بريوش طازج', 'صلصة كمأة سحرية', 'جبن شيدر معتق'],
    allergens: ['حليب', 'جلوتين', 'بيض'],
    dietaryTags: ['حلال'],
    servingSize: 'وجبة برجر سينجل (220 جرام)',
    shelfLife: 'استهلاك فوري',
    estimatedPrepTimeMinutes: 12,
    estimatedUnitCostKwd: 1.100,
    targetSellingPriceKwd: 3.250,
    expectedEquipment: ['صاج جريل عالي التحمل', 'قلايات أوتوماتيكية'],
    isSecretRecipe: true,
    acceptsExclusivity: true,
    desiredPartnershipType: 'PERCENTAGE_ROYALTY',
    createdAt: new Date(Date.now() - 20 * 86400000).toISOString(),
    currentRecipeVersion: 'V1.2'
  },
  {
    id: 'prod_mango_pistachio',
    creatorId: 'cr_main',
    internalName: 'سلاش مانجو بستاشيو كويتي',
    publicName: 'سلاش مانجو بستاشيو الانتعاش',
    category: 'صلصات',
    shortDescription: 'مشروب سلاش مانجو طبيعي منعش مع طبقة كريمة الفستق الحلبي.',
    story: 'مشروب منعش مبتكر للموسم الصيفي بمزيج الفواكه الطازجة والمكسرات الفاخرة.',
    status: 'AVAILABLE_FOR_MATCHING',
    mediaUrls: [
      'https://images.unsplash.com/photo-1551024709-8f23befc6f87?auto=format&fit=crop&q=80&w=800'
    ],
    generalIngredients: ['مانجو ألفونسو طازج', 'زبدة فستق حلبي', 'حليب مكثف', 'مكعبات ثلج'],
    allergens: ['فستق', 'حليب'],
    dietaryTags: ['حلال', 'طازج'],
    servingSize: 'كوب 450 مل',
    shelfLife: 'استهلاك فوري',
    estimatedPrepTimeMinutes: 5,
    estimatedUnitCostKwd: 0.650,
    targetSellingPriceKwd: 2.250,
    expectedEquipment: ['خلاط عصائر صناعي'],
    isSecretRecipe: false,
    acceptsExclusivity: false,
    desiredPartnershipType: 'PERCENTAGE_ROYALTY',
    createdAt: new Date(Date.now() - 10 * 86400000).toISOString(),
    currentRecipeVersion: 'V1.0'
  }
];

export const INITIAL_RECIPE_VERSIONS: RecipeVersion[] = [
  {
    id: 'rv_date_cake_1',
    productId: 'prod_date_cake',
    versionNumber: 'V1.0',
    createdById: 'usr_creator_main',
    createdAt: new Date(Date.now() - 30 * 86400000).toISOString(),
    yield: 10,
    batchSize: 'دفعة 10 قطع',
    ingredients: [
      { name: 'تمر خلاص ناعم', quantity: 1, unit: 'كجم', estimatedCostKwd: 2.500 },
      { name: 'دقيق كويتي فاخر', quantity: 500, unit: 'جم', estimatedCostKwd: 0.400 },
      { name: 'صوص الكراميل المملح الخاص', quantity: 300, unit: 'مل', estimatedCostKwd: 1.200, isSecretPart: true }
    ],
    preparationSteps: [
      'نقع التمر في ماء دافئ مع الهيل.',
      'خلط المكونات الجافة مع الزبدة والتمر المهروس.',
      'الخبز في فرن معتمد على درجة حرارة 170 مئوية لمدة 22 دقيقة.',
      'إضافة صوص الكراميل عند التقديم.'
    ],
    criticalSecrets: 'نسبة الهيل الكويتي الدقيقة مع صوص الكراميل المطبوخ بطريقة سرية.',
    equipmentNeeded: ['أفران غاز معتمدة'],
    qualityCheckpoints: ['اللون الذهبي متناسق', 'درجة الرطوبة الداخلية بين 18-22%'],
    allergenNotes: 'تحتوي على الحليب والمكسرات والجلوتين',
    changeLogNote: 'النسخة المعتمدة الأولى للإنتاج التجاري'
  }
];

export const INITIAL_RECIPE_GRANTS: RecipeAccessGrant[] = [
  {
    id: 'grant_1',
    productId: 'prod_date_cake',
    creatorId: 'cr_main',
    hostBusinessId: 'hb_main',
    disclosureLevel: 2,
    status: 'APPROVED',
    requestedByUserId: 'usr_host_owner',
    requestedAt: new Date(Date.now() - 25 * 86400000).toISOString(),
    grantedByUserId: 'usr_creator_main',
    grantedAt: new Date(Date.now() - 24 * 86400000).toISOString(),
    expiresAt: new Date(Date.now() + 60 * 86400000).toISOString(),
    purpose: 'إعداد وتشغيل المنتج في المطبخ السحابي للفرع التجريبي.'
  }
];

export const INITIAL_MATCHES: ProductMatch[] = [];

export const INITIAL_CHALLENGES: Challenge[] = [
  {
    id: 'ch_1',
    hostBusinessId: 'hb_main',
    title: 'تحدي ابتکار حلى كويتي حصري لموسم 2026',
    brief: 'نبحث عن مبدع يقدم حلى شرقي أو غربي مبتكر بنكهة كويتية مميزة قابلة للتوصيل السريع دون أن تتأثر جودتها.',
    category: 'حلويات',
    targetPriceKwd: 4.500,
    costCeilingKwd: 1.300,
    estimatedVolumeUnits: 300,
    deadline: new Date(Date.now() + 15 * 86400000).toISOString(),
    equipmentAvailable: ['أفران غاز معتمدة', 'خلاط كيك صناعي', 'غرفة تبريد وتجميد'],
    dietaryConstraints: ['حلال معتمد'],
    exclusivityPreference: true,
    status: 'OPEN',
    createdAt: new Date(Date.now() - 5 * 86400000).toISOString()
  },
  {
    id: 'ch_2',
    hostBusinessId: 'hb_main',
    title: 'تحدي البرجر السحابي المبتكر',
    brief: 'مطلوب برجر لحم بخلطة أو صلصة حصرية مميزة تناسب توصيل الطلبات خلال 20 دقيقة.',
    category: 'وجبات',
    targetPriceKwd: 3.500,
    costCeilingKwd: 1.100,
    estimatedVolumeUnits: 500,
    deadline: new Date(Date.now() + 20 * 86400000).toISOString(),
    equipmentAvailable: ['صاج جريل عالي التحمل', 'قلايات أوتوماتيكية'],
    dietaryConstraints: ['حلال معتمد'],
    exclusivityPreference: false,
    status: 'OPEN',
    createdAt: new Date(Date.now() - 8 * 86400000).toISOString()
  }
];

export const INITIAL_TASTINGS: TastingSession[] = [];
export const INITIAL_LAB_BATCHES: LabBatch[] = [];

// Every LIVE launch in this demo must be able to prove the full chain that the
// platform promises — «لا إطلاق يتجاوز الحماية أو العقد». A launch cannot exist
// without an ACCEPTED offer and a FULLY_SIGNED contract behind it, otherwise the
// Digital Twin, the Deal Room and the Super Admin counters expose a contradiction
// (LIVE launches with zero signed contracts). These records close that gap so the
// seeded story is internally consistent end to end.
const acceptedOffer = (
  id: string,
  collaborationId: string,
  sellingPriceKwd: number,
  royaltyPercent: number,
  exclusive: boolean,
  minimumCommitmentUnits: number,
  createdDaysAgo: number
): OfferTerms => ({
  id,
  version: 1,
  collaborationId,
  senderRole: 'HOST',
  sellingPriceKwd,
  creatorRoyaltyModel: 'PERCENTAGE',
  creatorRoyaltyRatePercent: royaltyPercent,
  fixedAmountPerUnitKwd: 0,
  platformFeePercent: 5,
  termMonths: 12,
  exclusivityType: exclusive ? 'EXCLUSIVE' : 'NON_EXCLUSIVE',
  territory: 'دولة الكويت',
  channels: ['DELIVERY', 'PICKUP'],
  minimumCommitmentUnits,
  notes: 'عرض تجاري معتمد للعرض التجريبي — يعكس الشروط التي بُني عليها الإطلاق.',
  status: 'ACCEPTED',
  createdAt: new Date(Date.now() - createdDaysAgo * 86400000).toISOString()
});

const signedContract = (
  id: string,
  collaborationId: string,
  terms: OfferTerms,
  signedDaysAgo: number
): Contract => ({
  id,
  collaborationId,
  versionNumber: 'V1.0',
  terms,
  creatorLegalName: 'مبدع طهي معتمد',
  hostCommercialName: 'المطبخ السحابي المرخص — الكويت',
  contractPdfUrl: '#',
  creatorSignedAt: new Date(Date.now() - signedDaysAgo * 86400000).toISOString(),
  creatorSignerIp: 'local-demo:creator',
  hostSignedAt: new Date(Date.now() - signedDaysAgo * 86400000).toISOString(),
  hostSignerIp: 'local-demo:host',
  status: 'FULLY_SIGNED',
  createdAt: new Date(Date.now() - (signedDaysAgo + 1) * 86400000).toISOString()
});

const offerDateCake = acceptedOffer('off_date_cake', 'col_date_cake', 4.5, 13, true, 100, 22);
const offerWagyu = acceptedOffer('off_wagyu_burger', 'col_wagyu_burger', 3.25, 13, false, 500, 13);
const offerMango = acceptedOffer('off_mango', 'col_mango', 2.25, 13, false, 200, 8);

const contractDateCake = signedContract('ctr_date_cake', 'col_date_cake', offerDateCake, 21);
const contractWagyu = signedContract('ctr_wagyu_burger', 'col_wagyu_burger', offerWagyu, 12);
const contractMango = signedContract('ctr_mango', 'col_mango', offerMango, 7);

export const INITIAL_OFFERS: OfferTerms[] = [offerDateCake, offerWagyu, offerMango];
export const INITIAL_CONTRACTS: Contract[] = [contractDateCake, contractWagyu, contractMango];

export const INITIAL_COLLABORATIONS: Collaboration[] = [
  {
    id: 'col_date_cake',
    productId: 'prod_date_cake',
    creatorId: 'cr_main',
    hostBusinessId: 'hb_main',
    stage: 'LIVE',
    currentOffer: offerDateCake,
    offerHistory: [offerDateCake],
    contract: contractDateCake,
    createdAt: new Date(Date.now() - 25 * 86400000).toISOString(),
    updatedAt: new Date(Date.now() - 2 * 86400000).toISOString()
  },
  {
    id: 'col_wagyu_burger',
    productId: 'prod_wagyu_burger',
    creatorId: 'cr_main',
    hostBusinessId: 'hb_main',
    stage: 'LIVE',
    currentOffer: offerWagyu,
    offerHistory: [offerWagyu],
    contract: contractWagyu,
    createdAt: new Date(Date.now() - 15 * 86400000).toISOString(),
    updatedAt: new Date(Date.now() - 1 * 86400000).toISOString()
  },
  {
    id: 'col_mango',
    productId: 'prod_mango_pistachio',
    creatorId: 'cr_main',
    hostBusinessId: 'hb_main',
    stage: 'LIVE',
    currentOffer: offerMango,
    offerHistory: [offerMango],
    contract: contractMango,
    createdAt: new Date(Date.now() - 10 * 86400000).toISOString(),
    updatedAt: new Date(Date.now() - 1 * 86400000).toISOString()
  }
];

export const INITIAL_LAUNCHES: Launch[] = [
  {
    id: 'launch_date_cake',
    collaborationId: 'col_date_cake',
    productId: 'prod_date_cake',
    creatorId: 'cr_main',
    hostBusinessId: 'hb_main',
    launchType: 'LIMITED_DROP',
    title: 'إطلاق كيكة التمر الكويتية بالكراميل والهيل',
    sellingPriceKwd: 4.500,
    quantityCapUnits: 100,
    unitsSold: 82,
    branches: ['br_cap', 'br_haw'],
    startDate: new Date(Date.now() - 5 * 86400000).toISOString(),
    endDate: new Date(Date.now() + 10 * 86400000).toISOString(),
    status: 'LIVE',
    gateChecklist: {
      hostVerified: true,
      requiredDocsValid: true,
      contractSigned: true,
      productionRecipeApproved: true,
      productNamePriceApproved: true,
      allergensCompleted: true,
      packagingDataCompleted: true,
      productionLocationSelected: true,
      branchAvailabilitySelected: true,
      settlementConfigApproved: true,
      photosReady: true,
      allRequirementsPassed: true
    },
    createdAt: new Date(Date.now() - 5 * 86400000).toISOString()
  },
  {
    id: 'launch_wagyu_burger',
    collaborationId: 'col_wagyu_burger',
    productId: 'prod_wagyu_burger',
    creatorId: 'cr_main',
    hostBusinessId: 'hb_main',
    launchType: 'PERMANENT_MENU',
    title: 'إطلاق وافيو برجر مع صلصة الكمأة الحصرية',
    sellingPriceKwd: 3.250,
    quantityCapUnits: 500,
    unitsSold: 240,
    branches: ['br_cap'],
    startDate: new Date(Date.now() - 12 * 86400000).toISOString(),
    status: 'PERMANENT',
    gateChecklist: {
      hostVerified: true,
      requiredDocsValid: true,
      contractSigned: true,
      productionRecipeApproved: true,
      productNamePriceApproved: true,
      allergensCompleted: true,
      packagingDataCompleted: true,
      productionLocationSelected: true,
      branchAvailabilitySelected: true,
      settlementConfigApproved: true,
      photosReady: true,
      allRequirementsPassed: true
    },
    createdAt: new Date(Date.now() - 12 * 86400000).toISOString()
  },
  {
    id: 'launch_mango_pistachio',
    collaborationId: 'col_mango',
    productId: 'prod_mango_pistachio',
    creatorId: 'cr_main',
    hostBusinessId: 'hb_main',
    launchType: 'LIMITED_DROP',
    title: 'إطلاق سلاش مانجو بستاشيو الانتعاش الصيفي',
    sellingPriceKwd: 2.250,
    quantityCapUnits: 200,
    unitsSold: 115,
    branches: ['br_haw'],
    startDate: new Date(Date.now() - 3 * 86400000).toISOString(),
    endDate: new Date(Date.now() + 7 * 86400000).toISOString(),
    status: 'LIVE',
    gateChecklist: {
      hostVerified: true,
      requiredDocsValid: true,
      contractSigned: true,
      productionRecipeApproved: true,
      productNamePriceApproved: true,
      allergensCompleted: true,
      packagingDataCompleted: true,
      productionLocationSelected: true,
      branchAvailabilitySelected: true,
      settlementConfigApproved: true,
      photosReady: true,
      allRequirementsPassed: true
    },
    createdAt: new Date(Date.now() - 3 * 86400000).toISOString()
  }
];

export const INITIAL_ORDERS: Order[] = [
  {
    id: 'ord_101',
    launchId: 'launch_date_cake',
    productId: 'prod_date_cake',
    creatorId: 'cr_main',
    hostBusinessId: 'hb_main',
    branchId: 'br_cap',
    acquisitionSource: 'CREATOR',
    customerName: 'محمد الكندري',
    customerPhone: '+965 90001122',
    grossAmountKwd: 4.500,
    unitsCount: 1,
    creatorRoyaltyKwd: 0.585,
    platformFeeKwd: 0.225,
    hostNetKwd: 3.690,
    status: 'COMPLETED',
    createdAt: new Date(Date.now() - 2 * 86400000).toISOString()
  },
  {
    id: 'ord_102',
    launchId: 'launch_wagyu_burger',
    productId: 'prod_wagyu_burger',
    creatorId: 'cr_main',
    hostBusinessId: 'hb_main',
    branchId: 'br_cap',
    acquisitionSource: 'MAJAL',
    customerName: 'سارة العتيبي',
    customerPhone: '+965 90003344',
    grossAmountKwd: 6.500,
    unitsCount: 2,
    creatorRoyaltyKwd: 0.845,
    platformFeeKwd: 0.325,
    hostNetKwd: 5.330,
    status: 'COMPLETED',
    createdAt: new Date(Date.now() - 1 * 86400000).toISOString()
  }
];

export const INITIAL_ACCRUALS: Accrual[] = [
  {
    id: 'acc_1',
    creatorId: 'cr_main',
    collaborationId: 'col_date_cake',
    orderId: 'ord_101',
    grossSaleKwd: 4.500,
    royaltyRatePercent: 13,
    accruedAmountKwd: 0.585,
    settlementStatus: 'SETTLEMENT_ELIGIBLE',
    createdAt: new Date(Date.now() - 2 * 86400000).toISOString()
  },
  {
    id: 'acc_2',
    creatorId: 'cr_main',
    collaborationId: 'col_wagyu_burger',
    orderId: 'ord_102',
    grossSaleKwd: 6.500,
    royaltyRatePercent: 13,
    accruedAmountKwd: 0.845,
    settlementStatus: 'SETTLEMENT_ELIGIBLE',
    createdAt: new Date(Date.now() - 1 * 86400000).toISOString()
  }
];

export const INITIAL_SETTLEMENTS: SettlementBatch[] = [];

export const INITIAL_REVIEWS: Review[] = [
  {
    id: 'rev_1',
    launchId: 'launch_date_cake',
    productId: 'prod_date_cake',
    creatorId: 'cr_main',
    customerName: 'عبدالله المطيري',
    tasteRating: 5,
    valueRating: 5,
    portionRating: 5,
    wouldBuyAgain: true,
    comment: 'كيكة خيالية وطازجة! الكراميل مع الهيل خلطة كويتية جبارة.',
    keepItVote: true,
    isVerifiedPurchase: true,
    createdAt: new Date(Date.now() - 1 * 86400000).toISOString()
  },
  {
    id: 'rev_2',
    launchId: 'launch_wagyu_burger',
    productId: 'prod_wagyu_burger',
    creatorId: 'cr_main',
    customerName: 'فاطمة العلي',
    tasteRating: 5,
    valueRating: 4,
    portionRating: 5,
    wouldBuyAgain: true,
    comment: 'البرجر ممتاز جداً والتغليف وصل بحالة ممتازة وصاخن.',
    keepItVote: true,
    isVerifiedPurchase: true,
    createdAt: new Date(Date.now() - 2 * 86400000).toISOString()
  }
];

export const INITIAL_COMPLIANCE: ComplianceRequirement[] = [
  {
    id: 'comp_1',
    hostBusinessId: 'hb_main',
    documentType: 'COMMERCIAL_LICENSE',
    documentNumber: 'KWT-BUS-88392',
    issuingAuthority: 'وزارة التجارة والصناعة — الكويت',
    issueDate: new Date(Date.now() - 180 * 86400000).toISOString(),
    expiryDate: new Date(Date.now() + 185 * 86400000).toISOString(),
    status: 'VALID',
    fileUrl: '#'
  },
  {
    id: 'comp_2',
    hostBusinessId: 'hb_main',
    documentType: 'HEALTH_PERMIT',
    documentNumber: 'KWT-HLT-49201',
    issuingAuthority: 'الهيئة العامة للغذاء والتغذية',
    issueDate: new Date(Date.now() - 120 * 86400000).toISOString(),
    expiryDate: new Date(Date.now() + 245 * 86400000).toISOString(),
    status: 'VALID',
    fileUrl: '#'
  }
];

export const INITIAL_DISPUTES: DisputeCase[] = [];

export const INITIAL_AUDIT_LOGS: AuditLog[] = [
  {
    id: `log_init_${Date.now()}`,
    timestamp: new Date().toISOString(),
    actorUserId: 'system-demo',
    actorName: 'نظام العرض المحلي',
    actorRole: 'ADMIN',
    action: 'PLATFORM_POLICY_CHANGED',
    entityType: 'DATABASE',
    entityId: 'local-demo',
    details: 'تمت تهيئة جلسة عرض محلية ببيانات مصطنعة. لا تمثل هذه السجلات حالة إنتاجية.',
    ipAddress: '127.0.0.1'
  }
];
