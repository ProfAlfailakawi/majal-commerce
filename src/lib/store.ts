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
  LabBatch,
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
  DealDecision,
  PlatformPolicy,
  SurfaceType,
  Language
} from '../types/majal';

import {
  INITIAL_USERS,
  INITIAL_CREATORS,
  INITIAL_HOSTS,
  INITIAL_PRODUCTS,
  INITIAL_RECIPE_VERSIONS,
  INITIAL_RECIPE_GRANTS,
  INITIAL_MATCHES,
  INITIAL_CHALLENGES,
  INITIAL_TASTINGS,
  INITIAL_LAB_BATCHES,
  INITIAL_OFFERS,
  INITIAL_CONTRACTS,
  INITIAL_LAUNCHES,
  INITIAL_COLLABORATIONS,
  INITIAL_ORDERS,
  INITIAL_ACCRUALS,
  INITIAL_SETTLEMENTS,
  INITIAL_REVIEWS,
  INITIAL_COMPLIANCE,
  INITIAL_DISPUTES,
  INITIAL_AUDIT_LOGS
} from '../data/seedData';

import { canAccessSurface, hasPermission } from './permissions';
import { DEMO_STORAGE_KEY, IS_DEMO_MODE } from './runtime';
import { domainClient, DomainApiError } from './domainClient';

export class Store {
  private static instance: Store;

  public activeSurface: SurfaceType = 'PUBLIC';
  public activeUser: User = INITIAL_USERS.find(user => user.role === 'CONSUMER') ?? INITIAL_USERS[0];
  public language: Language = 'ar';
  public guardNotice: { message: string; occurredAt: string } | null = null;

  public users: User[] = [...INITIAL_USERS];
  public creators: CreatorProfile[] = [...INITIAL_CREATORS];
  public hosts: HostBusiness[] = [...INITIAL_HOSTS];
  public products: CreatorProduct[] = [...INITIAL_PRODUCTS];
  public recipeVersions: RecipeVersion[] = [...INITIAL_RECIPE_VERSIONS];
  public recipeGrants: RecipeAccessGrant[] = [...INITIAL_RECIPE_GRANTS];
  public matches: ProductMatch[] = [...INITIAL_MATCHES];
  public challenges: Challenge[] = [...INITIAL_CHALLENGES];
  public tastings: TastingSession[] = [...INITIAL_TASTINGS];
  public labBatches: LabBatch[] = [...INITIAL_LAB_BATCHES];
  public offers: OfferTerms[] = [...INITIAL_OFFERS];
  public contracts: Contract[] = [...INITIAL_CONTRACTS];
  public launches: Launch[] = [...INITIAL_LAUNCHES];
  public collaborations: Collaboration[] = [...INITIAL_COLLABORATIONS];
  public orders: Order[] = [...INITIAL_ORDERS];
  public accruals: Accrual[] = [...INITIAL_ACCRUALS];
  public settlements: SettlementBatch[] = [...INITIAL_SETTLEMENTS];
  public reviews: Review[] = [...INITIAL_REVIEWS];
  public compliance: ComplianceRequirement[] = [...INITIAL_COMPLIANCE];
  public disputes: DisputeCase[] = [...INITIAL_DISPUTES];
  public auditLogs: AuditLog[] = [...INITIAL_AUDIT_LOGS];
  public dealDecisions: DealDecision[] = [];
  public policy: PlatformPolicy = {
    platformFeePercent: 5,
    recipeGrantDays: 90,
    maxOrderUnits: 20,
    complianceWarningDays: 30,
    strongMatchThreshold: 85,
    settlementCycleDays: 30,
    updatedAt: new Date().toISOString(),
    updatedBy: 'system-default'
  };

  private listeners: (() => void)[] = [];

  private constructor() {
    this.purgeLegacyBrowserState();
    this.loadFromLocalStorage();
    this.refreshTemporalStates();
  }

  private clearSeedDomainData() {
    // Keep baseline data populated so admin dashboards and metrics always show full ecosystem state
  }

  public static getInstance(): Store {
    if (!Store.instance) {
      Store.instance = new Store();
    }
    return Store.instance;
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  private notify() {
    this.refreshTemporalStates();
    this.saveToLocalStorage();
    this.listeners.forEach(l => l());
  }

  private refreshTemporalStates() {
    const now = Date.now();
    const soon = this.policy.complianceWarningDays * 86400000;
    this.recipeGrants.forEach(grant => {
      if (grant.status === 'APPROVED' && grant.expiresAt && new Date(grant.expiresAt).getTime() <= now) {
        grant.status = 'EXPIRED';
      }
    });
    this.compliance.forEach(doc => {
      const expiry = new Date(doc.expiryDate).getTime();
      if (expiry <= now) doc.status = 'EXPIRED';
      else if (expiry - now <= soon && doc.status !== 'REJECTED') doc.status = 'EXPIRING_SOON';
      else if (doc.status !== 'REJECTED') doc.status = 'VALID';
    });
    this.hosts.forEach(host => {
      const docs = this.compliance.filter(doc => doc.hostBusinessId === host.id);
      if (docs.some(doc => doc.status === 'EXPIRED')) host.verificationStatus = 'EXPIRED_DOCS';
      else if (host.verificationStatus === 'EXPIRED_DOCS' && docs.length && docs.every(doc => ['VALID', 'EXPIRING_SOON'].includes(doc.status))) host.verificationStatus = 'VERIFIED';
    });
  }

  private saveToLocalStorage() {
    if (!IS_DEMO_MODE || typeof window === 'undefined') return;
    try {
      const state = {
        schemaVersion: 6,
        activeUserId: this.activeUser.id,
        activeSurface: this.activeSurface,
        language: this.language
      };
      sessionStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Ignore storage errors
    }
  }

  private loadFromLocalStorage() {
    if (!IS_DEMO_MODE || typeof window === 'undefined') return;
    try {
      const raw = sessionStorage.getItem(DEMO_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.schemaVersion !== 6) return;
        // Only non-sensitive UI context is restored. Roles remain code-owned and
        // recipes, PII, contracts, orders, ledgers, grants and audit events never
        // enter browser storage.
        if (parsed.language === 'ar' || parsed.language === 'en') this.language = parsed.language;
        const restoredUser = this.users.find(user => user.id === parsed.activeUserId && user.status !== 'SUSPENDED');
        if (restoredUser) this.activeUser = restoredUser;
        if (parsed.activeSurface && canAccessSurface(this.activeUser, parsed.activeSurface)) {
          this.activeSurface = parsed.activeSurface;
        }
      }
    } catch {
      // Ignore load errors
    }
  }

  private purgeLegacyBrowserState() {
    if (typeof window === 'undefined') return;
    ['majal_platform_state_v4', 'majal_platform_state_v5_live'].forEach(key => localStorage.removeItem(key));
  }

