import { Response, Router } from 'express';
import { AuthConfig, AuthenticatedRequest, requireAuth, requireCsrf, requireRoles } from './auth';
import { MajalDatabase } from './database';
import { randomUUID } from 'node:crypto';
import { ledgerForEntity, verifyLedgerChain } from './ledger';
import { createExposureGrant, exposureSnapshot, recordExposureAccess, revokeExposureGrant } from './secret-halflife';
import { KILL_SWITCHES, KillSwitchName, assertKillSwitchClear, engageKillSwitch, killSwitchStatus, releaseKillSwitch } from './kill-switch';
import { recordDriftReport } from './contract-drift';
import { gatherRadarSignals, scanRoyaltyAnomalies } from './royalty-radar';
import { computeBlastRadius, gatherBlastFacts } from './blast-radius';
import { LINEAGE_RELATIONS, LineageRelation, addLineageEdge, buildLineageGraph } from './lineage';
import { TrustClaims, issueCreatorTrustAttestation, verifyAttestation } from './trust-proof';
import { issueCanary, revokeCanary, traceCanary } from './canary';
import { CounterfactualAssumptions, computeCounterfactual, loadOfferTerms } from './counterfactual';
import { forecastWithTwin, loadCalibration, recordTwinSample } from './operational-twin';
import { createThresholdEscrow, revealThresholdEscrow, revokeThresholdEscrow } from './threshold-escrow';
import { buildReserveAttestation, reserveProofForCreator, verifyReserveInclusion } from './proof-of-reserves';
import { createTimeAnchor, verifyTimeAnchors } from './time-anchor';
import { SealedRecipe, createSealedProfile, revokeSealedProfile, runSealedCompute } from './sealed-compute';

const jsonError = (res: Response, status: number, message: string, code: string) => res.status(status).json({ error: message, code });
const text = (value: unknown, min: number, max: number) => typeof value === 'string' && value.trim().length >= min && value.trim().length <= max ? value.trim() : undefined;
const integer = (value: unknown, min: number, max: number) => Number.isInteger(Number(value)) && Number(value) >= min && Number(value) <= max ? Number(value) : undefined;
const isAdmin = (req: AuthenticatedRequest) => req.auth?.user.role === 'ADMIN' || req.auth?.user.role === 'SUPER_ADMIN';
const isHostMember = (req: AuthenticatedRequest, organizationId: string) => isAdmin(req) || req.auth?.user.hostBusinessId === organizationId;

/**
 * Advanced integrity + secret-exposure surface.
 *  - Ledger verification/transparency (Deterministic Replay Ledger).
 *  - Decaying secret exposure grants (Secret Half-Life).
 * All routes are authenticated and CSRF-protected; mutations are authorized per owner.
 */
