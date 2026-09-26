import { randomUUID } from 'node:crypto';
import { Response, Router } from 'express';
import { AuthConfig, AuthRole, AuthenticatedRequest, requireAuth, requireCsrf, requireRoles } from './auth';
import { MajalDatabase } from './database';
import { createOrCoalesceNotification } from './notifications';
import {
  PAYMENT_HOLD_MINUTES, filsToKwd, normalizeKuwaitPhone, organizationBranches, parseSlots, parseZones, safeParse
} from './checkout';

/*
 * Drop commerce operations layered on the existing launch/order/accrual model:
 *  - public checkout options (branches, delivery zones, pickup slots, real remaining stock)
 *  - public Launch Gate trust checklist (licence, allergens, halal, food-safety expiry)
 *  - waitlist ("notify me") with WhatsApp opt-in, creator follows + launch alerts
 *  - host logistics / per-branch stock / war room / canned replies
 *  - creator payout statement (JSON + Arabic CSV)
 */

const now = () => new Date().toISOString();
const jsonError = (res: Response, status: number, message: string, code: string) => res.status(status).json({ error: message, code });
const text = (value: unknown, min: number, max: number) =>
  typeof value === 'string' && value.trim().length >= min && value.trim().length <= max ? value.trim() : undefined;
const HOLDING_STATUSES = ['PENDING_PAYMENT', 'PAID', 'FULFILLED'];

type LaunchRow = { id: string; collaboration_id: string; product_id: string; organization_id: string; status: string; quantity_cap: number | string | null };

async function launchById(db: MajalDatabase, id: string) {
  return db.prepare('SELECT id, collaboration_id, product_id, organization_id, status, quantity_cap FROM launches WHERE id = ? LIMIT 1').get<LaunchRow>(id);
}

async function consumedUnits(db: MajalDatabase, launchId: string) {
  const row = await db.prepare(`SELECT COALESCE(SUM(units), 0) AS taken FROM orders WHERE launch_id = ? AND status IN ('PENDING_PAYMENT','PAID','FULFILLED')`)
    .get<{ taken: number | string }>(launchId);
  return Number(row?.taken ?? 0);
}

type StockRow = { branch_id: string; capacity_units: number | string; reserved_units: number | string; alert_threshold_pct: number | string; manual_cutoff: number | string };
async function stockRows(db: MajalDatabase, launchId: string) {
  return db.prepare('SELECT branch_id, capacity_units, reserved_units, alert_threshold_pct, manual_cutoff FROM launch_branch_stock WHERE launch_id = ?').all<StockRow>(launchId);
}

export function stockAlert(row: StockRow) {
  const capacity = Number(row.capacity_units), reserved = Number(row.reserved_units);
  const pct = capacity ? Math.round((reserved / capacity) * 100) : 100;
  const cutoff = Number(row.manual_cutoff) === 1 || reserved >= capacity;
  const level = cutoff ? 'CUTOFF' : pct >= Number(row.alert_threshold_pct) ? 'WARNING' : 'OK';
  return { capacityUnits: capacity, reservedUnits: reserved, remainingUnits: Math.max(0, capacity - reserved), utilizationPct: pct, level, cutoff, manualCutoff: Number(row.manual_cutoff) === 1, alertThresholdPct: Number(row.alert_threshold_pct) };
}

/* ------------------------------------------------------------------ Launch Gate (public) */

const DAY = 86_400_000;
type DocRow = { doc_type: string; expires_at: string | null; verified: number | string };
function docState(doc: DocRow | undefined, at: number) {
  if (!doc) return { status: 'MISSING' as const, expiresAt: null };
  if (Number(doc.verified) !== 1) return { status: 'PENDING_REVIEW' as const, expiresAt: doc.expires_at };
  if (doc.expires_at && Date.parse(doc.expires_at) <= at) return { status: 'EXPIRED' as const, expiresAt: doc.expires_at };
  if (doc.expires_at && Date.parse(doc.expires_at) - at <= 30 * DAY) return { status: 'EXPIRING' as const, expiresAt: doc.expires_at };
  return { status: 'PASS' as const, expiresAt: doc.expires_at };
}

