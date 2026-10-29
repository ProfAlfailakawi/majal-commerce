import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { Response, Router } from 'express';
import { rateLimit as expressRateLimit } from 'express-rate-limit';
import { AuthConfig, AuthenticatedRequest, AuthRole, createUser, normalizeEmail, requireAuth, requireCsrf, validatePassword } from './auth';
import { MajalDatabase, withTransaction } from './database';
import { SURFACE, notify, orgMemberIds } from './notify';

/*
 * Facility team self-service. The HOST_OWNER invites colleagues by a private one-time link,
 * picks their role, and can later change it, suspend or remove them. Nothing here can create
 * another owner, touch another organization, or edit an administrator.
 */

export const TEAM_ROLES = ['HOST_OPERATIONS', 'HOST_CHEF', 'HOST_FINANCE', 'HOST_MARKETING', 'HOST_SUPPORT'] as const;
type TeamRole = (typeof TEAM_ROLES)[number];
const MAX_MEMBERS = 25;
const INVITE_DAYS = 7;

const now = () => new Date().toISOString();
const sha = (value: string) => createHash('sha256').update(value).digest('hex');
const text = (value: unknown, min: number, max: number) => {
  if (typeof value !== 'string') return undefined;
  const cleaned = value.trim();
  return cleaned.length >= min && cleaned.length <= max ? cleaned : undefined;
};
const jsonError = (res: Response, status: number, message: string, code: string) => res.status(status).json({ error: message, code });
const teamRole = (value: unknown): TeamRole | undefined => (typeof value === 'string' && (TEAM_ROLES as readonly string[]).includes(value) ? (value as TeamRole) : undefined);

type MemberRow = { user_id: string; name: string; email: string; role: string; status: string; created_at: string };
type InviteRow = { id: string; organization_id: string; email: string; role: string; expires_at: string; accepted_at: string | null; revoked_at: string | null; created_at: string };

const limit = (max: number, windowMs: number, scope: string) => expressRateLimit({
  windowMs, limit: max, standardHeaders: 'draft-6', legacyHeaders: false, keyGenerator: req => `${req.ip}:team-${scope}`,
  validate: { trustProxy: false, xForwardedForHeader: false },
  handler: (_req, res) => { res.status(429).json({ error: 'تم تجاوز الحد المؤقت للطلبات. حاول لاحقًا.' }); }, passOnStoreError: true
});

async function audit(db: MajalDatabase, req: AuthenticatedRequest, action: string, entityId: string, organizationId: string, after: unknown) {
  const auth = req.auth!;
  await db.prepare(`INSERT INTO domain_audit_events(actor_user_id,actor_role,organization_id,action,entity_type,entity_id,before_sha256,after_sha256,request_id,session_hash,created_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?)`).run(auth.user.id, auth.user.role, organizationId, action, 'TEAM_MEMBER', entityId, null, sha(JSON.stringify(after)), randomUUID(), sha(auth.tokenHash), now());
}