  public resetToLiveProduction() {
    if (!IS_DEMO_MODE) return false;
    this.users = [...INITIAL_USERS];
    this.creators = [...INITIAL_CREATORS];
    this.hosts = [...INITIAL_HOSTS];
    this.products = [];
    this.recipeVersions = [];
    this.recipeGrants = [];
    this.matches = [];
    this.challenges = [];
    this.tastings = [];
    this.labBatches = [];
    this.offers = [];
    this.contracts = [];
    this.launches = [];
    this.collaborations = [];
    this.orders = [];
    this.accruals = [];
    this.settlements = [];
    this.reviews = [];
    this.compliance = [];
    this.disputes = [];
    this.auditLogs = [...INITIAL_AUDIT_LOGS];
    this.dealDecisions = [];
    this.activeUser = INITIAL_USERS.find(user => user.role === 'CONSUMER') ?? INITIAL_USERS[0];
    this.activeSurface = 'PUBLIC';
    sessionStorage.removeItem(DEMO_STORAGE_KEY);
    this.saveToLocalStorage();
    this.notify();
    return true;
  }

  public setSurface(surface: SurfaceType) {
    this.activeSurface = surface;
    this.notify();
  }

  public setUser(user: User) {
    if (!IS_DEMO_MODE) return false;
    let trustedDemoUser = this.users.find(candidate => candidate.id === user.id);
    if (!trustedDemoUser || trustedDemoUser.status === 'SUSPENDED') return false;

    if (trustedDemoUser.role === 'CREATOR' && !trustedDemoUser.creatorId) {
      let profile = this.creators.find(c => c.userId === trustedDemoUser.id);
      if (!profile) {
        profile = {
          id: 'cr_' + Math.random().toString(36).substr(2, 9),
          userId: trustedDemoUser.id,
          displayName: trustedDemoUser.name,
          legalName: trustedDemoUser.name,
          creatorType: 'CREATOR',
          specialty: 'ابتكار الوصفات والمنتجات العصرية',
          bio: 'مبدع معتمد في منصة مجال للابتكار والإنتاج التجاري.',
          region: 'العاصمة، الكويت',
          completionScore: 100,
          badges: ['SIGNATURE_CREATOR'],
          unitsSold: 0,
          repeatPurchaseRate: 0,
          story: 'شغف ابتكار الأطباق والمنتجات المبتكرة.',
          isAvailableForMatching: true,
          hasSecretRecipe: true,
          avatarUrl: trustedDemoUser.avatar || 'https://images.unsplash.com/photo-1577219491135-ce391730fb2c?auto=format&fit=crop&q=80&w=200',
          createdAt: new Date().toISOString()
        };
        this.creators.push(profile);
      }
      trustedDemoUser = { ...trustedDemoUser, creatorId: profile.id };
      const idx = this.users.findIndex(u => u.id === trustedDemoUser.id);
      if (idx >= 0) this.users[idx] = trustedDemoUser;
    } else if (trustedDemoUser.role.startsWith('HOST_') && !trustedDemoUser.hostBusinessId) {
      if (this.hosts.length > 0) {
        trustedDemoUser = { ...trustedDemoUser, hostBusinessId: this.hosts[0].id };
        const idx = this.users.findIndex(u => u.id === trustedDemoUser.id);
        if (idx >= 0) this.users[idx] = trustedDemoUser;
      }
    }

    this.activeUser = trustedDemoUser;
    this.notify();
    return true;
  }

  public setAuthenticatedUser(user: User) {
    if (user.status === 'SUSPENDED' || user.status === 'INVITED') return false;
    
    let updatedUser = { ...user };
    if (updatedUser.role === 'CREATOR' && !updatedUser.creatorId) {
      let profile = this.creators.find(c => c.userId === updatedUser.id || c.id === 'cr_main');
      if (!profile) {
        profile = {
          id: 'cr_' + Math.random().toString(36).substr(2, 9),
          userId: updatedUser.id,
          displayName: updatedUser.name,
          legalName: updatedUser.name,
          creatorType: 'CREATOR',
          specialty: 'ابتكار الوصفات والمنتجات العصرية',
          bio: 'مبدع معتمد في منصة مجال للابتكار والإنتاج التجاري.',
          region: 'العاصمة، الكويت',
          completionScore: 100,
          badges: ['SIGNATURE_CREATOR'],
          unitsSold: 0,
          repeatPurchaseRate: 0,
          story: 'شغف ابتكار الأطباق والمنتجات المبتكرة.',
          isAvailableForMatching: true,
          hasSecretRecipe: true,
          avatarUrl: updatedUser.avatar || 'https://images.unsplash.com/photo-1577219491135-ce391730fb2c?auto=format&fit=crop&q=80&w=200',
          createdAt: new Date().toISOString()
        };
        this.creators.push(profile);
      }
      updatedUser.creatorId = profile.id;
    } else if (updatedUser.role.startsWith('HOST_') && !updatedUser.hostBusinessId) {
      if (this.hosts.length > 0) {
        updatedUser.hostBusinessId = this.hosts[0].id;
      }
    }

    const index = this.users.findIndex(candidate => candidate.id === updatedUser.id);
    if (index >= 0) this.users[index] = { ...updatedUser };
    else this.users = [updatedUser, ...this.users.filter(candidate => candidate.email !== updatedUser.email)];
    this.activeUser = updatedUser;
    
    if (updatedUser.role === 'SUPER_ADMIN') this.activeSurface = 'SUPER_ADMIN';
    else if (updatedUser.role === 'ADMIN') this.activeSurface = 'ADMIN';
    else if (updatedUser.role === 'CREATOR') this.activeSurface = 'CREATOR';
    else if (updatedUser.role.startsWith('HOST_')) this.activeSurface = 'HOST';
    else this.activeSurface = 'CONSUMER';

    this.notify();
    return true;
  }

  public clearAuthenticatedUser() {
    if (IS_DEMO_MODE) return false;
    this.activeUser = INITIAL_USERS.find(user => user.role === 'CONSUMER') ?? INITIAL_USERS[0];
    this.activeSurface = 'PUBLIC';
    this.notify();
    return true;
  }

  public setLanguage(lang: Language) {
    this.language = lang;
    this.notify();
  }

  public addAuditLog(action: AuditLog['action'], entityType: string, entityId: string, details: string) {
    if (!IS_DEMO_MODE) return this.fail('سجل التدقيق الإنتاجي يُكتب من الخادم فقط، وليس من المتصفح.');
    const log: AuditLog = {
      id: `aud_${Date.now()}_${Math.floor(Math.random()*1000)}`,
      timestamp: new Date().toISOString(),
      actorUserId: this.activeUser.id,
      actorName: this.activeUser.name,
      actorRole: this.activeUser.role,
      action,
      entityType,
      entityId,
      details,
      ipAddress: IS_DEMO_MODE ? 'local-demo-session' : 'not-collected-client-side'
    };
    this.auditLogs.unshift(log);
    this.notify();
  }

  public changeUserRole(userId: string, role: User['role']) {
    if (!IS_DEMO_MODE) return this.fail('تغيير الأدوار الإنتاجي يحتاج API خادمية ومراجعة صلاحية السوبر أدمن.');
    if (this.activeUser.role !== 'SUPER_ADMIN') return false;
    const target = this.users.find(u => u.id === userId);
    if (!target || target.id === this.activeUser.id) return false;
    const oldRole = target.role;
    target.role = role;
    this.addAuditLog('ROLE_CHANGED', 'USER', target.id, `تغيير الدور من ${oldRole} إلى ${role}`);
    this.notify();
    return true;
  }