export async function launchTrustChecklist(db: MajalDatabase, launch: LaunchRow, at = Date.now()) {
  const org = await db.prepare('SELECT commercial_name, verification_status FROM organizations WHERE id = ?').get<{ commercial_name: string; verification_status: string }>(launch.organization_id);
  const product = await db.prepare('SELECT allergens_json, dietary_tags_json FROM products WHERE id = ?').get<{ allergens_json: string | null; dietary_tags_json: string | null }>(launch.product_id);
  const docs = await db.prepare('SELECT doc_type, expires_at, verified FROM compliance_documents WHERE organization_id = ?').all<DocRow>(launch.organization_id);
  const doc = (type: string) => docs.find(d => d.doc_type === type);
  const gateRows = await db.prepare('SELECT gate_key, value FROM launch_gate_items WHERE collaboration_id = ?').all<{ gate_key: string; value: number | string }>(launch.collaboration_id);

  const licence = docState(doc('COMMERCIAL_LICENSE'), at);
  const licenceStatus = licence.status === 'MISSING' && org?.verification_status === 'VERIFIED' ? 'PASS' : licence.status;
  const allergens = safeParse(product?.allergens_json);
  const dietary = safeParse(product?.dietary_tags_json);
  const halalTagged = Array.isArray(dietary) && dietary.some(t => /halal|حلال/i.test(String(t)));
  const halalDoc = docState(doc('HALAL_CERT'), at);
  const food = [docState(doc('FOOD_SAFETY_CERT'), at), docState(doc('HEALTH_PERMIT'), at)];
  const foodBest = food.find(f => f.status === 'PASS') || food.find(f => f.status === 'EXPIRING') || food.find(f => f.status !== 'MISSING') || food[0];
  const gatePassed = gateRows.length > 0 && gateRows.every(r => Number(r.value) === 1);

  const items = [
    { key: 'LICENCE', labelAr: 'منشأة مرخّصة (رخصة تجارية سارية)', status: licenceStatus, expiresAt: licence.expiresAt, detail: org?.commercial_name ?? '' },
    { key: 'ALLERGENS', labelAr: 'مسببات الحساسية مُعلنة', status: Array.isArray(allergens) ? 'PASS' : 'MISSING', expiresAt: null, detail: Array.isArray(allergens) ? (allergens.length ? allergens.map(String).join('، ') : 'لا توجد مسببات حساسية مُعلنة') : 'لم تُعلن بعد' },
    { key: 'HALAL', labelAr: 'حلال', status: halalDoc.status === 'PASS' || halalDoc.status === 'EXPIRING' ? halalDoc.status : halalTagged ? 'DECLARED' : halalDoc.status, expiresAt: halalDoc.expiresAt, detail: halalDoc.status === 'PASS' ? 'شهادة حلال موثّقة' : halalTagged ? 'مُصرّح به من المنشأة' : '' },
    { key: 'FOOD_SAFETY', labelAr: 'شهادة سلامة الغذاء / ترخيص تداول الأغذية', status: foodBest.status, expiresAt: foodBest.expiresAt, detail: '' },
    { key: 'LAUNCH_GATE', labelAr: 'بوابة الإطلاق مكتملة', status: gatePassed || launch.status === 'LIVE' || launch.status === 'PERMANENT' ? 'PASS' : 'PENDING_REVIEW', expiresAt: null, detail: '' }
  ];
  return { launchId: launch.id, items, allPassed: items.every(i => i.status === 'PASS' || i.status === 'EXPIRING' || i.status === 'DECLARED'), checkedAt: new Date(at).toISOString() };
}

/* ------------------------------------------------------------------ canned replies */

export const HOST_CANNED_REPLIES = [
  { id: 'eta', titleAr: 'موعد التوصيل', bodyAr: 'هلا والله! طلبك قيد التحضير وبيوصلك خلال الوقت المتوقع للمنطقة. نبلغك أول ما يطلع مع المندوب.' },
  { id: 'sold_out', titleAr: 'نفاد الكمية', bodyAr: 'نعتذر منك، الكمية المخصصة لهذا الفرع خلصت. تقدر تسجل في «نبهني» ونرسل لك أول ما ينزل Drop جديد.' },
  { id: 'allergens', titleAr: 'الحساسية', bodyAr: 'مسببات الحساسية مذكورة في صفحة المنتج ضمن قائمة الامتثال. إذا عندك حساسية شديدة ننصحك تتواصل معنا قبل الطلب.' },
  { id: 'payment_pending', titleAr: 'الدفع معلّق', bodyAr: 'طلبك محجوز لك لمدة ١٥ دقيقة بانتظار إكمال الدفع. إذا انتهت المدة يتحرر الحجز تلقائيًا بدون أي خصم.' },
  { id: 'refund', titleAr: 'الاسترجاع', bodyAr: 'تم رفع طلب الاسترجاع لبوابة الدفع. يرجع المبلغ لنفس وسيلة الدفع حسب مدة البنك (عادة ٣–٧ أيام عمل).' },
  { id: 'pickup', titleAr: 'الاستلام من الفرع', bodyAr: 'طلبك جاهز للاستلام من الفرع في الموعد اللي اخترته. رجاءً اعرض رقم الطلب عند الكاشير.' },
  { id: 'quality', titleAr: 'ملاحظة على الجودة', bodyAr: 'شكرًا على ملاحظتك، نأخذها بجدية. رفعناها لفريق المطبخ والمبدع، وبنرجع لك بحل خلال ساعات.' },
  { id: 'halal', titleAr: 'حلال', bodyAr: 'جميع المكونات حلال، وحالة الشهادة موضحة في قائمة الامتثال بصفحة المنتج.' }
] as const;

