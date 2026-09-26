import { createHash, randomUUID } from 'node:crypto';
import { Response, Router } from 'express';
import { AuthConfig, AuthRole, AuthenticatedRequest, requireAuth, requireCsrf, requireRoles } from './auth';
import { MajalDatabase, withTransaction } from './database';
import { syncRoleClaim } from './firebase-mirror';

/*
 * إجراءات الإشراف الإدارية.
 *
 * كانت هذه الإجراءات تُنفَّذ في حالة المتصفح فقط: الأدمن يرى نجاحًا، والحساب المعلَّق يبقى
 * نشطًا فعلًا على الخادم والمنتج الموقوف يستمر بالبيع. النسخة الخادمية تجعل الأثر حقيقيًا،
 * وتضيف ما لا يستطيعه العميل أصلًا: إبطال جلسات الحساب المعلَّق فورًا.
 */

const now = () => new Date().toISOString();
const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
const jsonError = (res: Response, status: number, message: string, code: string) =>
  res.status(status).json({ error: message, code });
const text = (value: unknown, min: number, max: number) =>
  typeof value === 'string' && value.trim().length >= min && value.trim().length <= max ? value.trim() : undefined;

const ASSIGNABLE_ROLES: AuthRole[] = [
  'CREATOR', 'HOST_OWNER', 'HOST_OPERATIONS', 'HOST_CHEF', 'HOST_FINANCE',
  'HOST_MARKETING', 'HOST_SUPPORT', 'ADMIN', 'CONSUMER'
];
const ASSIGNABLE_STATUSES = ['ACTIVE', 'SUSPENDED', 'INVITED'] as const;

type UserRow = { id: string; name: string; email: string; role: string; status: string };
type ProductRow = { id: string; creator_id: string; public_name: string; status: string };

