import { createHash, randomUUID } from 'node:crypto';
import { Response, Router } from 'express';
import { AuthConfig, AuthenticatedRequest, clearSessionCookies, requireAuth, requireCsrf, requireRoles, verifyPassword } from './auth';
import { MajalDatabase, withTransaction } from './database';
import { syncRoleClaim } from './firebase-mirror';

/*
 * App Store guideline 1.2 (reporting published reviews) and 5.1.1(v) (account deletion request).
 *
 *  - A signed-in user can report a published review. Reports reach admins through GET /admin/queues
 *    and a report can hide the review (status HIDDEN, which the public read already excludes).
 *  - A registered user can ask for account deletion. The request is only a queue entry (ids, time,
 *    status): it signs the user out, suspends login and revokes sessions, and deletes nothing.
 *    Contracts, settlements, payments and the hash-chained audit log are never touched; the owner
 *    erases the operational data later (see apple-release/review/account-deletion.md).
 */

const now = () => new Date().toISOString();
const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
const jsonError = (res: Response, status: number, message: string, code: string) =>
  res.status(status).json({ error: message, code });
const text = (value: unknown, min: number, max: number) =>
  typeof value === 'string' && value.trim().length >= min && value.trim().length <= max ? value.trim() : undefined;

export const REPORT_REASONS = ['SPAM', 'ABUSE', 'INAPPROPRIATE', 'OTHER'] as const;
const PASSWORD_MAX_LENGTH = 128;
const NOTE_MAX = 500;
const QUEUE_LIMIT = 100;

export const DELETION_NOTICE_AR = 'سنحذف حسابك خلال 30 يومًا؛ السجلات التي يُلزمنا القانون بالاحتفاظ بها تبقى بصيغة مجهّلة.';
export const DELETION_NOTICE_EN = 'We will delete your account within 30 days; records we are legally required to keep are retained in de-identified form.';

