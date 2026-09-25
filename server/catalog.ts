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

    const where = ["status = 'LIVE'"];
    const params: unknown[] = [];
    if (category) {
      where.push('category = ?');
      params.push(category);
    }
    if (cursor) {
      where.push('(created_at < ? OR (created_at = ? AND id < ?))');
      params.push(cursor.createdAt, cursor.createdAt, cursor.id);
    }
    params.push(limit + 1);

    // Build only the predicates that are present. PostgreSQL cannot infer the type of an
    // untyped NULL used as `$n IS NULL`, which made the first catalog page return HTTP 500.
    const rows = await db.prepare(`
      SELECT id, public_id, category, price_fils, inventory_units, created_at
      FROM catalog_records
      WHERE ${where.join(' AND ')}
      ORDER BY created_at DESC, id DESC
      LIMIT ?
    `).all(...params) as Array<{ id: number | string; public_id: string; category: string; price_fils: number | string; inventory_units: number | string; created_at: string }>;
    const hasMore = rows.length > limit;
    const items = rows.slice(0, limit).map(row => ({
      publicId: row.public_id,
      category: row.category,
      priceKwd: (Number(row.price_fils) / 1000).toFixed(3),
      inventoryUnits: Number(row.inventory_units),
      createdAt: row.created_at
    }));
    const last = rows[Math.min(rows.length, limit) - 1];
    return res.json({
      items,
      pageSize: items.length,
      nextCursor: hasMore && last ? encodeCatalogCursor({ createdAt: last.created_at, id: Number(last.id) }, authConfig.sessionSecret) : null
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
