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
    name: 'مشرف منصة مجال',
    email: 'admin@example.test',
    phone: '+965 99999999',
    role: 'SUPER_ADMIN',
    status: 'ACTIVE',
    avatar: ''
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
    name: 'أم عبدالله',
    email: 'creator@example.test',
    phone: '+965 50000003',
    role: 'CREATOR',
    status: 'ACTIVE',
    creatorId: 'cr_main',
    avatar: ''
  },
  {
    id: 'usr_host_owner',
    name: 'مالك مطابخ الديرة',
    email: 'host-owner@example.test',
    phone: '+965 50000004',
    role: 'HOST_OWNER',
    status: 'ACTIVE',
    hostBusinessId: 'hb_main',
    avatar: ''
  },
  ...([
    ['usr_host_operations', 'مسؤول التشغيل', 'host-operations@example.test', '+965 50000005', 'HOST_OPERATIONS'],
    ['usr_host_chef', 'شيف المنشأة', 'host-chef@example.test', '+965 50000006', 'HOST_CHEF'],
    ['usr_host_finance', 'مسؤول المالية', 'host-finance@example.test', '+965 50000007', 'HOST_FINANCE'],
    ['usr_host_marketing', 'مسؤول التسويق', 'host-marketing@example.test', '+965 50000008', 'HOST_MARKETING'],
    ['usr_host_support', 'مسؤول الدعم', 'host-support@example.test', '+965 50000009', 'HOST_SUPPORT']
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
    displayName: 'أم عبدالله',
    legalName: 'صاحبة مشروع منزلي مرخّص',
    creatorType: 'CREATOR',
    specialty: 'حلويات كويتية تقليدية بوصفات عائلية',
    bio: 'حساب عرض ببيانات مصطنعة لاختبار رحلة المبدع قبل ربط الهوية الخلفية.',
    region: 'حولي، الكويت',
    completionScore: 100,
    badges: ['SIGNATURE_CREATOR'],
    unitsSold: 0,
    repeatPurchaseRate: 0,
    story: 'وصفات انتقلت في البيت من جيل لجيل، وتستحق تُطبخ بكميات تجارية بدون ما تفقد طعمها.',
    isAvailableForMatching: true,
    hasSecretRecipe: true,
    avatarUrl: '',
    createdAt: new Date().toISOString()
  }
];

export const INITIAL_HOSTS: HostBusiness[] = [
  {
    id: 'hb_main',
    commercialName: 'مطابخ الديرة المركزية', 
    businessType: 'CENTRAL_KITCHEN',
    commercialRegistrationNo: 'DEMO-ONLY-0001',
    verificationStatus: 'VERIFIED',
    branches: [
      { id: 'br_cap', name: 'فرع الشرق', area: 'العاصمة', isActive: true },
      { id: 'br_haw', name: 'فرع السالمية', area: 'حولي', isActive: true },
      { id: 'br_frw', name: 'فرع الفروانية', area: 'الفروانية', isActive: true }
    ],
    capabilities: {
      equipment: ['أفران غاز معتمدة', 'قدور مچبوس صناعية', 'قلايات أوتوماتيكية', 'غرفة تبريد وتجميد'],
      cuisines: ['حلويات كويتية', 'مخبوزات وفطائر', 'أكل كويتي بيتي'],
      dietary: ['حلال معتمد', 'خيارات خالية من الجلوتين'],
      packaging: ['تغليف حراري معتمد', 'علب كرتون صديقة للبيئة'],
      storage: ['مستودع جاف', 'غرفة تجميد -18C'],
      batchCapacityMin: 10,
      batchCapacityMax: 500,
      serviceModels: ['DELIVERY', 'PICKUP'],
      priceBand: '2.5 - 8.0 KWD',
      leadTimeDays: 2
    },
    brandPositioning: 'مطبخ مركزي كويتي مرخّص، يشغّل وصفات المبدعين بمعايير سلامة غذائية عالية',
    targetAudience: 'بيوت الكويت، الدواوين والمناسبات، ومنصات التوصيل المحلية',
    contacts: [
      { name: 'مدير تشغيل مطابخ الديرة', role: 'مدير العمليات', phone: '+965 50000004', email: 'host@example.test' }
    ],
    logoUrl: '',
    createdAt: new Date().toISOString()
  }
];

