import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { Response, Router } from 'express';
import { AuthConfig, AuthenticatedRequest, requireAuth, requireCsrf, requireRoles } from './auth';
import { MajalDatabase, withTransaction } from './database';
import { deleteEncryptedObject, getEncryptedJson, googleAccessToken, putEncryptedJson } from './secure-storage';
import { appendLedgerEntry } from './ledger';
import { assertKillSwitchClear } from './kill-switch';

const now = () => new Date().toISOString();
const sha256 = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const canonical = (value: unknown): string => {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map(key => `${JSON.stringify(key)}:${canonical(record[key])}`).join(',')}}`;
};
const jsonError = (res: Response, status: number, message: string, code: string) => res.status(status).json({ error: message, code });
const text = (value: unknown, min = 1, max = 500) => typeof value === 'string' && value.trim().length >= min && value.trim().length <= max ? value.trim() : undefined;
const integer = (value: unknown, min: number, max: number) => Number.isInteger(Number(value)) && Number(value) >= min && Number(value) <= max ? Number(value) : undefined;
const bool = (value: unknown) => value === true || value === false ? value : undefined;
const requestId = (req: AuthenticatedRequest) => text(req.header('x-request-id'), 8, 128) || randomUUID();

type CollabRow = { id: string; product_id: string; creator_id: string; organization_id: string; stage: string; version: number };
type OfferRow = { id: string; collaboration_id: string; version_number: number; sender_user_id: string; selling_price_fils: number | string; creator_royalty_basis_points: number | string; platform_fee_basis_points: number | string; status: string; terms_json: string };
type ContractRow = { id: string; collaboration_id: string; version_number: number; document_sha256: string; object_storage_key: string; status: string };
type RecipeRow = { id: string; product_id: string; version_number: number; encrypted_payload: string; payload_sha256: string };

async function audit(db: MajalDatabase, req: AuthenticatedRequest, action: string, entityType: string, entityId: string, before?: unknown, after?: unknown, organizationId?: string | null) {
  const auth = req.auth!;
  await db.prepare(`INSERT INTO domain_audit_events(actor_user_id, actor_role, organization_id, action, entity_type, entity_id, before_sha256, after_sha256, request_id, session_hash, created_at)
    VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(auth.user.id, auth.user.role, organizationId ?? auth.user.hostBusinessId ?? null, action, entityType, entityId,
      before === undefined ? null : sha256(canonical(before)), after === undefined ? null : sha256(canonical(after)), requestId(req), sha256(auth.tokenHash), now());
}

function isAdmin(req: AuthenticatedRequest) { return req.auth?.user.role === 'ADMIN' || req.auth?.user.role === 'SUPER_ADMIN'; }
function isCreator(req: AuthenticatedRequest, creatorId: string) { return req.auth?.user.creatorId === creatorId || isAdmin(req); }
function isHost(req: AuthenticatedRequest, organizationId: string, ownerOnly = false) {
  if (isAdmin(req)) return true;
  if (req.auth?.user.hostBusinessId !== organizationId) return false;
  return ownerOnly ? req.auth.user.role === 'HOST_OWNER' : ['HOST_OWNER', 'HOST_OPERATIONS', 'HOST_FINANCE'].includes(req.auth!.user.role);
}
// Decrypted L3 recipe disclosure is limited to the collaborating org's HOST_CHEF only — a
// faithful mirror of VIEW_RECIPE_L3 in the role matrix (src/lib/permissions.ts) and
// SECURITY_MODEL.md, which grant full-secret visibility to no one else: not HOST_OWNER/
// OPERATIONS/FINANCE (whom the old generic isHost() wrongly admitted), and deliberately NOT
// platform ADMIN/SUPER_ADMIN either (permissions.test.ts asserts canViewFullRecipe(admin)===false;
// "SUPER_ADMIN does not silently impersonate the creator"). The creator is the discloser, not a
// reader of this endpoint, so is intentionally excluded here.
export function canReadRecipeDisclosure(user: { role: string; hostBusinessId?: string | null }, organizationId: string): boolean {
  return user.role === 'HOST_CHEF' && !!user.hostBusinessId && user.hostBusinessId === organizationId;
}

// Marks a settlement batch PAID exactly once. Every money side effect (accrual PAID, the
// append-only SETTLEMENT_PAID ledger entry, and the audit row via onApplied) is gated on the
// guarded state transition actually changing a row. A retried or raced reconciliation call
// finds the batch already PAID (0 rows changed) and is a pure no-op — never a second,
// unremovable payout entry on the tamper-evident ledger.
export async function applySettlementPaid(
  db: MajalDatabase,
  batchId: string,
  providerReference: string,
  onApplied?: (tx: MajalDatabase, batch: Record<string, unknown>) => Promise<void>
): Promise<{ applied: boolean; status: string }> {
  return withTransaction(db, async tx => {
    const batch = await tx.prepare('SELECT * FROM settlement_batches WHERE id=?').get<Record<string, unknown>>(batchId);
    if (!batch) throw Object.assign(new Error('NOT_FOUND'), { status: 404 });
    const updated = await tx.prepare("UPDATE settlement_batches SET status='PAID',provider_reference=?,updated_at=? WHERE id=? AND status IN ('APPROVED','PROCESSING')").run(providerReference, now(), batchId);
    if (updated.changes !== 1) return { applied: false, status: String(batch.status) };
    await tx.prepare("UPDATE accruals SET status='PAID',updated_at=? WHERE creator_id=? AND status='LOCKED'").run(now(), String(batch.creator_id));
    await appendLedgerEntry(tx, { scope: 'SETTLEMENT', entryType: 'SETTLEMENT_PAID', entityType: 'SETTLEMENT_BATCH', entityId: batchId, amountFils: -Number(batch.total_fils), currency: 'KWD', meta: { creatorId: String(batch.creator_id), providerReference } });
    if (onApplied) await onApplied(tx, batch);
    return { applied: true, status: 'PAID' };
  });
}

async function collaboration(db: MajalDatabase, id: string) {
  return db.prepare('SELECT * FROM collaborations WHERE id = ? LIMIT 1').get<CollabRow>(id);
}
async function ensureCollabParty(db: MajalDatabase, req: AuthenticatedRequest, id: string) {
  const row = await collaboration(db, id);
  if (!row || (!isCreator(req, row.creator_id) && !isHost(req, row.organization_id))) return undefined;
  return row;
}

async function withIdempotency<T>(db: MajalDatabase, req: AuthenticatedRequest, scope: string, operation: () => Promise<T>): Promise<T> {
  const key = text(req.header('idempotency-key'), 12, 128);
  if (!key) throw Object.assign(new Error('IDEMPOTENCY_KEY_REQUIRED'), { status: 400 });
  const bodyHash = sha256(canonical(req.body ?? null));
  const previous = await db.prepare('SELECT actor_user_id, request_sha256, response_json FROM domain_idempotency_keys WHERE scope = ? AND idempotency_key = ? AND expires_at > ? LIMIT 1')
    .get<{actor_user_id:string;request_sha256:string;response_json:string}>(scope, key, now());
  if (previous) {
    if (previous.actor_user_id !== req.auth!.user.id || previous.request_sha256 !== bodyHash) throw Object.assign(new Error('IDEMPOTENCY_CONFLICT'), { status: 409 });
    return JSON.parse(previous.response_json) as T;
  }
  const result = await operation();
  const createdAt = now();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60_000).toISOString();
  await db.prepare(`INSERT INTO domain_idempotency_keys(scope, idempotency_key, actor_user_id, request_sha256, response_json, created_at, expires_at)
    VALUES(?, ?, ?, ?, ?, ?, ?)`)
    .run(scope, key, req.auth!.user.id, bodyHash, canonical(result), createdAt, expiresAt);
  return result;
}

function publicProduct(row: Record<string, unknown>) {
  return {
    id: row.id, creatorId: row.creator_id, publicName: row.public_name, category: row.category,
    shortDescription: row.short_description, status: row.status,
    estimatedUnitCostFils: Number(row.estimated_unit_cost_fils), targetPriceFils: Number(row.target_price_fils),
    isSecretRecipe: Boolean(row.is_secret_recipe), createdAt: row.created_at, updatedAt: row.updated_at
  };
}

