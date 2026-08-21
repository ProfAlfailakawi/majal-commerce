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
    id: 'usr_consumer_demo',
    name: 'زائر مجال',
    email: 'consumer@example.test',
    phone: '+965 50000000',
    role: 'CONSUMER',
    status: 'ACTIVE'
  },
  {
    id: 'usr_super_admin',
    name: 'مشرف المنصة التجريبي',
    email: 'super-admin@example.test',
    phone: '+965 50000001',
    role: 'SUPER_ADMIN',
    status: 'ACTIVE',
    avatar: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=crop&q=80&w=200'
  },
  {
    id: 'usr_admin',
    name: 'فريق مجال — الإدارة والامتثال',
    email: 'admin@example.test',
    phone: '+965 50000002',
    role: 'ADMIN',
    status: 'ACTIVE',
    avatar: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&q=80&w=200'
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

// Clean empty collections ready for real entries
export const INITIAL_PRODUCTS: CreatorProduct[] = [];
export const INITIAL_RECIPE_VERSIONS: RecipeVersion[] = [];
export const INITIAL_RECIPE_GRANTS: RecipeAccessGrant[] = [];
export const INITIAL_MATCHES: ProductMatch[] = [];
export const INITIAL_CHALLENGES: Challenge[] = [];
export const INITIAL_TASTINGS: TastingSession[] = [];
export const INITIAL_LAB_BATCHES: LabBatch[] = [];
export const INITIAL_OFFERS: OfferTerms[] = [];
export const INITIAL_CONTRACTS: Contract[] = [];
export const INITIAL_LAUNCHES: Launch[] = [];
export const INITIAL_COLLABORATIONS: Collaboration[] = [];
export const INITIAL_ORDERS: Order[] = [];
export const INITIAL_ACCRUALS: Accrual[] = [];
export const INITIAL_SETTLEMENTS: SettlementBatch[] = [];
export const INITIAL_REVIEWS: Review[] = [];
export const INITIAL_COMPLIANCE: ComplianceRequirement[] = [];
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