async function audit(
  db: MajalDatabase, req: AuthenticatedRequest, action: string, entityType: string, entityId: string, before: string, after: string
) {
  const auth = req.auth!;
  await db.prepare(
    `INSERT INTO domain_audit_events(actor_user_id, actor_role, organization_id, action, entity_type, entity_id, before_sha256, after_sha256, request_id, session_hash, created_at)
     VALUES(?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(auth.user.id, auth.user.role, action, entityType, entityId, sha256(before), sha256(after),
    text(req.header('x-request-id'), 8, 128) || randomUUID(), sha256(auth.tokenHash), now());
}

export function createSafetyRouter(db: MajalDatabase, authConfig: AuthConfig) {
  const router = Router();
  router.use(requireAuth(db, authConfig));
  router.use(requireCsrf(authConfig));

  /** Report a published review. One report per user per review; a repeat is acknowledged, not duplicated. */
  router.post('/reviews/:id/report', async (req: AuthenticatedRequest, res) => {
    const reviewId = text(req.params.id, 3, 120);
    const reason = text(req.body?.reason, 3, 20);
    const rawNote = req.body?.note;
    if (!reviewId) return jsonError(res, 400, 'معرّف التقييم غير صالح.', 'INVALID_REVIEW');
    if (!reason || !(REPORT_REASONS as readonly string[]).includes(reason)) return jsonError(res, 400, 'سبب البلاغ غير صالح.', 'INVALID_REASON');
    if (rawNote !== undefined && rawNote !== null && (typeof rawNote !== 'string' || rawNote.length > NOTE_MAX)) {
      return jsonError(res, 400, 'الملاحظة طويلة جدًا.', 'INVALID_NOTE');
    }
    const note = typeof rawNote === 'string' ? rawNote.trim() : '';

    const review = await db.prepare("SELECT id FROM product_reviews WHERE id = ? AND status = 'PUBLISHED' LIMIT 1").get<{ id: string }>(reviewId);
    if (!review) return jsonError(res, 404, 'التقييم غير موجود.', 'REVIEW_NOT_FOUND');

    const reporterId = req.auth!.user.id;
    const existing = await db.prepare('SELECT id FROM review_reports WHERE review_id = ? AND reporter_user_id = ? LIMIT 1').get<{ id: string }>(reviewId, reporterId);
    if (existing) return res.json({ reported: true, replayed: true });
    try {
      await db.prepare('INSERT INTO review_reports(id, review_id, reporter_user_id, reason, note, status, created_at) VALUES(?, ?, ?, ?, ?, ?, ?)')
        .run(`rrp_${randomUUID()}`, reviewId, reporterId, reason, note, 'OPEN', now());
    } catch (error) {
      if (!String((error as Error)?.message || '').toUpperCase().includes('UNIQUE')) throw error;
      return res.json({ reported: true, replayed: true });
    }
    res.status(201).json({ reported: true });
  });

  /**
   * Request deletion of the caller's own account. Only the session's user can be the target: a
   * different `userId` in the body is refused. The password is re-checked on every request, so a
   * stolen or long-lived session cannot queue the request by itself.
   */
  router.post('/account/deletion-request', async (req: AuthenticatedRequest, res) => {
    const caller = req.auth!.user;
    const claimed = req.body?.userId;
    if (claimed !== undefined && claimed !== caller.id) return jsonError(res, 403, 'لا يمكنك طلب حذف حساب غيرك.', 'FORBIDDEN');
    if (caller.role === 'ADMIN' || caller.role === 'SUPER_ADMIN') {
      return jsonError(res, 409, 'حسابات الإدارة تُدار عبر المالك ولا تُحذف من هذه الشاشة.', 'STAFF_ACCOUNT');
    }
    const password = typeof req.body?.password === 'string' && req.body.password.length <= PASSWORD_MAX_LENGTH ? req.body.password : '';
    if (!password) return jsonError(res, 401, 'أعد إدخال كلمة المرور لتأكيد هويتك.', 'REAUTH_REQUIRED');

    const row = await db.prepare('SELECT password_hash, password_salt FROM users WHERE id = ? LIMIT 1').get<{ password_hash: string; password_salt: string }>(caller.id);
    if (!row || !(await verifyPassword(password, row.password_salt, row.password_hash))) {
      return jsonError(res, 401, 'كلمة المرور غير صحيحة.', 'INVALID_CREDENTIALS');
    }

    const requestedAt = now();
    let requestId = '';
    await withTransaction(db, async tx => {
      const pending = await tx.prepare("SELECT id FROM account_deletion_requests WHERE user_id = ? AND status = 'PENDING' LIMIT 1").get<{ id: string }>(caller.id);
      requestId = pending?.id || `adr_${randomUUID()}`;
      if (!pending) {
        await tx.prepare("INSERT INTO account_deletion_requests(id, user_id, requested_at, status) VALUES(?, ?, ?, 'PENDING')").run(requestId, caller.id, requestedAt);
      }
      await tx.prepare("UPDATE users SET status = 'SUSPENDED', updated_at = ? WHERE id = ?").run(requestedAt, caller.id);
      await tx.prepare('DELETE FROM sessions WHERE user_id = ?').run(caller.id);
    });
    await audit(db, req, 'ACCOUNT_DELETION_REQUESTED', 'USER', caller.id, caller.status, 'SUSPENDED');
    void syncRoleClaim(caller.id, caller.role, 'SUSPENDED');
    clearSessionCookies(res, authConfig);
    res.status(201).json({ request: { id: requestId, status: 'PENDING' }, message: DELETION_NOTICE_AR, messageEn: DELETION_NOTICE_EN });
  });

  /** Admin queues: open review reports and pending deletion requests. Read-only. */
  router.get('/admin/queues', requireRoles('ADMIN', 'SUPER_ADMIN'), async (_req: AuthenticatedRequest, res) => {
    const reports = await db.prepare(
      `SELECT r.id, r.review_id, r.reason, r.note, r.created_at, p.comment, p.status AS review_status, p.taste_rating
       FROM review_reports r JOIN product_reviews p ON p.id = r.review_id
       WHERE r.status = 'OPEN' ORDER BY r.created_at ASC, r.id ASC LIMIT ?`
    ).all<Record<string, unknown>>(QUEUE_LIMIT);
    const deletions = await db.prepare(
      `SELECT d.id, d.user_id, d.requested_at, u.name, u.email, u.role
       FROM account_deletion_requests d JOIN users u ON u.id = d.user_id
       WHERE d.status = 'PENDING' ORDER BY d.requested_at ASC, d.id ASC LIMIT ?`
    ).all<Record<string, unknown>>(QUEUE_LIMIT);
    res.set('Cache-Control', 'no-store');
    res.json({
      reviewReports: reports.map(r => ({
        id: r.id, reviewId: r.review_id, reason: r.reason, note: r.note, createdAt: r.created_at,
        reviewComment: r.comment, reviewStatus: r.review_status, tasteRating: Number(r.taste_rating)
      })),
      deletionRequests: deletions.map(d => ({
        id: d.id, userId: d.user_id, requestedAt: d.requested_at, name: d.name, email: d.email, role: d.role
      }))
    });
  });

  /** Decide a report: HIDE removes the review from the public list (and closes every open report on it). */
  router.post('/admin/review-reports/:id/resolve', requireRoles('ADMIN', 'SUPER_ADMIN'), async (req: AuthenticatedRequest, res) => {
    const reportId = text(req.params.id, 3, 120);
    const decision = text(req.body?.decision, 4, 10);
    if (!reportId) return jsonError(res, 400, 'معرّف البلاغ غير صالح.', 'INVALID_REPORT');
    if (decision !== 'HIDE' && decision !== 'DISMISS') return jsonError(res, 400, 'القرار غير صالح.', 'INVALID_DECISION');
    const report = await db.prepare("SELECT id, review_id FROM review_reports WHERE id = ? AND status = 'OPEN' LIMIT 1").get<{ id: string; review_id: string }>(reportId);
    if (!report) return jsonError(res, 404, 'البلاغ غير موجود أو أُغلق.', 'REPORT_NOT_FOUND');
    const at = now();
    await withTransaction(db, async tx => {
      if (decision === 'HIDE') {
        await tx.prepare("UPDATE product_reviews SET status = 'HIDDEN', updated_at = ? WHERE id = ?").run(at, report.review_id);
        await tx.prepare("UPDATE review_reports SET status = 'ACTIONED' WHERE review_id = ? AND status = 'OPEN'").run(report.review_id);
      } else {
        await tx.prepare("UPDATE review_reports SET status = 'DISMISSED' WHERE id = ?").run(report.id);
      }
    });
    await audit(db, req, decision === 'HIDE' ? 'REVIEW_HIDDEN' : 'REVIEW_REPORT_DISMISSED', 'REVIEW', report.review_id, 'PUBLISHED', decision === 'HIDE' ? 'HIDDEN' : 'PUBLISHED');
    res.json({ resolved: true, decision });
  });

  return router;
}