// Clean seeded collections ready for immediate interactive demo and live display
export const INITIAL_PRODUCTS: CreatorProduct[] = [
  {
    id: 'prod_qurs_ageili',
    creatorId: 'cr_main',
    internalName: 'قرص عقيلي بالزعفران والهيل',
    publicName: 'قرص عقيلي — وصفة بيت كويتية',
    category: 'حلويات',
    shortDescription: 'قرص عقيلي كويتي هش بالزعفران والهيل، بوجه ذهبي وسمسم محمّص.',
    story: 'وصفة عائلية تُخبز في البيوت الكويتية من زمان، بنسبة زعفران وهيل ما تتغير.',
    status: 'AVAILABLE_FOR_MATCHING',
    mediaUrls: ['/dishes/qurs-ageili.svg'],
    generalIngredients: ['دقيق فاخر', 'زعفران', 'هيل ناعم', 'زبدة نقية', 'سمسم', 'ماء ورد'],
    allergens: ['سمسم', 'حليب', 'جلوتين', 'بيض'],
    dietaryTags: ['حلال', 'بدون حافظة'],
    servingSize: 'قرص (180 جرام)',
    shelfLife: '3 أيام في درجة حرارة الغرفة / 7 أيام تبريد',
    estimatedPrepTimeMinutes: 25,
    estimatedUnitCostKwd: 1.150,
    targetSellingPriceKwd: 4.500,
    expectedEquipment: ['أفران غاز معتمدة', 'خلاط عجين صناعي'],
    isSecretRecipe: true,
    acceptsExclusivity: true,
    desiredPartnershipType: 'PERCENTAGE_ROYALTY',
    createdAt: new Date(Date.now() - 30 * 86400000).toISOString(),
    currentRecipeVersion: 'V1.0'
  },
  {
    id: 'prod_machboos',
    creatorId: 'cr_main',
    internalName: 'مچبوس دجاج كويتي — وجبة جاهزة',
    publicName: 'مچبوس دجاج بالبهارات البيتية',
    category: 'وجبات',
    shortDescription: 'مچبوس دجاج كويتي بأرز بسمتي وبهارات محمّصة بالبيت، مع دقّوس جانبي.',
    story: 'أكل كويتي بيتي يوصل البيوت جاهز، بنفس خلطة البهارات اللي تتحمّص كل أسبوع.',
    status: 'AVAILABLE_FOR_MATCHING',
    mediaUrls: ['/dishes/machboos.svg'],
    generalIngredients: ['دجاج طازج', 'أرز بسمتي', 'بهارات مچبوس محمّصة', 'لومي أسود', 'دقّوس طماطم'],
    allergens: [],
    dietaryTags: ['حلال'],
    servingSize: 'وجبة فردية (450 جرام)',
    shelfLife: 'يومان تبريد / 30 يومًا تجميد',
    estimatedPrepTimeMinutes: 45,
    estimatedUnitCostKwd: 1.100,
    targetSellingPriceKwd: 3.250,
    expectedEquipment: ['قدور مچبوس صناعية', 'غرفة تبريد وتجميد'],
    isSecretRecipe: true,
    acceptsExclusivity: true,
    desiredPartnershipType: 'PERCENTAGE_ROYALTY',
    createdAt: new Date(Date.now() - 20 * 86400000).toISOString(),
    currentRecipeVersion: 'V1.2'
  },
  {
    id: 'prod_sobia',
    creatorId: 'cr_main',
    internalName: 'سوبيا كويتية بالتمر',
    publicName: 'سوبيا الديرة — تمر وهيل',
    category: 'مشروبات',
    shortDescription: 'سوبيا كويتية باردة محلّاة بالتمر مع هيل، تُعبّأ طازجة يوميًا.',
    story: 'مشروب رمضان الكويتي، بنفس الطعم البيتي بدل النكهات الصناعية.',
    status: 'AVAILABLE_FOR_MATCHING',
    mediaUrls: ['/dishes/sobia.svg'],
    generalIngredients: ['خبز أسمر', 'تمر خلاص', 'هيل', 'سكر', 'ماء'],
    allergens: ['جلوتين'],
    dietaryTags: ['حلال', 'نباتي', 'طازج'],
    servingSize: 'قارورة 500 مل',
    shelfLife: '3 أيام تبريد',
    estimatedPrepTimeMinutes: 20,
    estimatedUnitCostKwd: 0.650,
    targetSellingPriceKwd: 2.250,
    expectedEquipment: ['خلاط صناعي', 'غرفة تبريد وتجميد'],
    isSecretRecipe: false,
    acceptsExclusivity: false,
    desiredPartnershipType: 'PERCENTAGE_ROYALTY',
    createdAt: new Date(Date.now() - 10 * 86400000).toISOString(),
    currentRecipeVersion: 'V1.0'
  }
];