async function launchGate(db: MajalDatabase, collab: CollabRow) {
  const org = await db.prepare('SELECT verification_status FROM organizations WHERE id = ?').get<{verification_status:string}>(collab.organization_id);
  const contract = await db.prepare("SELECT status FROM contract_versions WHERE collaboration_id = ? ORDER BY version_number DESC LIMIT 1").get<{status:string}>(collab.id);
  const manual = await db.prepare('SELECT gate_key, value FROM launch_gate_items WHERE collaboration_id = ?').all<{gate_key:string;value:number}>(collab.id);
  const map = Object.fromEntries(manual.map(i => [i.gate_key, Boolean(i.value)]));
  const manualKeys = ['productionRecipeApproved','productNamePriceApproved','packagingDataCompleted','productionLocationSelected','settlementConfigApproved'];
  const gate = {
    hostVerified: org?.verification_status === 'VERIFIED',
    contractSigned: contract?.status === 'FULLY_SIGNED',
    ...Object.fromEntries(manualKeys.map(k => [k, map[k] === true]))
  };
  return { ...gate, allRequirementsPassed: Object.values(gate).every(Boolean) };
}

function fairnessScenarios(priceFils: number, royaltyBp: number, platformBp: number, assumptions: { unitsPerMonth: number; unitCostFils: number; marketingFilsPerMonth: number }) {
  return [3, 6, 12].map(months => {
    const revenue = priceFils * assumptions.unitsPerMonth * months;
    const creator = Math.round(revenue * royaltyBp / 10_000);
    const platform = Math.round(revenue * platformBp / 10_000);
    const operations = assumptions.unitCostFils * assumptions.unitsPerMonth * months;
    const marketing = assumptions.marketingFilsPerMonth * months;
    const host = revenue - creator - platform - operations - marketing;
    return { months, revenueFils: revenue, creatorFils: creator, platformFils: platform, operationsFils: operations, marketingFils: marketing, hostResidualFils: host, hostMarginBp: revenue ? Math.round(host * 10_000 / revenue) : 0 };
  });
}

function shadowSim(seed: string, input: {orders:number;stock:number;staff:number;couriers:number;minutes:number}) {
  let state = Number.parseInt(sha256(seed).slice(0, 8), 16) >>> 0;
  const rnd = () => ((state = (1664525 * state + 1013904223) >>> 0) / 0x100000000);
  let stock = input.stock, accepted = 0, rejected = 0, maxQueue = 0, queue = 0, delayed = 0;
  const events: Array<{minute:number;orders:number;queue:number;stock:number}> = [];
  for (let minute=1; minute<=input.minutes; minute++) {
    const arrivals = Math.max(0, Math.round(input.orders / input.minutes * (0.65 + rnd() * 0.7)));
    const canStock = Math.min(stock, arrivals);
    const capacity = Math.max(1, input.staff * 4 + input.couriers * 2);
    const processed = Math.min(queue + canStock, capacity);
    queue = Math.max(0, queue + canStock - processed);
    stock -= canStock;
    accepted += canStock;
    rejected += arrivals - canStock;
    if (queue > capacity * 2) delayed += queue - capacity * 2;
    maxQueue = Math.max(maxQueue, queue);
    events.push({ minute, orders: arrivals, queue, stock });
  }
  return { acceptedOrders: accepted, rejectedOrders: rejected, remainingStock: stock, maxQueue, delayedUnits: delayed, bottleneck: stock === 0 ? 'STOCK' : maxQueue > input.staff * 8 ? 'KITCHEN' : input.couriers < Math.ceil(input.staff/2) ? 'DELIVERY' : 'NONE', financialEffectFils: 0, events };
}

async function documentAiExtract(contentBase64: string, mimeType: string) {
  const processor = process.env.DOCUMENT_AI_PROCESSOR_NAME?.trim();
  if (!processor) throw Object.assign(new Error('DOCUMENT_AI_NOT_CONFIGURED'), { status: 503 });
  const token = await googleAccessToken();
  const response = await fetch(`https://documentai.googleapis.com/v1/${processor}:process`, {
    method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ rawDocument: { content: contentBase64, mimeType } }), signal: AbortSignal.timeout(30_000)
  });
  const payload = await response.json() as { document?: { text?:string; entities?: Array<{type?:string;mentionText?:string;confidence?:number;normalizedValue?:{text?:string}}> }; error?: unknown };
  if (!response.ok || !payload.document) throw Object.assign(new Error(`DOCUMENT_AI_FAILED_${response.status}`), { status: 502 });
  const fields: Record<string,string> = {}, confidence: Record<string,number> = {};
  for (const entity of payload.document.entities ?? []) {
    if (!entity.type) continue;
    fields[entity.type] = entity.normalizedValue?.text || entity.mentionText || '';
    confidence[entity.type] = Math.max(0, Math.min(1, Number(entity.confidence || 0)));
  }
  return { fields, confidence, textSha256: sha256(payload.document.text || '') };
}