/* ------------------------------------------------------------------ payout statement */

export interface StatementLine {
  accrualId: string; orderId: string; productName: string; units: number; orderedAt: string;
  grossFils: number; commissionFils: number; hostShareFils: number; creatorPayoutFils: number;
  stage: 'PENDING' | 'APPROVED' | 'PAID' | 'REVERSED';
  timeline: { pendingAt: string; approvedAt: string | null; paidAt: string | null };
  providerReference: string | null;
}

export async function creatorStatement(db: MajalDatabase, creatorId: string): Promise<{ lines: StatementLine[]; totals: Record<string, number> }> {
  const rows = await db.prepare(`
    SELECT a.id AS accrual_id, a.amount_fils, a.status AS accrual_status, a.created_at AS accrued_at,
           o.id AS order_id, o.units, o.unit_price_fils, o.created_at AS ordered_at,
           p.public_name,
           COALESCE((SELECT ov.platform_fee_basis_points FROM offer_versions ov WHERE ov.collaboration_id = l.collaboration_id AND ov.status = 'ACCEPTED' ORDER BY ov.version_number DESC LIMIT 1), 0) AS platform_fee_bp,
           sb.status AS batch_status, sb.provider_reference, sb.created_at AS batch_created_at, sb.updated_at AS batch_updated_at
    FROM accruals a
    JOIN orders o ON o.id = a.order_id
    JOIN launches l ON l.id = o.launch_id
    JOIN products p ON p.id = l.product_id
    LEFT JOIN settlement_batches sb ON sb.id = a.settlement_batch_id
    WHERE a.creator_id = ?
    ORDER BY o.created_at DESC, a.id DESC LIMIT 1000`).all<Record<string, string | number | null>>(creatorId);

  const lines: StatementLine[] = rows.map(r => {
    const grossFils = Number(r.units) * Number(r.unit_price_fils);
    const commissionFils = Math.round((grossFils * Number(r.platform_fee_bp)) / 10_000);
    const creatorPayoutFils = Number(r.amount_fils);
    const hostShareFils = Math.max(0, grossFils - commissionFils - creatorPayoutFils);
    const providerReference = r.provider_reference ? String(r.provider_reference) : null;
    // "Paid" is a claim about money leaving: only a batch carrying the provider's transfer
    // reference counts. A PAID flag without that reference stays "approved".
    const stage: StatementLine['stage'] = r.accrual_status === 'REVERSED' ? 'REVERSED'
      : r.accrual_status === 'PAID' && providerReference && r.batch_status === 'PAID' ? 'PAID'
      : r.accrual_status === 'LOCKED' || r.accrual_status === 'PAID' ? 'APPROVED' : 'PENDING';
    return {
      accrualId: String(r.accrual_id), orderId: String(r.order_id), productName: String(r.public_name), units: Number(r.units), orderedAt: String(r.ordered_at),
      grossFils, commissionFils, hostShareFils, creatorPayoutFils, stage,
      timeline: { pendingAt: String(r.accrued_at), approvedAt: stage === 'APPROVED' || stage === 'PAID' ? String(r.batch_created_at ?? r.accrued_at) : null, paidAt: stage === 'PAID' ? String(r.batch_updated_at) : null },
      providerReference: stage === 'PAID' ? providerReference : null
    };
  });
  const sum = (pick: (l: StatementLine) => number, stage?: StatementLine['stage']) => lines.filter(l => l.stage !== 'REVERSED' && (!stage || l.stage === stage)).reduce((s, l) => s + pick(l), 0);
  return {
    lines,
    totals: {
      grossFils: sum(l => l.grossFils), commissionFils: sum(l => l.commissionFils), hostShareFils: sum(l => l.hostShareFils), creatorPayoutFils: sum(l => l.creatorPayoutFils),
      pendingFils: sum(l => l.creatorPayoutFils, 'PENDING'), approvedFils: sum(l => l.creatorPayoutFils, 'APPROVED'), paidFils: sum(l => l.creatorPayoutFils, 'PAID')
    }
  };
}

const STAGE_AR: Record<StatementLine['stage'], string> = { PENDING: 'قيد الانتظار', APPROVED: 'معتمد', PAID: 'مدفوع', REVERSED: 'ملغى' };
const csvCell = (value: string | number) => {
  const s = String(value);
  // Neutralise spreadsheet formula injection and quote every cell.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
};

