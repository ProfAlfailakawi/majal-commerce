export type UserRole = 
  | 'CREATOR'
  | 'HOST_OWNER'
  | 'HOST_OPERATIONS'
  | 'HOST_CHEF'
  | 'HOST_FINANCE'
  | 'HOST_MARKETING'
  | 'HOST_SUPPORT'
  | 'ADMIN'
  | 'SUPER_ADMIN'
  | 'CONSUMER';

export type SurfaceType = 'PUBLIC' | 'CREATOR' | 'HOST' | 'CONSUMER' | 'ADMIN' | 'SUPER_ADMIN';

export type Language = 'ar' | 'en';

export interface User {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: UserRole;
  avatar?: string;
  creatorId?: string;
  hostBusinessId?: string;
}

export type CreatorType = 'CREATOR' | 'MAKER' | 'BRAND_CREATOR' | 'EXPERT_CREATOR';

export interface CreatorProfile {
  id: string;
  userId: string;
  displayName: string;
  legalName?: string;
  creatorType: CreatorType;
  specialty: string; // e.g. "حلويات كويتية مطورة"
  bio: string;
  region: string; // e.g. "العاصمة، الكويت"
  completionScore: number; // 0 - 100
  badges: string[]; // ['TESTED', 'LAUNCHED', 'PROVEN', 'SIGNATURE_CREATOR']
  unitsSold: number;
  repeatPurchaseRate: number; // percentage
  story: string;
  isAvailableForMatching: boolean;
  hasSecretRecipe: boolean;
  avatarUrl: string;
  createdAt: string;
}

export type VerificationStatus = 'UNVERIFIED' | 'PENDING' | 'VERIFIED' | 'NEEDS_ACTION' | 'SUSPENDED' | 'EXPIRED_DOCS';

export interface BusinessCapability {
  equipment: string[];
  cuisines: string[];
  dietary: string[];
  packaging: string[];
  storage: string[];
  batchCapacityMin: number;
  batchCapacityMax: number;
  serviceModels: ('DINE_IN' | 'PICKUP' | 'DELIVERY' | 'RETAIL' | 'CATERING')[];
  priceBand: string; // e.g. "3.5 - 12.0 KWD"
  leadTimeDays: number;
}

export interface HostBusiness {
  id: string;
  commercialName: string;
  businessType: 'RESTAURANT' | 'BAKERY' | 'CENTRAL_KITCHEN' | 'CAFE' | 'FACTORY';
  commercialRegistrationNo: string;
  verificationStatus: VerificationStatus;
  branches: { id: string; name: string; area: string; isActive: boolean }[];
  capabilities: BusinessCapability;
  brandPositioning: string;
  targetAudience: string;
  contacts: { name: string; role: string; phone: string; email: string }[];
  logoUrl: string;
  createdAt: string;
}

export type ProductStatus = 
  | 'DRAFT'
  | 'SUBMITTED'
  | 'SCREENING'
  | 'APPROVED_FOR_MARKETPLACE'
  | 'AVAILABLE_FOR_MATCHING'
  | 'IN_DISCUSSION'
  | 'TESTING'
  | 'COMMERCIAL_NEGOTIATION'
  | 'CONTRACTING'
  | 'LAUNCH_GATE'
  | 'READY_TO_LAUNCH'
  | 'LIVE_DROP'
  | 'LIVE_TRIAL'
  | 'LIVE_PERMANENT'
  | 'PAUSED'
  | 'COMPLETED';

export interface CreatorProduct {
  id: string;
  creatorId: string;
  internalName: string;
  publicName: string;
  category: string; // "حلويات" | "صلصات" | "مخبوزات" | "وجبات"
  shortDescription: string;
  story: string;
  status: ProductStatus;
  mediaUrls: string[];
  generalIngredients: string[];
  allergens: string[];
  dietaryTags: string[];
  servingSize: string;
  shelfLife: string;
  estimatedPrepTimeMinutes: number;
  estimatedUnitCostKwd: number;
  targetSellingPriceKwd: number;
  expectedEquipment: string[];
  isSecretRecipe: boolean;
  acceptsExclusivity: boolean;
  desiredPartnershipType: 'PERCENTAGE_ROYALTY' | 'FIXED_PER_UNIT' | 'HYBRID';
  createdAt: string;
  currentRecipeVersion: string; // e.g. "V1.1"
}

export interface RecipeIngredient {
  name: string;
  quantity: number;
  unit: string;
  estimatedCostKwd: number;
  isSecretPart?: boolean;
}

export interface RecipeVersion {
  id: string;
  productId: string;
  versionNumber: string; // "V1.0", "V1.1"
  createdById: string;
  createdAt: string;
  yield: number; // e.g. 10 portions
  batchSize: string;
  ingredients: RecipeIngredient[];
  preparationSteps: string[];
  criticalSecrets: string;
  equipmentNeeded: string[];
  qualityCheckpoints: string[];
  allergenNotes: string;
  changeLogNote: string;
}