export const INITIAL_RECIPE_VERSIONS: RecipeVersion[] = [
  {
    id: 'rv_qurs_ageili_1',
    productId: 'prod_qurs_ageili',
    versionNumber: 'V1.0',
    createdById: 'usr_creator_main',
    createdAt: new Date(Date.now() - 30 * 86400000).toISOString(),
    yield: 10,
    batchSize: 'دفعة 10 أقراص',
    ingredients: [
      { name: 'دقيق فاخر', quantity: 1, unit: 'كجم', estimatedCostKwd: 0.450 },
      { name: 'زبدة نقية', quantity: 300, unit: 'جم', estimatedCostKwd: 1.100 },
      { name: 'خلطة الزعفران والهيل وماء الورد', quantity: 40, unit: 'جم', estimatedCostKwd: 2.400, isSecretPart: true }
    ],
    preparationSteps: [
      'نقع الزعفران في ماء الورد الدافئ قبل العجن بساعة.',
      'عجن الدقيق مع الزبدة والبيض حتى تتماسك العجينة.',
      'تشكيل الأقراص ورشّ السمسم على الوجه.',
      'الخبز في فرن معتمد على 180 مئوية لمدة 20 دقيقة حتى يذهب الوجه.'
    ],
    criticalSecrets: 'نسبة الزعفران للهيل، ومدة نقعه في ماء الورد قبل العجن.',
    equipmentNeeded: ['أفران غاز معتمدة'],
    qualityCheckpoints: ['اللون الذهبي متناسق', 'درجة الرطوبة الداخلية بين 18-22%'],
    allergenNotes: 'تحتوي على الحليب والسمسم والجلوتين والبيض',
    changeLogNote: 'النسخة المعتمدة الأولى للإنتاج التجاري'
  }
];