export function statementCsv(statement: Awaited<ReturnType<typeof creatorStatement>>) {
  const header = ['رقم الطلب', 'المنتج', 'الوحدات', 'تاريخ الطلب', 'الإجمالي (د.ك)', 'عمولة المنصة (د.ك)', 'حصة المنشأة (د.ك)', 'مستحق المبدع (د.ك)', 'الحالة', 'تاريخ الاعتماد', 'تاريخ الدفع', 'مرجع التحويل'];
  const body = statement.lines.map(l => [l.orderId, l.productName, l.units, l.orderedAt.slice(0, 10), filsToKwd(l.grossFils), filsToKwd(l.commissionFils), filsToKwd(l.hostShareFils), filsToKwd(l.creatorPayoutFils), STAGE_AR[l.stage], l.timeline.approvedAt?.slice(0, 10) ?? '', l.timeline.paidAt?.slice(0, 10) ?? '', l.providerReference ?? '']);
  const t = statement.totals;
  body.push(['الإجمالي', '', '', '', filsToKwd(t.grossFils), filsToKwd(t.commissionFils), filsToKwd(t.hostShareFils), filsToKwd(t.creatorPayoutFils), '', '', '', '']);
  // UTF-8 BOM so Excel opens Arabic correctly.
  return '﻿' + [header, ...body].map(row => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

/* ------------------------------------------------------------------ follower alerts */

export async function notifyCreatorFollowers(db: MajalDatabase, launchId: string) {
  const row = await db.prepare('SELECT l.id, p.public_name, c.creator_id, cp.display_name FROM launches l JOIN collaborations c ON c.id = l.collaboration_id JOIN products p ON p.id = l.product_id JOIN creator_profiles cp ON cp.id = c.creator_id WHERE l.id = ?')
    .get<{ id: string; public_name: string; creator_id: string; display_name: string }>(launchId);
  if (!row) return 0;
  const followers = await db.prepare('SELECT user_id FROM creator_follows WHERE creator_id = ? AND alerts_opt_in = 1 LIMIT 5000').all<{ user_id: string }>(row.creator_id);
  for (const f of followers) {
    await createOrCoalesceNotification(db, {
      userId: f.user_id, category: 'CREATOR_FOLLOW', priority: 'NOW',
      title: `إطلاق جديد من ${row.display_name}`, body: `نزل «${row.public_name}» الآن — الكمية محدودة.`,
      actionLabel: 'اطلب الآن', actionSurface: 'CONSUMER', entityType: 'LAUNCH', entityId: row.id, dedupeKey: `follow-launch:${row.id}`
    });
  }
  return followers.length;
}

/* ------------------------------------------------------------------ routers */

export function createCommercePublicRouter(db: MajalDatabase) {
  const router = Router();

  router.get('/launches/:launchId/checkout-options', async (req, res) => {
    const launch = await launchById(db, String(req.params.launchId));
    if (!launch || (launch.status !== 'LIVE' && launch.status !== 'PERMANENT')) return jsonError(res, 404, 'الإطلاق غير متاح.', 'LAUNCH_NOT_FOUND');
    const branches = (await organizationBranches(db, launch.organization_id)).filter(b => b.isActive !== false);
    const logistics = await db.prepare('SELECT branch_id, delivery_zones_json, pickup_slots_json FROM branch_logistics WHERE organization_id = ?')
      .all<{ branch_id: string; delivery_zones_json: string; pickup_slots_json: string }>(launch.organization_id);
    const stock = await stockRows(db, launch.id);
    const slotCounts = await db.prepare(`SELECT branch_id, pickup_slot_id, COUNT(*) AS c FROM orders WHERE launch_id = ? AND pickup_slot_id IS NOT NULL AND status IN ('PENDING_PAYMENT','PAID','FULFILLED') GROUP BY branch_id, pickup_slot_id`)
      .all<{ branch_id: string; pickup_slot_id: string; c: number | string }>(launch.id);
    const offer = await db.prepare("SELECT selling_price_fils FROM offer_versions WHERE collaboration_id = ? AND status = 'ACCEPTED' ORDER BY version_number DESC LIMIT 1").get<{ selling_price_fils: number | string }>(launch.collaboration_id);
    const cap = launch.quantity_cap === null || launch.quantity_cap === undefined ? null : Number(launch.quantity_cap);
    const consumed = await consumedUnits(db, launch.id);
    res.json({
      launchId: launch.id,
      unitPriceFils: offer ? Number(offer.selling_price_fils) : null,
      holdMinutes: PAYMENT_HOLD_MINUTES,
      quantityCap: cap,
      remainingUnits: cap === null ? null : Math.max(0, cap - consumed),
      branches: branches.map(b => {
        const l = logistics.find(x => x.branch_id === b.id);
        const s = stock.find(x => x.branch_id === b.id);
        const alert = s ? stockAlert(s) : null;
        return {
          id: b.id, name: b.name, area: b.area ?? null,
          deliveryZones: parseZones(l?.delivery_zones_json),
          pickupSlots: parseSlots(l?.pickup_slots_json).map(slot => {
            const taken = Number(slotCounts.find(c => c.branch_id === b.id && c.pickup_slot_id === slot.id)?.c ?? 0);
            return { id: slot.id, label: slot.label, available: taken < slot.capacityOrders };
          }),
          remainingUnits: alert ? alert.remainingUnits : null,
          orderingOpen: alert ? !alert.cutoff : true
        };
      })
    });
  });

  router.get('/launches/:launchId/trust', async (req, res) => {
    const launch = await launchById(db, String(req.params.launchId));
    if (!launch) return jsonError(res, 404, 'الإطلاق غير موجود.', 'LAUNCH_NOT_FOUND');
    res.json(await launchTrustChecklist(db, launch));
  });

  router.get('/creators/:creatorId/followers', async (req, res) => {
    const row = await db.prepare('SELECT COUNT(*) AS c FROM creator_follows WHERE creator_id = ?').get<{ c: number | string }>(String(req.params.creatorId));
    res.json({ creatorId: req.params.creatorId, followers: Number(row?.c ?? 0) });
  });

  return router;
}

const HOST_OPS_ROLES: AuthRole[] = ['HOST_OWNER', 'HOST_OPERATIONS', 'HOST_CHEF'];
const HOST_ALL_ROLES: AuthRole[] = ['HOST_OWNER', 'HOST_OPERATIONS', 'HOST_CHEF', 'HOST_FINANCE', 'HOST_MARKETING', 'HOST_SUPPORT'];

export function createCommerceRouter(db: MajalDatabase, authConfig: AuthConfig) {
  const router = Router();
  router.use(requireAuth(db, authConfig));
  router.use(requireCsrf(authConfig));

  const hostOrg = (req: AuthenticatedRequest) => req.auth!.user.hostBusinessId;
  const ownsLaunch = async (req: AuthenticatedRequest, launchId: string) => {
    const launch = await launchById(db, launchId);
    return launch && launch.organization_id === hostOrg(req) ? launch : undefined;
  };

  /* waitlist / notify me */
  router.post('/launches/:launchId/waitlist', async (req: AuthenticatedRequest, res) => {
    const launch = await launchById(db, String(req.params.launchId));
    if (!launch) return jsonError(res, 404, 'الإطلاق غير موجود.', 'LAUNCH_NOT_FOUND');
    const phone = normalizeKuwaitPhone(req.body?.phone ?? req.auth!.user.phone);
    if (!phone) return jsonError(res, 400, 'رقم الهاتف يجب أن يكون رقمًا كويتيًا من 8 أرقام (+965).', 'INVALID_PHONE');
    if (req.body?.whatsappOptIn !== true) return jsonError(res, 400, 'يلزم موافقتك الصريحة على التنبيه عبر واتساب.', 'CONSENT_REQUIRED');
    const at = now();
    await db.prepare(`INSERT INTO drop_waitlist(id, launch_id, user_id, phone, whatsapp_opt_in, status, created_at, updated_at) VALUES(?, ?, ?, ?, 1, 'WAITING', ?, ?)
      ON CONFLICT(launch_id, user_id) DO UPDATE SET phone = excluded.phone, whatsapp_opt_in = 1, status = 'WAITING', updated_at = excluded.updated_at`)
      .run(`wl_${randomUUID()}`, launch.id, req.auth!.user.id, phone, at, at);
    const count = await db.prepare("SELECT COUNT(*) AS c FROM drop_waitlist WHERE launch_id = ? AND status = 'WAITING'").get<{ c: number | string }>(launch.id);
    res.status(201).json({ waitlisted: true, launchId: launch.id, waiting: Number(count?.c ?? 0) });
  });

  router.delete('/launches/:launchId/waitlist', async (req: AuthenticatedRequest, res) => {
    await db.prepare("UPDATE drop_waitlist SET status = 'REMOVED', whatsapp_opt_in = 0, updated_at = ? WHERE launch_id = ? AND user_id = ?").run(now(), String(req.params.launchId), req.auth!.user.id);
    res.json({ waitlisted: false });
  });

  router.get('/waitlist/mine', async (req: AuthenticatedRequest, res) => {
    const rows = await db.prepare("SELECT launch_id FROM drop_waitlist WHERE user_id = ? AND status = 'WAITING'").all<{ launch_id: string }>(req.auth!.user.id);
    res.json({ launchIds: rows.map(r => r.launch_id) });
  });

  /** Host view: WhatsApp-ready links for opted-in customers (wa.me with a prefilled Arabic message). */
  router.get('/launches/:launchId/waitlist', requireRoles(...HOST_ALL_ROLES), async (req: AuthenticatedRequest, res) => {
    const launch = await ownsLaunch(req, String(req.params.launchId));
    if (!launch) return jsonError(res, 404, 'الإطلاق غير موجود.', 'LAUNCH_NOT_FOUND');
    const product = await db.prepare('SELECT public_name FROM products WHERE id = ?').get<{ public_name: string }>(launch.product_id);
    const rows = await db.prepare("SELECT id, phone, status, created_at FROM drop_waitlist WHERE launch_id = ? AND whatsapp_opt_in = 1 AND status <> 'REMOVED' ORDER BY created_at ASC LIMIT 2000")
      .all<{ id: string; phone: string; status: string; created_at: string }>(launch.id);
    const message = encodeURIComponent(`هلا! «${product?.public_name ?? 'الإطلاق'}» صار متاح الآن على مجال. الكمية محدودة 🔔`);
    res.json({ entries: rows.map(r => ({ id: r.id, phone: r.phone, status: r.status, createdAt: r.created_at, whatsappUrl: `https://wa.me/${r.phone.replace('+', '')}?text=${message}` })) });
  });

  router.post('/launches/:launchId/waitlist/notify', requireRoles('HOST_OWNER', 'HOST_OPERATIONS', 'HOST_MARKETING'), async (req: AuthenticatedRequest, res) => {
    const launch = await ownsLaunch(req, String(req.params.launchId));
    if (!launch) return jsonError(res, 404, 'الإطلاق غير موجود.', 'LAUNCH_NOT_FOUND');
    const product = await db.prepare('SELECT public_name FROM products WHERE id = ?').get<{ public_name: string }>(launch.product_id);
    const rows = await db.prepare("SELECT id, user_id FROM drop_waitlist WHERE launch_id = ? AND status = 'WAITING' LIMIT 2000").all<{ id: string; user_id: string }>(launch.id);
    for (const r of rows) {
      await createOrCoalesceNotification(db, { userId: r.user_id, category: 'DROP_WAITLIST', priority: 'NOW', title: 'الإطلاق اللي تنتظره صار متاح', body: `«${product?.public_name ?? 'الإطلاق'}» متاح الآن — الكمية محدودة.`, actionLabel: 'اطلب الآن', actionSurface: 'CONSUMER', entityType: 'LAUNCH', entityId: launch.id, dedupeKey: `waitlist:${launch.id}` });
      await db.prepare("UPDATE drop_waitlist SET status = 'NOTIFIED', updated_at = ? WHERE id = ?").run(now(), r.id);
    }
    res.json({ notified: rows.length });
  });

  /* follow creator */
  router.post('/creators/:creatorId/follow', async (req: AuthenticatedRequest, res) => {
    const creator = await db.prepare('SELECT id FROM creator_profiles WHERE id = ?').get<{ id: string }>(String(req.params.creatorId));
    if (!creator) return jsonError(res, 404, 'المبدع غير موجود.', 'CREATOR_NOT_FOUND');
    const alerts = req.body?.alerts === false ? 0 : 1;
    await db.prepare('INSERT INTO creator_follows(user_id, creator_id, alerts_opt_in, created_at) VALUES(?, ?, ?, ?) ON CONFLICT(user_id, creator_id) DO UPDATE SET alerts_opt_in = excluded.alerts_opt_in')
      .run(req.auth!.user.id, creator.id, alerts, now());
    res.status(201).json({ following: true, creatorId: creator.id, alerts: alerts === 1 });
  });
  router.delete('/creators/:creatorId/follow', async (req: AuthenticatedRequest, res) => {
    await db.prepare('DELETE FROM creator_follows WHERE user_id = ? AND creator_id = ?').run(req.auth!.user.id, String(req.params.creatorId));
    res.json({ following: false });
  });
  router.get('/follows', async (req: AuthenticatedRequest, res) => {
    const rows = await db.prepare('SELECT creator_id, alerts_opt_in FROM creator_follows WHERE user_id = ?').all<{ creator_id: string; alerts_opt_in: number | string }>(req.auth!.user.id);
    res.json({ follows: rows.map(r => ({ creatorId: r.creator_id, alerts: Number(r.alerts_opt_in) === 1 })) });
  });

  /* host: branch logistics */
  router.put('/branches/:branchId/logistics', requireRoles('HOST_OWNER', 'HOST_OPERATIONS'), async (req: AuthenticatedRequest, res) => {
    const org = hostOrg(req);
    if (!org) return jsonError(res, 403, 'لا توجد منشأة مرتبطة بحسابك.', 'FORBIDDEN');
    const branchId = String(req.params.branchId);
    if (!(await organizationBranches(db, org)).some(b => b.id === branchId)) return jsonError(res, 404, 'الفرع غير موجود.', 'BRANCH_NOT_FOUND');
    const zones = parseZones(req.body?.deliveryZones), slots = parseSlots(req.body?.pickupSlots);
    if ((Array.isArray(req.body?.deliveryZones) && zones.length !== req.body.deliveryZones.length) || (Array.isArray(req.body?.pickupSlots) && slots.length !== req.body.pickupSlots.length)) {
      return jsonError(res, 400, 'بيانات مناطق التوصيل أو مواعيد الاستلام غير صالحة.', 'INVALID_LOGISTICS');
    }
    await db.prepare(`INSERT INTO branch_logistics(organization_id, branch_id, delivery_zones_json, pickup_slots_json, updated_at) VALUES(?, ?, ?, ?, ?)
      ON CONFLICT(organization_id, branch_id) DO UPDATE SET delivery_zones_json = excluded.delivery_zones_json, pickup_slots_json = excluded.pickup_slots_json, updated_at = excluded.updated_at`)
      .run(org, branchId, JSON.stringify(zones), JSON.stringify(slots), now());
    res.json({ branchId, deliveryZones: zones, pickupSlots: slots });
  });

  /* host: per-branch prep capacity (reservation ceiling) */
  router.put('/launches/:launchId/branches/:branchId/stock', requireRoles(...HOST_OPS_ROLES), async (req: AuthenticatedRequest, res) => {
    const launch = await ownsLaunch(req, String(req.params.launchId));
    if (!launch) return jsonError(res, 404, 'الإطلاق غير موجود.', 'LAUNCH_NOT_FOUND');
    const branchId = String(req.params.branchId);
    if (!(await organizationBranches(db, launch.organization_id)).some(b => b.id === branchId)) return jsonError(res, 404, 'الفرع غير موجود.', 'BRANCH_NOT_FOUND');
    const capacity = Number(req.body?.capacityUnits), threshold = req.body?.alertThresholdPct === undefined ? 80 : Number(req.body.alertThresholdPct);
    if (!Number.isInteger(capacity) || capacity < 0 || capacity > 100_000) return jsonError(res, 400, 'طاقة التحضير غير صالحة.', 'INVALID_CAPACITY');
    if (!Number.isInteger(threshold) || threshold < 1 || threshold > 100) return jsonError(res, 400, 'حد التنبيه غير صالح.', 'INVALID_THRESHOLD');
    const cutoff = req.body?.manualCutoff === true ? 1 : 0;
    const at = now();
    const existing = await db.prepare('SELECT reserved_units FROM launch_branch_stock WHERE launch_id = ? AND branch_id = ?').get<{ reserved_units: number | string }>(launch.id, branchId);
    if (existing && capacity < Number(existing.reserved_units)) return jsonError(res, 409, 'لا يمكن خفض الطاقة تحت الكمية المحجوزة فعلًا.', 'CAPACITY_BELOW_RESERVED');
    if (existing) {
      await db.prepare('UPDATE launch_branch_stock SET capacity_units = ?, alert_threshold_pct = ?, manual_cutoff = ?, updated_at = ? WHERE launch_id = ? AND branch_id = ?').run(capacity, threshold, cutoff, at, launch.id, branchId);
    } else {
      // A branch configured mid-drop starts with the orders it already holds.
      const held = await db.prepare(`SELECT COALESCE(SUM(units), 0) AS u FROM orders WHERE launch_id = ? AND branch_id = ? AND status IN ('PENDING_PAYMENT','PAID','FULFILLED')`).get<{ u: number | string }>(launch.id, branchId);
      if (capacity < Number(held?.u ?? 0)) return jsonError(res, 409, 'لا يمكن خفض الطاقة تحت الكمية المحجوزة فعلًا.', 'CAPACITY_BELOW_RESERVED');
      await db.prepare('INSERT INTO launch_branch_stock(launch_id, branch_id, capacity_units, reserved_units, alert_threshold_pct, manual_cutoff, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?)')
        .run(launch.id, branchId, capacity, Number(held?.u ?? 0), threshold, cutoff, at);
    }
    const row = (await stockRows(db, launch.id)).find(r => r.branch_id === branchId)!;
    res.json({ launchId: launch.id, branchId, ...stockAlert(row) });
  });

  /* host: war room */
  router.get('/host/war-room', requireRoles(...HOST_ALL_ROLES), async (req: AuthenticatedRequest, res) => {
    const org = hostOrg(req);
    if (!org) return jsonError(res, 403, 'لا توجد منشأة مرتبطة بحسابك.', 'FORBIDDEN');
    const launches = await db.prepare("SELECT l.id, l.status, l.quantity_cap, p.public_name FROM launches l JOIN products p ON p.id = l.product_id WHERE l.organization_id = ? AND l.status IN ('LIVE','PERMANENT','PAUSED') ORDER BY l.updated_at DESC LIMIT 50")
      .all<{ id: string; status: string; quantity_cap: number | string | null; public_name: string }>(org);
    const branches = await organizationBranches(db, org);
    const out = [];
    for (const l of launches) {
      const stock = await stockRows(db, l.id);
      const pending = await db.prepare("SELECT COUNT(*) AS c FROM orders WHERE launch_id = ? AND status = 'PENDING_PAYMENT'").get<{ c: number | string }>(l.id);
      const paid = await db.prepare("SELECT COUNT(*) AS c FROM orders WHERE launch_id = ? AND status = 'PAID'").get<{ c: number | string }>(l.id);
      out.push({
        launchId: l.id, title: l.public_name, status: l.status,
        pendingPaymentOrders: Number(pending?.c ?? 0), paidAwaitingFulfilment: Number(paid?.c ?? 0),
        branches: branches.map(b => {
          const s = stock.find(x => x.branch_id === b.id);
          return { branchId: b.id, name: b.name, configured: Boolean(s), ...(s ? stockAlert(s) : {}) };
        })
      });
    }
    const alerts = out.flatMap(l => l.branches.filter(b => 'level' in b && b.level !== 'OK').map(b => ({
      launchId: l.launchId, branchId: b.branchId, level: (b as { level: string }).level,
      messageAr: (b as { level: string }).level === 'CUTOFF'
        ? `«${l.title}» — فرع ${b.name}: بلغت طاقة التحضير، والطلبات متوقفة تلقائيًا.`
        : `«${l.title}» — فرع ${b.name}: تجاوز ${(b as { utilizationPct: number }).utilizationPct}% من طاقة التحضير.`
    })));
    res.json({ organizationId: org, launches: out, alerts, cannedReplies: HOST_CANNED_REPLIES });
  });

  router.get('/host/canned-replies', requireRoles(...HOST_ALL_ROLES), (_req, res) => { res.json({ replies: HOST_CANNED_REPLIES }); });

  /* compliance documents: host declares, admin verifies */
  router.put('/compliance/:docType', requireRoles('HOST_OWNER'), async (req: AuthenticatedRequest, res) => {
    const org = hostOrg(req);
    const docType = String(req.params.docType);
    if (!org) return jsonError(res, 403, 'لا توجد منشأة مرتبطة بحسابك.', 'FORBIDDEN');
    if (!['COMMERCIAL_LICENSE', 'HEALTH_PERMIT', 'FOOD_SAFETY_CERT', 'HALAL_CERT'].includes(docType)) return jsonError(res, 400, 'نوع المستند غير صالح.', 'INVALID_DOC_TYPE');
    const reference = text(req.body?.reference, 3, 120);
    const expiresAt = req.body?.expiresAt ? String(req.body.expiresAt) : null;
    if (!reference) return jsonError(res, 400, 'رقم المستند مطلوب.', 'INVALID_REFERENCE');
    if (expiresAt && Number.isNaN(Date.parse(expiresAt))) return jsonError(res, 400, 'تاريخ الانتهاء غير صالح.', 'INVALID_EXPIRY');
    // Any host edit resets verification: a changed document must be re-checked by an admin.
    await db.prepare(`INSERT INTO compliance_documents(organization_id, doc_type, reference, expires_at, verified, updated_by_user_id, updated_at) VALUES(?, ?, ?, ?, 0, ?, ?)
      ON CONFLICT(organization_id, doc_type) DO UPDATE SET reference = excluded.reference, expires_at = excluded.expires_at, verified = 0, updated_by_user_id = excluded.updated_by_user_id, updated_at = excluded.updated_at`)
      .run(org, docType, reference, expiresAt ? new Date(expiresAt).toISOString() : null, req.auth!.user.id, now());
    res.json({ docType, verified: false, expiresAt });
  });

  router.post('/compliance/:organizationId/:docType/verify', requireRoles('ADMIN', 'SUPER_ADMIN'), async (req: AuthenticatedRequest, res) => {
    const result = await db.prepare('UPDATE compliance_documents SET verified = 1, updated_by_user_id = ?, updated_at = ? WHERE organization_id = ? AND doc_type = ?')
      .run(req.auth!.user.id, now(), String(req.params.organizationId), String(req.params.docType));
    if (!result.changes) return jsonError(res, 404, 'المستند غير موجود.', 'DOC_NOT_FOUND');
    res.json({ verified: true });
  });

  /* creator payout statement */
  const statementCreator = (req: AuthenticatedRequest) => {
    const user = req.auth!.user;
    if (user.role === 'ADMIN' || user.role === 'SUPER_ADMIN') return text(req.query.creatorId, 3, 120) ?? user.creatorId;
    return user.role === 'CREATOR' ? user.creatorId : undefined;
  };
  router.get('/creator/statement', async (req: AuthenticatedRequest, res) => {
    const creatorId = statementCreator(req);
    if (!creatorId) return jsonError(res, 403, 'كشف المستحقات متاح للمبدع صاحب الحساب فقط.', 'FORBIDDEN');
    res.json({ creatorId, currency: 'KWD', ...(await creatorStatement(db, creatorId)) });
  });
  router.get('/creator/statement.csv', async (req: AuthenticatedRequest, res) => {
    const creatorId = statementCreator(req);
    if (!creatorId) return jsonError(res, 403, 'كشف المستحقات متاح للمبدع صاحب الحساب فقط.', 'FORBIDDEN');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="majal-statement-${creatorId}.csv"`);
    res.send(statementCsv(await creatorStatement(db, creatorId)));
  });

  return router;
}