  public setUserStatus(userId: string, status: 'ACTIVE' | 'SUSPENDED' | 'INVITED') {
    if (!IS_DEMO_MODE) return this.fail('حالة الحساب الإنتاجية لا تتغير داخل المتصفح.');
    if (this.activeUser.role !== 'SUPER_ADMIN') return false;
    const target = this.users.find(u => u.id === userId);
    if (!target || target.id === this.activeUser.id) return false;
    target.status = status;
    this.addAuditLog('USER_STATUS_CHANGED', 'USER', target.id, `تغيير حالة الحساب إلى ${status}`);
    this.notify();
    return true;
  }

  public pauseProduct(productId: string, reason: string) {
    if (!IS_DEMO_MODE) return this.fail('إيقاف المنتج الإنتاجي يحتاج عملية خادمية مسجلة.');
    if (!hasPermission(this.activeUser, 'PAUSE_PRODUCT')) return this.fail('لا تملك صلاحية إيقاف المنتجات.');
    const cleanReason = reason.trim();
    if (cleanReason.length < 5) return this.fail('سبب الإيقاف مطلوب ويجب أن يكون واضحًا.');
    const product = this.products.find(p => p.id === productId);
    if (!product) return this.fail('المنتج غير موجود.');
    product.status = 'PAUSED';
    this.launches.filter(l => l.productId === productId && l.status === 'LIVE').forEach(l => { l.status = 'PAUSED'; });
    this.addAuditLog('PRODUCT_PAUSED', 'PRODUCT', productId, cleanReason);
    this.notify();
    return true;
  }

  public resumeProduct(productId: string) {
    if (!IS_DEMO_MODE) return this.fail('إعادة المنتج الإنتاجية تحتاج إعادة فحص Launch Gate على الخادم.');
    if (!hasPermission(this.activeUser, 'PAUSE_PRODUCT')) return this.fail('لا تملك صلاحية إعادة المنتجات.');
    const product = this.products.find(p => p.id === productId);
    if (!product) return this.fail('المنتج غير موجود.');
    const launch = this.launches.find(l => l.productId === productId && l.status === 'PAUSED');
    if (!launch) {
      product.status = 'AVAILABLE_FOR_MATCHING';
      this.addAuditLog('PRODUCT_RESUMED', 'PRODUCT', productId, 'إعادة المنتج إلى المطابقة بعد المراجعة؛ لا يوجد إطلاق موقوف مرتبط به.');
      this.notify();
      return true;
    }
    const col = this.collaborations.find(c => c.id === launch.collaborationId);
    if (!col) return this.fail('التعاون المرتبط بالإطلاق غير موجود.');
    launch.gateChecklist = this.getLaunchGate(col.id)!;
    if (!launch.gateChecklist.allRequirementsPassed) {
      launch.status = 'SCHEDULED';
      col.stage = 'PRE_LAUNCH';
      product.status = 'LAUNCH_GATE';
      this.addAuditLog('PRODUCT_RESUMED', 'PRODUCT', productId, 'انتهى الإيقاف الإداري لكن Launch Gate تحتاج إعادة استكمال قبل العودة LIVE.');
      this.notify();
      return true;
    }
    launch.status = 'LIVE';
    col.stage = 'LIVE';
    product.status = launch.launchType === 'PERMANENT_MENU' ? 'LIVE_PERMANENT' : launch.launchType === 'LIMITED_DROP' ? 'LIVE_DROP' : 'LIVE_TRIAL';
    this.addAuditLog('PRODUCT_RESUMED', 'PRODUCT', productId, 'إعادة المنتج إلى LIVE بعد إعادة فحص Launch Gate.');
    this.notify();
    return true;
  }

  private isCreatorFor(creatorId: string) {
    return this.activeUser.role === 'CREATOR' && this.activeUser.creatorId === creatorId;
  }

  private isHostMemberFor(hostBusinessId: string) {
    return this.activeUser.role.startsWith('HOST_') && this.activeUser.hostBusinessId === hostBusinessId;
  }

  private canManageHostCommercials(hostBusinessId: string) {
    return this.isHostMemberFor(hostBusinessId) && ['HOST_OWNER', 'HOST_OPERATIONS'].includes(this.activeUser.role);
  }

  private fail(reason: string) {
    console.warn(`[MAJAL DOMAIN GUARD] ${reason}`);
    this.guardNotice = { message: reason, occurredAt: new Date().toISOString() };
    this.listeners.forEach(listener => listener());
    return undefined;
  }

  public dismissGuardNotice() {
    if (!this.guardNotice) return;
    this.guardNotice = null;
    this.listeners.forEach(listener => listener());
  }

  private async serverMutation<T>(operation: () => Promise<T>): Promise<T | undefined> {
    try {
      const result = await operation();
      this.guardNotice = null;
      return result;
    } catch (error) {
      const message = error instanceof DomainApiError ? error.message : 'تعذّر إكمال العملية الإنتاجية على الخادم.';
      this.guardNotice = { message, occurredAt: new Date().toISOString() };
      this.listeners.forEach(listener => listener());
      return undefined;
    }
  }

  public submitNewProduct(productData: Omit<CreatorProduct, 'id' | 'createdAt' | 'status' | 'currentRecipeVersion'>, initialRecipe: Omit<RecipeVersion, 'id' | 'productId' | 'versionNumber' | 'createdAt' | 'createdById'>) {
    if (!IS_DEMO_MODE) return this.serverMutation(async () => {
      const response = await domainClient.createProduct({ publicName: productData.publicName, category: productData.category, shortDescription: productData.shortDescription, estimatedUnitCostFils: Math.round(productData.estimatedUnitCostKwd * 1000), targetPriceFils: Math.round(productData.targetSellingPriceKwd * 1000), recipe: initialRecipe });
      const created: CreatorProduct = { ...productData, id: response.id, status: 'SCREENING', currentRecipeVersion: 'V1.0', createdAt: new Date().toISOString() };
      this.products.unshift(created); this.notify(); return created;
    });
    if (!this.isCreatorFor(productData.creatorId)) return this.fail('لا يمكن تسجيل منتج لحساب مبدع آخر.');
    if (productData.publicName.trim().length < 3 || productData.publicName.trim().length > 80) return this.fail('اسم المنتج يجب أن يكون بين 3 و80 حرفًا.');
    if (productData.shortDescription.trim().length < 20 || productData.shortDescription.trim().length > 240) return this.fail('الوصف يجب أن يكون بين 20 و240 حرفًا.');
    if (productData.story.trim().length < 20 || productData.story.trim().length > 800) return this.fail('قصة المنتج يجب أن تكون بين 20 و800 حرف.');
    if (productData.generalIngredients.length < 2) return this.fail('أضف مكوّنين عامّين على الأقل.');
    if (initialRecipe.preparationSteps.length < 2) return this.fail('أضف خطوتين تشغيليتين على الأقل.');
    if (productData.isSecretRecipe && initialRecipe.criticalSecrets.trim().length < 5) return this.fail('أضف وصفًا واضحًا للجزء السري أو ألغِ خيار الوصفة السرية.');
    if (productData.targetSellingPriceKwd <= 0 || productData.estimatedUnitCostKwd <= 0 || productData.estimatedUnitCostKwd >= productData.targetSellingPriceKwd) return this.fail('يجب أن تكون التكلفة موجبة وأقل من سعر البيع المقترح.');

    const productId = `prod_${Date.now()}`;
    const newProduct: CreatorProduct = {
      ...productData,
      id: productId,
      status: 'SCREENING',
      currentRecipeVersion: 'V1.0',
      createdAt: new Date().toISOString()
    };

    const newRecipe: RecipeVersion = {
      ...initialRecipe,
      id: `rec_${Date.now()}`,
      productId,
      versionNumber: 'V1.0',
      createdById: this.activeUser.id,
      createdAt: new Date().toISOString()
    };

    this.products.unshift(newProduct);
    this.recipeVersions.unshift(newRecipe);

    // Create automatic match calculation against verified hosts
    this.hosts.forEach(host => {
      const matchScore = this.calculateMatchScore(newProduct, host);
      this.matches.push({
        id: `mat_${Date.now()}_${host.id}`,
        productId,
        hostBusinessId: host.id,
        matchScore,
        status: 'DISCOVERED',
        createdAt: new Date().toISOString()
      });
    });

    this.addAuditLog('LOGIN_SENSITIVE', 'PRODUCT', productId, `تم تقديم منتج جديد للمراجعة: ${newProduct.publicName}`);
    this.notify();
    return newProduct;
  }