export function createTeamRouter(db: MajalDatabase, authConfig: AuthConfig) {
  const router = Router();

  /* ───────── public: the invitee ───────── */
  const invitePreview = async (token: string) => {
    const row = await db.prepare(`SELECT oi.*, o.commercial_name FROM organization_invites oi JOIN organizations o ON o.id = oi.organization_id WHERE oi.token_hash = ? LIMIT 1`)
      .get<InviteRow & { commercial_name: string }>(sha(token));
    if (!row || row.accepted_at || row.revoked_at || row.expires_at < now()) return undefined;
    return row;
  };

  router.get('/invites/:token', limit(30, 60_000, 'preview'), async (req, res) => {
    const token = text(req.params.token, 20, 200);
    const row = token ? await invitePreview(token) : undefined;
    if (!row) return jsonError(res, 404, 'الدعوة غير صالحة أو انتهت.', 'INVITE_INVALID');
    res.json({ organizationName: row.commercial_name, role: row.role, email: row.email });
  });

  router.post('/invites/accept', limit(10, 60 * 60_000, 'accept'), async (req, res) => {
    const token = text(req.body?.token, 20, 200), name = text(req.body?.name, 2, 120), password = req.body?.password;
    const row = token ? await invitePreview(token) : undefined;
    if (!row) return jsonError(res, 404, 'الدعوة غير صالحة أو انتهت.', 'INVITE_INVALID');
    if (!name) return jsonError(res, 400, 'أدخل اسمك.', 'NAME_REQUIRED');
    const passwordError = validatePassword(password);
    if (passwordError) return jsonError(res, 400, passwordError, 'WEAK_PASSWORD');
    if (await db.prepare('SELECT 1 AS x FROM users WHERE email = ? LIMIT 1').get(row.email)) return jsonError(res, 409, 'يوجد حساب بهذا البريد. سجّل الدخول به واطلب من المالك دعوة بريد آخر.', 'EMAIL_EXISTS');
    try {
      await withTransaction(db, async tx => {
        // Consume first: the conditional update makes a double-click or replay lose the race.
        const used = await tx.prepare('UPDATE organization_invites SET accepted_at = ? WHERE id = ? AND accepted_at IS NULL AND revoked_at IS NULL').run(now(), row.id);
        if (used.changes === 0) throw new Error('INVITE_USED');
        const user = await createUser(tx, { name, email: row.email, phone: text(req.body?.phone, 7, 24) ?? '', password: password as string, role: row.role as AuthRole, hostBusinessId: row.organization_id });
        await tx.prepare('INSERT INTO organization_memberships(organization_id, user_id, role, status, created_at) VALUES(?,?,?,?,?)').run(row.organization_id, user.id, row.role, 'ACTIVE', now());
      });
    } catch (error) {
      if (error instanceof Error && error.message === 'INVITE_USED') return jsonError(res, 409, 'استُخدمت هذه الدعوة.', 'INVITE_USED');
      // createUser rejects a malformed phone with a user-facing message; that is a 400, not a 500.
      if (error instanceof Error && error.message.startsWith('رقم الهاتف غير صالح')) return jsonError(res, 400, error.message, 'INVALID_PHONE');
      throw error;
    }
    await notify(db, await orgMemberIds(db, row.organization_id, ['HOST_OWNER']), { category: 'TEAM', priority: 'SOON', title: 'انضم عضو جديد لفريقك', body: `${name} قبل الدعوة وفُعّل حسابه.`, actionLabel: 'افتح الفريق', actionSurface: SURFACE.host, entityType: 'ORGANIZATION', entityId: row.organization_id, dedupeKey: `team-joined:${row.id}` });
    res.status(201).json({ message: 'تم تفعيل حسابك. سجّل الدخول بالبريد وكلمة المرور.' });
  });

  /* ───────── owner ───────── */
  const authenticated = requireAuth(db, authConfig);
  const csrfProtected = requireCsrf(authConfig);
  const owner = async (req: AuthenticatedRequest, res: Response) => {
    const orgId = req.auth?.user.hostBusinessId;
    if (req.auth?.user.role !== 'HOST_OWNER' || !orgId) { jsonError(res, 403, 'إدارة الفريق لمالك المنشأة فقط.', 'OWNER_REQUIRED'); return undefined; }
    return orgId;
  };

  router.get('/', authenticated, async (req: AuthenticatedRequest, res) => {
    const orgId = await owner(req, res); if (!orgId) return;
    const members = await db.prepare(`SELECT om.user_id, u.name, u.email, om.role, om.status, om.created_at FROM organization_memberships om JOIN users u ON u.id = om.user_id
      WHERE om.organization_id = ? ORDER BY CASE om.role WHEN 'HOST_OWNER' THEN 0 ELSE 1 END, om.created_at ASC LIMIT 100`).all<MemberRow>(orgId);
    const invites = await db.prepare('SELECT * FROM organization_invites WHERE organization_id = ? AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at > ? ORDER BY created_at DESC LIMIT 50').all<InviteRow>(orgId, now());
    res.json({
      members: members.map(m => ({ userId: m.user_id, name: m.name, email: m.email, role: m.role, status: m.status, self: m.user_id === req.auth!.user.id })),
      invites: invites.map(i => ({ id: i.id, email: i.email, role: i.role, expiresAt: i.expires_at })),
      roles: TEAM_ROLES
    });
  });

  router.post('/invites', authenticated, csrfProtected, async (req: AuthenticatedRequest, res) => {
    const orgId = await owner(req, res); if (!orgId) return;
    const email = normalizeEmail(req.body?.email), role = teamRole(req.body?.role);
    if (!email || !role) return jsonError(res, 400, 'أدخل بريدًا صحيحًا واختر دورًا من أدوار الفريق.', 'INVALID_INVITE');
    const taken = await db.prepare('SELECT 1 AS x FROM users WHERE email = ? LIMIT 1').get(email);
    if (taken) return jsonError(res, 409, 'هذا البريد مسجّل مسبقًا في مجال.', 'EMAIL_EXISTS');
    const counts = await db.prepare(`SELECT (SELECT COUNT(*) FROM organization_memberships WHERE organization_id = ?) AS m,
      (SELECT COUNT(*) FROM organization_invites WHERE organization_id = ? AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at > ?) AS i`).get<{ m: number | string; i: number | string }>(orgId, orgId, now());
    if (Number(counts?.m ?? 0) + Number(counts?.i ?? 0) >= MAX_MEMBERS) return jsonError(res, 409, 'بلغ الفريق الحد الأقصى.', 'TEAM_FULL');
    await db.prepare('UPDATE organization_invites SET revoked_at = ? WHERE organization_id = ? AND email = ? AND accepted_at IS NULL AND revoked_at IS NULL').run(now(), orgId, email);
    const token = randomBytes(24).toString('hex'), id = `inv_${randomUUID()}`, created = now();
    const expires = new Date(Date.now() + INVITE_DAYS * 86_400_000).toISOString();
    await db.prepare('INSERT INTO organization_invites(id, organization_id, email, role, token_hash, invited_by_user_id, expires_at, created_at) VALUES(?,?,?,?,?,?,?,?)')
      .run(id, orgId, email, role, sha(token), req.auth!.user.id, expires, created);
    await audit(db, req, 'TEAM_INVITED', id, orgId, { email, role });
    // Shown once; only the hash is stored.
    res.status(201).json({ invite: { id, email, role, expiresAt: expires }, link: `/?invite=${token}` });
  });

  router.post('/invites/:id/revoke', authenticated, csrfProtected, async (req: AuthenticatedRequest, res) => {
    const orgId = await owner(req, res); if (!orgId) return;
    await db.prepare('UPDATE organization_invites SET revoked_at = ? WHERE id = ? AND organization_id = ? AND accepted_at IS NULL').run(now(), req.params.id, orgId);
    await audit(db, req, 'TEAM_INVITE_REVOKED', req.params.id, orgId, {});
    res.json({ ok: true });
  });

  /** Role change, suspend/reactivate. Sessions are revoked so the change applies immediately. */
  router.post('/members/:userId', authenticated, csrfProtected, async (req: AuthenticatedRequest, res) => {
    const orgId = await owner(req, res); if (!orgId) return;
    if (req.params.userId === req.auth!.user.id) return jsonError(res, 409, 'لا يمكنك تعديل حسابك.', 'SELF_EDIT');
    const target = await db.prepare('SELECT om.role, om.status, u.status AS user_status FROM organization_memberships om JOIN users u ON u.id = om.user_id WHERE om.organization_id = ? AND om.user_id = ?').get<{ role: string; status: string; user_status: string }>(orgId, req.params.userId);
    if (!target) return jsonError(res, 404, 'العضو غير موجود في منشأتك.', 'NOT_FOUND');
    if (target.role === 'HOST_OWNER') return jsonError(res, 409, 'لا يمكن تعديل المالك.', 'OWNER_IMMUTABLE');
    const role = req.body?.role === undefined ? target.role as TeamRole : teamRole(req.body.role);
    const status = req.body?.status === undefined ? target.status : (['ACTIVE', 'SUSPENDED'].includes(req.body.status) ? req.body.status as string : undefined);
    if (!role || !status) return jsonError(res, 400, 'دور أو حالة غير صالحة.', 'INVALID_CHANGE');
    // A platform suspension (moderation sets users.status, not the membership) is not the owner's to
    // lift: a role change or "reactivate" here used to copy the membership's ACTIVE onto the account.
    const accountStatus = target.user_status === 'SUSPENDED' && target.status !== 'SUSPENDED' ? 'SUSPENDED' : status;
    await withTransaction(db, async tx => {
      await tx.prepare('UPDATE organization_memberships SET role = ?, status = ? WHERE organization_id = ? AND user_id = ?').run(role, status, orgId, req.params.userId);
      await tx.prepare('UPDATE users SET role = ?, status = ?, updated_at = ? WHERE id = ? AND host_business_id = ?').run(role, accountStatus, now(), req.params.userId, orgId);
      await tx.prepare('DELETE FROM sessions WHERE user_id = ?').run(req.params.userId);
      await audit(tx, req, 'TEAM_MEMBER_CHANGED', req.params.userId, orgId, { role, status });
    });
    res.json({ userId: req.params.userId, role, status });
  });

  router.post('/members/:userId/remove', authenticated, csrfProtected, async (req: AuthenticatedRequest, res) => {
    const orgId = await owner(req, res); if (!orgId) return;
    const target = await db.prepare('SELECT role FROM organization_memberships WHERE organization_id = ? AND user_id = ?').get<{ role: string }>(orgId, req.params.userId);
    if (!target) return jsonError(res, 404, 'العضو غير موجود في منشأتك.', 'NOT_FOUND');
    if (target.role === 'HOST_OWNER') return jsonError(res, 409, 'لا يمكن إزالة المالك.', 'OWNER_IMMUTABLE');
    await withTransaction(db, async tx => {
      await tx.prepare('DELETE FROM organization_memberships WHERE organization_id = ? AND user_id = ?').run(orgId, req.params.userId);
      // The account stays (history, audit) but loses the tenant and every session.
      await tx.prepare("UPDATE users SET role = 'CONSUMER', host_business_id = NULL, updated_at = ? WHERE id = ? AND host_business_id = ?").run(now(), req.params.userId, orgId);
      await tx.prepare('DELETE FROM sessions WHERE user_id = ?').run(req.params.userId);
      await audit(tx, req, 'TEAM_MEMBER_REMOVED', req.params.userId, orgId, {});
    });
    res.json({ ok: true });
  });

  return router;
}
