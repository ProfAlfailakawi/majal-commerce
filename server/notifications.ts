import { randomUUID } from 'node:crypto';
import { Response, Router } from 'express';
import { AuthConfig, AuthenticatedRequest, requireAuth, requireCsrf } from './auth';
import { MajalDatabase, withTransaction } from './database';
import { createHash } from 'node:crypto';
import { deleteEncryptedObject, putEncryptedJson } from './secure-storage';

export type NotificationPriority = 'URGENT' | 'NOW' | 'SOON' | 'WATCH';

export interface CreateNotificationInput {
  userId: string;
  category: string;
  priority: NotificationPriority;
  title: string;
  body: string;
  actionLabel?: string;
  actionSurface?: string;
  entityType?: string;
  entityId?: string;
  dedupeKey?: string;
  expiresAt?: string;
}

const textValue = (value: unknown, min: number, max: number) => {
  if (typeof value !== 'string') return undefined;
  const clean = value.trim();
  return clean.length >= min && clean.length <= max ? clean : undefined;
};

const jsonError = (res: Response, status: number, message: string, code?: string) =>
  res.status(status).json({ error: message, ...(code ? { code } : {}) });

function parseCursor(value: unknown) {
  if (typeof value !== 'string' || value.length > 300) return undefined;
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as { at?: string; id?: string };
    if (!parsed.at || !parsed.id || Number.isNaN(new Date(parsed.at).getTime())) return undefined;
    return { at: parsed.at, id: parsed.id };
  } catch {
    return undefined;
  }
}

function makeCursor(row: { last_occurred_at: string; id: string }) {
  return Buffer.from(JSON.stringify({ at: row.last_occurred_at, id: row.id })).toString('base64url');
}

function deliveryTime(now: Date, quietStart: string | null, quietEnd: string | null, timezone: string) {
  if (!quietStart || !quietEnd || timezone !== 'Asia/Kuwait') return now.toISOString();
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(now);
  const hour = Number(parts.find(part => part.type === 'hour')?.value || 0);
  const minute = Number(parts.find(part => part.type === 'minute')?.value || 0);
  const currentMinutes = hour * 60 + minute;
  const [startHour, startMinute] = quietStart.split(':').map(Number);
  const [endHour, endMinute] = quietEnd.split(':').map(Number);
  const start = startHour * 60 + startMinute;
  const end = endHour * 60 + endMinute;
  const isQuiet = start <= end ? currentMinutes >= start && currentMinutes < end : currentMinutes >= start || currentMinutes < end;
  if (!isQuiet) return now.toISOString();
  const waitMinutes = (end - currentMinutes + 24 * 60) % (24 * 60);
  return new Date(now.getTime() + waitMinutes * 60_000).toISOString();
}