async function recordModeration(
  db: MajalDatabase, req: AuthenticatedRequest,
  targetType: 'USER' | 'PRODUCT', targetId: string, action: string,
  previousValue: string, newValue: string, reason: string
) {
  const auth = req.auth!;
  const createdAt = now();
  await db.prepare(
    `INSERT INTO moderation_actions(id, actor_user_id, actor_role, target_type, target_id, action, previous_value, new_value, reason, created_at)
     VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(`mod_${randomUUID()}`, auth.user.id, auth.user.role, targetType, targetId, action, previousValue, newValue, reason, createdAt);

  await db.prepare(
    `INSERT INTO domain_audit_events(actor_user_id, actor_role, organization_id, action, entity_type, entity_id, before_sha256, after_sha256, request_id, session_hash, created_at)
     VALUES(?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(auth.user.id, auth.user.role, action, targetType, targetId,
    sha256(previousValue), sha256(newValue),
    text(req.header('x-request-id'), 8, 128) || randomUUID(), sha256(auth.tokenHash), createdAt);
}

export function createModerationRouter(db: MajalDatabase, authConfig: AuthConfig) {
  const router = Router();
  router.use(requireAuth(db, authConfig));
  router.use(requireCsrf(authConfig));

  /*
   * تغيير الدور محصور بالسوبر أدمن: الدور هو حدّ الصلاحية نفسه، فمن يملك تعديله يملك
   * ترقية نفسه. ولهذا أيضًا لا يستطيع أحد تعديل دوره هو، ولا لمس حساب سوبر أدمن آخر.
   */
  router.post('/users/:id/role', requireRoles('SUPER_ADMIN'), async (req: AuthenticatedRequest, res) => {
    const userId = text(req.params.id, 3, 120);
    const role = text(req.body?.role, 3, 40) as AuthRole | undefined;
    const reason = text(req.body?.reason, 3, 500);
    if (!userId) return jsonError(res, 400, 'معرّف المستخدم غير صالح.', 'INVALID_USER');
    if (!role || !ASSIGNABLE_ROLES.includes(role)) return jsonError(res, 400, 'الدور المطلوب غير صالح.', 'INVALID_ROLE');
    if (!reason) return jsonError(res, 400, 'سبب تغيير الدور مطلوب للتدقيق.', 'REASON_REQUIRED');
    if (userId === req.auth!.user.id) return jsonError(res, 409, 'لا يمكن تغيير دورك الخاص.', 'SELF_ROLE_CHANGE');

    const target = await db.prepare('SELECT id, name, email, role, status FROM users WHERE id = ? LIMIT 1').get<UserRow>(userId);
    if (!target) return jsonError(res, 404, 'المستخدم غير موجود.', 'USER_NOT_FOUND');
    // خفض سوبر أدمن آخر يمرّ عبر bootstrap المُدار، لا عبر واجهة تشغيلية.
    if (target.role === 'SUPER_ADMIN') return jsonError(res, 409, 'حسابات السوبر أدمن تُدار عبر bootstrap فقط.', 'SUPER_ADMIN_IMMUTABLE');
    if (target.role === role) return res.json({ user: { id: target.id, role: target.role, status: target.status }, changed: false });

    /*
     * تغيير الدور يبطل جلسات الحساب: الجلسة القائمة تحمل الدور القديم، فبقاؤها يعني أن
     * الخفض لا يسري حتى تنتهي صلاحيتها من تلقاء نفسها.
     */
    await withTransaction(db, async tx => {
      await tx.prepare('UPDATE users SET role = ?, updated_at = ? WHERE id = ?').run(role, now(), userId);
      await tx.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
    });
    await recordModeration(db, req, 'USER', userId, 'ROLE_CHANGED', target.role, role, reason);
    void syncRoleClaim(userId, role, target.status);
    res.json({ user: { id: target.id, role, status: target.status }, changed: true, sessionsRevoked: true });
  });

  /** تعليق/تفعيل حساب. التعليق يطرد الحساب من جلساته فورًا. */
  router.post('/users/:id/status', requireRoles('ADMIN', 'SUPER_ADMIN'), async (req: AuthenticatedRequest, res) => {
    const userId = text(req.params.id, 3, 120);
    const status = text(req.body?.status, 3, 20);
    const reason = text(req.body?.reason, 3, 500);
    if (!userId) return jsonError(res, 400, 'معرّف المستخدم غير صالح.', 'INVALID_USER');
    if (!status || !ASSIGNABLE_STATUSES.includes(status as typeof ASSIGNABLE_STATUSES[number])) {
      return jsonError(res, 400, 'حالة الحساب المطلوبة غير صالحة.', 'INVALID_STATUS');
    }
    if (!reason) return jsonError(res, 400, 'سبب تغيير حالة الحساب مطلوب للتدقيق.', 'REASON_REQUIRED');
    if (userId === req.auth!.user.id) return jsonError(res, 409, 'لا يمكن تغيير حالة حسابك الخاص.', 'SELF_STATUS_CHANGE');

    const target = await db.prepare('SELECT id, name, email, role, status FROM users WHERE id = ? LIMIT 1').get<UserRow>(userId);
    if (!target) return jsonError(res, 404, 'المستخدم غير موجود.', 'USER_NOT_FOUND');
    if (target.role === 'SUPER_ADMIN') return jsonError(res, 409, 'لا يمكن تعليق حساب سوبر أدمن من هذه الواجهة.', 'SUPER_ADMIN_IMMUTABLE');
    if (target.status === status) return res.json({ user: { id: target.id, role: target.role, status: target.status }, changed: false });

    await withTransaction(db, async tx => {
      await tx.prepare('UPDATE users SET status = ?, updated_at = ? WHERE id = ?').run(status, now(), userId);
      if (status !== 'ACTIVE') await tx.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
    });
    await recordModeration(db, req, 'USER', userId, 'USER_STATUS_CHANGED', target.status, status, reason);
    void syncRoleClaim(userId, target.role, status);
    res.json({ user: { id: target.id, role: target.role, status }, changed: true, sessionsRevoked: status !== 'ACTIVE' });
  });

  /*
   * إيقاف منتج. الأثر الحقيقي هو إيقاف إطلاقاته الحيّة — بدون ذلك يبقى المنتج معروضًا
   * وقابلًا للطلب مهما بدت حالته في لوحة الأدمن.
   */
  router.post('/products/:id/pause', requireRoles('ADMIN', 'SUPER_ADMIN'), async (req: AuthenticatedRequest, res) => {
    const productId = text(req.params.id, 3, 120);
    const reason = text(req.body?.reason, 3, 500);
    if (!productId) return jsonError(res, 400, 'معرّف المنتج غير صالح.', 'INVALID_PRODUCT');
    if (!reason) return jsonError(res, 400, 'سبب إيقاف المنتج مطلوب للتدقيق.', 'REASON_REQUIRED');

    const product = await db.prepare('SELECT id, creator_id, public_name, status FROM products WHERE id = ? LIMIT 1').get<ProductRow>(productId);
    if (!product) return jsonError(res, 404, 'المنتج غير موجود.', 'PRODUCT_NOT_FOUND');

    let pausedLaunches = 0;
    await withTransaction(db, async tx => {
      await tx.prepare('UPDATE products SET status = ?, updated_at = ? WHERE id = ?').run('PAUSED', now(), productId);
      const result = await tx.prepare(
        "UPDATE launches SET status = 'PAUSED', updated_at = ? WHERE product_id = ? AND status IN ('LIVE','PERMANENT')"
      ).run(now(), productId);
      pausedLaunches = Number(result.changes ?? 0);
    });
    await recordModeration(db, req, 'PRODUCT', productId, 'PRODUCT_PAUSED', product.status, 'PAUSED', reason);
    res.json({ product: { id: product.id, status: 'PAUSED' }, pausedLaunches });
  });

  /*
   * إعادة التشغيل لا تُعيد الإطلاق إلى LIVE تلقائيًا: بوابة الإطلاق (Launch Gate) قد تكون
   * سقطت أثناء الإيقاف. يعود المنتج للمطابقة، وإعادة الإطلاق تمرّ ببوابته المعتادة.
   */
  router.post('/products/:id/resume', requireRoles('ADMIN', 'SUPER_ADMIN'), async (req: AuthenticatedRequest, res) => {
    const productId = text(req.params.id, 3, 120);
    const reason = text(req.body?.reason, 3, 500) || 'إعادة تشغيل بعد مراجعة إدارية.';
    if (!productId) return jsonError(res, 400, 'معرّف المنتج غير صالح.', 'INVALID_PRODUCT');

    const product = await db.prepare('SELECT id, creator_id, public_name, status FROM products WHERE id = ? LIMIT 1').get<ProductRow>(productId);
    if (!product) return jsonError(res, 404, 'المنتج غير موجود.', 'PRODUCT_NOT_FOUND');
    if (product.status !== 'PAUSED') return jsonError(res, 409, 'المنتج ليس موقوفًا.', 'PRODUCT_NOT_PAUSED');

    await db.prepare('UPDATE products SET status = ?, updated_at = ? WHERE id = ?').run('AVAILABLE_FOR_MATCHING', now(), productId);
    await recordModeration(db, req, 'PRODUCT', productId, 'PRODUCT_RESUMED', product.status, 'AVAILABLE_FOR_MATCHING', reason);
    res.json({
      product: { id: product.id, status: 'AVAILABLE_FOR_MATCHING' },
      note: 'الإطلاقات الموقوفة تحتاج اجتياز بوابة الإطلاق من جديد قبل العودة للبيع.'
    });
  });

  /** سجل الإجراءات الإدارية — يقرؤه إنسان عند المراجعة أو النزاع. */
  router.get('/actions', requireRoles('ADMIN', 'SUPER_ADMIN'), async (req: AuthenticatedRequest, res) => {
    const targetType = text(req.query?.targetType, 4, 10);
    const rows = targetType === 'USER' || targetType === 'PRODUCT'
      ? await db.prepare('SELECT * FROM moderation_actions WHERE target_type = ? ORDER BY created_at DESC, id DESC LIMIT 200').all<Record<string, unknown>>(targetType)
      : await db.prepare('SELECT * FROM moderation_actions ORDER BY created_at DESC, id DESC LIMIT 200').all<Record<string, unknown>>();
    res.json({
      actions: rows.map(row => ({
        id: row.id, actorUserId: row.actor_user_id, actorRole: row.actor_role,
        targetType: row.target_type, targetId: row.target_id, action: row.action,
        previousValue: row.previous_value, newValue: row.new_value,
        reason: row.reason, createdAt: row.created_at
      }))
    });
  });

  return router;
}