export function createAdvancedRouter(db: MajalDatabase, authConfig: AuthConfig) {
  const router = Router();
  router.use(requireAuth(db, authConfig));
  router.use(requireCsrf(authConfig));

  // --- Deterministic Replay Ledger ---------------------------------------------------
  router.get('/ledger/verify', requireRoles('ADMIN', 'SUPER_ADMIN'), async (_req: AuthenticatedRequest, res) => {
    const verification = await verifyLedgerChain(db);
    res.status(verification.valid ? 200 : 409).json(verification);
  });

  router.get('/ledger/entity/:type/:id', async (req: AuthenticatedRequest, res) => {
    const type = text(req.params.type, 2, 40), id = text(req.params.id, 3, 200);
    if (!type || !id) return jsonError(res, 400, 'معرّف الكيان غير صالح.', 'INVALID_ENTITY');
    // Payment intents are owned by their user; settlements are visible to admins/finance.
    if (type === 'PAYMENT_INTENT') {
      const intent = await db.prepare('SELECT user_id FROM payment_intents WHERE id = ?').get<{ user_id: string }>(id);
      if (!intent || (intent.user_id !== req.auth!.user.id && !isAdmin(req))) return jsonError(res, 403, 'غير مخول للاطلاع على هذا السجل.', 'FORBIDDEN');
    } else if (!isAdmin(req)) {
      return jsonError(res, 403, 'سجل هذا الكيان متاح للإدارة فقط.', 'FORBIDDEN');
    }
    res.json({ entries: await ledgerForEntity(db, type, id) });
  });

  // --- Secret Half-Life exposure grants ----------------------------------------------
  router.post('/exposure', async (req: AuthenticatedRequest, res) => {
    try {
      const recipeVersionId = text(req.body?.recipeVersionId, 3, 120);
      const organizationId = text(req.body?.organizationId, 3, 120);
      const purpose = text(req.body?.purpose, 3, 200);
      const initial = integer(req.body?.initialExposureBp, 1, 10000);
      const floor = integer(req.body?.floorBp, 0, 9999);
      const halfLife = integer(req.body?.halfLifeSeconds, 1, 90 * 86400);
      const accessDecay = integer(req.body?.accessDecayBp, 0, 10000) ?? 0;
      const hardExpires = integer(req.body?.hardExpiresInSeconds, 60, 365 * 86400);
      if (!recipeVersionId || !organizationId || !purpose || initial === undefined || floor === undefined || halfLife === undefined || hardExpires === undefined) {
        return jsonError(res, 400, 'بيانات منح التعرّض غير صالحة.', 'INVALID_EXPOSURE');
      }
      const recipe = await db.prepare('SELECT rv.id, rv.product_id, p.creator_id FROM recipe_versions rv JOIN products p ON p.id = rv.product_id WHERE rv.id = ?')
        .get<{ id: string; product_id: string; creator_id: string }>(recipeVersionId);
      if (!recipe) return jsonError(res, 404, 'نسخة الوصفة غير موجودة.', 'NOT_FOUND');
      if (req.auth!.user.creatorId !== recipe.creator_id && !isAdmin(req)) return jsonError(res, 403, 'المنح للمبدع المالك فقط.', 'FORBIDDEN');
      const grant = await createExposureGrant(db, {
        productId: recipe.product_id, recipeVersionId, organizationId, purpose,
        initialExposureBp: initial, floorBp: floor, halfLifeSeconds: halfLife, accessDecayBp: accessDecay,
        hardExpiresInSeconds: hardExpires, grantedByUserId: req.auth!.user.id
      });
      res.status(201).json(grant);
    } catch (error) { handleError(res, error); }
  });

  router.post('/exposure/:id/access', async (req: AuthenticatedRequest, res) => {
    try {
      await assertKillSwitchClear(db, 'RECIPE_REVEALS'); // breach containment: freezes all secret reveals
      const snapshot = await exposureSnapshot(db, req.params.id);
      if (!snapshot) return jsonError(res, 404, 'المنح غير موجود.', 'NOT_FOUND');
      if (!isHostMember(req, snapshot.organizationId)) return jsonError(res, 403, 'الوصول للطرف المخول فقط.', 'FORBIDDEN');
      const result = await recordExposureAccess(db, req.params.id, req.auth!.user.id);
      res.status(result.allowed ? 200 : 403).json(result);
    } catch (error) { handleError(res, error); }
  });

  router.post('/exposure/:id/revoke', async (req: AuthenticatedRequest, res) => {
    try {
      const row = await db.prepare('SELECT g.id, p.creator_id FROM secret_exposure_grants g JOIN products p ON p.id = g.product_id WHERE g.id = ?')
        .get<{ id: string; creator_id: string }>(req.params.id);
      if (!row) return jsonError(res, 404, 'المنح غير موجود.', 'NOT_FOUND');
      if (req.auth!.user.creatorId !== row.creator_id && !isAdmin(req)) return jsonError(res, 403, 'الإلغاء للمبدع المالك فقط.', 'FORBIDDEN');
      res.json(await revokeExposureGrant(db, req.params.id));
    } catch (error) { handleError(res, error); }
  });

  router.get('/exposure/:id', async (req: AuthenticatedRequest, res) => {
    const snapshot = await exposureSnapshot(db, req.params.id);
    if (!snapshot) return jsonError(res, 404, 'المنح غير موجود.', 'NOT_FOUND');
    const owns = await db.prepare('SELECT p.creator_id FROM secret_exposure_grants g JOIN products p ON p.id = g.product_id WHERE g.id = ?').get<{ creator_id: string }>(req.params.id);
    if (!isHostMember(req, snapshot.organizationId) && req.auth!.user.creatorId !== owns?.creator_id && !isAdmin(req)) return jsonError(res, 403, 'غير مخول.', 'FORBIDDEN');
    res.json(snapshot);
  });

  // --- Trust Kill Switch (SUPER_ADMIN + second confirmation secret) -------------------
  const requestId = (req: AuthenticatedRequest) => text(req.header('x-request-id'), 8, 128) || randomUUID();
  const requireBreakGlass = (req: AuthenticatedRequest, res: Response): boolean => {
    const secret = process.env.SECURITY_KILL_SWITCH_SECRET?.trim();
    if (!secret || secret.length < 32) { jsonError(res, 503, 'قناة التأكيد الأمني غير مهيأة.', 'BREAK_GLASS_NOT_CONFIGURED'); return false; }
    if (req.header('x-security-confirmation') !== secret) { jsonError(res, 403, 'تأكيد أمني إضافي مطلوب.', 'BREAK_GLASS_REQUIRED'); return false; }
    return true;
  };
  const validSwitch = (value: unknown): KillSwitchName | undefined => KILL_SWITCHES.includes(value as KillSwitchName) ? value as KillSwitchName : undefined;

  router.get('/security/kill-switch', requireRoles('ADMIN', 'SUPER_ADMIN'), async (_req: AuthenticatedRequest, res) => {
    res.json({ switches: await killSwitchStatus(db) });
  });
  router.post('/security/kill-switch/:name/engage', requireRoles('SUPER_ADMIN'), async (req: AuthenticatedRequest, res) => {
    try {
      if (!requireBreakGlass(req, res)) return;
      const name = validSwitch(req.params.name); const reason = text(req.body?.reason, 8, 500);
      if (!name || !reason) return jsonError(res, 400, 'اسم المفتاح أو سبب التفعيل غير صالح.', 'INVALID_KILL_SWITCH');
      res.json(await engageKillSwitch(db, name, req.auth!.user.id, reason, requestId(req)));
    } catch (error) { handleError(res, error); }
  });
  router.post('/security/kill-switch/:name/release', requireRoles('SUPER_ADMIN'), async (req: AuthenticatedRequest, res) => {
    try {
      if (!requireBreakGlass(req, res)) return;
      const name = validSwitch(req.params.name); const reason = text(req.body?.reason, 8, 500);
      if (!name || !reason) return jsonError(res, 400, 'اسم المفتاح أو سبب الإلغاء غير صالح.', 'INVALID_KILL_SWITCH');
      res.json(await releaseKillSwitch(db, name, req.auth!.user.id, reason, requestId(req)));
    } catch (error) { handleError(res, error); }
  });

  // --- Contract Drift Detector + Royalty Anomaly Radar (collaboration parties/admin) ---
  const collabParty = async (req: AuthenticatedRequest, collaborationId: string) => {
    const col = await db.prepare('SELECT id, creator_id, organization_id FROM collaborations WHERE id = ?').get<{ id: string; creator_id: string; organization_id: string }>(collaborationId);
    if (!col) return undefined;
    const allowed = isAdmin(req) || req.auth!.user.creatorId === col.creator_id || isHostMember(req, col.organization_id);
    return allowed ? col : null;
  };

  router.post('/contract-drift/:collaborationId', async (req: AuthenticatedRequest, res) => {
    try {
      const col = await collabParty(req, req.params.collaborationId);
      if (col === undefined) return jsonError(res, 404, 'التعاون غير موجود.', 'NOT_FOUND');
      if (col === null) return jsonError(res, 403, 'التعاون غير متاح.', 'FORBIDDEN');
      res.status(201).json(await recordDriftReport(db, req.params.collaborationId, req.auth!.user.id));
    } catch (error) { handleError(res, error); }
  });

  router.get('/royalty-radar/:collaborationId', async (req: AuthenticatedRequest, res) => {
    try {
      const col = await collabParty(req, req.params.collaborationId);
      if (col === undefined) return jsonError(res, 404, 'التعاون غير موجود.', 'NOT_FOUND');
      if (col === null) return jsonError(res, 403, 'التعاون غير متاح.', 'FORBIDDEN');
      const signals = await gatherRadarSignals(db, col.id, col.creator_id);
      res.json({ collaborationId: col.id, signals, anomalies: scanRoyaltyAnomalies(signals) });
    } catch (error) { handleError(res, error); }
  });

  // --- Deal Blast Radius (collaboration parties/admin) --------------------------------
  router.post('/blast-radius/:collaborationId', async (req: AuthenticatedRequest, res) => {
    try {
      const col = await collabParty(req, req.params.collaborationId);
      if (col === undefined) return jsonError(res, 404, 'التعاون غير موجود.', 'NOT_FOUND');
      if (col === null) return jsonError(res, 403, 'التعاون غير متاح.', 'FORBIDDEN');
      const party = ['CREATOR', 'HOST', 'EITHER'].includes(req.body?.party) ? req.body.party as 'CREATOR' | 'HOST' | 'EITHER' : 'EITHER';
      const delayDays = integer(req.body?.delayDays, 0, 365) ?? 7;
      const facts = await gatherBlastFacts(db, req.params.collaborationId);
      if (!facts) return jsonError(res, 404, 'التعاون غير موجود.', 'NOT_FOUND');
      res.json({ collaborationId: col.id, facts, impact: computeBlastRadius(facts, { party, delayDays }) });
    } catch (error) { handleError(res, error); }
  });

  // --- Recipe Lineage Graph (creator owner writes; parties/admin read) ----------------
  const productOwner = async (productId: string) => db.prepare('SELECT creator_id FROM products WHERE id = ?').get<{ creator_id: string }>(productId);
  router.post('/lineage/:productId/edges', async (req: AuthenticatedRequest, res) => {
    try {
      const owner = await productOwner(req.params.productId);
      if (!owner) return jsonError(res, 404, 'المنتج غير موجود.', 'NOT_FOUND');
      if (req.auth!.user.creatorId !== owner.creator_id && !isAdmin(req)) return jsonError(res, 403, 'تحرير النسب للمبدع المالك فقط.', 'FORBIDDEN');
      const relation = LINEAGE_RELATIONS.includes(req.body?.relation) ? req.body.relation as LineageRelation : undefined;
      const child = text(req.body?.childRecipeVersionId, 3, 120);
      const parent = req.body?.parentRecipeVersionId == null ? null : text(req.body?.parentRecipeVersionId, 3, 120);
      if (!relation || !child || (parent === undefined)) return jsonError(res, 400, 'بيانات حافة النسب غير صالحة.', 'INVALID_LINEAGE');
      const edge = await addLineageEdge(db, { productId: req.params.productId, parentRecipeVersionId: parent ?? null, childRecipeVersionId: child, relation, note: text(req.body?.note, 0, 300) || '', createdByUserId: req.auth!.user.id });
      res.status(201).json(edge);
    } catch (error) { handleError(res, error); }
  });
  router.get('/lineage/:productId', async (req: AuthenticatedRequest, res) => {
    const owner = await productOwner(req.params.productId);
    if (!owner) return jsonError(res, 404, 'المنتج غير موجود.', 'NOT_FOUND');
    const hostLinked = await db.prepare('SELECT 1 FROM collaborations WHERE product_id = ? AND organization_id = ? LIMIT 1').get(req.params.productId, req.auth!.user.hostBusinessId ?? '');
    if (req.auth!.user.creatorId !== owner.creator_id && !isAdmin(req) && !hostLinked) return jsonError(res, 403, 'نسب الوصفة غير متاح.', 'FORBIDDEN');
    res.json(await buildLineageGraph(db, req.params.productId));
  });

  // --- Reputation Without Disclosure (Trust Proof) ------------------------------------
  router.post('/trust/creator/:creatorId/attestation', async (req: AuthenticatedRequest, res) => {
    try {
      if (req.auth!.user.creatorId !== req.params.creatorId && !isAdmin(req)) return jsonError(res, 403, 'إصدار إثبات الثقة للمبدع المالك فقط.', 'FORBIDDEN');
      const windowDays = integer(req.body?.windowDays, 30, 1095) ?? 365;
      const validityDays = integer(req.body?.validityDays, 1, 90) ?? 30;
      res.status(201).json(await issueCreatorTrustAttestation(db, req.params.creatorId, windowDays, validityDays));
    } catch (error) { handleError(res, error); }
  });
  router.post('/trust/verify', async (req: AuthenticatedRequest, res) => {
    try {
      const claims = req.body?.claims as TrustClaims | undefined;
      const signature = text(req.body?.signature, 32, 128);
      if (!claims || typeof claims !== 'object' || !signature) return jsonError(res, 400, 'المطالبة أو التوقيع غير صالح.', 'INVALID_ATTESTATION');
      res.json(verifyAttestation(claims, signature));
    } catch (error) { handleError(res, error); }
  });

  // --- Recipe Canary Fingerprint (creator owner issues; owner/admin traces) -----------
  const recipeOwner = async (recipeVersionId: string) => db.prepare('SELECT rv.id, rv.product_id, p.creator_id FROM recipe_versions rv JOIN products p ON p.id = rv.product_id WHERE rv.id = ?').get<{ id: string; product_id: string; creator_id: string }>(recipeVersionId);
  router.post('/canary/:recipeVersionId', async (req: AuthenticatedRequest, res) => {
    try {
      const recipe = await recipeOwner(req.params.recipeVersionId);
      if (!recipe) return jsonError(res, 404, 'نسخة الوصفة غير موجودة.', 'NOT_FOUND');
      if (req.auth!.user.creatorId !== recipe.creator_id && !isAdmin(req)) return jsonError(res, 403, 'إصدار البصمة للمبدع المالك فقط.', 'FORBIDDEN');
      const organizationId = text(req.body?.organizationId, 3, 120), purpose = text(req.body?.purpose, 3, 200);
      if (!organizationId || !purpose) return jsonError(res, 400, 'بيانات البصمة غير صالحة.', 'INVALID_CANARY');
      res.status(201).json(await issueCanary(db, req.params.recipeVersionId, organizationId, purpose, req.auth!.user.id));
    } catch (error) { handleError(res, error); }
  });
  router.post('/canary/trace', async (req: AuthenticatedRequest, res) => {
    try {
      const code = text(req.body?.canaryCode, 8, 64);
      if (!code) return jsonError(res, 400, 'رمز البصمة غير صالح.', 'INVALID_CANARY_CODE');
      const result = await traceCanary(db, code);
      if (!result.matched) return res.status(404).json({ matched: false });
      const owner = await recipeOwner(result.recipeVersionId!);
      if (req.auth!.user.creatorId !== owner?.creator_id && !isAdmin(req)) return jsonError(res, 403, 'تتبّع البصمة للمبدع المالك أو الإدارة فقط.', 'FORBIDDEN');
      res.json(result);
    } catch (error) { handleError(res, error); }
  });
  router.post('/canary/:id/revoke', async (req: AuthenticatedRequest, res) => {
    try {
      const row = await db.prepare('SELECT c.id, p.creator_id FROM recipe_canaries c JOIN recipe_versions rv ON rv.id = c.recipe_version_id JOIN products p ON p.id = rv.product_id WHERE c.id = ?').get<{ id: string; creator_id: string }>(req.params.id);
      if (!row) return jsonError(res, 404, 'البصمة غير موجودة.', 'NOT_FOUND');
      if (req.auth!.user.creatorId !== row.creator_id && !isAdmin(req)) return jsonError(res, 403, 'الإلغاء للمبدع المالك فقط.', 'FORBIDDEN');
      res.json(await revokeCanary(db, req.params.id));
    } catch (error) { handleError(res, error); }
  });

  // --- Counterfactual Deal Engine (collaboration parties/admin) ------------------------
  router.post('/counterfactual/:collaborationId', async (req: AuthenticatedRequest, res) => {
    try {
      const col = await collabParty(req, req.params.collaborationId);
      if (col === undefined) return jsonError(res, 404, 'التعاون غير موجود.', 'NOT_FOUND');
      if (col === null) return jsonError(res, 403, 'التعاون غير متاح.', 'FORBIDDEN');
      const offerAId = text(req.body?.offerAId, 3, 120), offerBId = text(req.body?.offerBId, 3, 120);
      if (!offerAId || !offerBId) return jsonError(res, 400, 'يلزم تحديد عرضين للمقارنة.', 'OFFERS_REQUIRED');
      const a = await loadOfferTerms(db, col.id, offerAId), b = await loadOfferTerms(db, col.id, offerBId);
      if (!a || !b) return jsonError(res, 404, 'أحد العرضين غير موجود في هذا التعاون.', 'OFFER_NOT_FOUND');
      const assumptions: CounterfactualAssumptions = {
        unitsPerMonth: integer(req.body?.unitsPerMonth, 1, 1_000_000) ?? 1000,
        unitCostFils: integer(req.body?.unitCostFils, 0, 50_000_000) ?? 0,
        marketingFilsPerMonth: integer(req.body?.marketingFilsPerMonth, 0, 100_000_000) ?? 0,
        demandVarianceBp: integer(req.body?.demandVarianceBp, 0, 9000) ?? 3000
      };
      res.json({ collaborationId: col.id, offerAId, offerBId, ...computeCounterfactual(a, b, assumptions) });
    } catch (error) { handleError(res, error); }
  });

  // --- Operational Twin (host owner records; host member/admin forecasts) --------------
  router.post('/operational-twin/:organizationId/samples', async (req: AuthenticatedRequest, res) => {
    try {
      if (!isHostMember(req, req.params.organizationId)) return jsonError(res, 403, 'تسجيل العينات للمنشأة المخولة فقط.', 'FORBIDDEN');
      const predictedUnits = integer(req.body?.predictedUnits, 0, 10_000_000), actualUnits = integer(req.body?.actualUnits, 0, 10_000_000);
      const predictedPrepMinutes = integer(req.body?.predictedPrepMinutes, 0, 100_000), actualPrepMinutes = integer(req.body?.actualPrepMinutes, 0, 100_000);
      if (predictedUnits === undefined || actualUnits === undefined || predictedPrepMinutes === undefined || actualPrepMinutes === undefined) return jsonError(res, 400, 'بيانات العينة غير صالحة.', 'INVALID_SAMPLE');
      const collaborationId = req.body?.collaborationId == null ? null : text(req.body?.collaborationId, 3, 120) ?? null;
      res.status(201).json(await recordTwinSample(db, { organizationId: req.params.organizationId, collaborationId, predictedUnits, actualUnits, predictedPrepMinutes, actualPrepMinutes, createdByUserId: req.auth!.user.id }));
    } catch (error) { handleError(res, error); }
  });
  router.post('/operational-twin/:organizationId/forecast', async (req: AuthenticatedRequest, res) => {
    try {
      if (!isHostMember(req, req.params.organizationId)) return jsonError(res, 403, 'التوقّع للمنشأة المخولة فقط.', 'FORBIDDEN');
      const baselineUnits = integer(req.body?.baselineUnits, 0, 10_000_000), baselinePrepMinutes = integer(req.body?.baselinePrepMinutes, 0, 100_000);
      if (baselineUnits === undefined || baselinePrepMinutes === undefined) return jsonError(res, 400, 'قيم الأساس غير صالحة.', 'INVALID_BASELINE');
      const calibration = await loadCalibration(db, req.params.organizationId);
      res.json(forecastWithTwin(baselineUnits, baselinePrepMinutes, calibration));
    } catch (error) { handleError(res, error); }
  });

  // --- Threshold Recipe Escrow (creator owner seals; k holders reveal) -----------------
  router.post('/threshold-escrow/:recipeVersionId', async (req: AuthenticatedRequest, res) => {
    try {
      const recipe = await recipeOwner(req.params.recipeVersionId);
      if (!recipe) return jsonError(res, 404, 'نسخة الوصفة غير موجودة.', 'NOT_FOUND');
      if (req.auth!.user.creatorId !== recipe.creator_id && !isAdmin(req)) return jsonError(res, 403, 'ختم العتبة للمبدع المالك فقط.', 'FORBIDDEN');
      const holders = Array.isArray(req.body?.holders) ? req.body.holders.map((h: unknown) => text((h as { ref?: unknown })?.ref, 2, 80)).filter(Boolean).slice(0, 32) as string[] : [];
      const threshold = integer(req.body?.threshold, 2, 32);
      const payload = req.body?.recipe;
      if (holders.length < 2 || threshold === undefined || threshold > holders.length || payload == null || typeof payload !== 'object') {
        return jsonError(res, 400, 'حاملو الأجزاء أو العتبة أو محتوى الوصفة غير صالح.', 'INVALID_THRESHOLD_ESCROW');
      }
      const result = await createThresholdEscrow(db, { productId: recipe.product_id, recipeVersionId: req.params.recipeVersionId, holders: holders.map(ref => ({ ref })), threshold, recipe: payload, createdByUserId: req.auth!.user.id });
      // Shares are returned exactly once here; they are never persisted server-side.
      res.status(201).json(result);
    } catch (error) { handleError(res, error); }
  });
  router.post('/threshold-escrow/:id/reveal', async (req: AuthenticatedRequest, res) => {
    try {
      await assertKillSwitchClear(db, 'RECIPE_REVEALS'); // breach containment also freezes threshold reveals
      const escrow = await db.prepare('SELECT te.id, p.creator_id FROM threshold_escrows te JOIN products p ON p.id = te.product_id WHERE te.id = ?').get<{ id: string; creator_id: string }>(req.params.id);
      if (!escrow) return jsonError(res, 404, 'الختم غير موجود.', 'NOT_FOUND');
      // Presenting the shares is the true gate; we still require the caller to be a party.
      const linked = await db.prepare('SELECT 1 FROM collaborations c JOIN threshold_escrows te ON te.product_id = c.product_id WHERE te.id = ? AND c.organization_id = ? LIMIT 1').get(req.params.id, req.auth!.user.hostBusinessId ?? '');
      if (req.auth!.user.creatorId !== escrow.creator_id && !isAdmin(req) && !linked) return jsonError(res, 403, 'الكشف للأطراف المخولة فقط.', 'FORBIDDEN');
      const shares = Array.isArray(req.body?.shares) ? req.body.shares.map((s: unknown) => text(s, 4, 512)).filter(Boolean) as string[] : [];
      if (shares.length < 2) return jsonError(res, 400, 'يلزم تقديم أجزاء كافية للكشف.', 'SHARES_REQUIRED');
      res.json(await revealThresholdEscrow(db, req.params.id, shares));
    } catch (error) { handleError(res, error); }
  });
  router.post('/threshold-escrow/:id/revoke', async (req: AuthenticatedRequest, res) => {
    try {
      const escrow = await db.prepare('SELECT te.id, p.creator_id FROM threshold_escrows te JOIN products p ON p.id = te.product_id WHERE te.id = ?').get<{ id: string; creator_id: string }>(req.params.id);
      if (!escrow) return jsonError(res, 404, 'الختم غير موجود.', 'NOT_FOUND');
      if (req.auth!.user.creatorId !== escrow.creator_id && !isAdmin(req)) return jsonError(res, 403, 'الإلغاء للمبدع المالك فقط.', 'FORBIDDEN');
      res.json(await revokeThresholdEscrow(db, req.params.id));
    } catch (error) { handleError(res, error); }
  });

  // --- Proof-of-Reserves --------------------------------------------------------------
  router.post('/reserves/attest', requireRoles('ADMIN', 'SUPER_ADMIN'), async (req: AuthenticatedRequest, res) => {
    try { res.status(201).json(await buildReserveAttestation(db, req.auth!.user.id)); } catch (error) { handleError(res, error); }
  });
  router.get('/reserves/:attestationId/proof', async (req: AuthenticatedRequest, res) => {
    const creatorId = req.auth!.user.creatorId;
    if (!creatorId) return jsonError(res, 403, 'إثبات الاحتياطي للمبدعين فقط.', 'CREATOR_REQUIRED');
    const proof = await reserveProofForCreator(db, req.params.attestationId, creatorId);
    if (!proof) return jsonError(res, 404, 'لا يوجد إثبات لك في هذه الشهادة.', 'NOT_FOUND');
    res.json(proof);
  });
  router.post('/reserves/verify', async (req: AuthenticatedRequest, res) => {
    const creatorId = text(req.body?.creatorId, 3, 120), salt = text(req.body?.salt, 4, 64), root = text(req.body?.merkleRoot, 64, 64);
    const amountFils = integer(req.body?.amountFils, 0, 1_000_000_000_000);
    const proof = Array.isArray(req.body?.proof) ? req.body.proof : null;
    if (!creatorId || !salt || !root || amountFils === undefined || !proof) return jsonError(res, 400, 'بيانات التحقق غير صالحة.', 'INVALID_PROOF');
    res.json({ included: verifyReserveInclusion(creatorId, amountFils, salt, proof, root) });
  });

  // --- Tamper-Evident Time ------------------------------------------------------------
  router.post('/time-anchor', requireRoles('ADMIN', 'SUPER_ADMIN'), async (_req: AuthenticatedRequest, res) => {
    try { res.status(201).json(await createTimeAnchor(db)); } catch (error) { handleError(res, error); }
  });
  router.get('/time-anchor/verify', requireRoles('ADMIN', 'SUPER_ADMIN'), async (_req: AuthenticatedRequest, res) => {
    const result = await verifyTimeAnchors(db);
    res.status(result.valid ? 200 : 409).json(result);
  });

  // --- Sealed Compute Reveal ----------------------------------------------------------
  router.post('/sealed-compute/:recipeVersionId', async (req: AuthenticatedRequest, res) => {
    try {
      const recipe = await recipeOwner(req.params.recipeVersionId);
      if (!recipe) return jsonError(res, 404, 'نسخة الوصفة غير موجودة.', 'NOT_FOUND');
      if (req.auth!.user.creatorId !== recipe.creator_id && !isAdmin(req)) return jsonError(res, 403, 'الختم الحسابي للمبدع المالك فقط.', 'FORBIDDEN');
      const payload = req.body?.recipe as SealedRecipe | undefined;
      if (!payload || typeof payload !== 'object' || !Array.isArray(payload.ingredients)) return jsonError(res, 400, 'بنية الوصفة غير صالحة.', 'INVALID_SEALED_RECIPE');
      res.status(201).json(await createSealedProfile(db, recipe.product_id, req.params.recipeVersionId, payload, req.auth!.user.id));
    } catch (error) { handleError(res, error); }
  });
  router.post('/sealed-compute/:id/run', async (req: AuthenticatedRequest, res) => {
    try {
      const profile = await db.prepare('SELECT sc.id, sc.product_id, p.creator_id FROM sealed_compute_profiles sc JOIN products p ON p.id = sc.product_id WHERE sc.id = ?').get<{ id: string; product_id: string; creator_id: string }>(req.params.id);
      if (!profile) return jsonError(res, 404, 'الملف الحسابي غير موجود.', 'NOT_FOUND');
      const linked = await db.prepare('SELECT 1 FROM collaborations WHERE product_id = ? AND organization_id = ? LIMIT 1').get(profile.product_id, req.auth!.user.hostBusinessId ?? '');
      if (req.auth!.user.creatorId !== profile.creator_id && !isAdmin(req) && !linked) return jsonError(res, 403, 'التشغيل للأطراف المخولة فقط.', 'FORBIDDEN');
      const requestedUnits = integer(req.body?.requestedUnits, 1, 100_000_000);
      if (requestedUnits === undefined) return jsonError(res, 400, 'عدد الوحدات المطلوب غير صالح.', 'INVALID_REQUEST');
      res.json(await runSealedCompute(db, req.params.id, { requestedUnits }));
    } catch (error) { handleError(res, error); }
  });
  router.post('/sealed-compute/:id/revoke', async (req: AuthenticatedRequest, res) => {
    try {
      const profile = await db.prepare('SELECT sc.id, p.creator_id FROM sealed_compute_profiles sc JOIN products p ON p.id = sc.product_id WHERE sc.id = ?').get<{ id: string; creator_id: string }>(req.params.id);
      if (!profile) return jsonError(res, 404, 'الملف الحسابي غير موجود.', 'NOT_FOUND');
      if (req.auth!.user.creatorId !== profile.creator_id && !isAdmin(req)) return jsonError(res, 403, 'الإلغاء للمبدع المالك فقط.', 'FORBIDDEN');
      res.json(await revokeSealedProfile(db, req.params.id));
    } catch (error) { handleError(res, error); }
  });

  return router;
}