export async function createOrCoalesceNotification(db: MajalDatabase, input: CreateNotificationInput) {
  const now = new Date().toISOString();
  const dedupeKey = input.dedupeKey?.trim() || null;
  return withTransaction(db, async tx => {
    if (dedupeKey) {
      const existing = await tx.prepare(`
        SELECT id FROM notification_inbox WHERE user_id = ? AND dedupe_key = ? LIMIT 1
      `).get(input.userId, dedupeKey) as { id: string } | undefined;
      if (existing) {
        await tx.prepare(`
          UPDATE notification_inbox
          SET priority = ?, title = ?, body = ?, action_label = ?, action_surface = ?,
              occurrence_count = occurrence_count + 1, status = 'UNREAD', read_at = NULL,
              last_occurred_at = ?, expires_at = ?
          WHERE id = ?
        `).run(
          input.priority,
          input.title,
          input.body,
          input.actionLabel ?? null,
          input.actionSurface ?? null,
          now,
          input.expiresAt ?? null,
          existing.id
        );
        return { id: existing.id, coalesced: true };
      }
    }

    const id = `ntf_${randomUUID()}`;
    await tx.prepare(`
      INSERT INTO notification_inbox(
        id, user_id, category, priority, title, body, action_label, action_surface,
        entity_type, entity_id, dedupe_key, first_occurred_at, last_occurred_at, expires_at
      ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      input.userId,
      input.category,
      input.priority,
      input.title,
      input.body,
      input.actionLabel ?? null,
      input.actionSurface ?? null,
      input.entityType ?? null,
      input.entityId ?? null,
      dedupeKey,
      now,
      now,
      input.expiresAt ?? null
    );

    const preferences = await tx.prepare(`
      SELECT email_enabled, push_enabled, quiet_hours_start, quiet_hours_end, timezone
      FROM notification_preferences WHERE user_id = ?
    `).get(input.userId) as
      | { email_enabled: number; push_enabled: number; quiet_hours_start: string | null; quiet_hours_end: string | null; timezone: string }
      | undefined;
    if (preferences) {
      const availableAt = deliveryTime(new Date(), preferences.quiet_hours_start, preferences.quiet_hours_end, preferences.timezone);
      const insertOutbox = tx.prepare(`
        INSERT INTO notification_outbox(notification_id, channel, available_at, created_at)
        VALUES(?, ?, ?, ?) ON CONFLICT(notification_id, channel) DO NOTHING
      `);
      if (preferences.email_enabled) await insertOutbox.run(id, 'EMAIL', availableAt, now);
      if (preferences.push_enabled) await insertOutbox.run(id, 'PUSH', availableAt, now);
    }
    return { id, coalesced: false };
  });
}

export function createNotificationRouter(db: MajalDatabase, authConfig: AuthConfig) {
  const router = Router();
  const authenticated = requireAuth(db, authConfig);
  const csrfProtected = requireCsrf(authConfig);

  router.use(authenticated);

  router.get('/', async (req: AuthenticatedRequest, res) => {
    if (!req.auth) return jsonError(res, 401, 'يلزم تسجيل الدخول.');
    const requestedLimit = Number(req.query.limit || 20);
    const limit = Number.isInteger(requestedLimit) ? Math.min(50, Math.max(1, requestedLimit)) : 20;
    const cursor = parseCursor(req.query.cursor);
    const rows = await db.prepare(`
      SELECT id, category, priority, title, body, action_label, action_surface,
             entity_type, entity_id, occurrence_count, status, first_occurred_at,
             last_occurred_at, read_at, expires_at
      FROM notification_inbox
      WHERE user_id = ?
        AND status != 'ARCHIVED'
        AND (expires_at IS NULL OR expires_at > ?)
        AND (? IS NULL OR last_occurred_at < ? OR (last_occurred_at = ? AND id < ?))
      ORDER BY
        CASE priority WHEN 'URGENT' THEN 0 WHEN 'NOW' THEN 1 WHEN 'SOON' THEN 2 ELSE 3 END,
        last_occurred_at DESC,
        id DESC
      LIMIT ?
    `).all(
      req.auth.user.id,
      new Date().toISOString(),
      cursor?.at ?? null,
      cursor?.at ?? null,
      cursor?.at ?? null,
      cursor?.id ?? null,
      limit + 1
    ) as Array<Record<string, unknown> & { id: string; last_occurred_at: string }>;
    const hasMore = rows.length > limit;
    const items = rows.slice(0, limit);
    const unread = await db.prepare(`
      SELECT count(*) AS count FROM notification_inbox
      WHERE user_id = ? AND status = 'UNREAD' AND (expires_at IS NULL OR expires_at > ?)
    `).get(req.auth.user.id, new Date().toISOString()) as { count: number };
    return res.json({ items, unreadCount: Number(unread.count), nextCursor: hasMore ? makeCursor(items[items.length - 1]) : null });
  });

  router.post('/:id/read', csrfProtected, async (req: AuthenticatedRequest, res) => {
    if (!req.auth) return jsonError(res, 401, 'يلزم تسجيل الدخول.');
    const id = textValue(req.params.id, 8, 100);
    if (!id) return jsonError(res, 400, 'رقم التنبيه غير صالح.');
    const result = await db.prepare(`
      UPDATE notification_inbox SET status = 'READ', read_at = ?
      WHERE id = ? AND user_id = ? AND status = 'UNREAD'
    `).run(new Date().toISOString(), id, req.auth.user.id);
    return res.json({ updated: result.changes === 1 });
  });

  router.post('/read-all', csrfProtected, async (req: AuthenticatedRequest, res) => {
    if (!req.auth) return jsonError(res, 401, 'يلزم تسجيل الدخول.');
    const now = new Date().toISOString();
    const result = await db.prepare(`
      UPDATE notification_inbox SET status = 'READ', read_at = ?
      WHERE user_id = ? AND status = 'UNREAD'
    `).run(now, req.auth.user.id);
    return res.json({ updated: result.changes });
  });

  router.post('/push-subscriptions', csrfProtected, async (req: AuthenticatedRequest, res) => {
    if (!req.auth) return jsonError(res, 401, 'يلزم تسجيل الدخول.');
    const token = textValue(req.body?.token, 20, 4096);
    const platform = ['WEB', 'IOS', 'ANDROID'].includes(req.body?.platform) ? req.body.platform : undefined;
    if (!token || !platform) return jsonError(res, 400, 'بيانات Push غير صالحة.');
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const existing = await db.prepare('SELECT id, token_object_key FROM push_subscriptions WHERE token_sha256 = ?').get<{ id: string; token_object_key: string }>(tokenHash);
    const id = existing?.id || `push_${randomUUID()}`;
    const receipt = await putEncryptedJson('push-tokens', id, { token });
    const changed = new Date().toISOString();
    await db.prepare(`
      INSERT INTO push_subscriptions(id,user_id,token_sha256,token_object_key,platform,active,created_at,updated_at)
      VALUES(?,?,?,?,?,1,?,?)
      ON CONFLICT(token_sha256) DO UPDATE SET user_id=excluded.user_id,token_object_key=excluded.token_object_key,platform=excluded.platform,active=1,updated_at=excluded.updated_at
    `).run(id, req.auth.user.id, tokenHash, receipt.objectKey, platform, changed, changed);
    if (existing?.token_object_key && existing.token_object_key !== receipt.objectKey) await deleteEncryptedObject(existing.token_object_key);
    return res.status(existing ? 200 : 201).json({ id, platform, active: true });
  });

  router.delete('/push-subscriptions/:id', csrfProtected, async (req: AuthenticatedRequest, res) => {
    if (!req.auth) return jsonError(res, 401, 'يلزم تسجيل الدخول.');
    const row = await db.prepare('SELECT id, token_object_key FROM push_subscriptions WHERE id = ? AND user_id = ?').get<{ id: string; token_object_key: string }>(req.params.id, req.auth.user.id);
    if (!row) return res.status(204).end();
    await deleteEncryptedObject(row.token_object_key);
    await db.prepare('DELETE FROM push_subscriptions WHERE id = ? AND user_id = ?').run(row.id, req.auth.user.id);
    return res.status(204).end();
  });

  router.get('/preferences/current', async (req: AuthenticatedRequest, res) => {
    if (!req.auth) return jsonError(res, 401, 'يلزم تسجيل الدخول.');
    const row = await db.prepare('SELECT * FROM notification_preferences WHERE user_id = ?').get(req.auth.user.id);
    return res.json(row || {
      user_id: req.auth.user.id,
      in_app_enabled: 1,
      email_enabled: 0,
      push_enabled: 0,
      quiet_hours_start: null,
      quiet_hours_end: null,
      timezone: 'Asia/Kuwait',
      digest_mode: 'SMART'
    });
  });

  router.put('/preferences/current', csrfProtected, async (req: AuthenticatedRequest, res) => {
    if (!req.auth) return jsonError(res, 401, 'يلزم تسجيل الدخول.');
    const digestMode = ['IMMEDIATE', 'SMART', 'DAILY'].includes(req.body?.digestMode) ? req.body.digestMode : undefined;
    const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;
    const quietStart = req.body?.quietHoursStart == null ? null : textValue(req.body.quietHoursStart, 5, 5);
    const quietEnd = req.body?.quietHoursEnd == null ? null : textValue(req.body.quietHoursEnd, 5, 5);
    if (!digestMode || (quietStart && !timePattern.test(quietStart)) || (quietEnd && !timePattern.test(quietEnd)) || Boolean(quietStart) !== Boolean(quietEnd)) {
      return jsonError(res, 400, 'إعدادات الإشعارات غير صالحة.');
    }
    const now = new Date().toISOString();
    await db.prepare(`
      INSERT INTO notification_preferences(
        user_id, in_app_enabled, email_enabled, push_enabled,
        quiet_hours_start, quiet_hours_end, timezone, digest_mode, updated_at
      ) VALUES(?, ?, ?, ?, ?, ?, 'Asia/Kuwait', ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        in_app_enabled = excluded.in_app_enabled,
        email_enabled = excluded.email_enabled,
        push_enabled = excluded.push_enabled,
        quiet_hours_start = excluded.quiet_hours_start,
        quiet_hours_end = excluded.quiet_hours_end,
        digest_mode = excluded.digest_mode,
        updated_at = excluded.updated_at
    `).run(
      req.auth.user.id,
      req.body?.inAppEnabled === false ? 0 : 1,
      req.body?.emailEnabled === true ? 1 : 0,
      req.body?.pushEnabled === true ? 1 : 0,
      quietStart,
      quietEnd,
      digestMode,
      now
    );
    return res.json({ updated: true });
  });

  return router;
}