  public calculateMatchScore(product: CreatorProduct, host: HostBusiness) {
    let equipmentFit = 80;
    if (product.expectedEquipment.some(eq => host.capabilities.equipment.some(heq => heq.includes(eq)))) {
      equipmentFit = 95;
    }

    const cogs = product.estimatedUnitCostKwd || 2.5;
    const target = product.targetSellingPriceKwd || 8.0;
    const margin = (target - cogs) / target;
    const marginFit = Math.min(98, Math.max(60, Math.round(margin * 130)));

    const brandFit = 88;
    const capacityFit = 90;
    const priceFit = 85;

    const overallScore = Math.round(
      equipmentFit * 0.25 + marginFit * 0.25 + brandFit * 0.20 + capacityFit * 0.15 + priceFit * 0.15
    );

    return {
      overallScore,
      equipmentFit,
      marginFit,
      brandFit,
      capacityFit,
      priceFit,
      explanationAr: `مطابقة بنسبة ${overallScore}٪ مع ${host.commercialName} بناءً على التوافق التشغيلي، المعدات، والهوامش الربحية المتوقعة.`,
      explanationEn: `${overallScore}% Match with ${host.commercialName} based on equipment alignment and profit margins.`
    };
  }

  public requestRecipeAccess(productId: string, hostBusinessId: string, disclosureLevel: 0 | 1 | 2 | 3, purpose: string) {
    if (!IS_DEMO_MODE) return this.serverMutation(async () => {
      const response = await domainClient.requestRecipeAccess({ productId, disclosureLevel, purpose });
      const product = this.products.find(p => p.id === productId);
      const grant: RecipeAccessGrant = { id: response.id, productId, creatorId: product?.creatorId || '', hostBusinessId, disclosureLevel, status: 'REQUESTED', requestedByUserId: this.activeUser.id, requestedAt: new Date().toISOString(), purpose };
      this.recipeGrants.unshift(grant); this.notify(); return grant;
    });
    const product = this.products.find(p => p.id === productId);
    if (!product) return this.fail('المنتج غير موجود.');
    if (!this.isHostMemberFor(hostBusinessId)) return this.fail('طلب الوصول يجب أن يصدر من عضو في المنشأة نفسها.');
    if (disclosureLevel === 3 && !['HOST_OWNER', 'HOST_CHEF'].includes(this.activeUser.role)) return this.fail('الوصول الكامل يمكن طلبه فقط من مالك المنشأة أو الشيف المخول.');
    if (disclosureLevel < 1 || disclosureLevel > 3) return this.fail('مستوى الإفصاح غير صالح.');

    const existing = this.recipeGrants.find(g =>
      g.productId === productId &&
      g.hostBusinessId === hostBusinessId &&
      (g.status === 'REQUESTED' || g.status === 'APPROVED')
    );
    if (existing) return existing;

    const request: RecipeAccessGrant = {
      id: `rag_${Date.now()}`,
      productId,
      creatorId: product.creatorId,
      hostBusinessId,
      disclosureLevel,
      status: 'REQUESTED',
      requestedByUserId: this.activeUser.id,
      requestedAt: new Date().toISOString(),
      purpose
    };

    this.recipeGrants.unshift(request);
    this.addAuditLog('ACCESS_REQUESTED', 'RECIPE_ACCESS_REQUEST', request.id, `طلب وصول مستوى ${disclosureLevel} للوصفة من المنشأة ${hostBusinessId}`);
    this.notify();
    return request;
  }

  public approveRecipeAccess(grantId: string, disclosureLevel?: 0 | 1 | 2 | 3) {
    if (!IS_DEMO_MODE) return this.serverMutation(async () => {
      const result = await domainClient.approveRecipeAccess(grantId, { disclosureLevel, days: this.policy.recipeGrantDays });
      const grant = this.recipeGrants.find(g => g.id === grantId); if (grant) { grant.status = 'APPROVED'; grant.disclosureLevel = result.disclosureLevel; grant.expiresAt = result.expiresAt; this.notify(); }
      return grant || result;
    });
    const grant = this.recipeGrants.find(g => g.id === grantId);
    if (!grant) return;

    const isOwnerCreator = this.activeUser.role === 'CREATOR' && this.activeUser.creatorId === grant.creatorId;
    if (!isOwnerCreator) return this.fail('منح الوصول للوصفة حق حصري للمبدع صاحب المنتج.');

    if (typeof disclosureLevel === 'number') grant.disclosureLevel = disclosureLevel;
    grant.status = 'APPROVED';
    grant.grantedByUserId = this.activeUser.id;
    grant.grantedAt = new Date().toISOString();
    grant.expiresAt = new Date(Date.now() + this.policy.recipeGrantDays * 86400000).toISOString();

    this.addAuditLog('ACCESS_GRANTED', 'RECIPE_ACCESS_GRANT', grant.id, `اعتماد مستوى وصول ${grant.disclosureLevel} لمنشأة ${grant.hostBusinessId}`);
    this.notify();
    return grant;
  }

  public revokeRecipeAccess(grantId: string) {
    if (!IS_DEMO_MODE) return this.serverMutation(async () => {
      const result = await domainClient.revokeRecipeAccess(grantId); const grant = this.recipeGrants.find(g => g.id === grantId); if (grant) { grant.status = 'REVOKED'; grant.revokedAt = new Date().toISOString(); this.notify(); } return grant || result;
    });
    const grant = this.recipeGrants.find(g => g.id === grantId);
    if (!grant) return;

    const isOwnerCreator = this.activeUser.creatorId === grant.creatorId;
    const isEmergencyOverride = this.activeUser.role === 'SUPER_ADMIN';
    if (!isOwnerCreator && !isEmergencyOverride) return;

    grant.status = 'REVOKED';
    grant.revokedAt = new Date().toISOString();
    this.addAuditLog('ACCESS_REVOKED', 'RECIPE_ACCESS_GRANT', grant.id, 'تم سحب إذن الوصول للوصفة');
    this.notify();
  }

