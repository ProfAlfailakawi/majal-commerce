import { createHmac, timingSafeEqual } from 'node:crypto';
import { Response, Router } from 'express';
import { AuthConfig, AuthenticatedRequest, requireAuth, requireRoles } from './auth';
import { MajalDatabase } from './database';

interface CatalogCursor {
  createdAt: string;
  id: number;
}

const jsonError = (res: Response, status: number, message: string, code?: string) =>
  res.status(status).json({ error: message, ...(code ? { code } : {}) });

function signature(payload: string, secret: string) {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

function safeEqual(actual: string, expected: string) {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

export function encodeCatalogCursor(cursor: CatalogCursor, secret: string) {
  const payload = Buffer.from(JSON.stringify(cursor)).toString('base64url');
  return `${payload}.${signature(payload, secret)}`;
}

export function decodeCatalogCursor(value: unknown, secret: string) {
  if (typeof value !== 'string' || value.length > 400) return undefined;
  const [payload, suppliedSignature] = value.split('.');
  if (!payload || !suppliedSignature || !safeEqual(signature(payload, secret), suppliedSignature)) return undefined;
  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Partial<CatalogCursor>;
    if (!Number.isSafeInteger(parsed.id) || Number(parsed.id) <= 0 || !parsed.createdAt || Number.isNaN(new Date(parsed.createdAt).getTime())) return undefined;
    return { id: Number(parsed.id), createdAt: parsed.createdAt };
  } catch {
    return undefined;
  }
}

export function createCatalogRouter(db: MajalDatabase, authConfig: AuthConfig) {
  const router = Router();

  router.get('/', async (req, res) => {
    const requestedLimit = Number(req.query.limit || 24);
    const limit = Number.isInteger(requestedLimit) ? Math.max(1, Math.min(50, requestedLimit)) : 24;
    const category = typeof req.query.category === 'string' && /^[\p{L}\p{N} _-]{2,80}$/u.test(req.query.category)
      ? req.query.category
      : undefined;
    const cursor = req.query.cursor ? decodeCatalogCursor(req.query.cursor, authConfig.sessionSecret) : undefined;
    if (req.query.cursor && !cursor) return jsonError(res, 400, 'مؤشر الصفحة غير صالح.', 'INVALID_CURSOR');

    const rows = await db.prepare(`
      SELECT id, public_id, category, price_fils, inventory_units, created_at
      FROM catalog_records
      WHERE status = 'LIVE'
        AND (? IS NULL OR category = ?)
        AND (? IS NULL OR created_at < ? OR (created_at = ? AND id < ?))
      ORDER BY created_at DESC, id DESC
      LIMIT ?
    `).all(
      category ?? null,
      category ?? null,
      cursor?.createdAt ?? null,
      cursor?.createdAt ?? null,
      cursor?.createdAt ?? null,
      cursor?.id ?? null,
      limit + 1
    ) as Array<{ id: number; public_id: string; category: string; price_fils: number; inventory_units: number; created_at: string }>;
    const hasMore = rows.length > limit;
    const items = rows.slice(0, limit).map(row => ({
      publicId: row.public_id,
      category: row.category,
      priceKwd: (row.price_fils / 1000).toFixed(3),
      inventoryUnits: row.inventory_units,
      createdAt: row.created_at
    }));
    const last = rows[Math.min(rows.length, limit) - 1];
    return res.json({
      items,
      pageSize: items.length,
      nextCursor: hasMore && last ? encodeCatalogCursor({ createdAt: last.created_at, id: last.id }, authConfig.sessionSecret) : null
    });
  });

  router.get(
    '/admin/scale-summary',
    requireAuth(db, authConfig),
    requireRoles('ADMIN', 'SUPER_ADMIN'),
    async (req: AuthenticatedRequest, res) => {
      if (!req.auth) return jsonError(res, 401, 'يلزم تسجيل الدخول.');
      const catalog = await db.prepare(`
        SELECT count(*) AS total,
               sum(CASE WHEN status = 'LIVE' THEN 1 ELSE 0 END) AS live,
               count(DISTINCT tenant_id) AS tenants
        FROM catalog_records
      `).get();
      const events = await db.prepare('SELECT count(*) AS total FROM order_events').get();
      const payments = await db.prepare('SELECT count(*) AS total FROM payment_intents').get();
      return res.json({ catalog, events, payments, pagination: 'SIGNED_CURSOR', maxPageSize: 50 });
    }
  );

  return router;
}