export function createDomainRouter(db: MajalDatabase, authConfig: AuthConfig) {
  const router = Router();
  const authenticated = requireAuth(db, authConfig);
  const csrf = requireCsrf(authConfig);
  router.use(authenticated);
  router.use(csrf);

  router.get('/snapshot', async (req: AuthenticatedRequest, res) => {
    const user = req.auth!.user;
    const filter = isAdmin(req) ? { clause: '1=1', args: [] as unknown[] } : user.creatorId ? { clause: 'p.creator_id = ?', args: [user.creatorId] } : user.hostBusinessId ? { clause: 'EXISTS (SELECT 1 FROM collaborations c WHERE c.product_id=p.id AND c.organization_id=?)', args: [user.hostBusinessId] } : { clause: '1=0', args: [] };
    const products = await db.prepare(`SELECT p.* FROM products p WHERE ${filter.clause} ORDER BY p.created_at DESC LIMIT 500`).all(...filter.args) as Record<string,unknown>[];
    const collabs = user.creatorId ? await db.prepare('SELECT * FROM collaborations WHERE creator_id = ? ORDER BY updated_at DESC LIMIT 500').all(user.creatorId) : user.hostBusinessId ? await db.prepare('SELECT * FROM collaborations WHERE organization_id = ? ORDER BY updated_at DESC LIMIT 500').all(user.hostBusinessId) : isAdmin(req) ? await db.prepare('SELECT * FROM collaborations ORDER BY updated_at DESC LIMIT 500').all() : [];
    res.json({ products: products.map(publicProduct), collaborations: collabs });
  });

  router.post('/products', async (req: AuthenticatedRequest, res) => {
    try {
      if (!req.auth!.user.creatorId) {
        const existingCr = await db.prepare('SELECT id FROM creator_profiles WHERE user_id = ?').get<{id: string}>(req.auth!.user.id);
        let crId = existingCr?.id;
        if (!crId) {
          crId = `cr_${randomUUID().slice(0, 8)}`;
          const nowStr = new Date().toISOString();
          await db.prepare("INSERT INTO creator_profiles(id, user_id, display_name, specialty, completion_score, matching_enabled, created_at, updated_at) VALUES(?, ?, ?, ?, 100, 1, ?, ?)")
            .run(crId, req.auth!.user.id, req.auth!.user.name || 'مبدع طهي معتمد', 'ابتكار الأطباق والمنتجات', nowStr, nowStr);
        }
        await db.prepare('UPDATE users SET creator_id = ? WHERE id = ?').run(crId, req.auth!.user.id);
        req.auth!.user.creatorId = crId;
      }
      const publicName=text(req.body?.publicName,2,140), category=text(req.body?.category,2,80), description=text(req.body?.shortDescription,5,1500);
      const cost=integer(req.body?.estimatedUnitCostFils,0,50_000_000), price=integer(req.body?.targetPriceFils,1,50_000_000), recipe=req.body?.recipe;
      if (!publicName||!category||!description||cost===undefined||price===undefined||!recipe||typeof recipe!=='object') return jsonError(res,400,'بيانات المنتج أو الوصفة غير صالحة.','INVALID_PRODUCT');
      const result = await withIdempotency(db, req, 'PRODUCT_CREATE', async () => {
        const productId=`prd_${randomUUID()}`, recipeId=`rcp_${randomUUID()}`, created=now();
        const receipt=await putEncryptedJson('recipes',recipeId,recipe);
        await withTransaction(db, async tx => {
          await tx.prepare('INSERT INTO products(id, creator_id, public_name, category, short_description, status, estimated_unit_cost_fils, target_price_fils, is_secret_recipe, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)')
            .run(productId,req.auth!.user.creatorId,publicName,category,description,'DRAFT',cost,price,created,created);
          await tx.prepare('INSERT INTO recipe_versions(id, product_id, version_number, encrypted_payload, payload_sha256, created_by_user_id, created_at) VALUES(?, ?, 1, ?, ?, ?, ?)')
            .run(recipeId,productId,JSON.stringify({objectKey:receipt.objectKey,storage:receipt.storageProvider,ciphertextSha256:receipt.ciphertextSha256}),receipt.plaintextSha256,req.auth!.user.id,created);
          await audit(tx,req,'PRODUCT_CREATED','PRODUCT',productId,undefined,{publicName,category,recipeSha256:receipt.plaintextSha256});
        });
        return { id:productId, recipeVersionId:recipeId, status:'DRAFT', recipeSha256:receipt.plaintextSha256 };
      });
      res.status(201).json(result);
    } catch(e) { handleDomainError(res,e); }
  });

  router.post('/recipe-access', async (req: AuthenticatedRequest,res) => {
    try {
      const productId=text(req.body?.productId,3,120), level=integer(req.body?.disclosureLevel,1,3), purpose=text(req.body?.purpose,3,500);
      const org=req.auth!.user.hostBusinessId;
      if(!productId||level===undefined||!purpose||!org||!isHost(req,org)) return jsonError(res,403,'بيانات الطلب أو الصلاحية غير صالحة.','FORBIDDEN');
      const product=await db.prepare('SELECT creator_id FROM products WHERE id=?').get<{creator_id:string}>(productId); if(!product) return jsonError(res,404,'المنتج غير موجود.','NOT_FOUND');
      const result=await withIdempotency(db,req,'RECIPE_ACCESS_REQUEST',async()=>{
        const id=`rag_${randomUUID()}`, created=now();
        await db.prepare('INSERT INTO recipe_access_grants(id, product_id, creator_id, organization_id, disclosure_level, status, purpose, requested_by_user_id, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
          .run(id,productId,product.creator_id,org,level,'REQUESTED',purpose,req.auth!.user.id,created,created);
        await audit(db,req,'RECIPE_ACCESS_REQUESTED','RECIPE_ACCESS_GRANT',id,undefined,{productId,level,purpose},org);
        return {id,status:'REQUESTED'};
      }); res.status(201).json(result);
    }catch(e){handleDomainError(res,e)}
  });

  router.post('/recipe-access/:id/approve', async (req: AuthenticatedRequest,res)=>{
    try { const grant=await db.prepare('SELECT * FROM recipe_access_grants WHERE id=?').get<Record<string,unknown>>(req.params.id); if(!grant)return jsonError(res,404,'الطلب غير موجود.','NOT_FOUND');
      if(!isCreator(req,String(grant.creator_id)))return jsonError(res,403,'الاعتماد للمبدع المالك فقط.','FORBIDDEN');
      const level=integer(req.body?.disclosureLevel,1,3) ?? Number(grant.disclosure_level), days=integer(req.body?.days,1,365) ?? 30, updated=now(), expires=new Date(Date.now()+days*86400000).toISOString();
      await db.prepare("UPDATE recipe_access_grants SET disclosure_level=?, status='APPROVED', granted_by_user_id=?, expires_at=?, updated_at=? WHERE id=? AND status IN ('REQUESTED','APPROVED')").run(level,req.auth!.user.id,expires,updated,req.params.id);
      await audit(db,req,'RECIPE_ACCESS_APPROVED','RECIPE_ACCESS_GRANT',req.params.id,grant,{level,expires},String(grant.organization_id)); res.json({id:req.params.id,status:'APPROVED',disclosureLevel:level,expiresAt:expires});
    }catch(e){handleDomainError(res,e)}
  });

  router.post('/recipe-access/:id/revoke', async (req: AuthenticatedRequest,res)=>{
    try { const grant=await db.prepare('SELECT * FROM recipe_access_grants WHERE id=?').get<Record<string,unknown>>(req.params.id); if(!grant)return jsonError(res,404,'الإذن غير موجود.','NOT_FOUND');
      if(!isCreator(req,String(grant.creator_id)))return jsonError(res,403,'الإلغاء للمبدع المالك فقط.','FORBIDDEN');
      await db.prepare("UPDATE recipe_access_grants SET status='REVOKED', updated_at=? WHERE id=? AND status<>'REVOKED'").run(now(),req.params.id); await audit(db,req,'RECIPE_ACCESS_REVOKED','RECIPE_ACCESS_GRANT',req.params.id,grant,{status:'REVOKED'},String(grant.organization_id)); res.json({id:req.params.id,status:'REVOKED'});
    }catch(e){handleDomainError(res,e)}
  });

  router.post('/collaborations/:id/offers', async (req: AuthenticatedRequest,res)=>{
    try { const col=await ensureCollabParty(db,req,req.params.id); if(!col)return jsonError(res,403,'التعاون غير متاح.','FORBIDDEN');
      const price=integer(req.body?.sellingPriceFils,1,50_000_000), royalty=integer(req.body?.creatorRoyaltyBasisPoints,0,10_000), platform=integer(req.body?.platformFeeBasisPoints,0,3_000);
      if(price===undefined||royalty===undefined||platform===undefined||royalty+platform>=10_000)return jsonError(res,400,'شروط العرض غير صالحة.','INVALID_OFFER');
      const result=await withIdempotency(db,req,'OFFER_CREATE',async()=>withTransaction(db,async tx=>{
        const max=await tx.prepare('SELECT MAX(version_number) AS max_version FROM offer_versions WHERE collaboration_id=?').get<{max_version:number|string|null}>(col.id); const version=Number(max?.max_version||0)+1, id=`off_${randomUUID()}`, created=now();
        await tx.prepare("UPDATE offer_versions SET status='SUPERSEDED' WHERE collaboration_id=? AND status='PENDING'").run(col.id);
        const terms={sellingPriceFils:price,creatorRoyaltyBasisPoints:royalty,platformFeeBasisPoints:platform,notes:text(req.body?.notes,0,1500)||''};
        await tx.prepare("INSERT INTO offer_versions(id,collaboration_id,version_number,sender_user_id,selling_price_fils,creator_royalty_basis_points,platform_fee_basis_points,status,terms_json,created_at) VALUES(?,?,?,?,?,?,?,'PENDING',?,?)")
          .run(id,col.id,version,req.auth!.user.id,price,royalty,platform,JSON.stringify(terms),created);
        await tx.prepare("UPDATE collaborations SET stage='OFFER_SENT', version=version+1, updated_at=? WHERE id=?").run(created,col.id); await audit(tx,req,'OFFER_CREATED','OFFER',id,undefined,terms,col.organization_id); return{id,version,status:'PENDING',...terms};
      })); res.status(201).json(result);
    }catch(e){handleDomainError(res,e)}
  });

  router.post('/collaborations/:collaborationId/offers/:offerId/accept', async (req: AuthenticatedRequest,res)=>{
    try { const col=await ensureCollabParty(db,req,req.params.collaborationId); if(!col)return jsonError(res,403,'التعاون غير متاح.','FORBIDDEN'); const offer=await db.prepare('SELECT * FROM offer_versions WHERE id=? AND collaboration_id=?').get<OfferRow>(req.params.offerId,col.id); if(!offer||offer.status!=='PENDING')return jsonError(res,409,'العرض غير قابل للقبول.','OFFER_NOT_PENDING');
      const sender=await db.prepare('SELECT creator_id, host_business_id FROM users WHERE id=?').get<{creator_id:string|null;host_business_id:string|null}>(offer.sender_user_id); const acceptingCreator=isCreator(req,col.creator_id)&&sender?.creator_id!==col.creator_id; const acceptingHost=isHost(req,col.organization_id)&&sender?.host_business_id!==col.organization_id; if(!acceptingCreator&&!acceptingHost)return jsonError(res,403,'المرسل لا يستطيع قبول عرضه بنفسه.','SELF_ACCEPT_FORBIDDEN');
      const result=await withIdempotency(db,req,'OFFER_ACCEPT',async()=>{
        const contractId=`ctr_${randomUUID()}`, created=now(); const document={version:1,collaborationId:col.id,offerId:offer.id,terms:JSON.parse(offer.terms_json),acceptedAt:created}; const receipt=await putEncryptedJson('contracts',contractId,document);
        await withTransaction(db,async tx=>{ await tx.prepare("UPDATE offer_versions SET status='ACCEPTED' WHERE id=? AND status='PENDING'").run(offer.id); await tx.prepare("UPDATE collaborations SET stage='CONTRACTING', version=version+1, updated_at=? WHERE id=?").run(created,col.id); await tx.prepare("INSERT INTO contract_versions(id,collaboration_id,version_number,document_sha256,object_storage_key,status,created_at) VALUES(?,?,1,?,?,'PENDING_SIGNATURES',?)").run(contractId,col.id,receipt.plaintextSha256,receipt.objectKey,created); await audit(tx,req,'OFFER_ACCEPTED_CONTRACT_CREATED','CONTRACT',contractId,offer,{documentSha256:receipt.plaintextSha256},col.organization_id); });
        return{offerId:offer.id,contractId,status:'PENDING_SIGNATURES',documentSha256:receipt.plaintextSha256};
      }); res.json(result);
    }catch(e){handleDomainError(res,e)}
  });

  router.post('/contracts/:id/sign', async (req: AuthenticatedRequest,res)=>{
    try { const contract=await db.prepare('SELECT * FROM contract_versions WHERE id=?').get<ContractRow>(req.params.id); if(!contract)return jsonError(res,404,'العقد غير موجود.','NOT_FOUND'); const col=await collaboration(db,contract.collaboration_id); if(!col)return jsonError(res,404,'التعاون غير موجود.','NOT_FOUND'); const side=isCreator(req,col.creator_id)?'CREATOR':isHost(req,col.organization_id,true)?'HOST':undefined; if(!side)return jsonError(res,403,'الموقّع غير مخول.','FORBIDDEN'); const paciId=text(req.body?.paciRequestId,5,160); if(!paciId)return jsonError(res,400,'يلزم طلب PACI موثق لهذا التوقيع.','PACI_REQUIRED');
      const paci=await db.prepare("SELECT id,user_id,status,purpose,expires_at,provider_reference FROM paci_auth_requests WHERE id=? AND user_id=?").get<{id:string;user_id:string;status:string;purpose:string;expires_at:string;provider_reference:string|null}>(paciId,req.auth!.user.id); if(!paci||paci.status!=='VERIFIED'||new Date(paci.expires_at).getTime()<Date.now()||!paci.purpose.toUpperCase().includes('CONTRACT'))return jsonError(res,409,'تحقق PACI غير صالح للتوقيع الحالي.','PACI_NOT_VERIFIED');
      const evidence=sha256(canonical({contractId:contract.id,documentSha256:contract.document_sha256,userId:req.auth!.user.id,side,paciReference:paci.provider_reference,signedAt:now()})), signatureId=`sig_${randomUUID()}`, signedAt=now();
      await withTransaction(db,async tx=>{ await tx.prepare('INSERT INTO contract_signatures(id,contract_id,signer_user_id,signer_side,paci_request_id,document_sha256,signature_evidence_sha256,signed_at) VALUES(?,?,?,?,?,?,?,?)').run(signatureId,contract.id,req.auth!.user.id,side,paci.id,contract.document_sha256,evidence,signedAt); if(side==='CREATOR')await tx.prepare('UPDATE contract_versions SET creator_paci_request_id=? WHERE id=?').run(paci.id,contract.id); else await tx.prepare('UPDATE contract_versions SET host_paci_request_id=? WHERE id=?').run(paci.id,contract.id); const count=await tx.prepare('SELECT COUNT(*) AS c FROM contract_signatures WHERE contract_id=?').get<{c:number|string}>(contract.id); if(Number(count?.c)===2){await tx.prepare("UPDATE contract_versions SET status='FULLY_SIGNED' WHERE id=?").run(contract.id);await tx.prepare("UPDATE collaborations SET stage='SIGNED', version=version+1, updated_at=? WHERE id=?").run(signedAt,col.id);} await audit(tx,req,'CONTRACT_SIGNED','CONTRACT',contract.id,contract,{side,evidence},col.organization_id); });
      const updated=await db.prepare('SELECT status FROM contract_versions WHERE id=?').get<{status:string}>(contract.id); res.json({contractId:contract.id,signatureId,side,status:updated?.status,evidenceSha256:evidence,signedAt});
    }catch(e){handleDomainError(res,e)}
  });

  router.post('/collaborations/:id/launch', async (req: AuthenticatedRequest,res)=>{
    try{const col=await collaboration(db,req.params.id);if(!col||!isHost(req,col.organization_id))return jsonError(res,403,'لا تملك صلاحية تجهيز الإطلاق.','FORBIDDEN');const contract=await db.prepare("SELECT status FROM contract_versions WHERE collaboration_id=? ORDER BY version_number DESC LIMIT 1").get<{status:string}>(col.id);if(contract?.status!=='FULLY_SIGNED')return jsonError(res,409,'العقد غير مكتمل التوقيع.','CONTRACT_NOT_SIGNED');const existing=await db.prepare('SELECT * FROM launches WHERE collaboration_id=?').get<Record<string,unknown>>(col.id);if(existing)return res.json(existing);const id=`lch_${randomUUID()}`,created=now();await db.prepare("INSERT INTO launches(id,collaboration_id,product_id,organization_id,status,created_at,updated_at) VALUES(?,?,?,?, 'PREPARING',?,?)").run(id,col.id,col.product_id,col.organization_id,created,created);await audit(db,req,'LAUNCH_PREPARED','LAUNCH',id,undefined,{collaborationId:col.id},col.organization_id);res.status(201).json({id,status:'PREPARING',gate:await launchGate(db,col)});}catch(e){handleDomainError(res,e)}
  });

  router.put('/collaborations/:id/launch-gate/:key', async (req: AuthenticatedRequest,res)=>{
    try{const col=await collaboration(db,req.params.id);if(!col||!isHost(req,col.organization_id))return jsonError(res,403,'لا تملك صلاحية بوابة الإطلاق.','FORBIDDEN');const allowed=['productionRecipeApproved','productNamePriceApproved','packagingDataCompleted','productionLocationSelected','settlementConfigApproved'];if(!allowed.includes(req.params.key)||bool(req.body?.value)===undefined)return jsonError(res,400,'عنصر البوابة غير صالح.','INVALID_GATE');const changed=now();await db.prepare(`INSERT INTO launch_gate_items(collaboration_id,gate_key,value,evidence_json,updated_by_user_id,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(collaboration_id,gate_key) DO UPDATE SET value=excluded.value,evidence_json=excluded.evidence_json,updated_by_user_id=excluded.updated_by_user_id,updated_at=excluded.updated_at`).run(col.id,req.params.key,req.body.value?1:0,JSON.stringify(req.body?.evidence||{}),req.auth!.user.id,changed);await audit(db,req,'LAUNCH_GATE_UPDATED','COLLABORATION',col.id,undefined,{key:req.params.key,value:req.body.value},col.organization_id);res.json(await launchGate(db,col));}catch(e){handleDomainError(res,e)}
  });

  router.post('/collaborations/:id/launch/activate', async (req: AuthenticatedRequest,res)=>{
    try{const col=await collaboration(db,req.params.id);if(!col||!isHost(req,col.organization_id))return jsonError(res,403,'لا تملك صلاحية التفعيل.','FORBIDDEN');const gate=await launchGate(db,col);if(!gate.allRequirementsPassed)return res.status(409).json({error:'بوابة الإطلاق غير مكتملة.',code:'LAUNCH_GATE_INCOMPLETE',gate});const start=now();const updated=await db.prepare("UPDATE launches SET status='LIVE',starts_at=?,updated_at=? WHERE collaboration_id=? AND status<>'LIVE'").run(start,start,col.id);if(!updated.changes)return jsonError(res,409,'الإطلاق غير مجهز أو مفعل مسبقًا.','LAUNCH_STATE_CONFLICT');await db.prepare("UPDATE collaborations SET stage='LIVE_TRIAL',version=version+1,updated_at=? WHERE id=?").run(start,col.id);await audit(db,req,'LAUNCH_ACTIVATED','COLLABORATION',col.id,undefined,{startsAt:start},col.organization_id);res.json({collaborationId:col.id,status:'LIVE',startsAt:start,gate});}catch(e){handleDomainError(res,e)}
  });

  router.post('/settlements/:creatorId/approve', requireRoles('ADMIN','SUPER_ADMIN'), async (req: AuthenticatedRequest,res)=>{
    try{await assertKillSwitchClear(db,'SETTLEMENTS');const result=await withIdempotency(db,req,'SETTLEMENT_APPROVE',async()=>withTransaction(db,async tx=>{const rows=await tx.prepare("SELECT id,amount_fils FROM accruals WHERE creator_id=? AND status='ELIGIBLE'").all<{id:string;amount_fils:number|string}>(req.params.creatorId);if(!rows.length)throw Object.assign(new Error('NO_ELIGIBLE_ACCRUALS'),{status:409});const total=rows.reduce((s,r)=>s+Number(r.amount_fils),0),id=`stl_${randomUUID()}`,created=now();await tx.prepare("INSERT INTO settlement_batches(id,creator_id,total_fils,status,created_at,updated_at) VALUES(?,?,?,'APPROVED',?,?)").run(id,req.params.creatorId,total,created,created);await tx.prepare("UPDATE accruals SET status='LOCKED',updated_at=? WHERE creator_id=? AND status='ELIGIBLE'").run(created,req.params.creatorId);await audit(tx,req,'SETTLEMENT_APPROVED','SETTLEMENT_BATCH',id,undefined,{totalFils:total});return{id,totalFils:total,status:'APPROVED'};}));res.status(201).json(result);}catch(e){handleDomainError(res,e)}
  });

  router.post('/internal/settlements/:id/paid', requireRoles('ADMIN','SUPER_ADMIN'), async (req: AuthenticatedRequest,res)=>{
    try{await assertKillSwitchClear(db,'SETTLEMENTS');const expected=process.env.SETTLEMENT_RECONCILIATION_SECRET?.trim();if(!expected||expected.length<32||req.header('x-reconciliation-secret')!==expected)return jsonError(res,403,'تأكيد الدفع يتطلب قناة تسوية موثقة.','RECONCILIATION_REQUIRED');const ref=text(req.body?.providerReference,4,200);if(!ref)return jsonError(res,400,'مرجع المزود مطلوب.','PROVIDER_REFERENCE_REQUIRED');const result=await applySettlementPaid(db,req.params.id,ref,(tx,batch)=>audit(tx,req,'SETTLEMENT_PAID','SETTLEMENT_BATCH',req.params.id,batch,{providerReference:ref}));res.json({id:req.params.id,status:result.status,providerReference:ref,applied:result.applied});}catch(e){handleDomainError(res,e)}
  });

  // 1. Secret recipe seal: public commitment only; salt stays in encrypted storage.
  router.post('/innovations/recipe-seals/:recipeVersionId', async (req: AuthenticatedRequest,res)=>{
    try{const recipe=await db.prepare('SELECT rv.*,p.creator_id FROM recipe_versions rv JOIN products p ON p.id=rv.product_id WHERE rv.id=?').get<RecipeRow & {creator_id:string}>(req.params.recipeVersionId);if(!recipe||!isCreator(req,recipe.creator_id))return jsonError(res,403,'الوصفة غير متاحة.','FORBIDDEN');const existing=await db.prepare('SELECT id,commitment_sha256,created_at FROM recipe_seals WHERE recipe_version_id=?').get<Record<string,unknown>>(recipe.id);if(existing)return res.json(existing);const salt=randomBytes(32).toString('base64url'),commitment=sha256(`MAJAL_RECIPE_SEAL_V1:${recipe.payload_sha256}:${salt}`),id=`seal_${randomUUID()}`;const receipt=await putEncryptedJson('recipe-seals',id,{salt,recipePayloadSha256:recipe.payload_sha256});const created=now();await db.prepare('INSERT INTO recipe_seals(id,recipe_version_id,product_id,commitment_sha256,salt_object_key,created_by_user_id,created_at) VALUES(?,?,?,?,?,?,?)').run(id,recipe.id,recipe.product_id,commitment,receipt.objectKey,req.auth!.user.id,created);await audit(db,req,'RECIPE_SEALED','RECIPE_SEAL',id,undefined,{commitment,createdAt:created});res.status(201).json({id,productId:recipe.product_id,commitmentSha256:commitment,createdAt:created});}catch(e){handleDomainError(res,e)}
  });
  router.get('/innovations/recipe-seals/:id/proof', async (req:AuthenticatedRequest,res)=>{const seal=await db.prepare('SELECT id,product_id,commitment_sha256,created_at FROM recipe_seals WHERE id=?').get<Record<string,unknown>>(req.params.id);if(!seal)return jsonError(res,404,'الختم غير موجود.','NOT_FOUND');res.json(seal)});

  // 2. Taste DNA: normalized non-secret dimensions, suitable for matching without recipe disclosure.
  router.post('/innovations/taste-dna/:productId', async(req:AuthenticatedRequest,res)=>{try{const product=await db.prepare('SELECT creator_id FROM products WHERE id=?').get<{creator_id:string}>(req.params.productId);if(!product||!isCreator(req,product.creator_id))return jsonError(res,403,'المنتج غير متاح.','FORBIDDEN');const dims=req.body?.dimensions;if(!dims||typeof dims!=='object'||Array.isArray(dims))return jsonError(res,400,'الأبعاد غير صالحة.','INVALID_DNA');const normalized:Record<string,number>={};for(const [k,v] of Object.entries(dims)){const key=text(k,1,40),n=integer(v,0,100);if(!key||n===undefined||Object.keys(normalized).length>=24)return jsonError(res,400,'أبعاد Taste DNA غير صالحة.','INVALID_DNA');normalized[key]=n;}const descriptors=Array.isArray(req.body?.descriptors)?req.body.descriptors.map((x:unknown)=>text(x,1,60)).filter(Boolean).slice(0,20):[];const mx=await db.prepare('SELECT MAX(version_number) AS v FROM taste_dna_profiles WHERE product_id=?').get<{v:number|string|null}>(req.params.productId);const version=Number(mx?.v||0)+1,id=`dna_${randomUUID()}`,created=now(),source=sha256(canonical({normalized,descriptors}));await db.prepare('INSERT INTO taste_dna_profiles(id,product_id,version_number,dimensions_json,descriptors_json,source_sha256,visibility,created_by_user_id,created_at) VALUES(?,?,?,?,?,?,?,?,?)').run(id,req.params.productId,version,JSON.stringify(normalized),JSON.stringify(descriptors),source,text(req.body?.visibility,6,8)==='PARTNERS'?'PARTNERS':'PUBLIC',req.auth!.user.id,created);await audit(db,req,'TASTE_DNA_CREATED','TASTE_DNA',id,undefined,{version,source});res.status(201).json({id,productId:req.params.productId,version,dimensions:normalized,descriptors,sourceSha256:source});}catch(e){handleDomainError(res,e)}});
  router.post('/innovations/taste-dna/match/search',async(req:AuthenticatedRequest,res)=>{const target=req.body?.dimensions as Record<string,unknown>;if(!target||typeof target!=='object')return jsonError(res,400,'بصمة الهدف مطلوبة.','INVALID_TARGET');const profiles=await db.prepare("SELECT t.id,t.product_id,t.dimensions_json,p.public_name FROM taste_dna_profiles t JOIN products p ON p.id=t.product_id WHERE t.visibility='PUBLIC' ORDER BY t.created_at DESC LIMIT 1000").all<{id:string;product_id:string;dimensions_json:string;public_name:string}>();const tn=Object.fromEntries(Object.entries(target).map(([k,v])=>[k,Number(v)]).filter(([,v])=>Number.isFinite(v)));const scored=profiles.map(p=>{const d=JSON.parse(p.dimensions_json) as Record<string,number>,keys=[...new Set([...Object.keys(tn),...Object.keys(d)])];let dot=0,a=0,b=0;for(const k of keys){const x=tn[k]||0,y=d[k]||0;dot+=x*y;a+=x*x;b+=y*y;}return{id:p.id,productId:p.product_id,publicName:p.public_name,score:a&&b?Math.round(dot/Math.sqrt(a*b)*100):0};}).sort((a,b)=>b.score-a.score).slice(0,50);res.json({matches:scored})});

  // 3. Shadow Launch: deterministic simulation with an enforced zero financial effect.
  router.post('/innovations/shadow-launch/:collaborationId',async(req:AuthenticatedRequest,res)=>{try{const col=await ensureCollabParty(db,req,req.params.collaborationId);if(!col)return jsonError(res,403,'التعاون غير متاح.','FORBIDDEN');const scenario={orders:integer(req.body?.orders,1,100000)??500,stock:integer(req.body?.stock,0,100000)??450,staff:integer(req.body?.staff,1,500)??8,couriers:integer(req.body?.couriers,0,500)??4,minutes:integer(req.body?.minutes,1,300)??5};const seed=text(req.body?.seed,4,100)||randomUUID(),result=shadowSim(seed,scenario),id=`shd_${randomUUID()}`,created=now();await db.prepare('INSERT INTO shadow_launch_runs(id,collaboration_id,seed,scenario_json,result_json,financial_effect_fils,created_by_user_id,created_at) VALUES(?,?,?,?,?,0,?,?)').run(id,col.id,seed,JSON.stringify(scenario),JSON.stringify(result),req.auth!.user.id,created);await audit(db,req,'SHADOW_LAUNCH_RUN','SHADOW_LAUNCH',id,undefined,{scenario,result:{...result,events:undefined}},col.organization_id);res.status(201).json({id,scenario,result});}catch(e){handleDomainError(res,e)}});

  // 4. Deal Fairness X-Ray.
  router.post('/innovations/deal-fairness/:collaborationId',async(req:AuthenticatedRequest,res)=>{try{const col=await ensureCollabParty(db,req,req.params.collaborationId);if(!col)return jsonError(res,403,'التعاون غير متاح.','FORBIDDEN');const offer=await db.prepare("SELECT * FROM offer_versions WHERE collaboration_id=? AND status IN ('PENDING','ACCEPTED') ORDER BY version_number DESC LIMIT 1").get<OfferRow>(col.id);if(!offer)return jsonError(res,409,'لا يوجد عرض قابل للتحليل.','NO_OFFER');const assumptions={unitsPerMonth:integer(req.body?.unitsPerMonth,1,1000000)??1000,unitCostFils:integer(req.body?.unitCostFils,0,50_000_000)??0,marketingFilsPerMonth:integer(req.body?.marketingFilsPerMonth,0,100_000_000)??0};const scenarios=fairnessScenarios(Number(offer.selling_price_fils),Number(offer.creator_royalty_basis_points),Number(offer.platform_fee_basis_points),assumptions);const risks=[] as string[];if(Number(offer.creator_royalty_basis_points)<500)risks.push('LOW_CREATOR_SHARE');if(scenarios.some(x=>x.hostResidualFils<0))risks.push('HOST_DOWNSIDE');if(Number(offer.platform_fee_basis_points)>2000)risks.push('HIGH_PLATFORM_FEE');const id=`fair_${randomUUID()}`,created=now(),hash=sha256(canonical(assumptions));await db.prepare('INSERT INTO deal_fairness_analyses(id,collaboration_id,offer_id,assumptions_sha256,scenarios_json,risk_flags_json,created_by_user_id,created_at) VALUES(?,?,?,?,?,?,?,?)').run(id,col.id,offer.id,hash,JSON.stringify(scenarios),JSON.stringify(risks),req.auth!.user.id,created);res.status(201).json({id,offerId:offer.id,assumptions,scenarios,riskFlags:risks});}catch(e){handleDomainError(res,e)}});

  // 5. Market for unused kitchen capacity.
  router.get('/innovations/capacity-market',async(_req,res)=>{const slots=await db.prepare("SELECT id,organization_id,starts_at,ends_at,capacity_units,price_fils,status,requirements_json FROM kitchen_capacity_slots WHERE status='OPEN' AND starts_at>? ORDER BY starts_at LIMIT 500").all(now());res.json({slots})});
  router.post('/innovations/capacity-market',async(req:AuthenticatedRequest,res)=>{try{const org=req.auth!.user.hostBusinessId;if(!org||!isHost(req,org))return jsonError(res,403,'إضافة السعة للمنشآت فقط.','FORBIDDEN');const starts=text(req.body?.startsAt,20,40),ends=text(req.body?.endsAt,20,40),cap=integer(req.body?.capacityUnits,1,100000),price=integer(req.body?.priceFils,0,100_000_000);if(!starts||!ends||new Date(ends)<=new Date(starts)||cap===undefined||price===undefined)return jsonError(res,400,'بيانات السعة غير صالحة.','INVALID_SLOT');const id=`slot_${randomUUID()}`,created=now();await db.prepare("INSERT INTO kitchen_capacity_slots(id,organization_id,starts_at,ends_at,capacity_units,price_fils,status,requirements_json,created_by_user_id,created_at,updated_at) VALUES(?,?,?,?,?,?,'OPEN',?,?,?,?)").run(id,org,starts,ends,cap,price,JSON.stringify(req.body?.requirements||{}),req.auth!.user.id,created,created);res.status(201).json({id,status:'OPEN',startsAt:starts,endsAt:ends,capacityUnits:cap,priceFils:price});}catch(e){handleDomainError(res,e)}});
  router.post('/innovations/capacity-market/:slotId/book',async(req:AuthenticatedRequest,res)=>{try{const creator=req.auth!.user.creatorId;if(!creator)return jsonError(res,403,'الحجز للمبدعين فقط.','CREATOR_REQUIRED');const id=`book_${randomUUID()}`,created=now(),hold=new Date(Date.now()+15*60000).toISOString();await withTransaction(db,async tx=>{const slot=await tx.prepare("SELECT * FROM kitchen_capacity_slots WHERE id=? AND status='OPEN'").get<Record<string,unknown>>(req.params.slotId);if(!slot)throw Object.assign(new Error('SLOT_UNAVAILABLE'),{status:409});const changed=await tx.prepare("UPDATE kitchen_capacity_slots SET status='HELD',updated_at=? WHERE id=? AND status='OPEN'").run(created,req.params.slotId);if(!changed.changes)throw Object.assign(new Error('SLOT_RACE_LOST'),{status:409});await tx.prepare("INSERT INTO kitchen_capacity_bookings(id,slot_id,creator_id,product_id,status,hold_expires_at,created_by_user_id,created_at,updated_at) VALUES(?,?,?,?,'HELD',?,?,?,?)").run(id,req.params.slotId,creator,text(req.body?.productId,3,120)||null,hold,req.auth!.user.id,created,created);});res.status(201).json({id,slotId:req.params.slotId,status:'HELD',holdExpiresAt:hold});}catch(e){handleDomainError(res,e)}});

  // 6. Progressive Secret Escrow.
  router.post('/innovations/secret-escrows',async(req:AuthenticatedRequest,res)=>{try{const col=await collaboration(db,text(req.body?.collaborationId,3,120)||'');if(!col||!isCreator(req,col.creator_id))return jsonError(res,403,'إنشاء الإسكرو للمبدع المالك.','FORBIDDEN');const recipe=await db.prepare('SELECT id FROM recipe_versions WHERE id=? AND product_id=?').get<{id:string}>(text(req.body?.recipeVersionId,3,120)||'',col.product_id);if(!recipe)return jsonError(res,400,'نسخة الوصفة غير صالحة.','INVALID_RECIPE');const days=integer(req.body?.expiresInDays,1,365)??30,id=`esc_${randomUUID()}`,created=now(),expires=new Date(Date.now()+days*86400000).toISOString();await db.prepare("INSERT INTO progressive_secret_escrows(id,collaboration_id,recipe_version_id,status,current_stage,expires_at,policy_json,created_by_user_id,created_at,updated_at) VALUES(?,?,?,'ACTIVE',0,?,?,?, ?,?)").run(id,col.id,recipe.id,expires,JSON.stringify(req.body?.policy||{}),req.auth!.user.id,created,created);res.status(201).json({id,status:'ACTIVE',currentStage:0,expiresAt:expires});}catch(e){handleDomainError(res,e)}});
  router.post('/innovations/secret-escrows/:id/advance',async(req:AuthenticatedRequest,res)=>{try{const esc=await db.prepare('SELECT e.*,c.creator_id,c.organization_id FROM progressive_secret_escrows e JOIN collaborations c ON c.id=e.collaboration_id WHERE e.id=?').get<Record<string,unknown>>(req.params.id);if(!esc||!isCreator(req,String(esc.creator_id)))return jsonError(res,403,'الإسكرو غير متاح.','FORBIDDEN');if(esc.status!=='ACTIVE'||new Date(String(esc.expires_at)).getTime()<=Date.now())return jsonError(res,409,'الإسكرو منتهي أو غير نشط.','ESCROW_INACTIVE');const stage=Number(esc.current_stage)+1;if(stage>3)return jsonError(res,409,'اكتمل الكشف التدريجي.','ESCROW_COMPLETE');const fragment=req.body?.disclosure;if(fragment===undefined)return jsonError(res,400,'محتوى مرحلة الكشف مطلوب.','DISCLOSURE_REQUIRED');const disclosureId=`dis_${randomUUID()}`,receipt=await putEncryptedJson('escrow-disclosures',disclosureId,fragment),disclosed=now(),expires=String(esc.expires_at),conditionHash=sha256(canonical(req.body?.conditionEvidence||{}));await withTransaction(db,async tx=>{await tx.prepare('INSERT INTO progressive_secret_disclosures(id,escrow_id,stage_number,disclosure_object_key,condition_sha256,disclosed_to_organization_id,disclosed_by_user_id,disclosed_at,expires_at) VALUES(?,?,?,?,?,?,?,?,?)').run(disclosureId,req.params.id,stage,receipt.objectKey,conditionHash,String(esc.organization_id),req.auth!.user.id,disclosed,expires);await tx.prepare("UPDATE progressive_secret_escrows SET current_stage=?,status=?,updated_at=? WHERE id=?").run(stage,stage===3?'COMPLETED':'ACTIVE',disclosed,req.params.id);});res.json({id:req.params.id,currentStage:stage,status:stage===3?'COMPLETED':'ACTIVE',disclosureId,conditionSha256:conditionHash});}catch(e){handleDomainError(res,e)}});
  router.get('/innovations/secret-escrows/:id/disclosures/:stage',async(req:AuthenticatedRequest,res)=>{try{await assertKillSwitchClear(db,'RECIPE_REVEALS');const esc=await db.prepare('SELECT e.*,c.organization_id FROM progressive_secret_escrows e JOIN collaborations c ON c.id=e.collaboration_id WHERE e.id=?').get<Record<string,unknown>>(req.params.id);if(!esc||!canReadRecipeDisclosure(req.auth!.user,String(esc.organization_id))||new Date(String(esc.expires_at)).getTime()<=Date.now()||esc.status==='REVOKED')return jsonError(res,403,'لا يوجد كشف صالح لهذا الطرف.','DISCLOSURE_DENIED');const stage=integer(req.params.stage,1,3)!;if(stage>Number(esc.current_stage))return jsonError(res,403,'هذه المرحلة لم تُكشف بعد.','STAGE_LOCKED');const disclosure=await db.prepare('SELECT * FROM progressive_secret_disclosures WHERE escrow_id=? AND stage_number=?').get<Record<string,unknown>>(req.params.id,stage);if(!disclosure)return jsonError(res,404,'مرحلة الكشف غير موجودة.','NOT_FOUND');const value=await getEncryptedJson(String(disclosure.disclosure_object_key),'escrow-disclosures',String(disclosure.id));res.json({stage,expiresAt:disclosure.expires_at,disclosure:value});}catch(e){handleDomainError(res,e)}});
  router.post('/innovations/secret-escrows/:id/revoke',async(req:AuthenticatedRequest,res)=>{try{const esc=await db.prepare('SELECT e.*,c.creator_id FROM progressive_secret_escrows e JOIN collaborations c ON c.id=e.collaboration_id WHERE e.id=?').get<Record<string,unknown>>(req.params.id);if(!esc||!isCreator(req,String(esc.creator_id)))return jsonError(res,403,'الإلغاء للمبدع المالك.','FORBIDDEN');await db.prepare("UPDATE progressive_secret_escrows SET status='REVOKED',revoked_at=?,updated_at=? WHERE id=?").run(now(),now(),req.params.id);res.json({id:req.params.id,status:'REVOKED'});}catch(e){handleDomainError(res,e)}});

  // 7. Value Attribution Ledger: invariant requires exact sum to paid order total.
  router.post('/innovations/value-attribution/:orderId',async(req:AuthenticatedRequest,res)=>{try{const order=await db.prepare('SELECT o.*,l.organization_id,c.creator_id FROM orders o JOIN launches l ON l.id=o.launch_id JOIN collaborations c ON c.id=l.collaboration_id WHERE o.id=?').get<Record<string,unknown>>(req.params.orderId);if(!order||(!isCreator(req,String(order.creator_id))&&!isHost(req,String(order.organization_id))&&!isAdmin(req)))return jsonError(res,403,'الطلب غير متاح.','FORBIDDEN');const components=req.body?.components as Record<string,unknown>;const categories=['RECIPE','OPERATIONS','MARKETING','ACQUISITION','PLATFORM'];if(!components||categories.some(k=>integer(components[k],-100_000_000,100_000_000)===undefined))return jsonError(res,400,'مكونات الإسناد غير صالحة.','INVALID_ATTRIBUTION');const sum=categories.reduce((s,k)=>s+Number(components[k]),0);if(sum!==Number(order.total_fils))return res.status(409).json({error:'مجموع الإسناد يجب أن يساوي إجمالي الطلب بالضبط.',code:'ATTRIBUTION_IMBALANCE',expectedFils:Number(order.total_fils),actualFils:sum});await withTransaction(db,async tx=>{for(const k of categories){await tx.prepare(`INSERT INTO value_attribution_entries(id,order_id,category,amount_fils,method,evidence_json,created_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(order_id,category) DO UPDATE SET amount_fils=excluded.amount_fils,method=excluded.method,evidence_json=excluded.evidence_json`).run(`att_${randomUUID()}`,req.params.orderId,k,Number(components[k]),text(req.body?.method,2,80)||'CONTRACTUAL',JSON.stringify(req.body?.evidence?.[k]||{}),now());}});res.json({orderId:req.params.orderId,totalFils:sum,components});}catch(e){handleDomainError(res,e)}});

  // 8. Deal Rescue Room.
  router.post('/innovations/deal-rescue/:collaborationId',async(req:AuthenticatedRequest,res)=>{try{const col=await ensureCollabParty(db,req,req.params.collaborationId);if(!col)return jsonError(res,403,'التعاون غير متاح.','FORBIDDEN');const blockers:Record<string,{owner:'CREATOR'|'HOST'|'BOTH';steps:string[]}>= {TASTING:['CREATOR','HOST'] as never,OFFER:['CREATOR','HOST'] as never} as never;let code='UNKNOWN_BLOCKER',owner:string|undefined,steps=['راجع آخر حدث تدقيق وحدد القرار المفقود.'];if(['TASTING_REQUESTED','TASTING_SCHEDULED'].includes(col.stage)){code='TASTING_PENDING';owner='HOST';steps=['تأكيد الموعد','تسجيل نتيجة التذوق'];}else if(['OFFER_SENT','COUNTERED'].includes(col.stage)){code='COMMERCIAL_DECISION_PENDING';owner='BOTH';steps=['فتح آخر عرض','قبول أو إرسال عرض مقابل'];}else if(col.stage==='CONTRACTING'){code='SIGNATURE_PENDING';owner='BOTH';steps=['إكمال PACI','توقيع نسخة العقد الحالية'];}else if(['SIGNED','PRE_LAUNCH'].includes(col.stage)){code='LAUNCH_GATE_PENDING';owner='HOST';steps=['إكمال بنود Launch Gate','تشغيل Shadow Launch','تفعيل الإطلاق'];}const ownerUser=owner==='HOST'?await db.prepare("SELECT id FROM users WHERE host_business_id=? AND role='HOST_OWNER' AND status='ACTIVE' LIMIT 1").get<{id:string}>(col.organization_id):owner==='CREATOR'?await db.prepare('SELECT user_id AS id FROM creator_profiles WHERE id=?').get<{id:string}>(col.creator_id):undefined;const id=`rescue_${randomUUID()}`,created=now(),deadline=text(req.body?.deadlineAt,20,40)||new Date(Date.now()+48*3600000).toISOString(),diagnosis={stage:col.stage,blockerCode:code,decisionOwner:owner};await db.prepare("INSERT INTO deal_rescue_rooms(id,collaboration_id,blocker_code,diagnosis_json,decision_owner_user_id,deadline_at,shortest_path_json,status,created_by_user_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,'OPEN',?,?,?)").run(id,col.id,code,JSON.stringify(diagnosis),ownerUser?.id||null,deadline,JSON.stringify(steps),req.auth!.user.id,created,created);res.status(201).json({id,diagnosis,deadlineAt:deadline,shortestPath:steps});}catch(e){handleDomainError(res,e)}});

  // 9. Zero-Form onboarding backed by Google Document AI when configured.
  router.post('/innovations/zero-form/extract',async(req:AuthenticatedRequest,res)=>{try{const content=text(req.body?.contentBase64,16,2_100_000),mime=text(req.body?.mimeType,3,100);if(!content||!mime||!['application/pdf','image/png','image/jpeg'].includes(mime))return jsonError(res,400,'المستند غير صالح أو أكبر من الحد.','INVALID_DOCUMENT');let bytes:Buffer;try{bytes=Buffer.from(content,'base64')}catch{return jsonError(res,400,'ترميز المستند غير صالح.','INVALID_BASE64')}if(bytes.length<32||bytes.length>1_500_000)return jsonError(res,413,'حجم المستند خارج الحد المسموح.','DOCUMENT_TOO_LARGE');const id=`onb_${randomUUID()}`,sourceReceipt=await putEncryptedJson('onboarding-source',id,{mimeType:mime,contentBase64:content}),extracted=await documentAiExtract(content,mime);const exceptions=Object.entries(extracted.confidence).filter(([,c])=>c<0.85).map(([field,confidence])=>({field,confidence}));const created=now(),status=exceptions.length?'NEEDS_REVIEW':'EXTRACTED';await db.prepare('INSERT INTO onboarding_extractions(id,user_id,source_object_key,source_sha256,fields_json,confidence_json,exceptions_json,extractor_provider,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(id,req.auth!.user.id,sourceReceipt.objectKey,sourceReceipt.plaintextSha256,JSON.stringify(extracted.fields),JSON.stringify(extracted.confidence),JSON.stringify(exceptions),'GOOGLE_DOCUMENT_AI',status,created,created);await audit(db,req,'ZERO_FORM_EXTRACTED','ONBOARDING_EXTRACTION',id,undefined,{status,exceptionsCount:exceptions.length,sourceSha256:sourceReceipt.plaintextSha256});res.status(201).json({id,status,fields:extracted.fields,confidence:extracted.confidence,exceptions});}catch(e){handleDomainError(res,e)}});

  // 10. Customer Memory Capsule: explicit consent, encryption, expiry, and physical deletion on revoke.
  router.put('/innovations/memory-capsule',async(req:AuthenticatedRequest,res)=>{try{if(req.body?.consent!==true)return jsonError(res,400,'يلزم قبول صريح قبل حفظ الذاكرة.','CONSENT_REQUIRED');const purposes=Array.isArray(req.body?.purposes)?req.body.purposes.map((x:unknown)=>text(x,2,80)).filter(Boolean).slice(0,10):[];if(!purposes.length)return jsonError(res,400,'حدد غرضًا واحدًا على الأقل.','PURPOSE_REQUIRED');const payload=req.body?.preferences;if(!payload||typeof payload!=='object')return jsonError(res,400,'التفضيلات غير صالحة.','INVALID_PREFERENCES');const version=text(req.body?.consentVersion,1,40)||'1.0',existing=await db.prepare('SELECT id,object_storage_key FROM customer_memory_capsules WHERE user_id=?').get<{id:string;object_storage_key:string}>(req.auth!.user.id),id=existing?.id||`mem_${randomUUID()}`,receipt=await putEncryptedJson('customer-memory',id,payload),changed=now(),expires=text(req.body?.expiresAt,20,40)||null;await withTransaction(db,async tx=>{await tx.prepare(`INSERT INTO customer_memory_capsules(id,user_id,object_storage_key,payload_sha256,consent_version,purposes_json,status,expires_at,created_at,updated_at) VALUES(?,?,?,?,?,?,'ACTIVE',?,?,?) ON CONFLICT(user_id) DO UPDATE SET object_storage_key=excluded.object_storage_key,payload_sha256=excluded.payload_sha256,consent_version=excluded.consent_version,purposes_json=excluded.purposes_json,status='ACTIVE',expires_at=excluded.expires_at,updated_at=excluded.updated_at`).run(id,req.auth!.user.id,receipt.objectKey,receipt.plaintextSha256,version,JSON.stringify(purposes),expires,changed,changed);await tx.prepare("INSERT INTO consent_events(id,user_id,consent_type,version,action,purposes_json,request_id,created_at) VALUES(?,?, 'CUSTOMER_MEMORY',?,'GRANTED',?,?,?)").run(`con_${randomUUID()}`,req.auth!.user.id,version,JSON.stringify(purposes),requestId(req),changed);});if(existing?.object_storage_key&&existing.object_storage_key!==receipt.objectKey)await deleteEncryptedObject(existing.object_storage_key);res.json({id,status:'ACTIVE',purposes,consentVersion:version,expiresAt:expires});}catch(e){handleDomainError(res,e)}});
  router.get('/innovations/memory-capsule',async(req:AuthenticatedRequest,res)=>{try{const row=await db.prepare("SELECT * FROM customer_memory_capsules WHERE user_id=? AND status='ACTIVE'").get<Record<string,unknown>>(req.auth!.user.id);if(!row)return res.json({status:'EMPTY'});if(row.expires_at&&new Date(String(row.expires_at)).getTime()<=Date.now())return res.json({status:'EXPIRED'});const preferences=await getEncryptedJson(String(row.object_storage_key),'customer-memory',String(row.id));res.json({id:row.id,status:row.status,purposes:JSON.parse(String(row.purposes_json)),consentVersion:row.consent_version,expiresAt:row.expires_at,preferences});}catch(e){handleDomainError(res,e)}});
  router.delete('/innovations/memory-capsule',async(req:AuthenticatedRequest,res)=>{try{const row=await db.prepare('SELECT * FROM customer_memory_capsules WHERE user_id=?').get<Record<string,unknown>>(req.auth!.user.id);if(!row)return res.status(204).end();await deleteEncryptedObject(String(row.object_storage_key));const changed=now();await withTransaction(db,async tx=>{await tx.prepare("UPDATE customer_memory_capsules SET status='REVOKED',object_storage_key='',payload_sha256='',updated_at=? WHERE user_id=?").run(changed,req.auth!.user.id);await tx.prepare("INSERT INTO consent_events(id,user_id,consent_type,version,action,purposes_json,request_id,created_at) VALUES(?,?,'CUSTOMER_MEMORY',?,'REVOKED',?,?,?)").run(`con_${randomUUID()}`,req.auth!.user.id,String(row.consent_version),String(row.purposes_json),requestId(req),changed);});res.status(204).end();}catch(e){handleDomainError(res,e)}});

  return router;
}

function handleDomainError(res: Response, error: unknown) {
  const candidate=error as {status?:number;message?:string;code?:string};
  const status=Number(candidate?.status) || (String(candidate?.message).includes('UNIQUE') ? 409 : 400);
  const code=candidate?.code || candidate?.message || 'DOMAIN_OPERATION_FAILED';
  const safe:Record<string,string>={IDEMPOTENCY_KEY_REQUIRED:'Idempotency-Key مطلوب للعملية.',IDEMPOTENCY_CONFLICT:'المفتاح أُعيد استخدامه بطلب مختلف.',NO_ELIGIBLE_ACCRUALS:'لا توجد مستحقات مؤهلة للتسوية.',SLOT_UNAVAILABLE:'السعة لم تعد متاحة.',SLOT_RACE_LOST:'حُجزت السعة بطلب متزامن آخر.',DOCUMENT_AI_NOT_CONFIGURED:'استخراج المستندات الحقيقي غير مهيأ في هذه البيئة.',KILL_SWITCH_ENGAGED_SETTLEMENTS:'التسويات مجمّدة مؤقتًا بأمر احتواء أمني.',KILL_SWITCH_ENGAGED_RECIPE_REVEALS:'كشف الأسرار مجمّد مؤقتًا بأمر احتواء أمني.'};
  jsonError(res,status,safe[code]||'تعذّر تنفيذ العملية بأمان.',code);
}