export type DisclosureLevel = 0 | 1 | 2 | 3; // 0=Public, 1=General, 2=Production Deep, 3=Full Secret Recipe

export interface RecipeAccessGrant {
  id: string;
  productId: string;
  creatorId: string;
  hostBusinessId: string;
  disclosureLevel: DisclosureLevel;
  grantedByUserId: string;
  grantedAt: string;
  expiresAt: string;
  revokedAt?: string;
  purpose: string;
}

export interface MatchScoreBreakdown {
  overallScore: number; // 0 - 100
  equipmentFit: number;
  marginFit: number;
  brandFit: number;
  capacityFit: number;
  priceFit: number;
  tastingScore?: number;
  demandSignalScore?: number;
  explanationAr: string;
  explanationEn: string;
}

export interface ProductMatch {
  id: string;
  productId: string;
  hostBusinessId: string;
  matchScore: MatchScoreBreakdown;
  status: 'DISCOVERED' | 'INTEREST_EXPRESSED' | 'ACCESS_REQUESTED' | 'ACCESS_GRANTED' | 'DECLINED';
  createdAt: string;
}

export interface Challenge {
  id: string;
  hostBusinessId: string;
  title: string;
  brief: string;
  category: string;
  targetPriceKwd: number;
  costCeilingKwd: number;
  estimatedVolumeUnits: number;
  deadline: string;
  equipmentAvailable: string[];
  dietaryConstraints: string[];
  exclusivityPreference: boolean;
  status: 'OPEN' | 'IN_REVIEW' | 'CLOSED';
  createdAt: string;
}

export interface ChallengeApplication {
  id: string;
  challengeId: string;
  creatorId: string;
  productId: string;
  pitchNote: string;
  status: 'SUBMITTED' | 'SHORTLISTED' | 'REJECTED' | 'ACCEPTED';
  createdAt: string;
}

export interface TastingSession {
  id: string;
  collaborationId: string;
  hostBusinessId: string;
  location: string;
  date: string;
  isBlindMode: boolean;
  scorecards: {
    evaluatorName: string;
    evaluatorRole: string;
    tasteScore: number; // 1-10
    appearanceScore: number;
    differentiationScore: number;
    productionFeasibilityScore: number;
    deliveryResilienceScore: number;
    costPotentialScore: number;
    brandFitScore: number;
    overallScore: number;
    notes: string;
  }[];
  aggregateOverallScore: number;
  status: 'PLANNED' | 'COMPLETED' | 'CANCELLED';
}

export type CollaborationStage = 
  | 'INTEREST'
  | 'ACCESS_REQUESTED'
  | 'ACCESS_GRANTED'
  | 'TASTING_PLANNED'
  | 'TASTING_COMPLETED'
  | 'LAB_ACTIVE'
  | 'OFFER_SENT'
  | 'COUNTERED'
  | 'COMMERCIAL_AGREED'
  | 'CONTRACT_DRAFTED'
  | 'SIGNED'
  | 'PRE_LAUNCH'
  | 'LIVE'
  | 'REVIEW'
  | 'RENEWED'
  | 'ENDED'
  | 'DISPUTED';

export interface LabBatch {
  id: string;
  collaborationId: string;
  recipeVersion: string;
  batchDate: string;
  yieldQuantity: number;
  measuredCostKwd: number;
  prepTimeMinutes: number;
  wastePercentage: number;
  tastingResult: string;
  photos: string[];
  proposedChanges: string;
  decision: 'APPROVE_NEXT' | 'REJECT' | 'PRODUCTION_CANDIDATE';
  createdAt: string;
}

export interface OfferTerms {
  id: string;
  version: number;
  collaborationId: string;
  senderRole: 'HOST' | 'CREATOR';
  sellingPriceKwd: number;
  creatorRoyaltyModel: 'PERCENTAGE' | 'FIXED_PER_UNIT' | 'HYBRID';
  creatorRoyaltyRatePercent: number; // e.g. 13%
  fixedAmountPerUnitKwd: number;
  platformFeePercent: number; // e.g. 5%
  termMonths: number;
  exclusivityType: 'EXCLUSIVE' | 'NON_EXCLUSIVE';
  territory: string;
  channels: string[];
  minimumCommitmentUnits: number;
  notes: string;
  status: 'PENDING' | 'ACCEPTED' | 'COUNTERED' | 'REJECTED' | 'WITHDRAWN';
  createdAt: string;
}

export interface Contract {
  id: string;
  collaborationId: string;
  versionNumber: string;
  terms: OfferTerms;
  creatorLegalName: string;
  hostCommercialName: string;
  contractPdfUrl?: string;
  creatorSignedAt?: string;
  creatorSignerIp?: string;
  hostSignedAt?: string;
  hostSignerIp?: string;
  status: 'DRAFT' | 'PENDING_CREATOR_SIGNATURE' | 'PENDING_HOST_SIGNATURE' | 'FULLY_SIGNED' | 'EXPIRED';
  createdAt: string;
}