function handleError(res: Response, error: unknown) {
  const candidate = error as { status?: number; message?: string };
  const status = Number(candidate?.status) || 400;
  const safe: Record<string, string> = {
    FLOOR_ABOVE_INITIAL: 'حد التوقف يجب أن يكون أقل من التعرّض الابتدائي.',
    EXPOSURE_GRANT_NOT_FOUND: 'المنح غير موجود.',
    NO_ACCEPTED_OFFER: 'لا يوجد عرض مقبول لتحليل الانحراف.',
    KILL_SWITCH_ENGAGED_RECIPE_REVEALS: 'كشف الأسرار مجمّد مؤقتًا بأمر احتواء أمني.',
    KILL_SWITCH_ENGAGED_SETTLEMENTS: 'التسويات مجمّدة مؤقتًا بأمر احتواء أمني.',
    KILL_SWITCH_ENGAGED_WEBHOOKS: 'استقبال إشعارات المزوّد مجمّد مؤقتًا.',
    TRUST_ATTESTATION_NOT_CONFIGURED: 'مفتاح توقيع إثبات الثقة غير مهيأ في هذه البيئة.',
    LINEAGE_CYCLE_FORBIDDEN: 'لا يمكن إنشاء دورة في رسم نسب الوصفة.',
    CHILD_VERSION_NOT_IN_PRODUCT: 'نسخة الوصفة لا تتبع هذا المنتج.',
    PARENT_VERSION_NOT_IN_PRODUCT: 'النسخة الأصل لا تتبع هذا المنتج.',
    PARENT_REQUIRED: 'العلاقة تتطلب نسخة أصل.',
    ORIGIN_HAS_NO_PARENT: 'علاقة الأصل لا تقبل نسخة أصل.',
    SELF_EDGE_FORBIDDEN: 'لا يمكن ربط النسخة بنفسها.',
    CANARY_NOT_CONFIGURED: 'مفتاح توقيع بصمة الوصفة غير مهيأ في هذه البيئة.',
    THRESHOLD_INSUFFICIENT_SHARES: 'عدد الأجزاء الصحيحة أقل من عتبة الكشف.',
    THRESHOLD_RECONSTRUCTION_FAILED: 'تعذّر إعادة بناء المفتاح من الأجزاء المقدّمة.',
    THRESHOLD_ESCROW_REVOKED: 'الختم مُلغى ولا يمكن كشفه.',
    THRESHOLD_INVALID_PARAMS: 'معطيات ختم العتبة غير صالحة.',
    SEALED_COMPUTE_NOT_CONFIGURED: 'مفتاح الحوسبة المختومة غير مهيأ في هذه البيئة.',
    SEALED_PROFILE_NOT_FOUND: 'الملف الحسابي غير موجود.',
    SEALED_RECIPE_INVALID: 'بنية الوصفة المختومة غير صالحة.',
    SEALED_REQUEST_INVALID: 'طلب الحوسبة غير صالح.'
  };
  res.status(status).json({ error: safe[candidate?.message || ''] || 'تعذّر تنفيذ العملية.', code: candidate?.message || 'ADVANCED_OPERATION_FAILED' });
}
