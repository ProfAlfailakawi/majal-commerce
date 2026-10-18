import { Router } from 'express';
import { AuthConfig, AuthenticatedRequest, requireAuth, requireRoles } from './auth';
import { MajalDatabase } from './database';

/*
 * أرقام الأدمن من الخادم: المبيعات والرسوم والعقود والنزاعات والتسويات.
 *
 * في الوضع الحقيقي لم يكن أي مسار يملأ هذه الأرقام في المتصفح، فكانت البطاقات فارغة أو أصفارًا
 * تُوهم أن المنصة لم تبع شيئًا. هنا تُحسب مباشرة من الجداول، للأدمن والسوبر أدمن فقط، وللقراءة فقط.
 *
 *  - المبيعات: طلبات PAID/FULFILLED فقط، سعر الوحدة × الوحدات (بدون التوصيل — ليس إيرادًا للمبدع ولا للمنصة).
 *  - رسوم المنصة: نسبة العرض المعتمد الأخير لكل تعاون، تُقرَّب لكل طلب بالجبر نصف-لأعلى كما في كشف المبدع.
 *  - النزاع المفتوح: تعاون في مرحلة DISPUTED (لا جدول نزاعات مستقلًا).
 */

const PAID = "('PAID','FULFILLED')";
const n = (value: unknown) => Number(value ?? 0) || 0;

export async function adminMetrics(db: MajalDatabase) {
  const sales = await db.prepare(
    `SELECT COUNT(*) AS paid_orders,
            COALESCE(SUM(o.units * o.unit_price_fils), 0) AS gross_fils,
            COALESCE(SUM((o.units * o.unit_price_fils * COALESCE(ov.platform_fee_basis_points, 0) + 5000) / 10000), 0) AS fee_fils
       FROM orders o
       JOIN launches l ON l.id = o.launch_id
       LEFT JOIN offer_versions ov ON ov.collaboration_id = l.collaboration_id AND ov.status = 'ACCEPTED'
        AND ov.version_number = (SELECT MAX(x.version_number) FROM offer_versions x WHERE x.collaboration_id = ov.collaboration_id AND x.status = 'ACCEPTED')
      WHERE o.status IN ${PAID}`
  ).get<Record<string, number | string>>();
  const pending = await db.prepare("SELECT COUNT(*) AS c FROM orders WHERE status = 'PENDING_PAYMENT'").get<{ c: number | string }>();
  const contracts = await db.prepare("SELECT COUNT(DISTINCT collaboration_id) AS c FROM contract_versions WHERE status = 'FULLY_SIGNED'").get<{ c: number | string }>();
  const disputes = await db.prepare("SELECT COUNT(*) AS c FROM collaborations WHERE stage = 'DISPUTED'").get<{ c: number | string }>();
  const hosts = await db.prepare(
    "SELECT COUNT(*) AS total, COALESCE(SUM(CASE WHEN verification_status = 'VERIFIED' THEN 1 ELSE 0 END), 0) AS verified FROM organizations WHERE organization_type = 'HOST'"
  ).get<{ total: number | string; verified: number | string }>();
  const users = await db.prepare('SELECT COUNT(*) AS c FROM users').get<{ c: number | string }>();
  const launches = await db.prepare("SELECT COUNT(*) AS c FROM launches WHERE status IN ('LIVE','PERMANENT')").get<{ c: number | string }>();
  const eligible = await db.prepare("SELECT COUNT(DISTINCT creator_id) AS c FROM accruals WHERE status = 'ELIGIBLE'").get<{ c: number | string }>();
  const batches = await db.prepare('SELECT status, COUNT(*) AS c, COALESCE(SUM(total_fils), 0) AS total FROM settlement_batches GROUP BY status')
    .all<{ status: string; c: number | string; total: number | string }>();
  const byStatus = Object.fromEntries(batches.map(b => [b.status, { count: n(b.c), totalFils: n(b.total) }]));

  return {
    generatedAt: new Date().toISOString(),
    sales: { paidOrders: n(sales?.paid_orders), grossFils: n(sales?.gross_fils), platformFeeFils: n(sales?.fee_fils), pendingPaymentOrders: n(pending?.c) },
    contracts: { fullySigned: n(contracts?.c) },
    disputes: { open: n(disputes?.c) },
    hosts: { total: n(hosts?.total), verified: n(hosts?.verified) },
    users: { total: n(users?.c) },
    launches: { live: n(launches?.c) },
    settlements: {
      eligibleCreators: n(eligible?.c),
      batchesTotal: batches.reduce((sum, b) => sum + n(b.c), 0),
      paidFils: byStatus.PAID?.totalFils ?? 0,
      approvedFils: byStatus.APPROVED?.totalFils ?? 0,
      byStatus
    }
  };
}

export function createAdminMetricsRouter(db: MajalDatabase, authConfig: AuthConfig) {
  const router = Router();
  router.use(requireAuth(db, authConfig));
  router.get('/metrics', requireRoles('ADMIN', 'SUPER_ADMIN'), async (_req: AuthenticatedRequest, res) => {
    res.set('Cache-Control', 'no-store');
    res.json({ metrics: await adminMetrics(db) });
  });
  return router;
}