export const INITIAL_RECIPE_GRANTS: RecipeAccessGrant[] = [
  {
    id: 'grant_1',
    productId: 'prod_qurs_ageili',
    creatorId: 'cr_main',
    hostBusinessId: 'hb_main',
    disclosureLevel: 2,
    status: 'APPROVED',
    requestedByUserId: 'usr_host_owner',
    requestedAt: new Date(Date.now() - 25 * 86400000).toISOString(),
    grantedByUserId: 'usr_creator_main',
    grantedAt: new Date(Date.now() - 24 * 86400000).toISOString(),
    expiresAt: new Date(Date.now() + 60 * 86400000).toISOString(),
    purpose: 'إعداد وتشغيل المنتج في المطبخ السحابي لفرع السالمية.'
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
    title: 'تحدي الأكل الكويتي الجاهز',
    brief: 'مطلوب طبق كويتي بيتي يتحمّل التحضير بكميات والتوصيل خلال 30 دقيقة بدون ما يفقد طعمه.',
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

const offerQursAgeili = acceptedOffer('off_qurs_ageili', 'col_qurs_ageili', 4.5, 13, true, 100, 22);
const offerMachboos = acceptedOffer('off_machboos', 'col_machboos', 3.25, 13, false, 500, 13);
const offerSobia = acceptedOffer('off_sobia', 'col_sobia', 2.25, 13, false, 200, 8);

const contractQursAgeili = signedContract('ctr_qurs_ageili', 'col_qurs_ageili', offerQursAgeili, 21);
const contractMachboos = signedContract('ctr_machboos', 'col_machboos', offerMachboos, 12);
const contractSobia = signedContract('ctr_sobia', 'col_sobia', offerSobia, 7);

export const INITIAL_OFFERS: OfferTerms[] = [offerQursAgeili, offerMachboos, offerSobia];
export const INITIAL_CONTRACTS: Contract[] = [contractQursAgeili, contractMachboos, contractSobia];

export const INITIAL_COLLABORATIONS: Collaboration[] = [
  {
    id: 'col_qurs_ageili',
    productId: 'prod_qurs_ageili',
    creatorId: 'cr_main',
    hostBusinessId: 'hb_main',
    stage: 'LIVE',
    currentOffer: offerQursAgeili,
    offerHistory: [offerQursAgeili],
    contract: contractQursAgeili,
    createdAt: new Date(Date.now() - 25 * 86400000).toISOString(),
    updatedAt: new Date(Date.now() - 2 * 86400000).toISOString()
  },
  {
    id: 'col_machboos',
    productId: 'prod_machboos',
    creatorId: 'cr_main',
    hostBusinessId: 'hb_main',
    stage: 'LIVE',
    currentOffer: offerMachboos,
    offerHistory: [offerMachboos],
    contract: contractMachboos,
    createdAt: new Date(Date.now() - 15 * 86400000).toISOString(),
    updatedAt: new Date(Date.now() - 1 * 86400000).toISOString()
  },
  {
    id: 'col_sobia',
    productId: 'prod_sobia',
    creatorId: 'cr_main',
    hostBusinessId: 'hb_main',
    stage: 'LIVE',
    currentOffer: offerSobia,
    offerHistory: [offerSobia],
    contract: contractSobia,
    createdAt: new Date(Date.now() - 10 * 86400000).toISOString(),
    updatedAt: new Date(Date.now() - 1 * 86400000).toISOString()
  }
];

export const INITIAL_LAUNCHES: Launch[] = [
  {
    id: 'launch_date_cake',
    collaborationId: 'col_qurs_ageili',
    productId: 'prod_qurs_ageili',
    creatorId: 'cr_main',
    hostBusinessId: 'hb_main',
    launchType: 'LIMITED_DROP',
    title: 'إطلاق قرص عقيلي — وصفة بيت كويتية',
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
    collaborationId: 'col_machboos',
    productId: 'prod_machboos',
    creatorId: 'cr_main',
    hostBusinessId: 'hb_main',
    launchType: 'PERMANENT_MENU',
    title: 'إطلاق مچبوس دجاج بالبهارات البيتية',
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
    collaborationId: 'col_sobia',
    productId: 'prod_sobia',
    creatorId: 'cr_main',
    hostBusinessId: 'hb_main',
    launchType: 'LIMITED_DROP',
    title: 'إطلاق سوبيا الديرة — تمر وهيل',
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
    productId: 'prod_qurs_ageili',
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
    productId: 'prod_machboos',
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
    collaborationId: 'col_qurs_ageili',
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
    collaborationId: 'col_machboos',
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
    productId: 'prod_qurs_ageili',
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
    productId: 'prod_machboos',
    creatorId: 'cr_main',
    customerName: 'فاطمة العلي',
    tasteRating: 5,
    valueRating: 4,
    portionRating: 5,
    wouldBuyAgain: true,
    comment: 'المچبوس طلع مثل البيت، والتغليف وصل حار ومرتّب.',
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