  public publishChallenge(data: Omit<Challenge, 'id' | 'hostBusinessId' | 'status' | 'createdAt'>) {
    if (!IS_DEMO_MODE) return this.fail('نشر التحدي الإنتاجي يحتاج API مرتبطة بالمنشأة.');
    const hostBusinessId = this.activeUser.hostBusinessId;
    if (!hostBusinessId || !this.isHostMemberFor(hostBusinessId) || !hasPermission(this.activeUser, 'MANAGE_CHALLENGES')) return this.fail('لا تملك صلاحية نشر تحدٍ لهذه المنشأة.');
    if (!data.title.trim() || data.title.trim().length < 4) return this.fail('عنوان التحدي مطلوب ويجب أن يكون واضحًا.');
    if (!data.brief.trim() || data.brief.trim().length < 10) return this.fail('موجز التحدي يحتاج وصفًا أوضح.');
    if (data.targetPriceKwd <= 0 || data.costCeilingKwd < 0 || data.costCeilingKwd >= data.targetPriceKwd) return this.fail('سعر البيع وسقف التكلفة غير متوازنين.');
    if (new Date(data.deadline).getTime() <= Date.now()) return this.fail('الموعد النهائي يجب أن يكون في المستقبل.');
    const challenge: Challenge = {
      ...data,
      id: `ch_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      hostBusinessId,
      status: 'OPEN',
      createdAt: new Date().toISOString()
    };
    this.challenges.unshift(challenge);
    this.addAuditLog('CHALLENGE_PUBLISHED', 'CHALLENGE', challenge.id, `نشر تحدٍ جديد: ${challenge.title}`);
    this.notify();
    return challenge;
  }

  public addLabBatch(collaborationId: string, data: Omit<LabBatch, 'id' | 'collaborationId' | 'createdAt'>) {
    if (!IS_DEMO_MODE) return this.fail('دفعة المختبر الإنتاجية تُحفظ خادميًا بإصدار الوصفة المرتبط.');
    const col = this.collaborations.find(c => c.id === collaborationId);
    if (!col) return this.fail('التعاون غير موجود.');
    if (!hasPermission(this.activeUser, 'MANAGE_LAB') || !this.isHostMemberFor(col.hostBusinessId)) return this.fail('لا تملك صلاحية تسجيل دفعة مختبر لهذا التعاون.');
    if (data.yieldQuantity <= 0 || data.measuredCostKwd < 0 || data.prepTimeMinutes <= 0 || data.wastePercentage < 0 || data.wastePercentage > 100) return this.fail('قيم الدفعة التجريبية غير صالحة.');
    const batch: LabBatch = {
      ...data,
      id: `btch_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      collaborationId,
      createdAt: new Date().toISOString()
    };
    this.labBatches.unshift(batch);
    col.stage = 'LAB_ACTIVE';
    col.updatedAt = new Date().toISOString();
    this.addAuditLog('LAB_BATCH_RECORDED', 'LAB_BATCH', batch.id, `تسجيل دفعة مختبر ${batch.recipeVersion} بقرار ${batch.decision}`);
    this.notify();
    return batch;
  }