export interface LaunchGateChecklist {
  hostVerified: boolean;
  requiredDocsValid: boolean;
  contractSigned: boolean;
  productionRecipeApproved: boolean;
  productNamePriceApproved: boolean;
  allergensCompleted: boolean;
  packagingDataCompleted: boolean;
  productionLocationSelected: boolean;
  branchAvailabilitySelected: boolean;
  settlementConfigApproved: boolean;
  photosReady: boolean;
  allRequirementsPassed: boolean;
}

export interface Launch {
  id: string;
  collaborationId: string;
  productId: string;
  creatorId: string;
  hostBusinessId: string;
  launchType: 'LIMITED_DROP' | 'TRIAL_PERIOD' | 'PERMANENT_MENU' | 'SEASONAL';
  title: string;
  sellingPriceKwd: number;
  quantityCapUnits?: number;
  unitsSold: number;
  branches: string[];
  startDate: string;
  endDate?: string;
  status: 'SCHEDULED' | 'LIVE' | 'PAUSED' | 'COMPLETED' | 'PERMANENT';
  gateChecklist: LaunchGateChecklist;
  createdAt: string;
}

export interface Collaboration {
  id: string;
  productId: string;
  creatorId: string;
  hostBusinessId: string;
  stage: CollaborationStage;
  currentOffer?: OfferTerms;
  offerHistory: OfferTerms[];
  contract?: Contract;
  activeLaunch?: Launch;
  createdAt: string;
  updatedAt: string;
}

export interface Order {
  id: string;
  launchId: string;
  productId: string;
  creatorId: string;
  hostBusinessId: string;
  customerName: string;
  customerPhone?: string;
  grossAmountKwd: number;
  unitsCount: number;
  creatorRoyaltyKwd: number;
  platformFeeKwd: number;
  hostNetKwd: number;
  status: 'COMPLETED' | 'REFUNDED';
  createdAt: string;
}

export interface Accrual {
  id: string;
  creatorId: string;
  collaborationId: string;
  orderId: string;
  grossSaleKwd: number;
  royaltyRatePercent: number;
  accruedAmountKwd: number;
  settlementStatus: 'ACCRUED' | 'SETTLEMENT_ELIGIBLE' | 'PAID';
  settlementBatchId?: string;
  createdAt: string;
}

export interface SettlementBatch {
  id: string;
  creatorId: string;
  creatorName: string;
  totalAmountKwd: number;
  periodStart: string;
  periodEnd: string;
  status: 'CALCULATED' | 'APPROVED' | 'PAID';
  approvedAt?: string;
  approvedByAdmin?: string;
  paidAt?: string;
  createdAt: string;
}

export interface Review {
  id: string;
  launchId: string;
  productId: string;
  creatorId: string;
  customerName: string;
  tasteRating: number; // 1-5
  valueRating: number; // 1-5
  portionRating: number; // 1-5
  wouldBuyAgain: boolean;
  comment: string;
  keepItVote: boolean; // "Keep it on permanent menu?"
  isVerifiedPurchase: boolean;
  createdAt: string;
}

export interface ComplianceRequirement {
  id: string;
  hostBusinessId: string;
  documentType: 'HEALTH_PERMIT' | 'COMMERCIAL_LICENSE' | 'HYGIENE_CERT' | 'FIRE_SAFETY';
  documentNumber: string;
  issuingAuthority: string;
  issueDate: string;
  expiryDate: string;
  status: 'VALID' | 'EXPIRING_SOON' | 'EXPIRED' | 'REJECTED';
  fileUrl: string;
}

export interface DisputeCase {
  id: string;
  type: 'SAFETY_ALLERGEN' | 'IP_RECIPE_LEAK' | 'QUALITY_COMPLAINT' | 'PAYMENT_DISPUTE';
  title: string;
  productId: string;
  creatorId: string;
  hostBusinessId: string;
  priority: 'CRITICAL' | 'HIGH' | 'MEDIUM';
  status: 'OPEN' | 'UNDER_INVESTIGATION' | 'RESOLVED' | 'CLOSED';
  description: string;
  evidence: string[];
  resolutionNotes?: string;
  createdAt: string;
}

export interface AuditLog {
  id: string;
  timestamp: string;
  actorUserId: string;
  actorName: string;
  actorRole: UserRole;
  action: 
    | 'LOGIN_SENSITIVE'
    | 'ROLE_CHANGED'
    | 'RECIPE_VIEWED'
    | 'RECIPE_EXPORTED'
    | 'ACCESS_GRANTED'
    | 'OFFER_CHANGED'
    | 'CONTRACT_SIGNED'
    | 'PAYMENT_RULE_CHANGED'
    | 'SETTLEMENT_APPROVED'
    | 'PRODUCT_PAUSED'
    | 'COMPLIANCE_STATUS_CHANGED'
    | 'DISPUTE_UPDATED';
  entityType: string;
  entityId: string;
  details: string;
  ipAddress: string;
}