  public addDealDecision(collaborationId: string, text: string, category: DealDecision['category'] = 'DECISION') {
    if (!IS_DEMO_MODE) return this.fail('قرار الصفقة الإنتاجي يحتاج كتابة خادمية موثقة.');
    const col = this.collaborations.find(c => c.id === collaborationId);
    if (!col) return this.fail('التعاون غير موجود.');
    const allowed = this.isCreatorFor(col.creatorId) || this.isHostMemberFor(col.hostBusinessId) || ['ADMIN', 'SUPER_ADMIN'].includes(this.activeUser.role);
    if (!allowed) return this.fail('لا تملك صلاحية الكتابة في غرفة هذه الصفقة.');
    const clean = text.trim();
    if (clean.length < 3 || clean.length > 1000) return this.fail('نص القرار يجب أن يكون بين 3 و1000 حرف.');
    const decision: DealDecision = {
      id: `dec_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      collaborationId,
      authorUserId: this.activeUser.id,
      authorName: this.activeUser.name,
      authorRole: this.activeUser.role,
      text: clean,
      category,
      createdAt: new Date().toISOString()
    };
    this.dealDecisions.unshift(decision);
    this.addAuditLog('DEAL_DECISION_ADDED', 'DEAL_DECISION', decision.id, `إضافة ${category} إلى غرفة الصفقة ${collaborationId}`);
    this.notify();
    return decision;
  }

  public sendOffer(collaborationId: string, senderRole: 'HOST' | 'CREATOR', offerData: Omit<OfferTerms, 'id' | 'version' | 'collaborationId' | 'senderRole' | 'status' | 'createdAt'>) {
    if (!IS_DEMO_MODE) return this.serverMutation(async () => {
      const result = await domainClient.createOffer(collaborationId, { sellingPriceFils: Math.round(offerData.sellingPriceKwd * 1000), creatorRoyaltyBasisPoints: Math.round(offerData.creatorRoyaltyRatePercent * 100), platformFeeBasisPoints: Math.round(offerData.platformFeePercent * 100), notes: offerData.notes });
      const offer: OfferTerms = { ...offerData, id: result.id, version: result.version, collaborationId, senderRole, status: 'PENDING', createdAt: new Date().toISOString() }; this.offers.unshift(offer); const col = this.collaborations.find(c => c.id === collaborationId); if (col) { col.offerHistory.push(offer); col.currentOffer = offer; col.stage = 'OFFER_SENT'; } this.notify(); return offer;
    });
    const col = this.collaborations.find(c => c.id === collaborationId);
    if (!col) return this.fail('التعاون غير موجود.');
    const creatorAllowed = senderRole === 'CREATOR' && this.isCreatorFor(col.creatorId);
    const hostAllowed = senderRole === 'HOST' && this.canManageHostCommercials(col.hostBusinessId);
    if (!creatorAllowed && !hostAllowed) return this.fail('لا تملك صلاحية إرسال عرض لهذا التعاون.');
    const negotiableStages = ['TASTING_COMPLETED', 'LAB_ACTIVE', 'OFFER_SENT', 'COUNTERED'];
    if (!negotiableStages.includes(col.stage)) return this.fail('مرحلة التعاون الحالية لا تسمح بفتح تفاوض تجاري جديد.');
    if (offerData.sellingPriceKwd <= 0 || offerData.creatorRoyaltyRatePercent < 0 || offerData.creatorRoyaltyRatePercent > 100) return this.fail('بيانات العرض التجاري غير صالحة.');
    if (offerData.platformFeePercent < 0 || offerData.platformFeePercent > 100) return this.fail('عمولة المنصة غير صالحة.');
    if (offerData.creatorRoyaltyRatePercent + offerData.platformFeePercent >= 100) return this.fail('مجموع النسب يترك صافيًا غير صالح للمنشأة.');

    const nextVersion = col.offerHistory.length + 1;
    const newOffer: OfferTerms = {
      ...offerData,
      id: `off_${Date.now()}`,
      version: nextVersion,
      collaborationId,
      senderRole,
      status: 'PENDING',
      createdAt: new Date().toISOString()
    };

    // Mark previous offer countered/superseded
    col.offerHistory.forEach(o => {
      if (o.status === 'PENDING') o.status = 'COUNTERED';
    });

    this.offers.unshift(newOffer);
    col.offerHistory.push(newOffer);
    col.currentOffer = newOffer;
    col.stage = 'OFFER_SENT';

    this.addAuditLog('OFFER_CHANGED', 'OFFER', newOffer.id, `تقديم عرض تجاري V${nextVersion} بنسبة royalties ${newOffer.creatorRoyaltyRatePercent}%`);
    this.notify();
    return newOffer;
  }

  public acceptOffer(collaborationId: string, offerId: string) {
    if (!IS_DEMO_MODE) return this.serverMutation(async () => { const result = await domainClient.acceptOffer(collaborationId, offerId); const offer = this.offers.find(o => o.id === offerId); if (offer) offer.status = 'ACCEPTED'; const col = this.collaborations.find(c => c.id === collaborationId); if (col) col.stage = 'COMMERCIAL_AGREED'; this.notify(); return result; });
    const col = this.collaborations.find(c => c.id === collaborationId);
    const offer = this.offers.find(o => o.id === offerId);
    if (!col || !offer || offer.collaborationId !== collaborationId) return this.fail('العرض أو التعاون غير صالح.');
    if (offer.status !== 'PENDING') return this.fail('هذا العرض لم يعد قابلًا للقبول.');
    const creatorCanAccept = offer.senderRole === 'HOST' && this.isCreatorFor(col.creatorId);
    const hostCanAccept = offer.senderRole === 'CREATOR' && this.canManageHostCommercials(col.hostBusinessId);
    if (!creatorCanAccept && !hostCanAccept) return this.fail('لا يمكن للطرف الذي أرسل العرض أن يقبله نيابة عن الطرف الآخر.');

    offer.status = 'ACCEPTED';
    col.stage = 'COMMERCIAL_AGREED';

    // Generate contract draft
    const creator = this.creators.find(cr => cr.id === col.creatorId);
    const host = this.hosts.find(h => h.id === col.hostBusinessId);

    const contract: Contract = {
      id: `ctr_${Date.now()}`,
      collaborationId,
      versionNumber: 'V1.0-FINAL',
      terms: offer,
      creatorLegalName: creator?.legalName || creator?.displayName || 'المبدع',
      hostCommercialName: host?.commercialName || 'المنشأة المرخّصة',
      status: 'PENDING_CREATOR_SIGNATURE',
      createdAt: new Date().toISOString()
    };

    this.contracts.unshift(contract);
    col.contract = contract;

    this.addAuditLog('OFFER_CHANGED', 'OFFER', offerId, 'تم قبول العرض التجاري وتوليد مسودة العقد الرقمي');
    this.notify();
  }

  public signContract(contractId: string) {
    if (!IS_DEMO_MODE) return this.fail('ابدأ تحقق PACI لغرض CONTRACT_SIGNATURE ثم استخدم signContractWithPaci(contractId, paciRequestId).');
    const contract = this.contracts.find(c => c.id === contractId);
    if (!contract) return this.fail('العقد غير موجود.');
    if (contract.status === 'FULLY_SIGNED' || contract.status === 'EXPIRED') return this.fail('العقد غير قابل للتوقيع في حالته الحالية.');

    const col = this.collaborations.find(c => c.id === contract.collaborationId);
    if (!col) return this.fail('التعاون المرتبط بالعقد غير موجود.');
    const isCreatorSigner = this.isCreatorFor(col.creatorId);
    const isHostSigner = this.activeUser.role === 'HOST_OWNER' && this.activeUser.hostBusinessId === col.hostBusinessId;
    if (!isCreatorSigner && !isHostSigner) return this.fail('التوقيع محصور بالمبدع صاحب التعاون أو مالك المنشأة.');

    if (isCreatorSigner) {
      contract.creatorSignedAt = new Date().toISOString();
      contract.creatorSignerIp = 'local-demo:creator';
      if (contract.hostSignedAt) {
        contract.status = 'FULLY_SIGNED';
        if (col) col.stage = 'SIGNED';
      } else {
        contract.status = 'PENDING_HOST_SIGNATURE';
      }
    } else {
      contract.hostSignedAt = new Date().toISOString();
      contract.hostSignerIp = 'local-demo:host';
      if (contract.creatorSignedAt) {
        contract.status = 'FULLY_SIGNED';
        if (col) col.stage = 'SIGNED';
      } else {
        contract.status = 'PENDING_CREATOR_SIGNATURE';
      }
    }

    this.addAuditLog('CONTRACT_SIGNED', 'CONTRACT', contractId, `محاكاة توقيع محلية غير ملزمة — حالة العقد: ${contract.status}`);
    this.notify();
    return contract;
  }

  public signContractWithPaci(contractId: string, paciRequestId: string) {
    if (IS_DEMO_MODE) return this.signContract(contractId);
    return this.serverMutation(async () => {
      const result = await domainClient.signContract(contractId, paciRequestId);
      const contract = this.contracts.find(c => c.id === contractId); if (contract && result.status === 'FULLY_SIGNED') contract.status = 'FULLY_SIGNED'; this.notify(); return contract || result;
    });
  }

  public getLaunchGate(collaborationId: string) {
    const col = this.collaborations.find(c => c.id === collaborationId);
    if (!col) return undefined;
    const host = this.hosts.find(h => h.id === col.hostBusinessId);
    const product = this.products.find(p => p.id === col.productId);
    const launch = col.activeLaunch || this.launches.find(l => l.collaborationId === collaborationId);
    const existing = launch?.gateChecklist;
    const docs = this.compliance.filter(c => c.hostBusinessId === col.hostBusinessId);
    const now = Date.now();
    const requiredDocsValid = docs.length > 0 && docs.every(d => d.status === 'VALID' && new Date(d.expiryDate).getTime() > now);
    const gate = {
      hostVerified: host?.verificationStatus === 'VERIFIED',
      requiredDocsValid,
      contractSigned: col.contract?.status === 'FULLY_SIGNED',
      productionRecipeApproved: existing?.productionRecipeApproved ?? false,
      productNamePriceApproved: existing?.productNamePriceApproved ?? false,
      allergensCompleted: !!product && product.allergens.length > 0,
      packagingDataCompleted: existing?.packagingDataCompleted ?? false,
      productionLocationSelected: existing?.productionLocationSelected ?? false,
      branchAvailabilitySelected: !!launch && launch.branches.length > 0,
      settlementConfigApproved: existing?.settlementConfigApproved ?? false,
      photosReady: !!product && product.mediaUrls.length > 0,
      allRequirementsPassed: false
    };
    gate.allRequirementsPassed = Object.entries(gate).filter(([key]) => key !== 'allRequirementsPassed').every(([, value]) => value === true);
    return gate;
  }

  public prepareLaunch(collaborationId: string) {
    if (!IS_DEMO_MODE) return this.serverMutation(() => domainClient.prepareLaunch(collaborationId));
    const col = this.collaborations.find(c => c.id === collaborationId);
    if (!col) return this.fail('التعاون غير موجود.');
    if (!this.canManageHostCommercials(col.hostBusinessId)) return this.fail('إعداد الإطلاق محصور بمالك المنشأة أو التشغيل.');
    if (col.contract?.status !== 'FULLY_SIGNED') return this.fail('لا يمكن إعداد إطلاق قبل اكتمال توقيع العقد.');
    const existing = col.activeLaunch || this.launches.find(l => l.collaborationId === collaborationId);
    if (existing) return existing;
    const product = this.products.find(p => p.id === col.productId);
    const offer = col.currentOffer;
    if (!product || !offer) return this.fail('بيانات المنتج أو العرض التجاري غير مكتملة.');
    const host = this.hosts.find(h => h.id === col.hostBusinessId);
    const defaultBranch = host?.branches.find(b => b.isActive)?.id;
    const launch: Launch = {
      id: `lnch_${Date.now()}`,
      collaborationId: col.id,
      productId: col.productId,
      creatorId: col.creatorId,
      hostBusinessId: col.hostBusinessId,
      launchType: 'TRIAL_PERIOD',
      title: `إطلاق تجريبي — ${product.publicName}`,
      sellingPriceKwd: offer.sellingPriceKwd,
      quantityCapUnits: 500,
      unitsSold: 0,
      branches: defaultBranch ? [defaultBranch] : [],
      startDate: new Date().toISOString(),
      status: 'SCHEDULED',
      gateChecklist: {
        hostVerified: false,
        requiredDocsValid: false,
        contractSigned: false,
        productionRecipeApproved: false,
        productNamePriceApproved: false,
        allergensCompleted: false,
        packagingDataCompleted: false,
        productionLocationSelected: false,
        branchAvailabilitySelected: false,
        settlementConfigApproved: false,
        photosReady: false,
        allRequirementsPassed: false
      },
      createdAt: new Date().toISOString()
    };
    this.launches.unshift(launch);
    col.activeLaunch = launch;
    this.addAuditLog('LAUNCH_PREPARED', 'LAUNCH', launch.id, `إنشاء سجل إطلاق للتعاون ${collaborationId}`);
    col.stage = 'PRE_LAUNCH';
    launch.gateChecklist = this.getLaunchGate(collaborationId)!;
    this.notify();
    return launch;
  }

  public setLaunchGateItem(collaborationId: string, key: keyof Launch['gateChecklist'], value: boolean) {
    if (!IS_DEMO_MODE) return this.serverMutation(() => domainClient.setLaunchGate(collaborationId, key, value));
    const col = this.collaborations.find(c => c.id === collaborationId);
    if (!col) return this.fail('التعاون غير موجود.');
    if (!this.canManageHostCommercials(col.hostBusinessId)) return this.fail('لا تملك صلاحية تعديل جاهزية الإطلاق.');
    const manualKeys: (keyof Launch['gateChecklist'])[] = [
      'productionRecipeApproved', 'productNamePriceApproved', 'packagingDataCompleted',
      'productionLocationSelected', 'settlementConfigApproved'
    ];
    if (!manualKeys.includes(key)) return this.fail('هذا الشرط مشتق آليًا ولا يمكن تعديله يدويًا.');
    const launch = col.activeLaunch || this.prepareLaunch(collaborationId);
    if (!launch) return undefined;
    launch.gateChecklist[key] = value;
    launch.gateChecklist = this.getLaunchGate(collaborationId)!;
    this.addAuditLog('LAUNCH_GATE_UPDATED', 'LAUNCH', launch.id, `تحديث متطلب الإطلاق ${key} إلى ${value ? 'مكتمل' : 'غير مكتمل'}`);
    this.notify();
    return launch.gateChecklist;
  }

  public activateLaunch(collaborationId: string) {
    if (!IS_DEMO_MODE) return this.serverMutation(() => domainClient.activateLaunch(collaborationId));
    const col = this.collaborations.find(c => c.id === collaborationId);
    if (!col) return this.fail('التعاون غير موجود.');
    if (!this.canManageHostCommercials(col.hostBusinessId)) return this.fail('الإطلاق محصور بمالك المنشأة أو التشغيل.');
    const launch = col.activeLaunch || this.prepareLaunch(collaborationId);
    if (!launch) return undefined;
    launch.gateChecklist = this.getLaunchGate(collaborationId)!;
    if (!launch.gateChecklist.allRequirementsPassed) return this.fail('بوابة الإطلاق غير مكتملة.');
    launch.status = 'LIVE';
    launch.startDate = new Date().toISOString();
    col.stage = 'LIVE';
    col.updatedAt = new Date().toISOString();
    const product = this.products.find(p => p.id === col.productId);
    if (product) product.status = launch.launchType === 'LIMITED_DROP' ? 'LIVE_DROP' : 'LIVE_TRIAL';
    this.addAuditLog('LAUNCH_ACTIVATED', 'LAUNCH', launch.id, 'اجتياز Launch Gate وتحويل الإطلاق إلى LIVE');
    this.notify();
    return launch;
  }

  public placeOrder(launchId: string, unitsCount: number, customerName: string, customerPhone: string, acquisitionSource: Order['acquisitionSource'] = 'MAJAL', branchId?: string) {
    if (!IS_DEMO_MODE) return this.fail('الطلبات مقفلة حتى ربط الدفع والتحقق الخادمي من المخزون.');
    const launch = this.launches.find(l => l.id === launchId);
    if (!launch) return this.fail('الإطلاق غير موجود.');
    if (launch.status !== 'LIVE' && launch.status !== 'PERMANENT') return this.fail('هذا الإطلاق غير متاح للطلب حاليًا.');
    if (!Number.isInteger(unitsCount) || unitsCount < 1 || unitsCount > this.policy.maxOrderUnits) return this.fail(`كمية الطلب يجب أن تكون بين 1 و${this.policy.maxOrderUnits} وحدة.`);
    if (launch.quantityCapUnits && launch.unitsSold + unitsCount > launch.quantityCapUnits) return this.fail('الكمية المطلوبة تتجاوز المتاح في هذا الإصدار.');
    if (!customerName.trim()) return this.fail('اسم العميل مطلوب.');
    const phoneDigits = customerPhone.replace(/\D/g, '');
    if (phoneDigits.length < 8 || phoneDigits.length > 12) return this.fail('رقم الهاتف غير صالح.');

    const col = this.collaborations.find(c => c.id === launch.collaborationId);
    const royaltyPercent = col?.currentOffer?.creatorRoyaltyRatePercent || 13;
    const platformFeePercent = col?.currentOffer?.platformFeePercent ?? this.policy.platformFeePercent;

    const grossAmountKwd = Math.round(launch.sellingPriceKwd * unitsCount * 1000) / 1000;
    const creatorRoyaltyKwd = Math.round((grossAmountKwd * (royaltyPercent / 100)) * 1000) / 1000;
    const platformFeeKwd = Math.round((grossAmountKwd * (platformFeePercent / 100)) * 1000) / 1000;
    const hostNetKwd = Math.round((grossAmountKwd - creatorRoyaltyKwd - platformFeeKwd) * 1000) / 1000;

    const order: Order = {
      id: `ord_${Date.now()}`,
      launchId,
      productId: launch.productId,
      creatorId: launch.creatorId,
      hostBusinessId: launch.hostBusinessId,
      branchId: branchId && launch.branches.includes(branchId) ? branchId : undefined,
      acquisitionSource,
      customerName,
      customerPhone,
      grossAmountKwd,
      unitsCount,
      creatorRoyaltyKwd,
      platformFeeKwd,
      hostNetKwd,
      status: 'PENDING_PAYMENT',
      createdAt: new Date().toISOString()
    };
    this.orders.unshift(order);
    this.addAuditLog('ORDER_PLACED', 'ORDER', order.id, `حجز تجريبي معلق للدفع: ${unitsCount} وحدة على الإطلاق ${launchId}`);

    this.notify();
    return order;
  }

  public submitReview(launchId: string, tasteRating: number, valueRating: number, portionRating: number, comment: string, keepItVote: boolean, customerName: string) {
    if (!IS_DEMO_MODE) return this.fail('التقييم الإنتاجي يحتاج ربطه بطلب المستخدم الموثق على الخادم.');
    const launch = this.launches.find(l => l.id === launchId);
    if (!launch) return this.fail('الإطلاق غير موجود.');
    const ratings = [tasteRating, valueRating, portionRating];
    if (ratings.some(r => r < 1 || r > 5)) return this.fail('التقييم يجب أن يكون بين 1 و5.');
    if (!customerName.trim()) return this.fail('اسم العميل مطلوب.');
    const normalizedCustomer = customerName.trim().toLowerCase();
    if (this.reviews.some(r => r.launchId === launchId && r.customerName.trim().toLowerCase() === normalizedCustomer)) return this.fail('تم تسجيل تقييم لهذا العميل على هذا الإطلاق مسبقًا.');
    // Verified purchase must eventually come from the authenticated owner of a
    // completed server order; a matching display name is never evidence.
    const verifiedPurchase = false;

    const review: Review = {
      id: `rev_${Date.now()}`,
      launchId,
      productId: launch.productId,
      creatorId: launch.creatorId,
      customerName,
      tasteRating,
      valueRating,
      portionRating,
      wouldBuyAgain: tasteRating >= 4,
      comment,
      keepItVote,
      isVerifiedPurchase: verifiedPurchase,
      createdAt: new Date().toISOString()
    };

    this.reviews.unshift(review);
    this.addAuditLog('REVIEW_SUBMITTED', 'REVIEW', review.id, `تسجيل تقييم للإطلاق ${launchId}`);
    this.notify();
    return review;
  }

  public approveSettlementBatch(creatorId: string) {
    if (!IS_DEMO_MODE) return this.serverMutation(() => domainClient.approveSettlement(creatorId));
    if (!hasPermission(this.activeUser, 'RUN_SETTLEMENTS')) return this.fail('لا تملك صلاحية تشغيل التسويات.');
    const eligibleAccruals = this.accruals.filter(a => a.creatorId === creatorId && a.settlementStatus === 'SETTLEMENT_ELIGIBLE');
    if (eligibleAccruals.length === 0) return;

    const totalKwd = eligibleAccruals.reduce((sum, a) => sum + a.accruedAmountKwd, 0);
    const creator = this.creators.find(c => c.id === creatorId);

    const batch: SettlementBatch = {
      id: `stl_${Date.now()}`,
      creatorId,
      creatorName: creator?.displayName || 'المبدع',
      totalAmountKwd: Math.round(totalKwd * 1000) / 1000,
      periodStart: new Date(Date.now() - this.policy.settlementCycleDays * 86400000).toISOString(),
      periodEnd: new Date().toISOString(),
      status: 'APPROVED',
      approvedAt: new Date().toISOString(),
      approvedByAdmin: this.activeUser.id,
      createdAt: new Date().toISOString()
    };

    eligibleAccruals.forEach(a => {
      a.settlementStatus = 'SETTLEMENT_LOCKED';
      a.settlementBatchId = batch.id;
    });

    this.settlements.unshift(batch);
    this.addAuditLog('SETTLEMENT_APPROVED', 'SETTLEMENT_BATCH', batch.id, `اعتماد دفعة مستحقات بقيمة ${batch.totalAmountKwd} د.ك — بانتظار تأكيد الدفع الخارجي`);
    this.notify();
    return batch;
  }

  public updatePlatformPolicy(patch: Partial<Pick<PlatformPolicy, 'platformFeePercent' | 'recipeGrantDays' | 'maxOrderUnits' | 'complianceWarningDays' | 'strongMatchThreshold' | 'settlementCycleDays'>>) {
    if (!IS_DEMO_MODE) return this.fail('سياسة المنصة الإنتاجية لا تتغير إلا عبر API السوبر أدمن مع Audit.');
    if (!hasPermission(this.activeUser, 'CHANGE_PLATFORM_POLICY')) return this.fail('تغيير سياسات المنصة محصور بالسوبر أدمن.');
    const next = { ...this.policy, ...patch };
    if (next.platformFeePercent < 0 || next.platformFeePercent > 30) return this.fail('عمولة المنصة يجب أن تكون بين 0% و30%.');
    if (next.recipeGrantDays < 1 || next.recipeGrantDays > 365) return this.fail('مدة إذن الوصفة يجب أن تكون بين يوم و365 يومًا.');
    if (next.maxOrderUnits < 1 || next.maxOrderUnits > 100) return this.fail('الحد الأعلى للطلب يجب أن يكون بين 1 و100.');
    if (next.complianceWarningDays < 1 || next.complianceWarningDays > 120) return this.fail('نافذة تحذير الامتثال يجب أن تكون بين يوم و120 يومًا.');
    if (next.strongMatchThreshold < 50 || next.strongMatchThreshold > 100) return this.fail('عتبة المطابقة القوية يجب أن تكون بين 50 و100.');
    if (next.settlementCycleDays < 1 || next.settlementCycleDays > 90) return this.fail('دورة التسوية يجب أن تكون بين يوم و90 يومًا.');
    this.policy = { ...next, updatedAt: new Date().toISOString(), updatedBy: this.activeUser.id };
    this.addAuditLog('PLATFORM_POLICY_CHANGED', 'PLATFORM_POLICY', 'global', `تحديث سياسة المنصة بواسطة ${this.activeUser.name}`);
    this.notify();
    return this.policy;
  }

  public markSettlementPaid(batchId: string) {
    void batchId;
    return this.fail('تأكيد التسوية مقفول حتى يصل مرجع دفع موثّق من مزود الدفع إلى الخادم.');
  }
}

export const store = Store.getInstance();
